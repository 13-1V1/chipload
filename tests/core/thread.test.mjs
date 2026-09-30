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

// Published 1/4-20 UNC-2A: PD max 0.2164, PD min 0.2127; major max 0.2489
test("1/4-20 2A limits estimate within 0.0005 of published", () => {
  const env = unToleranceEnvelope({ major: 0.25, pitch: 0.05 });
  near(env["2A"].pdMax, 0.2164, 0.0002, "2A PD max");
  near(env["2A"].pdMin, 0.2127, 0.0005, "2A PD min");
  near(env["2A"].majorMax, 0.2489, 0.0002, "2A major max");
  // 2B: PD min = basic 0.2175, PD max published 0.2224
  near(env["2B"].pdMin, 0.2175, 0.0001, "2B PD min");
  near(env["2B"].pdMax, 0.2224, 0.0005, "2B PD max");
});

test("series name lookups", () => {
  assert.equal(lookupUnThread(0.25, 20), "1/4-20 UNC");
  assert.equal(lookupUnThread(0.5, 13), "1/2-13 UNC");
  assert.equal(lookupMetricThread(10, 1.5), "M10x1.5");
  assert.equal(lookupUnThread(0.33, 17), null);
});
