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
const emit = () => listeners.forEach((fn) => fn(getBillingState()));

export function getBillingState() { return { ...state, pro: getSettings().pro }; }
export function onBilling(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function unlock(source) {
  if (!getSettings().pro) { setSetting("pro", true); toast("Pro unlocked"); }
  console.info(`[billing] pro unlocked via ${source}`);
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

    store.when()
      .productUpdated((p) => {
        if (p.id !== PRO_PRODUCT_ID) return;
        state.product = p;
        state.price = p.pricing?.price || null;
        if (p.owned) unlock("productUpdated.owned");
        emit();
      })
      .approved((tx) => {
        // No server-side receipt check (no server by design); Play already validated the purchase.
        tx.verify();
      })
      .verified((receipt) => {
        receipt.finish();
        if (receipt.collection?.some((t) => t.products?.some((pr) => pr.id === PRO_PRODUCT_ID))) unlock("verified");
      })
      .finished(() => emit());

    store.error((err) => {
      if (err.code === CdvPurchase.ErrorCode.PAYMENT_CANCELLED) return;
      state.error = err.message || String(err.code);
      console.warn("[billing]", err);
      emit();
    });

    store.initialize([Platform.GOOGLE_PLAY]).then(() => {
      state.ready = true;
      const owned = store.owned(PRO_PRODUCT_ID);
      if (owned) unlock("initialize.owned");
      emit();
    }).catch((e) => { state.error = String(e); emit(); });
  };

  if (window.CdvPurchase) start();
  else document.addEventListener("deviceready", start, { once: true });

  window.chiploadBilling = {
    async buy() {
      const store = window.CdvPurchase?.store;
      const offer = store?.get(PRO_PRODUCT_ID)?.getOffer();
      if (!store || !offer) { toast(state.ready ? "Product not available yet — try again in a moment" : "Purchases need the Google Play version of Chipload"); return; }
      try { await offer.order(); } catch (e) { console.warn("[billing] order", e); }
    },
    async restore() {
      const store = window.CdvPurchase?.store;
      if (!store) { toast("Restore needs the Google Play version of Chipload"); return; }
      try {
        await store.restorePurchases();
        if (store.owned(PRO_PRODUCT_ID)) unlock("restore");
        else toast("No Pro purchase found on this Google account");
      } catch (e) { toast("Couldn't reach Google Play"); console.warn("[billing] restore", e); }
    },
  };
}
