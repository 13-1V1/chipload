// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Critic harness: use every tool the way a person does, tap by tap, and report anything that doesn't
// respond. Written after "typed the stock thickness, hit Next, nothing happens" got past every other test.
//   - Next walks the fields that are on screen, in order, in every mode, and closes the pad after the last
//   - typing a field's value on the pad gives the same answer as before (the keys really type)
//   - every segment button, dropdown choice and quick-pick chip does something, without errors
//   - help ?, Got it, Reset, favorite star, history, and hardware Enter all respond
// Run: node tests/critic/walkthrough.mjs   (starts its own server; exit 1 if anything is stuck or broken)

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.WALK_PORT) || 4189, BASE = `http://127.0.0.1:${PORT}/`;
const server = spawn(process.execPath, [resolve(import.meta.dirname, "../serve.mjs"), `--port=${PORT}`], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const problems = [];
const notes = [];
const flag = (tool, what) => problems.push(`${tool}: ${what}`);

const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
let errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

const fresh = async (path) => {
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "in", theme: "dark", glove: false, pro: true, tips: false })); localStorage.setItem("chipload.blob.introSeen", "true"); });
  await page.goto(`${BASE}?walk=${Math.random()}#${path}`, { waitUntil: "load" });
  await page.waitForTimeout(120);
};
const answer = () => page.evaluate(() => `${document.querySelector("#answerVal")?.textContent ?? ""} ${document.querySelector("#answerUnit")?.textContent ?? ""} | ${document.querySelector("#answerLbl")?.textContent ?? ""}`.trim());
const key = async (k) => { const b = page.locator(`.numpad [data-key="${k}"]`); await b.dispatchEvent("pointerdown"); await b.dispatchEvent("pointerup"); };
const padOpen = () => page.evaluate(() => !!document.querySelector(".numpad")?.classList.contains("open"));
// number fields a person can see right now, top to bottom
// (a closed drawer's fields still have boxes in Chrome — ask checkVisibility, as the app does)
const SHOWN = (el) => !el.closest("details:not([open])") && el.checkVisibility();
const shownFields = () => page.evaluate((shown) => [...document.querySelectorAll(".calc [data-numpad]")].filter(new Function(`return (${shown})`)()).map((el) => el.id), SHOWN.toString());
const activeId = () => page.evaluate(() => document.activeElement?.id || "");

/** Tap the first field, then press Next until the pad closes. Every press must land on the next field on screen. */
async function nextChain(tool, where) {
  const ids = await shownFields();
  if (!ids.length) return;
  await page.locator(`#${ids[0]}`).click();
  for (let i = 0; i < ids.length; i++) {
    if (!(await padOpen())) { flag(tool, `${where}: pad closed early at ${ids[i]}`); return; }
    await key("next");
    const expected = ids[i + 1];
    if (expected) {
      const now = await activeId();
      if (now !== expected) { flag(tool, `${where}: Next from ${ids[i]} went to "${now || "nothing"}", expected ${expected}${now === ids[i] ? " — STUCK, nothing happens" : ""}`); await page.locator("#title").click(); return; }
    } else if (await padOpen()) {
      flag(tool, `${where}: Next on the last field (${ids[i]}) left the pad open`); await page.locator("#title").click(); return;
    }
  }
}

