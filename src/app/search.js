// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-first home: match calculators by title/keywords, and recognize typed values
// ("1/4-20", "0.201", "10mm") so the user lands in a tool with the value filled in.

import { parseThreadSpec } from "../core/thread.js";
import { parseFraction } from "../core/format.js";

// How beginners type it → the words the catalog uses.
const SYNONYMS = [
  [/\bband\s*-?\s*saws?\b|\bbandsaws?\b/g, "band saw"], [/\bhack\s*saws?\b/g, "hacksaw"], [/\bchop\s*saw\b|\bcut\s*-?\s*off\s*saw\b/g, "cutoff saw"],
  [/\bdrill\s*bits?\b/g, "drill"], [/\bbits?\b/g, "drill"], [/\bhow fast\b|\bspeeds?\b/g, "speed"], [/\bspindle\s*speed\b|\bspins?\b/g, "rpm"],
  [/\bfeed\s*rates?\b|\bfeedrate\b/g, "feed"], [/\bcounter\s*bores?\b/g, "counterbore"], [/\bcounter\s*sinks?\b/g, "countersink"],
  [/\bmillimet(?:er|re)s?\b/g, "mm"], [/\binches\b/g, "inch"], [/\bhole\s*size\b/g, "hole"], [/\bconvert(?:ing|er)?\b/g, "convert"], [/\bangles?\b/g, "angle"],
];
const STOP = new Set(["a", "an", "the", "for", "to", "of", "my", "i", "do", "what", "which", "is", "in", "on", "with", "and", "or", "size", "me", "need", "want", "find", "get", "how", "will", "it", "take", "much", "should", "can", "does", "be", "this", "that", "at", "from", "into", "use", "using", "run", "set"]);
function normalizeQuery(q) {
  let t = String(q).toLowerCase();
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  return t;
}

const hayFor = (def) => `${def.title} ${def.short || ""} ${(def.keywords || []).join(" ")} ${def.category}`.toLowerCase();
function score(def, terms) {
  const hay = hayFor(def);
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

  // Pull a value out of a sentence ("what drill for a 1/4-20 tap" → "1/4-20") so tools can prefill it.
  const rawTokens = q.split(/\s+/).filter(Boolean);
  const valueToken = rawTokens.find((t) => parseThreadSpec(t) || /^-?\d[\d.,\/]*(?:mm|in|")?$/i.test(t)) || null;
  const valueQuery = rawTokens.length === 1 ? q : (valueToken || q);

  // Value recognition: each calculator may claim the value.
  const prefills = new Map();
  for (const def of defs) {
    if (typeof def.prefill !== "function") continue;
    const hit = def.prefill(valueQuery) || (valueQuery !== q ? def.prefill(q) : null);
    if (hit) prefills.set(def, hit);
  }

  const normalized = normalizeQuery(rawTokens.filter((t) => t !== valueToken).join(" "));
  const allTerms = normalized.split(/\s+/).filter(Boolean);
  const terms = allTerms.filter((t) => !STOP.has(t));
  const phrase = terms.join(" ");
  for (const def of defs) {
    const kw = terms.length ? score(def, terms) : 0;
    const bonus = phrase && hayFor(def).includes(phrase) ? 4 : 0;
    const hit = prefills.get(def);
    // A value only outranks the words around it when there are no other words, or this tool matches them too.
    const pre = hit ? ((!terms.length || kw > 0) ? 50 : 1) : 0;
    const s = pre + kw + bonus;
    if (s > 0) out.push({ def, s, params: hit?.params, prefillLabel: hit?.label });
  }
  // Score first; among value hits the calculator's own rank; then free before Pro; then registration order.
  const rank = (h) => (h.params ? (h.def.prefillRank ?? 50) : 0);
  return out.sort((a, b) => b.s - a.s || rank(a) - rank(b) || (a.def.pro ? 1 : 0) - (b.def.pro ? 1 : 0)).slice(0, 12);
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
