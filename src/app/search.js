// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-first home: match calculators by title/keywords, and recognize typed values
// ("1/4-20", "0.201", "10mm", "8.5 mm", "1 1/4") so the user lands in a tool with the value filled in.

import { lookupUnThread, parseThreadSpec } from "../core/thread.js";
import { parseFraction, splitUnit } from "../core/format.js";
import { UNIT_LABEL } from "./settings.js";
import { chartCells, chartFilter, threadCallout } from "./chart-filter.js";

// What a material word in a question is asking for: how fast to cut it, or the material itself.
const MATERIAL_WORDS = /\b(?:aluminum|aluminium|alum|steel|stainless|ss|brass|bronze|copper|titanium|ti|inconel|cast iron|iron|plastic|delrin|acetal|nylon|hdpe|uhmw|acrylic|tool steel|mild steel)\b/g;
/** The words a material stands for. Optional: they add points, but "brass tap" still finds the tap tools. */
const MATERIAL_TERMS = ["material", "speed"];
// Words that only go with a fastener: nobody counterbores to a number-drill size (ASME B18.3 lists #10 by its screw).
const SCREW_CONTEXT = /\b(?:counterbore|cbore|c-bore|clearance|spot\s*-?\s*faces?|spotface)\b/;
/** A bare "#10": a screw next to counterbore/clearance words, a number drill next to "drill" or alone, else nothing. */
const numberedSize = (m, ...rest) => {
  const all = rest[rest.length - 1];
  if (SCREW_CONTEXT.test(all)) return "cap screw";
  return /\bdrill/.test(all) || all.trim() === m.trim() ? "number drill" : " ";
};
// How beginners type it → the words the catalog uses.
const SYNONYMS = [
  [/\bband\s*-?\s*saws?\b|\bbandsaws?\b/g, "band saw"], [/\bhack\s*saws?\b/g, "hacksaw"], [/\bchop\s*saw\b|\bcut\s*-?\s*off\s*saw\b/g, "cutoff saw"],
  [/\bend\s*-?\s*mills?\b|\bendmills?\b/g, "end mill"],
  [/\bdrill\s*bits?\b/g, "drill"], [/\bbits?\b/g, "drill"], [/\bhow fast\b|\bspeeds?\b/g, "speed"], [/\bspindle\s*speed\b|\bspins?\b/g, "rpm"],
  [/\bfeed\s*rates?\b|\bfeedrate\b/g, "feed"], [/\bcounter\s*bores?\b/g, "counterbore"], [/\bcounter\s*sinks?\b/g, "countersink"],
  [/\bmillimet(?:er|re)s?\b/g, "mm"], [/\binches\b/g, "inch"], [/\bhole\s*size\b/g, "hole"], [/\bconvert(?:ing|er)?\b/g, "convert"], [/\bangles?\b/g, "angle"],
  // a numbered size ("#7", "#10") next to what it is: a number drill or a screw
  [/#\s?\d{1,2}\s+drills?\b/g, (...a) => (SCREW_CONTEXT.test(a[a.length - 1]) ? "cap screw" : "number drill")], [/#\s?\d{1,2}\s+(?:socket head\s+)?(?:cap\s+)?(?:screws?|bolts?|shcs)\b/g, "cap screw"], [/#\s?\d{1,2}\b/g, numberedSize],
];
const STOP = new Set(["a", "an", "the", "for", "to", "of", "my", "i", "do", "what", "which", "is", "in", "on", "with", "and", "or", "size", "me", "need", "want", "find", "get", "how", "will", "it", "take", "much", "should", "can", "does", "be", "this", "that", "at", "from", "into", "use", "using", "run", "set"]);
/** The query in the catalog's words: { terms } every listed tool must mostly match, { optional } that only add points. */
function normalizeQuery(q) {
  let t = String(q).toLowerCase();
  const material = t.search(MATERIAL_WORDS) >= 0;
  t = t.replace(MATERIAL_WORDS, " ");
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  const terms = [...new Set(t.split(/\s+/).filter((w) => w && !STOP.has(w)))];
  const optional = material ? MATERIAL_TERMS.filter((w) => !terms.includes(w)) : [];
  // A material alone ("aluminum") is the whole question: how fast to cut it, or the material itself.
  return terms.length ? { terms, optional } : { terms: optional, optional: [] };
}

const hayFor = (def) => `${def.title} ${def.short || ""} ${(def.keywords || []).join(" ")} ${def.category}`.toLowerCase();
/**
 * Points for the words a tool matches, whether it matched every required one, and how many optional (material)
 * words it matched. Optional words only add points; a tool that matches none of them never deals with the named
 * material, which only matters to a typed value (see `pre` in searchCalcs).
 */
function score(def, terms, optional = []) {
  const hay = hayFor(def);
  const title = def.title.toLowerCase();
  const points = (t) => (title.startsWith(t) ? 5 : title.includes(t) ? 3 : hay.includes(t) ? 1 : 0);
  let s = 0, matched = 0, opt = 0;
  for (const t of terms) {
    const p = points(t);
    if (p) { s += p; matched++; }
  }
  // A sentence rarely uses every word the catalog does: most of the words is enough to be listed.
  if (!matched || matched < Math.ceil(terms.length / 2)) return { s: 0, full: false, opt: 0 };
  for (const t of optional) {
    const p = points(t);
    if (p) { s += p; opt++; }
  }
  return { s, full: matched === terms.length, opt };
}

// A unit word after a number belongs to it ("8.5 mm"), and so does a fraction after a whole number ("1 1/4", "1 1/8-7").
const UNIT_WORD = /^(?:mm|millimet(?:er|re)s?|in|inch|inches|["″”])$/i;
const NUMBERISH = /^-?(?:\d|\.\d)[\d.,/]*(?:mm|in|")?$/i; // ".25" is a value, as "0.25" is
const HYPHEN_MIXED = /^(\d+)-(\d+\/\d+)((?:mm|in|")?)$/i; // "1-1/4" (a size, not a thread: no TPI after it)
const isValue = (t) => !!parseThreadSpec(t) || NUMBERISH.test(t) || HYPHEN_MIXED.test(t);

const NUMBERED = /^#\d{1,2}$/; // "#10": a screw or number-drill size, not a value on its own
const FLUTE_WORD = /^(?:flutes?|fl|fluted|teeth|tooth)$/i;
// A count of holes or parts: a count, unless the question is about tapping them ("1/4 20 holes to tap"). Only the
// plural "holes" counts: "a 1/4 20 hole" is shop talk for one tapped hole.
const PIECE_WORD = /^(?:holes|pcs|pieces?|places|pl|parts?)$/i;
const THREAD_WORDS = /\b(?:taps?|tapped|tapping|threads?|threaded|unc|unf|unef)\b/;
// A bolt circle or a saw question has sizes and counts, not threads ("bolt circle 3.5 6 holes", "saw 3/4 10 tpi").
// A tap word still makes it a thread ("bolt circle 1/2 13 tap 6 holes"), as it does for PIECE_WORD.
const COUNT_CONTEXT = /\b(?:bolt\s*-?\s*circles?|bhc|pcd|bcd|saws?|bandsaws?|hacksaws?|blades?|patterns?)\b/;
const COUNT_WORD = new RegExp(`${FLUTE_WORD.source}|${PIECE_WORD.source}|^hole$|^tpi$`, "i"); // "6 hole pattern"
/**
 * A thread typed with a space before its pitch ("M10 1.25", "1/4 28", "#10 32"), read the way the chart filter
 * reads it: "M10x1.25", "1/4-28", "#10-32". An inch pitch must be a whole TPI that ASME B1.1 lists for that size
 * (1/2-8 isn't: 8-UN starts at 1 in), and a pitch followed by a flute or teeth word is a count ("3/4 10 flute",
 * "1/2 2 flute", "3/4 10 teeth" stay sizes); so is one followed by holes or parts unless the question is about
 * tapping. `query` (lowercase) is the whole question; `spaced`: no separator was typed between size and pitch,
 * so a bolt-circle or saw question keeps the two numbers apart. Null when the words aren't one thread.
 */
function spacedThread(size, pitch, after, query = "", spaced = true) {
  if (!pitch || !/^\d*\.?\d+$/.test(pitch) || !/^(?:m\d|\d*\.\d|\d+\/\d|#\d)/i.test(size)) return null;
  if (FLUTE_WORD.test(after || "")) return null;
  // "M8 1.25" and "#10 32" are threads anywhere; only a bare number before another number can be a size and a count.
  const bare = !/^[m#]/i.test(size);
  if (bare && PIECE_WORD.test(after || "") && !THREAD_WORDS.test(query)) return null;
  if (bare && spaced && COUNT_CONTEXT.test(query) && !THREAD_WORDS.test(query)) return null;
  const joined = threadCallout(`${size} ${pitch}`.toLowerCase());
  const t = joined.includes(" ") ? null : parseThreadSpec(joined);
  // A pitch thread.js cautions on ("M10 3": coarser than any standard thread) is two words, not one thread.
  if (!t || t.caution || (t.system === "un" && (!/^\d+$/.test(pitch) || !lookupUnThread(t.major, t.tpi)))) return null;
  return joined.replace(/^m/, "M");
}

const SEPARATOR = /^[x×-]$/i; // "M10 x 1.25", "M10 × 1.25", "1/4 - 20": ISO's spaced spelling
const SEPARATED_PITCH = /^[x×](\d*\.?\d+)$/i; // "M10 x1.25"
/** The thread starting at tokens[i], with or without a spaced separator: { text, len } (tokens used), or null. */
function threadTokens(tokens, i) {
  const [size, next, after, after2] = tokens.slice(i, i + 4);
  const query = tokens.join(" ").toLowerCase();
  if (SEPARATOR.test(next || "")) {
    const text = spacedThread(size, after, after2, query, false);
    return text ? { text, len: 3 } : null;
  }
  const glued = (next || "").match(SEPARATED_PITCH);
  const text = spacedThread(size, glued ? glued[1] : next, after, query, !glued);
  return text ? { text, len: 2 } : null;
}

/** The typed value as one piece: its tokens' index range and its text ("1-1/4" written "1 1/4"). */
function valueSpan(tokens) {
  const threadAt = (i) => threadTokens(tokens, i);
  let start = tokens.findIndex((t) => isValue(t) || NUMBERED.test(t));
  if (start < 0) return null;
  let thread = threadAt(start);
  // A "#10" with no pitch after it is read from the words around it (numberedSize); look past it for a value.
  if (!thread && NUMBERED.test(tokens[start])) {
    const from = start;
    start = tokens.findIndex((t, i) => i > from && isValue(t));
    if (start < 0) return null;
    thread = threadAt(start);
  }
  if (thread) return { start, end: start + thread.len, text: thread.text };
  let end = start + 1;
  if (/^\d+$/.test(tokens[start]) && /^\d+\/\d+/.test(tokens[end] || "")) end++;
  if (UNIT_WORD.test(tokens[end] || "")) end++;
  const text = tokens.slice(start, end).join(" ").replace(HYPHEN_MIXED, "$1 $2$3");
  return { start, end, text };
}

const INCH_CTX = { units: "in", L: UNIT_LABEL.in, settings: { units: "in", pro: true } };
const listsThread = new Map();
/**
 * Whether a chart opened from search should be filtered to `size`. A thread callout only goes to a chart that
 * looks a thread up by its screw size (shcs: def.threadToSize) or has the thread as a row of its own (tap drill,
 * thread charts). The drill chart gets no "1/4-20": its 1/4" drill is no tap drill for it (#7 is, Machinery's Handbook).
 */
function chartTakes(def, size) {
  if (def.threadToSize || !parseThreadSpec(size)) return true;
  const key = `${def.id}|${size}`;
  if (!listsThread.has(key)) {
    let found = false;
    try { found = chartFilter(chartCells(def, INCH_CTX).cells)(size).length > 0; } catch { /* a chart that can't draw its rows here */ }
    if (listsThread.size > 200) listsThread.clear();
    listsThread.set(key, found);
  }
  return listsThread.get(key);
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

  // A count ("6 holes", "10 teeth", "2 flute") is no catalog word: only the word after it is.
  const rest = (span ? [...rawTokens.slice(0, span.start), ...rawTokens.slice(span.end)] : rawTokens)
    .filter((t, i, all) => !(/^\d+$/.test(t) && COUNT_WORD.test(all[i + 1] || "")));
  const { terms, optional } = normalizeQuery(rest.join(" "));
  // A bare grade or angle nobody claimed as a value ("6061", "304", "118") still finds tools that list it.
  const loose = span && /^\d{2,}$/.test(span.text) && !prefills.size ? span.text : null;
  // A size typed next to a chart's name opens that chart filtered to it ("#7 drill", "3/8 bolt clearance").
  const size = span?.text || q.match(/#\s?\d{1,2}\b/)?.[0].replace(/\s/g, "") || null;
  const phrase = terms.join(" ");
  // A typed thread only prefills thread tools, so it never asks how fast to cut the named material ("1/4-20 drill
  // aluminum" is the #7 tap drill, not drill speeds with no size).
  const typedThread = !!(span && parseThreadSpec(span.text));
  for (const def of defs) {
    const hay = hayFor(def);
    const { s: kw, full, opt } = terms.length ? score(def, terms, optional) : { s: 0, full: false, opt: 0 };
    const bonus = (phrase && hay.includes(phrase) ? 4 : 0) + (full ? 10 : 0) + (loose && new RegExp(`\\b${loose}\\b`).test(hay) ? 1 : 0);
    let hit = prefills.get(def);
    // A value only outranks the words around it when there are no other words, or this tool matches all of them,
    // the named material included ("1/2 drill steel" is drill speeds, not the converter or the 1/2 NPT tap).
    const pre = hit ? ((!terms.length || (full && (typedThread || !optional.length || opt > 0))) ? 50 : 1) : 0;
    if (!hit && def.view === "chart" && size && kw > 0 && chartTakes(def, size)) hit = { params: { q: size }, label: size };
    const s = pre + kw + bonus;
    if (s > 0) out.push({ def, s, params: hit?.params, prefillLabel: hit?.label });
  }
  // Score first; among value hits the calculator's own rank; then free before Pro; then registration order.
  const rank = (h) => (prefills.has(h.def) ? (h.def.prefillRank ?? 50) : 0);
  return out.sort((a, b) => b.s - a.s || rank(a) - rank(b) || (a.def.pro ? 1 : 0) - (b.def.pro ? 1 : 0)).slice(0, 12);
}

/** Helpers for reading a typed value: the same parsers the tools run (a size is splitUnit + parseFraction, as in fraction-converter's readSize). */
export const recognize = Object.freeze({
  thread: (q) => parseThreadSpec(q),
  number: (q) => {
    const s = splitUnit(q);
    const v = s ? parseFraction(s.number) : NaN;
    return Number.isFinite(v) ? { value: v, unit: s.unit } : null;
  },
});
