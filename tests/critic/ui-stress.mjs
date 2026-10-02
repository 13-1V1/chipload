// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Critic harness: real-browser stress at phone sizes. Prints a JSON report.
// Run: node tests/critic/ui-stress.mjs   (starts its own static server)

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { resolve } from "node:path";

const PORT = 4188, BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, [resolve(import.meta.dirname, "../serve.mjs"), `--port=${PORT}`], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
// A crash must not leave the browser or the server running, and must say which step died.
let step = "start";
const mark = (name) => { step = name; process.stderr.write(`[ui-stress] ${name}
`); };
const bail = async (e) => { console.error(`[ui-stress] died during: ${step}`); console.error(e); console.log(JSON.stringify({ crashed: step, ...report }, null, 1)); try { await browser.close(); } catch { /* already gone */ } server.kill(); process.exit(2); };
process.on("uncaughtException", bail);
process.on("unhandledRejection", bail);
const report = { overflow: [], mountMs: {}, consoleErrors: [], unitToggle: [], roundTrip: [], numpad: {}, corruptStorage: [], xss: {}, touchTargets: [], contrast: [], leak: {}, perf: {}, history: {}, misc: [] };

async function ctxFor({ w = 375, h = 812, glove = false, pro = true, theme = "dark", tips = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error") report.consoleErrors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(BASE);
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("chipload.settings.v1", JSON.stringify(s)); localStorage.setItem("chipload.blob.introSeen", "true"); }, { units: "in", theme, glove, pro, places: 4, tips });
  return { ctx, page };
}
const go = async (page, path, tag = "") => { await page.goto(`${BASE}?s=${encodeURIComponent(tag + path)}#${path}`, { waitUntil: "load" }); await page.waitForTimeout(25); };

// calculator ids
const { ctx: c0, page: p0 } = await ctxFor();
await go(p0, "/");
const ids = await p0.evaluate(async () => { const { allCalcs } = await import("./src/app/registry.js"); return allCalcs().map((d) => ({ id: d.id, view: d.view || "calc", units: d.units !== false })); });
await c0.close();

