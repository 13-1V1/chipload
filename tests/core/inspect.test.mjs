// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { truePosition, itTolerance, featureLimits, isoFit, thermalExpansion, THERMAL_ALPHA_F } from "../../src/core/inspect.js";
import { IT_STEPS, IT_TABLE, DEVIATION_STEPS, SHAFT_DEVIATION } from "../../src/data/iso286.js";
import { solveTriangle, circularSegment, filletTangents } from "../../src/core/geometry.js";

test("true position with bonus tolerance", () => {
  const r = truePosition({ dx: 0.003, dy: 0.004, tolerance: 0.010 });
  near(r.deviation, 0.010, 1e-12);
  assert.equal(r.pass, true);
  // hole at MMC 0.250 measures 0.253 → bonus 0.003
  const b = truePosition({ dx: 0.005, dy: 0.004, tolerance: 0.010, mmc: 0.25, actualSize: 0.253, internal: true });
  near(b.bonus, 0.003, 1e-12);
  near(b.deviation, 0.012806, 1e-6);
  assert.equal(b.pass, true);
});

// ASME Y14.5-2018 position at MMC: bonus = departure from MMC, valid only inside the size limits, so it can
// never exceed the size tolerance |LMC − MMC|. A feature past LMC (or past MMC) is out of size and rejected.
test("true position: bonus stops at LMC, and an out-of-size feature never passes", () => {
  // hole Ø.250–.255 measured .300: bonus capped at .005, allowed .015 < .0424 → out on position and size
  const big = truePosition({ dx: 0.015, dy: 0.015, tolerance: 0.010, mmc: 0.250, lmc: 0.255, actualSize: 0.300, internal: true });
  near(big.bonus, 0.005, 1e-12); near(big.allowed, 0.015, 1e-12);
  assert.equal(big.sizeOk, false); assert.equal(big.positionOk, false); assert.equal(big.pass, false);
  // a hole just past LMC with a position that would pass is still rejected on size
  const past = truePosition({ dx: 0.003, dy: 0.004, tolerance: 0.010, mmc: 0.250, lmc: 0.255, actualSize: 0.256, internal: true });
  assert.equal(past.positionOk, true); assert.equal(past.sizeOk, false); assert.equal(past.pass, false);
  // pin Ø.245–.250 measured .200: bonus capped at .005
  const pin = truePosition({ dx: 0.005, dy: 0.005, tolerance: 0.010, mmc: 0.250, lmc: 0.245, actualSize: 0.200, internal: false });
  near(pin.bonus, 0.005, 1e-12); assert.equal(pin.sizeOk, false); assert.equal(pin.pass, false);
  // pin inside its limits: MMC − actual
  const ok = truePosition({ dx: 0.003, dy: 0.004, tolerance: 0.010, mmc: 0.250, lmc: 0.245, actualSize: 0.247, internal: false });
  near(ok.bonus, 0.003, 1e-12); assert.equal(ok.pass, true);
  // at exactly LMC the full size tolerance is the bonus
  near(truePosition({ dx: 0, dy: 0, tolerance: 0.010, mmc: 0.250, lmc: 0.255, actualSize: 0.255 }).bonus, 0.005, 1e-12);
  // a hole smaller than MMC is out of size too
  assert.equal(truePosition({ dx: 0, dy: 0, tolerance: 0.010, mmc: 0.250, lmc: 0.255, actualSize: 0.249 }).pass, false);
  // LMC on the wrong side of MMC is a typing mistake, not a zero bonus
  assert.throws(() => truePosition({ dx: 0, dy: 0, tolerance: 0.01, mmc: 0.25, lmc: 0.245, actualSize: 0.25, internal: true }), /LMC/);
});

