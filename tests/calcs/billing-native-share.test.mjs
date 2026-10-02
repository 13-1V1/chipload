// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Saving a file on Android must hand the share sheet the type the tool declared. @capacitor/share has no
// type option and guesses from the extension; Android's own table (AOSP external/mime-support mime.types,
// "application/x-netcdf nc") files G-code .nc as NetCDF data. So native.js sends the declared type through
// the app's ShareFile plugin, and only falls back to @capacitor/share where that plugin isn't built in.
import { test } from "node:test";
import assert from "node:assert/strict";

// A Capacitor android runtime with fake native plugins; every native call is recorded.
const calls = [];
let shareFileMissing = false;
globalThis.window = globalThis;
globalThis.document = { documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, body: { append() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { hostname: "localhost", hash: "" };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.CapacitorCustomPlatform = { name: "android" };
const methods = (...names) => names.map((name) => ({ name, rtype: "promise" }));
globalThis.Capacitor = {
  PluginHeaders: [
    { name: "App", methods: methods("addListener", "getLaunchUrl", "exitApp") },
    { name: "Filesystem", methods: methods("writeFile") },
    { name: "Share", methods: methods("share") },
    { name: "ShareFile", methods: methods("share") },
    { name: "StatusBar", methods: methods("setStyle", "setBackgroundColor") },
    { name: "SplashScreen", methods: methods("hide") },
  ],
  async nativePromise(plugin, method, options) {
    if (plugin === "ShareFile" && shareFileMissing) throw Object.assign(new Error('"ShareFile" plugin is not implemented on android'), { code: "UNIMPLEMENTED" });
    calls.push({ plugin, method, options });
    if (plugin === "Filesystem") return { uri: `file:///data/user/0/com.brennanmeyer.chipload/cache/${options.path}` };
    return {};
  },
  addListener: () => ({ remove() {} }),
};

const { initNative } = await import("../../src/app/native.js");
initNative();

test("a G-code file goes to the share sheet as text/plain, not the extension's guess", async () => {
  calls.length = 0;
  await window.chiploadNative.saveFile("chamfer-tip.nc", "G0 X0.\n", "text/plain");
  const share = calls.find((c) => c.plugin === "ShareFile");
  assert.ok(share, JSON.stringify(calls));
  assert.equal(share.options.type, "text/plain");
  assert.match(share.options.url, /cache\/chamfer-tip\.nc$/);
  assert.equal(calls.filter((c) => c.plugin === "Share").length, 0, "one share sheet, not two");
});

test("CSV and DXF keep the type their tool declared", async () => {
  calls.length = 0;
  await window.chiploadNative.saveFile("bolt-circle-6.csv", "x,y\n", "text/csv");
  await window.chiploadNative.saveFile("bolt-circle-6.dxf", "0\nEOF\n", "application/dxf");
  assert.deepEqual(calls.filter((c) => c.plugin === "ShareFile").map((c) => c.options.type), ["text/csv", "application/dxf"]);
});

test("an APK without the ShareFile plugin still saves through @capacitor/share", async () => {
  calls.length = 0;
  shareFileMissing = true;
  try { await window.chiploadNative.saveFile("chamfer-tip.nc", "G0 X0.\n", "text/plain"); }
  finally { shareFileMissing = false; }
  const share = calls.find((c) => c.plugin === "Share");
  assert.ok(share, JSON.stringify(calls));
  assert.match(share.options.url, /chamfer-tip\.nc$/);
});
