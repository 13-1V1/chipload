// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Play Store phone screenshots (1080 × 2340, 9:19.5) with a caption band on top.
// Needs the dev server: node tests/serve.mjs --port=4173   then: node scripts/screenshots.mjs

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.BASE || "http://127.0.0.1:4173/";
const out = resolve(import.meta.dirname, "../assets/brand/screenshots");
mkdirSync(out, { recursive: true });

const shots = [
  { file: "01-home", path: "/", caption: "Ask in plain English. Or just type the number.", pro: true, noFavs: true },
  { file: "02-feeds", path: "/calc/feeds-mill?diameter=0.5&flutes=4&material=al6061", caption: "Speeds & feeds that respect your machine.", pro: true, machine: true },
  { file: "03-tapdrill", path: "/calc/tap-drill?thread=3%2F8-16", caption: "Type a thread. Get the drill.", pro: true },
  { file: "04-numpad", path: "/calc/right-triangle", caption: "Fraction keys. Glove mode. No phone keyboard.", pro: true, focus: "#f-right-triangle-a", glove: true },
  { file: "05-explain", path: "/calc/feeds-drill", caption: "Every answer shows its math and its source.", pro: true, openDrawer: true },
  { file: "06-boltcircle", path: "/calc/bolt-circle?gcode=drill", caption: "Bolt circles with G81/G83, CSV and DXF.", pro: true, scroll: 700 },
  { file: "07-threads", path: "/calc/thread-metric?thread=M10", caption: "UN, metric, NPT, ACME — with class limits.", pro: true, scroll: 500 },
  { file: "08-jobsheet", path: "/calc/job-sheet?op=mill&material=s4140&diameter=0.5&flutes=4&woc=0.1&doc=0.25&length=12&stock=1&qty=25", caption: "Plug in what you know. It figures the rest.", pro: true, machine: true, active: "m1", scrollSel: ".stats" },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2.62, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(({ pro, machine, glove, noFavs, active }) => {
    localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "in", theme: "dark", glove: !!glove, pro, places: 4 }));
    if (!noFavs) {
      localStorage.setItem("chipload.favorites", JSON.stringify(["feeds-mill", "tap-drill", "bolt-circle"]));
      localStorage.setItem("chipload.recents", JSON.stringify(["right-triangle", "thread-data"]));
    }
    // store shots show the tools themselves, not the first-run cards
    localStorage.setItem("chipload.blob.introSeen", "true");
    localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "in", theme: "dark", glove: !!glove, pro, places: 4, tips: false }));
    if (machine) {
      localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m1", name: "Haas VF-2", type: "mill", maxRpm: 8100, maxFeed: 650, controller: "haas", units: "in" }, { id: "m2", name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, controller: "other", units: "in" }]));
      localStorage.setItem("chipload.blob.activeMachine", JSON.stringify(active || "m2"));
      localStorage.setItem("chipload.blob.tools", JSON.stringify([{ id: "t1", name: '1/2" 4FL carbide AlTiN', kind: "endmill", diameter: 0.5, flutes: 4, toolType: "coated", note: "1.25 LOC", units: "in" }, { id: "t2", name: "#7 cobalt drill", kind: "drill", diameter: 0.201, flutes: 2, toolType: "hss", note: "", units: "in" }]));
      localStorage.setItem("chipload.blob.jobs", JSON.stringify([{ id: "j1", at: Date.now() - 86400000, calcId: "bolt-circle", name: "Pump flange · 8 holes", raw: { diameter: "6.5", holes: "8" }, units: "in", primary: "X3.25 Y0" }]));
    }
  }, s);
  await page.goto(`${BASE}?shot=${s.file}#${s.path}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
  if (s.focus) { await page.locator(s.focus).click(); await page.waitForTimeout(300); }
  if (s.openDrawer) { await page.locator("details.drawer summary").first().click(); await page.waitForTimeout(200); }
  if (s.scroll) { await page.evaluate((y) => window.scrollTo(0, y), s.scroll); await page.waitForTimeout(200); }
  if (s.scrollSel) { await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 190); }, s.scrollSel); await page.waitForTimeout(200); }
  // caption band: overlay inside the page so it ends up in the same PNG
  await page.evaluate((caption) => {
    const band = document.createElement("div");
    band.id = "shotBand";
    band.textContent = caption;
    band.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:99;padding:22px 20px 18px;background:#2F6FEB;color:#fff;font:600 24px/1.2 'IBM Plex Sans',system-ui,sans-serif;letter-spacing:.01em;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,.35)";
    document.body.append(band);
    document.querySelector(".topbar").style.marginTop = band.offsetHeight + "px";
  }, s.caption);
  const png = await page.screenshot({ fullPage: false });
  writeFileSync(resolve(out, `${s.file}.png`), png);
  console.log("wrote", s.file, png.length);
  await ctx.close();
}
await browser.close();
