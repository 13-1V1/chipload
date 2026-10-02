// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-first home: match calculators by title/keywords, and recognize typed values
// ("1/4-20", "0.201", "10mm", "8.5 mm", "1 1/4") so the user lands in a tool with the value filled in.

import { parseThreadSpec } from "../core/thread.js";
import { parseFraction } from "../core/format.js";

// What a material word in a question is asking for: how fast to cut it, or the material itself.
const MATERIAL_WORDS = /\b(?:aluminum|aluminium|alum|steel|stainless|ss|brass|bronze|copper|titanium|ti|inconel|cast iron|iron|plastic|delrin|acetal|nylon|hdpe|uhmw|acrylic|tool steel|mild steel)\b/g;
// How beginners type it → the words the catalog uses.
const SYNONYMS = [
  [/\bband\s*-?\s*saws?\b|\bbandsaws?\b/g, "band saw"], [/\bhack\s*saws?\b/g, "hacksaw"], [/\bchop\s*saw\b|\bcut\s*-?\s*off\s*saw\b/g, "cutoff saw"],
  [/\bdrill\s*bits?\b/g, "drill"], [/\bbits?\b/g, "drill"], [/\bhow fast\b|\bspeeds?\b/g, "speed"], [/\bspindle\s*speed\b|\bspins?\b/g, "rpm"],
  [/\bfeed\s*rates?\b|\bfeedrate\b/g, "feed"], [/\bcounter\s*bores?\b/g, "counterbore"], [/\bcounter\s*sinks?\b/g, "countersink"],
  [/\bmillimet(?:er|re)s?\b/g, "mm"], [/\binches\b/g, "inch"], [/\bhole\s*size\b/g, "hole"], [/\bconvert(?:ing|er)?\b/g, "convert"], [/\bangles?\b/g, "angle"],
  [MATERIAL_WORDS, "material speed"],
  // a numbered size ("#7", "#10") next to what it is: a number drill or a screw
  [/#\s?\d{1,2}\s+drills?\b/g, "number drill"], [/#\s?\d{1,2}\s+(?:socket head\s+)?(?:cap\s+)?(?:screws?|bolts?|shcs)\b/g, "cap screw"], [/#\s?\d{1,2}\b/g, "number drill"],
];
const STOP = new Set(["a", "an", "the", "for", "to", "of", "my", "i", "do", "what", "which", "is", "in", "on", "with", "and", "or", "size", "me", "need", "want", "find", "get", "how", "will", "it", "take", "much", "should", "can", "does", "be", "this", "that", "at", "from", "into", "use", "using", "run", "set"]);
function normalizeQuery(q) {
  let t = String(q).toLowerCase();
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  return t;
}

const hayFor = (def) => `${def.title} ${def.short || ""} ${(def.keywords || []).join(" ")} ${def.category}`.toLowerCase();
/** Points for the words a tool matches, and whether it matched every one. */
function score(def, terms) {
  const hay = hayFor(def);
  const title = def.title.toLowerCase();
  let s = 0, matched = 0;
  for (const t of terms) {
    if (title.startsWith(t)) s += 5;
    else if (title.includes(t)) s += 3;
    else if (hay.includes(t)) s += 1;
    else continue;
    matched++;
  }
  // A sentence rarely uses every word the catalog does: most of the words is enough to be listed.
  if (!matched || matched < Math.ceil(terms.length / 2)) return { s: 0, full: false };
  return { s, full: matched === terms.length };
}

// A unit word after a number belongs to it ("8.5 mm"), and so does a fraction after a whole number ("1 1/4", "1 1/8-7").
const UNIT_WORD = /^(?:mm|millimet(?:er|re)s?|in|inch|inches|["″”])$/i;
const NUMBERISH = /^-?\d[\d.,/]*(?:mm|in|")?$/i;
const HYPHEN_MIXED = /^(\d+)-(\d+\/\d+)((?:mm|in|")?)$/i; // "1-1/4" (a size, not a thread: no TPI after it)
const isValue = (t) => !!parseThreadSpec(t) || NUMBERISH.test(t) || HYPHEN_MIXED.test(t);

/** The typed value as one piece: its tokens' index range and its text ("1-1/4" written "1 1/4"). */
function valueSpan(tokens) {
  const start = tokens.findIndex(isValue);
  if (start < 0) return null;
  let end = start + 1;
  if (/^\d+$/.test(tokens[start]) && /^\d+\/\d+/.test(tokens[end] || "")) end++;
  if (UNIT_WORD.test(tokens[end] || "")) end++;
  const text = tokens.slice(start, end).join(" ").replace(HYPHEN_MIXED, "$1 $2$3");
  return { start, end, text };
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
  const span = valueSpan(rawTokens);
  const valueQuery = span ? span.text : q;

  // Value recognition: each calculator may claim the value.
  const prefills = new Map();
  for (const def of defs) {
    if (typeof def.prefill !== "function") continue;
    const hit = def.prefill(valueQuery) || (valueQuery !== q ? def.prefill(q) : null);
    if (hit) prefills.set(def, hit);
  }

  const rest = span ? [...rawTokens.slice(0, span.start), ...rawTokens.slice(span.end)] : rawTokens;
  const terms = [...new Set(normalizeQuery(rest.join(" ")).split(/\s+/).filter((t) => t && !STOP.has(t)))];
  // A bare grade or angle nobody claimed as a value ("6061", "304", "118") still finds tools that list it.
  const loose = span && /^\d{2,}$/.test(span.text) && !prefills.size ? span.text : null;
  // A size typed next to a chart's name opens that chart filtered to it ("#7 drill", "3/8 bolt clearance").
  const size = span?.text || q.match(/#\s?\d{1,2}\b/)?.[0].replace(/\s/g, "") || null;
  const phrase = terms.join(" ");
  for (const def of defs) {
    const hay = hayFor(def);
    const { s: kw, full } = terms.length ? score(def, terms) : { s: 0, full: false };
    const bonus = (phrase && hay.includes(phrase) ? 4 : 0) + (full ? 10 : 0) + (loose && new RegExp(`\\b${loose}\\b`).test(hay) ? 1 : 0);
    let hit = prefills.get(def);
    // A value only outranks the words around it when there are no other words, or this tool matches all of them.
    const pre = hit ? ((!terms.length || full) ? 50 : 1) : 0;
    if (!hit && def.view === "chart" && size && kw > 0) hit = { params: { q: size }, label: size };
    const s = pre + kw + bonus;
    if (s > 0) out.push({ def, s, params: hit?.params, prefillLabel: hit?.label });
  }
  // Score first; among value hits the calculator's own rank; then free before Pro; then registration order.
  const rank = (h) => (prefills.has(h.def) ? (h.def.prefillRank ?? 50) : 0);
  return out.sort((a, b) => b.s - a.s || rank(a) - rank(b) || (a.def.pro ? 1 : 0) - (b.def.pro ? 1 : 0)).slice(0, 12);
}

/** Helpers calculators use inside prefill(). */
export const recognize = Object.freeze({
  thread: (q) => parseThreadSpec(q),
  number: (q) => {
    const m = String(q).trim().match(/^(-?[\d\s/.,-]*?[\d.])\s*(in|inch|inches|"|mm|millimet(?:er|re)s?)?$/i);
    if (!m) return null;
    const v = parseFraction(m[1].trim().replace(/^(\d+)-(\d+\/\d+)$/, "$1 $2"));
    return Number.isFinite(v) ? { value: v, unit: m[2] ? (m[2].toLowerCase().startsWith("m") ? "mm" : "in") : null } : null;
  },
});
