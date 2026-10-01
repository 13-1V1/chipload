// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { boltCircleCoordinates, partialBoltCircleCoordinates, buildBoltGcode, buildBoltPositions, buildBoltCsv, buildBoltDxf, boltGcodeProblems, usesOtherDialect } from "../../src/core/boltcircle.js";
import { gcodeNumber } from "../../src/core/format.js";

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
  assert.match(drill, /\nG20 G17 G40 G49 G80 G90\n/);
  assert.match(drill, /G81 G98 X1\.0 Y0\.0 Z-0\.5 R0\.1 F5\.0/);
  assert.match(drill, /M30\n%$/);
  const peck = buildBoltGcode(coords, { mode: "peck", peck: 0.1 });
  assert.match(peck, /G83 .*Q0\.1/);
  assert.match(buildBoltGcode(coords, { mode: "drill", units: "mm" }), /\nG21 G17/);
});

// The order of the lines is the safety of the program.
test("drill program: safety line, then tool, then length offset to Safe Z, then the cycle", () => {
  const lines = buildBoltGcode(boltCircleCoordinates(2, 4), { mode: "drill", z: -0.5, r: 0.1, safeZ: 1, tool: 7, workOffset: "G55", spindle: 1200 }).split("\n");
  const at = (re) => lines.findIndex((l) => re.test(l));
  const safety = at(/G49/), toolChange = at(/^T7 M6$/), offset = at(/^G55 G0 X1\.0 Y0\.0$/), spindle = at(/^S1200 M3$/), tlo = at(/^G43 H7 Z1\.0$/), cycle = at(/^G81 G98/), cancel = at(/^G80$/);
  for (const [name, i] of Object.entries({ safety, toolChange, offset, spindle, tlo, cycle, cancel })) assert.ok(i >= 0, `${name} line is there`);
  // G49 comes before the tool call, so it can never cancel the G43 that follows
  assert.ok(safety < toolChange && toolChange < offset && offset < spindle && spindle < tlo && tlo < cycle && cycle < cancel, lines.join(" | "));
  assert.equal(lines.filter((l) => /G49/.test(l)).length, 1);
  // nothing moves Z between the G43 and the cycle: the cycle starts at Safe Z, so G98 lifts back to it between holes
  assert.ok(lines.slice(tlo + 1, cycle).every((l) => !/Z/.test(l)), "no Z move between G43 and the cycle");
  assert.equal(lines[cancel + 1], "G0 Z1.0");
  // comments: capitals, digits, space and . - / only — some controls reject anything else
  for (const l of lines.filter((x) => x.startsWith("("))) assert.match(l, /^\([A-Z0-9 .\-/]+\)$/, l);
  assert.doesNotMatch(lines.join("\n"), /ADD YOUR/);
  // every line fits a phone (and an old control's screen) without scrolling sideways
  for (const mode of ["positions", "drill", "peck"]) {
    const longest = buildBoltGcode(boltCircleCoordinates(123.4567, 360, 0, "ccw", -100, -100), { mode, units: "mm", z: -123.456, r: 12.345, peck: 12.345, feed: 1234.5, safeZ: 123.456, tool: 999, spindle: 24000 })
      .split("\n").filter((l) => l.startsWith("(")).reduce((a, b) => (b.length > a.length ? b : a), "");
    assert.ok(longest.length <= 36, `${mode}: "${longest}" is ${longest.length} characters`);
  }
});

test("positions program never moves Z and stops at every hole", () => {
  const text = buildBoltGcode(boltCircleCoordinates(2, 4));
  const lines = text.split("\n");
  assert.match(text, /\(HOLE 4\)/);
  assert.doesNotMatch(text, /G81|G43|G49|M3\b|M6/);
  assert.ok(lines.every((l) => l.startsWith("(") || !/Z/.test(l)), "no Z word outside a comment");
  assert.equal(lines.filter((l) => l === "M0").length, 4);
  for (const l of lines.filter((x) => x.startsWith("("))) assert.match(l, /^\([A-Z0-9 .\-/]+\)$/, l);
});

test("controls that don't speak Fanuc get bare positions", () => {
  assert.equal(usesOtherDialect("okuma"), "Okuma");
  assert.equal(usesOtherDialect("Siemens"), "Siemens");
  assert.equal(usesOtherDialect("heidenhain"), "Heidenhain");
  for (const c of ["fanuc", "haas", "mazak", "linuxcnc", "other", undefined]) assert.equal(usesOtherDialect(c), null);
  assert.equal(buildBoltPositions(boltCircleCoordinates(2, 4)), "X1.0 Y0.0\nX0.0 Y1.0\nX-1.0 Y0.0\nX0.0 Y-1.0");
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

// On Fanuc-style controls "X1" can mean 0.0001 in. Every coordinate, R, Q and F word must carry a decimal point.
test("G-code words always carry a decimal point", () => {
  assert.equal(gcodeNumber(1, 4), "1.0");
  assert.equal(gcodeNumber(0, 4), "0.0");
  assert.equal(gcodeNumber(-0, 4), "0.0");
  assert.equal(gcodeNumber(-0.00001, 4), "0.0");
  assert.equal(gcodeNumber(-0.5, 4), "-0.5");
  assert.equal(gcodeNumber(1.23456, 4), "1.2346");
  assert.equal(gcodeNumber(25, 3), "25.0");
  for (const mode of ["positions", "drill", "peck"]) {
    for (const units of ["in", "mm"]) {
      const code = buildBoltGcode(boltCircleCoordinates(2, 4, 0, "ccw", 1, -1), { mode, units, z: -1, r: 1, feed: 5, peck: 1, safeZ: 2 });
      const bare = [...code.matchAll(/([XYZRQF])(-?\d+)(?![\d.])/g)].map((m) => m[0]);
      assert.deepEqual(bare, [], `${mode}/${units}: ${bare.join(" ")}`);
      assert.match(code, /S1000 M3|\(HOLE 1\)/);
    }
  }
});

test("drill cycles that would cut air or crash are refused with a reason", () => {
  assert.deepEqual(boltGcodeProblems({ mode: "drill", z: -0.5, r: 0.1, safeZ: 1, feed: 5, spindle: 1000 }), []);
  assert.match(boltGcodeProblems({ mode: "drill", z: 0.5, r: 0.1, safeZ: 1, feed: 5, spindle: 1000 })[0], /below the R plane/);
  assert.match(boltGcodeProblems({ mode: "drill", z: -0.5, r: 0.1, safeZ: 0.05, feed: 5, spindle: 1000 })[0], /Safe Z/);
  assert.match(boltGcodeProblems({ mode: "peck", z: -0.5, r: 0.1, safeZ: 1, feed: 5, spindle: 1000, peck: 0 })[0], /Peck/);
  assert.match(boltGcodeProblems({ mode: "drill", z: -0.5, r: 0.1, safeZ: 1, feed: 0, spindle: 1000 })[0], /Feed/);
  assert.deepEqual(boltGcodeProblems({ mode: "positions", z: 5, r: 0, safeZ: 1 }), []);
});
