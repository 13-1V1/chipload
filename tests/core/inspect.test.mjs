// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { truePosition, itTolerance, featureLimits, isoFit, thermalExpansion } from "../../src/core/inspect.js";
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

// ISO 286-1 published: 25 mm IT7 = 0.021, IT6 = 0.013, IT9 = 0.052; 50 mm IT7 = 0.025
test("IT grades match ISO 286 tables", () => {
  near(itTolerance(25, 7), 0.021, 0.001);
  near(itTolerance(25, 6), 0.013, 0.001);
  near(itTolerance(25, 9), 0.052, 0.002);
  near(itTolerance(50, 7), 0.025, 0.001);
  near(itTolerance(100, 8), 0.054, 0.002);
});

// Published limits (mm): 25 H7 = 25.000/25.021; 25 g6 = 24.993/24.980; 25 p6 = 25.035/25.022; 25 f7 = 24.980/24.959
test("common 25 mm fits match the tables", () => {
  const H7 = featureLimits(25, "H7");
  near(H7.min, 25.000, 1e-9); near(H7.max, 25.021, 0.001);
  const g6 = featureLimits(25, "g6");
  near(g6.max, 24.993, 0.001); near(g6.min, 24.980, 0.001);
  const p6 = featureLimits(25, "p6");
  near(p6.min, 25.022, 0.001); near(p6.max, 25.035, 0.001);
  const f7 = featureLimits(25, "f7");
  near(f7.max, 24.980, 0.001); near(f7.min, 24.959, 0.001);
  const fit = isoFit(25, "H7", "g6");
  assert.equal(fit.kind, "clearance");
  near(fit.minClearance, 0.007, 0.001);
  near(fit.maxClearance, 0.041, 0.001);
  assert.equal(isoFit(25, "H7", "p6").kind, "interference");
  assert.equal(isoFit(25, "H7", "k6").kind, "transition");
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
