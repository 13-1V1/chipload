// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Inspection math: true position, ISO 286 fits & limits, thermal expansion.

import { IT_STEPS, IT_TABLE, DEVIATION_STEPS, SHAFT_DEVIATION } from "../data/iso286.js";

/**
 * True position (ASME Y14.5): diametral deviation = 2 √(Δx² + Δy²).
 * Bonus tolerance at MMC = how far the actual size has moved from MMC toward LMC (hole: actual − MMC,
 * pin: MMC − actual). It only exists inside the size limits, so it tops out at the size tolerance |LMC − MMC|.
 * A feature past either size limit is out of size (sizeOk false) and fails whatever its position.
 * Leave lmc out and the bonus is not capped — the caller must then know the size is within its limits.
 * Limits are compared to a millionth of the unit in use (0.000001 in or mm), far below what any gauge reads, so a
 * part exactly on the line stays on it after a unit switch rewrites its inputs to a finite number of decimals.
 */
export function truePosition({ dx, dy, tolerance, mmc = null, lmc = null, actualSize = null, internal = true }) {
  const radial = Math.hypot(dx, dy);
  const deviation = 2 * radial;
  let bonus = 0;
  let sizeOk = true;
  const eps = 1e-6;
  if (Number.isFinite(mmc) && Number.isFinite(actualSize)) {
    const fromMmc = internal ? actualSize - mmc : mmc - actualSize; // + toward LMC
    if (fromMmc < -eps) sizeOk = false;
    bonus = Math.max(0, fromMmc);
    if (Number.isFinite(lmc)) {
      const sizeTol = internal ? lmc - mmc : mmc - lmc;
      if (!(sizeTol >= 0)) throw new Error(internal ? "For a hole, LMC (largest allowed size) has to be bigger than MMC — check the two sizes, or clear LMC" : "For a pin, LMC (smallest allowed size) has to be smaller than MMC — check the two sizes, or clear LMC");
      if (fromMmc > sizeTol + eps) sizeOk = false;
      bonus = Math.min(bonus, sizeTol);
    }
  }
  const allowed = tolerance + bonus;
  const positionOk = deviation <= allowed + eps;
  return { radial, deviation, bonus, allowed, sizeOk, positionOk, pass: positionOk && sizeOk, margin: allowed - deviation };
}

// ── ISO 286 ──────────────────────────────────────────────────────────────────
// Looked up from the ISO 286-1 tables (src/data/iso286.js), not computed: the standard's values are
// rounded by its own rules and its formulas only come close. Sizes in mm, results in mm.

function stepIndex(bounds, d) {
  if (!(d > 0) || d > bounds[bounds.length - 1]) throw new Error("ISO 286 here covers sizes up to 500 mm (19.7 in)");
  return bounds.findIndex((upper) => d <= upper);
}

/** Standard tolerance for grade IT5–IT13 at size d (mm), in mm. */
export function itTolerance(d, grade) {
  const row = IT_TABLE[grade];
  if (!row || grade < 5) throw new Error(`IT${grade} isn't covered — use IT5 to IT13`);
  return row[stepIndex(IT_STEPS, d)] / 1000;
}

const SHAFT_LETTERS = Object.keys(SHAFT_DEVIATION);
const letterHelp = () => `use ${SHAFT_LETTERS.join(" ")} or js for a shaft, the capitals for a hole`;

/**
 * Upper and lower deviation (mm) for one letter + grade at size d (mm).
 * Shafts read the table directly: a–h give the upper deviation, k–z the lower.
 * Holes mirror the shaft (EI = −es for A–H). For K, M, N up to IT8 and P–Z up to IT7 the standard
 * adds Δ = ITn − ITn−1 to the mirrored value, so the hole and the next-finer shaft give the same fit;
 * N is zero above IT8. Sizes up to 3 mm take no Δ.
 */
export function fundamentalDeviation(d, letter, grade) {
  const L = String(letter).toLowerCase();
  const isHole = letter !== L;
  const T = itTolerance(d, grade);
  if (L === "js") return { upper: T / 2, lower: -T / 2, isHole };
  const row = SHAFT_DEVIATION[L];
  if (!row) throw new Error(`Letter "${letter}" isn't covered — ${letterHelp()}`);
  const fine = stepIndex(DEVIATION_STEPS, d);
  let base = row[fine];
  if (base == null) throw new Error(`ISO 286 has no "${letter}" at this size`);
  if (L === "k" && !isHole && (grade < 4 || grade > 7)) base = 0; // k is only non-zero in IT4–IT7
  base /= 1000;
  const clearanceSide = L <= "h";
  if (!isHole) return clearanceSide ? { upper: base, lower: base - T, isHole } : { upper: base + T, lower: base, isHole };
  if (clearanceSide) return { upper: -base + T, lower: -base, isHole };
  // ISO 286-2 Table 8, note 2: K holes above IT8 are not defined over 3 mm
  if (L === "k" && grade > 8 && d > 3) throw new Error(`ISO 286 has no ${letter}${grade} hole over 3 mm (0.118 in) — K holes stop at K8 there`);
  const takesDelta = d > 3 && (L <= "n" ? grade <= 8 : grade <= 7);
  const delta = takesDelta ? (IT_TABLE[grade][stepIndex(IT_STEPS, d)] - IT_TABLE[grade - 1][stepIndex(IT_STEPS, d)]) / 1000 : 0;
  let upper = -base + delta;
  if (L === "k" && grade > 8) upper = 0;
  if (L === "n" && grade > 8 && d > 3) upper = 0;
  if (L === "m" && grade === 6 && d > 250 && d <= 315) upper = -0.009; // the one value the table lists apart from the rule
  return { upper, lower: upper - T, isHole };
}

