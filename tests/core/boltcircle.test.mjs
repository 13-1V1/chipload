// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { boltCircleCoordinates, partialBoltCircleCoordinates, buildBoltGcode, buildBoltCsv, buildBoltDxf } from "../../src/core/boltcircle.js";

test("4 holes on a 2 inch circle land on the axes", () => {
  const c = boltCircleCoordinates(2, 4);
  near(c[0].x, 1); near(c[0].y, 0);
  near(c[1].x, 0); near(c[1].y, 1);
  near(c[2].x, -1); near(c[2].y, 0);
  near(c[3].x, 0); near(c[3].y, -1);
});

test("center offset and direction", () => {
  const ccw = boltCircleCoordinates(2, 4, 0, "ccw", 3, -2);
  near(ccw[1].x, 3); near(ccw[1].y, -1);
  const cw = boltCircleCoordinates(2, 4, 0, "cw", 3, -2);
  near(cw[1].y, -3);
});

test("partial bolt circle spreads holes over the sweep inclusive", () => {
  const c = partialBoltCircleCoordinates(2, 3, 0, 90);
  near(c[0].angleDeg, 0); near(c[1].angleDeg, 45); near(c[2].angleDeg, 90);
  near(c[2].x, 0, 1e-12); near(c[2].y, 1);
});

test("G-code output is inch by default with G81 / G83 cycles", () => {
  const coords = boltCircleCoordinates(2, 4);
  const drill = buildBoltGcode(coords, { mode: "drill", z: -0.5, r: 0.1, feed: 5 });
  assert.match(drill, /^%\n/);
  assert.match(drill, /G20 G90/);
  assert.match(drill, /G81 G98 X1 Y0 Z-0\.5 R0\.1 F5/);
  assert.match(drill, /M30\n%$/);
  const peck = buildBoltGcode(coords, { mode: "peck", peck: 0.1 });
  assert.match(peck, /G83 .*Q0\.1/);
  const positions = buildBoltGcode(coords);
  assert.match(positions, /\(Hole 4\)/);
  assert.doesNotMatch(positions, /G81/);
});

test("CSV and DXF builders", () => {
  const coords = boltCircleCoordinates(2, 4);
  const csv = buildBoltCsv(coords, "in");
  assert.equal(csv.split("\n")[0], "Index,Angle_deg,X_in,Y_in");
  assert.equal(csv.trim().split("\n").length, 5);
  const dxf = buildBoltDxf(coords, 2);
  assert.match(dxf, /BOLT_CIRCLE/);
  assert.equal((dxf.match(/\nPOINT\n/g) || []).length, 4);
  assert.match(dxf, /EOF\n$/);
});
