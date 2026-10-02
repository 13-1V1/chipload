// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-as-you-type for chart screens: which rows match what was typed, in what order, and which to highlight.
// Pure (no DOM) so the ranking can be tested in Node.

import { parseThreadSpec } from "../core/thread.js";

/** G and M words drop their leading zeros, as the control does: G01 = G1, M06 = M6 (M30 and G54.1 stay). */
export const normCodes = (s) => s.replace(/\b([gm])0+(\d)/g, "$1$2");

/** "1/4 20" and "M8 1.25" typed with a space are thread callouts, and "1 1/8-7" is "1-1/8-7": write them the way the charts do. */
export function threadCallout(text) {
  const s = text.replace(/^(\d+)\s+(\d+\/\d+)/, "$1-$2");
  const m = s.match(/^(#\s?\d{1,2}|\d+\/\d+|\d*\.\d+|m\d+(?:\.\d+)?)\s+(\d*\.?\d+)$/);
  if (!m) return s;
  const joined = `${m[1]}${m[1].startsWith("m") ? "x" : "-"}${m[2]}`;
  return parseThreadSpec(joined) ? joined : s;
}

/** The ways a row's name can be typed: `1/4" (E)` → "1/4", "e"; "#10 SHCS" → "#10"; "1/4-20 UNC" → "1/4-20". */
export function nameForms(name) {
  const full = String(name).toLowerCase().trim();
  const bare = full.replace(/\s*\(.*?\)/g, "").replace(/["″”]/g, "").trim();
  const forms = [full, bare, bare.replace(/\s+[a-z]+$/, ""), ...[...full.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim())];
  return [...new Set(forms.filter(Boolean).map(normCodes))];
}

/**
 * Build a filter for one chart. `cells[i]` is row i's cell texts, first column = the row's name.
 * The returned function takes the typed text and gives [{ i, hit }] in display order.
 */
export function chartFilter(cells) {
  const text = cells.map((r) => normCodes(r.join(" ").toLowerCase()));
  const names = cells.map((r) => nameForms(r[0] ?? ""));
  const all = cells.map((_, i) => i);
  const matches = (ts) => all.filter((i) => ts.every((t) => text[i].includes(t)));
  return (query) => {
    const term = normCodes(threadCallout(String(query ?? "").trim().toLowerCase()));
    let terms = term.split(/\s+/).filter(Boolean);
    if (!terms.length) return all.map((i) => ({ i, hit: false }));
    let found = matches(terms);
    // A screw named by its thread ("1/4-20", "#10-32", "M8x1.25") in a chart listed by size: look up the size.
    if (!found.length && parseThreadSpec(term)) {
      terms = term.replace(/\s*[-x]\s*\d*\.?\d+$/, "").split(/\s+/).filter(Boolean);
      found = matches(terms);
    }
    const typed = terms.join(" ").replace(/["″”]/g, "");
    // The row named what was typed comes first and alone is highlighted ("1/4" → 1/4" (E), not 6.2 mm, whose
    // nearest 64th is also 1/4). With no such row, exact matches in any column are highlighted. Then rows whose
    // name starts with what was typed ("1/4" → the 1/4 bolt before #5, whose counterbore is 1/4"), then the rest.
    const named = new Set(found.filter((i) => names[i].includes(typed) || names[i].includes(terms.join(" "))));
    const exact = [], near = [], leading = [], partial = [];
    for (const i of found) {
      const isNamed = named.has(i);
      const isExact = !isNamed && cells[i].some((c) => terms.includes(normCodes(String(c).toLowerCase())));
      const row = { i, hit: isNamed || (isExact && !named.size) };
      (isNamed ? exact : isExact ? near : names[i][0]?.startsWith(terms[0]) ? leading : partial).push(row);
    }
    return [...exact, ...near, ...leading, ...partial];
  };
}
