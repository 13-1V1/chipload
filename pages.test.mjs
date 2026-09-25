import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = import.meta.dirname;
const read = (name) => readFile(resolve(root, name), "utf8");

test("GitHub Pages entry point uses repository-relative application assets", async () => {
  const html = await read("index.html");

  assert.match(html, /<script\s+type="module" src="\.\/app\.js\?v=/);
  assert.match(await read("app.js"), /from\s+"\.\/calc-core\.js\?v=/);
  assert.match(await read("pwa.js"), /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/);
  assert.match(html, /<link\s+rel="manifest"\s+href="manifest\.json"/);

  const assetReferences = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:https?:|data:|mailto:|tel:)/i.test(reference));

  assert.ok(assetReferences.length > 0);
  for (const reference of assetReferences) {
    assert.ok(!reference.startsWith("/"), `${reference} must remain relative for a project Pages URL`);
    await access(resolve(root, reference.split("?")[0]));
  }
});

test("manifest remains inside the Machinist_calc Pages scope", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const pagesBase = new URL("https://ianarsenault-tn.github.io/Machinist_calc/");

  assert.equal(manifest.id, "./");
  assert.equal(manifest.start_url, ".");
  assert.equal(manifest.scope, "./");
  assert.equal(new URL(manifest.start_url, pagesBase).pathname, "/Machinist_calc/");

  for (const icon of manifest.icons) {
    assert.ok(!icon.src.startsWith("/"));
    await access(resolve(root, icon.src));
  }
  for (const shortcut of manifest.shortcuts) {
    assert.ok(shortcut.url.startsWith("./"));
    assert.equal(new URL(shortcut.url, pagesBase).pathname, "/Machinist_calc/");
  }
});

test("service worker precache is complete and repository-relative", async () => {
  const serviceWorker = await read("sw.js");
  const precacheSource = serviceWorker.match(/const PRECACHE = (\[[^;]+\]);/)?.[1];
  assert.ok(precacheSource, "PRECACHE declaration was not found");
  const precache = JSON.parse(precacheSource);

  for (const reference of precache) {
    assert.ok(reference === "./" || reference.startsWith("./"), `${reference} must be relative`);
    if (reference !== "./") await access(resolve(root, reference.slice(2).split("?")[0]));
  }
  assert.ok(precache.includes("./index.html"));
  const html = await read("index.html");
  const modules = ["app.js", "units.js", "ui-state.js", "mobile-ui.js", "persistence.js", "pwa.js"];
  const references = [...html.matchAll(/(?:src|href)="(\.\/[^"#]+\?v=[^"]+)"/g)].map(match => match[1]);
  for (const file of modules) {
    references.push(...[...(await read(file)).matchAll(/from\s+"(\.\/[^"#]+\.js\?v=[^"]+)"/g)].map(match => match[1]));
  }
  for (const reference of references) assert.ok(precache.includes(reference), `Offline cache is missing ${reference}`);
  assert.ok(precache.includes("./manifest.json"));
  assert.ok(precache.includes("./assets/fonts/ibm-plex-sans-latin.woff2"));
  assert.ok(precache.includes("./assets/fonts/roboto-slab-700-latin.woff2"));
});

test("application and offline cache versions stay synchronized", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const core = await read("calc-core.js");
  const serviceWorker = await read("sw.js");
  const coreVersion = core.match(/CORE_VERSION = "([^"]+)"/)?.[1];
  const cacheVersion = serviceWorker.match(/APP_VERSION = "([^"]+)"/)?.[1];

  assert.equal(coreVersion, packageJson.version);
  assert.equal(cacheVersion, packageJson.version);
});

test("Pages bypasses Jekyll processing", async () => {
  await access(resolve(root, ".nojekyll"));
});
