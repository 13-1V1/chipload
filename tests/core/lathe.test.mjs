// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { turningTime, facingTimeRpm, facingTimeCss, surfaceFinish, feedForRa, noseRadiusTaperComp, arcCenterPathRadius } from "../../src/core/lathe.js";
import { leadAngleThinningFactor, cornerRadiusThinningFactor, circleInterpolationFeed, cutTime, metalRemovalRate } from "../../src/core/milling.js";

test("turning 4 in at 0.010 ipr and 800 rpm takes 0.5 min", () => {
  near(turningTime({ length: 4, ipr: 0.010, rpm: 800 }), 0.5);
});

test("facing a 2 in bar: RPM mode vs CSS mode", () => {
  near(facingTimeRpm({ outerDia: 2, ipr: 0.005, rpm: 573 }), 0.349, 0.001);
  // π × 4 ÷ (48 × 300 × 0.005) = 0.1745 min
  near(facingTimeCss({ outerDia: 2, sfm: 300, ipr: 0.005 }), 0.1745, 0.0001);
  near(facingTimeCss({ outerDia: 2, innerDia: 2, sfm: 300, ipr: 0.005 }), 0);
});

// Machinery's Handbook: 0.005 ipr with 1/32 nose → Ra ≈ 25 µin, Rt = 100 µin
test("surface finish from feed and nose radius", () => {
  const f = surfaceFinish({ feedPerRev: 0.005, noseRadius: 1 / 32 });
  near(f.rt * 1e6, 100, 0.01);
  near(f.ra * 1e6, 25.64, 0.01);
  near(feedForRa({ ra: f.ra, noseRadius: 1 / 32 }), 0.005, 1e-12);
});

// 45° chamfer with 1/32 nose: both shifts = r(1 − tan 22.5°) = 0.586 r
test("nose radius comp for a 45° chamfer", () => {
  const c = noseRadiusTaperComp({ noseRadius: 1 / 32, angleFromZ: 45 });
  near(c.dz, 0.03125 * 0.5858, 0.0001);
  near(c.dx, c.dz, 1e-12);
  near(c.error, 0.03125 * 0.4142, 0.0001);
  const s = noseRadiusTaperComp({ noseRadius: 1 / 32, angleFromZ: 0 });
  near(s.error, 0, 1e-12);
  assert.equal(arcCenterPathRadius({ radius: 0.25, noseRadius: 0.03125, convex: true }), 0.28125);
  assert.equal(arcCenterPathRadius({ radius: 0.25, noseRadius: 0.03125, convex: false }), 0.21875);
});

test("lead angle and corner radius chip thinning", () => {
  near(leadAngleThinningFactor(90), 1);
  near(leadAngleThinningFactor(45), Math.SQRT2, 1e-12);
  near(leadAngleThinningFactor(12), 4.81, 0.01);
  // r = 0.030, ap = 0.015 → κ = 60° → 1.1547
  near(cornerRadiusThinningFactor({ cornerRadius: 0.03, depth: 0.015 }), 1.1547, 0.0001);
  near(cornerRadiusThinningFactor({ cornerRadius: 0.03, depth: 0.05 }), 1);
});

test("circular interpolation feed comp", () => {
  near(circleInterpolationFeed({ feed: 20, toolDia: 0.5, featureDia: 1, internal: true }), 10);
  near(circleInterpolationFeed({ feed: 20, toolDia: 0.5, featureDia: 1, internal: false }), 30);
  assert.throws(() => circleInterpolationFeed({ feed: 20, toolDia: 1, featureDia: 1, internal: true }));
});

test("cut time and MRR", () => {
  near(cutTime({ length: 30, feed: 60 }), 0.5);
  near(metalRemovalRate({ widthOfCut: 0.1, depthOfCut: 0.5, feed: 40 }), 2);
});
