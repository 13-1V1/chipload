// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Search-first home: match calculators by title/keywords, and recognize typed values
// ("1/4-20", "0.201", "10mm", "8.5 mm", "1 1/4") so the user lands in a tool with the value filled in.

import { lookupUnThread, parseThreadSpec } from "../core/thread.js";
import { parseFraction, splitUnit } from "../core/format.js";
import { UNIT_LABEL } from "./settings.js";
import { chartCells, chartFilter, threadCallout } from "./chart-filter.js";

// What a material word in a question is asking for: how fast to cut it, or the material itself. Alloy grades
// count when they aren't the size typed ("1/2 drill 4140"; "6061" alone is the materials chart, read as a value).
const MATERIAL_WORDS = /\b(?:aluminum|aluminium|alum|steel|stainless|ss|brass|bronze|copper|titanium|ti|inconel|cast iron|iron|plastic|delrin|acetal|nylon|hdpe|uhmw|acrylic|tool steel|mild steel|10[1-9]\d|11[1-4]\d|12l14|41[34]0|4340|8620|30[34]|316l?|41[06]|440c|17-4(?:ph)?|2024|5052|606[13]|7075|c360|6al-?4v|ti-?6al-?4v)\b/g;
/** The words a material stands for. Optional: they add points, but "brass tap" still finds the tap tools. */
const MATERIAL_TERMS = ["material", "speed"];
// Words that hint at a tool without naming it, each with the catalog words it hints at. Optional, like a material:
// "4 flute" alone is an end mill, but "4 flute tap" and "fluted reamer" are still a tap and a reamer. A flute count
// may be glued on ("4fl", "3flute"); the tool's material or job ("carbide", "rougher") asks how fast to run it.
const HINTS = [
  [MATERIAL_WORDS, MATERIAL_TERMS],
  [/\b\d+\s*-?\s*(?:flutes?|fl)\b|\b(?:flutes?|fluted|fl)\b/g, ["end", "mill"]],
  [/\b(?:solid\s+)?carbide\b|\bhss\b|\bcobalt\b|\b(?:un)?coated\b/g, ["speed"]],
  [/\b(?:roughers?|roughing|finishers?)\b/g, ["end", "mill"]],
];
// Words that only go with a fastener: nobody counterbores to a number-drill size (ASME B18.3 lists #10 by its screw).
const SCREW_CONTEXT = /\b(?:counterbore|cbore|c-bore|clearance|spot\s*-?\s*faces?|spotface)\b/;
/** A bare "#10": a screw next to counterbore/clearance words, a number drill next to "drill" or alone, else nothing. */
const numberedSize = (m, ...rest) => {
  const all = rest[rest.length - 1];
  if (SCREW_CONTEXT.test(all)) return "cap screw";
  return /\bdrill/.test(all) || all.trim() === m.trim() ? "number drill" : " ";
};
// A G-code, or an M-code written with its leading zero ("g83", "g01", "m06"): a control code, never a thread (ISO 261
// writes M6). One digit after a g is left alone: "h7 g6" is an ISO 286 fit.
const CODE_WORDS = /\b(?:g\d{2,3}(?:\.\d)?|m0\d)\b/g;
const CODE = new RegExp(`^${CODE_WORDS.source}$`, "i");
// How beginners type it → the words the catalog uses.
const SYNONYMS = [
  [/\bband\s*-?\s*saws?\b|\bbandsaws?\b/g, "band saw"], [/\bhack\s*saws?\b/g, "hacksaw"], [/\bchop\s*saw\b|\bcut\s*-?\s*off\s*saw\b/g, "cutoff saw"],
  [/\bend\s*-?\s*mills?\b|\bendmills?\b/g, "end mill"],
  [/\bdrill\s*bits?\b/g, "drill"], [/\bbits?\b/g, "drill"], [/\bhow fast\b|\bspeeds?\b/g, "speed"], [/\bspindle\s*speed\b|\bspins?\b/g, "rpm"],
  [/\bfeed\s*rates?\b|\bfeedrate\b/g, "feed"], [/\bcounter\s*bores?\b/g, "counterbore"], [/\bcounter\s*sinks?\b/g, "countersink"],
  [/\bmillimet(?:er|re)s?\b/g, "mm"], [/\binches\b/g, "inch"], [/\bhole\s*size\b/g, "hole"], [/\bconvert(?:ing|er)?\b/g, "convert"], [/\bangles?\b/g, "angle"],
  // "bcd" is bolt circle diameter; "feed per tooth" is the chip load, but "10 tooth" a saw blade
  [/\bbcd\b/g, "bolt circle"], [/\b(?:feed|chip)?\s*per\s+tooth\b/g, " chip load "], [/\btooth\b/g, "teeth"],
  // shop words the catalog spells another way
  // parting off is lathe work; a "bolt hole" is the hole a bolt goes through, unless the question is about the circle
  [/\bparting(?:\s*-?\s*off)?\b|\bpart\s*-?\s*off\b/g, "lathe part off"], [/\bhow far apart\b|\bapart\b/g, "spaced"], [/\bgrowth\b/g, "grow"],
  [/\bbolt\s+holes?\b/g, (m, ...a) => (/\b(?:circles?|patterns?|pcd|bhc)\b/.test(a[a.length - 1]) ? m : "clearance hole")],
  [/°?\bf\s+to\s+°?c\b|°?\bc\s+to\s+°?f\b|\bdeg(?:rees)?\s+f\b|\bdeg(?:rees)?\s+c\b/g, "fahrenheit celsius"],
  [/\bfoot\s*-?\s*pounds?\b|\bft\s*-?\s*lbs?\b|\binch\s*-?\s*pounds?\b|\bin\s*-?\s*lbs?\b|\bnewton\s*-?\s*met(?:er|re)s?\b|\bn\s*-\s*m\b/g, "torque"],
  // a numbered size ("#7", "#10") next to what it is: a number drill or a screw
  [/#\s?\d{1,2}\s+drills?\b/g, (...a) => (SCREW_CONTEXT.test(a[a.length - 1]) ? "cap screw" : "number drill")], [/#\s?\d{1,2}\s+(?:socket head\s+)?(?:cap\s+)?(?:screws?|bolts?|shcs)\b/g, "cap screw"], [/#\s?\d{1,2}\b/g, numberedSize],
];
const STOP = new Set(["a", "an", "the", "for", "to", "of", "my", "i", "do", "what", "which", "is", "in", "on", "with", "and", "or", "vs", "versus", "size", "me", "need", "want", "find", "get", "how", "will", "it", "take", "much", "should", "can", "does", "be", "this", "that", "at", "from", "into", "use", "using", "run", "set"]);
/**
 * The query in the catalog's words: { terms } every listed tool must mostly match, { optional } (HINTS) that only
 * add points, and whether it names a material.
 */
function normalizeQuery(q) {
  let t = String(q).toLowerCase();
  const material = t.search(MATERIAL_WORDS) >= 0;
  const hinted = [];
  for (const [re, words] of HINTS) {
    if (t.search(re) >= 0) hinted.push(...words);
    t = t.replace(re, " ");
  }
  for (const [re, rep] of SYNONYMS) t = t.replace(re, rep);
  const terms = [...new Set(t.split(/\s+/).filter((w) => w && !STOP.has(w)))];
  const optional = [...new Set(hinted)].filter((w) => !terms.includes(w));
  // A hint alone ("aluminum", "4 flute") is the whole question: how fast to cut it, the material, the end mill.
  return terms.length ? { terms, optional, material } : { terms: optional, optional: [], material, hintsOnly: true };
}

const hayFor = (def) => `${def.title} ${def.short || ""} ${(def.keywords || []).join(" ")} ${def.category}`.toLowerCase();
/** A size or a unit left in the question ("1 x 2 x 12 steel weight", "lathe g96 400 sfm 2 inch"), not a word. */
const NUMBER_TERM = /^[\d.,/]+$/;
const sizeTerm = (t) => NUMBER_TERM.test(t) || UNIT_WORD.test(t);
/**
 * Points for the words a tool matches; `full` when it matched every term, `allWords` when it matched every word
 * (sizes and units aside). Optional words only add points.
 */
function score(def, terms, optional = []) {
  const hay = hayFor(def);
  const title = def.title.toLowerCase();
  const points = (t) => (title.startsWith(t) ? 5 : title.includes(t) ? 3 : hay.includes(t) ? 1 : 0);
  // A sentence rarely uses every word the catalog does: most of the words is enough to be listed. Only words
  // count toward "most" when there are any — a bar's other dimensions are sizes no tool lists — but a size a
  // tool does list still adds its points, and a full match still needs every term ("taper 1 12").
  const words = terms.filter((t) => !sizeTerm(t));
  const need = words.length ? words : terms;
  let s = 0, matched = 0, matchedNeed = 0;
  for (const t of terms) {
    const p = points(t);
    if (!p) continue;
    s += p;
    matched++;
    if (need.includes(t)) matchedNeed++;
  }
  if (!matchedNeed || matchedNeed < Math.ceil(need.length / 2)) return { s: 0, full: false, allWords: false };
  for (const t of optional) s += points(t);
  return { s, full: matched === terms.length, allWords: matchedNeed === need.length };
}

// A unit word after a number belongs to it ("8.5 mm"), and so does a fraction after a whole number ("1 1/4", "1 1/8-7").
const UNIT_WORD = /^(?:mm|millimet(?:er|re)s?|in|inch|inches|["″”])$/i;
const NUMBERISH = /^-?(?:\d|\.\d)[\d.,/]*(?:mm|in|")?$/i; // ".25" is a value, as "0.25" is
const HYPHEN_MIXED = /^(\d+)-(\d+\/\d+)((?:mm|in|")?)$/i; // "1-1/4" (a size, not a thread: no TPI after it)
const isValue = (t) => !CODE.test(t) && (!!parseThreadSpec(t) || NUMBERISH.test(t) || HYPHEN_MIXED.test(t));
/** A plain size, no thread: a screw's length after its thread ("3/4", ".75", "1-1/2", "20"). */
const LENGTH = new RegExp(`${NUMBERISH.source}|${HYPHEN_MIXED.source}`, "i");

const NUMBERED = /^#\d{1,2}$/; // "#10": a screw or number-drill size, not a value on its own
const FLUTE_WORD = /^(?:flutes?|fl|fluted|teeth|tooth)$/i;
// A count of holes or parts: a count, unless the question is about tapping them ("1/4 20 holes to tap"). Only the
// plural "holes" counts: "a 1/4 20 hole" is shop talk for one tapped hole.
const PIECE_WORD = /^(?:holes|pcs|pieces?|places|pl|parts?)$/i;
const COUNT_WORD = new RegExp(`${FLUTE_WORD.source}|${PIECE_WORD.source}|^hole$|^tpi$|^wires?$`, "i"); // "6 hole pattern", "3 wire"
/** A whole number with a count word after it ("6 holes", "10 teeth", "3 flute"): never a value, a pitch or a catalog word. */
const isCount = (tokens, i) => /^\d+$/.test(tokens[i]) && COUNT_WORD.test(tokens[i + 1] || "");
// A bolt circle or a saw question has sizes and counts, not threads ("bolt circle 3.5 6 holes", "saw 3/4 10 tpi").
const COUNT_CONTEXT = /\b(?:bolt\s*-?\s*circles?|bhc|pcd|bcd|saws?|bandsaws?|hacksaws?|blades?|patterns?)\b/;
// What still makes it a thread there: a tap or thread word, or a screw named after an inch size written the way
// ASME B1.1 names threads, as a fraction ("bolt circle 1/2 13 shcs"; "bolt circle 3.5 6 bolts" is six bolts).
const THREAD_WORDS = /\b(?:taps?|tapped|tapping|threads?|threaded|unc|unf|unef)\b/;
const FASTENER = /\b(?:shcs|bhcs|fhcs|screws?|studs?|bolts?(?!\s*-?\s*(?:hole\s*)?circles?))\b/;
/**
 * A thread typed with a space before its pitch ("M10 1.25", "1/4 28", "#10 32"), read the way the chart filter
 * reads it: "M10x1.25", "1/4-28", "#10-32". An inch pitch must be a whole TPI that ASME B1.1 lists for that size
 * (1/2-8 isn't: 8-UN starts at 1 in), and a pitch followed by a flute or teeth word is a count ("3/4 10 flute").
 * A bare size and a number are a size and a count when the question counts things — holes or parts after the
 * number, or a bolt-circle or saw question — unless it names the thread (THREAD_WORDS, FASTENER) or the user typed
 * a hyphen, which is how a thread callout is written ("1/4 - 20 holes"). An "x" reads like a space: "3/4 x 10 tpi
 * blade" is a width and a count. `query` (lowercase) is the whole question. Null when the words aren't one thread.
 */
function spacedThread(size, pitch, after, query = "", hyphen = false) {
  if (!pitch || !/^\d*\.?\d+$/.test(pitch) || !/^(?:m\d|\d*\.\d|\d+\/\d|#\d)/i.test(size)) return null;
  if (FLUTE_WORD.test(after || "")) return null;
  // "M8 1.25" and "#10 32" are threads anywhere; only a bare number before another number can be a size and a count.
  const bare = !/^[m#]/i.test(size);
  const named = hyphen || THREAD_WORDS.test(query) || (FASTENER.test(query) && size.includes("/"));
  if (bare && !named && (PIECE_WORD.test(after || "") || COUNT_CONTEXT.test(query))) return null;
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
    const text = spacedThread(size, after, after2, query, next === "-");
    return text ? { text, len: 3 } : null;
  }
  const glued = (next || "").match(SEPARATED_PITCH);
  const text = spacedThread(size, glued ? glued[1] : next, after, query);
  return text ? { text, len: 2 } : null;
}

/** The typed value as one piece: its tokens' index range and its text ("1-1/4" written "1 1/4"). */
function valueSpan(tokens) {
  const threadAt = (i) => threadTokens(tokens, i);
  const valueAt = (i) => isValue(tokens[i]) && !isCount(tokens, i);
  let start = tokens.findIndex((t, i) => valueAt(i) || NUMBERED.test(t));
  if (start < 0) return null;
  let thread = threadAt(start);
  // A "#10" with no pitch after it is read from the words around it (numberedSize); look past it for a value.
  if (!thread && NUMBERED.test(tokens[start])) {
    const from = start;
    start = tokens.findIndex((t, i) => i > from && valueAt(i));
    if (start < 0) return null;
    thread = threadAt(start);
  }
  if (thread) return { start, end: start + thread.len, text: thread.text };
  let end = start + 1;
  if (/^\d+$/.test(tokens[start]) && /^\d+\/\d+/.test(tokens[end] || "")) end++;
  // A unit word belongs to a plain size ("8.5 mm", "3/8 in mm"). A thread never takes one, nor does a size that
  // already has its own: there "in" starts the next phrase ("1/4-20 in steel", "10mm in inches").
  const last = tokens[end - 1];
  if (!parseThreadSpec(last) && !/(?:mm|in|["″”])$/i.test(last) && UNIT_WORD.test(tokens[end] || "")) end++;
  const text = tokens.slice(start, end).join(" ").replace(HYPHEN_MIXED, "$1 $2$3");
  return { start, end, text };
}

// A chart's rows in each unit mode: the chart screen lists some in the app's units (the tap drill chart's drills).
const UNIT_CTX = ["in", "mm"].map((units) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true } }));
const chartRows = new WeakMap();
/**
 * A chart's cells (inch) and its filter in each unit mode, the way the chart screen builds them (null when it can't
 * draw its rows here).
 */
function chartOf(def) {
  if (!chartRows.has(def)) {
    let chart = null;
    try {
      const built = UNIT_CTX.map((ctx) => chartCells(def, ctx).cells);
      const filters = built.map((cells) => chartFilter(cells, { threadToSize: !!def.threadToSize }));
      chart = { cells: built[0], filters, seen: new Map() };
    } catch { /* a chart that can't draw its rows here */ }
    chartRows.set(def, chart);
  }
  return chartRows.get(def);
}
/**
 * Whether a chart opened from search can be filtered to `text`: only when the filter finds a row in inch and in mm,
 * never an empty chart. The drill chart gets no "1/4-20" (its 1/4" drill is no tap drill for it: #7 is, Machinery's
 * Handbook), the G-code reference no "1/2", and the tap drill chart no "0.201" (in mm it lists the #7 drill as 5.105).
 */
function chartTakes(def, text) {
  const chart = chartOf(def);
  if (!chart) return false;
  if (!chart.seen.has(text)) {
    if (chart.seen.size > 200) chart.seen.clear();
    chart.seen.set(text, chart.filters.every((f) => f(text).length > 0));
  }
  return chart.seen.get(text);
}
/** A chart with a row named this control code, written as typed ("m06": the M06 row, not an M6 screw). */
const namesCode = (def, code) => !!chartOf(def)?.cells.some((r) => String(r[0] ?? "").toLowerCase().split(/\s/)[0] === code);

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
  // With no value found the whole question is offered to the tools ("1-11.5 npt"), unless it holds a control code.
  const valueQuery = span ? span.text : rawTokens.some((t) => CODE.test(t)) ? null : q;

  // Value recognition: each calculator may claim the value.
  const prefills = new Map();
  for (const def of defs) {
    if (typeof def.prefill !== "function" || !valueQuery) continue;
    const hit = def.prefill(valueQuery) || (valueQuery !== q ? def.prefill(q) : null);
    if (hit) prefills.set(def, hit);
  }

  // A control code ("g83", "m06") is claimed like a value, by the chart with a row of that name ("m06 tool change",
  // "g01 feed"). It stays a word of the question too: tools that make that code list it ("g02 circle" is circular
  // interpolation, "g84 3/8-16" tapping feed).
  const code = rawTokens.find((t) => CODE.test(t))?.toLowerCase() || null;
  // A typed thread only prefills thread tools, so it never asks how fast to cut the named material ("1/4-20 drill
  // aluminum" is the #7 tap drill, not drill speeds with no size).
  const typedThread = !!(span && parseThreadSpec(span.text));
  // The words left are the question. A count ("6 holes", "10 teeth", "2 flute") is no catalog word, nor is a
  // separator, nor a whole number right after a thread or in a counting question that didn't join the value as a
  // pitch: a length or a count ("M8 x 20", "saw 1/2 20", "bhc 3.5 6"). Anywhere else it is an angle or a ratio a
  // tool lists ("drill 1/2 135" is a 135° drill point, "taper 1 12" a 1 in 12 taper).
  const after = span && (SEPARATOR.test(rawTokens[span.end] || "") ? span.end + 1 : span.end);
  const counting = !typedThread && COUNT_CONTEXT.test(q.toLowerCase());
  // After a typed thread, the next size is the screw's length, however it's written (ASME B18.3 calls out
  // "1/4-20 x 3/4", "5/16-18 x 1 1/2", "3/8-16 x 1-1/2", "M8 x 20"): never a size a tool has to list.
  let lengthEnd = after;
  if (typedThread && LENGTH.test(rawTokens[after] || "")) {
    lengthEnd = after + 1;
    if (/^\d+$/.test(rawTokens[after]) && /^\d+\/\d+$/.test(rawTokens[lengthEnd] || "")) lengthEnd++;
    if (UNIT_WORD.test(rawTokens[lengthEnd] || "")) lengthEnd++;
  }
  const rest = rawTokens.filter((t, i) => !(span && i >= span.start && i < span.end) && !SEPARATOR.test(t) && !isCount(rawTokens, i) &&
    !(typedThread && i >= after && i < lengthEnd) && !(counting && i === after && /^\d+$/.test(t)));
  const asked = normalizeQuery(rest.join(" "));
  // With a thread typed, a material alone doesn't turn the question into how fast to cut it: the thread is the
  // question ("1/4-20 aluminum" is the 1/4-20 tap drill, as "1/4-20" alone is).
  const { terms, optional } = typedThread && asked.hintsOnly ? { terms: [], optional: [] } : asked;
  const { material } = asked;
  // A bare grade or angle nobody claimed as a value ("6061", "304", "118") still finds tools that list it.
  const loose = span && /^\d{2,}$/.test(span.text) && !prefills.size ? span.text : null;
  // A size typed next to a chart's name opens that chart filtered to the first one it lists ("#7 drill",
  // "3/8 bolt clearance"; "g81 1/2 drill" filters the drill chart to 1/2 and the G-code list to g81).
  const sizes = [span?.text, q.match(/#\s?\d{1,2}\b/)?.[0].replace(/\s/g, ""), code].filter(Boolean);
  const phrase = terms.join(" ");
  // A typed code outranks the other words the way a value does: only when no tool it doesn't name matches all the
  // words that name things, and no tool that makes that code matches any of them ("m06 tool change" is the M06 row;
  // "g84 tapping feed", "g02 circle", "g03 arc feed inside bore" and "lathe g96 400 sfm 2 inch" are the tools that
  // make that code — a second size isn't a word a tool has to list, and one plain word the tool doesn't list
  // mustn't hand the question to the G-code list).
  const named = terms.filter((w) => !NUMBER_TERM.test(w) && !UNIT_WORD.test(w));
  const makesCode = (d) => (d.keywords || []).some((k) => k.toLowerCase() === code);
  const answers = (d) => score(d, named, optional).full || (makesCode(d) && named.some((w) => w !== code && score(d, [w]).s > 0));
  // A material with the code asks how fast to cut it, which the tool that makes the code answers ("g96 aluminum").
  const codeLeads = !!code && !(material && defs.some(makesCode)) &&
    !(named.length > 1 && defs.some((d) => !(d.view === "chart" && namesCode(d, code)) && answers(d)));
  for (const def of defs) {
    const hay = hayFor(def);
    const { s: kw, full, allWords } = terms.length ? score(def, terms, optional) : { s: 0, full: false, allWords: false };
    // Matching every word of the question ranks a tool up; a leftover size it doesn't list ("2 inch") doesn't stop
    // that, but a typed value only takes the lead (below) when the tool matched every term.
    const bonus = (phrase && hay.includes(phrase) ? 4 : 0) + (allWords ? 10 : 0) + (loose && new RegExp(`\\b${loose}\\b`).test(hay) ? 1 : 0);
    let hit = prefills.get(def);
    // A value only outranks the words around it when there are no other words, or this tool matches all of them,
    // the named material included ("1/2 drill steel" is drill speeds, not the converter or the 1/2 NPT tap).
    let pre = hit ? ((!terms.length || (full && (typedThread || !material || MATERIAL_TERMS.some((w) => hay.includes(w))))) ? 50 : 1) : 0;
    if (!hit && def.view === "chart" && code && namesCode(def, code)) {
      hit = { params: { q: code }, label: code };
      pre = codeLeads ? 50 : 1;
    }
    const filter = !hit && def.view === "chart" && kw > 0 && sizes.find((t) => chartTakes(def, t));
    if (filter) hit = { params: { q: filter }, label: filter };
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