/** Limits for a single feature like "H7" or "g6" at nominal d (mm). */
export function featureLimits(d, spec) {
  const m = String(spec).trim().match(/^([A-Za-z]{1,2})(\d{1,2})$/);
  if (!m) throw new Error(`Can't read "${spec}" — type it like H7, g6, or p6`);
  const letter = m[1], grade = Number(m[2]);
  if (letter !== letter.toLowerCase() && letter !== letter.toUpperCase()) throw new Error(`Can't read "${spec}" — type it like H7, g6, or p6`);
  const { upper, lower, isHole } = fundamentalDeviation(d, letter, grade);
  return { spec: `${letter}${grade}`, grade, isHole, tolerance: upper - lower, upper, lower, max: d + upper, min: d + lower };
}

/** A fit like "H7/g6": hole and shaft limits plus clearance/interference range. */
export function isoFit(d, holeSpec, shaftSpec) {
  const hole = featureLimits(d, holeSpec);
  const shaft = featureLimits(d, shaftSpec);
  if (!hole.isHole) throw new Error(`"${holeSpec}" is a shaft — the hole takes a capital letter, like H7`);
  if (shaft.isHole) throw new Error(`"${shaftSpec}" is a hole — the shaft takes a small letter, like g6`);
  const maxClearance = hole.max - shaft.min;
  const minClearance = hole.min - shaft.max;
  // half a nanometre of float noise must not turn "line to line" into interference
  const kind = minClearance >= -1e-9 ? "clearance" : maxClearance <= 1e-9 ? "interference" : "transition";
  return { hole, shaft, maxClearance, minClearance, kind };
}

// ── Thermal expansion ────────────────────────────────────────────────────────
/**
 * Linear coefficients, in/in/°F, mean over about 68–212 °F. Source: Machinery's Handbook "Coefficients of Thermal
 * Expansion"; stainless from the AK Steel / ATI datasheets (304 9.6, 316 8.9, 410 5.5, 17-4 PH 6.0); copper alloys
 * from the Copper Development Association (C360 11.4, C510 9.9, C932 10.0, C954 9.0). One alloy per row: the
 * members of a family differ by 8–20%.
 */
export const THERMAL_ALPHA_F = Object.freeze({
  steel: { label: "Carbon / alloy steel", a: 6.5e-6 },
  stainless304: { label: "Stainless 304", a: 9.6e-6 },
  stainless316: { label: "Stainless 316", a: 8.9e-6 },
  stainless410: { label: "Stainless 410", a: 5.5e-6 },
  ph174: { label: "Stainless 17-4 PH", a: 6.0e-6 },
  castIron: { label: "Cast iron", a: 6.0e-6 },
  aluminum: { label: "Aluminum", a: 13.0e-6 },
  brass: { label: "Brass (C360 free-cutting)", a: 11.4e-6 },
  phosphorBronze: { label: "Phosphor bronze (C510)", a: 9.9e-6 },
  bearingBronze: { label: "Bearing bronze (C932)", a: 10.0e-6 },
  aluminumBronze: { label: "Aluminum bronze (C954)", a: 9.0e-6 },
  copper: { label: "Copper", a: 9.4e-6 },
  titanium: { label: "Titanium", a: 4.8e-6 },
  invar: { label: "Invar 36", a: 0.8e-6 },
  carbide: { label: "Tungsten carbide", a: 2.8e-6 },
  granite: { label: "Granite", a: 4.0e-6 },
  acetal: { label: "Acetal / Delrin", a: 47e-6 },
  nylon: { label: "Nylon", a: 45e-6 },
  polycarbonate: { label: "Polycarbonate", a: 38e-6 },
});

/** ΔL = α × L × ΔT.  Temperatures in °F, α per °F. */
export function thermalExpansion({ length, alphaPerF, fromF, toF }) {
  const dT = toF - fromF;
  return { deltaT: dT, deltaL: alphaPerF * length * dT, final: length + alphaPerF * length * dT };
}
