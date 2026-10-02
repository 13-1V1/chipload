// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Non-calculator screens: home (search + favorites + categories), category list, settings, pro.

import { ICONS, CATEGORIES } from "./icons.js";
import { allCalcs, calcsInCategory, getCalc } from "./registry.js";
import { searchCalcs } from "./search.js";
import { navigate } from "./router.js";
import { getSettings, setSetting } from "./settings.js";
import { loadFavorites, loadRecents, loadBlob, saveBlob } from "./store.js";
import { COMMON_JOBS } from "./common-jobs.js";
import { getBillingState, onBilling } from "./billing.js";
import { isTestBuild, buildKnown } from "./build.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const jobRows = (settings) => COMMON_JOBS.map((j) => { const d = getCalc(j.calc); if (!d) return ""; return `<li><button type="button" class="row-btn" data-calc="${j.calc}"><span class="t">${esc(j.label)}<span class="sub">${esc(j.hint)}</span></span>${d.pro && !settings.pro ? `<span class="pro-tag">PRO</span>` : ""}<span class="chev">${ICONS.chevron}</span></button></li>`; }).join("");

export function renderHome(root) {
  const settings = getSettings();
  const favIds = loadFavorites();
  // Favorites always show; recents fill in up to six chips so the wrapped rows stay short.
  const recentIds = loadRecents().filter((id) => !favIds.includes(id)).slice(0, Math.max(0, 6 - favIds.length));
  const chips = [...favIds.map((id) => [id, true]), ...recentIds.map((id) => [id, false])].map(([id, fav]) => getCalc(id) && { def: getCalc(id), fav }).filter(Boolean);
  const introSeen = loadBlob("introSeen", false);
  const jobsOpen = loadBlob("jobsOpen", true);

  const favHtml = chips.length ? `<h2 class="sec">Favorites &amp; recent</h2><div class="fav-row" id="favs">${chips.map(({ def, fav }) => `<button type="button" class="chip" data-calc="${def.id}">${fav ? ICONS.starFilled.replace("<svg", '<svg width="18" height="18" style="color:var(--scribe)"') : ""}${esc(def.title)}</button>`).join("")}</div>` : "";
  const jobsHtml = `<details class="drawer jobs" id="jobs" ${jobsOpen ? "open" : ""}><summary>Common jobs<span class="sub">plain-English starting points</span></summary><div class="body"><ul class="list">${jobRows(settings)}</ul></div></details>`;
  // Pros with favorites get them first; everyone else starts with the plain-English list.
  const middle = favIds.length ? favHtml + `<div style="height:16px"></div>` + jobsHtml : jobsHtml + (favHtml ? `<div style="height:16px"></div>` + favHtml : "");

  root.innerHTML = `
    <label class="search"><span class="sr-only">Search tools or type a value</span>${ICONS.search}<input id="q" type="search" placeholder="What do you need? tap drill, 1/4-20, band saw…" autocomplete="off" autocapitalize="off" enterkeyhint="go"></label>
    <ul class="results" id="results" hidden></ul>
    <div id="homeBody">
      ${introSeen ? "" : `<div class="intro" id="intro"><div><b>New here?</b> Start with <b>Common jobs</b>, or type what you're trying to do. Tap the glove at the top for bigger buttons. Every answer shows how it was figured.</div><div class="row"><a class="btn small" href="#/calc/glossary">Shop terms</a><button type="button" class="btn small primary" id="introOk">Got it</button></div></div><div style="height:16px"></div>`}
      ${middle}
      <h2 class="sec">All tools</h2>
      <div class="grid">${CATEGORIES.map((c) => `<button type="button" class="cat" data-cat="${c.id}">${ICONS[c.id]}<span><span class="n">${c.name}</span><br><span class="c">${c.blurb}</span></span></button>`).join("")}</div>
    </div>`;

  root.querySelector("#introOk")?.addEventListener("click", () => { saveBlob("introSeen", true); const i = root.querySelector("#intro"); i.nextElementSibling?.remove(); i.remove(); });
  root.querySelector("#jobs")?.addEventListener("toggle", (e) => saveBlob("jobsOpen", e.target.open));

  root.addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) return navigate(cat.dataset.cat === "shop" ? "/shop" : `/cat/${cat.dataset.cat}`);
    const calc = e.target.closest("[data-calc]");
    if (calc) {
      const params = calc.dataset.params ? JSON.parse(calc.dataset.params) : undefined;
      return navigate(`/calc/${calc.dataset.calc}`, params);
    }
  });

  const q = root.querySelector("#q");
  const results = root.querySelector("#results");
  const body = root.querySelector("#homeBody");
  const run = () => {
    const hits = searchCalcs(q.value, allCalcs());
    results.hidden = !q.value.trim();
    body.hidden = !!q.value.trim();
    results.innerHTML = hits.length
      ? hits.map((h) => `<li><button type="button" class="result-btn" data-calc="${h.def.id}" ${h.params ? `data-params='${esc(JSON.stringify(h.params))}'` : ""}>
          <span class="t">${esc(h.def.title)}${h.prefillLabel ? ` <span class="prefill">${esc(h.prefillLabel)}</span>` : ""}<br><span class="k">${esc(h.def.short || "")}</span></span>
          ${h.def.pro && !settings.pro ? `<span class="pro-tag">PRO</span>` : ""}${ICONS.chevron}</button></li>`).join("")
      : `<li class="empty">Nothing called “${esc(q.value)}”. Try one of these:</li>${jobRows(settings)}`;
  };
  q.addEventListener("input", run);
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = results.querySelector("[data-calc]"); if (first) first.click(); }
  });
}

export function renderCategory(root, catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  const settings = getSettings();
  const defs = calcsInCategory(catId);
  root.innerHTML = defs.length
    ? `<ul class="list">${defs.map((d) => `<li><button type="button" class="row-btn" data-calc="${d.id}"><span class="t">${esc(d.title)}<span class="sub">${esc(d.short || "")}</span></span>${d.pro && !settings.pro ? `<span class="pro-tag">PRO</span>` : ""}<span class="chev">${ICONS.chevron}</span></button></li>`).join("")}</ul>`
    : `<div class="empty">${esc(cat?.name || "This category")} tools are on the way.</div>`;
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-calc]");
    if (b) navigate(`/calc/${b.dataset.calc}`);
  });
  return cat?.name || "Category";
}

export function renderSettings(root) {
  const s = getSettings();
  const sw = (id, label, sub, on) => `<div class="setting"><span class="t">${label}<span class="sub">${sub}</span></span><button type="button" class="switch" role="switch" aria-checked="${on}" data-set="${id}" aria-label="${label}"></button></div>`;
  root.innerHTML = `
    <div class="list">
      <div class="setting"><span class="t">Units<span class="sub">Default for every calculator</span></span>
        <div class="seg" style="min-width:160px"><button type="button" data-units="in" aria-pressed="${s.units === "in"}">inch</button><button type="button" data-units="mm" aria-pressed="${s.units === "mm"}">mm</button></div></div>
      ${sw("glove", "Glove mode", "Bigger keys and buttons (also the glove button up top)", s.glove)}
      ${sw("tips", "Show tips", "A plain-English card the first time you open each tool", s.tips !== false)}
      ${sw("light", "Light theme", "For bright shops and outdoors", s.theme === "light")}
    </div>
    <h2 class="sec">Pro</h2>
    <div class="list" id="proRow"></div>
    <div id="testBuild"></div>
    <h2 class="sec">About</h2>
    <div class="about">
      <p><b>Chipload</b> keeps everything on this phone. No account, no server, no analytics. Results are starting points — verify with your tooling maker and dry run.</p>
      <p>Built on <a href="https://github.com/ianarsenault-tn/Machinist_calc" rel="noopener" target="_blank">Marcos's Calculator</a> (MIT License). Fonts: IBM Plex Sans and IBM Plex Mono (SIL Open Font License).</p>
      <div class="linkrow"><a class="btn" href="#/licenses">Licenses</a><a class="btn" href="#/privacy">Privacy</a><a class="btn" href="#/calc/glossary">Shop terms</a></div>
    </div>`;
  const drawPro = () => {
    const pro = getSettings().pro;
    root.querySelector("#proRow").innerHTML = `<div class="setting"><span class="t">${pro ? "Pro is unlocked" : "Chipload Pro"}<span class="sub">${pro ? "Every tool, forever. Thank you." : "One-time unlock. No subscription, no ads."}</span></span>
        <button type="button" class="btn ${pro ? "" : "primary"}" data-nav="/pro">${pro ? "Details" : "Unlock"}</button></div>`;
  };
  drawPro();
  // Test builds only (never the Play Store version): try the Pro tools before Pro can be bought.
  buildKnown.then(() => {
    if (!isTestBuild() || !root.isConnected) return;
    root.querySelector("#testBuild").innerHTML = `<h2 class="sec">Test build</h2><div class="list">${sw("testpro", "Pro for testing", "Turns every Pro tool on or off. Only test builds have this; the Play Store version doesn't.", getSettings().pro)}</div>`;
  });
  root.addEventListener("click", (e) => {
    const u = e.target.closest("[data-units]");
    if (u) { setSetting("units", u.dataset.units); root.querySelectorAll("[data-units]").forEach((b) => b.setAttribute("aria-pressed", String(b === u))); return; }
    const t = e.target.closest("[data-set]");
    if (t) {
      const on = t.getAttribute("aria-checked") !== "true";
      t.setAttribute("aria-checked", String(on));
      if (t.dataset.set === "glove") setSetting("glove", on);
      if (t.dataset.set === "light") setSetting("theme", on ? "light" : "dark");
      if (t.dataset.set === "tips") setSetting("tips", on);
      if (t.dataset.set === "testpro" && isTestBuild()) { setSetting("pro", on); drawPro(); }
      return;
    }
    const n = e.target.closest("[data-nav]");
    if (n) navigate(n.dataset.nav);
  });
}

export function renderPro(root) {
  const groups = [
    ["Mill", "Chip thinning, HSM, ball-nose, MRR, cut time, circle comp"],
    ["Lathe", "RPM/IPR, surface finish, cycle time, nose-radius comp"],
    ["Drill & Tap", "Point length, countersinks, form taps, pre-ream"],
    ["Threads", "UN/UNJ, metric, ACME, NPT, STI with class limits; 3-wire"],
    ["Geometry", "Oblique triangle, arcs, fillets, partial bolt circle, G-code, DXF"],
    ["Inspect", "True position, tolerance stacks, fits & limits, thermal"],
    ["Reference", "GD&T, hardness, material weight, machinability, counterbores"],
    ["Shop", "Machines, tools, saved jobs, quotes, print"],
  ];
  const draw = () => {
    const s = getSettings();
    const b = getBillingState();
    const price = b.price ? ` — ${esc(b.price)}` : " — $9.99";
    const noStore = b.error === "no-store";
    root.innerHTML = `
    <div class="about">
      <p style="font-size:1.125rem;color:var(--text)"><b>Every tool, one price, forever.</b> No subscription. No ads. Works offline.</p>
    </div>
    <ul class="list">${groups.map(([n, d]) => `<li><div class="setting"><span class="t">${n}<span class="sub">${d}</span></span></div></li>`).join("")}</ul>
    <div style="height:14px"></div>
    ${s.pro
      ? `<button type="button" class="btn block" disabled>Pro unlocked</button>`
      : `<button type="button" class="btn primary block" id="buy">Unlock Pro${price}</button>
         <div style="height:10px"></div>
         <button type="button" class="btn block" id="restore">Restore purchase</button>`}
    <p class="hint" style="margin-top:14px">${noStore ? "Pro is sold through Google Play. Install Chipload from the Play Store to unlock." : "One-time purchase through Google Play. Reinstalling? Tap Restore once while online and Pro comes back."}</p>
    ${isTestBuild() && !s.pro ? `<div class="help"><div><b>Test build.</b> Buying needs the Play Store version. To try the Pro tools now, turn Pro on here. Turn it off again in Settings → Test build.</div><div class="row"><button type="button" class="btn small primary" id="testPro">Turn on Pro for testing</button></div></div>` : ""}`;
    root.querySelector("#buy")?.addEventListener("click", () => window.chiploadBilling?.buy?.());
    root.querySelector("#restore")?.addEventListener("click", () => window.chiploadBilling?.restore?.());
    root.querySelector("#testPro")?.addEventListener("click", () => { if (isTestBuild()) { setSetting("pro", true); draw(); } });
  };
  draw();
  buildKnown.then(() => { if (root.isConnected) draw(); });
  // The price and the purchase arrive from Play after the screen is up: redraw in place.
  // One subscription for the life of the screen; main.js calls destroy() when you leave.
  return { destroy: onBilling(draw) };
}

export function renderStatic(root, kind) {
  if (kind === "privacy") {
    root.innerHTML = `<div class="about"><h3>Privacy</h3><p>Chipload does not collect, store, or share any personal data. Everything you enter stays on your device. There are no accounts, no analytics, and no network requests except the one Google Play makes to confirm a purchase.</p><p>If Android backup is turned on for your Google account, Android keeps a private copy of the app's data (your machines, tools, and saved jobs) with your other phone backups, so they come back on a new phone. Chipload never sees it.</p></div>`;
    return;
  }
  root.innerHTML = `<div class="about"><h3>Chipload</h3><p>MIT License. Copyright © 2026 Brennan Meyer.</p><h3>Marcos's Calculator</h3><p>MIT License. Copyright © ianarsenault-tn. Chipload started as a fork of this project.</p><h3>IBM Plex Sans &amp; IBM Plex Mono</h3><p>Copyright © 2017 IBM Corp. Licensed under the SIL Open Font License 1.1.</p><pre class="lic" id="ofl">Loading…</pre></div>`;
  fetch("assets/fonts/LICENSE-IBM-Plex-Mono.txt").then((r) => r.text()).then((t) => { root.querySelector("#ofl").textContent = t; }).catch(() => { root.querySelector("#ofl").textContent = "See assets/fonts/LICENSE-IBM-Plex-Mono.txt"; });
}
