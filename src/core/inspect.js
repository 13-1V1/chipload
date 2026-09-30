// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Inspection math: true position, ISO 286 fits & limits, thermal expansion.

/**
 * True position (ASME Y14.5): diametral deviation = 2 √(Δx² + Δy²).
 * Bonus tolerance at MMC = |actual feature size − MMC size| (only when the feature is inside its size limits).
 */
export function truePosition({ dx, dy, tolerance, mmc = null, actualSize = null, internal = true }) {
  const radial = Math.hypot(dx, dy);
  const deviation = 2 * radial;
  let bonus = 0;
  if (Number.isFinite(mmc) && Number.isFinite(actualSize)) {
    bonus = internal ? Math.max(0, actualSize - mmc) : Math.max(0, mmc - actualSize);
  }
  const allowed = tolerance + bonus;
  return { radial, deviation, bonus, allowed, pass: deviation <= allowed + 1e-12, margin: allowed - deviation };
}

// ── ISO 286 ──────────────────────────────────────────────────────────────────
// Source: ISO 286-1 standard tolerance grades and fundamental deviations. D in mm.
// i (µm) = 0.45 ∛D + 0.001 D  for D ≤ 500, with D the geometric mean of the diameter step.
const STEPS = [1, 3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
const IT_FACTORS = { 5: 7, 6: 10, 7: 16, 8: 25, 9: 40, 10: 64, 11: 100, 12: 160, 13: 250 };

export function isoStepMean(d) {
  if (d <= 3) return Math.sqrt(1 * 3);
  for (let i = 1; i < STEPS.length; i++) if (d <= STEPS[i]) return Math.sqrt(STEPS[i - 1] * STEPS[i]);
  return d;
}

/** Standard tolerance IT grade in mm. IT01–IT4 are not covered (formula differs). */
export function itTolerance(d, grade) {
  const D = isoStepMean(d);
  const i = 0.45 * Math.cbrt(D) + 0.001 * D; // µm
  const k = IT_FACTORS[grade];
  if (!k) throw new Error(`IT${grade} not supported (use IT5–IT13)`);
  return (k * i) / 1000;
}

/**
 * Fundamental deviation (mm) for a shaft letter. Holes use the mirror rule (H = 0, G = +|g|, etc.),
 * which is exact for a–h / A–H and a close approximation for k–zc / K–ZC in the grades used here.
 * Source: ISO 286-1 Table 2 formulas (µm, D in mm as step geometric mean).
 */
export function fundamentalDeviation(d, letter, grade = 7) {
  const D = isoStepMean(d);
  const L = letter.toLowerCase();
  const it = (g) => itTolerance(d, g) * 1000;
  const shaft = {
    a: D <= 120 ? -(265 + 1.3 * D) : -3.5 * D,
    b: D <= 160 ? -(140 + 0.85 * D) : -1.8 * D,
    c: D <= 40 ? -52 * Math.pow(D, 0.2) : -(95 + 0.8 * D),
    d: -16 * Math.pow(D, 0.44),
    e: -11 * Math.pow(D, 0.41),
    f: -5.5 * Math.pow(D, 0.41),
    g: -2.5 * Math.pow(D, 0.34),
    h: 0,
    js: 0,
    k: grade >= 4 && grade <= 7 ? 0.6 * Math.cbrt(D) : 0,
    m: it(7) - it(6),
    n: 5 * Math.pow(D, 0.34),
    p: it(7) + 1, // ISO: IT7 + 0 to 5 µm
    r: 0, s: 0, t: 0, u: 0, x: 0, z: 0,
  };
  // Closed forms for the interference letters (ISO 286-1 Table 2):
  shaft.s = D <= 50 ? it(8) + 1 + 0.02 * D : it(7) + 0.4 * D;
  shaft.r = Math.sqrt(shaft.p * shaft.s); // geometric mean of p and s
  shaft.t = it(7) + 0.63 * D;
  shaft.u = it(7) + D;
  shaft.x = it(7) + 1.25 * D;
  shaft.z = it(7) + 1.6 * D;
  if (!(L in shaft)) throw new Error(`Deviation letter "${letter}" not supported`);
  const isHole = letter === letter.toUpperCase() && letter !== letter.toLowerCase();
  const es = shaft[L] / 1000; // mm; for shafts this is the upper (a–h) or lower (k–zc) deviation
  return { value: isHole ? -es : es, isHole, sign: L <= "h" ? "upper" : "lower" };
}

/** Limits for a single feature like "H7" or "g6" at nominal d (mm). */
export function featureLimits(d, spec) {
  const m = String(spec).trim().match(/^([A-Za-z]{1,2})(\d{1,2})$/);
  if (!m) throw new Error(`Bad fit spec "${spec}" — use like H7, g6, p6`);
  const letter = m[1], grade = Number(m[2]);
  const T = itTolerance(d, grade);
  const fd = fundamentalDeviation(d, letter, grade);
  let upper, lower;
  if (letter === "js" || letter === "JS") { upper = T / 2; lower = -T / 2; }
  else if (fd.isHole) {
    // Hole: A–H fundamental deviation is the lower deviation (EI ≥ 0); K–ZC it is the upper (ES ≤ 0)
    if (letter.toLowerCase() <= "h") { lower = fd.value; upper = lower + T; }
    else { upper = fd.value; lower = upper - T; }
  } else {
    // Shaft: a–h fundamental deviation is the upper (es ≤ 0); k–zc it is the lower (ei ≥ 0)
    if (letter <= "h") { upper = fd.value; lower = upper - T; }
    else { lower = fd.value; upper = lower + T; }
  }
  return { spec: `${letter}${grade}`, grade, tolerance: T, upper, lower, max: d + upper, min: d + lower };
}

/** A fit like "H7/g6": hole and shaft limits plus clearance/interference range. */
export function isoFit(d, holeSpec, shaftSpec) {
  const hole = featureLimits(d, holeSpec);
  const shaft = featureLimits(d, shaftSpec);
  const maxClearance = hole.max - shaft.min;
  const minClearance = hole.min - shaft.max;
  const kind = minClearance >= 0 ? "clearance" : maxClearance <= 0 ? "interference" : "transition";
  return { hole, shaft, maxClearance, minClearance, kind };
}

// ── Thermal expansion ────────────────────────────────────────────────────────
/** Linear coefficients, in/in/°F. Source: Machinery's Handbook "Coefficients of Thermal Expansion". */
export const THERMAL_ALPHA_F = Object.freeze({
  steel: { label: "Carbon / alloy steel", a: 6.5e-6 },
  stainless304: { label: "Stainless 304 / 316", a: 9.6e-6 },
  stainless410: { label: "Stainless 410 / 17-4", a: 6.0e-6 },
  castIron: { label: "Cast iron", a: 6.0e-6 },
  aluminum: { label: "Aluminum", a: 13.0e-6 },
  brass: { label: "Brass / bronze", a: 11.0e-6 },
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
