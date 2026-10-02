// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// One app launch for billing-play.test.mjs: runs the REAL cordova-plugin-purchase www/store.js and the
// REAL src/app/billing.js against a fake Google Play that answers the way the plugin's PurchasePlugin.java
// does ("code|message" errors, a setPurchases message before getPurchases succeeds). A fresh process per
// launch, because the plugin keeps its store on window. Scenario JSON comes in on argv[2]; the result
// goes out as one JSON line.
//   { storage: {key: json}, web, debuggable, play: { connected, productsLoad, initDelay, owned, pending },
//     steps: [{ wait } | { tap: "buy" | "restore", mode: "purchase" | "pending" | "cancel" | "error" } | "clear-pending"] }
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const sc = JSON.parse(process.argv[2] || "{}");
const play = { connected: true, productsLoad: true, initDelay: 5, owned: false, pending: false, ...sc.play };
const toasts = [], calls = [];

// ---- just enough browser for billing.js, settings.js and ui.js ----
const mem = new Map(Object.entries(sc.storage || {}));
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const el = () => ({ className: "", textContent: "", classList: { add() {} }, setAttribute() {}, append() {}, remove() {}, addEventListener() {}, dataset: {} });
globalThis.document = {
  documentElement: { dataset: {} },
  querySelector: () => null, querySelectorAll: () => [],
  createElement: el,
  createTextNode: (t) => { toasts.push(t); return t; },
  body: { append() {} },
  addEventListener() {},
};
globalThis.location = { hostname: sc.web ? "13-1v1.github.io" : "localhost", href: sc.web ? "https://13-1v1.github.io/chipload/" : "https://localhost/", hash: "" };
if (!sc.web) {
  // Inside the app Capacitor is android, and build.js asks BuildInfoPlugin.java whether this is a debug build.
  globalThis.CapacitorCustomPlatform = { name: "android" };
  globalThis.Capacitor = { PluginHeaders: [{ name: "BuildInfo", methods: [{ name: "get", rtype: "promise" }] }], nativePromise: async () => ({ debuggable: sc.debuggable === true }) };
}
console.log = () => {}; console.info = () => {}; console.warn = () => {}; console.error = () => {};

// ---- fake Google Play (InAppBillingPlugin through cordova.exec) ----
const E = 6777000;
const purchase = (o = {}) => ({ orderId: "GPA.1234", packageName: "com.brennanmeyer.chipload", productId: "pro_unlock", productIds: ["pro_unlock"], purchaseTime: Date.now() - 1000, purchaseState: 0, purchaseToken: "tok-1", quantity: 1, acknowledged: true, getPurchaseState: 1, autoRenewing: false, signature: "sig", receipt: "{}", developerPayload: "", ...o });
const PENDING = { getPurchaseState: 2, purchaseState: 4, acknowledged: false };
let purchases = play.owned ? [purchase()] : play.pending ? [purchase(PENDING)] : [];
let listener = null, buyMode = "purchase";
const later = (fn, ms = 5) => setTimeout(fn, ms);
if (!sc.web) {
  globalThis.cordova = {
    platformId: "android",
    exec(ok, fail, service, action, args) {
      if (service !== "InAppBillingPlugin") return;
      calls.push(action);
      switch (action) {
        case "setListener": listener = ok; return;
        case "init": return later(() => (play.connected ? ok() : fail(`${E + 1}|Setup failure. BILLING_UNAVAILABLE`)), play.initDelay);
        case "getAvailableProducts": return later(() => (play.productsLoad
          ? ok([{ productId: "pro_unlock", title: "Chipload Pro (Chipload)", name: "Chipload Pro", description: "Every tool", product_type: "inapp", product_format: "v11.0", formatted_price: "$9.99", price_amount_micros: 9990000, price_currency_code: "USD" }])
          : fail(`${E + 2}|Failed to load Products, code: 2`)));
        case "getPurchases": return later(() => { if (!play.connected) return fail(`${E + 2}|not connected`); listener?.({ type: "setPurchases", data: { purchases } }); ok(purchases); });
        case "getStorefront": return later(() => ok("US"));
        case "acknowledgePurchase": return later(() => { const p = purchases.find((x) => x.purchaseToken === args[0]); if (p) p.acknowledged = true; ok(); });
        case "buy": return later(() => {
          if (buyMode === "cancel") return fail(`${E + 6}|USER_CANCELED`);
          if (buyMode === "error") return fail(`${E + 3}|ERROR`);
          purchases = [purchase(buyMode === "pending" ? PENDING : { acknowledged: false })];
          ok();
          listener?.({ type: "purchasesUpdated", data: { purchases } });
        });
        default: return later(() => ok());
      }
    },
  };
  vm.runInThisContext(readFileSync(`${ROOT}node_modules/cordova-plugin-purchase/www/store.js`, "utf8"), { filename: "store.js" });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const { initBilling, getBillingState } = await import(pathToFileURL(`${ROOT}src/app/billing.js`).href);
initBilling();
for (const step of sc.steps || [{ wait: 700 }]) {
  if (step === "clear-pending") {
    // the cash payment clears while the app is open: Play pushes the PURCHASED state
    purchases = [{ ...purchases[0], getPurchaseState: 1, purchaseState: 0 }];
    listener?.({ type: "purchasesUpdated", data: { purchases } });
  } else if (step.wait) await wait(step.wait);
  else if (step.tap) { if (step.mode) buyMode = step.mode; await window.chiploadBilling[step.tap](); await wait(step.after ?? 300); }
}
const s = getBillingState();
process.stdout.write(JSON.stringify({ pro: s.pro, ready: s.ready, pending: s.pending, error: s.error, toasts, calls, storage: Object.fromEntries(mem) }) + "\n");
process.exit(0);
