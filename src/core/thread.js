// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread spec parsing and 60° thread geometry (Unified inch + ISO metric).

import { parseFraction } from "./format.js";
import { MACHINE_SCREW_DIAMETERS, UN_THREAD_TABLE } from "../data/threads-un.js";
import { METRIC_DEFAULT_PITCH, METRIC_THREAD_TABLE } from "../data/threads-metric.js";
import { STI_DRILL_UN, STI_DRILL_METRIC } from "../data/sti.js";

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

// Standard machine-screw pitches, e.g. "#10" → [24, 32]. Tells "2-56" (a #2 screw) from "2-4.5" (a 2 inch thread).
const MACHINE_PITCHES = (() => {
  const map = {};
  for (const [major, tpi] of UN_THREAD_TABLE) {
    const num = Object.keys(MACHINE_SCREW_DIAMETERS).find((n) => Math.abs(MACHINE_SCREW_DIAMETERS[n] - major) < 1e-9);
    if (num !== undefined) (map[num] ||= []).push(tpi);
  }
  return map;
})();

/**
 * Parse a thread callout the way it is written on a print:
 *   "1/4-20", "1/4-20 UNC-2B", "#10-32", "10-32", ".250-20", "1-8", "1 1/8-7", "1-1/8-7", "M10", "M10x1.5-6H".
 * → { system: "un"|"metric", major, tpi|pitch, label, suppliedSeries } or null. Inch values in inches, metric in mm.
 * A bare integer size is a numbered screw only when the pitch says so ("2-56" is #2-56; "2-4.5" is 2"-4.5; "1-8" is 1"-8).
 */