/** Type `text` with the pad keys, the way a thumb would. */
async function typeOnPad(text) {
  for (const ch of String(text)) {
    if (ch === "-") await key("pm");
    else if (ch === " ") await key("sp");
    else await key(ch);
  }
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
await fresh("/");
const ids = (await page.evaluate(async () => (await import("./src/app/registry.js")).allCalcs().filter((d) => d.view !== "chart").map((d) => d.id)))
  .filter((id) => !only || only.includes(id));

for (const tool of ids) {
  try { await walk(tool); } catch (e) { flag(tool, `walkthrough couldn't finish: ${String(e.message).split("\n")[0]}`); }
}

async function walk(tool) {
  errors = [];
  await fresh(`/calc/${tool}`);
  const initial = await answer();
  if (/^\s*\|\s*$/.test(initial)) flag(tool, "blank answer bar on open");

  // 1. Next, More options closed, then open
  await nextChain(tool, "default mode");
  const hasMore = await page.locator("details.more").count();
  if (hasMore) {
    await page.evaluate(() => { document.querySelector("details.more").open = true; });
    await nextChain(tool, "More options open");
    await page.evaluate(() => { document.querySelector("details.more").open = false; });
  }

  // 2. Re-type each shown field's own value on the pad: the answer must come back the same
  for (const id of await shownFields()) {
    const before = await page.locator(`#${id}`).inputValue();
    if (!before || /[^0-9.\-/ ]/.test(before)) continue;
    await page.locator(`#${id}`).click();
    for (let k = 0; k < before.length + 2; k++) await key("bksp");
    if ((await page.locator(`#${id}`).inputValue()) !== "") { flag(tool, `${id}: backspace didn't clear it`); continue; }
    await typeOnPad(before);
    const after = await page.locator(`#${id}`).inputValue();
    if (after !== before) flag(tool, `${id}: typed "${before}" on the pad, field shows "${after}"`);
    const ans = await answer();
    if (ans !== initial) flag(tool, `${id}: retyping "${before}" changed the answer from "${initial}" to "${ans}"`);
  }
  if (await padOpen()) await page.locator("#title").click();

  // 3. Every segment button and a spread of dropdown choices; Next in each mode
  const segs = await page.evaluate(() => [...document.querySelectorAll(".calc .field .seg")].map((s) => [...s.querySelectorAll("button[data-v]")].map((b) => b.dataset.v)));
  for (let s = 0; s < segs.length; s++) {
    for (const v of segs[s]) {
      const btn = page.locator(".calc .field .seg").nth(s).locator(`button[data-v="${v}"]`);
      if (!(await btn.isVisible())) continue; // its field is hidden in this mode
      await btn.click();
      const ans = await answer();
      if (/^\s*\|\s*$/.test(ans)) flag(tool, `segment ${v}: answer bar went blank`);
      if (!/\d/.test(ans)) notes.push(`${tool} · ${v}: "${ans}"`);
      await nextChain(tool, `mode ${v}`);
    }
  }
  const selectIds = await page.evaluate(() => [...document.querySelectorAll(".calc select")].map((s) => s.id));
  for (const id of selectIds) {
    // read the choices now: a dropdown can follow another (the unit converter's units follow its category)
    const values = await page.evaluate((id) => [...document.getElementById(id).options].map((o) => o.value), id);
    const sel = { id, values };
    const pick = sel.values.length <= 8 ? sel.values : [0, 1, 2, 3, 4, 5, 6, 7].map((i) => sel.values[Math.floor(i * (sel.values.length - 1) / 7)]);
    for (const v of pick) {
      if (!(await page.locator(`#${sel.id}`).isVisible())) break;
      if (!(await page.evaluate(([id, v]) => [...document.getElementById(id).options].some((o) => o.value === v), [sel.id, v]))) continue;
      await page.selectOption(`#${sel.id}`, v);
      await page.waitForTimeout(20);
      const ans = await answer();
      if (/^\s*\|\s*$/.test(ans)) flag(tool, `${sel.id} = ${v}: answer bar went blank`);
      if (!/\d/.test(ans)) notes.push(`${tool} · ${sel.id}=${v}: "${ans}"`);
      if (sel.values.length <= 8) await nextChain(tool, `${sel.id}=${v}`);
    }
  }

  // 4. Quick-pick chips fill their field
  await fresh(`/calc/${tool}`);
  const chipCount = await page.locator(".sugg button").count();
  for (let c = 0; c < chipCount; c++) {
    const chip = page.locator(".sugg button").nth(c);
    const text = await chip.textContent();
    await chip.click();
    const field = await chip.evaluate((b) => b.closest(".field").querySelector("input, textarea").value);
    if (field !== text) flag(tool, `chip "${text}" left the field as "${field}"`);
    const ans = await answer();
    if (/^\s*\|\s*$/.test(ans) || /Check|isn't|Type a/.test(ans)) flag(tool, `chip "${text}": answer "${ans}"`);
  }

  // 5. Help, Reset, favorite, history, hardware Enter
  await fresh(`/calc/${tool}`);
  await page.locator("#helpBtn").click();
  if (!(await page.locator(".calc .help").count())) flag(tool, "? didn't open the help card");
  else {
    await page.locator(".calc .help [data-gotit]").click();
    if (await page.locator(".calc .help").count()) flag(tool, "Got it didn't close the help card");
  }
  const first = (await shownFields())[0];
  if (first) {
    await page.locator(`#${first}`).click();
    await key("1"); // change something
    await page.waitForTimeout(1000); // history saves after a short pause
    await page.locator("#title").click();
    const changed = await answer();
    await page.locator("#answerMore").click();
    await page.locator('.menu [data-act="reset"]').click();
    if ((await answer()) !== initial) flag(tool, `Reset gave "${await answer()}", expected "${initial}"`);
    const histCount = await page.locator("details.drawer:not(.more):not(.print) .body button[data-h]").count();
    // Recent keeps answers that worked; a change that made the inputs impossible (a 301° sine-bar angle) leaves nothing
    if (!histCount && /\d/.test(changed.split("|")[0]) && changed !== initial) flag(tool, "nothing in Recent after an answer changed");
    else {
      await page.locator("details.drawer:not(.more):not(.print) > summary").last().click();
      await page.locator("details.drawer:not(.more):not(.print) .body button[data-h]").first().click();
      if ((await answer()) !== changed && (await answer()) !== initial) flag(tool, `tapping a Recent entry gave "${await answer()}"`);
    }
    await page.locator(`#${first}`).click();
    await page.keyboard.press("Enter");
    const shown = await shownFields();
    const nowAt = await activeId();
    if (shown.length > 1 && nowAt !== shown[1]) flag(tool, `hardware Enter on ${first} went to "${nowAt}", expected ${shown[1]}`);
    if (await padOpen()) await page.locator("#title").click();
  }
  const star = page.locator("#answerFav");
  await star.click();
  if ((await star.getAttribute("aria-pressed")) !== "true") flag(tool, "favorite star didn't turn on");
  await star.click();

  // 6. Text fields (threads, stack lines): Enter on the phone keyboard should put it away
  const textIds = await page.evaluate(() => [...document.querySelectorAll(".calc input[type=text]:not([data-numpad])")].filter((el) => !el.closest("details:not([open])") && el.checkVisibility()).map((el) => el.id));
  for (const id of textIds) {
    await page.locator(`#${id}`).click();
    await page.keyboard.press("Enter");
    if ((await activeId()) === id) flag(tool, `${id}: Enter on the keyboard does nothing (keyboard stays up)`);
  }

  if (errors.length) flag(tool, `console errors: ${[...new Set(errors)].slice(0, 3).join(" | ")}`);
}

// ── Every screen scrolls far enough to show its last line ──────────────────────────────────────────
// Brennan's phone: the job sheet's last line sat under the answer bar and no amount of scrolling freed it.
// The gesture bar can't be faked through env() in a desktop browser, so --inset-bottom stands in for it.
if (!only) {
  await fresh("/");
  const routes = await page.evaluate(async () => {
    const { allCalcs } = await import("./src/app/registry.js");
    const { CATEGORIES } = await import("./src/app/icons.js");
    return [...allCalcs().map((d) => `/calc/${d.id}`), "/", ...CATEGORIES.filter((c) => c.id !== "shop").map((c) => `/cat/${c.id}`), "/shop/machines", "/shop/tools", "/shop/jobs", "/settings", "/pro", "/privacy", "/licenses"];
  });
  const SETUPS = [
    { name: "375x812", w: 375, h: 812, glove: false, inset: 0 },
    { name: "412x915 + gesture bar", w: 412, h: 915, glove: false, inset: 24 },
    { name: "glove + gesture bar", w: 375, h: 812, glove: true, inset: 24 },
    { name: "sideways + gesture bar", w: 812, h: 375, glove: false, inset: 16 },
  ];
  const lastLine = (inset) => page.evaluate(async (inset) => {
    document.documentElement.style.setProperty("--inset-bottom", `${inset}px`);
    // a phone has its gesture bar from the start; give the page two frames to measure the taller answer bar
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.scrollTo(0, document.documentElement.scrollHeight);
    let cover = innerHeight - inset;
    const answer = document.querySelector(".answer");
    if (answer && !answer.hidden) cover = Math.min(cover, answer.getBoundingClientRect().top);
    const pad = document.querySelector(".numpad.open");
    if (pad) { const p = pad.getBoundingClientRect(); if (p.left < innerWidth / 2) cover = Math.min(cover, p.top); } // a side column covers nothing below
    let lowest = null, bottom = -Infinity;
    for (const el of document.querySelectorAll("main *")) {
      if (el.closest("details:not([open]) > :not(summary)") || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      const leaf = !el.children.length || /^(INPUT|SELECT|TEXTAREA|BUTTON|svg)$/.test(el.tagName);
      if (leaf && r.width && r.height && r.bottom > bottom) { bottom = r.bottom; lowest = el; }
    }
    return { bottom: Math.round(bottom), cover: Math.round(cover), what: (lowest?.textContent || lowest?.tagName || "").trim().slice(0, 40) };
  }, inset);
  let checked = 0;
  for (const s of SETUPS) {
    await page.setViewportSize({ width: s.w, height: s.h });
    for (const route of routes) {
      await page.goto(BASE);
      await page.evaluate((glove) => {
        localStorage.clear();
        localStorage.setItem("chipload.settings.v1", JSON.stringify({ units: "in", theme: "dark", glove, pro: true, tips: true }));
        localStorage.setItem("chipload.blob.machines", JSON.stringify([{ id: "m1", name: "Haas VF-2", type: "mill", maxRpm: 8100, maxFeed: 650, controller: "haas", units: "in" }, { id: "m2", name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, controller: "other", units: "in" }]));
        localStorage.setItem("chipload.blob.tools", JSON.stringify([{ id: "t1", name: '1/2" 4FL carbide', kind: "endmill", diameter: 0.5, flutes: 4, toolType: "carbide", note: "AlTiN", units: "in" }]));
        localStorage.setItem("chipload.blob.jobs", JSON.stringify([{ id: "j1", at: Date.now(), calcId: "bolt-circle", name: "Pump flange · 8 holes", raw: { diameter: "6.5", holes: "8" }, units: "in", primary: "X3.25 Y0" }]));
      }, s.glove);
      await page.goto(`${BASE}?bottom=${Math.random()}#${route}`, { waitUntil: "load" });
      await page.waitForTimeout(120);
      const r = await lastLine(s.inset);
      checked++;
      if (r.bottom > r.cover + 1) flag(route, `${s.name}: last line "${r.what}" ends at ${r.bottom}px but the screen is covered from ${r.cover}px — can't scroll to it`);
      // and with the number pad up (calculators)
      const firstField = (await shownFields())[0];
      if (firstField) {
        await page.locator(`#${firstField}`).click();
        await page.waitForTimeout(250);
        const p = await lastLine(s.inset);
        checked++;
        if (p.bottom > p.cover + 1) flag(route, `${s.name}, pad open: last line "${p.what}" ends at ${p.bottom}px but the screen is covered from ${p.cover}px`);
      }
    }
  }
  console.log(`Checked the bottom of ${checked} screens (${routes.length} screens × ${SETUPS.length} phone setups, tools also with the pad open).`);
}

await browser.close(); server.kill();
console.log(`Walked ${ids.length} tools. ${problems.length} problem${problems.length === 1 ? "" : "s"}.`);
for (const p of problems) console.log(`PROBLEM  ${p}`);
console.log(`\n${notes.length} modes that open on a message instead of a number (check they make sense):`);
for (const n of [...new Set(notes)]) console.log(`  note  ${n}`);
process.exitCode = problems.length ? 1 : 0;
