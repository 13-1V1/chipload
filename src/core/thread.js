// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread spec parsing and 60° thread geometry (Unified inch + ISO metric).

import { parseFraction } from "./format.js";
import { MACHINE_SCREW_DIAMETERS, UN_THREAD_TABLE } from "../data/threads-un.js";
import { METRIC_DEFAULT_PITCH, METRIC_THREAD_TABLE } from "../data/threads-metric.js";

/**
 * Basic 60° thread factors. Source: ASME B1.1 §5 / ISO 68-1.
 *   H = 0.866025 P (sharp-V height)
 *   basic pitch dia   D2 = D − 0.649519 P   (= D − 3H/4)
 *   basic minor dia (internal) D1 = D − 1.082532 P (= D − 5H/4)
 *   basic minor dia (external) d3 = D − 1.226869 P (= D − 17H/12, UN rounded root)
 */
export const BASIC_PITCH_DIAMETER_FACTOR = 0.6495190528;
export const BASIC_INTERNAL_MINOR_FACTOR = 1.0825317547;
export const BASIC_EXTERNAL_MINOR_FACTOR = 1.2268693;

/**
 * Parse "1/4-20", "1/4-20 UNC", "#10-32", "M10", "M10x1.5", "0.5-13".
 * → { system: "un"|"metric", major, tpi|pitch, label, suppliedSeries } or null.
 * Inch values in inches, metric in mm.
 */