export function parseThreadSpec(input) {
  let s = String(input ?? "").trim().toLowerCase().replace(/[×✕]/g, "x").replace(/["”″]/g, "");
  if (!s || s.length > 40) return null;
  // series / class / hand suffixes: "UNC", "UNF-2B", "-6H", "6g", "LH", "STI"
  let suppliedSeries = null;
  const series = s.match(/\s*-?\s*\b(unjc|unjf|unj|unef|unc|unf|uns|un|nc|nf)\b/);
  if (series) { suppliedSeries = series[1].toUpperCase().replace(/^N([CF])$/, "UN$1"); s = s.replace(series[0], " "); }
  const isMetric = /^m/.test(s);
  s = s.replace(/\s*-?\s*\b[123][ab]\b/g, " ")
       .replace(/\s*-?\s*\b\d[a-h](?:\d[a-h])?(?:\/\d[a-h])?\b/g, (m) => (isMetric ? " " : m))
       .replace(/\b(lh|rh|sti)\b/g, " ")
       .trim();
  if (!s) return null;

  // metric: M10, M10x1.5, M10-1.5, M10 x 1.5
  const metric = s.match(/^m\s*(\d+(?:\.\d+)?)(?:\s*[x-]\s*(\d*\.?\d+))?$/);
  if (metric) {
    const major = Number(metric[1]);
    const pitch = metric[2] !== undefined ? Number(metric[2]) : METRIC_DEFAULT_PITCH[major];
    if (!(major > 0) || !(pitch > 0) || pitch >= major) return null;
    return { system: "metric", major, pitch, label: `M${major}x${pitch}`, suppliedSeries: null };
  }

  // explicit machine screw: #10-32
  const hash = s.match(/^#\s*(\d{1,2})\s*[-x]\s*(\d+(?:\.\d+)?)$/);
  if (hash) {
    const number = Number(hash[1]), tpi = Number(hash[2]);
    const major = MACHINE_SCREW_DIAMETERS[number];
    return major && tpi > 0 ? { system: "un", major, tpi, label: `#${number}-${tpi}`, suppliedSeries } : null;
  }

  // inch: "1/4-20", "1 1/8-7", "1-1/8-7", ".250-20", "1.125-7", "1-8", and bare numbered screws "10-32"
  const inch = s.match(/^(\d+\s*[-\s]\s*\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)\s*[-x]\s*(\d+(?:\.\d+)?)$/);
  if (!inch) return null;
  const sizeText = inch[1].trim();
  const tpi = Number(inch[2]);
  if (!(tpi > 0)) return null;
  if (/^\d+$/.test(sizeText)) {
    const number = Number(sizeText);
    const std = MACHINE_PITCHES[number];
    if (std && (std.includes(tpi) || (number >= 4 && tpi >= 20))) {
      return { system: "un", major: MACHINE_SCREW_DIAMETERS[number], tpi, label: `#${number}-${tpi}`, suppliedSeries };
    }
  }
  const mixed = sizeText.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/);
  const major = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : parseFraction(sizeText);
  if (!(major > 0) || !Number.isFinite(major) || major > 24) return null;
  const sizeLabel = mixed ? `${mixed[1]}-${mixed[2]}/${mixed[3]}` : sizeText.replace(/^\./, "0.");
  return { system: "un", major, tpi, label: `${sizeLabel}-${inch[2]}`, suppliedSeries };
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
 * UN class limits from the ASME B1.1 tolerance formulas (§8), inch units.
 *   Td2 (2A) = 0.0015 ∛D + 0.0015 √LE + 0.015 ∛P²        pitch-diameter tolerance
 *   3A = 0.75 Td2    2B = 1.30 Td2    3B = 0.975 Td2    allowance (2A) = 0.30 Td2
 *   major-diameter tolerance, 2A and 3A = 0.060 ∛P²
 *   minor-diameter tolerance, internal:
 *     2B: under 1/4 in → 0.05 ∛P² + 0.03 P/D − 0.002, held between 0.25P − 0.4P² and 0.394P;
 *         1/4 in and up → 0.25P − 0.4P² (0.15P coarser than 4 TPI)
 *     3B: 0.05 ∛P² + 0.03 P/D − 0.002, not over 0.394P, not under 0.23P − 1.5P² (0.120P for 12 TPI and coarser)
 * LE is the length of engagement the published tables assume: one diameter for UNC, UNF and the
 * 4-, 6- and 8-thread series; nine pitches for UNEF, the finer constant-pitch series and specials.
 * Like the published tables, each allowance and tolerance is rounded to 0.0001 in before it is applied
 * to the basic size, so the pitch- and major-diameter limits reproduce the B1.1 tables.
 */
export function unToleranceEnvelope({ major, pitch }) {
  const g = basicThreadGeometry(major, pitch);
  const tpi = 1 / pitch;
  const cbrtP2 = Math.cbrt(pitch * pitch);
  const series = lookupUnThread(major, tpi);
  const oneDiameter = (series && /UN[CF]$/.test(series)) || [4, 6, 8].some((n) => Math.abs(tpi - n) < 1e-6);
  const LE = oneDiameter ? major : 9 * pitch;
  // B1.1 rounding: work to six places, publish to four.
  const r4 = (x) => Math.round(x * 1e4) / 1e4, r6 = (x) => Math.round(x * 1e6) / 1e6;
  const td2 = r6(0.0015 * Math.cbrt(major) + 0.0015 * Math.sqrt(LE) + 0.015 * cbrtP2);
  const TD2_2A = r4(td2);
  const TD2_3A = r4(r6(0.75 * td2));
  const TD2_2B = r4(r6(1.30 * td2));
  const TD2_3B = r4(r6(0.975 * td2));
  const allowance = r4(r6(0.300 * td2));
  const majorTol = r4(r6(0.060 * cbrtP2));
  const pd = r4(g.pitchDiameter);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const smallFormula = 0.05 * cbrtP2 + 0.03 * pitch / major - 0.002;
  const minorTol2B = major < 0.25
    ? clamp(smallFormula, 0.25 * pitch - 0.4 * pitch * pitch, 0.394 * pitch)
    : (tpi >= 4 ? 0.25 * pitch - 0.4 * pitch * pitch : 0.15 * pitch);
  const minorTol3B = clamp(smallFormula, tpi >= 13 ? 0.23 * pitch - 1.5 * pitch * pitch : 0.120 * pitch, 0.394 * pitch);
  return {
    "2A": { pdMax: pd - allowance, pdMin: pd - allowance - TD2_2A, majorMax: major - allowance, majorMin: major - allowance - majorTol, tol: TD2_2A, allowance },
    "3A": { pdMax: pd, pdMin: pd - TD2_3A, majorMax: major, majorMin: major - majorTol, tol: TD2_3A, allowance: 0 },
    "2B": { pdMin: pd, pdMax: pd + TD2_2B, minorMin: g.internalMinor, minorMax: g.internalMinor + minorTol2B, tol: TD2_2B },
    "3B": { pdMin: pd, pdMax: pd + TD2_3B, minorMin: g.internalMinor, minorMax: g.internalMinor + minorTol3B, tol: TD2_3B },
    engagement: LE,
  };
}

/** Standard-series name for a UN size, e.g. "1/4-20 UNC", or null. */
export function lookupUnThread(majorIn, tpi) {
  const TOL_D = 0.003, TOL_T = 0.01;
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
 * Screw-thread-insert hole. Published rows come from ASME B18.29.1 (src/data/sti.js); anything else
 * falls back to the estimate drill ≈ D + 0.25 P, which tracks the table within one drill size.
 * Returns { size, label, source: "table" | "estimate" } in the thread's native unit.
 */
export function stiTapDrill(major, pitch, { isUn = true, tpi = null } = {}) {
  if (isUn && tpi != null) {
    const row = STI_DRILL_UN[`${major.toFixed(4)}|${Math.round(tpi)}`];
    if (row) return { size: row[0], label: row[1], source: "table" };
  }
  if (!isUn) {
    const mm = STI_DRILL_METRIC[`${major.toFixed(1)}|${pitch.toFixed(2)}`];
    if (mm) return { size: mm, label: `${mm} mm`, source: "table" };
  }
  return { size: major + 0.25 * pitch, label: null, source: "estimate" };
}
