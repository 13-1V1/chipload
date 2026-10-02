// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Chart / reference screen: a sticky-header table with search-as-you-type.
// Definition: { id, title, view: "chart", columns: [{key,label,align,places}] or columns(ctx), rows(ctx) → [],
//   note? (a string, or note(ctx) when it carries a unit), threadToSize? (a chart listed by screw size, so
//   "1/4-20" finds the 1/4 row; chart-filter.js), pro? }

import { fmt } from "../core/format.js";
import { getSettings, UNIT_LABEL } from "./settings.js";
import { ICONS } from "./icons.js";
import { pushRecent } from "./store.js";
import { helpSeen, markHelpSeen } from "./render.js";
import { cellAttrs, fitTable } from "./tables.js";
import { chartFilter } from "./chart-filter.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mountChart(def, root, { params = {} } = {}) {
  pushRecent(def.id);
  const settings = getSettings();
  const units = params.units === "mm" || params.units === "in" ? params.units : settings.units;
  const ctx = { units, L: UNIT_LABEL[units], settings };
  const locked = !!def.pro && !settings.pro;
  const rows = locked ? [] : def.rows(ctx);
  const cols = typeof def.columns === "function" ? def.columns(ctx) : def.columns;
  const note = typeof def.note === "function" ? def.note(ctx) : def.note;

  root.innerHTML = `
    <div id="chartHelp"></div>
    <label class="search"><span class="sr-only">Filter rows</span>${ICONS.search}<input id="cq" type="search" placeholder="${esc(def.placeholder || "Filter…")}" autocomplete="off" autocapitalize="off" value="${esc(params.q || "")}"></label>
    ${note ? `<p class="hint" style="margin:10px 0 0">${esc(note)}</p>` : ""}
    <div style="height:12px"></div>
    ${locked ? `<div class="lock"><div><b>Pro chart</b><br><span>${esc(def.short || "")}</span></div><a class="btn primary" href="#/pro">Unlock Pro</a></div>` : `<div class="table-wrap"><table class="chart"><thead><tr>${cols.map((c) => `<th${cellAttrs(c)}>${esc(c.label)}</th>`).join("")}</tr></thead><tbody id="cbody"></tbody></table></div>`}`;

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
  const filter = chartFilter(rows.map((r) => cols.map((c) => cell(r, c))), { threadToSize: !!def.threadToSize });

  function draw() {
    // G01 matches G1, "1/4-20" finds the 1/4 bolt, the row named what was typed comes first (chart-filter.js)
    const html = filter(q.value).map(({ i, hit }) => `<tr${hit ? ' class="hit"' : ""}>${cols.map((c) => `<td${cellAttrs(c)}>${esc(cell(rows[i], c))}</td>`).join("")}</tr>`).join("");
    body.innerHTML = html || `<tr><td colspan="${cols.length}" class="empty">Nothing matches “${esc(q.value)}”.</td></tr>`;
    fitTable(root.querySelector(".table-wrap"), { keepStacked: true });
  }
  q.addEventListener("input", draw);
  draw();
  return { destroy() {}, toggleHelp, hasHelp: !!helpText };
}
