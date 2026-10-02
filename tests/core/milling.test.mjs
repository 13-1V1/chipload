// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { threadMilling, ballNoseScallopHeight, ballNoseStepover } from "../../src/core/milling.js";
import { reamerAllowance } from "../../src/core/tapping.js";
import { toleranceStack } from "../../src/core/tolstack.js";

test("internal thread mill centerline feed comp", () => {
  const tm = threadMilling({ units: "in", majorDiameter: 0.5, cutterDiameter: 0.25, rpm: 3000, flutes: 3, chipLoad: 0.001 });
  near(tm.surfaceFeed, 9);
  near(tm.centerlineFeed, 4.5);
  assert.throws(() => threadMilling({ majorDiameter: 0.25, cutterDiameter: 0.5, rpm: 1, flutes: 1, chipLoad: 1 }));
});

// 1/2" ball (R 0.25), 0.100 stepover → 0.00505 cusp
test("ball-nose scallop and stepover invert", () => {
  const h = ballNoseScallopHeight({ radius: 0.25, stepover: 0.1 });
  near(h, 0.00505, 0.00001);
  near(ballNoseStepover({ radius: 0.25, scallopHeight: h }), 0.1);
  assert.ok(Number.isNaN(ballNoseStepover({ radius: 0.25, scallopHeight: 0.3 })));
});

test("reamer allowance", () => {
  near(reamerAllowance({ targetDiameter: 0.5, allowancePerSide: 0.005 }).preReamDiameter, 0.49);
});

test("tolerance stack worst case and RSS", () => {
  const r = toleranceStack([{ nominal: 1, tolerance: 0.005 }, { nominal: 2, tolerance: 0.01 }]);
  near(r.nominal, 3);
  near(r.worstCaseTolerance, 0.015);
  near(r.rssTolerance, Math.sqrt(0.000125));
  near(r.worstCaseMin, 2.985);
  near(r.worstCaseMax, 3.015);
});
