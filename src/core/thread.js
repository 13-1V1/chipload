// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread spec parsing and 60° thread geometry (Unified inch + ISO metric).

import { parseFraction } from "./format.js";
import { MACHINE_SCREW_DIAMETERS, UN_THREAD_TABLE, UN_CONSTANT_PITCH_START, UN_LIMIT_OVERRIDES } from "../data/threads-un.js";
import { METRIC_DEFAULT_PITCH, METRIC_THREAD_TABLE, ISO965_DEVIATIONS, ISO965_TD1, ISO965_TD, ISO965_TD2, ISO965_TD2_EXT } from "../data/threads-metric.js";
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

// Series written after the pitch, with or without a space: "UNC", "20UNC", "UNRC" (rolled-root bolts), "UNJF", "NC".
// UNR and UNJ share the UN basic sizes and series; the base series (UNRC → UNC) is what the tables are keyed on.
const SERIES_RE = /\s*-?\s*(unjef|unjc|unjf|unj|unref|unrc|unrf|unr|unef|unc|unf|uns|un|nef|nc|nf|ns)(?![a-z])/;
const OLD_SERIES = { NC: "UNC", NF: "UNF", NEF: "UNEF", NS: "UNS" };
/** "UNRC" → "UNC", "UNJF" → "UNF", "UNR" → "UN", "NC" → "UNC". */
export const baseSeries = (series) => (series ? OLD_SERIES[series] || series.replace(/^UN[RJ]/, "UN") : null);

/**
 * Parse a thread callout the way it is written on a print:
 *   "1/4-20", "1/4-20 UNC-2B", "1/4-20UNC", "#10-32UNF", "1/4-20 UNRC-2A", "1/2-20UNF-2ALH", "1/4-20 UNC-2A-LH", "#10-32", "10-32",
 *   ".250-20", "1-8", "1 1/8-7", "1-1/8-7", "M10", "M10x1.5-6H", "M10x1.5-6H-LH".
 * → { system: "un"|"metric", major, tpi|pitch, label, suppliedSeries, caution } or null. Inch values in inches, metric in mm.
 * A bare integer size is a numbered screw only when the pitch says so ("2-56" is #2-56; "2-4.5" is 2"-4.5; "1-8" is 1"-8).
 * A thread that cannot exist (the 60° form leaves no metal at the root: D − 1.226869 P ≤ 0) is null;
 * threadSpecProblem() says why. `caution` is a sentence when the pitch is coarser than any standard series.
 */
export function parseThreadSpec(input) {
  const t = parseThreadParts(input);
  return t && !t.impossible ? t : null;
}

/** Why a callout was refused, in plain words, or null when it isn't a thread callout at all. */
export function threadSpecProblem(input) {
  const t = parseThreadParts(input);
  if (!t?.impossible) return null;
  return `${t.label} can't be cut: that pitch is too coarse for the diameter (no metal left under the thread). Check the ${t.system === "un" ? "threads per inch" : "pitch"}.`;
}

