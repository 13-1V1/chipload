// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Browser tests with Playwright Chromium at phone size. Run with: npm run test:e2e
// Starts the static server itself. Fails on any console error.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { resolve } from "node:path";

const PORT = Number(process.env.E2E_PORT) || 4199; // another port when two runs share the machine
const BASE = `http://127.0.0.1:${PORT}/`;
let server, browser;

test.before(async () => {
  server = spawn(process.execPath, [resolve(import.meta.dirname, "../serve.mjs"), `--port=${PORT}`], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));
  browser = await chromium.launch();
});
test.after(async () => { await browser?.close(); server?.kill(); });

async function open(path, { pro = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE);
  await page.evaluate((pro) => localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "in", theme: "dark", glove: false, pro, places: 4 })), pro);
  await page.goto(`${BASE}?e2e=1#${path}`);
  await page.waitForLoadState("networkidle");
  return { page, ctx, errors };
}

test("home renders search, favorites, and eight categories with no console errors", async () => {
  const { page, ctx, errors } = await open("/");
  assert.equal(await page.locator(".cat").count(), 8);
  assert.ok(await page.locator("#q").isVisible());
  assert.ok(await page.locator("#back").isHidden(), "back button hidden on home");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("search 'rpm' → Enter opens speeds & feeds; typing '1/4-20' offers tap drill with prefill", async () => {
  const { page, ctx, errors } = await open("/");
  await page.fill("#q", "rpm");
  await page.press("#q", "Enter");
  await page.waitForURL(/#\/calc\/feeds-mill/);
  await page.waitForFunction(() => document.querySelector("#title")?.textContent.startsWith("Speeds"));
  assert.equal(await page.locator("#title").textContent(), "Speeds & feeds — mill");
  await page.goto(`${BASE}?e2e=2#/`);
  await page.fill("#q", "1/4-20");
  const first = page.locator("#results [data-calc]").first();
  assert.match(await first.getAttribute("data-params"), /1\/4-20/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("number pad: tap diameter, type 1/2, answer updates; drawer opens and pad closes", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  const dia = page.locator("#f-feeds-mill-diameter");
  await dia.click();
  await page.waitForSelector(".numpad.open");
  for (let i = 0; i < 8; i++) await page.locator('.numpad [data-key="bksp"]').dispatchEvent("pointerdown");
  for (const k of ["1", "/", "2"]) await page.locator(`.numpad [data-key="${k}"]`).dispatchEvent("pointerdown");
  assert.equal(await dia.inputValue(), "1/2");
  // 6061 + carbide from the library: 1000 SFM → 7639 RPM × 4 × 0.00533 (0.004 scaled to 1/2") = 163 IPM
  await page.waitForFunction(() => document.querySelector("#answerVal")?.textContent === "163");
  await page.locator("details.drawer summary").first().click();
  await page.waitForFunction(() => !document.querySelector(".numpad")?.classList.contains("open"));
  assert.ok(await page.locator("details.drawer").first().getAttribute("open") !== null);
  assert.match(await page.locator(".formula").first().textContent(), /RPM = \(SFM × 12\)/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("every calculator mounts and produces an answer with Pro on", async () => {
  const { page, ctx, errors } = await open("/", { pro: true });
  const ids = await page.evaluate(async () => {
    const { allCalcs } = await import("./src/app/registry.js");
    return allCalcs().map((d) => [d.id, d.view || "calc"]);
  });
  assert.ok(ids.length >= 40, `only ${ids.length} calculators`);
  for (const [id, view] of ids) {
    await page.goto(`${BASE}?e2e=${id}#/calc/${id}`);
    await page.waitForLoadState("networkidle");
    if (view === "chart") {
      assert.ok((await page.locator("table.chart tbody tr").count()) > 5, `${id} chart rows`);
    } else {
      const val = await page.locator("#answerVal").textContent();
      assert.ok(val && val !== "Pro", `${id} has no answer (got "${val}")`);
    }
  }
  assert.deepEqual(errors, [], errors.join("\n"));
  await ctx.close();
});

test("Pro lock: free user sees the lock on a Pro tool and inputs still work", async () => {
  const { page, ctx, errors } = await open("/calc/mow");
  assert.equal(await page.locator("#answerVal").textContent(), "Pro");
  assert.ok(await page.locator(".lock").isVisible());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("glove mode and light theme apply; settings persist across reload", async () => {
  const { page, ctx, errors } = await open("/settings");
  await page.locator('[data-set="glove"]').click();
  await page.locator('[data-set="light"]').click();
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.glove), "on");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--tap").trim()), "72px");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("machine profile clamps RPM and shows both numbers", async () => {
  const { page, ctx, errors } = await open("/", { pro: true });
  await page.evaluate(() => {
    localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m1", name: "Bridgeport", type: "mill", maxRpm: 2000, maxFeed: 30, controller: "other", units: "in" }]));
    localStorage.setItem("chipload.blob.activeMachine", JSON.stringify("m1"));
  });
  await page.goto(`${BASE}?e2e=clamp#/calc/feeds-mill?diameter=0.25&sfm=800`);
  await page.waitForLoadState("networkidle");
  assert.match(await page.locator(".warn").first().textContent(), /Bridgeport tops out at 2000 RPM. Wanted 12223/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("glove toggle sits in the top bar on every screen and sticks", async () => {
  const { page, ctx, errors } = await open("/");
  await page.locator("#gloveBtn").click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.glove), "on");
  await page.goto(`${BASE}?e2e=g2#/calc/tap-drill`);
  await page.waitForLoadState("networkidle");
  assert.ok(await page.locator("#gloveBtn").isVisible(), "glove button on a tool screen");
  assert.equal(await page.locator("#gloveBtn").getAttribute("aria-pressed"), "true");
  assert.ok(await page.locator("#settingsBtn").isHidden(), "gear hidden on tool screens");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("home: intro card, common jobs in plain English, a job row opens its tool", async () => {
  const { page, ctx, errors } = await open("/");
  assert.ok(await page.locator("#intro").isVisible());
  await page.locator("#introOk").click();
  assert.equal(await page.locator("#intro").count(), 0);
  await page.locator('#jobs [data-calc="tap-drill"]').click();
  await page.waitForURL(/#\/calc\/tap-drill/);
  await page.goto(`${BASE}?e2e=h2#/`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#intro").count(), 0, "intro stays dismissed");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("beginner words find the right tool: 'how fast band saw', 'drill bit', 'screw hole'", async () => {
  const { page, ctx, errors } = await open("/");
  const first = async (text) => { await page.fill("#q", text); return page.locator("#results [data-calc]").first().getAttribute("data-calc"); };
  assert.equal(await first("how fast band saw"), "saw-speed");
  assert.equal(await first("bandsaw blade"), "saw-speed");
  assert.equal(await first("what drill for a 1/4-20 tap"), "tap-drill");
  assert.equal(await first("screw hole"), "shcs");
  assert.equal(await first("clearance hole for a 3/8 bolt"), "shcs");
  assert.equal(await first("set up a job"), "job-sheet");
  await page.fill("#q", "zzzz");
  assert.ok((await page.locator("#results [data-calc]").count()) >= 5, "no-results fallback lists common jobs");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("tool screen: help card shows once, advanced inputs fold under More options", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  assert.ok(await page.locator(".help").isVisible(), "help card on first open");
  assert.ok(await page.locator("#f-feeds-mill-woc").isHidden(), "width of cut folded away");
  await page.locator(".help [data-gotit]").click();
  assert.equal(await page.locator(".help").count(), 0);
  await page.locator("details.more summary").click();
  assert.ok(await page.locator("#f-feeds-mill-woc").isVisible(), "More options opens the advanced fields");
  // <details> fires `toggle` asynchronously — wait until the open state is saved before reloading
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("chipload.inputs.feeds-mill") || "{}").more === true);
  await page.reload();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".help").count(), 0, "help stays dismissed");
  assert.ok(await page.locator("#f-feeds-mill-woc").isVisible(), "More options stays open");
  await page.locator("#helpBtn").click();
  assert.ok(await page.locator(".help").isVisible(), "? brings the help back");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("job sheet starts short; 'add one more number' reveals the field and unlocks the next answer", async () => {
  const { page, ctx, errors } = await open("/calc/job-sheet");
  await page.locator(".help [data-gotit]").click();
  assert.ok(await page.locator("#f-job-sheet-diameter").isVisible());
  assert.ok(await page.locator("#f-job-sheet-length").isHidden(), "optional fields start hidden");
  assert.ok(await page.locator("#f-job-sheet-qty").isHidden());
  const addLength = page.locator('.next-item[data-focus="length"]');
  assert.ok(await addLength.isVisible(), "offers length → time per pass");
  await addLength.click();
  await page.waitForSelector("#f-job-sheet-length", { state: "visible" });
  await page.waitForSelector(".numpad.open");
  for (const k of ["1", "0"]) await page.locator(`.numpad [data-key="${k}"]`).dispatchEvent("pointerdown");
  await page.waitForFunction(() => [...document.querySelectorAll(".stat .l")].some((l) => /Time per pass/.test(l.textContent)));
  assert.ok(await page.locator('.next-item[data-focus="qty"]').isVisible(), "now offers quantity → job time");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("favorites & recent chips wrap instead of running off the edge", async () => {
  const { page, ctx, errors } = await open("/");
  await page.evaluate(() => {
    localStorage.setItem("chipload.favorites", JSON.stringify(["job-sheet", "feeds-mill"]));
    localStorage.setItem("chipload.recents", JSON.stringify(["chamfer", "feeds-drill", "tap-drill", "bolt-circle", "thread-data", "right-triangle"]));
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  const info = await page.evaluate(() => {
    const row = document.querySelector("#favs").getBoundingClientRect();
    const chips = [...document.querySelectorAll("#favs .chip")].map((c) => c.getBoundingClientRect());
    return { count: chips.length, overflow: chips.some((c) => c.right > row.right + 0.5 || c.left < row.left - 0.5), rowRight: row.right, viewport: window.innerWidth, scrollW: document.querySelector("#favs").scrollWidth, clientW: document.querySelector("#favs").clientWidth };
  });
  assert.equal(info.count, 6, "two favorites + four recents");
  assert.equal(info.overflow, false, "no chip is cut off");
  assert.ok(info.scrollW <= info.clientW + 1, "row does not scroll sideways");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ── Found by the critic pass and the code review: each of these was broken once ──

const answer = (page) => page.evaluate(() => ({ val: document.querySelector("#answerVal").textContent, lbl: document.querySelector("#answerLbl").textContent }));
const typeInto = async (page, selector, text) => { await page.locator(selector).fill(text); await page.waitForTimeout(60); };

/**
 * A stand-in for the Play Billing plugin that behaves like the real one with no receipt server:
 * the verified receipt's collection is empty, and ownership is only visible through store.owned().
 * Like the real one it has the "initiated" (a pending payment) and "receiptsReady" (Play answered the purchase
 * query) events and a localReceipts list. Options: offline — Play can't be reached: the bridge reports a SETUP
 * error and retries forever, so initialize never settles and no product arrives (store.js iabError); connecting —
 * nothing has answered yet, no error either; priceFirst — the price arrives (productUpdated) while initialize is
 * still waiting on the purchase list; pending — an order comes back as a pending payment (cash, slow bank), never approved.
 */
const FAKE_PLAY_STORE = ({ offline = false, pending = false, connecting = false, priceFirst = false } = {}) => {
  const cb = { productUpdated: [], approved: [], verified: [], finished: [], initiated: [], receiptsReady: [], error: [] };
  let bought = false;
  const later = (fn) => setTimeout(fn, 15);
  const localReceipts = [];
  const receipt = { collection: [], finish() { later(() => cb.finished.forEach((f) => f(tx))); } };
  const tx = { verify() { later(() => cb.verified.forEach((f) => f(receipt))); } };
  const order = async () => {
    if (pending) {
      // Google Play reports a pending payment as "initiated" with isPending, and keeps it in the local receipts
      const waiting = { transactionId: "GPA.pending-1", isPending: true, isConsumed: false, products: [{ id: "pro_unlock" }] };
      localReceipts.push({ transactions: [waiting] });
      later(() => cb.initiated.forEach((f) => f(waiting)));
      return undefined;
    }
    bought = true; later(() => cb.approved.forEach((f) => f(tx)));
  };
  const product = { id: "pro_unlock", pricing: { price: "$9.99" }, get owned() { return bought; }, getOffer: () => ({ order }) };
  const chain = {};
  for (const name of ["productUpdated", "approved", "verified", "finished", "initiated", "receiptsReady"]) chain[name] = (f) => { cb[name].push(f); return chain; };
  window.__billingEvents = cb;
  window.CdvPurchase = {
    store: {
      verbosity: 0, register() {}, when: () => chain, error: (f) => cb.error.push(f), localReceipts,
      initialize: offline ? () => { later(() => cb.error.forEach((f) => f({ code: 6777001, message: "Init failed - Billing service unavailable" }))); return new Promise(() => {}); }
        : connecting ? () => new Promise(() => {})
        : priceFirst ? () => { later(() => cb.productUpdated.forEach((f) => f(product))); return new Promise(() => {}); }
        : async () => { later(() => { cb.productUpdated.forEach((f) => f(product)); cb.receiptsReady.forEach((f) => f()); }); },
      owned: () => bought, get: () => (offline || connecting ? undefined : product), restorePurchases: async () => undefined,
    },
    ProductType: { NON_CONSUMABLE: "non consumable" }, Platform: { GOOGLE_PLAY: "android-playstore" }, LogLevel: { WARNING: 2 }, ErrorCode: { PAYMENT_CANCELLED: 6777006 },
  };
};

test("Pro screen opened directly loads, and says where Pro is sold when there is no store", async () => {
  const { page, ctx, errors } = await open("/pro");
  assert.equal(await page.locator("#title").textContent(), "Chipload Pro");
  assert.ok(await page.locator("#buy").isVisible());
  assert.match(await page.locator("main .hint").textContent(), /sold through Google Play/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("buying Pro unlocks it right away, and the Pro screen keeps working through every store event", async () => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FAKE_PLAY_STORE);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}?e2e=buy#/pro`, { waitUntil: "load", timeout: 10000 });
  await page.waitForFunction(() => /\$9\.99/.test(document.querySelector("#buy")?.textContent || ""));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("chipload.settings.v1") || "{}").pro === true), false, "not Pro before buying");
  await page.locator("#buy").click();
  await page.waitForFunction(() => document.querySelector("main button[disabled]")?.textContent === "Pro unlocked", null, { timeout: 5000 });
  assert.equal(await page.locator("#buy").count(), 0, "buy button is gone");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("chipload.settings.v1")).pro), true, "the unlock is saved for offline use");
  // a burst of late store events must not hang or break the screen
  await page.evaluate(() => { for (let i = 0; i < 25; i++) window.__billingEvents.finished.forEach((f) => f({})); });
  assert.equal(await page.locator("main button[disabled]").textContent(), "Pro unlocked");
  // and a Pro tool is open for business
  await page.evaluate(() => { location.hash = "#/calc/chamfer"; });
  await page.waitForFunction(() => document.querySelector("#answerVal")?.textContent === "0.25");
  assert.equal(await page.locator(".lock").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** The Pro screen with the fake Play store in it. */
async function openWithStore(opts, tag) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FAKE_PLAY_STORE, opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}?e2e=${tag}#/pro`, { waitUntil: "load", timeout: 10000 });
  await page.locator("#buy").waitFor();
  return { page, ctx, errors };
}
const toastText = (page) => page.evaluate(() => document.querySelector(".copied")?.firstChild?.textContent || "");

test("Play out of reach: Unlock and Restore say so instead of failing quietly", async () => {
  const { page, ctx, errors } = await openWithStore({ offline: true }, "offline");
  // billing.js MSG.noPlay, word for word
  const NO_PLAY = "Can't reach Google Play right now — check your connection and try again";
  // the plugin's SETUP error is Play's word that it can't be reached
  await page.waitForFunction(() => /Can't reach Google Play right now/.test(document.querySelector("#proHint")?.textContent || ""));
  assert.doesNotMatch(await page.locator("#buy").textContent(), /\$/, "no price until Play answers");
  await page.locator("#buy").click();
  await page.waitForFunction(() => !!document.querySelector(".copied"));
  assert.equal(await toastText(page), NO_PLAY);
  await page.locator("#restore").click();
  await page.waitForFunction((t) => document.querySelector(".copied")?.firstChild?.textContent === t, NO_PLAY);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("chipload.settings.v1") || "{}").pro === true), false, "still not Pro");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a pending payment says so on the Pro screen, and Pro stays locked until Play confirms it", async () => {
  const { page, ctx, errors } = await openWithStore({ pending: true }, "pending");
  await page.waitForFunction(() => /\$9\.99/.test(document.querySelector("#buy")?.textContent || ""));
  await page.locator("#buy").click();
  await page.waitForFunction(() => /Payment pending/.test(document.querySelector("#proHint")?.textContent || ""));
  assert.equal(await page.locator("#proHint").textContent(), "Payment pending — Pro unlocks as soon as Google Play confirms it.");
  assert.match(await toastText(page), /^Payment pending — Pro unlocks as soon as Google Play confirms it/);
  assert.equal(await page.locator("#buy").count(), 1, "not unlocked yet");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("chipload.settings.v1") || "{}").pro === true), false, "a pending payment is not Pro");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Save job tells the truth when the phone won't store it", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill", { pro: true });
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).endsWith("blob.jobs")) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); };
  });
  await page.locator("#answerMore").click();
  await page.locator('.menu [data-act="job"]').click();
  await page.locator("#jobSave").click();
  assert.equal(await toastText(page), "Couldn't save — the phone's storage is full or blocked.");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a choice that's no longer offered: the select shows the same size the answer used", async () => {
  const { page, ctx, errors } = await open("/", { pro: true });
  // a Recent row from before with a center drill size the list no longer has. The tool's
  // default (#3) is not the first option, so falling back to options[0] (#00) would show a
  // different drill than the answer uses, and the old code left the select blank.
  await page.evaluate(() => localStorage.setItem("chipload.history.center-drill", JSON.stringify([
    { key: "old", label: "old row", primary: "", raw: { size: "#99", csk: "" }, units: "in", at: 1 }])));
  await page.goto(`${BASE}?e2e=stale#/calc/center-drill`);
  await page.waitForLoadState("networkidle");
  await page.locator("details.drawer summary", { hasText: "Recent" }).click();
  await page.locator("button[data-h]").first().click();
  await page.waitForFunction(() => /#3\)/.test(document.querySelector("#answerLbl")?.textContent || ""));
  const s = await page.evaluate(() => {
    const sel = document.querySelector("#f-center-drill-size");
    return { value: sel.value, index: sel.selectedIndex, first: sel.options[0]?.value, lbl: document.querySelector("#answerLbl").textContent };
  });
  assert.notEqual(s.first, "#3", "the default is not the first option, so this test can tell the two fallbacks apart");
  assert.equal(s.value, "#3");
  assert.equal(s.index, 4);
  assert.match(s.lbl, /\(#3\)/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a saved job reopens with its own numbers, not whatever was typed since", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill", { pro: true });
  const saved = (await answer(page)).val;
  await page.locator("#answerMore").click();
  await page.locator('.menu [data-act="job"]').click();
  await page.locator("#jobName").fill("Bracket slot");
  await page.locator("#jobSave").click();
  // now leave a surface-speed override behind in the same tool
  await page.locator("details.more > summary").click();
  await typeInto(page, "#f-feeds-mill-sfm", "50");
  assert.notEqual((await answer(page)).val, saved);
  await page.evaluate(() => { location.hash = "#/shop/jobs"; });
  await page.locator("[data-open]").first().click();
  await page.waitForFunction(() => location.hash.startsWith("#/calc/feeds-mill"));
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#f-feeds-mill-sfm").inputValue(), "", "the blank field came back blank");
  assert.equal((await answer(page)).val, saved, "same answer as when it was saved");
  // deleting a job is one tap, and one tap to take back
  await page.evaluate(() => { location.hash = "#/shop/jobs"; });
  await page.locator("[data-del]").first().click();
  assert.equal(await page.locator("[data-open]").count(), 0);
  await page.locator(".copied button").click();
  assert.equal(await page.locator("[data-open]").count(), 1, "Undo brought it back");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a shared link carries blank fields as blank", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  await page.evaluate(() => { navigator.share = (data) => { window.__shared = data; return Promise.resolve(); }; });
  await page.locator("#answerMore").click();
  await page.locator('.menu [data-act="share"]').click();
  const url = await page.evaluate(() => window.__shared.url);
  const query = new URLSearchParams(url.split("?")[1]);
  assert.equal(query.get("diameter"), "0.375");
  assert.equal(query.get("sfm"), "", "sfm is in the link, and blank");
  assert.equal(query.get("units"), "in");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("number pad: gives way to a text field, and Next walks a Shop form", async () => {
  const { page, ctx, errors } = await open("/calc/tapping-feed", { pro: true });
  const padOpen = () => page.evaluate(() => !!document.querySelector(".numpad")?.classList.contains("open"));
  await page.locator("#f-tapping-feed-rpm").click();
  assert.equal(await padOpen(), true);
  await page.locator("#f-tapping-feed-thread").click();
  assert.equal(await padOpen(), false, "tapping the thread field closes the number pad");
  await page.evaluate(() => { location.hash = "#/shop/machines"; });
  await page.locator("#add").click();
  await page.locator("#mRpm").click();
  assert.equal(await padOpen(), true);
  await page.locator('.numpad [data-key="8"]').dispatchEvent("pointerdown");
  await page.locator('.numpad [data-key="next"]').dispatchEvent("pointerdown");
  assert.equal(await page.evaluate(() => document.activeElement.id), "mFeed", "Next moves to the next number field");
  await page.locator('.numpad [data-key="next"]').dispatchEvent("pointerdown");
  assert.equal(await padOpen(), false, "Next on the last field closes the pad");
  assert.equal(await page.locator("#mRpm").inputValue(), "8");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("when a field can't be used, the answer bar names it", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  await typeInto(page, "#f-feeds-mill-diameter", "");
  assert.equal((await answer(page)).lbl, "Enter Tool diameter");
  await typeInto(page, "#f-feeds-mill-diameter", "0.5");
  await typeInto(page, "#f-feeds-mill-flutes", "0");
  assert.equal((await answer(page)).lbl, "Flutes can't be less than 1");
  await typeInto(page, "#f-feeds-mill-flutes", "4");
  // a bad value folded away under More options: the drawer opens so the highlight can be seen
  assert.equal(await page.evaluate(() => document.querySelector("details.more").open), false);
  await page.evaluate(() => { const el = document.querySelector("#f-feeds-mill-sfm"); el.value = "1/"; el.dispatchEvent(new Event("input")); });
  assert.equal((await answer(page)).lbl, 'Check Surface speed — "1/" isn\'t a number');
  assert.equal(await page.evaluate(() => document.querySelector("details.more").open), true);
  assert.equal(await page.locator(".input.bad").count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();

  const three = await open("/calc/mow", { pro: true });
  await typeInto(three.page, "#f-mow-thread", "garbage");
  assert.match((await answer(three.page)).lbl, /^Type a thread like/, "the tool's own reason, not a generic one");
  assert.deepEqual(three.errors, []);
  await three.ctx.close();
});

test("metric setting: tools open on a real metric cut, and the unit switch keeps it the same cut", async () => {
  const { page, ctx, errors } = await open("/");
  await page.evaluate(() => localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "mm", theme: "dark", glove: false, pro: true })));
  await page.goto(`${BASE}?e2e=mm#/calc/feeds-mill`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("#f-feeds-mill-diameter").inputValue(), "10");
  assert.equal(await page.locator('label[for="f-feeds-mill-diameter"] .u').textContent(), "mm");
  const rpm = Number(await page.locator(".stat .v").first().evaluate((el) => el.firstChild.textContent));
  assert.ok(rpm > 500 && rpm < 30000, `plausible RPM, got ${rpm}`);
  assert.equal(await page.locator(".warn").count(), 0);
  const metric = await answer(page);
  await page.locator('.calc > .seg [data-u="in"]').click();
  assert.equal(await page.locator("#f-feeds-mill-diameter").inputValue(), "0.3937");
  const inch = await answer(page);
  assert.ok(Math.abs(Number(metric.val) / 25.4 - Number(inch.val)) < 0.2, `${metric.val} mm/min is ${inch.val} IPM`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("right triangle: the fields are named for the pair, and an angle is never converted like a length", async () => {
  const { page, ctx, errors } = await open("/calc/right-triangle");
  const label = (id) => page.evaluate((id) => document.querySelector(`label[for="f-right-triangle-${id}"]`).textContent, id);
  assert.equal(await label("a"), "Run (adjacent)in");
  assert.equal(await label("b"), "Rise (opposite)in");
  await page.locator("#f-right-triangle-mode").selectOption("hypAngle");
  assert.equal(await label("a"), "Hypotenusein");
  assert.equal(await label("b"), "Angle°");
  await typeInto(page, "#f-right-triangle-a", "5");
  await typeInto(page, "#f-right-triangle-b", "30");
  await page.locator('.calc > .seg [data-u="mm"]').click();
  assert.equal(await page.locator("#f-right-triangle-a").inputValue(), "127");
  assert.equal(await page.locator("#f-right-triangle-b").inputValue(), "30", "30° is still 30°");
  assert.equal(await label("b"), "Angle°");
  assert.equal((await answer(page)).val, "127");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("print sheet has the tool name, the answer, and every input in words", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill", { pro: true });
  await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; window.dispatchEvent(new Event("afterprint")); }; });
  const shown = (await answer(page)).val;
  await page.locator("#answerMore").click();
  await page.locator('.menu [data-act="print"]').click();
  assert.equal(await page.evaluate(() => window.__printed), 1);
  await page.emulateMedia({ media: "print" });
  const sheet = await page.evaluate(() => {
    const visible = (sel) => { const el = document.querySelector(sel); return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0; };
    return { block: visible(".print-block"), answerBar: visible(".answer"), fields: visible(".field"), stats: visible(".stats"), text: document.querySelector(".print-block").innerText };
  });
  assert.equal(sheet.block, true);
  assert.equal(sheet.answerBar, false, "the on-screen bar is replaced by the printed line");
  assert.equal(sheet.fields, false);
  assert.equal(sheet.stats, true);
  assert.match(sheet.text, /Speeds & feeds — mill/);
  assert.ok(sheet.text.includes(`Feed rate: ${shown} IPM`), sheet.text);
  assert.match(sheet.text, /Tool diameter\s+0\.375 in/);
  assert.match(sheet.text, /Material\s+6061-T6 aluminum/);
  assert.match(sheet.text, /Tool\s+Carbide/);
  assert.match(sheet.text, /Surface speed\s+auto \d+/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("web copy works with no signal after one visit", async () => {
  const { page, ctx, errors } = await open("/");
  // the worker fetches its own copy of everything the page loaded, then says so
  await page.waitForFunction(() => document.documentElement.dataset.offline === "ready", null, { timeout: 20000 });
  const cached = await page.evaluate(async () => { let n = 0; for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length; return n; });
  assert.ok(cached > 100, `the whole app is cached, not just the shell (${cached} files)`);
  await ctx.setOffline(true);
  errors.length = 0;
  await page.reload({ waitUntil: "load", timeout: 10000 });
  assert.equal(await page.locator(".cat").count(), 8, "home opens offline");
  await page.goto(`${BASE}?e2e=1#/calc/tap-drill`, { waitUntil: "load", timeout: 10000 });
  await page.waitForFunction(() => document.querySelector("#answerVal")?.textContent === "#7");
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes("IBM Plex Sans")), true);
  assert.deepEqual(errors, [], "nothing failed to load offline");
  await ctx.setOffline(false);
  await ctx.close();
});

// Stacked under the answer bar, a sideways pad left 3–77 px for the field on real phones (S23: 77, with a
// larger display size or glove mode: 3–53). On its side the pad is a full-height column on the right.
const SIDEWAYS = [[915, 365], [780, 330], [740, 300], [640, 280]];

test("phone on its side: the pad is a column on the right and the field being typed in stays in view", async () => {
  for (const glove of [false, true]) {
    for (const [w, h] of SIDEWAYS) {
      const { page, ctx, errors } = await open("/calc/lathe-cycle", { pro: true });
      if (glove) await page.locator("#gloveBtn").click();
      await page.locator("#f-lathe-cycle-passes").click(); // low on the form
      await page.waitForSelector(".numpad.open");
      await page.setViewportSize({ width: w, height: h }); // rotate with the pad up
      await page.waitForTimeout(700);
      const where = `${w}x${h}${glove ? " glove" : ""}`;
      const box = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const pad = r(".numpad"), bar = r(".answer"), field = r('[data-active="true"]'), key = r('.numpad [data-key="5"]');
        return { pad, bar, field, key, vh: innerHeight };
      });
      assert.ok(box.pad.top <= 1 && box.pad.bottom >= box.vh - 1, `${where}: pad runs the full height`);
      assert.ok(Math.abs(box.bar.right - box.pad.left) <= 1 && Math.abs(box.bar.bottom - box.vh) <= 1, `${where}: answer bar sits left of the pad, at the bottom`);
      assert.ok(box.field.right <= box.pad.left, `${where}: the form moved left of the pad`);
      assert.ok(box.field.top >= 0 && box.field.bottom <= box.bar.top + 1, `${where}: field ${Math.round(box.field.top)}–${Math.round(box.field.bottom)} is above the answer bar at ${Math.round(box.bar.top)}`);
      assert.ok(box.key.height >= 48 && box.key.width >= 48, `${where}: keys are full touch targets (${Math.round(box.key.width)}×${Math.round(box.key.height)})`);
      // the top-bar buttons aren't hiding under the pad
      const glovePos = await page.evaluate(() => { window.scrollTo(0, 0); const g = document.querySelector("#gloveBtn").getBoundingClientRect(); return { right: g.right, padLeft: document.querySelector(".numpad").getBoundingClientRect().left }; });
      assert.ok(glovePos.right <= glovePos.padLeft + 1, `${where}: glove button is clear of the pad`);
      // the whole answer fits next to the buttons
      const val = await page.evaluate(() => { const v = document.querySelector("#answerVal"); return { full: v.scrollWidth <= v.clientWidth + 1, text: v.textContent }; });
      assert.ok(val.full, `${where}: answer "${val.text}" isn't cut off`);
      // and back upright: a bottom sheet again, with the bar riding on it
      await page.locator("#f-lathe-cycle-passes").click();
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(700);
      const up = await page.evaluate(() => {
        const r = (sel) => document.querySelector(sel).getBoundingClientRect();
        const pad = r(".numpad"), bar = r(".answer"), field = r('[data-active="true"]');
        return { gap: Math.round(pad.top - bar.bottom), padLeft: pad.left, fieldOk: field.top >= 0 && field.bottom <= bar.top + 1 };
      });
      assert.ok(Math.abs(up.gap) <= 1 && Math.abs(up.padLeft) <= 1 && up.fieldOk, `${where} → upright: ${JSON.stringify(up)}`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test("sideways: a bad entry still gets its message in the short answer bar", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  await page.locator("#f-feeds-mill-flutes").click();
  await page.waitForSelector(".numpad.open");
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(400);
  await page.locator('.numpad [data-key="bksp"]').dispatchEvent("pointerdown");
  await page.waitForTimeout(60);
  const msg = await page.evaluate(() => { const el = document.querySelector("#answerLbl"); return { text: el.textContent, shown: getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0 }; });
  assert.equal(msg.text, "Enter Flutes");
  assert.equal(msg.shown, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("bolt circle: no -0 in the table, and the drill program calls the tool before the length offset", async () => {
  const { page, ctx, errors } = await open("/calc/bolt-circle?holes=4&diameter=2&gcode=drill&tool=4", { pro: true });
  const cells = await page.locator(".extras table.chart tbody td").allTextContents();
  assert.equal(cells.filter((c) => c === "-0").length, 0);
  const code = await page.locator("pre.code").textContent();
  assert.ok(code.indexOf("G49") < code.indexOf("T4 M6") && code.indexOf("T4 M6") < code.indexOf("G43 H4 Z1.0"), code);
  assert.ok(!code.includes("G0 Z0.1"), "no drop to the R plane before the cycle");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// The header row once sat 57 px down inside the chart's box, over the first row (G00), and scrolled away.
test("charts: the header row sits above row 1 and stays pinned under the top bar while scrolling", async () => {
  for (const [w, h] of [[375, 812], [812, 375]]) {
    for (const id of ["gcode-ref", "drill-chart"]) {
      const { page, ctx, errors } = await open(`/calc/${id}`);
      await page.setViewportSize({ width: w, height: h });
      const where = `${id} ${w}x${h}`;
      const at = () => page.evaluate(() => {
        const th = document.querySelector("table.chart thead th").getBoundingClientRect();
        const row1 = document.querySelector("#cbody tr").getBoundingClientRect();
        const bar = document.querySelector(".topbar");
        const pinnedAt = getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().bottom : 0;
        return { thTop: th.top, thBottom: th.bottom, row1Top: row1.top, pinnedAt };
      });
      const top = await at();
      assert.ok(Math.abs(top.thBottom - top.row1Top) <= 1, `${where}: header ends where row 1 starts (${top.thBottom} vs ${top.row1Top})`);
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(100);
      const scrolled = await at();
      assert.ok(Math.abs(scrolled.thTop - scrolled.pinnedAt) <= 1, `${where}: header pinned at ${scrolled.pinnedAt}, found at ${scrolled.thTop}`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

// At 375 px the bolt chart's Close / Normal / Loose drill columns were cut off with no way to reach them.
test("charts too wide for the phone stack into cards, and nothing is cut off", async () => {
  for (const w of [375, 320]) {
    const { page, ctx, errors } = await open("/calc/shcs?q=1%2F4");
    await page.setViewportSize({ width: w, height: 812 });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const wrap = document.querySelector(".table-wrap"), table = wrap.querySelector("table");
      const first = document.querySelector("#cbody tr");
      const cells = [...first.querySelectorAll("td")].map((td) => { const r = td.getBoundingClientRect(); return { label: td.dataset.label, text: td.textContent, inside: r.right <= wrap.getBoundingClientRect().right + 1 && r.left >= wrap.getBoundingClientRect().left - 1 }; });
      return { stacked: wrap.classList.contains("stack"), fits: table.scrollWidth <= wrap.clientWidth + 1, cells };
    });
    assert.equal(info.stacked, true, `${w}px: the 7-column chart stacks`);
    assert.equal(info.fits, true, `${w}px: nothing runs past the box`);
    assert.equal(info.cells[0].text, "1/4 SHCS", "typing 1/4 puts the 1/4 bolt first");
    for (const c of info.cells) assert.ok(c.inside, `${w}px: ${c.label} "${c.text}" is on screen`);
    assert.deepEqual(info.cells.slice(4).map((c) => c.label), ["Close fit", "Normal", "Loose"]);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // a chart that fits stays a table: the drill chart, even at 320 px
  const { page, ctx, errors } = await open("/calc/drill-chart");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.querySelector(".table-wrap").classList.contains("stack")), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// A sideloaded test build can't buy Pro, so it gets a switch. (127.0.0.1 counts as a test build; the
// Play Store version and the public web copy never show it — see tests/calcs/build.test.mjs.)
test("test build: Pro can be switched on and off without a purchase", async () => {
  const { page, ctx, errors } = await open("/calc/chamfer");
  assert.equal(await page.locator(".lock").count(), 1, "Pro tool starts locked");
  // the Pro screen, where a locked tool sends you, offers it
  await page.evaluate(() => { location.hash = "#/pro"; });
  await page.locator("#testPro").click();
  await page.waitForFunction(() => document.querySelector("main button[disabled]")?.textContent === "Pro unlocked");
  await page.evaluate(() => { location.hash = "#/calc/chamfer"; });
  await page.waitForFunction(() => document.querySelector("#answerVal")?.textContent === "0.25");
  assert.equal(await page.locator(".lock").count(), 0, "unlocked");
  // and Settings turns it back off
  await page.evaluate(() => { location.hash = "#/settings"; });
  const sw = page.locator('[data-set="testpro"]');
  await sw.waitFor();
  assert.equal(await sw.getAttribute("aria-checked"), "true");
  assert.match(await page.locator("#proRow").textContent(), /Pro is unlocked/);
  await sw.click();
  assert.match(await page.locator("#proRow").textContent(), /Chipload Pro/);
  await page.evaluate(() => { location.hash = "#/calc/chamfer"; });
  await page.locator(".lock").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

// "Typed the stock thickness, hit Next, nothing happens": Next aimed at a field folded inside the closed
// More options drawer. tests/critic/walkthrough.mjs walks every tool in every mode; this pins the case he hit.
test("Next skips fields folded away in More options, and closes the pad after the last one on screen", async () => {
  const { page, ctx, errors } = await open("/calc/saw-speed");
  await page.locator("#f-saw-speed-thickness").click();
  await page.waitForSelector(".numpad.open");
  const tap = async (k) => { const b = page.locator(`.numpad [data-key="${k}"]`); await b.dispatchEvent("pointerdown"); await b.dispatchEvent("pointerup"); };
  await tap("next");
  assert.equal(await page.evaluate(() => document.querySelector(".numpad").classList.contains("open")), false, "pad put away");
  // with More options open, Next walks into it
  await page.locator("details.more > summary").click();
  await page.locator("#f-saw-speed-thickness").click();
  await tap("next");
  assert.equal(await page.evaluate(() => document.activeElement.id), "f-saw-speed-wheel");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("hold backspace clears the field it was held on, and only that field", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  const bksp = page.locator('.numpad [data-key="bksp"]');
  await page.locator("#f-feeds-mill-diameter").click();
  await bksp.dispatchEvent("pointerdown");
  await page.waitForTimeout(700);
  await bksp.dispatchEvent("pointerup");
  assert.equal(await page.locator("#f-feeds-mill-diameter").inputValue(), "", "held: cleared");
  // a press that is never let go must not wipe a different field later
  await page.locator('.numpad [data-key="5"]').dispatchEvent("pointerdown");
  await bksp.dispatchEvent("pointerdown"); // no pointerup
  await page.locator("#f-feeds-mill-flutes").click();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#f-feeds-mill-flutes").inputValue(), "4", "the other field is untouched");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Brennan's phone: the job sheet's last line sat under the answer bar and couldn't be scrolled into view.
// The bar is taller than any fixed guess on a phone with a gesture bar or in glove mode; the page now
// saves the bar's measured height. (tests/critic/walkthrough.mjs checks every screen this way.)
test("the last line of a tool scrolls clear of the answer bar on a phone with a gesture bar, and in glove mode", async () => {
  for (const [w, h, glove] of [[412, 915, false], [375, 812, true]]) {
    const { page, ctx, errors } = await open("/calc/job-sheet");
    await page.setViewportSize({ width: w, height: h });
    if (glove) await page.locator("#gloveBtn").click();
    const r = await page.evaluate(async () => {
      document.documentElement.style.setProperty("--inset-bottom", "24px"); // stands in for Android's gesture bar
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      window.scrollTo(0, document.documentElement.scrollHeight);
      const note = document.querySelector(".calc > .note").getBoundingClientRect();
      return { noteBottom: note.bottom, barTop: document.querySelector(".answer").getBoundingClientRect().top };
    });
    assert.ok(r.noteBottom <= r.barTop, `${w}x${h}${glove ? " glove" : ""}: last line ends at ${r.noteBottom}, bar starts at ${r.barTop}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

// ── Fixes from the 10/02/2026 double-check (ui team) ─────────────────────────────────────────────

const setPro = (page, on) => page.evaluate(async (on) => { const s = await import("./src/app/settings.js"); s.setSetting("pro", on); }, on);

test("Pro landing while a locked screen is open unlocks that screen, and Home drops its PRO tags", async () => {
  const { page, ctx, errors } = await open("/calc/chamfer");
  assert.equal(await page.locator("#answerVal").textContent(), "Pro");
  await setPro(page, true); // what billing.js does when Play approves a purchase
  await page.waitForFunction(() => document.querySelector("#answerVal")?.textContent === "0.25");
  assert.equal(await page.locator(".lock").count(), 0, "the lock card is gone without leaving the screen");
  // Home: the chamfer chip (a Pro tool in recents) is tagged for a free user, and loses the tag live
  await setPro(page, false);
  await page.evaluate(() => { location.hash = "#/"; });
  const chip = page.locator('#favs .chip[data-calc="chamfer"]');
  await chip.waitFor();
  assert.equal(await chip.locator(".pro-tag").count(), 1, "Pro chip carries the PRO tag");
  await setPro(page, true);
  await page.waitForFunction(() => !document.querySelector('#favs .chip[data-calc="chamfer"] .pro-tag'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a locked Pro tool shows no part of its answer: no Recent drawer, no auto numbers, a fixed label", async () => {
  const { page, ctx, errors } = await open("/calc/lathe-feeds", { pro: true });
  await page.waitForTimeout(1200); // long enough for Recent to save this answer
  await setPro(page, false);
  await page.locator(".lock").waitFor();
  const s = await page.evaluate(() => ({
    drawers: [...document.querySelectorAll("details.drawer summary")].map((x) => x.textContent),
    placeholders: [...document.querySelectorAll("main input.input")].map((x) => x.placeholder).filter((p) => /auto/.test(p)),
    lbl: document.querySelector("#answerLbl").textContent,
  }));
  assert.ok(!s.drawers.some((d) => /Recent/.test(d)), `no Recent drawer: ${s.drawers}`);
  assert.ok(s.placeholders.length && s.placeholders.every((p) => p === "auto"), `auto without a number: ${s.placeholders}`);
  assert.equal(s.lbl, "Unlock Pro to see the answer");
  await page.evaluate(() => { location.hash = "#/calc/true-position"; });
  await page.locator(".lock").waitFor();
  assert.doesNotMatch(await page.locator("#answerLbl").textContent(), /OUT|in tolerance/i, "pass/fail stays locked");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("without Pro, a machine saved in Shop no longer clamps the free tools", async () => {
  const { page, ctx, errors } = await open("/");
  await page.evaluate(() => {
    localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m1", name: "Slow mill", type: "mill", maxRpm: 2000, maxFeed: 30, controller: "other", units: "in" }]));
    localStorage.setItem("chipload.blob.activeMachine", JSON.stringify("m1"));
  });
  await page.goto(`${BASE}?e2e=noclamp#/calc/feeds-mill?diameter=0.25&sfm=800`);
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".warn", { hasText: "tops out" }).count(), 0, "no machine warning");
  assert.notEqual(await page.locator("#answerVal").textContent(), "", "answer shows");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the Pro button shows no made-up price before Play answers", async () => {
  const { page, ctx, errors } = await open("/pro");
  const buy = await page.locator("#buy").textContent();
  assert.doesNotMatch(buy, /\$|€|£/, `no hard-coded price: "${buy}"`);
  assert.match(buy, /Unlock Pro/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("home search: '8.5 mm' opens the converter in mm, '1 1/4 npt' opens the 1-1/4 pipe size", async () => {
  const { page, ctx, errors } = await open("/");
  await page.fill("#q", "8.5 mm");
  await page.press("#q", "Enter");
  await page.waitForURL(/#\/calc\/fraction-converter/);
  assert.match(page.url(), /units=mm/);
  assert.equal(await page.locator('.seg [data-v="mm"]').getAttribute("aria-pressed"), "true");
  await page.evaluate(() => { location.hash = "#/"; });
  await page.fill("#q", "1 1/4 npt");
  // ASME B1.20.1: 1-1/4 NPT is 1-1/4-11.5 — never the 1 in size
  assert.match(await page.locator("#results [data-calc]").first().getAttribute("data-params"), /1-1\/4-11\.5/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("G-code reference: M6 finds M06 Tool change first", async () => {
  const { page, ctx, errors } = await open("/calc/gcode-ref?q=M6");
  const row = page.locator("#cbody tr").first();
  assert.match(await row.textContent(), /M06/);
  assert.equal(await row.getAttribute("class"), "hit");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the answer bar never cuts the answer short, glove mode included", async () => {
  // tap drill for 1/4-20 is #7 (ASME B1.1 / Machinery's Handbook tap drill table); fits and tol-stack are long ranges
  for (const [w, glove] of [[375, true], [320, true], [320, false]]) {
    for (const id of ["tap-drill", "fits", "tol-stack", "drill-point"]) {
      const { page, ctx, errors } = await open(`/calc/${id}`, { pro: true });
      await page.setViewportSize({ width: w, height: 740 });
      if (glove) await page.locator("#gloveBtn").click();
      await page.waitForTimeout(150);
      const v = await page.evaluate(() => { const el = document.querySelector("#answerVal"); return { text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth, right: el.getBoundingClientRect().right, vw: innerWidth }; });
      assert.ok(v.text && v.sw <= v.cw + 1 && v.right <= v.vw, `${id} ${w}px${glove ? " glove" : ""}: "${v.text}" shows ${v.cw} of ${v.sw} px`);
      if (id === "tap-drill") assert.equal(v.text, "#7");
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test("320 px glove: a number is never split across lines — it takes the whole row instead", async () => {
  // "-1.150" over "2" read as -1.150, not -1.1502 (drill point); "0.0020" over "8" for 0.00208 (thermal)
  for (const units of ["in", "mm"]) {
    for (const id of ["drill-point", "thermal", "fits", "thread-metric"]) {
      const { page, ctx, errors } = await open("/");
      await page.evaluate((units) => localStorage.setItem("chipload.settings.v1", JSON.stringify({ units, theme: "dark", glove: true, pro: true, places: 4 })), units);
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(`${BASE}?e2e=wide-${units}#/calc/${id}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const el = document.querySelector("#answerVal"), box = (s) => document.querySelector(s).getBoundingClientRect();
        // each piece ("-1.1502", "0.0003 –") on one line: its line boxes share one top
        const split = [...el.querySelectorAll(".nw")].filter((s) => new Set([...s.getClientRects()].map((q) => Math.round(q.top))).size > 1).map((s) => s.textContent);
        const val = box("#answerVal"), more = box("#answerMore");
        return { text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth, split, fontPx: parseFloat(getComputedStyle(el).fontSize),
          overlap: more.left < val.right && more.top < val.bottom && more.bottom > val.top, moreRight: more.right, vw: innerWidth };
      });
      const where = `${id} ${units} 320px glove "${r.text}"`;
      assert.ok(r.text, `${where}: shows an answer`);
      assert.deepEqual(r.split, [], `${where}: no number broken across lines`);
      assert.ok(r.sw <= r.cw + 1, `${where}: shows ${r.cw} of ${r.sw} px`);
      assert.ok(r.fontPx >= 16, `${where}: readable (${r.fontPx} px)`);
      assert.ok(!r.overlap && r.moreRight <= r.vw, `${where}: the buttons stay clear of the number and on screen`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  }
});

test("320 px glove: a long unit ('(0.4844 in)', 'mm/min') never runs under the copy button", async () => {
  for (const [id, units] of [["ream", "in"], ["npt", "in"], ["sti", "in"], ["feeds-mill", "mm"]]) {
    const { page, ctx, errors } = await open("/");
    await page.evaluate((units) => localStorage.setItem("chipload.settings.v1", JSON.stringify({ units, theme: "dark", glove: true, pro: true, places: 4 })), units);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`${BASE}?e2e=unit-${units}#/calc/${id}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const u = box("#answerUnit"), c = box("#answerCopy"), v = box("#answerVal");
      const hits = (b) => b.right > c.left + 0.5 && b.left < c.right && b.bottom > c.top && b.top < c.bottom;
      return { unit: document.querySelector("#answerUnit").textContent, unitHit: hits(u), valHit: hits(v), fontPx: parseFloat(getComputedStyle(document.querySelector("#answerVal")).fontSize) };
    });
    assert.ok(r.unit, `${id} ${units}: shows its unit`);
    assert.ok(!r.unitHit && !r.valHit, `${id} ${units}: "${r.unit}" stays clear of the copy button`);
    assert.ok(r.fontPx >= 16, `${id} ${units}: readable (${r.fontPx} px)`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("320 x 568 glove, pad open: the field being typed in shows whole above a three-row answer bar", async () => {
  // fits / drill-point / thermal answers take the whole row at 320 px glove; with the pad up the bar drops its label
  for (const [id, field, units] of [["fits", "nominal", "in"], ["drill-point", "diameter", "in"], ["thermal", "length", "in"], ["feeds-mill", "diameter", "mm"]]) {
    const { page, ctx, errors } = await open("/");
    await page.evaluate((units) => localStorage.setItem("chipload.settings.v1", JSON.stringify({ units, theme: "dark", glove: true, pro: true, places: 4 })), units);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${BASE}?e2e=pad-${units}#/calc/${id}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(150);
    await page.locator(`#f-${id}-${field}`).click();
    await page.waitForSelector(".numpad.open");
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const f = document.querySelector('[data-active="true"]').getBoundingClientRect();
      const bar = document.querySelector(".answer"), top = document.querySelector(".topbar");
      const topBottom = getComputedStyle(top).position === "sticky" ? top.getBoundingClientRect().bottom : 0;
      return { wide: bar.classList.contains("wide"), fTop: f.top, fBottom: f.bottom, barTop: bar.getBoundingClientRect().top, topBottom: Math.max(0, topBottom) };
    });
    assert.ok(r.wide, `${id} ${units}: the answer takes the whole row at 320 px glove`);
    assert.ok(r.fTop >= r.topBottom - 1 && r.fBottom <= r.barTop + 1, `${id} ${units}: field ${r.fTop}–${r.fBottom} between ${r.topBottom} and ${r.barTop}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test("pad open on a short phone with a nav bar: the field being typed in stays in view", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill");
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator("#gloveBtn").click();
  await page.evaluate(() => document.documentElement.style.setProperty("--inset-bottom", "48px")); // 3-button nav bar
  await page.locator("#f-feeds-mill-diameter").click();
  await page.waitForSelector(".numpad.open");
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const field = document.querySelector('[data-active="true"]').getBoundingClientRect();
    const bar = document.querySelector(".answer"), top = document.querySelector(".topbar").getBoundingClientRect();
    return { pad: getComputedStyle(bar).paddingBottom, fTop: field.top, fBottom: field.bottom, barTop: bar.getBoundingClientRect().top, topBottom: Math.max(0, top.bottom) };
  });
  assert.equal(r.pad, "10px", "the pad pads for the nav bar; the answer bar on it doesn't again");
  assert.ok(r.fTop >= r.topBottom - 1 && r.fBottom <= r.barTop + 1, `field ${r.fTop}–${r.fBottom} between ${r.topBottom} and ${r.barTop}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("sideways: controls stay clear of a camera cutout or side nav bar, and the ⋯ menu fits in glove mode", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill", { pro: true });
  await page.setViewportSize({ width: 640, height: 320 });
  await page.locator("#gloveBtn").click();
  await page.locator("#answerMore").click();
  const m = await page.evaluate(() => { const r = document.querySelector(".menu").getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  assert.ok(m.top >= 0, `menu top ${m.top} is on screen`);
  await page.locator('.menu [data-act="reset"]').scrollIntoViewIfNeeded();
  await page.locator('.menu [data-act="job"]').scrollIntoViewIfNeeded();
  const job = await page.evaluate(() => { const r = document.querySelector('.menu [data-act="job"]').getBoundingClientRect(); return { top: r.top, h: r.height }; });
  assert.ok(job.top >= 0 && job.h >= 56, `Save job is reachable: ${JSON.stringify(job)}`);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 100);
  // a 48 px inset on each side (Chromium's safe-area emulation stands in for the phone)
  const cdp = await ctx.newCDPSession(page);
  let emulated = true;
  try { await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { left: 48, right: 48 } }); } catch { emulated = false; }
  if (emulated) {
    await page.setViewportSize({ width: 780, height: 360 });
    await page.waitForTimeout(200);
    const b = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { back: r("#back").left, val: r("#answerVal").left, glove: r("#gloveBtn").right, more: r("#answerMore").right, vw: innerWidth };
    });
    assert.ok(b.back >= 48 && b.val >= 48, `left side clear: ${JSON.stringify(b)}`);
    assert.ok(b.glove <= b.vw - 48 && b.more <= b.vw - 48, `right side clear: ${JSON.stringify(b)}`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Back stays in the app: past a bad link, and from a shared link opened in a used tab", async () => {
  const { page, ctx, errors } = await open("/");
  await page.evaluate(() => { location.hash = "#/calc/feeds-mill"; });
  await page.waitForURL(/feeds-mill/);
  await page.evaluate(() => { location.hash = "#/bogus"; });
  await page.waitForFunction(() => location.hash === "#/");
  await page.goBack();
  await page.waitForURL(/feeds-mill/); // the bad link was replaced, not stacked on top
  // a shared link opened in a tab that already showed another page
  await page.goto(`${BASE}assets/icons/app-192.png`);
  await page.goto(`${BASE}?e2e=shared#/calc/tap-drill`);
  await page.waitForLoadState("networkidle");
  await page.locator("#back").click();
  await page.waitForFunction(() => location.hash === "#/" && document.querySelector("#title")?.textContent === "Chipload");
  assert.ok(page.url().startsWith(BASE), "still in Chipload");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("job sheet: a field added with 'add one more number' stays through an inch/mm switch", async () => {
  const { page, ctx, errors } = await open("/calc/job-sheet");
  await page.locator(".help [data-gotit]").click();
  await page.locator('.next-item[data-focus="woc"]').click();
  await page.waitForSelector("#f-job-sheet-woc", { state: "visible" });
  await page.mouse.click(5, 100); // put the pad away
  await page.locator('.calc > .seg [data-u="mm"]').click();
  await page.waitForTimeout(100);
  assert.ok(await page.locator("#f-job-sheet-woc").isVisible(), "still shown in mm");
  await page.locator('.calc > .seg [data-u="in"]').click();
  assert.ok(await page.locator("#f-job-sheet-woc").isVisible(), "and back in inch");
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ── app team fixes, round 3 (10/02/2026) ──

test("the Pro hint follows what Play has said: connecting, a price, or an error — never 'can't reach' next to a price", async () => {
  // still connecting: a neutral line, and Unlock says so instead of blaming the connection
  let { page, ctx, errors } = await openWithStore({ connecting: true }, "connecting");
  assert.equal(await page.locator("#proHint").textContent(), "Checking Google Play…");
  await page.locator("#buy").click();
  await page.waitForFunction(() => !!document.querySelector(".copied"));
  assert.equal(await toastText(page), "Still connecting to Google Play — try again in a moment");
  assert.deepEqual(errors, []);
  await ctx.close();
  // the price lands while initialize still waits on the purchase list (cordova-plugin-purchase fires productUpdated first)
  ({ page, ctx, errors } = await openWithStore({ priceFirst: true }, "price-first"));
  await page.waitForFunction(() => /\$9\.99/.test(document.querySelector("#buy")?.textContent || ""));
  assert.match(await page.locator("#proHint").textContent(), /^One-time purchase through Google Play/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Pro turning on keeps what was typed on a tool opened from a link", async () => {
  const { page, ctx, errors } = await open("/calc/feeds-mill?diameter=0.5");
  const dia = page.locator("#f-feeds-mill-diameter");
  assert.equal(await dia.inputValue(), "0.5");
  await dia.click();
  await page.waitForSelector(".numpad.open");
  for (let i = 0; i < 8; i++) await page.locator('.numpad [data-key="bksp"]').dispatchEvent("pointerdown");
  for (const k of ["0", ".", "7", "5"]) await page.locator(`.numpad [data-key="${k}"]`).dispatchEvent("pointerdown");
  assert.equal(await dia.inputValue(), "0.75");
  await dia.evaluate((el) => { el.dataset.before = "1"; });
  await setPro(page, true); // what billing.js unlock() does when Play approves or restores a purchase
  assert.equal(await page.locator("#f-feeds-mill-diameter[data-before]").count(), 0, "the screen was drawn again");
  assert.equal(await page.locator("#f-feeds-mill-diameter").inputValue(), "0.75", "the link's 0.5 must not come back");
  await setPro(page, false); // a refund revoke redraws too
  assert.equal(await page.locator("#f-feeds-mill-diameter").inputValue(), "0.75");
  // a chart keeps the filter as it reads now, not the link's
  await page.evaluate(() => { location.hash = "#/calc/drill-chart?q=1/4"; });
  await page.locator("#cq").waitFor();
  await page.locator("#cq").fill("#7");
  await setPro(page, true);
  assert.equal(await page.locator("#cq").inputValue(), "#7");
  assert.deepEqual(errors, []);
  await ctx.close();
});
