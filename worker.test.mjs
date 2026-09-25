import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("./sw.js", import.meta.url), "utf8");
function worker(overrides = {}) {
  const events = new Map();
  const deleted = [];
  let claims = 0;
  let skips = 0;
  const caches = {
    keys: async () => ["another-app-v1", "marcos-calc-v3.1.0", "marcos-calc-v3.3.0"],
    delete: async key => deleted.push(key),
    open: async () => ({ addAll: async () => {}, match: async () => undefined }),
  };
  const self = { addEventListener: (name,fn) => events.set(name,fn), clients: {claim:async()=>{claims++;}}, skipWaiting:()=>{skips++;},registration:{scope:"https://example.test/Machinist_calc/"} };
  runInNewContext(source, {self,caches,URL,Response,fetch:async()=>{throw new Error("offline");},...overrides});
  return {events,deleted,claims:()=>claims,skips:()=>skips};
}
test("activation removes only this app's obsolete caches", async () => {
  const w=worker(); let work;
  w.events.get("activate")({waitUntil:promise=>{work=promise;}});
  await work;
  assert.deepEqual(w.deleted,["marcos-calc-v3.1.0"]);
  assert.equal(w.claims(),1);
});
test("installation does not force an update", async () => {
  const w=worker();let work;
  w.events.get("install")({waitUntil:promise=>{work=promise;}});
  await work;
  assert.equal(w.skips(),0);
  w.events.get("message")({data:{type:"SKIP_WAITING"}});
  assert.equal(w.skips(),1);
});
test("offline navigation uses the cached application shell", async () => {
  const w=worker({caches:{open:async()=>({match:async key=>key==="./index.html"?new Response("offline shell"):undefined})}});
  let response;
  w.events.get("fetch")({request:{url:"https://example.test/Machinist_calc/",method:"GET",mode:"navigate"},respondWith:promise=>{response=promise;}});
  assert.equal(await (await response).text(),"offline shell");
});
test("worker leaves unrelated origin paths and writes alone", () => {
  const w=worker();
  for(const request of [{url:"https://example.test/other-app/file.js",method:"GET"},{url:"https://example.test/Machinist_calc/save",method:"POST"}]) {
    w.events.get("fetch")({request,respondWith:()=>assert.fail("Request outside scope was intercepted")});
  }
});
