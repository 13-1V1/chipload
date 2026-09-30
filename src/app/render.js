// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Mounts one calculator definition into the page: inputs on top, pinned answer bar,
// "How was this figured?" drawer, recent history. Live-calculates on every change.

import { fmt, parseDimension } from "../core/format.js";
import { buildValues, optionsFor, NUMERIC_KINDS } from "./values.js";
import { CALCULATION_SOURCES } from "../data/sources.js";
import { getSettings, setSetting, UNIT_LABEL } from "./settings.js";
import { loadInputs, saveInputs, loadHistory, pushHistory, isFavorite, toggleFavorite, pushRecent, loadBlob } from "./store.js";
import { attachNumpad, closeNumpad } from "./numpad.js";
import { ICONS } from "./icons.js";
import { toast, download, share, printScreen } from "./ui.js";
import { jobs } from "./shop.js";
import { SHARE_BASE } from "./settings.js";
export { toast, download } from "./ui.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Which unit label an input kind carries. */
function unitFor(input, units) {
  if (input.unit === false) return "";
  const L = UNIT_LABEL[units];
  switch (input.kind) {
    case "length": return L.length;
    case "speed": return L.speed;
    case "feed": return L.feed;
    case "feedRev": return L.feedRev;
    case "angle": return "°";
    case "percent": return "%";
    default: return input.unit || "";
  }
}

/** Active machine profile (Shop → Machines), or null. */
export function activeMachine() {
  const machines = loadBlob("machines", []);
  const id = loadBlob("activeMachine", null);
  return machines.find((m) => m.id === id) || null;
}

function convertLength(text, from, to) {
  const v = parseDimension(text, from);
  if (!Number.isFinite(v)) return text;
  return fmt(to === "mm" ? v * 25.4 : v / 25.4, to === "mm" ? 3 : 4);
}