// ISO 286-2:1988 Table 8, footnote 2: "Deviations for K in tolerance grades above IT8 are not defined for basic
// sizes greater than 3 mm." Up to 3 mm the table lists K9 = 0/−25 and K10 = 0/−40 µm.
test("K holes above IT8 exist only up to 3 mm", () => {
  near(featureLimits(2, "K9").upper * 1000, 0, 0.01); near(featureLimits(2, "K9").lower * 1000, -25, 0.01);
  near(featureLimits(3, "K10").lower * 1000, -40, 0.01);
  for (const spec of ["K9", "K10", "K11", "K12", "K13"]) assert.throws(() => featureLimits(25, spec), /no K\d+ hole over 3 mm/, spec);
  assert.throws(() => isoFit(25, "K11", "h11"), /K holes stop at K8/);
  near(featureLimits(25, "K8").upper * 1000, 10, 0.01); // still defined
  near(featureLimits(25, "k9").lower * 1000, 0, 0.01); // the shaft k is defined at every size
});

// Mean coefficients, µin/in/°F, about 68–212 °F: AK Steel / ATI datasheets 304 9.6, 316 8.9, 410 5.5, 17-4 PH 6.0;
// Copper Development Association C360 brass 11.4, C510 phosphor bronze 9.9, C932 bearing bronze 10.0, C954 aluminum bronze 9.0.
test("thermal coefficients: one alloy per row, at its published value", () => {
  const a = (id) => THERMAL_ALPHA_F[id].a * 1e6;
  near(a("stainless304"), 9.6); near(a("stainless316"), 8.9); near(a("stainless410"), 5.5); near(a("ph174"), 6.0);
  near(a("brass"), 11.4); near(a("phosphorBronze"), 9.9); near(a("bearingBronze"), 10.0); near(a("aluminumBronze"), 9.0);
  for (const m of Object.values(THERMAL_ALPHA_F)) assert.doesNotMatch(m.label, /304 \/ 316|410 \/ 17-4|Brass \/ bronze/, `${m.label} lumps two alloys`);
});

// ISO 286-1 Table 1: 25 mm IT7 = 21 µm, IT6 = 13, IT9 = 52; 50 mm IT7 = 25; 100 mm IT8 = 54. Exact — these are table lookups.
test("IT grades match ISO 286 tables", () => {
  near(itTolerance(25, 7), 0.021, 1e-9);
  near(itTolerance(25, 6), 0.013, 1e-9);
  near(itTolerance(25, 9), 0.052, 1e-9);
  near(itTolerance(50, 7), 0.025, 1e-9);
  near(itTolerance(100, 8), 0.054, 1e-9);
  assert.throws(() => itTolerance(25, 3), /IT3/);
  assert.throws(() => itTolerance(600, 7), /500 mm/);
});

// ISO 286-2 published limits, in µm: [size mm, callout, upper, lower].
const PUBLISHED_LIMITS = [
  [25, "H7", 21, 0], [25, "g6", -7, -20], [25, "p6", 35, 22], [25, "f7", -20, -41], [25, "k6", 15, 2], [25, "n6", 28, 15], [25, "s6", 48, 35], [25, "u6", 61, 48],
  [25, "h6", 0, -13], [25, "d9", -65, -117], [25, "c11", -110, -240], [25, "H11", 130, 0], [25, "H9", 52, 0], [25, "H8", 33, 0], [25, "F8", 53, 20], [25, "G7", 28, 7], [25, "E9", 92, 40],
  // holes on the interference side take the Δ rule — the bearing-housing fits
  [25, "K7", 6, -15], [25, "M7", 0, -21], [25, "N7", -7, -28], [25, "P7", -14, -35], [25, "K8", 10, -23], [25, "K6", 2, -11], [25, "N9", 0, -52], [25, "P6", -18, -31], [25, "R7", -20, -41], [25, "S7", -27, -48], [25, "JS7", 10.5, -10.5],
  // letters whose steps split above 10 mm
  [20, "x6", 67, 54], [25, "x6", 77, 64], [20, "z6", 86, 73], [25, "z6", 101, 88], [40, "r6", 50, 34],
  [50, "H7", 25, 0], [50, "s6", 59, 43], [50, "g6", -9, -25], [50, "k6", 18, 2], [50, "m6", 25, 9],
  [10, "H7", 15, 0], [10, "g6", -5, -14], [10, "f7", -13, -28], [6, "H7", 12, 0], [6, "g6", -4, -12], [3, "H7", 10, 0], [3, "K7", 0, -10],
  [100, "H7", 35, 0], [100, "g6", -12, -34], [100, "p6", 59, 37], [100, "u6", 146, 124], [200, "H7", 46, 0], [200, "g6", -15, -44], [300, "M6", -9, -41], [500, "H7", 63, 0],
  [18, "js6", 5.5, -5.5], [12, "e8", -32, -59],
];