function parseThreadParts(input) {
  let s = String(input ?? "").trim().toLowerCase().replace(/[×✕]/g, "x").replace(/["”″]/g, "");
  if (!s || s.length > 40) return null;
  // series / class / hand suffixes: "UNC", "UNF-2B", "UNRC-2A", "-6H", "6g", "LH", "2ALH", "STI"
  let suppliedSeries = null;
  const series = s.match(SERIES_RE);
  if (series) { suppliedSeries = series[1].toUpperCase(); suppliedSeries = OLD_SERIES[suppliedSeries] || suppliedSeries; s = s.replace(series[0], " "); }
  const isMetric = /^m/.test(s);
  s = s.replace(/\s*-?\s*\b[123][ab](?=$|[\s-]|lh|rh)/g, " ")
       .replace(/\s*-?\s*\b\d[a-h](?:\d[a-h])?(?:\/\d[a-h])?\b/g, (m) => (isMetric ? " " : m))
       .replace(/\s*-?\s*(?:\b|(?<=\d))(lh|rh|sti)\b/g, " ") // B1.1 / ISO left hand: "-2A-LH", "-6H-LH"
       .replace(/[\s-]+$/, "")
       .trim();
  if (!s) return null;

  // metric: M10, M10x1.5, M10-1.5, M10 x 1.5
  const metric = s.match(/^m\s*(\d+(?:\.\d+)?)(?:\s*[x-]\s*(\d*\.?\d+))?$/);
  if (metric) {
    const major = Number(metric[1]);
    const pitch = metric[2] !== undefined ? Number(metric[2]) : METRIC_DEFAULT_PITCH[major];
    if (!(major > 0) || !(pitch > 0) || pitch >= major) return null;
    return finish({ system: "metric", major, pitch, label: `M${major}x${pitch}`, suppliedSeries: null });
  }

  // explicit machine screw: #10-32
  const hash = s.match(/^#\s*(\d{1,2})\s*[-x]\s*(\d+(?:\.\d+)?)$/);
  if (hash) {
    const number = Number(hash[1]), tpi = Number(hash[2]);
    const major = MACHINE_SCREW_DIAMETERS[number];
    return major && tpi > 0 ? finish({ system: "un", major, tpi, label: `#${number}-${tpi}`, suppliedSeries }) : null;
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
      return finish({ system: "un", major: MACHINE_SCREW_DIAMETERS[number], tpi, label: `#${number}-${tpi}`, suppliedSeries });
    }
  }
  const mixed = sizeText.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/);
  const major = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : parseFraction(sizeText);
  if (!(major > 0) || !Number.isFinite(major) || major > 24) return null;
  const sizeLabel = mixed ? `${mixed[1]}-${mixed[2]}/${mixed[3]}` : sizeText.replace(/^\./, "0.");
  return finish({ system: "un", major, tpi, label: `${sizeLabel}-${inch[2]}`, suppliedSeries });
}

/**
 * Pitch sanity, ASME B1.1 §5 / ISO 68-1 basic profile: the external minor d3 = D − 1.226869 P must stay above 0.
 * The coarsest standard pitches run about D/4.5 (UN #4-40, 1/4-20) to D/4 (M1x0.25), so anything coarser than D/4
 * is flagged; ISO 965 tolerances only exist for 0.2 to 8 mm pitches.
 */
function finish(t) {
  const pitch = t.system === "un" ? 1 / t.tpi : t.pitch;
  const impossible = t.major - BASIC_EXTERNAL_MINOR_FACTOR * pitch <= 0;
  let caution = null;
  if (!impossible && pitch > t.major / 4 + 1e-9) {
    caution = `${t.label} is coarser than any standard thread (pitch over a quarter of the diameter). Check the ${t.system === "un" ? "threads per inch" : "pitch"}.`;
  } else if (t.system === "metric" && (pitch < 0.2 - 1e-9 || pitch > 8 + 1e-9)) {
    caution = `${t.label}: ISO metric threads run from 0.2 to 8 mm pitch. Check the pitch.`;
  }
  return { ...t, impossible, caution };
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

const r3 = (x) => Math.round(Number((x * 1e3).toFixed(6))) / 1e3;
const r4 = (x) => Math.round(x * 1e4) / 1e4, r6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * UN class limits from the ASME B1.1 tolerance formulas (§8), inch units.
 *   Td2 (2A) = 0.0015 ∛D + 0.0015 √LE + 0.015 ∛P²        pitch-diameter tolerance
 *   3A = 0.75 Td2    2B = 1.30 Td2    3B = 0.975 Td2    allowance (2A) = 0.30 Td2
 *   major-diameter tolerance, 2A and 3A = 0.060 ∛P²
 *   minor-diameter tolerance, internal:
 *     2B: under 1/4 in → 0.05 ∛P² + 0.03 P/D − 0.002, held between 0.25P − 0.4P² and 0.394P;
 *         1/4 in and up → 0.25P − 0.4P² (0.15P coarser than 4 TPI)
 *     3B: 0.05 ∛P² + 0.03 P/D − 0.002, not over 0.394P, not under 0.23P − 1.5P² (0.120P for 12 TPI and coarser)
 * LE is the length of engagement the published tables assume: one diameter for UNC, UNF, 1-14 UNS and the
 * 4-, 6- and 8-thread series; nine pitches for UNEF, the finer constant-pitch series and specials.
 * Rounding the way the tables print: each allowance and tolerance is worked to six places and rounded to
 * 0.0001 in before it is applied to the basic size. Minor diameters: basic minor and tolerance to 0.0001 in;
 * from #6 (0.138 in) up the 2B min/max and 3B min are printed to 0.001 in, the 3B max to 0.0001 in
 * (1/4-20: 2B 0.196/0.207, 3B 0.1960/0.2067). The handful of standard rows the B1.1 tables smoothed by hand
 * (off the rounded formula by 0.0001–0.0002 in) take their published values from UN_LIMIT_OVERRIDES.
 * `raw: true` skips those overrides (used to regenerate them).
 */
export function unToleranceEnvelope({ major, pitch, raw = false }) {
  const g = basicThreadGeometry(major, pitch);
  const tpi = 1 / pitch;
  const cbrtP2 = Math.cbrt(pitch * pitch);
  const row = unThreadRow(major, tpi);
  const oneDiameter = row?.[3] === "D" || (row && /UN[CF]$/.test(row[2])) || [4, 6, 8].some((n) => Math.abs(tpi - n) < 1e-6);
  const LE = oneDiameter ? major : 9 * pitch;
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
  const bm = r4(g.internalMinor), t2 = r4(minorTol2B), t3 = r4(minorTol3B);
  const threePlace = major >= 0.138 - 1e-9;
  const minorMin = threePlace ? r3(bm) : bm;
  const env = {
    "2A": { pdMax: pd - allowance, pdMin: pd - allowance - TD2_2A, majorMax: major - allowance, majorMin: major - allowance - majorTol, tol: TD2_2A, allowance },
    "3A": { pdMax: pd, pdMin: pd - TD2_3A, majorMax: major, majorMin: major - majorTol, tol: TD2_3A, allowance: 0 },
    "2B": { pdMin: pd, pdMax: pd + TD2_2B, minorMin, minorMax: threePlace ? r3(bm + t2) : r4(bm + t2), tol: TD2_2B },
    "3B": { pdMin: pd, pdMax: pd + TD2_3B, minorMin, minorMax: r4(bm + t3), tol: TD2_3B },
    engagement: LE,
  };
  const over = !raw && UN_LIMIT_OVERRIDES[`${major.toFixed(4)}|${Math.round(tpi * 1000) / 1000}`];
  if (over) {
    if (over["2A"]) {
      const [max, min] = over["2A"], allow = r4(pd - max);
      Object.assign(env["2A"], { pdMax: max, pdMin: min, tol: r4(max - min), allowance: allow, majorMax: major - allow, majorMin: major - allow - majorTol });
    }
    if (over["3A"]) Object.assign(env["3A"], { pdMin: over["3A"][1], tol: r4(pd - over["3A"][1]) });
    for (const cls of ["2B", "3B"]) if (over[cls]) Object.assign(env[cls], { pdMax: over[cls][1], tol: r4(over[cls][1] - pd) });
  }
  return env;
}

/** The UN_THREAD_TABLE row for a size, or null. */
export function unThreadRow(majorIn, tpi) {
  return UN_THREAD_TABLE.find(([d, t]) => Math.abs(d - majorIn) < 0.0005 && Math.abs(t - tpi) < 0.001) ?? null;
}

/** '1-1/16', '7/16', '2' for an inch size on a 1/64 grid. */
function inchSizeLabel(d) {
  const whole = Math.floor(d + 1e-9);
  let n = Math.round((d - whole) * 64), den = 64;
  if (!n) return `${whole}`;
  while (n % 2 === 0) { n /= 2; den /= 2; }
  return whole ? `${whole}-${n}/${den}` : `${n}/${den}`;
}

/**
 * Standard-series name for a UN size, e.g. "1/4-20 UNC" or "1-1/16-12 UN", or null.
 * Constant-pitch sizes follow ASME B1.1 Table 1: 1/16 in steps to 2 in, 1/8 in to 4 in, 1/4 in to 6 in,
 * from the size where that pitch is the UNC (or UNF) pitch.
 */
export function lookupUnThread(majorIn, tpi) {
  const row = unThreadRow(majorIn, tpi);
  if (row) return row[2];
  const start = UN_CONSTANT_PITCH_START[tpi];
  if (start === undefined || majorIn < start - 1e-6) return null;
  const step = majorIn <= 2 + 1e-9 ? 1 / 16 : majorIn <= 4 + 1e-9 ? 1 / 8 : majorIn <= 6 + 1e-9 ? 1 / 4 : 0;
  if (!step || Math.abs(majorIn / step - Math.round(majorIn / step)) > 1e-6) return null;
  return `${inchSizeLabel(majorIn)}-${tpi} UN`;
}

/** ISO 261 name for a metric size, e.g. "M12x1.5 (fine)", or null. ISO pitches sit 0.05 mm apart, so the match is exact. */
export function lookupMetricThread(majorMm, pitchMm) {
  const match = METRIC_THREAD_TABLE.find(([d, p]) => Math.abs(d - majorMm) < 0.001 && Math.abs(p - pitchMm) < 0.001);
  return match ? match[2] : null;
}

// ── ISO metric class limits ───────────────────────────────────────────────────
// Source: ISO 965-1:1998 Tables 1 and 3–6 (src/data/threads-metric.js), the values ISO 965-2 builds its 6g/6H
// limits from. A pitch the tables don't list for that diameter range falls back to the §13 formulas, rounded
// to the R 40 series the way §13 says the tables were made; the result says so (fromFormula).
const ISO_D_GROUPS = [0.99, 1.4, 2.8, 5.6, 11.2, 22.4, 45, 90, 180, 355];
const R40 = [100, 106, 112, 118, 125, 132, 140, 150, 160, 170, 180, 190, 200, 212, 224, 236, 250, 265, 280, 300, 315, 335, 355, 375, 400, 425, 450, 475, 500, 530, 560, 600, 630, 670, 710, 750, 800, 850, 900, 950];
/** Nearest R 40 preferred number, then to a whole µm (ISO 965-1 §13). */
function r40(x) {
  let best = 0;
  for (const scale of [0.01, 0.1, 1, 10]) for (const v of R40) if (Math.abs(v * scale - x) < Math.abs(best - x)) best = v * scale;
  return Math.round(best);
}
const pitchKey = (p) => String(Number(p.toFixed(4)));
const EXT_GRADES = { td: [4, 6, 8], td2: [3, 4, 5, 6, 7, 8, 9] };
const GRADE_TD2_EXT = { 3: 0.5, 4: 0.63, 5: 0.8, 6: 1, 7: 1.25, 8: 1.6, 9: 2 };      // §13.4.1
const GRADE_TD2_INT = { 4: 0.85, 5: 1.06, 6: 1.32, 7: 1.7, 8: 2.12 };                 // §13.4.2, × Td2(6)
const GRADE_TD1 = { 4: 0.63, 5: 0.8, 6: 1, 7: 1.25, 8: 1.6 };                         // §13.3.2
const GRADE_TD = { 4: 0.63, 6: 1, 8: 1.6 };                                           // §13.3.1

/** ISO 965-1 Tables 8 and 9: the recommended classes (single-grade ones the app can enter). */
export const ISO965_RECOMMENDED = Object.freeze({ external: ["4g", "4h", "6e", "6f", "6g", "6h", "8e", "8g"], internal: ["4H", "5H", "6H", "7H", "8H", "5G", "6G", "7G", "8G"] });

/** ISO 965-1 tolerances in µm for one size and class, from the tables (or the §13 formulas when the table has no row). */
export function iso965Tolerances({ major, pitch, extPos = "g", extGrade = 6, intPos = "H", intGrade = 6 }) {
  if (!(major > ISO_D_GROUPS[0] && major <= 355)) throw new Error("ISO 965 class limits cover M1 to M355.");
  if (pitch < 0.2 - 1e-9 || pitch > 8 + 1e-9) throw new Error("ISO 965 class limits cover 0.2 to 8 mm pitch. Check the pitch.");
  const gi = ISO_D_GROUPS.findIndex((d, i) => i > 0 && major <= d);
  const [lo, hi] = [ISO_D_GROUPS[gi - 1], ISO_D_GROUPS[gi]];
  const key = pitchKey(pitch);
  const dev = ISO965_DEVIATIONS[key], td1 = ISO965_TD1[key], td = ISO965_TD[key];
  const td2Row = ISO965_TD2.find(([a, b]) => a === lo && b === hi)?.[2][key];
  const td2ExtRow = ISO965_TD2_EXT.find(([a, b]) => a === lo && b === hi)?.[2][key];
  const fromFormula = !dev || !td2Row || !td2ExtRow;
  // §13 formulas (µm), used only where the table has no row for this pitch
  const Td2_6 = td2ExtRow ? td2ExtRow[3] : r40(90 * Math.pow(pitch, 0.4) * Math.pow(Math.sqrt(lo * hi), 0.1));
  const formula = {
    G: r40(15 + 11 * pitch), e: r40(50 + 11 * pitch), f: r40(30 + 11 * pitch), g: r40(15 + 11 * pitch),
    td: (n) => r40(GRADE_TD[n] * (180 * Math.cbrt(pitch * pitch) - 3.15 / Math.sqrt(pitch))),
    td1: (n) => r40(GRADE_TD1[n] * (pitch >= 1 ? 230 * Math.pow(pitch, 0.7) : 433 * pitch - 190 * Math.pow(pitch, 1.22))),
    td2: (n) => r40(GRADE_TD2_EXT[n] * Td2_6),
    TD2: (n) => r40(GRADE_TD2_INT[n] * Td2_6),
  };
  const pick = (row, i, fallback) => (row ? row[i] : fallback);
  const es = extPos === "h" ? 0 : pick(dev, { e: 1, f: 2, g: 3 }[extPos], formula[extPos]);
  const EI = intPos === "H" ? 0 : pick(dev, 0, formula.G);
  return {
    es, EI, fromFormula,
    Td: GRADE_TD[extGrade] ? pick(td, EXT_GRADES.td.indexOf(extGrade), formula.td(extGrade)) : null,
    Td2: GRADE_TD2_EXT[extGrade] ? pick(td2ExtRow, EXT_GRADES.td2.indexOf(extGrade), formula.td2(extGrade)) : null,
    TD1: GRADE_TD1[intGrade] ? pick(td1, intGrade - 4, formula.td1(intGrade)) : null,
    TD2: GRADE_TD2_INT[intGrade] ? pick(td2Row, intGrade - 4, formula.TD2(intGrade)) : null,
  };
}

/**
 * @param {object} p  major & pitch in mm
 * @param {string} [p.extPos="g"]  e | f | g | h
 * @param {number} [p.extGrade=6]  4 | 6 | 8
 * @param {string} [p.intPos="H"]  G | H
 * @param {number} [p.intGrade=6]  4 … 8
 * @returns limits in mm for the external (e.g. 6g) and internal (e.g. 6H) threads. A side whose class ISO 965-1
 *   does not define for this pitch is null, with the reason in `undefinedReasons`.
 */
export function metricToleranceEnvelope({ major, pitch, extPos = "g", extGrade = 6, intPos = "H", intGrade = 6 }) {
  const t = iso965Tolerances({ major, pitch, extPos, extGrade, intPos, intGrade });
  // ISO 724 / ISO 965-2 print the basic pitch and minor diameters to 0.001 mm and build the limits on those
  const basic = basicThreadGeometry(major, pitch);
  const g = { pitchDiameter: r3(basic.pitchDiameter), internalMinor: r3(basic.internalMinor) };
  const um = (x) => x / 1000;
  const extLabel = `${extGrade}${extPos}`, intLabel = `${intGrade}${intPos}`;
  const extOk = t.es != null && t.Td != null && t.Td2 != null;
  const intOk = t.EI != null && t.TD1 != null && t.TD2 != null;
  const undefinedReasons = [];
  if (!extOk) undefinedReasons.push(`ISO 965-1 doesn't define ${extLabel} for a ${pitch} mm pitch. Pick another external class.`);
  if (!intOk) undefinedReasons.push(`ISO 965-1 doesn't define ${intLabel} for a ${pitch} mm pitch. Pick another internal grade (${pitch <= 0.2 ? "only 4H exists there" : "a finer one, such as 5H"}).`);
  const es = um(t.es ?? 0), EI = um(t.EI ?? 0);
  return {
    external: !extOk ? null
      : { label: extLabel, majorMax: major - es, majorMin: major - es - um(t.Td), pdMax: g.pitchDiameter - es, pdMin: g.pitchDiameter - es - um(t.Td2), tolPd: um(t.Td2), tolMajor: um(t.Td), allowance: es },
    internal: !intOk ? null
      : { label: intLabel, minorMin: g.internalMinor + EI, minorMax: g.internalMinor + EI + um(t.TD1), pdMin: g.pitchDiameter + EI, pdMax: g.pitchDiameter + EI + um(t.TD2), tolPd: um(t.TD2), tolMinor: um(t.TD1), deviation: EI },
    tolerances: t,
    fromFormula: t.fromFormula,
    undefinedReasons,
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
 * Screw-thread-insert hole. Published rows come from ASME B18.29.1 (inch) and the Heli-Coil metric chart
 * (src/data/sti.js; metric gives the steel drill as size and the aluminum drill as alt). Anything else is
 * an estimate: the STI tapped hole's minimum minor diameter is D + 0.2165 P (the plain thread's basic minor
 * D − 1.0825 P plus twice the insert wire height 0.6495 P, ASME B18.29.1 / B18.29.2M); the caller drills
 * the first stock size at or above it. An estimate's size is the D + 0.25 P shop rule of thumb.
 * Returns { size, label, alt?, minMinor, source: "table" | "estimate" } in the thread's native unit.
 */
export function stiTapDrill(major, pitch, { isUn = true, tpi = null } = {}) {
  const minMinor = major + 0.216506 * pitch;
  if (isUn && tpi != null) {
    const row = STI_DRILL_UN[`${major.toFixed(4)}|${Math.round(tpi)}`];
    if (row) return { size: row[0], label: row[1], minMinor, source: "table" };
  }
  if (!isUn) {
    const mm = STI_DRILL_METRIC[`${major.toFixed(1)}|${pitch.toFixed(2)}`];
    if (mm) return { size: mm[0], label: `${mm[0]} mm`, alt: mm[1], minMinor, source: "table" };
  }
  return { size: major + 0.25 * pitch, label: null, minMinor, source: "estimate" };
}
