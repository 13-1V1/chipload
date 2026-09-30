// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-first home: match calculators by title/keywords, and recognize typed values
// ("1/4-20", "0.201", "10mm") so the user lands in a tool with the value filled in.

import { parseThreadSpec } from "../core/thread.js";
import { parseFraction } from "../core/format.js";

function score(def, terms) {
  const hay = `${def.title} ${def.short || ""} ${(def.keywords || []).join(" ")} ${def.category}`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (!t) continue;
    if (def.title.toLowerCase().startsWith(t)) s += 5;
    else if (def.title.toLowerCase().includes(t)) s += 3;
    else if (hay.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

/**
 * @returns {Array<{def, params?, prefillLabel?}>}
 */
export function searchCalcs(query, defs) {
  const q = String(query || "").trim();
  if (!q) return [];
  const out = [];

  // Value recognition first: each calculator may claim the query.
  for (const def of defs) {
    if (typeof def.prefill !== "function") continue;
    const hit = def.prefill(q);
    if (hit) out.push({ def, params: hit.params, prefillLabel: hit.label, s: 100 });
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  for (const def of defs) {
    if (out.some((o) => o.def === def)) continue;
    const s = score(def, terms);
    if (s > 0) out.push({ def, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, 12);
}

/** Helpers calculators use inside prefill(). */
export const recognize = Object.freeze({
  thread: (q) => parseThreadSpec(q),
  number: (q) => {
    const m = String(q).trim().match(/^(-?[\d\s\/.,]+)\s*(in|"|mm)?$/i);
    if (!m) return null;
    const v = parseFraction(m[1].trim());
    return Number.isFinite(v) ? { value: v, unit: m[2] ? (m[2].toLowerCase() === "mm" ? "mm" : "in") : null } : null;
  },
});