export function parseThreadSpec(input) {
  let normalized = String(input ?? "").trim().toLowerCase().replace(/×/g, "x");
  const suffixMatch = normalized.match(/\s+(unc|unf|unef|unj|un)\s*$/i);
  const suppliedSeries = suffixMatch ? suffixMatch[1].toUpperCase() : null;
  normalized = normalized.replace(/\s+(unc|unf|unef|unj|un)\s*$/i, "").replace(/\s+/g, "");
  if (!normalized) return null;

  const machine = normalized.match(/^#?(\d{1,2})-(\d+(?:\.\d+)?)$/);
  if (machine) {
    const number = Number(machine[1]);
    const tpi = Number(machine[2]);
    const major = MACHINE_SCREW_DIAMETERS[number];
    if (major && tpi > 0) return { system: "un", major, tpi, label: `#${number}-${tpi}`, suppliedSeries };
  }

  const metric = normalized.match(/^m(\d+(?:\.\d+)?)[x-](\d+(?:\.\d+)?)$/i);
  if (metric) {
    return { system: "metric", major: Number(metric[1]), pitch: Number(metric[2]), label: `M${metric[1]}x${metric[2]}`, suppliedSeries: null };
  }

  const coarseMetric = normalized.match(/^m(\d+(?:\.\d+)?)$/i);
  if (coarseMetric) {
    const major = Number(coarseMetric[1]);
    const pitch = METRIC_DEFAULT_PITCH[major];
    if (pitch) return { system: "metric", major, pitch, label: `M${major}x${pitch}`, suppliedSeries: null };
  }

  const unified = normalized.match(/^([0-9.]+\/[0-9.]+|[0-9]+(?:\.[0-9]+)?)[-x](\d+(?:\.\d+)?)$/);
  if (unified) {
    const major = parseFraction(unified[1]);
    const tpi = Number(unified[2]);
    if (major > 0 && tpi > 0) return { system: "un", major, tpi, label: `${unified[1]}-${unified[2]}`, suppliedSeries };
  }
  return null;
}

/** Basic diameters for a 60° thread. `pitch` in the same unit as `major`. */
export function basicThreadGeometry(major, pitch) {
  const h = 0.8660254038 * pitch;
  return {
    major,
    pitch,
    sharpVHeight: h,
    pitchDiameter: major - BASIC_PITCH_DIAMETER_FACTOR * pitch,
    internalMinor: major - BASIC_INTERNAL_MINOR_FACTOR * pitch,
    externalMinor: major - BASIC_EXTERNAL_MINOR_FACTOR * pitch,
    threadDepthExternal: 0.6134 * pitch,
    threadDepthInternal: 0.5413 * pitch,
  };
}

/**
 * Estimated UN class limits. Source: ASME B1.1-2003 §8 tolerance formulas,
 * engagement length assumed 9P. Simplified — for acceptance work confirm
 * against the published B1.1 tables for the specific size.
 *   TD2 (2A) = 0.0015·D^(1/3) + 0.0015·√L + 0.015·P^(2/3)
 *   3A = 0.75·TD2 ; 2B = 1.30·TD2 ; 3B = 0.975·TD2 ; allowance (2A) = 0.30·TD2
 *   major tol: 2A = 0.060·P^(2/3), 3A = 0.040·P^(2/3)
 */
export function unToleranceEnvelope({ major, pitch }) {
  const g = basicThreadGeometry(major, pitch);
  const L = 9 * pitch;
  const TD2_2A = 0.0015 * Math.cbrt(major) + 0.0015 * Math.sqrt(L) + 0.015 * Math.pow(pitch, 2 / 3);
  const TD2_3A = 0.75 * TD2_2A;
  const TD2_2B = 1.30 * TD2_2A;
  const TD2_3B = 0.975 * TD2_2A;
  const allowance = 0.300 * TD2_2A;
  const majorTol2A = 0.060 * Math.pow(pitch, 2 / 3);
  const majorTol3A = 0.040 * Math.pow(pitch, 2 / 3);
  return {
    "2A": { pdMax: g.pitchDiameter - allowance, pdMin: g.pitchDiameter - allowance - TD2_2A, majorMax: major - allowance, majorMin: major - allowance - majorTol2A, tol: TD2_2A },
    "3A": { pdMax: g.pitchDiameter, pdMin: g.pitchDiameter - TD2_3A, majorMax: major, majorMin: major - majorTol3A, tol: TD2_3A },
    "2B": { pdMin: g.pitchDiameter, pdMax: g.pitchDiameter + TD2_2B, minorMin: g.internalMinor, minorMax: g.internalMinor + 0.25 * pitch, tol: TD2_2B },
    "3B": { pdMin: g.pitchDiameter, pdMax: g.pitchDiameter + TD2_3B, minorMin: g.internalMinor, minorMax: g.internalMinor + 0.2 * pitch, tol: TD2_3B },
  };
}

/** Standard-series name for a UN size, e.g. "1/4-20 UNC", or null. */
export function lookupUnThread(majorIn, tpi) {
  const TOL_D = 0.003, TOL_T = 0.5;
  const match = UN_THREAD_TABLE.find(([d, t]) => Math.abs(d - majorIn) < TOL_D && Math.abs(t - tpi) < TOL_T);
  return match ? match[2] : null;
}

export function lookupMetricThread(majorMm, pitchMm) {
  const TOL_D = 0.08, TOL_P = 0.08;
  const match = METRIC_THREAD_TABLE.find(([d, p]) => Math.abs(d - majorMm) < TOL_D && Math.abs(p - pitchMm) < TOL_P);
  return match ? match[2] : null;
}

// ── ISO metric class limits ───────────────────────────────────────────────────
// Source: ISO 965-1 tolerance formulas. D is taken as the geometric mean of the standard
// diameter group (as the published tables do). Values are estimates within a few µm of the tables.
const ISO_D_GROUPS = [0.99, 1.4, 2.8, 5.6, 11.2, 22.4, 45, 90, 180, 355];
function isoGroupMean(major) {
  for (let i = 1; i < ISO_D_GROUPS.length; i++) {
    if (major <= ISO_D_GROUPS[i]) return Math.sqrt(ISO_D_GROUPS[i - 1] * ISO_D_GROUPS[i]);
  }
  return major;
}
const GRADE_MULT = { 3: 0.5, 4: 0.63, 5: 0.8, 6: 1, 7: 1.25, 8: 1.6, 9: 2 };

/**
 * @param {object} p  major & pitch in mm
 * @param {string} [p.extPos="g"]  e | f | g | h
 * @param {number} [p.extGrade=6]
 * @param {string} [p.intPos="H"]  G | H
 * @param {number} [p.intGrade=6]
 * @returns limits in mm for the external (e.g. 6g) and internal (e.g. 6H) threads
 */
export function metricToleranceEnvelope({ major, pitch, extPos = "g", extGrade = 6, intPos = "H", intGrade = 6 }) {
  const Dm = isoGroupMean(major);
  const g = basicThreadGeometry(major, pitch);
  const Td2_6 = 90 * Math.pow(pitch, 0.4) * Math.pow(Dm, 0.1);            // µm, external PD, grade 6
  const TD2_6 = 1.32 * Td2_6;                                              // µm, internal PD, grade 6
  const Td_6 = 180 * Math.cbrt(pitch * pitch) - 3.15 / Math.sqrt(pitch);   // µm, external major, grade 6
  const TD1_6 = pitch >= 1 ? 230 * Math.pow(pitch, 0.7) : 433 * pitch - 190 * Math.pow(pitch, 1.22); // µm, internal minor
  const esTable = { e: 50 + 11 * pitch, f: 30 + 11 * pitch, g: 15 + 11 * pitch, h: 0 };
  const es = (esTable[extPos] ?? esTable.g) / 1000;
  const EI = (intPos === "G" ? 15 + 11 * pitch : 0) / 1000;
  const Td2 = Td2_6 * (GRADE_MULT[extGrade] ?? 1) / 1000;
  const Td = Td_6 * (GRADE_MULT[extGrade] ?? 1) / 1000;
  const TD2 = TD2_6 * (GRADE_MULT[intGrade] ?? 1) / 1000;
  const TD1 = TD1_6 * (GRADE_MULT[intGrade] ?? 1) / 1000;
  return {
    external: { label: `${extGrade}${extPos}`, majorMax: major - es, majorMin: major - es - Td, pdMax: g.pitchDiameter - es, pdMin: g.pitchDiameter - es - Td2, tolPd: Td2, allowance: es },
    internal: { label: `${intGrade}${intPos}`, minorMin: g.internalMinor + EI, minorMax: g.internalMinor + EI + TD1, pdMin: g.pitchDiameter + EI, pdMax: g.pitchDiameter + EI + TD2, tolPd: TD2 },
  };
}

// ── ACME (general purpose) ────────────────────────────────────────────────────
/**
 * Source: ASME B1.5 general-purpose Acme: 29° included angle, basic depth 0.5P,
 * root clearance 0.020 in on diameter for 10 TPI and coarser, 0.010 in for finer.
 * PD allowance (external): 2G 0.008√D, 3G 0.006√D, 4G 0.004√D. Inch units.
 */
export function acmeGeometry({ major, tpi }) {
  const pitch = 1 / tpi;
  const clearance = tpi <= 10 ? 0.020 : 0.010;
  return {
    pitch,
    depth: 0.5 * pitch,
    pitchDiameter: major - 0.5 * pitch,
    internalMinor: major - pitch,
    externalMinor: major - pitch - clearance,
    internalMajor: major + clearance,
    crestFlat: 0.3707 * pitch,
    rootFlat: 0.3707 * pitch - 0.259 * clearance,
    allowance: { "2G": 0.008 * Math.sqrt(major), "3G": 0.006 * Math.sqrt(major), "4G": 0.004 * Math.sqrt(major) },
  };
}

// ── STI (helical insert) tap drill ────────────────────────────────────────────
/**
 * Screw-thread-insert holes are oversize by roughly the wire section. Estimate: drill ≈ D + 0.35 P,
 * which lands on the insert makers' listed drills for common sizes (1/4-20 → 17/64, 3/8-16 → X, 1/2-13 → 17/32).
 * Always confirm with the insert maker's chart.
 */
export function stiTapDrill(major, pitch) {
  return major + 0.35 * pitch;
}
