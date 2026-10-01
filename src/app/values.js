// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Pure input parsing for calculator definitions (no DOM) so the renderer and Node tests share it.
// Nothing gets to compute() unless it is a real, in-range number or a choice that exists.

import { fmt, parseDimension, parseFraction } from "../core/format.js";

export const NUMERIC_KINDS = new Set(["length", "number", "int", "angle", "percent", "speed", "feed", "feedRev", "temp"]);
/** Kinds that can never be zero or negative: a speed or a feed of 0 is not a cut. */
const POSITIVE_KINDS = new Set(["speed", "feed", "feedRev"]);
/** Nothing in a machine shop is ten million of anything; beyond this it's a typo. */
const SANITY_LIMIT = 1e7;

/**
 * What a numeric field measures right now. Usually that is its kind; a field whose meaning changes
 * with a mode ("second value" = a side or an angle) says so with as(raw). Drives the unit label,
 * how text is parsed, and what a unit switch does to the number.
 */
export const measureOf = (input, raw = {}) => (typeof input.as === "function" ? input.as(raw) : input.kind);

/** A field's label; label(raw) lets it follow a mode ("Run (adjacent)" instead of "First value"). */
export const labelOf = (input, raw = {}) => (typeof input.label === "function" ? input.label(raw) : input.label);

export function parseValue(input, text, units, raw) {
  const t = String(text ?? "").trim();
  if (!NUMERIC_KINDS.has(input.kind)) return t;
  if (!t) return NaN;
  if (measureOf(input, raw) === "length") return parseDimension(t, units);
  const v = parseFraction(t);
  return input.kind === "int" ? Math.round(v) : v;
}

/**
 * Re-express typed text when the unit system flips, so the number keeps meaning the same cut:
 * lengths and feeds ×25.4, surface speed SFM ⇄ m/min, temperature °F ⇄ °C.
 * Blank text, text that isn't a number, and unitless measures are returned as they came.
 */
export function convertForUnits(measure, text, from, to) {
  if (from === to || String(text ?? "").trim() === "") return text;
  const toMm = to === "mm";
  if (measure === "length" || measure === "feed" || measure === "feedRev") {
    const v = measure === "length" ? parseDimension(text, from) : parseFraction(text);
    if (!Number.isFinite(v)) return text;
    const places = measure === "feed" ? (toMm ? 1 : 2) : (toMm ? 3 : (measure === "feedRev" ? 5 : 4));
    return fmt(toMm ? v * 25.4 : v / 25.4, places);
  }
  if (measure === "speed") {
    const v = parseFraction(text);
    return Number.isFinite(v) ? fmt(toMm ? v / 3.28084 : v * 3.28084, toMm ? 1 : 0) : text;
  }
  if (measure === "temp") {
    const v = parseFraction(text);
    return Number.isFinite(v) ? fmt(toMm ? (v - 32) * 5 / 9 : v * 9 / 5 + 32, 1) : text;
  }
  return text;
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

function inRange(input, v) {
  if (Math.abs(v) > (input.limit ?? SANITY_LIMIT)) return false;
  if (input.min != null && v < input.min) return false;
  if (input.max != null && v > input.max) return false;
  if ((input.positive || POSITIVE_KINDS.has(input.kind)) && !(v > 0)) return false;
  return true;
}

/** A field's name the way a sentence wants it: "Diameter (tool — or the part, on a lathe)" → "Diameter". */
export const plainLabel = (input, raw) => String(labelOf(input, raw) || "that field").replace(/\s*\(.*?\)/g, "").trim() || "that field";

/**
 * One plain sentence for why a field can't be used. `value` is what buildValues parsed from `text`.
 * Names the field, because it may be folded away under "More options" where a highlight can't be seen.
 */
export function invalidReason(input, value, text, raw) {
  const name = plainLabel(input, raw);
  const typed = String(text ?? "").trim();
  if (!typed) return `Enter ${name}`;
  if (!Number.isFinite(value)) return `Check ${name} — "${typed.length > 12 ? `${typed.slice(0, 12)}…` : typed}" isn't a number`;
  const mustBePositive = input.positive || POSITIVE_KINDS.has(input.kind) || (input.min > 0 && input.min < 1);
  if (value <= 0 && mustBePositive) return `${name} has to be more than zero`;
  if (input.min != null && value < input.min) return `${name} can't be less than ${fmt(input.min, 4)}`;
  if (input.max != null && value > input.max) return `${name} can't be more than ${fmt(input.max, 4)}`;
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
    } else if (!Number.isFinite(v) || !inRange(input, v)) {
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