test("limits match the ISO 286-2 tables to the micron", () => {
  for (const [d, spec, upper, lower] of PUBLISHED_LIMITS) {
    const f = featureLimits(d, spec);
    near(f.upper * 1000, upper, 0.01, `${d} ${spec} upper`);
    near(f.lower * 1000, lower, 0.01, `${d} ${spec} lower`);
  }
});

// Published 25 mm: H7/g6 clearance +7 to +41 µm; K7/h6 transition +19 to −15 µm.
test("fits: kind and clearance range", () => {
  const fit = isoFit(25, "H7", "g6");
  assert.equal(fit.kind, "clearance");
  near(fit.minClearance, 0.007, 1e-9);
  near(fit.maxClearance, 0.041, 1e-9);
  assert.equal(isoFit(25, "H7", "h6").kind, "clearance", "line-to-line at the tight end is still clearance");
  assert.equal(isoFit(25, "H7", "p6").kind, "interference");
  assert.equal(isoFit(25, "H7", "k6").kind, "transition");
  const k7 = isoFit(25, "K7", "h6");
  assert.equal(k7.kind, "transition");
  near(k7.maxClearance, 0.019, 1e-9); near(k7.minClearance, -0.015, 1e-9);
  assert.throws(() => isoFit(25, "g6", "g6"), /is a shaft/);
  assert.throws(() => isoFit(25, "H7", "H7"), /is a hole/);
  assert.throws(() => isoFit(25, "H7", "q6"), /isn't covered/);
  assert.throws(() => isoFit(10, "H7", "t6"), /no "t" at this size/);
});

// The standard's own formulas track its tables above the smallest sizes (where it rounds by hand).
// A mistyped table value shows up here as a miss far bigger than the rounding.
test("ISO 286 tables agree with the standard's formulas", () => {
  const mean = (bounds, i) => Math.sqrt((i ? bounds[i - 1] : 1) * bounds[i]);
  const closeTo = (got, want, pct, what) => assert.ok(Math.abs(got - want) <= Math.max(1.5, Math.abs(want) * pct), `${what}: table ${got} vs formula ${want.toFixed(1)}`);
  const mainStep = (upper) => IT_STEPS.findIndex((u) => upper <= u);
  IT_STEPS.forEach((_, i) => {
    if (i === 0) return;
    const D = mean(IT_STEPS, i), unit = 0.45 * Math.cbrt(D) + 0.001 * D;
    for (const [grade, k] of [[5, 7], [6, 10], [7, 16], [8, 25], [9, 40], [10, 64], [11, 100], [12, 160], [13, 250]]) closeTo(IT_TABLE[grade][i], k * unit, 0.07, `IT${grade} step ${i}`);
  });
  DEVIATION_STEPS.forEach((upper, i) => {
    const main = mainStep(upper), Dmain = mean(IT_STEPS, main), D = mean(DEVIATION_STEPS, i), it7 = IT_TABLE[7][main];
    if (main > 0) { // d–g and n hold one value across a main step
      closeTo(SHAFT_DEVIATION.d[i], -16 * Dmain ** 0.44, 0.04, `d ≤${upper}`);
      closeTo(SHAFT_DEVIATION.e[i], -11 * Dmain ** 0.41, 0.04, `e ≤${upper}`);
      closeTo(SHAFT_DEVIATION.f[i], -5.5 * Dmain ** 0.41, 0.04, `f ≤${upper}`);
      closeTo(SHAFT_DEVIATION.g[i], -2.5 * Dmain ** 0.34, 0.06, `g ≤${upper}`);
      closeTo(SHAFT_DEVIATION.n[i], 5 * Dmain ** 0.34, 0.06, `n ≤${upper}`);
      closeTo(SHAFT_DEVIATION.m[i], it7 - IT_TABLE[6][main], 0.06, `m ≤${upper}`);
    }
    if (upper > 30) for (const [letter, k] of [["t", 0.63], ["u", 1], ["v", 1.25], ["x", 1.6], ["y", 2], ["z", 2.5]]) closeTo(SHAFT_DEVIATION[letter][i], it7 + k * D, 0.04, `${letter} ≤${upper}`);
    if (upper > 50) closeTo(SHAFT_DEVIATION.s[i], it7 + 0.4 * D, 0.04, `s ≤${upper}`);
    if (upper > 40) closeTo(SHAFT_DEVIATION.c[i], -(95 + 0.8 * D), 0.05, `c ≤${upper}`);
    closeTo(SHAFT_DEVIATION.a[i], D <= 120 ? -(265 + 1.3 * D) : -3.5 * D, 0.05, `a ≤${upper}`);
    closeTo(SHAFT_DEVIATION.b[i], D <= 160 ? -(140 + 0.85 * D) : -1.8 * D, 0.06, `b ≤${upper}`);
  });
  for (const [letter, row] of Object.entries(SHAFT_DEVIATION)) {
    assert.equal(row.length, DEVIATION_STEPS.length, `${letter} has a value for every step`);
    const vals = row.filter((x) => x != null).map(Math.abs);
    assert.ok(vals.every((x, i) => i === 0 || x >= vals[i - 1]), `${letter} grows with size`);
  }
  for (const [grade, row] of Object.entries(IT_TABLE)) {
    assert.equal(row.length, IT_STEPS.length, `IT${grade} has a value for every step`);
    assert.ok(row.every((x, i) => i === 0 || x >= row[i - 1]), `IT${grade} grows with size`);
  }
});

// Steel 10 in bar, 68 → 100 °F: 6.5e-6 × 10 × 32 = 0.00208 in
test("thermal expansion of a steel bar", () => {
  near(thermalExpansion({ length: 10, alphaPerF: 6.5e-6, fromF: 68, toF: 100 }).deltaL, 0.00208, 1e-9);
});

test("oblique triangle modes agree on a 3-4-5", () => {
  const sss = solveTriangle("SSS", { a: 3, b: 4, c: 5 });
  near(sss.C, 90, 1e-9); near(sss.area, 6, 1e-9);
  const sas = solveTriangle("SAS", { a: 3, b: 4, C: 90 });
  near(sas.c, 5, 1e-9);
  const asa = solveTriangle("ASA", { A: sss.A, B: sss.B, c: 5 });
  near(asa.a, 3, 1e-9);
  const ssa = solveTriangle("SSA", { a: 5, b: 4, A: 90 });
  near(ssa.c, 3, 1e-9);
  assert.equal(ssa.ambiguous, null);
  const amb = solveTriangle("SSA", { a: 5, b: 7, A: 40 });
  assert.ok(amb.ambiguous, "two solutions expected");
});

// Machinery's Handbook: R = 2, chord 2 → angle 60°, height 0.268, arc 2.094
test("circular segment from radius and chord", () => {
  const s = circularSegment({ radius: 2, chord: 2 });
  near(s.angle, 60, 1e-9); near(s.height, 0.2679, 0.0001); near(s.arcLength, 2.0944, 0.0001);
  const back = circularSegment({ chord: s.chord, height: s.height });
  near(back.radius, 2, 1e-9);
});

test("fillet at a 90° corner: tangent distance equals the radius", () => {
  const f = filletTangents({ radius: 0.25, includedAngle: 90 });
  near(f.tangentDistance, 0.25, 1e-12);
  near(f.cornerToCenter, 0.25 * Math.SQRT2, 1e-12);
  near(f.arcAngle, 90);
});
