// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Browser tests with Playwright Chromium at phone size. Run with: npm run test:e2e
// Starts the static server itself. Fails on any console error.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { resolve } from "node:path";

const PORT = 4199;
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
