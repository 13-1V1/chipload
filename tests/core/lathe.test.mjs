// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { turningTime, facingTimeRpm, facingTimeCss, surfaceFinish, feedForRa, noseRadiusTaperComp, arcCenterPathRadius, NOSE_RADII_IN } from "../../src/core/lathe.js";
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

// A 45° chamfer can't tell ΔX from ΔZ, so check a lopsided angle against the shifts worked out from scratch:
// offset the chamfer line by r to the air side (nose-center path), step back to the imaginary tip (tip 3 =
// center − (r, r)), then cross that tip path with the face (Z = 0) and with the diameter. 30° from the Z
// axis with a 1/32 nose: ΔZ = 0.0229, ΔX = 0.0132 (r(1 − tan 15°) and r(1 − tan 30°)).
test("nose radius comp for a 30° taper: ΔZ and ΔX are not the same number", () => {
  const r = 1 / 32, theta = 30;
  const a = Math.tan(theta * Math.PI / 180), L = Math.hypot(1, a); // chamfer from (Z 0, X 0) to (Z −1, X a)
  const n = [a / L, 1 / L], d = [-1 / L, a / L];
  const tip = (t) => [r * n[0] - r + t * d[0], r * n[1] - r + t * d[1]];
  const tFace = (r - r * n[0]) / d[0];
  const tDia = (a - (r * n[1] - r)) / d[1];
  const dx = -tip(tFace)[1], dz = -1 - tip(tDia)[0];
  const c = noseRadiusTaperComp({ noseRadius: r, angleFromZ: theta });
  near(c.dz, dz, 1e-12);
  near(c.dx, dx, 1e-12);
  near(c.dz, 0.0229, 0.0001);
  near(c.dx, 0.0132, 0.0001);
  // surface error the uncompensated tip leaves: r (sin θ + cos θ − 1)
  near(c.error, r * (0.5 + Math.sqrt(3) / 2 - 1), 1e-12);
});

// ANSI B212.4 nose radius codes 1–4: 1/64, 1/32, 3/64, 1/16 in, kept as the true fractions
test("insert nose radius presets are the exact fractions", () => {
  assert.deepEqual(Object.values(NOSE_RADII_IN), [1 / 64, 1 / 32, 3 / 64, 1 / 16]);
});

// Entering angle κr, measured from the work face (Sandvik Coromant: hex = fz × sin κr; 90° = square shoulder).
// A US catalog "15° lead" face mill is measured from the axis, so κr = 75° and the factor is 1/cos 15° = 1.035.
test("lead angle and corner radius chip thinning", () => {
  near(leadAngleThinningFactor(90), 1);
  near(leadAngleThinningFactor(45), Math.SQRT2, 1e-12);
  near(leadAngleThinningFactor(12), 4.81, 0.01);
  near(leadAngleThinningFactor(90 - 15), 1 / Math.cos(15 * Math.PI / 180), 1e-12);
  near(leadAngleThinningFactor(75), 1.035, 0.001);
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
