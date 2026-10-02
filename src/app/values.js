// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Pure input parsing for calculator definitions (no DOM) so the renderer and Node tests share it.
// Nothing gets to compute() unless it is a real, in-range number or a choice that exists.

import { fmt, fmtSig, parseDimension, parseFraction } from "../core/format.js";
import { UNIT_LABEL } from "./settings.js";

export const NUMERIC_KINDS = new Set(["length", "number", "int", "angle", "percent", "speed", "feed", "feedRev", "temp"]);
/** Kinds that can never be zero or negative: a speed or a feed of 0 is not a cut. */
const POSITIVE_KINDS = new Set(["speed", "feed", "feedRev"]);
/** Nothing in a machine shop is ten million of anything; beyond this it's a typo. */
const SANITY_LIMIT = 1e7;
/** Absolute zero (0 K), exact by the SI definition of the kelvin: no temperature is colder. */
const ABSOLUTE_ZERO = { in: -459.67, mm: -273.15 };

/**
 * What a numeric field measures right now. Usually that is its kind; a field whose meaning changes
 * with a mode ("second value" = a side or an angle) says so with as(raw). Drives the unit label,
 * how text is parsed, and what a unit switch does to the number.
 */
export const measureOf = (input, raw = {}) => (typeof input.as === "function" ? input.as(raw) : input.kind);

/** A field's label; label(raw) lets it follow a mode ("Run (adjacent)" instead of "First value"). */
export const labelOf = (input, raw = {}) => (typeof input.label === "function" ? input.label(raw) : input.label);

/** A temperature may carry its scale: "68°F", "20 °C", "20C". One that names the other scale is converted, never just stripped. */
function parseTemp(text, units) {
  const m = String(text).trim().match(/^(.*?)\s*(?:[°º]\s*([fc])?|([fc]))$/i);
  if (!m) return parseFraction(text);
  const v = parseFraction(m[1]);
  const scale = (m[2] || m[3] || "").toLowerCase();
  if (scale === "f" && units === "mm") return (v - 32) * 5 / 9;
  if (scale === "c" && units !== "mm") return v * 9 / 5 + 32;
  return v;
}

export function parseValue(input, text, units, raw) {
  const t = String(text ?? "").trim();
  if (!NUMERIC_KINDS.has(input.kind)) return t;
  if (!t) return NaN;
  if (typeof input.parse === "function") return input.parse(t, units, raw);
  const measure = measureOf(input, raw);
  if (measure === "length") return parseDimension(t, units);
  if (measure === "temp") return parseTemp(t, units);
  const v = parseFraction(measure === "angle" ? t.replace(/\s*[°º]$/, "") : t);
  // A count can't be 2.5: keep the fraction so the field is refused, rather than quietly running 3 flutes.
  if (input.kind === "int" && Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v);
  return v;
}

/** A number moved to the other unit system: lengths and feeds ×25.4, SFM ⇄ m/min (1 ft = 0.3048 m exactly), °F ⇄ °C. */
function toSystem(measure, v, to) {
  const toMm = to === "mm";
  if (measure === "length" || measure === "feed" || measure === "feedRev") return toMm ? v * 25.4 : v / 25.4;
  if (measure === "speed") return toMm ? v * 0.3048 : v / 0.3048;
  if (measure === "temp") return toMm ? (v - 32) * 5 / 9 : v * 9 / 5 + 32;
  return v;
}

/** The finest step a shop reads in each measure (a tenth, a micron, a degree…). A converted number keeps at least this. */
const STEP = {
  length: { in: 0.0001, mm: 0.001 }, feedRev: { in: 0.00001, mm: 0.001 },
  feed: { in: 0.01, mm: 0.1 }, speed: { in: 1, mm: 0.1 }, temp: { in: 0.1, mm: 0.1 },
};

/**
 * Shortest text for a converted number that is within half a step of it and, for small numbers, within 0.05 %
 * (four significant figures): a 0.0003 in chip load becomes 0.00762 mm, not 0.008 (5 % heavier).
 */
export function convertedText(v, measure, units) {
  const step = STEP[measure]?.[units] ?? 0.0001;
  const tol = (measure === "temp" ? step / 2 : Math.min(step / 2, Math.abs(v) * 5e-4)) + Math.abs(v) * 1e-12;
  for (let p = 0; p < 12; p++) if (Math.abs(Number(v.toFixed(p)) - v) <= tol) return fmt(v, p);
  return fmt(v, 12);
}

