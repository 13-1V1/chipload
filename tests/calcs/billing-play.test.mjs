// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Play Billing behavior with the real cordova-plugin-purchase and a fake Google Play (billing-harness.mjs).
// What "right" means comes from Google's Play Billing docs:
//  - developer.android.com/google/play/billing/integrate: query purchases on launch; a PENDING purchase must
//    tell the user it is pending and grant nothing until it is PURCHASED.
//  - developer.android.com/google/play/billing/lifecycle/one-time: a refunded or revoked one-time product
//    stops being returned by queryPurchasesAsync.
// And the app's own rule (CLAUDE.md, billing.js): never take Pro away because Play can't be reached.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { refundCheck, MISSES_TO_REVOKE } from "../../src/app/billing.js";

const HARNESS = fileURLToPath(new URL("./billing-harness.mjs", import.meta.url));
const SETTINGS = "chipload.settings.v1", CHECKS = "chipload.billing.v1";
const proOn = { [SETTINGS]: JSON.stringify({ units: "in", pro: true }) };
const launch = (sc) => new Promise((resolve, reject) => {
  execFile(process.execPath, [HARNESS, JSON.stringify(sc)], { timeout: 30000 }, (err, out, errOut) => {
    if (err) return reject(new Error(`${err.message}\n${errOut}`));
    resolve(JSON.parse(out.trim().split("\n").pop()));
  });
});
const NO_PLAY = /^Can't reach Google Play right now — check your connection and try again$/;
const PENDING = /pending.*Pro unlocks as soon as Google Play confirms it/i;
const NOT_PLAY_VERSION = /Google Play version/;

describe("refund check (pure)", () => {
  const base = { pro: true, productLoaded: true, listLoaded: true, owned: false, pending: false, misses: 0, testBuild: false };
  test("one empty list never turns Pro off; two launches in a row do", () => {
    assert.equal(MISSES_TO_REVOKE, 2);
    assert.deepEqual(refundCheck(base), { misses: 1, revoke: false });
    assert.deepEqual(refundCheck({ ...base, misses: 1 }), { misses: 2, revoke: true });
  });
  test("anything short of Play's positive answer leaves Pro and the count alone", () => {
    for (const k of ["productLoaded", "listLoaded"]) assert.deepEqual(refundCheck({ ...base, misses: 1, [k]: false }), { misses: 1, revoke: false }, k);
    assert.deepEqual(refundCheck({ ...base, misses: 1, pending: true }), { misses: 1, revoke: false }, "a pending payment is not a refund");
    assert.deepEqual(refundCheck({ ...base, misses: 1, testBuild: true }), { misses: 1, revoke: false }, "a test build's Pro switch is the tester's");
  });
  test("owning it resets the count", () => {
    assert.deepEqual(refundCheck({ ...base, misses: 1, owned: true }), { misses: 0, revoke: false });
  });
});

