// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Pure input parsing for calculator definitions (no DOM) so the renderer and Node tests share it.

import { parseDimension, parseFraction } from "../core/format.js";

export const NUMERIC_KINDS = new Set(["length", "number", "int", "angle", "percent", "speed", "feed", "feedRev"]);

export function parseValue(input, raw, units) {
  const text = String(raw ?? "").trim();
  if (!NUMERIC_KINDS.has(input.kind)) return text;
  if (!text) return NaN;
  if (input.kind === "length") return parseDimension(text, units);
  const v = parseFraction(text);
  return input.kind === "int" ? Math.round(v) : v;
}

/** Options for a select, static or derived from current raw values. */
export function optionsFor(input, raw, ctx) {
  return typeof input.options === "function" ? input.options(raw, ctx) : input.options;
}

/**
 * Turn raw text inputs into typed values.
 * @returns {{ values: object, invalid: Set<string>, hidden: Set<string>, placeholder: object }}
 */
export function buildValues(def, raw, ctx) {
  const values = {};
  const invalid = new Set();
  const hidden = new Set();
  const placeholder = {};
  for (const input of def.inputs) {
    if (typeof input.showIf === "function" && !input.showIf(raw, ctx)) hidden.add(input.id);
  }
  for (const input of def.inputs) {
    if (hidden.has(input.id)) { values[input.id] = NaN; continue; }
    let v = parseValue(input, raw[input.id], ctx.units);
    const isNumeric = NUMERIC_KINDS.has(input.kind);
    if (isNumeric && Number.isNaN(v) && typeof input.auto === "function") {
      v = input.auto(raw, ctx, values);
      placeholder[input.id] = Number.isFinite(v) ? `auto ${ctx.fmt(v, input.places ?? 4)}` : "";
      values[`${input.id}Auto`] = true;
    } else if (isNumeric && Number.isNaN(v) && input.optional) {
      placeholder[input.id] = input.placeholder || "optional";
    } else if (isNumeric && !Number.isFinite(v)) {
      invalid.add(input.id);
      placeholder[input.id] = input.placeholder || "";
    } else if (isNumeric && ((input.min != null && v < input.min) || (input.max != null && v > input.max))) {
      invalid.add(input.id);
    } else if (input.kind === "select") {
      const opts = optionsFor(input, raw, ctx);
      if (!opts.some((o) => o.value === v)) v = opts[0]?.value ?? "";
    }
    values[input.id] = v;
  }
  return { values, invalid, hidden, placeholder };
}

/** Default raw values for a definition (used by tests and first run). */
export function defaultRaw(def, overrides = {}) {
  const raw = {};
  for (const input of def.inputs) raw[input.id] = overrides[input.id] ?? input.default ?? "";
  return raw;
}
