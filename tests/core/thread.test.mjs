// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { parseThreadSpec, basicThreadGeometry, unToleranceEnvelope, lookupUnThread, lookupMetricThread } from "../../src/core/thread.js";

test("parseThreadSpec recognizes Unified, machine screw, and metric forms", () => {
  const unified = parseThreadSpec("1/4-20 UNC");
  assert.equal(unified.system, "un");
  assert.equal(unified.major, 0.25);
  assert.equal(unified.tpi, 20);
  assert.equal(unified.suppliedSeries, "UNC");
  assert.equal(parseThreadSpec("#10-32").major, 0.19);
  assert.equal(parseThreadSpec("M10").pitch, 1.5);
  assert.equal(parseThreadSpec("M10x1.25").pitch, 1.25);
  assert.equal(parseThreadSpec("not a thread"), null);
});

// Published basic dimensions, ASME B1.1 Table 3A: 1/4-20 UNC
test("1/4-20 basic geometry matches ASME B1.1", () => {
  const g = basicThreadGeometry(0.25, 1 / 20);
  near(g.pitchDiameter, 0.2175, 0.0001, "basic PD");
  near(g.internalMinor, 0.1959, 0.0001, "basic minor (internal)");
});

// ASME B1.1 / Machinery's Handbook "Unified Screw Threads — Limits of Size", inches.
// [name, major, tpi, 2A PD max, 2A PD min, 2B PD min, 2B PD max]
const PUBLISHED_UN_LIMITS = [
  ["#4-40 UNC", 0.112, 40, 0.0950, 0.0925, 0.0958, 0.0991],
  ["#6-32 UNC", 0.138, 32, 0.1169, 0.1141, 0.1177, 0.1214],
  ["#8-32 UNC", 0.164, 32, 0.1428, 0.1399, 0.1437, 0.1475],
  ["#10-24 UNC", 0.19, 24, 0.1619, 0.1586, 0.1629, 0.1672],
  ["#10-32 UNF", 0.19, 32, 0.1688, 0.1658, 0.1697, 0.1736],
  ["1/4-20 UNC", 0.25, 20, 0.2164, 0.2127, 0.2175, 0.2224],
  ["5/16-18 UNC", 0.3125, 18, 0.2752, 0.2712, 0.2764, 0.2817],
  ["3/8-16 UNC", 0.375, 16, 0.3331, 0.3287, 0.3344, 0.3401],
  ["3/8-24 UNF", 0.375, 24, 0.3468, 0.3430, 0.3479, 0.3528],
  ["1/2-13 UNC", 0.5, 13, 0.4485, 0.4435, 0.4500, 0.4565],
  ["1/2-20 UNF", 0.5, 20, 0.4662, 0.4619, 0.4675, 0.4731],
  ["3/4-10 UNC", 0.75, 10, 0.6832, 0.6773, 0.6850, 0.6927],
  ["1-8 UNC", 1, 8, 0.9168, 0.9100, 0.9188, 0.9276],
];

test("UN pitch-diameter limits match the ASME B1.1 tables to the fourth place", () => {
  for (const [name, major, tpi, aMax, aMin, bMin, bMax] of PUBLISHED_UN_LIMITS) {
    const env = unToleranceEnvelope({ major, pitch: 1 / tpi });
    near(env["2A"].pdMax, aMax, 5e-5, `${name} 2A PD max`);
    near(env["2A"].pdMin, aMin, 5e-5, `${name} 2A PD min`);
    near(env["2B"].pdMin, bMin, 5e-5, `${name} 2B PD min`);
    near(env["2B"].pdMax, bMax, 5e-5, `${name} 2B PD max`);
  }
});