mark("1. Overflow + mount time on every tool at 4 configurations");
// ── 1. Overflow + mount time on every tool at 4 configurations ──
for (const cfg of [{ w: 375, h: 812, glove: false }, { w: 320, h: 568, glove: false }, { w: 375, h: 812, glove: true }, { w: 320, h: 568, glove: true }]) {
  const { ctx, page } = await ctxFor(cfg);
  for (const { id } of ids) {
    const t0 = Date.now();
    await go(page, `/calc/${id}`, `${cfg.w}${cfg.glove ? "g" : ""}`);
    const ms = Date.now() - t0;
    if (cfg.w === 375 && !cfg.glove) report.mountMs[id] = ms;
    const o = await page.evaluate(() => {
      const vw = window.innerWidth;
      const over = document.documentElement.scrollWidth - vw;
      const bad = [];
      for (const el of document.querySelectorAll("main *, .answer *, .topbar *")) {
        if (el.closest("pre, .table-wrap, details:not([open]) > :not(summary)")) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 || r.left < -1) bad.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} right=${Math.round(r.right)}`);
      }
      // text clipped inside segmented buttons
      const clipped = [...document.querySelectorAll(".seg button")].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent.trim());
      return { over, bad: [...new Set(bad)].slice(0, 4), clipped: clipped.slice(0, 4) };
    });
    if (o.over > 1 || o.bad.length || o.clipped.length) report.overflow.push({ cfg: `${cfg.w}x${cfg.h}${cfg.glove ? " glove" : ""}`, id, ...o });
  }
  await ctx.close();
}

mark("2. Unit toggle semantics: a typed surface speed must mean the same cut after switching to mm");
// ── 2. Unit toggle semantics: a typed surface speed must mean the same cut after switching to mm ──
{
  const { ctx, page } = await ctxFor();
  const cases = [
    { id: "feeds-mill", set: { sfm: "800" }, stat: /Spindle/ },
    { id: "feeds-drill", set: { sfm: "100" }, stat: /Spindle/ },
    { id: "lathe-feeds", set: { sfm: "400" }, stat: null },
    { id: "bolt-circle", set: { gcode: "drill", feed: "5" }, same: "code" },
    { id: "cut-time", set: { feed: "40", length: "12" }, stat: /Per pass/ },
    { id: "circle-interp", set: { feed: "40" }, stat: /Ratio/ },
    { id: "surface-finish", set: { ipr: "0.005" }, stat: null, same: "ra" },
    { id: "lathe-cycle", set: { sfm: "400", ipr: "0.010" }, stat: /Per pass/ },
    { id: "thermal", set: { from: "68", to: "100", length: "10" }, stat: /Final size/, same: "length" },
    { id: "chip-thinning", set: { sfm: "600" }, stat: /Spindle/ },
  ];
  for (const cse of cases) {
    const q = new URLSearchParams(cse.set).toString();
    await go(page, `/calc/${cse.id}?${q}`, "ut");
    const read = () => page.evaluate((src) => {
      const primary = `${document.querySelector("#answerVal")?.textContent} ${document.querySelector("#answerUnit")?.textContent}`.trim();
      let stat = null;
      if (src) { const re = new RegExp(src); const el = [...document.querySelectorAll(".stat")].find((s) => re.test(s.querySelector(".l").textContent)); stat = el ? el.querySelector(".v").textContent : null; }
      const code = document.querySelector("pre.code")?.textContent || "";
      return { primary, stat, code };
    }, cse.stat ? cse.stat.source : null);
    const before = await read();
    const mmBtn = page.locator('.calc > .seg [data-u="mm"]');
    if (!(await mmBtn.count())) { report.unitToggle.push({ id: cse.id, note: "no unit toggle" }); continue; }
    await mmBtn.click(); await page.waitForTimeout(150);
    const inMm = await read();
    await page.locator('.calc > .seg [data-u="in"]').click(); await page.waitForTimeout(150);
    const back = await read();
    const num = (t) => parseFloat(String(t ?? "").replace(/[^0-9.\-]/g, ""));
    // quantities that must not change when only the unit system changes: RPM, seconds, ratios
    const invariant = cse.stat ? [before.stat, inMm.stat] : [before.primary, inMm.primary];
    // Ra reads µin on an inch screen, µm on a metric one (1 µin = 0.0254 µm). Allow the two displays' rounding
    // (whole µin, 0.01 µm) and 1%: the metric screen figures the same insert at its ISO 1832 radius (0.8 mm for
    // the 1/32" chip, 0.794 mm), and Ra goes as 1/r.
    const sameRa = () => { const a = num(before.primary), b = num(inMm.primary) / 0.0254; return Math.abs(a - b) <= 0.5 + 0.005 / 0.0254 + a * 0.01; };
    const sameCut = cse.same === "length" ? Math.abs(num(inMm.stat) / 25.4 - num(before.stat)) < 0.001
      : cse.same === "ra" ? sameRa()
      : cse.same === "code" ? /F127\.0/.test(inMm.code)
      : Math.abs(num(invariant[0]) - num(invariant[1])) <= Math.max(1, Math.abs(num(invariant[0])) * 0.005);
    report.unitToggle.push({ id: cse.id, inch: before.primary, inchStat: before.stat, mm: inMm.primary, mmStat: inMm.stat, backToInch: back.primary, roundTripOk: back.primary === before.primary && back.stat === before.stat, sameCut });
  }
  // generic round trip on every unit-aware calculator with defaults
  for (const { id, view, units } of ids) {
    if (view !== "calc" || !units) continue;
    await go(page, `/calc/${id}`, "rt");
    const mmBtn = page.locator('.calc > .seg [data-u="mm"]');
    if (!(await mmBtn.count())) continue;
    const a = await page.evaluate(() => `${document.querySelector("#answerVal")?.textContent} ${document.querySelector("#answerUnit")?.textContent}`);
    await mmBtn.click(); await page.waitForTimeout(80);
    const m = await page.evaluate(() => `${document.querySelector("#answerVal")?.textContent} ${document.querySelector("#answerUnit")?.textContent}`);
    await page.locator('.calc > .seg [data-u="in"]').click(); await page.waitForTimeout(80);
    const b = await page.evaluate(() => `${document.querySelector("#answerVal")?.textContent} ${document.querySelector("#answerUnit")?.textContent}`);
    if (a !== b || /NaN|undefined/.test(m)) report.roundTrip.push({ id, before: a, mm: m, after: b });
  }
  await ctx.close();
}

mark("3. Number pad torture");
// ── 3. Number pad torture ──
{
  const { ctx, page } = await ctxFor();
  await go(page, "/calc/right-triangle", "np");
  const field = page.locator("#f-right-triangle-a");
  await field.click(); await page.waitForSelector(".numpad.open");
  const press = async (keys) => { for (const k of keys) await page.locator(`.numpad [data-key="${k}"]`).dispatchEvent("pointerdown"); };
  await press(Array(6).fill("bksp"));
  await press([".", ".", "5", ".", "/", "/", "2", "sp", "sp", "pm", "pm", "pm", "/", "3"]);
  report.numpad.afterGarbage = await field.inputValue();
  report.numpad.answerAfterGarbage = await page.evaluate(() => document.querySelector("#answerLbl").textContent);
  await press(Array(12).fill("bksp")); await press(["1", "sp", "1", "/", "4"]);
  report.numpad.mixed = await field.inputValue();
  report.numpad.mixedAnswer = await page.evaluate(() => document.querySelector("#answerVal").textContent);
  // 200 rapid key presses
  const t0 = Date.now(); await press(Array(100).fill("7").concat(Array(100).fill("bksp"))); report.numpad.rapid200ms = Date.now() - t0;
  // rotate with the pad open
  await page.setViewportSize({ width: 812, height: 375 }); await page.waitForTimeout(800); // re-measure + smooth scroll back into view
  report.numpad.landscape = await page.evaluate(() => { const pad = document.querySelector(".numpad").getBoundingClientRect(); const ans = document.querySelector(".answer").getBoundingClientRect(); const act = document.querySelector('[data-active="true"]')?.getBoundingClientRect(); return { padTop: Math.round(pad.top), padH: Math.round(pad.height), answerTop: Math.round(ans.top), activeFieldBottom: act ? Math.round(act.bottom) : null, vh: innerHeight, fieldVisible: act ? act.bottom <= ans.top + 1 && act.top >= 0 : null }; });
  await ctx.close();
}
{
  // the pad and the phone keyboard must never be up together; a mouse click low on the screen must still open the pad
  const { ctx, page } = await ctxFor();
  const padOpen = () => page.evaluate(() => !!document.querySelector(".numpad")?.classList.contains("open"));
  await go(page, "/calc/tapping-feed", "np");
  await page.locator("#f-tapping-feed-rpm").click(); // sits in the bottom third: the pad slides up under the pointer
  report.numpad.opensOnLowField = await padOpen();
  await page.locator("#f-tapping-feed-thread").click();
  report.numpad.closesForTextField = !(await padOpen());
  await page.locator("#f-tapping-feed-rpm").click();
  await page.locator("#title").click();
  report.numpad.closesOnOutsideTap = !(await padOpen());
  await ctx.close();
}

mark("4. Corrupt storage: every key, several kinds of garbage");
// ── 4. Corrupt storage: every key, several kinds of garbage ──
{
  const keys = ["chipload.settings.v1", "chipload.favorites", "chipload.recents", "chipload.inputs.feeds-mill", "chipload.history.feeds-mill", "chipload.blob.machines", "chipload.blob.activeMachine", "chipload.blob.tools", "chipload.blob.jobs", "chipload.blob.helpSeen", "chipload.blob.introSeen", "chipload.blob.jobsOpen"];
  const garbage = ["{", "null", "[]", "{}", "123", '"str"', '{"values":null}', '[null,1,"x",{}]', "true", '{"a":{"b":[1,2,{"c":null}]}}', "\u0000￿"];
  const { ctx, page } = await ctxFor();
  for (const key of keys) for (const g of garbage) {
    await page.goto(BASE); await page.evaluate(([k, v]) => { localStorage.setItem(k, v); }, [key, g]);
    const before = report.consoleErrors.length;
    for (const path of ["/", "/calc/feeds-mill", "/shop", "/shop/tools", "/shop/jobs", "/settings"]) {
      await go(page, path, "cs");
      const blank = await page.evaluate(() => (document.querySelector("main > .view, main > .calc") || document.querySelector("main")).children.length === 0);
      if (blank) report.corruptStorage.push({ key, value: g, path, problem: "blank screen" });
    }
    if (report.consoleErrors.length > before) report.corruptStorage.push({ key, value: g, problem: report.consoleErrors.slice(before).join(" | ").slice(0, 220) });
    await page.evaluate((k) => localStorage.removeItem(k), key);
  }
  report.consoleErrors = []; // those were recorded under corruptStorage
  await ctx.close();
}

mark("5. XSS-shaped input everywhere text gets in");
// ── 5. XSS-shaped input everywhere text gets in ──
{
  const { ctx, page } = await ctxFor();
  const payload = `"><img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=99</script>`;
  await go(page, `/calc/tap-drill?thread=${encodeURIComponent(payload)}`, "x1");
  await go(page, `/calc/feeds-mill?diameter=${encodeURIComponent(payload)}&material=${encodeURIComponent(payload)}`, "x2");
  await go(page, `/calc/drill-chart?q=${encodeURIComponent(payload)}`, "x3");
  await go(page, `/calc/${encodeURIComponent(payload)}`, "x4");
  await go(page, "/", "x5"); await page.fill("#q", payload); await page.waitForTimeout(100);
  await page.evaluate((p) => {
    localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m", name: p, type: p, maxRpm: 100, maxFeed: 1, controller: p, units: "in" }]));
    localStorage.setItem("chipload.blob.activeMachine", JSON.stringify("m"));
    localStorage.setItem("chipload.blob.tools", JSON.stringify([{ id: "t", name: p, kind: "endmill", diameter: 0.5, flutes: 4, toolType: p, note: p, units: "in" }]));
    localStorage.setItem("chipload.blob.jobs", JSON.stringify([{ id: "j", at: Date.now(), calcId: "feeds-mill", name: p, raw: { diameter: p }, units: "in", primary: p }]));
    localStorage.setItem("chipload.history.feeds-mill", JSON.stringify([{ key: "k", label: p, primary: p, raw: { diameter: p }, units: "in", at: 1 }]));
    localStorage.setItem("chipload.favorites", JSON.stringify([p, "feeds-mill"]));
  }, payload);
  for (const path of ["/", "/shop", "/shop/tools", "/shop/jobs", "/calc/feeds-mill", "/calc/job-sheet"]) await go(page, path, "x6");
  await page.locator("details.drawer summary").last().click().catch(() => {});
  await page.waitForTimeout(200);
  report.xss = await page.evaluate(() => ({ executed: window.__xss ?? 0, injectedImg: document.querySelectorAll('img[src="x"]').length, injectedScript: [...document.querySelectorAll("script")].filter((s) => /__xss/.test(s.textContent)).length }));
  await ctx.close();
}

mark("6. Touch targets (the brief says ≥ 56 dp; Android minimum is 48) and contrast");
// ── 6. Touch targets (the brief says ≥ 56 dp; Android minimum is 48) and contrast ──
{
  const { ctx, page } = await ctxFor({ tips: true });
  await page.evaluate(() => { localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m", name: "Haas", type: "mill", maxRpm: 8100, maxFeed: 650, controller: "haas", units: "in" }])); localStorage.setItem("chipload.blob.introSeen", "false"); });
  for (const path of ["/", "/calc/feeds-mill", "/calc/bolt-circle?gcode=drill", "/calc/drill-chart", "/settings", "/shop", "/pro", "/cat/mill"]) {
    await go(page, path, "tt");
    const small = await page.evaluate(() => [...document.querySelectorAll("button, a.btn, input, select, summary, a[href]")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.min(r.width, r.height) < 47.5 && !el.closest("details:not([open]) > :not(summary)"); }).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 18)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`));
    if (small.length) report.touchTargets.push({ path, small: [...new Set(small)].slice(0, 10) });
  }
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    const pairs = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement); const v = (n) => cs.getPropertyValue(n).trim();
      const lum = (hex) => { const m = hex.replace("#", "").match(/.{2}/g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const out = [];
      for (const [fg, bg] of [["--text", "--bg"], ["--text", "--card"], ["--text-2", "--bg"], ["--text-2", "--card"], ["--text-3", "--bg"], ["--text-3", "--card"], ["--scribe", "--card"], ["--accent-ink", "--accent"], ["--warn", "--card"], ["--link", "--bg"], ["--link", "--card"]]) out.push({ pair: `${fg} on ${bg}`, ratio: Math.round(ratio(v(fg), v(bg)) * 100) / 100 });
      return out;
    });
    report.contrast.push({ theme, pairs });
  }
  await ctx.close();
}

mark("7. Navigation leak + timing");
// ── 7. Navigation leak + timing ──
{
  const { ctx, page } = await ctxFor();
  await go(page, "/", "lk");
  const snap = () => page.evaluate(() => ({ nodes: document.querySelectorAll("*").length, bodyKids: document.body.children.length, numpads: document.querySelectorAll(".numpad").length, answers: document.querySelectorAll(".answer").length, menus: document.querySelectorAll(".menu, .sheet, .copied").length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576 * 10) / 10 : null }));
  report.leak.before = await snap();
  const t0 = Date.now();
  await page.evaluate(async (list) => { for (let i = 0; i < 300; i++) { location.hash = `#/calc/${list[i % list.length]}`; await new Promise((r) => setTimeout(r, 0)); } location.hash = "#/"; await new Promise((r) => setTimeout(r, 50)); }, ids.map((x) => x.id));
  report.leak.ms300Routes = Date.now() - t0;
  report.leak.after = await snap();
  report.perf = await page.evaluate(async () => {
    const { allCalcs } = await import("./src/app/registry.js"); const { searchCalcs } = await import("./src/app/search.js");
    const qs = ["tap", "1/4-20", "rpm", "how fast band saw", "0.201", "M10x1.5", "what drill for a 1/4-20 tap", "zzzz", "clearance hole for a 3/8 bolt", "a"];
    const t = performance.now(); for (let i = 0; i < 1000; i++) searchCalcs(qs[i % qs.length], allCalcs()); const searchMsPer = (performance.now() - t) / 1000;
    return { searchMsPerQuery: Math.round(searchMsPer * 1000) / 1000, tools: allCalcs().length };
  });
  await go(page, "/calc/materials", "pf");
  report.perf.materialsFilterMs = await page.evaluate(() => { const q = document.querySelector("#cq"); const t = performance.now(); for (const s of ["4", "41", "414", "4140", "414", "41", "4", ""]) { q.value = s; q.dispatchEvent(new Event("input")); } return Math.round((performance.now() - t) * 10) / 10; });
  await go(page, "/calc/drill-chart", "pf2");
  report.perf.drillChartRows = await page.evaluate(() => document.querySelectorAll("#cbody tr").length);
  report.history = await page.evaluate(async () => { const s = await import("./src/app/store.js"); for (let i = 0; i < 35; i++) s.pushHistory("zz-test", { key: "k" + i, label: "L" + i, primary: String(i), raw: { n: String(i) }, units: "in" }); const h = s.loadHistory("zz-test"); return { kept: h.length, newestFirst: h[0].label === "L34" }; });
  await ctx.close();
}

mark("8. Free-tier walk: nothing Pro leaks, nothing free is locked");
// ── 8. Free-tier walk: nothing Pro leaks, nothing free is locked ──
{
  const { ctx, page } = await ctxFor({ pro: false });
  const free = [];
  for (const { id, view } of ids) {
    await go(page, `/calc/${id}`, "fr");
    const s = await page.evaluate(() => ({ lock: !!document.querySelector(".lock"), val: document.querySelector("#answerVal")?.textContent, rows: document.querySelectorAll("#cbody tr").length, stats: document.querySelectorAll(".stat").length, code: document.querySelectorAll("pre.code").length, autoNums: [...document.querySelectorAll("main input.input")].filter((i) => /^auto \d/.test(i.placeholder)).length, recent: [...document.querySelectorAll("details.drawer summary")].some((x) => /Recent/.test(x.textContent)) }));
    free.push({ id, view, ...s });
  }
  report.misc.push({ freeTier: free.filter((f) => !f.lock).map((f) => f.id), lockedCount: free.filter((f) => f.lock).length, proLeak: free.filter((f) => f.val === "Pro" && (f.stats > 0 || f.code > 0 || f.autoNums > 0 || f.recent)).map((f) => f.id) });
  await ctx.close();
}

report.verdict = {
  overflow: report.overflow.length === 0,
  unitToggleKeepsTheCut: report.unitToggle.every((u) => u.note || (u.sameCut && u.roundTripOk)),
  roundTrip: report.roundTrip.length === 0,
  corruptStorageSurvives: report.corruptStorage.length === 0,
  xssClean: report.xss.executed === 0 && report.xss.injectedImg === 0 && report.xss.injectedScript === 0,
  landscapeFieldVisible: report.numpad.landscape.fieldVisible === true && report.numpad.landscape.answerTop >= 0,
  padOpensAndCloses: report.numpad.opensOnLowField && report.numpad.closesForTextField && report.numpad.closesOnOutsideTap,
  touchTargets48: report.touchTargets.every((t) => t.small.every((x) => /^a\.\s/.test(x))),
  contrastAA: report.contrast.every((c) => c.pairs.every((p) => p.ratio >= 4.5)),
  noLeak: report.leak.after.numpads <= 1 && report.leak.after.answers <= 1 && report.leak.after.menus === 0 && report.leak.after.nodes - report.leak.before.nodes < 200,
  historyCap20: report.history.kept === 20 && report.history.newestFirst,
  noProLeak: report.misc[0].proLeak.length === 0,
  noConsoleErrors: report.consoleErrors.length === 0,
};
report.pass = Object.values(report.verdict).every(Boolean);
await browser.close(); server.kill();
const slow = Object.entries(report.mountMs).sort((a, b) => b[1] - a[1]);
report.mountSummary = { slowest: slow.slice(0, 3), medianMs: slow[Math.floor(slow.length / 2)][1], count: slow.length };
delete report.mountMs;
console.log(JSON.stringify(report, null, 1));
process.exitCode = report.pass ? 0 : 1;
