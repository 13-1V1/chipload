// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Google Play Billing through cordova-plugin-purchase (CdvPurchase). One non-consumable: pro_unlock.
// No server: ownership is read from Play on launch and cached in settings so Pro works offline.
// In a plain browser there is no store — the Pro screen explains that.

import { getSettings, setSetting } from "./settings.js";
import { toast } from "./ui.js";

export const PRO_PRODUCT_ID = "pro_unlock";
const state = { ready: false, price: null, product: null, error: null };
const listeners = new Set();
// Snapshot first: a listener may unsubscribe (or a screen may subscribe) while this runs.
const emit = () => [...listeners].forEach((fn) => fn(getBillingState()));

export function getBillingState() { return { ...state, pro: getSettings().pro }; }
export function onBilling(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function unlock(source) {
  if (!getSettings().pro) { setSetting("pro", true); toast("Pro unlocked"); console.info(`[billing] pro unlocked via ${source}`); }
  emit();
}

export function initBilling() {
  // CdvPurchase is injected by the Cordova plugin after deviceready; absent on the web.
  const start = () => {
    const CdvPurchase = window.CdvPurchase;
    if (!CdvPurchase?.store) { state.error = "no-store"; emit(); return; }
    const { store, ProductType, Platform, LogLevel } = CdvPurchase;
    store.verbosity = LogLevel.WARNING;
    store.register([{ id: PRO_PRODUCT_ID, type: ProductType.NON_CONSUMABLE, platform: Platform.GOOGLE_PLAY }]);

    // With no receipt server, Play's own purchase record is the source of truth: store.owned() is true
    // once a purchase is approved (paid), false while it is pending or after it is consumed.
    const sync = (source) => { if (store.owned(PRO_PRODUCT_ID)) unlock(source); else emit(); };

    store.when()
      .productUpdated((p) => {
        if (p.id !== PRO_PRODUCT_ID) return;
        state.product = p;
        state.price = p.pricing?.price || null;
        sync("productUpdated");
      })
      .approved((tx) => {
        // No server-side receipt check (no server by design); Play already validated the purchase.
        sync("approved");
        tx.verify();
      })
      .verified((receipt) => { receipt.finish(); })
      .finished(() => sync("finished"));

    store.error((err) => {
      if (err.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return;
      state.error = err.message || String(err.code);
      console.warn("[billing]", err);
      emit();
    });

    store.initialize([Platform.GOOGLE_PLAY]).then(() => {
      state.ready = true;
      sync("initialize");
    }).catch((e) => { state.error = String(e); emit(); });
  };

  if (window.CdvPurchase) start();
  else if (!window.Capacitor?.isNativePlatform?.()) { state.error = "no-store"; emit(); } // plain browser: there is no store
  else document.addEventListener("deviceready", start, { once: true });

  // The plugin reports a failed order or restore by resolving with an error object — it does not throw.
  const failed = (result) => (result?.isError ? result : null);

  window.chiploadBilling = {
    async buy() {
      const store = window.CdvPurchase?.store;
      const offer = store?.get(PRO_PRODUCT_ID)?.getOffer();
      if (!store || !offer) { toast(state.ready ? "Product not available yet — try again in a moment" : "Purchases need the Google Play version of Chipload"); return; }
      let problem;
      try { problem = failed(await offer.order()); } catch (e) { problem = e; }
      if (!problem || problem.code === window.CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return; // bought (the store events unlock it) or backed out
      console.warn("[billing] order", problem);
      // "You already own this" also lands here: Play still knows, so check before calling it a failure.
      if (store.owned(PRO_PRODUCT_ID)) unlock("order.owned");
      else toast("Google Play couldn't finish the purchase. Check your connection and payment method, then try again.");
    },
    async restore() {
      const store = window.CdvPurchase?.store;
      if (!store) { toast("Restore needs the Google Play version of Chipload"); return; }
      let problem;
      try { problem = failed(await store.restorePurchases()); } catch (e) { problem = e; }
      if (problem) console.warn("[billing] restore", problem);
      if (store.owned(PRO_PRODUCT_ID)) unlock("restore");
      else toast(problem ? "Couldn't reach Google Play. Check your connection and try again." : "No Pro purchase found on this Google account");
    },
  };
}
