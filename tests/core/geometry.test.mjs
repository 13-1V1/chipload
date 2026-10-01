// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { solveRightTriangle, chamferDepth, circleThrough3Points, sineBarHeight, sineBarAngle, taperGeometry } from "../../src/core/geometry.js";

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
