// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { bandSawSpeed, tpiForThickness, bladeSpeedFromWheel, wheelRpmForSpeed } from "../../src/core/saw.js";
import { GLOSSARY } from "../../src/data/glossary.js";

test("band saw speeds: steel slow, aluminum fast, unknown group falls back", () => {
  const steel = bandSawSpeed("Carbon steel", 78);
  assert.ok(steel.start >= 250 && steel.start <= 350, `steel ${steel.start}`);
  const al = bandSawSpeed("Aluminum", 90);
  assert.ok(al.start >= 1500, `aluminum ${al.start}`);
  assert.ok(bandSawSpeed("Nope").start >= 200);
});

// 1 in stock: 3–24 TPI usable, aim near 8 → pick 8 TPI; 1/8 in: aim 64 → finest common (32) with ≥3 teeth
test("tooth pitch rule keeps 3–24 teeth in the cut", () => {
  const one = tpiForThickness(1);
  assert.equal(one.pick, 8);
  assert.deepEqual(one.usable, [3, 4, 6, 8, 10, 14, 18, 24]);
  const thin = tpiForThickness(0.125);
  assert.equal(thin.pick, 32);
  assert.ok(thin.teethInCut >= 3);
  const thick = tpiForThickness(4);
  assert.equal(thick.pick, 2);
  assert.equal(tpiForThickness(0), null);
});

// 14 in wheel at 60 RPM → π × 14 × 60 ÷ 12 = 219.9 FPM
test("wheel diameter and RPM ↔ blade speed", () => {
  near(bladeSpeedFromWheel(14, 60), 219.9, 0.1);
  near(wheelRpmForSpeed(14, 219.9), 60, 0.05);
});

test("glossary covers the words beginners hit first", () => {
  const terms = GLOSSARY.map((g) => g[0].toLowerCase());
  for (const t of ["sfm", "rpm", "ipm", "chip load", "tpi", "tap drill", "counterbore", "clearance hole", "ra", "true position"]) {
    assert.ok(terms.some((x) => x.includes(t)), `missing ${t}`);
  }
  for (const g of GLOSSARY) assert.ok(g[2].length > 20, `${g[0]} needs a real explanation`);
});
