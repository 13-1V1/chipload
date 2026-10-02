// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Google Play Billing through cordova-plugin-purchase (CdvPurchase). One non-consumable: pro_unlock.
// No server: ownership is read from Play on launch and cached in settings so Pro works offline.
// The cache is only dropped on Play's own word that Pro is gone (refund, chargeback) — see refundCheck.
// In a plain browser there is no store — the Pro screen explains that.

import { getSettings, setSetting } from "./settings.js";
import { toast } from "./ui.js";
import { isTestBuild, buildKnown } from "./build.js";

export const PRO_PRODUCT_ID = "pro_unlock";
// ready: initialize settled (Play answered). slow: no product and no answer PLAY_SLOW_MS after starting —
// the Pro screen stops saying "Checking" and says Play can't be reached.
const state = { ready: false, price: null, product: null, error: null, pending: false, slow: false };
export const PLAY_SLOW_MS = 8000;
const listeners = new Set();
// Snapshot first: a listener may unsubscribe (or a screen may subscribe) while this runs.
const emit = () => [...listeners].forEach((fn) => fn(getBillingState()));

export function getBillingState() { return { ...state, pro: getSettings().pro }; }
export function onBilling(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const MSG = {
  noPlay: "Can't reach Google Play right now — check your connection and try again",
  connecting: "Still connecting to Google Play — try again in a moment",
  pending: "Payment pending — Pro unlocks as soon as Google Play confirms it",
  revoked: "Pro is off: Google Play no longer lists a Pro purchase on this Google account (refunded, or bought on another account)",
};

/*
 * Refund check. Play drops a refunded or charged-back purchase from its purchase list
 * (developer.android.com/google/play/billing/lifecycle/one-time), so with no receipt server that list
 * is the only way to notice. Pro is turned off only on Play's positive word, never because Play can't
 * be reached: the product loaded from Play, the purchase list came back OK, and Pro is neither in it
 * nor pending. Even then it takes MISSES_TO_REVOKE launches in a row, because the plugin can hand back
 * an OK list that lacks the in-app half (PurchasePlugin.java queryPurchases passes the subscription
 * result on when the in-app query fails). Locking out a paying customer is the worse mistake.
 */
export const MISSES_TO_REVOKE = 2;
const CHECK_KEY = "chipload.billing.v1";

/** One launch's answer from Play → no-purchase launches in a row so far, and whether to turn Pro off now. */
export function refundCheck({ pro, productLoaded, listLoaded, owned, pending, misses, testBuild }) {
  if (owned) return { misses: 0, revoke: false };
  // A test build's Pro is the tester's own switch, not a purchase.
  if (!pro || testBuild || !productLoaded || !listLoaded || pending) return { misses, revoke: false };
  return { misses: misses + 1, revoke: misses + 1 >= MISSES_TO_REVOKE };
}

function readMisses() {
  try { const n = JSON.parse(localStorage.getItem(CHECK_KEY) || "{}").misses; return Number.isInteger(n) && n > 0 ? n : 0; }
  catch { return 0; }
}
function writeMisses(n) {
  if (n === readMisses()) return;
  try { localStorage.setItem(CHECK_KEY, JSON.stringify({ misses: n })); } catch { /* storage blocked: the count starts over */ }
}

function unlock(source) {
  writeMisses(0);
  if (!getSettings().pro) { setSetting("pro", true); toast("Pro unlocked"); console.info(`[billing] pro unlocked via ${source}`); }
  emit();
}

export function initBilling() {
  // CdvPurchase is injected by the Cordova plugin after deviceready; absent on the web.
  const start = (tries = 0) => {
    const CdvPurchase = window.CdvPurchase;
    // The plugin defines CdvPurchase first and adds .store a tick later (store.js initCDVPurchase): wait for it.
    if (CdvPurchase && !CdvPurchase.store && tries < 50) { setTimeout(() => start(tries + 1), 100); return; }
    if (!CdvPurchase?.store) { state.error = "no-store"; emit(); return; }
    const { store, ProductType, Platform, LogLevel } = CdvPurchase;
    store.verbosity = LogLevel.WARNING;
    store.register([{ id: PRO_PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.GOOGLE_PLAY }]);

    // With no receipt server, Play's own purchase record is the source of truth: store.owned() is true
    // once a purchase is approved (paid), false while it is pending or after it is consumed.
    const sync = (source) => {
      state.pending = pendingPro(store);
      if (store.owned(PRO_PRODUCT_ID)) unlock(source); else emit();
    };

    // receiptsReady fires once, and only after Play answered a purchase query (googleplay-adapter onSetPurchases).
    let listLoaded = false, checked = false;
    const checkRefund = async () => {
      const productLoaded = !!store.get(PRO_PRODUCT_ID, Platform.GOOGLE_PLAY);
      if (checked || !listLoaded || !productLoaded) return;
      checked = true;
      await buildKnown;
      const misses = readMisses();
      const r = refundCheck({ pro: getSettings().pro, productLoaded, listLoaded, owned: store.owned(PRO_PRODUCT_ID), pending: pendingPro(store), misses, testBuild: isTestBuild() });
      writeMisses(r.misses);
      if (!r.revoke) return;
      setSetting("pro", false);
      console.info(`[billing] pro turned off: not on Play's purchase list ${r.misses} launches in a row`);
      toast(MSG.revoked, { action: "Open", onAction: () => { location.hash = "#/pro"; } });
      emit();
    };

    // On Google Play a pending payment (cash, slow bank) arrives as "initiated" with isPending — never as "pending".
    const toldPending = new Set();
    const when = store.when();
    when.productUpdated((p) => {
      if (p.id !== PRO_PRODUCT_ID) return;
      state.product = p;
      state.price = p.pricing?.price || null;
      sync("productUpdated");
      checkRefund();
    })
      .approved((tx) => {
        // No server-side receipt check (no server by design); Play already validated the purchase.
        sync("approved");
        tx.verify();
      })
      .verified((receipt) => { receipt.finish(); })
      .finished(() => sync("finished"));
    // Simple stand-ins for the plugin (the e2e fake) may not have these two.
    when.initiated?.((tx) => {
      if (!tx.isPending || !tx.products?.some((p) => p.id === PRO_PRODUCT_ID)) return;
      if (!toldPending.has(tx.transactionId)) { toldPending.add(tx.transactionId); toast(MSG.pending, { action: "OK", onAction: () => {} }); }
      sync("pending");
    });
    when.receiptsReady?.(() => { listLoaded = true; checkRefund(); });

    store.error((err) => {
      if (err.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return;
      state.error = err.message || String(err.code);
      console.warn("[billing]", err);
      emit();
    });

    setTimeout(() => { if (!state.product && !state.ready) { state.slow = true; emit(); } }, PLAY_SLOW_MS);
    store.initialize([Platform.GOOGLE_PLAY]).then(() => {
      state.ready = true;
      sync("initialize");
      checkRefund();
    }).catch((e) => { state.error = String(e); emit(); });
  };

  if (window.CdvPurchase) start();
  else if (!window.Capacitor?.isNativePlatform?.()) { state.error = "no-store"; emit(); } // plain browser: there is no store
  else document.addEventListener("deviceready", () => start(), { once: true });

  // The plugin reports a failed order or restore by resolving with an error object — it does not throw.
  const failed = (result) => (result?.isError ? result : null);

  window.chiploadBilling = {
    async buy() {
      const store = window.CdvPurchase?.store;
      if (!store) { toast("Purchases need the Google Play version of Chipload"); return; }
      // In the Play app with no offer, Play hasn't answered yet (offline, or billing still connecting).
      const offer = store.get(PRO_PRODUCT_ID)?.getOffer();
      if (!offer) { toast(state.ready ? "Product not available yet — try again in a moment" : notAnswered()); return; }
      let problem;
      try { problem = failed(await offer.order()); } catch (e) { problem = e; }
      // Bought (the store events unlock it), backed out, or pending (the "initiated" event says so).
      if (!problem || problem.code === window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return;
      console.warn("[billing] order", problem);
      // "You already own this" also lands here: Play still knows, so check before calling it a failure.
      if (store.owned(PRO_PRODUCT_ID)) unlock("order.owned");
      else if (pendingPro(store)) toast(MSG.pending);
      else toast("Google Play couldn't finish the purchase. Check your connection and payment method, then try again.");
    },
    async restore() {
      const store = window.CdvPurchase?.store;
      if (!store) { toast("Restore needs the Google Play version of Chipload"); return; }
      // Until billing connects, restorePurchases() asks nobody and reports no error (store.ts restorePurchases
      // skips adapters that aren't ready) — "no purchase found" would be a guess.
      if (!state.ready && !store.get(PRO_PRODUCT_ID, window.CdvPurchase.Platform?.GOOGLE_PLAY)) { toast(notAnswered()); return; }
      let problem;
      try { problem = failed(await store.restorePurchases()); } catch (e) { problem = e; }
      if (problem) console.warn("[billing] restore", problem);
      if (store.owned(PRO_PRODUCT_ID)) unlock("restore");
      else if (problem) toast(MSG.noPlay);
      else if (pendingPro(store)) toast(MSG.pending);
      else toast("No Pro purchase found on this Google account");
    },
  };
}

/** Play hasn't answered: unreachable once it reported a setup/load error or took too long, otherwise still connecting (the same words as the Pro screen). */
function notAnswered() {
  return (state.error && state.error !== "no-store") || state.slow ? MSG.noPlay : MSG.connecting;
}

/** Is a Pro payment waiting on Google (cash, slow bank)? A cancelled one comes back consumed (googleplay-adapter removed()). */
function pendingPro(store) {
  return (store.localReceipts || []).some((r) => r.transactions?.some((t) => t.isPending && !t.isConsumed && t.products?.some((p) => p.id === PRO_PRODUCT_ID)));
}