describe("Play Billing with the real plugin", { concurrency: true }, () => {
  test("refund: Play stops listing Pro → still on after one launch, off after the second, with a reason", async () => {
    const first = await launch({ storage: proOn });
    assert.equal(first.pro, true, "one empty list is not enough");
    assert.ok(first.calls.includes("getPurchases"));
    assert.equal(JSON.parse(first.storage[CHECKS]).misses, 1);
    const second = await launch({ storage: first.storage });
    assert.equal(second.pro, false);
    assert.equal(JSON.parse(second.storage[SETTINGS]).pro, false, "the turn-off is saved");
    assert.ok(second.toasts.some((t) => /Pro is off: Google Play no longer lists a Pro purchase/.test(t)), JSON.stringify(second.toasts));
  });

  test("offline launches never turn Pro off, and Unlock / Restore say Play can't be reached", async () => {
    const r = await launch({ play: { connected: false }, storage: { ...proOn, [CHECKS]: JSON.stringify({ misses: 1 }) }, steps: [{ wait: 600 }, { tap: "buy" }, { tap: "restore" }] });
    assert.equal(r.pro, true);
    assert.equal(JSON.parse(r.storage[CHECKS]).misses, 1, "an unanswered launch doesn't count");
    assert.equal(r.toasts.length, 2);
    for (const t of r.toasts) assert.match(t, NO_PLAY);
    assert.ok(!r.calls.includes("getPurchases"), "nothing was asked, so nothing may be claimed");
  });

  test("product details can't load (offline) → Pro stays, and Unlock doesn't claim this isn't the Play version", async () => {
    const r = await launch({ play: { productsLoad: false }, storage: { ...proOn, [CHECKS]: JSON.stringify({ misses: 1 }) }, steps: [{ wait: 600 }, { tap: "buy" }] });
    assert.equal(r.pro, true);
    assert.deepEqual(r.toasts.length, 1);
    assert.match(r.toasts[0], NO_PLAY);
  });

  // Mid-connect Play has neither answered nor failed: "can't reach" would be a guess, and so would "no purchase found".
  test("Restore tapped while billing is still connecting says so, not \"no purchase found\" or \"can't reach\"", async () => {
    const r = await launch({ play: { owned: true, initDelay: 1500 }, steps: [{ wait: 100 }, { tap: "restore", after: 50 }, { tap: "buy", after: 50 }] });
    assert.deepEqual(r.toasts.slice(0, 2), ["Still connecting to Google Play — try again in a moment", "Still connecting to Google Play — try again in a moment"]);
  });

  test("a launch where Play lists Pro resets the count", async () => {
    const r = await launch({ play: { owned: true }, storage: { ...proOn, [CHECKS]: JSON.stringify({ misses: 1 }) } });
    assert.equal(r.pro, true);
    assert.equal(JSON.parse(r.storage[CHECKS]).misses, 0);
  });

  test("a test build keeps the tester's Pro switch even though Play lists nothing", async () => {
    const first = await launch({ debuggable: true, storage: proOn });
    const second = await launch({ debuggable: true, storage: first.storage });
    assert.equal(second.pro, true);
    assert.equal(second.storage[CHECKS], undefined);
  });

  test("pending payment: says it's pending, grants nothing, then unlocks when Google confirms", async () => {
    const r = await launch({ steps: [{ wait: 700 }, { tap: "buy", mode: "pending", after: 600 }] });
    assert.equal(r.pro, false);
    assert.equal(r.pending, true);
    assert.equal(r.toasts.length, 1);
    assert.match(r.toasts[0], PENDING);
    const done = await launch({ steps: [{ wait: 700 }, { tap: "buy", mode: "pending", after: 600 }, "clear-pending", { wait: 2000 }] });
    assert.equal(done.pro, true);
    assert.equal(done.pending, false);
    assert.ok(done.toasts.includes("Pro unlocked"));
    assert.equal(done.calls.filter((c) => c === "acknowledgePurchase").length, 1);
  });

  test("Restore during a pending payment says pending, not \"no purchase found\"", async () => {
    const r = await launch({ play: { pending: true }, steps: [{ wait: 700 }, { tap: "restore" }] });
    assert.equal(r.pro, false);
    assert.ok(r.toasts.length >= 1);
    for (const t of r.toasts) assert.match(t, PENDING);
  });

  test("Restore with Play answering and no purchase says so (and only then)", async () => {
    const r = await launch({ steps: [{ wait: 700 }, { tap: "restore" }] });
    assert.deepEqual(r.toasts, ["No Pro purchase found on this Google account"]);
  });

  test("buying unlocks once and acknowledges once", async () => {
    const r = await launch({ steps: [{ wait: 700 }, { tap: "buy", mode: "purchase", after: 2000 }] });
    assert.equal(r.pro, true);
    assert.deepEqual(r.toasts, ["Pro unlocked"]);
    assert.equal(r.calls.filter((c) => c === "acknowledgePurchase").length, 1);
  });

  test("plain browser: Unlock says Pro needs the Play version", async () => {
    const r = await launch({ web: true, steps: [{ tap: "buy" }] });
    assert.equal(r.error, "no-store");
    assert.equal(r.toasts.length, 1);
    assert.match(r.toasts[0], NOT_PLAY_VERSION);
  });
});