// What was typed before a unit switch, keyed by the text the switch wrote. Flipping straight back gives the
// user's own text again (10.25 mm → 0.4035 in → 10.25 mm, not 10.249). Any edit in between changes the key.
const typedBefore = new Map();

/** Convert `text` with `convert`, unless it is the untouched result of the opposite switch: then hand back the original. */
export function convertRemembering(kind, text, from, to, convert) {
  const key = (units, t) => `${kind}|${units}|${String(t).trim()}`;
  const before = typedBefore.get(key(from, text));
  if (before && before.units === to) return before.text;
  const out = convert(text);
  if (out !== text) {
    typedBefore.set(key(to, out), { units: from, text });
    if (typedBefore.size > 500) typedBefore.delete(typedBefore.keys().next().value);
  }
  return out;
}

/**
 * Re-express typed text when the unit system flips, so the number keeps meaning the same cut:
 * lengths and feeds ×25.4, surface speed SFM ⇄ m/min, temperature °F ⇄ °C.
 * Blank text, text that isn't a number, and unitless measures are returned as they came.
 */
export function convertForUnits(measure, text, from, to) {
  if (from === to || String(text ?? "").trim() === "" || !STEP[measure]) return text;
  return convertRemembering(measure, text, from, to, (t) => {
    const v = measure === "length" ? parseDimension(t, from) : measure === "temp" ? parseTemp(t, from) : parseFraction(t);
    return Number.isFinite(v) ? convertedText(toSystem(measure, v, to), measure, to) : t;
  });
}

/** One field's text moved from one unit system to the other. A field can bring its own convert(text, from, to). */
export function convertInput(input, text, from, to, raw) {
  return typeof input.convert === "function" ? input.convert(text, from, to) : convertForUnits(measureOf(input, raw), text, from, to);
}

/**
 * The value a field starts with. Defaults are written in inches; in mm a field shows its defaultMm
 * if it has one (a round metric size), otherwise the inch default converted.
 */
export function defaultFor(input, units = "in", raw = {}) {
  const d = input.default ?? "";
  if (units !== "mm") return d;
  return input.defaultMm ?? convertInput(input, d, "in", "mm", raw);
}

/** Options for a select, static or derived from current raw values. */
export function optionsFor(input, raw, ctx) {
  return typeof input.options === "function" ? input.options(raw, ctx) : input.options;
}

/** A choice that isn't one of the options (stale link, hand-edited storage) falls back to the default. */
export function sanitizeChoices(def, raw, ctx) {
  const r = { ...raw };
  for (const input of def.inputs) {
    if (input.kind !== "segment" && input.kind !== "select") continue;
    let opts;
    try { opts = optionsFor(input, r, ctx) || []; } catch { opts = []; }
    if (!opts.some((o) => o.value === r[input.id])) {
      r[input.id] = opts.some((o) => o.value === input.default) ? input.default : (opts[0]?.value ?? "");
    }
  }
  return r;
}

/**
 * A field's limits in the unit system in use. min / max are written the way defaults are (inches, SFM, °F),
 * so in mm they are converted first: a -460 °F floor must not read as -460 °C. A temperature also stops at absolute zero.
 */
function limitsOf(input, units, raw) {
  const measure = measureOf(input, raw);
  const conv = (x) => (x == null || units !== "mm" ? x : toSystem(measure, x, "mm"));
  return { measure, min: conv(input.min), max: conv(input.max), floor: measure === "temp" ? ABSOLUTE_ZERO[units === "mm" ? "mm" : "in"] : null };
}

function inRange(input, v, units, raw) {
  if (Math.abs(v) > (input.limit ?? SANITY_LIMIT)) return false;
  if (input.kind === "int" && !Number.isInteger(v)) return false;
  const { min, max, floor } = limitsOf(input, units, raw);
  if (floor != null && v < floor) return false;
  if (min != null && v < min) return false;
  if (max != null && v > max) return false;
  if ((input.positive || POSITIVE_KINDS.has(input.kind)) && !(v > 0)) return false;
  return true;
}

/** A field's name the way a sentence wants it: "Diameter (tool — or the part, on a lathe)" → "Diameter". */
export const plainLabel = (input, raw) => String(labelOf(input, raw) || "that field").replace(/\s*\(.*?\)/g, "").trim() || "that field";

