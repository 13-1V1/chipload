// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { tapDrillByPercent, percentThreadForDrill, formTapDrillByPercent, lookupTapDrillUN, lookupTapDrillMetric } from "../../src/core/tapdrill.js";
import { nearestDrillInch } from "../../src/core/drills.js";

// Machinery's Handbook: 1/4-20 at 75% → 0.2013, stock drill #7 (0.201)
test("1/4-20 at 75% thread lands on a #7 drill", () => {
  const d = tapDrillByPercent(0.25, 0.05, 75);
  near(d, 0.2013, 0.0001);
  assert.equal(nearestDrillInch(d).label, "#7");
  assert.equal(lookupTapDrillUN(0.25, 20).label, "#7");
});

test("published stock drills: 3/8-16 → 5/16, 1/2-13 → 27/64, 10-32 → #21", () => {
  assert.equal(lookupTapDrillUN(0.375, 16).label, '5/16"');
  assert.equal(lookupTapDrillUN(0.5, 13).label, '27/64"');
  assert.equal(lookupTapDrillUN(0.19, 32).label, "#21");
  assert.equal(lookupTapDrillMetric(10, 1.5).size, 8.5);
  assert.equal(lookupTapDrillMetric(6, 1.0).size, 5.0);
});

test("percent formula is monotonic and invertible", () => {
  assert.ok(tapDrillByPercent(0.25, 0.05, 60) > tapDrillByPercent(0.25, 0.05, 80));
  near(percentThreadForDrill(0.25, 0.05, tapDrillByPercent(0.25, 0.05, 72)), 72, 1e-9);
});

// Form tap 1/4-20 at 65%: common maker charts list 0.228 (#1) — formula gives 0.2279
test("roll-form tap drill is larger than cut-tap drill", () => {
  const form = formTapDrillByPercent(0.25, 0.05, 65);
  near(form, 0.228, 0.001);
  assert.ok(form > tapDrillByPercent(0.25, 0.05, 65));
});
