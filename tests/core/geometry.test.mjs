// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { solveRightTriangle, chamferDepth, circleThrough3Points, sineBarHeight, sineBarAngle, taperGeometry, circularSegment, solveTriangle } from "../../src/core/geometry.js";

test("3-4-5 triangle in every mode", () => {
  near(solveRightTriangle("runRise", 3, 4).hypotenuse, 5);
  near(solveRightTriangle("runRise", 3, 4).angle, 53.1301, 0.0001);
  near(solveRightTriangle("hypAngle", 5, 53.13010235).rise, 4, 1e-6);
  near(solveRightTriangle("runAngle", 3, 53.13010235).hypotenuse, 5, 1e-6);
  near(solveRightTriangle("riseAngle", 4, 53.13010235).run, 3, 1e-6);
  near(solveRightTriangle("runHyp", 3, 5).rise, 4);
  near(solveRightTriangle("riseHyp", 4, 5).run, 3);
  assert.throws(() => solveRightTriangle("bogus", 1, 1));
});

test("90° countersink from 0.25 to 0.5 needs 0.125 depth", () => {
  near(chamferDepth(0.25, 0.5, 90), 0.125);
  near(chamferDepth(0, 0.1, 90), 0.05);
});

test("three-point circle", () => {
  const circle = circleThrough3Points([1, 0], [0, 1], [-1, 0]);
  near(circle.x, 0); near(circle.y, 0); near(circle.diameter, 2);
  assert.equal(circleThrough3Points([0, 0], [1, 1], [2, 2]), null);
});

// Three points on a line have no circle (the perpendicular bisectors are parallel). The test has to hold at
// mm scale too: this exactly collinear set (3rd step = 5 × the 1st) once came back as a 7e16 mm circle.
test("three-point circle: collinear in mm, big coordinates, duplicates, and a real flat arc", () => {
  assert.equal(circleThrough3Points([84.92, 161.822], [94.316, 171.446], [131.9, 209.942]), null);
  // every exactly collinear 3-decimal mm set is caught (the fixed 1e-12 cutoff let ~5–15% through)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5000; i += 1) {
    const x = Math.round(rnd() * 200000) / 1000, y = Math.round(rnd() * 200000) / 1000;
    const dx = Math.round(rnd() * 20000 - 10000) / 1000, dy = Math.round(rnd() * 20000 - 10000) / 1000, k = 2 + Math.floor(rnd() * 8);
    if (dx === 0 && dy === 0) continue;
    const p3 = [Number((x + k * dx).toFixed(3)), Number((y + k * dy).toFixed(3))];
    assert.equal(circleThrough3Points([x, y], [x + dx, y + dy], p3), null, `${x},${y} step ${dx},${dy} ×${k}`);
  }
  assert.equal(circleThrough3Points([1, 1], [1, 1], [3, 0]), null, "two points the same");
  // R 5000 mm probed over 50 mm of arc is a real circle, not "a line"
  const R = 5000, pts = [-25, 0, 25].map((x) => [x, Math.sqrt(R * R - x * x) - R]);
  near(circleThrough3Points(...pts).radius, 5000, 1e-6);
  // far from the origin (machine coordinates) loses nothing
  const far = circleThrough3Points([1001, 2000], [1000, 2001], [999, 2000]);
  near(far.x, 1000, 1e-9); near(far.y, 2000, 1e-9); near(far.diameter, 2, 1e-9);
});

// Machinery's Handbook "Segments of Circles": R = c²/(8h) + h/2; θ = 2·asin(c/2R), and 360° − 2·asin(c/2R)
// when h > R (the segment is more than a half circle); arc = Rθ; area = R²/2 (θ − sin θ).
test("arc segment from chord + height past a half circle", () => {
  const s = circularSegment({ chord: 2, height: 1.5 });
  near(s.radius, 1.0833333, 1e-6);
  near(s.angle, 225.240, 0.001);
  near(s.arcLength, 4.2588, 0.0001);
  near(s.area, 2.7235, 0.0001);
  const mm = circularSegment({ chord: 50, height: 40 });
  near(mm.radius, 27.8125, 1e-9);
  near(mm.angle, 231.978, 0.001);
  near(mm.arcLength, 112.607, 0.001);
  near(mm.area, 1870.63, 0.01);
  // under a half circle nothing changes: c 2, h 0.25 → R 2.125, θ = 2 asin(1/2.125) = 56.1450°
  const minor = circularSegment({ chord: 2, height: 0.25 });
  near(minor.radius, 2.125); near(minor.angle, 2 * Math.asin(1 / 2.125) * 180 / Math.PI, 1e-9); near(minor.angle, 56.1450, 0.0001);
  // exactly a half circle: h = R = c/2 → 180°
  near(circularSegment({ chord: 2, height: 1 }).angle, 180, 1e-9);
  // radius + chord is the minor arc by the handbook's convention: R 1, c √3 → 120°, h 0.5
  const rc = circularSegment({ radius: 1, chord: Math.sqrt(3) });
  near(rc.angle, 120, 1e-9); near(rc.height, 0.5, 1e-12);
});

// Law of sines, ambiguous case (Machinery's Handbook "Solution of Oblique Triangles"): with A < 90° and
// h = b·sin A, two triangles only when h < a < b. a = h is one right triangle (B = 90°); a = b is one isosceles.
test("SSA: one triangle at the edges of the ambiguous case, two inside it", () => {
  const right = solveTriangle("SSA", { a: 5, b: 10, A: 30 });
  assert.equal(right.ambiguous, null, "5 / 10 / 30° is the 30-60-90, one triangle");
  near(right.B, 90, 1e-9); near(right.c, 10 * Math.cos(Math.PI / 6), 1e-9);
  assert.equal(solveTriangle("SSA", { a: 50, b: 100, A: 30 }).ambiguous, null, "same in mm");
  for (let A = 1; A < 90; A += 0.5) assert.equal(solveTriangle("SSA", { a: 1, b: 1, A }).ambiguous, null, `a = b at ${A}°`);
  const two = solveTriangle("SSA", { a: 5, b: 7, A: 40 });
  assert.ok(two.ambiguous && two.ambiguous.C > 0, "h < a < b has two");
  // 0.7071 is a hair under 1·sin 45° = 0.70711, so there truly is no triangle
  assert.throws(() => solveTriangle("SSA", { a: 0.7071, b: 1, A: 45 }), /No triangle/);
});

// 5" sine bar at 30° → 2.5000 stack (Machinery's Handbook sine bar table)
test("sine bar", () => {
  const h = sineBarHeight({ barLength: 5, angleDegrees: 30 });
  near(h, 2.5);
  near(sineBarAngle({ barLength: 5, stackHeight: h }), 30);
  assert.ok(Number.isNaN(sineBarAngle({ barLength: 5, stackHeight: 6 })));
});

// 1" of diameter change over 12" = 1.000 TPF, included angle 4.7719°
test("taper per foot and angle", () => {
  const t = taperGeometry({ largeDiameter: 2, smallDiameter: 1, length: 12 });
  near(t.taperPerFoot, 1);
  near(t.includedAngle, 4.7719, 0.0001);
  near(t.taperRatio, 12, 1e-12, "1 : 12 on diameter");
  // Metric call-out: 5 mm of diameter over 100 mm is 1 : 20, half angle 1.4321°
  const m = taperGeometry({ largeDiameter: 25, smallDiameter: 20, length: 100 });
  near(m.taperRatio, 20, 1e-12);
  near(m.halfAngle, 1.4321, 0.0001);
});