// Published 1/4-20 UNC: 2A major 0.2489/0.2408; 3A PD 0.2175/0.2147, major 0.2500/0.2419; 3B PD max 0.2211;
// minor 2B 0.196/0.207, 3B 0.1960/0.2067. 1/2-13 UNC: 2A major 0.4985/0.4876, 3A 0.4463 / 0.4891, 3B PD max 0.4548, minor 3B max 0.4284.
test("UN major and minor diameter limits, and class 3, match the tables", () => {
  const q = unToleranceEnvelope({ major: 0.25, pitch: 1 / 20 });
  near(q["2A"].majorMax, 0.2489, 5e-5); near(q["2A"].majorMin, 0.2408, 5e-5);
  near(q["3A"].pdMax, 0.2175, 5e-5); near(q["3A"].pdMin, 0.2147, 5e-5);
  near(q["3A"].majorMax, 0.2500, 5e-5); near(q["3A"].majorMin, 0.2419, 5e-5, "3A shares the 2A major tolerance");
  near(q["3B"].pdMax, 0.2211, 5e-5);
  near(q["2B"].minorMin, 0.196, 5e-4); near(q["2B"].minorMax, 0.207, 5e-4);
  near(q["3B"].minorMax, 0.2067, 5e-5);
  const h = unToleranceEnvelope({ major: 0.5, pitch: 1 / 13 });
  near(h["2A"].majorMax, 0.4985, 5e-5); near(h["2A"].majorMin, 0.4876, 5e-5);
  near(h["3A"].pdMin, 0.4463, 5e-5); near(h["3A"].majorMin, 0.4891, 5e-5);
  near(h["3B"].pdMax, 0.4548, 5e-5); near(h["3B"].minorMax, 0.4284, 5e-5);
  near(h["2B"].minorMin, 0.417, 5e-4); near(h["2B"].minorMax, 0.434, 5e-4);
  // small sizes use the D-dependent minor tolerance: #10-32 2B minor 0.156/0.164, #4-40 0.0849/0.0939
  const ten = unToleranceEnvelope({ major: 0.19, pitch: 1 / 32 });
  near(ten["2B"].minorMin, 0.156, 5e-4); near(ten["2B"].minorMax, 0.164, 5e-4);
  const four = unToleranceEnvelope({ major: 0.112, pitch: 1 / 40 });
  near(four["2B"].minorMin, 0.0849, 5e-5); near(four["2B"].minorMax, 0.0939, 5e-5);
});

// UNEF and specials are toleranced on nine pitches of engagement, not one diameter: 1/2-28 UNEF-2A PD 0.4757/0.4720.
test("engagement length: one diameter for UNC and UNF, nine pitches otherwise", () => {
  const unef = unToleranceEnvelope({ major: 0.5, pitch: 1 / 28 });
  near(unef.engagement, 9 / 28, 1e-12);
  near(unef["2A"].pdMax, 0.4757, 5e-5); near(unef["2A"].pdMin, 0.4720, 5e-5);
  near(unToleranceEnvelope({ major: 0.5, pitch: 1 / 13 }).engagement, 0.5, 1e-12);
  near(unToleranceEnvelope({ major: 1.125, pitch: 1 / 8 }).engagement, 1.125, 1e-12, "8-thread series");
});

test("series name lookups", () => {
  assert.equal(lookupUnThread(0.25, 20), "1/4-20 UNC");
  assert.equal(lookupUnThread(0.5, 13), "1/2-13 UNC");
  assert.equal(lookupMetricThread(10, 1.5), "M10x1.5");
  assert.equal(lookupUnThread(0.33, 17), null);
});

// Callouts the way they are written on prints. "1-8" is one inch, not a #1 screw.
test("thread callouts: big inch sizes, mixed numbers, suffixes, quotes", () => {
  const un = [["1-8", 1, 8], ["1-12", 1, 12], ["1-14", 1, 14], ['1"-8', 1, 8], ["2-4.5", 2, 4.5], ["2-56", 0.086, 56], ["4-40", 0.112, 40], ["10-32", 0.19, 32],
    ["1 1/8-7", 1.125, 7], ["1-1/8-7", 1.125, 7], ["1-1/4-7", 1.25, 7], ["1 1/2-6", 1.5, 6], [".250-20", 0.25, 20], ['1/4"-20', 0.25, 20], ["3/8-16 UNC-2B", 0.375, 16], ["1/4-20 UNC 2A", 0.25, 20], ["5/16-18 NC", 0.3125, 18], ["4-8", 4, 8], ["3-48", 0.099, 48]];
  for (const [text, major, tpi] of un) { const t = parseThreadSpec(text); assert.ok(t && t.system === "un" && Math.abs(t.major - major) < 1e-9 && t.tpi === tpi, `${text} → ${JSON.stringify(t)}`); }
  const metric = [["M12x1.75-6H", 12, 1.75], ["M10x1.5 6g", 10, 1.5], ["M8-6H", 8, 1.25], ["M16x2-6H/6g", 16, 2], ["M 10", 10, 1.5]];
  for (const [text, major, pitch] of metric) { const t = parseThreadSpec(text); assert.ok(t && t.system === "metric" && t.major === major && t.pitch === pitch, `${text} → ${JSON.stringify(t)}`); }
  for (const bad of ["M0x0", "M10x0", "M10x12", "0-0", "1/0-20", "1/4-0", "#99-99", "1/4--20", "m10x1.5x2", "-1/4-20", "1/4", "20", "<script>", "a".repeat(5000)]) assert.equal(parseThreadSpec(bad), null, `should reject ${bad.slice(0, 20)}`);
  assert.equal(parseThreadSpec("1 1/8-7").label, "1-1/8-7");
  assert.equal(parseThreadSpec("3/8-16 UNC-2B").suppliedSeries, "UNC");
});
