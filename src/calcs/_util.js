// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Shared helpers for calculator definitions: unit conversion and thread normalization.

import { parseThreadSpec, threadSpecProblem } from "../core/thread.js";
import { fmt } from "../core/format.js";

export const toIn = (v, units) => (units === "in" ? v : v / 25.4);
export const fromIn = (v, units) => (units === "in" ? v : v * 25.4);
export const toSfm = (v, units) => (units === "in" ? v : v * 3.28084);
export const fromSfm = (v, units) => (units === "in" ? v : v / 3.28084);
export const lenPlaces = (units) => (units === "in" ? 4 : 3);

/**
 * Parse a thread spec and return everything in inches plus the native system. Throws a friendly error: the plain
 * reason when the callout can't exist (pitch too coarse for the diameter), else how to type one. A thread that
 * parses but is unusual carries `caution` — every tool that calls this shows it once in its warnings.
 */
export function threadFromSpec(text) {
  const t = parseThreadSpec(text);
  if (!t) throw new Error(threadSpecProblem(text) || "Type a thread like 1/4-20, #10-32, or M10x1.5");
  const isUn = t.system === "un";
  const majorIn = isUn ? t.major : t.major / 25.4;
  const pitchIn = isUn ? 1 / t.tpi : t.pitch / 25.4;
  return {
    ...t,
    isUn,
    majorIn, pitchIn,
    tpi: isUn ? t.tpi : 25.4 / t.pitch,
    pitchMm: isUn ? 25.4 / t.tpi : t.pitch,
    majorMm: isUn ? t.major * 25.4 : t.major,
    nativeUnits: isUn ? "in" : "mm",
    pitchLabel: isUn ? `${t.tpi} TPI` : `${t.pitch} mm pitch`,
  };
}

/** "0.2010 in (5.105 mm)" style dual readout. */
export function dual(valueIn, units) {
  return units === "in" ? `${fmt(valueIn, 4)} in (${fmt(valueIn * 25.4, 3)} mm)` : `${fmt(valueIn * 25.4, 3)} mm (${fmt(valueIn, 4)} in)`;
}

/** The threads people reach for most — shown as one-tap chips under every thread field. */
export const COMMON_THREADS = Object.freeze(["#6-32", "#8-32", "#10-24", "#10-32", "1/4-20", "5/16-18", "3/8-16", "1/2-13", "M4", "M5", "M6", "M8", "M10"]);
export const COMMON_METRIC_THREADS = Object.freeze(["M3", "M4", "M5", "M6", "M8", "M10", "M12", "M16"]);

/** Common thread-spec prefill for search: returns { params, label } or null. */
export function threadPrefill(q, key = "thread") {
  const t = parseThreadSpec(q);
  return t ? { params: { [key]: q.trim() }, label: t.label } : null;
}