/** The unit written after a limit in a message: " mm", " °F", " RPM", "°" — or nothing for a plain count. */
function limitUnit(input, measure, units) {
  if (measure === "angle") return "°";
  if (measure === "percent") return "%";
  const label = UNIT_LABEL[units === "mm" ? "mm" : "in"][measure];
  if (label) return ` ${label}`;
  return typeof input.unit === "string" && input.unit ? ` ${input.unit}` : "";
}

// The unit system of the last buildValues run: the screen asks for a message right after building, so a caller
// that doesn't pass `units` still gets the limit in the system the field was checked in.
let lastUnits = "in";

/**
 * One plain sentence for why a field can't be used. `value` is what buildValues parsed from `text`.
 * Names the field, because it may be folded away under "More options" where a highlight can't be seen.
 * `units` is the system in use, so a limit is quoted in the unit the user is typing in.
 */
export function invalidReason(input, value, text, raw, units = lastUnits) {
  const name = plainLabel(input, raw);
  const typed = String(text ?? "").trim();
  if (!typed) return `Enter ${name}`;
  if (!Number.isFinite(value)) return `Check ${name} — "${typed.length > 12 ? `${typed.slice(0, 12)}…` : typed}" isn't a number`;
  if (input.kind === "int" && !Number.isInteger(value)) return `${name} has to be a whole number`;
  const { measure, min, max, floor } = limitsOf(input, units, raw);
  const unit = limitUnit(input, measure, units);
  const mustBePositive = input.positive || POSITIVE_KINDS.has(input.kind) || (input.min > 0 && input.min < 1);
  if (value <= 0 && mustBePositive) return `${name} has to be more than zero`;
  if (floor != null && value < floor) return `${name} can't be colder than absolute zero (${fmt(floor, 2)}${unit})`;
  // enough figures that a tiny limit never reads as "0"
  if (min != null && value < min) return `${name} can't be less than ${fmtSig(min, 4)}${unit}`;
  if (max != null && value > max) return `${name} can't be more than ${fmtSig(max, 4)}${unit}`;
  return `Check ${name} — that number is too big`;
}

/**
 * Turn raw text inputs into typed values.
 * `invalid` holds every field compute() can't run with: typed text that isn't a usable number, a blank
 * required field, or a blank "auto" field whose value couldn't be worked out from the others.
 * @returns {{ values: object, invalid: Set<string>, hidden: Set<string>, placeholder: object, raw: object }}
 */
export function buildValues(def, raw, ctx) {
  const values = {};
  const invalid = new Set();
  const hidden = new Set();
  const placeholder = {};
  const r = sanitizeChoices(def, raw, ctx);
  lastUnits = ctx.units === "mm" ? "mm" : "in";

  for (const input of def.inputs) {
    if (typeof input.showIf === "function" && !input.showIf(r, ctx)) hidden.add(input.id);
  }
  for (const input of def.inputs) {
    const isNumeric = NUMERIC_KINDS.has(input.kind);
    if (hidden.has(input.id)) { values[input.id] = isNumeric ? NaN : r[input.id]; continue; }
    if (!isNumeric) { values[input.id] = String(r[input.id] ?? "").trim(); continue; }

    const blank = String(r[input.id] ?? "").trim() === "";
    let v = parseValue(input, r[input.id], ctx.units, r);
    if (blank && typeof input.auto === "function") {
      v = input.auto(r, ctx, values);
      placeholder[input.id] = Number.isFinite(v) ? `auto ${ctx.fmt(v, input.places ?? 4)}` : "";
      values[`${input.id}Auto`] = true;
      if (!Number.isFinite(v)) invalid.add(input.id);
    } else if (blank && input.optional) {
      placeholder[input.id] = input.placeholder || "optional";
      v = NaN;
    } else if (!Number.isFinite(v) || !inRange(input, v, ctx.units, r)) {
      // typed garbage is an error even in an optional field — silently ignoring it would hide a typo
      invalid.add(input.id);
      placeholder[input.id] = input.placeholder || "";
    }
    values[input.id] = v;
  }
  return { values, invalid, hidden, placeholder, raw: r };
}

/** Default raw values for a definition in a unit system (first run, Reset, and the tests). */
export function defaultRaw(def, overrides = {}, units = "in") {
  const raw = {};
  for (const input of def.inputs) raw[input.id] = overrides[input.id] ?? defaultFor(input, def.units === false ? "in" : units, raw);
  return raw;
}
