// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { radialChipThinningFactor, calculateSpeedsFeeds, rpmFromSfm, sfmFromRpm } from "../../src/core/feeds.js";

// Machinery's Handbook: 1/2" tool at 100 SFM → 764 RPM
test("RPM from SFM matches handbook", () => {
  near(rpmFromSfm(100, 0.5), 763.94, 0.01);
  near(sfmFromRpm(rpmFromSfm(100, 0.5), 0.5), 100, 1e-9);
});

test("radial chip thinning factor", () => {
  near(radialChipThinningFactor(0.5, 0.25), 1);
  near(radialChipThinningFactor(0.5, 0.05), 5 / 3, 1e-12);
  near(radialChipThinningFactor(12.7, 1.27), 5 / 3, 1e-12);
});

test("3/8 4-flute at 400 SFM, 0.003 chip load → 4074 RPM, 48.9 IPM", () => {
  const r = calculateSpeedsFeeds({ units: "in", diameter: 0.375, flutes: 4, sfm: 400, chipLoadIn: 0.003 });
  near(r.rpm, 4074.4, 0.1);
  near(r.feed, 48.89, 0.01);
});

test("inch and metric inputs agree", () => {
  const inch = calculateSpeedsFeeds({ units: "in", diameter: 0.5, flutes: 4, sfm: 400, chipLoadIn: 0.003, widthOfCut: 0.05, depthOfCut: 0.1 });
  const metric = calculateSpeedsFeeds({ units: "mm", diameter: 12.7, flutes: 4, sfm: 400, chipLoadIn: 0.003, widthOfCut: 1.27, depthOfCut: 2.54 });
  near(metric.rpm, inch.rpm);
  near(metric.feed, inch.feed * 25.4, 1e-8);
  near(metric.mrr, inch.mrr * 25.4 ** 3, 1e-5);
});

test("machine RPM and feed caps clamp and flag", () => {
  const r = calculateSpeedsFeeds({ units: "in", diameter: 0.5, flutes: 4, sfm: 800, chipLoadIn: 0.003, maxRpm: 2000, maxFeed: 10 });
  assert.equal(r.rpm, 2000);
  assert.equal(r.feed, 10);
  assert.equal(r.limitedByRpm, true);
  assert.equal(r.limitedByFeed, true);
});
