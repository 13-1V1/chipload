// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Chart / reference screen: a sticky-header table with search-as-you-type.
// Definition: { id, title, view: "chart", columns: [{key,label,align,places}], rows(ctx) → [], note?, pro? }

import { fmt } from "../core/format.js";
import { getSettings, UNIT_LABEL } from "./settings.js";
import { ICONS } from "./icons.js";
import { pushRecent } from "./store.js";
import { helpSeen, markHelpSeen } from "./render.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mountChart(def, root, { params = {} } = {}) {
  pushRecent(def.id);
  const settings = getSettings();
  const units = params.units || settings.units;
  const ctx = { units, L: UNIT_LABEL[units], settings };
  const locked = !!def.pro && !settings.pro;
  const rows = locked ? [] : def.rows(ctx);
  const cols = typeof def.columns === "function" ? def.columns(ctx) : def.columns;

  root.innerHTML = `
    <div id="chartHelp"></div>
    <label class="search"><span class="sr-only">Filter rows</span>${ICONS.search}<input id="cq" type="search" placeholder="${esc(def.placeholder || "Filter…")}" autocomplete="off" autocapitalize="off" value="${esc(params.q || "")}"></label>
    ${def.note ? `<p class="hint" style="margin:10px 0 0">${esc(def.note)}</p>` : ""}
    <div style="height:12px"></div>
    ${locked ? `<div class="lock"><div><b>Pro chart</b><br><span>${esc(def.short || "")}</span></div><a class="btn primary" href="#/pro">Unlock Pro</a></div>` : `<div class="table-wrap"><table class="chart"><thead><tr>${cols.map((c) => `<th${c.align === "right" ? ' class="r"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody id="cbody"></tbody></table></div>`}`;

  const helpHost = root.querySelector("#chartHelp");
  const helpText = def.help || def.short || "";
  let helpOpen = false;
  function toggleHelp(force) {
    helpOpen = force ?? !helpOpen;
    helpHost.innerHTML = helpOpen ? `<div class="help" role="note"><div><b>${esc(def.title)}</b> — ${esc(helpText)}</div><div class="row"><button type="button" class="btn small primary" data-gotit>Got it</button></div></div><div style="height:12px"></div>` : "";
    helpHost.querySelector("[data-gotit]")?.addEventListener("click", () => { markHelpSeen(def.id); toggleHelp(false); });
  }
  if (settings.tips !== false && !helpSeen(def.id) && helpText) toggleHelp(true);
  if (locked) return { destroy() {}, toggleHelp, hasHelp: !!helpText };
  const q = root.querySelector("#cq");
  const body = root.querySelector("#cbody");
  const cell = (r, c) => typeof r[c.key] === "number" ? fmt(r[c.key], c.places ?? 4) : String(r[c.key] ?? "");
  const text = rows.map((r) => cols.map((c) => cell(r, c)).join(" ").toLowerCase());

  function draw() {
    const term = q.value.trim().toLowerCase();
    const terms = term.split(/\s+/).filter(Boolean);
    // Exact cell matches float to the top and get highlighted; substring matches follow in chart order.
    const exact = [], partial = [];
    rows.forEach((r, i) => {
      if (terms.length && !terms.every((t) => text[i].includes(t))) return;
      const isExact = terms.length && cols.some((c) => terms.includes(cell(r, c).toLowerCase()));
      (isExact ? exact : partial).push(`<tr${isExact ? ' class="hit"' : ""}>${cols.map((c) => `<td${c.align === "right" ? ' class="r"' : ""}>${esc(cell(r, c))}</td>`).join("")}</tr>`);
    });
    const html = exact.join("") + partial.join("");
    body.innerHTML = html || `<tr><td colspan="${cols.length}" class="empty">Nothing matches “${esc(q.value)}”.</td></tr>`;
  }
  q.addEventListener("input", draw);
  draw();
  return { destroy() {}, toggleHelp, hasHelp: !!helpText };
}