export function mountCalculator(def, root, { params = {}, onBack } = {}) {
  const settings = getSettings();
  let units = def.units === false ? "in" : (params.units || settings.units);
  const saved = loadInputs(def.id) || {};
  const raw = {};
  for (const input of def.inputs) {
    raw[input.id] = params[input.id] ?? saved.values?.[input.id] ?? input.default ?? "";
  }
  if (saved.units && !params.units && def.units !== false) units = saved.units;
  pushRecent(def.id);

  root.innerHTML = "";
  root.className = "";
  const calc = document.createElement("div");
  calc.className = "calc";
  root.append(calc);

  // ── Unit toggle ──
  if (def.units !== false) {
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Units");
    seg.innerHTML = `<button type="button" data-u="in" aria-pressed="${units === "in"}">inch</button><button type="button" data-u="mm" aria-pressed="${units === "mm"}">mm</button>`;
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-u]");
      if (!b || b.dataset.u === units) return;
      const from = units; units = b.dataset.u;
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      for (const input of def.inputs) {
        if (input.kind === "length" && fields[input.id]) {
          fields[input.id].value = convertLength(fields[input.id].value, from, units);
          raw[input.id] = fields[input.id].value;
        }
      }
      refreshUnits();
      recalc();
    });
    calc.append(seg);
  }

  // ── Fields ──
  const fields = {};
  const fieldWraps = {};
  const unitLabels = {};
  const numericInputs = [];

  for (const input of def.inputs) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    fieldWraps[input.id] = wrap;
    const label = document.createElement("label");
    label.htmlFor = `f-${def.id}-${input.id}`;
    const u = document.createElement("span");
    u.className = "u";
    unitLabels[input.id] = u;
    label.append(document.createTextNode(input.label), u);
    wrap.append(label);

    let control;
    if (input.kind === "select") {
      control = document.createElement("select");
      control.className = "input";
      fillOptions(control, optionsFor(input, raw, ctx()));
      if (![...control.options].some((o) => o.value === raw[input.id])) raw[input.id] = control.options[0]?.value ?? "";
      control.value = raw[input.id];
      control.addEventListener("change", () => { raw[input.id] = control.value; recalc(); });
    } else if (input.kind === "segment") {
      control = document.createElement("div");
      control.className = "seg";
      control.setAttribute("role", "group");
      for (const o of input.options) {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.v = o.value; b.textContent = o.label;
        b.setAttribute("aria-pressed", String(o.value === raw[input.id]));
        b.addEventListener("click", () => {
          raw[input.id] = o.value;
          control.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          recalc();
        });
        control.append(b);
      }
      label.htmlFor = "";
    } else if (input.kind === "textarea") {
      control = document.createElement("textarea");
      control.className = "input area";
      control.rows = input.rows || 4;
      control.value = raw[input.id];
      control.placeholder = input.placeholder || "";
      control.addEventListener("input", () => { raw[input.id] = control.value; recalc(); });
    } else {
      control = document.createElement("input");
      control.type = "text";
      control.className = "input";
      control.value = raw[input.id];
      control.dataset.numpad = "1";
      if (input.kind === "text") { control.inputMode = "text"; control.autocapitalize = "off"; control.placeholder = input.placeholder || ""; control.addEventListener("input", () => { raw[input.id] = control.value; recalc(); }); }
      else {
        numericInputs.push(control);
        attachNumpad(control, {
          change: (el) => { raw[input.id] = el.value; recalc(); },
          next: (el) => {
            const visible = numericInputs.filter((x) => !fieldWraps[x.dataset.inputId].hidden);
            const i = visible.indexOf(el);
            if (i >= 0 && i < visible.length - 1) visible[i + 1].focus();
            else { el.blur(); closeNumpad(); }
          },
        });
      }
      control.dataset.inputId = input.id;
    }
    control.id = `f-${def.id}-${input.id}`;
    fields[input.id] = control;
    wrap.append(control);
    if (input.hint) { const h = document.createElement("div"); h.className = "hint"; h.textContent = input.hint; wrap.append(h); }
    calc.append(wrap);
  }

  // ── Output regions ──
  const locked = !!def.pro && !getSettings().pro;
  const warnBox = document.createElement("div");
  const stats = document.createElement("div"); stats.className = "stats";
  const extras = document.createElement("div"); extras.className = "extras";
  const explain = document.createElement("details"); explain.className = "drawer";
  explain.innerHTML = `<summary>How was this figured?</summary><div class="body"></div>`;
  const history = document.createElement("details"); history.className = "drawer";
  history.innerHTML = `<summary>Recent</summary><div class="body"></div>`;
  if (locked) {
    const lock = document.createElement("div");
    lock.className = "lock";
    lock.innerHTML = `<div><b>Pro tool</b><br><span>${esc(def.short || "")}</span></div><a class="btn primary" href="#/pro">Unlock Pro</a>`;
    calc.append(warnBox, lock, history);
  } else {
    calc.append(warnBox, stats, extras, explain, history);
  }
  if (def.safety) {
    const n = document.createElement("p"); n.className = "note"; n.textContent = def.safety; calc.append(n);
  }

  // ── Answer bar ──
  let answer = document.querySelector(".answer");
  if (!answer) { answer = document.createElement("div"); answer.className = "answer"; document.body.append(answer); }
  answer.innerHTML = `
    <div class="big"><span class="val num" id="answerVal"></span><span class="unit" id="answerUnit"></span></div>
    <button type="button" class="icon-btn" id="answerCopy" aria-label="Copy answer">${ICONS.copy}</button>
    <button type="button" class="icon-btn" id="answerFav" aria-label="Favorite" aria-pressed="${isFavorite(def.id)}">${isFavorite(def.id) ? ICONS.starFilled : ICONS.star}</button>
    <button type="button" class="icon-btn" id="answerMore" aria-label="More actions" aria-haspopup="menu">${ICONS.more}</button>
    <div class="lbl" id="answerLbl"></div>`;
  answer.hidden = false;
  const answerVal = answer.querySelector("#answerVal");
  const answerUnit = answer.querySelector("#answerUnit");
  const answerLbl = answer.querySelector("#answerLbl");
  const favBtn = answer.querySelector("#answerFav");
  favBtn.addEventListener("click", () => {
    const on = toggleFavorite(def.id);
    favBtn.setAttribute("aria-pressed", String(on));
    favBtn.innerHTML = on ? ICONS.starFilled : ICONS.star;
  });
  let lastPrimaryText = "";
  answer.querySelector("#answerCopy").addEventListener("click", async () => {
    if (!lastPrimaryText) return;
    try { await navigator.clipboard.writeText(lastPrimaryText); toast("Copied"); } catch { toast("Copy blocked"); }
  });

  // ── ⋯ menu: save job, share, print, reset ──
  let menu = null, sheet = null;
  const closeMenu = () => { menu?.remove(); menu = null; };
  const closeSheet = () => { sheet?.remove(); sheet = null; };
  answer.querySelector("#answerMore").addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu) { closeMenu(); return; }
    const pro = getSettings().pro;
    menu = document.createElement("div");
    menu.className = "menu"; menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button type="button" role="menuitem" data-act="job">${ICONS.shop}Save job${pro ? "" : ' <span class="pro-tag">PRO</span>'}</button>
      <button type="button" role="menuitem" data-act="share">${ICONS.share}Share link</button>
      <button type="button" role="menuitem" data-act="print">${ICONS.reference}Print / PDF</button>
      <button type="button" role="menuitem" data-act="reset">${ICONS.history}Reset inputs</button>`;
    document.body.append(menu);
    menu.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-act]"); if (!b) return;
      closeMenu();
      if (b.dataset.act === "job") { if (!pro) { location.hash = "#/pro"; return; } openSaveSheet(); }
      if (b.dataset.act === "share") share({ title: `${def.title} · Chipload`, text: lastPrimaryText ? `${def.title}: ${lastPrimaryText}` : def.title, url: shareUrl() });
      if (b.dataset.act === "print") printScreen();
      if (b.dataset.act === "reset") resetInputs();
    });
    setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
  });
  function shareUrl() {
    const params = new URLSearchParams();
    for (const input of def.inputs) if (String(raw[input.id] ?? "").trim() !== "") params.set(input.id, raw[input.id]);
    if (def.units !== false) params.set("units", units);
    return `${SHARE_BASE}#/calc/${def.id}?${params.toString()}`;
  }
  function openSaveSheet() {
    closeSheet();
    sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.innerHTML = `<input class="input" type="text" id="jobName" placeholder="Job name" value="${esc(`${def.title}${lastPrimaryText ? " · " + lastPrimaryText : ""}`)}" autocapitalize="words"><button type="button" class="btn primary" id="jobSave">Save</button><button type="button" class="icon-btn" id="jobCancel" aria-label="Cancel">✕</button>`;
    document.body.append(sheet);
    const nameEl = sheet.querySelector("#jobName");
    nameEl.focus(); nameEl.select();
    sheet.querySelector("#jobCancel").addEventListener("click", closeSheet);
    const save = () => { jobs.add({ calcId: def.id, name: nameEl.value.trim() || def.title, raw: { ...raw }, units, primary: lastPrimaryText }); closeSheet(); toast("Job saved"); };
    sheet.querySelector("#jobSave").addEventListener("click", save);
    nameEl.addEventListener("keydown", (ev) => { if (ev.key === "Enter") save(); });
  }
  function resetInputs() {
    for (const input of def.inputs) {
      raw[input.id] = input.default ?? "";
      const el = fields[input.id];
      if (input.kind === "segment") el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === raw[input.id])));
      else el.value = raw[input.id];
    }
    recalc();
    toast("Reset");
  }

  function refreshUnits() {
    for (const input of def.inputs) unitLabels[input.id].textContent = unitFor(input, units);
  }

  function ctx() {
    return { units, L: UNIT_LABEL[units], settings: getSettings(), machine: activeMachine(), fmt };
  }

  let historyTimer = null;
  function recalc() {
    const c = ctx();
    const { values, invalid, hidden, placeholder } = buildValues(def, raw, c);
    for (const input of def.inputs) {
      const el = fields[input.id];
      fieldWraps[input.id].hidden = hidden.has(input.id);
      if (input.kind === "select" && typeof input.options === "function") syncOptions(input, el, c);
      if (el.tagName === "INPUT") {
        el.placeholder = placeholder[input.id] ?? (NUMERIC_KINDS.has(input.kind) ? "" : el.placeholder);
        el.classList.toggle("bad", invalid.has(input.id) && String(raw[input.id]).trim() !== "");
      }
    }
    saveInputs(def.id, { values: raw, units });

    if (invalid.size) { renderEmpty("Check the highlighted field"); return; }
    let out;
    try { out = def.compute(values, c); }
    catch (err) { renderEmpty(err.message || "Can't calculate with these values"); return; }
    if (!out) { renderEmpty("Enter values to begin"); return; }
    render(out, values);
  }

  /** Rebuild a dynamic select's options when they change; keep the value if still valid. */
  function syncOptions(input, el, c) {
    const opts = optionsFor(input, raw, c);
    const sig = JSON.stringify(opts);
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    fillOptions(el, opts);
    if (!opts.some((o) => o.value === raw[input.id])) raw[input.id] = opts[0]?.value ?? "";
    el.value = raw[input.id];
  }

  function renderEmpty(msg) {
    answerVal.textContent = ""; answerUnit.textContent = "";
    answerLbl.innerHTML = `<span class="empty-msg">${esc(msg)}</span>`;
    lastPrimaryText = "";
    stats.innerHTML = ""; warnBox.innerHTML = "";
    explain.querySelector(".body").innerHTML = "";
  }

  function render(out, values) {
    const p = out.primary;
    if (locked) {
      answerVal.textContent = "Pro";
      answerUnit.textContent = "";
      answerLbl.innerHTML = `<a href="#/pro" style="color:var(--text-2)">Unlock to see ${esc((p.label || "the answer").toLowerCase())}</a>`;
      lastPrimaryText = "";
      warnBox.innerHTML = "";
      return;
    }
    const text = Number.isFinite(p.value) ? fmt(p.value, p.places ?? 4) : String(p.text ?? "—");
    answerVal.textContent = text;
    answerVal.classList.toggle("warn-c", !!p.clamped);
    answerUnit.textContent = p.unit || "";
    answerLbl.textContent = p.label || def.title;
    lastPrimaryText = `${text}${p.unit ? " " + p.unit : ""}`;

    stats.innerHTML = (out.stats || []).map((s) => {
      const v = Number.isFinite(s.value) ? fmt(s.value, s.places ?? 4) : esc(s.text ?? "—");
      return `<div class="stat${s.wide ? " wide" : ""}${s.clamped ? " clamped" : ""}"><span class="l">${esc(s.label)}</span><span class="v">${v}${s.unit ? `<small>${esc(s.unit)}</small>` : ""}</span></div>`;
    }).join("");

    warnBox.innerHTML = (out.warnings || []).filter(Boolean).map((w) => `<div class="warn">${ICONS.warn}<div>${esc(w)}</div></div>`).join("");

    renderExtras(out);

    const src = CALCULATION_SOURCES[out.source] || null;
    explain.querySelector(".body").innerHTML =
      (out.explain || []).map((e) => `${e.title ? `<div><b>${esc(e.title)}</b></div>` : ""}<div class="formula">${esc(e.formula)}${e.plugged ? "\n" + esc(e.plugged) : ""}</div>`).join("") +
      (out.notes || []).map((n) => `<div>${esc(n)}</div>`).join("") +
      (src ? `<div class="src"><b>Source:</b> ${esc(src.source)}<br><b>Confidence:</b> ${esc(src.confidence)}</div>` : "");

    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      pushHistory(def.id, { key: JSON.stringify(raw) + units, label: out.historyLabel || describe(values), primary: lastPrimaryText, raw: { ...raw }, units });
      renderHistory();
    }, 900);
  }

  /** Tables, code blocks (G-code), and download buttons. Any item with pro:true is a locked stub for free users. */
  function renderExtras(out) {
    const pro = getSettings().pro;
    const lockStub = (title) => `<div class="lock"><div><b>${esc(title)}</b><br><span>Part of Chipload Pro</span></div><a class="btn primary" href="#/pro">Unlock</a></div>`;
    let html = "";
    for (const t of out.tables || []) {
      if (t.pro && !pro) { html += lockStub(t.title || "Table"); continue; }
      html += `<div class="table-wrap">${t.title ? `<div class="table-title">${esc(t.title)}</div>` : ""}<table class="chart"><thead><tr>${t.columns.map((c) => `<th${c.align === "right" ? ' class="r"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr${r._hit ? ' class="hit"' : ""}>${t.columns.map((c) => `<td${c.align === "right" ? ' class="r"' : ""}>${esc(typeof r[c.key] === "number" ? fmt(r[c.key], c.places ?? 4) : r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    for (const b of out.code || []) {
      if (b.pro && !pro) { html += lockStub(b.title || "Code"); continue; }
      html += `<div class="codeblock"><div class="code-head"><b>${esc(b.title || "Code")}</b><button type="button" class="btn small" data-copy="${esc(b.text)}">Copy</button>${b.filename ? `<button type="button" class="btn small" data-dl="${esc(b.filename)}" data-mime="${esc(b.mime || "text/plain")}" data-text="${esc(b.text)}">Save</button>` : ""}</div><pre class="code num">${esc(b.text)}</pre></div>`;
    }
    const dls = (out.downloads || []).filter((d) => !(d.pro && !pro));
    const lockedDls = (out.downloads || []).filter((d) => d.pro && !pro);
    if (dls.length) html += `<div class="dl-row">${dls.map((d) => `<button type="button" class="btn" data-dl="${esc(d.filename)}" data-mime="${esc(d.mime || "text/plain")}" data-text="${esc(d.text)}">${esc(d.label)}</button>`).join("")}</div>`;
    if (lockedDls.length) html += lockStub(lockedDls.map((d) => d.label).join(" / "));
    extras.innerHTML = html;
    extras.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied"); } catch { toast("Copy blocked"); }
    }));
    extras.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => download(b.dataset.dl, b.dataset.text, b.dataset.mime)));
  }

  function describe(values) {
    return def.inputs.filter((i) => !fieldWraps[i.id].hidden && i.kind !== "segment" && Number.isFinite(values[i.id]))
      .slice(0, 3).map((i) => `${i.label.split(" ")[0]} ${fmt(values[i.id], 4)}`).join(" · ");
  }

  function renderHistory() {
    const list = loadHistory(def.id);
    const body = history.querySelector(".body");
    if (!list.length) { body.innerHTML = `<div class="empty">Results you calculate show up here.</div>`; return; }
    body.innerHTML = `<ul class="list">${list.map((h, i) => `<li><button type="button" class="row-btn" data-h="${i}"><span class="t">${esc(h.label)}<span class="sub num">${esc(h.primary)}</span></span>${ICONS.chevron}</button></li>`).join("")}</ul>`;
    body.querySelectorAll("button[data-h]").forEach((b) => b.addEventListener("click", () => {
      const h = list[Number(b.dataset.h)];
      if (h.units && h.units !== units && def.units !== false) {
        units = h.units;
        calc.querySelectorAll(".seg [data-u]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.u === units)));
        refreshUnits();
      }
      for (const input of def.inputs) {
        raw[input.id] = h.raw[input.id] ?? "";
        const el = fields[input.id];
        if (input.kind === "segment") el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === raw[input.id])));
        else el.value = raw[input.id];
      }
      recalc();
      history.open = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  refreshUnits();
  renderHistory();
  recalc();

  return {
    destroy() { clearTimeout(historyTimer); closeNumpad(); closeMenu(); closeSheet(); },
    setUnits(u) { if (u !== units) calc.querySelector(`.seg [data-u="${u}"]`)?.click(); },
  };
}

export function hideAnswerBar() {
  const a = document.querySelector(".answer");
  if (a) a.hidden = true;
}
