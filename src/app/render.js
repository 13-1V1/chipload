// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Mounts one calculator definition into the page: inputs on top, pinned answer bar,
// "How was this figured?" drawer, recent history. Live-calculates on every change.

import { fmt, parseDimension, parseFraction } from "../core/format.js";
import { CALCULATION_SOURCES } from "../data/sources.js";
import { getSettings, setSetting, UNIT_LABEL } from "./settings.js";
import { loadInputs, saveInputs, loadHistory, pushHistory, isFavorite, toggleFavorite, pushRecent, loadBlob } from "./store.js";
import { attachNumpad, closeNumpad } from "./numpad.js";
import { ICONS } from "./icons.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NUMERIC_KINDS = new Set(["length", "number", "int", "angle", "percent", "speed", "feed", "feedRev", "text"]);

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

function parseValue(input, raw, units) {
  const text = String(raw ?? "").trim();
  if (input.kind === "select" || input.kind === "segment" || input.kind === "text") return text;
  if (!text) return NaN;
  if (input.kind === "length") return parseDimension(text, units);
  const v = parseFraction(text);
  return input.kind === "int" ? Math.round(v) : v;
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
      for (const o of input.options) {
        const opt = document.createElement("option");
        opt.value = o.value; opt.textContent = o.label;
        control.append(opt);
      }
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
    } else {
      control = document.createElement("input");
      control.type = "text";
      control.className = "input";
      control.value = raw[input.id];
      control.dataset.numpad = "1";
      if (input.kind === "text") { control.inputMode = "text"; control.autocapitalize = "off"; control.addEventListener("input", () => { raw[input.id] = control.value; recalc(); }); }
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
  const warnBox = document.createElement("div");
  const stats = document.createElement("div"); stats.className = "stats";
  const explain = document.createElement("details"); explain.className = "drawer";
  explain.innerHTML = `<summary>How was this figured?</summary><div class="body"></div>`;
  const history = document.createElement("details"); history.className = "drawer";
  history.innerHTML = `<summary>Recent</summary><div class="body"></div>`;
  calc.append(warnBox, stats, explain, history);
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

  function refreshUnits() {
    for (const input of def.inputs) unitLabels[input.id].textContent = unitFor(input, units);
  }

  function ctx() {
    return { units, L: UNIT_LABEL[units], settings: getSettings(), machine: activeMachine(), fmt };
  }

  let historyTimer = null;
  function recalc() {
    const values = {};
    const c = ctx();
    // visibility
    for (const input of def.inputs) {
      const show = typeof input.showIf === "function" ? !!input.showIf(raw, c) : true;
      fieldWraps[input.id].hidden = !show;
    }
    let invalid = false;
    for (const input of def.inputs) {
      if (fieldWraps[input.id].hidden) { values[input.id] = NaN; continue; }
      let v = parseValue(input, raw[input.id], units);
      const el = fields[input.id];
      const isNumeric = NUMERIC_KINDS.has(input.kind) && input.kind !== "text";
      if (isNumeric && Number.isNaN(v) && typeof input.auto === "function") {
        v = input.auto(raw, c, values);
        el.placeholder = Number.isFinite(v) ? `auto ${fmt(v, input.places ?? 4)}` : "";
        values[`${input.id}Auto`] = true;
      } else if (isNumeric && Number.isNaN(v) && input.optional) {
        el.placeholder = input.placeholder || "optional";
      } else if (isNumeric && !Number.isFinite(v)) {
        invalid = true;
        el.classList.toggle("bad", String(raw[input.id]).trim() !== "");
        el.placeholder = input.placeholder || "";
      } else if (isNumeric && ((input.min != null && v < input.min) || (input.max != null && v > input.max))) {
        invalid = true; el.classList.add("bad");
      } else {
        el.classList?.remove("bad");
      }
      values[input.id] = v;
    }
    saveInputs(def.id, { values: raw, units });

    if (invalid) { renderEmpty("Check the highlighted field"); return; }
    let out;
    try { out = def.compute(values, c); }
    catch (err) { renderEmpty(err.message || "Can't calculate with these values"); return; }
    if (!out) { renderEmpty("Enter values to begin"); return; }
    render(out, values);
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
    destroy() { clearTimeout(historyTimer); closeNumpad(); },
    setUnits(u) { if (u !== units) calc.querySelector(`.seg [data-u="${u}"]`)?.click(); },
  };
}

export function toast(msg) {
  document.querySelectorAll(".copied").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "copied"; t.textContent = msg; t.setAttribute("role", "status");
  document.body.append(t);
  setTimeout(() => t.remove(), 1700);
}

export function hideAnswerBar() {
  const a = document.querySelector(".answer");
  if (a) a.hidden = true;
}
