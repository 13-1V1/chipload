// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Mounts one calculator definition into the page: inputs on top, pinned answer bar,
// "How was this figured?" drawer, recent history. Live-calculates on every change.

import { fmt } from "../core/format.js";
import { buildValues, optionsFor, sanitizeChoices, convertInput, defaultFor, defaultRaw, measureOf, labelOf, invalidReason, NUMERIC_KINDS } from "./values.js";
import { CALCULATION_SOURCES } from "../data/sources.js";
import { getSettings, UNIT_LABEL, SHARE_BASE } from "./settings.js";
import { loadInputs, saveInputs, loadHistory, pushHistory, isFavorite, toggleFavorite, pushRecent, saveBlob, loadStrings } from "./store.js";
import { attachNumpad, closeNumpad } from "./numpad.js";
import { ICONS } from "./icons.js";
import { toast, download, share, printScreen } from "./ui.js";
import { cellAttrs, fitTable } from "./tables.js";
import { jobs, machines } from "./shop.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isChoice = (input) => input.kind === "select" || input.kind === "segment";
const validUnits = (u) => (u === "in" || u === "mm" ? u : null);

/** Which unit label a field carries right now. */
function unitFor(input, units, raw) {
  if (input.unit === false) return "";
  if (typeof input.unit === "function") return input.unit(units);
  const L = UNIT_LABEL[units];
  switch (measureOf(input, raw)) {
    case "temp": return L.temp;
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
  const id = machines.activeId();
  return machines.all().find((m) => m.id === id) || null;
}

export function mountCalculator(def, root, { params = {} } = {}) {
  const settings = getSettings();
  const saved = loadInputs(def.id) || {};
  let units = def.units === false ? "in" : (validUnits(params.units) || saved.units || settings.units);

  // Where each field starts: the link that opened the tool, then what was typed last time, then the default.
  const raw = {};
  const startText = (input) => {
    if (params[input.id] != null) return String(params[input.id]);
    if (saved.values && input.id in saved.values) {
      // Saved numbers are in the units they were saved in; a link asking for the other system gets them converted.
      const text = saved.values[input.id];
      return saved.units && saved.units !== units ? convertInput(input, text, saved.units, units, raw) : text;
    }
    return defaultFor(input, units, raw);
  };
  // Choices first: what a field measures, and so its default, can depend on a mode.
  for (const input of def.inputs) if (isChoice(input)) raw[input.id] = startText(input);
  // A stale link or old saved state can carry a choice that no longer exists — fall back to the default.
  Object.assign(raw, sanitizeChoices(def, raw, { units, L: UNIT_LABEL[units], settings, machine: null, fmt }));
  for (const input of def.inputs) if (!isChoice(input)) raw[input.id] = startText(input);
  pushRecent(def.id);

  root.innerHTML = "";
  const calc = document.createElement("div");
  calc.className = "calc";
  root.append(calc);

  // Paper copy: title, answer, and every input as text. Filled in only when printing.
  const printBlock = document.createElement("div");
  printBlock.className = "print-block";
  calc.append(printBlock);

  // ── "What is this?" help card: shows once per tool while tips are on, and on demand from the ? button ──
  let helpCard = null;
  const helpText = def.help || def.short || "";
  function toggleHelp(force) {
    const show = force ?? !helpCard;
    if (!show) { helpCard?.remove(); helpCard = null; return; }
    if (helpCard) return;
    helpCard = document.createElement("div");
    helpCard.className = "help";
    helpCard.setAttribute("role", "note");
    helpCard.innerHTML = `<div><b>${esc(def.title)}</b> — ${esc(helpText)}</div><div class="row"><a class="btn small" href="#/calc/glossary">Shop terms</a><button type="button" class="btn small primary" data-gotit>Got it</button></div>`;
    helpCard.querySelector("[data-gotit]").addEventListener("click", () => { markHelpSeen(def.id); toggleHelp(false); });
    calc.prepend(helpCard);
  }
  if (settings.tips !== false && !helpSeen(def.id) && helpText) toggleHelp(true);

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
      // Every typed number is re-expressed in the new system so it still means the same cut.
      for (const input of def.inputs) {
        const el = fields[input.id];
        if (isChoice(input) || !el) continue;
        el.value = raw[input.id] = convertInput(input, el.value, from, units, raw);
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
  const labelTexts = {};
  const numericInputs = [];
  const advancedInputs = def.inputs.filter((i) => i.advanced);
  let more = null, moreBody = null;
  if (advancedInputs.length) {
    more = document.createElement("details");
    more.className = "drawer more";
    const changed = advancedInputs.some((i) => String(raw[i.id] ?? "").trim() !== "" && String(raw[i.id]) !== String(defaultFor(i, units, raw)));
    more.open = saved.more === true || changed;
    more.innerHTML = `<summary>More options<span class="sub">${esc(advancedInputs.slice(0, 3).map((i) => labelOf(i, raw).replace(/\s*\(.*?\)/g, "").toLowerCase()).join(", "))}${advancedInputs.length > 3 ? "…" : ""}</span></summary><div class="body"></div>`;
    moreBody = more.querySelector(".body");
    more.addEventListener("toggle", () => saveInputs(def.id, { ...(loadInputs(def.id) || {}), more: more.open }));
  }

  for (const input of def.inputs) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    fieldWraps[input.id] = wrap;
    const label = document.createElement("label");
    label.htmlFor = `f-${def.id}-${input.id}`;
    const u = document.createElement("span");
    u.className = "u";
    unitLabels[input.id] = u;
    labelTexts[input.id] = document.createTextNode(labelOf(input, raw));
    label.append(labelTexts[input.id], u);
    wrap.append(label);

    let control;
    if (input.kind === "select") {
      control = document.createElement("select");
      control.className = "input";
      fillOptions(control, optionsFor(input, raw, ctx()));
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
      if (input.kind === "text") { control.inputMode = "text"; control.autocapitalize = "off"; control.placeholder = input.placeholder || ""; control.addEventListener("input", () => { raw[input.id] = control.value; recalc(); }); }
      else {
        // Only number fields belong to the custom pad; a text field gets the phone's own keyboard.
        control.dataset.numpad = "1";
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
    if (Array.isArray(input.suggest) && input.suggest.length) {
      // one-tap common values, so the phone keyboard isn't needed with gloves on
      const row = document.createElement("div");
      row.className = "sugg";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `Common ${labelOf(input, raw).toLowerCase()} values`);
      for (const value of input.suggest) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = value;
        b.addEventListener("click", () => { control.value = value; raw[input.id] = value; recalc(); });
        row.append(b);
      }
      wrap.append(row);
    }
    if (input.hint) { const h = document.createElement("div"); h.className = "hint"; h.textContent = input.hint; wrap.append(h); }
    (input.advanced ? moreBody : calc).append(wrap);
  }
  if (more) calc.append(more);

  // ── Output regions ──
  const locked = !!def.pro && !settings.pro;
  const warnBox = document.createElement("div");
  const stats = document.createElement("div"); stats.className = "stats";
  const extras = document.createElement("div"); extras.className = "extras";
  const explain = document.createElement("details"); explain.className = "drawer print";
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
  if (!answer) { answer = document.createElement("div"); document.body.append(answer); }
  answer.className = "answer";
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
  let lastPrimaryLabel = "";
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
    // isConnected: the Android back button removes an open menu from outside this closure
    if (menu?.isConnected) { closeMenu(); return; }
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
      if (b.dataset.act === "print") { fillPrintBlock(); printScreen(def.title); }
      if (b.dataset.act === "reset") resetInputs();
    });
    setTimeout(() => document.addEventListener("click", closeMenu, { once: true }), 0);
  });
  /** A link that reopens this exact state. Blank fields are sent as blank so they can't pick up the reader's own leftovers. */
  function shareUrl() {
    const query = new URLSearchParams();
    for (const input of def.inputs) query.set(input.id, String(raw[input.id] ?? ""));
    if (def.units !== false) query.set("units", units);
    return `${SHARE_BASE}#/calc/${def.id}?${query.toString()}`;
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
  /** Put a whole set of raw values on screen (Reset, or a history row). */
  function showValues(next) {
    for (const input of def.inputs) {
      raw[input.id] = String(next[input.id] ?? "");
      const el = fields[input.id];
      if (input.kind === "segment") el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === raw[input.id])));
      else el.value = raw[input.id];
    }
    recalc();
  }
  function resetInputs() {
    showValues(defaultRaw(def, {}, units));
    toast("Reset");
  }

  function refreshUnits() {
    for (const input of def.inputs) unitLabels[input.id].textContent = unitFor(input, units, raw);
  }

  function ctx() {
    return { units, L: UNIT_LABEL[units], settings: getSettings(), machine: activeMachine(), fmt };
  }

  let historyTimer = null;
  function recalc() {
    clearTimeout(historyTimer); // a half-typed value must never be filed under the last good answer
    const c = ctx();
    const { values, invalid, hidden, placeholder } = buildValues(def, raw, c);
    for (const input of def.inputs) {
      const el = fields[input.id];
      fieldWraps[input.id].hidden = hidden.has(input.id);
      if (typeof input.label === "function") labelTexts[input.id].nodeValue = labelOf(input, raw);
      if (typeof input.as === "function") unitLabels[input.id].textContent = unitFor(input, units, raw);
      if (input.kind === "select" && typeof input.options === "function") syncOptions(input, el, c);
      if (el.tagName === "INPUT") {
        el.placeholder = placeholder[input.id] ?? (NUMERIC_KINDS.has(input.kind) ? "" : el.placeholder);
        el.classList.toggle("bad", invalid.has(input.id) && String(raw[input.id]).trim() !== "");
      }
    }
    saveInputs(def.id, { values: raw, units, more: more ? more.open : undefined });

    if (invalid.size) {
      // Say which field, in words: the typed one first, otherwise the first one still empty.
      const typed = def.inputs.find((i) => invalid.has(i.id) && String(raw[i.id] ?? "").trim() !== "");
      const first = typed || def.inputs.find((i) => invalid.has(i.id));
      let msg = invalidReason(first, values[first.id], raw[first.id], raw);
      // A blank "auto" field that couldn't be worked out means another field is the real problem — the tool knows which.
      if (!typed && typeof first.auto === "function") { try { def.compute(values, c); } catch (err) { if (err?.message) msg = err.message; } }
      if (typed && more?.contains(fields[typed.id])) more.open = true;
      renderEmpty(msg);
      return;
    }
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
    answer.classList.add("msg");
    lastPrimaryText = ""; lastPrimaryLabel = "";
    stats.innerHTML = ""; warnBox.innerHTML = ""; extras.innerHTML = "";
    explain.querySelector(".body").innerHTML = "";
  }

  function render(out, values) {
    const p = out.primary;
    if (!p || (!Number.isFinite(p.value) && typeof p.text !== "string")) { renderEmpty("Those numbers don't work together — check them"); return; }
    answer.classList.remove("msg");
    if (locked) {
      answerVal.textContent = "Pro";
      answerUnit.textContent = "";
      answerLbl.innerHTML = `<a href="#/pro" style="color:var(--text-2)">Unlock to see ${esc((p.label || "the answer").toLowerCase())}</a>`;
      lastPrimaryText = ""; lastPrimaryLabel = "";
      warnBox.innerHTML = "";
      return;
    }
    const text = Number.isFinite(p.value) ? fmt(p.value, p.places ?? 4) : String(p.text ?? "—");
    answerVal.textContent = text;
    answerVal.classList.toggle("warn-c", !!p.clamped);
    answerUnit.textContent = p.unit || "";
    answerLbl.textContent = p.label || def.title;
    lastPrimaryText = `${text}${p.unit ? " " + p.unit : ""}`;
    lastPrimaryLabel = p.label || def.title;

    stats.innerHTML = (out.stats || []).map((s) => {
      const v = Number.isFinite(s.value) ? fmt(s.value, s.places ?? 4) : esc(s.text ?? "—");
      const plain = Number.isFinite(s.value) ? fmt(s.value, s.places ?? 4) : String(s.text ?? "");
      return `<button type="button" class="stat${s.wide ? " wide" : ""}${s.clamped ? " clamped" : ""}" data-copy="${esc(plain)}" title="Tap to copy"><span class="l">${esc(s.label)}</span><span class="v">${v}${s.unit ? `<small>${esc(s.unit)}</small>` : ""}</span></button>`;
    }).join("");
    stats.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast(`Copied ${b.dataset.copy}`); } catch { toast("Copy blocked"); }
    }));

    warnBox.innerHTML = (out.warnings || []).filter(Boolean).map((w) => `<div class="warn">${ICONS.warn}<div>${esc(w)}</div></div>`).join("");

    renderExtras(out);

    const src = CALCULATION_SOURCES[out.source] || null;
    explain.querySelector(".body").innerHTML =
      (out.explain || []).map((e) => `${e.title ? `<div><b>${esc(e.title)}</b></div>` : ""}<div class="formula">${esc(e.formula)}${e.plugged ? "\n" + esc(e.plugged) : ""}</div>`).join("") +
      (out.notes || []).map((n) => `<div>${esc(n)}</div>`).join("") +
      (src ? `<div class="src"><b>Source:</b> ${esc(src.source)}<br><b>Confidence:</b> ${esc(src.confidence)}</div>` : "");

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
      html += `<div class="table-wrap">${t.title ? `<div class="table-title">${esc(t.title)}</div>` : ""}<table class="chart"><thead><tr>${t.columns.map((c) => `<th${cellAttrs(c)}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr${r._hit ? ' class="hit"' : ""}>${t.columns.map((c) => `<td${cellAttrs(c)}>${esc(typeof r[c.key] === "number" ? fmt(r[c.key], c.places ?? 4) : r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    for (const b of out.code || []) {
      if (b.pro && !pro) { html += lockStub(b.title || "Code"); continue; }
      html += `<div class="codeblock"><div class="code-head"><b>${esc(b.title || "Code")}</b><button type="button" class="btn small" data-copy="${esc(b.text)}">Copy</button>${b.filename ? `<button type="button" class="btn small" data-dl="${esc(b.filename)}" data-mime="${esc(b.mime || "text/plain")}" data-text="${esc(b.text)}">Save</button>` : ""}</div><pre class="code num">${esc(b.text)}</pre></div>`;
    }
    const dls = (out.downloads || []).filter((d) => !(d.pro && !pro));
    const lockedDls = (out.downloads || []).filter((d) => d.pro && !pro);
    if (dls.length) html += `<div class="dl-row">${dls.map((d) => `<button type="button" class="btn" data-dl="${esc(d.filename)}" data-mime="${esc(d.mime || "text/plain")}" data-text="${esc(d.text)}">${esc(d.label)}</button>`).join("")}</div>`;
    if (lockedDls.length) html += lockStub(lockedDls.map((d) => d.label).join(" / "));
    if (out.next?.length) {
      html += `<div class="next"><div class="next-h">Add one more number to get…</div>${out.next.map((n) => `<button type="button" class="next-item" ${n.input ? `data-focus="${esc(n.input)}"` : ""} ${n.href ? `data-href="${esc(n.href)}"` : ""}><b>${esc(n.add)}</b><span>→ ${esc(n.get)}</span></button>`).join("")}</div>`;
    }
    extras.innerHTML = html;
    extras.querySelectorAll(".table-wrap").forEach((wrap) => fitTable(wrap));
    extras.querySelectorAll("[data-href]").forEach((b) => b.addEventListener("click", () => { location.hash = b.dataset.href; }));
    extras.querySelectorAll("[data-focus]").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation(); // keep the "tap outside closes the pad" handler from undoing the focus below
      const id = b.dataset.focus;
      const el = fields[id]; if (!el) return;
      // Progressive forms keep optional fields hidden until asked for: remember it as shown, then redraw.
      if (fieldWraps[id].hidden && "shown" in raw) {
        raw.shown = [...new Set([...String(raw.shown || "").split(",").filter(Boolean), id])].join(",");
        recalc();
      }
      if (more && more.contains(el)) more.open = true;
      el.focus();
    }));
    extras.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied"); } catch { toast("Copy blocked"); }
    }));
    extras.querySelectorAll("[data-dl]").forEach((b) => b.addEventListener("click", () => download(b.dataset.dl, b.dataset.text, b.dataset.mime)));
  }

  /** The print sheet's header: tool name, the answer, and each input as plain text (choices by their label). */
  function fillPrintBlock() {
    const c = ctx();
    const rows = def.inputs.filter((i) => !fieldWraps[i.id].hidden && labelOf(i, raw)).map((i) => {
      const typed = String(raw[i.id] ?? "").trim();
      let shown = typed, unit = "";
      if (isChoice(i)) shown = (optionsFor(i, raw, c) || []).find((o) => o.value === raw[i.id])?.label ?? typed;
      else if (!typed) shown = fields[i.id].placeholder || "—";
      else unit = unitFor(i, units, raw);
      return `<tr><th>${esc(labelOf(i, raw))}</th><td>${esc(shown)}${unit ? ` ${esc(unit)}` : ""}</td></tr>`;
    }).join("");
    printBlock.innerHTML = `<h1>${esc(def.title)}</h1>${lastPrimaryText ? `<p class="print-answer">${esc(lastPrimaryLabel)}: <b>${esc(lastPrimaryText)}</b></p>` : ""}<table>${rows}</table><p class="print-foot">Chipload · ${esc(new Date().toLocaleDateString("en-US"))} · A starting point. Verify before you cut.</p>`;
  }
  window.addEventListener("beforeprint", fillPrintBlock);

  function describe(values) {
    return def.inputs.filter((i) => !fieldWraps[i.id].hidden && i.kind !== "segment" && Number.isFinite(values[i.id]))
      .slice(0, 3).map((i) => `${labelOf(i, raw).split(" ")[0]} ${fmt(values[i.id], 4)}`).join(" · ");
  }

  function renderHistory() {
    const list = loadHistory(def.id);
    const body = history.querySelector(".body");
    if (!list.length) { body.innerHTML = `<div class="empty">Results you calculate show up here.</div>`; return; }
    body.innerHTML = `<ul class="list">${list.map((h, i) => `<li><button type="button" class="row-btn" data-h="${i}"><span class="t">${esc(h.label)}<span class="sub num">${esc(h.primary)}</span></span>${ICONS.chevron}</button></li>`).join("")}</ul>`;
    body.querySelectorAll("button[data-h]").forEach((b) => b.addEventListener("click", () => {
      const h = list[Number(b.dataset.h)];
      if (validUnits(h.units) && h.units !== units && def.units !== false) {
        units = h.units;
        calc.querySelectorAll(".seg [data-u]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.u === units)));
      }
      showValues(h.raw);
      refreshUnits();
      history.open = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  refreshUnits();
  renderHistory();
  recalc();

  return {
    destroy() { clearTimeout(historyTimer); window.removeEventListener("beforeprint", fillPrintBlock); closeNumpad(); closeMenu(); closeSheet(); },
    toggleHelp,
    hasHelp: !!helpText,
  };
}

/** Per-tool "Got it" memory for the help card. */
export function helpSeen(id) { return loadStrings("helpSeen").includes(id); }
export function markHelpSeen(id) { const list = loadStrings("helpSeen"); if (!list.includes(id)) saveBlob("helpSeen", [...list, id]); }

export function hideAnswerBar() {
  const a = document.querySelector(".answer");
  if (a) a.hidden = true;
}

/** Build <option>s, grouping into <optgroup> when options carry a `group`. */
function fillOptions(select, opts) {
  select.innerHTML = "";
  let groupEl = null, groupName = null;
  for (const o of opts) {
    const opt = document.createElement("option");
    opt.value = o.value; opt.textContent = o.label;
    if (o.group) {
      if (o.group !== groupName) { groupEl = document.createElement("optgroup"); groupEl.label = o.group; groupName = o.group; select.append(groupEl); }
      groupEl.append(opt);
    } else select.append(opt);
  }
}
