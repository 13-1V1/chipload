// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { metricToleranceEnvelope, acmeGeometry, stiTapDrill, parseThreadSpec } from "../../src/core/thread.js";
import { NPT_TABLE } from "../../src/data/npt.js";
import { nearestDrillInch } from "../../src/core/drills.js";
import { drillPointLength } from "../../src/calcs/drill-point.js";

// ISO 965: M10x1.5-6g PD 8.862–8.994, major 9.732–9.968; 6H PD 9.026–9.206, minor 8.376–8.676
test("M10x1.5 6g/6H limits land within 0.010 of the published tables", () => {
  const e = metricToleranceEnvelope({ major: 10, pitch: 1.5 });
  near(e.external.pdMax, 8.994, 0.002, "6g PD max");
  near(e.external.pdMin, 8.862, 0.006, "6g PD min");
  near(e.external.majorMax, 9.968, 0.002, "6g major max");
  near(e.external.majorMin, 9.732, 0.010, "6g major min");
  near(e.internal.pdMin, 9.026, 0.002, "6H PD min");
  near(e.internal.pdMax, 9.206, 0.010, "6H PD max");
  near(e.internal.minorMin, 8.376, 0.002, "6H minor min");
  near(e.internal.minorMax, 8.676, 0.010, "6H minor max");
});

test("M6x1 6g allowance is 0.026 and 4h has none", () => {
  near(metricToleranceEnvelope({ major: 6, pitch: 1 }).external.allowance, 0.026, 0.0005);
  assert.equal(metricToleranceEnvelope({ major: 6, pitch: 1, extPos: "h", extGrade: 4 }).external.allowance, 0);
});

// ASME B1.5: 1/2-10 Acme basic PD 0.4500, minor (int) 0.4000, depth 0.0500
test("1/2-10 Acme basic geometry", () => {
  const g = acmeGeometry({ major: 0.5, tpi: 10 });
  near(g.pitchDiameter, 0.45);
  near(g.internalMinor, 0.4);
  near(g.depth, 0.05);
  near(g.externalMinor, 0.38);
  near(g.allowance["2G"], 0.008 * Math.sqrt(0.5), 1e-12);
});

test("STI drill estimate hits the insert-maker sizes", () => {
  near(nearestDrillInch(stiTapDrill(0.25, 1 / 20)).size, 0.2656, 0.002, "1/4-20 → 17/64 or H");
  assert.equal(nearestDrillInch(stiTapDrill(0.375, 1 / 16)).label, "X");
  assert.equal(nearestDrillInch(stiTapDrill(0.5, 1 / 13)).label, '17/32"');
});

// ASME B1.20.1: 1/8-27 E1 = 0.37360, 1/2-14 E1 = 0.77843
test("NPT E1 = E0 + L1/16 matches the standard", () => {
  const r = NPT_TABLE.find((x) => x.name === "1/8-27");
  near(r.e0 + r.l1 / 16, 0.37360, 0.0001);
  const h = NPT_TABLE.find((x) => x.name === "1/2-14");
  near(h.e0 + h.l1 / 16, 0.77843, 0.0001);
});

test("drill point: 118° is 0.300 D, 135° is 0.207 D", () => {
  near(drillPointLength(1, 118), 0.3004, 0.0005);
  near(drillPointLength(1, 135), 0.2071, 0.0005);
  near(drillPointLength(1, 90), 0.5);
});

test("UNJ suffix parses as a UN thread with the series kept", () => {
  const t = parseThreadSpec("1/4-28 UNJ");
  assert.equal(t.system, "un");
  assert.equal(t.suppliedSeries, "UNJ");
});
