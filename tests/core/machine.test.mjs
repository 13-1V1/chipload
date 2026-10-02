// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The Shop machine profile is applied one way everywhere: right machine for the work, RPM cap,
// then feed cap by slowing the spindle so the chip load holds.

import test from "node:test";
import assert from "node:assert/strict";
import { machineFor, maxFeedIpmOf, fitToMachine, maxRpmAtFeed, spindleSanity } from "../../src/calcs/_machine.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const c = (units = "in", machine = null, pro = true) => ({ units, L: UNIT_LABEL[units], machine, settings: { units, pro } });
const mill = { name: "VF-2", type: "mill", maxRpm: 8100, maxFeed: 650, units: "in" };
const lathe = { name: "ST-10", type: "lathe", maxRpm: 6000, maxFeed: 400, units: "in" };

test("a mill profile limits mill work, a lathe profile limits lathe work, drilling takes either", () => {
  assert.equal(machineFor(c("in", mill), "mill"), mill);
  assert.equal(machineFor(c("in", mill), "lathe"), null);
  assert.equal(machineFor(c("in", lathe), "mill"), null);
  assert.equal(machineFor(c("in", lathe), "lathe"), lathe);
  assert.equal(machineFor(c("in", lathe), "any"), lathe);
  assert.equal(machineFor(c("in", null), "any"), null);
});

test("a machine saved in mm has its max feed read in mm/min", () => {
  assert.equal(maxFeedIpmOf({ maxFeed: 2540, units: "mm" }), 100);
  assert.equal(maxFeedIpmOf({ maxFeed: 0, units: "in" }), Infinity);
});

test("no machine: the cut comes back as asked", () => {
  const f = fitToMachine(null, 12000, 0.006, c());
  assert.equal(f.rpm, 12000);
  assert.equal(f.feedIpm, 72);
  assert.equal(f.rpmCapped || f.feedCapped, false);
  assert.deepEqual(f.warnings, []);
});

test("RPM cap: feed is figured at the machine's top speed, chip load unchanged", () => {
  const f = fitToMachine(mill, 15279, 0.008, c("in", mill));
  assert.equal(f.rpm, 8100);
  assert.ok(Math.abs(f.feedIpm - 64.8) < 1e-9);
  assert.equal(f.rpmCapped, true);
  assert.equal(f.feedCapped, false);
  assert.match(f.warnings[0], /VF-2 tops out at 8100 RPM/);
});

test("feed cap: the spindle slows to a whole RPM so feed per rev holds", () => {
  const f = fitToMachine({ ...mill, maxFeed: 30 }, 3000, 0.02, c("in", mill));
  assert.equal(f.feedCapped, true);
  assert.equal(f.rpm, 1500);
  assert.ok(f.feedIpm <= 30 + 1e-9);
  assert.ok(Math.abs(f.feedIpm / f.rpm - 0.02) < 1e-12, "chip load holds");
  assert.match(f.warnings[0], /max feed is 30 IPM/);
});

test("float noise from a mm round trip never trips a cap", () => {
  const m = { name: "M", type: "mill", maxRpm: 0, maxFeed: 1000, units: "mm" };
  const f = fitToMachine(m, 1000, (1000 / 25.4) / 1000 * (1 + 1e-12), c("mm", m));
  assert.equal(f.feedCapped, false);
});

test("spindle sanity: warn past what most machines turn, only with no machine set", () => {
  assert.equal(spindleSanity(25000, null, "mill", c()).length, 1);
  assert.equal(spindleSanity(25000, mill, "mill", c()).length, 0);
  assert.equal(spindleSanity(15000, null, "mill", c()).length, 0);
  assert.equal(spindleSanity(9000, null, "lathe", c()).length, 1);
  assert.match(spindleSanity(25000, null, "mill", c("in", null, false))[0], /top speed/);
  assert.doesNotMatch(spindleSanity(25000, null, "mill", c("in", null, false))[0], /Shop/);
});

// Both caps: the RPM line only names the machine's top; the feed line says where the spindle lands.
// Bridgeport (2720 RPM / 30 IPM), 3/8 in 4-flute at 1000 SFM wants 10186 RPM; at 0.016 IPR 2720 RPM needs
// 43.5 IPM, so the spindle drops to floor(30 ÷ 0.016) = 1875 RPM.
test("both caps: no 'figured at <max> RPM' next to the spindle drop", () => {
  const bp = { name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, units: "in" };
  const f = fitToMachine(bp, 10186, 0.016, c("in", bp));
  assert.equal(f.rpmCapped && f.feedCapped, true);
  assert.equal(f.rpm, 1875);
  assert.equal(f.warnings[0], "Bridgeport tops out at 2720 RPM. Wanted 10186.");
  assert.match(f.warnings[1], /drops to 1875 RPM/);
  assert.doesNotMatch(f.warnings.join(" "), /figured at/);
  // RPM cap alone still says the feed is figured at the top speed; with no feed (iprIn 0) it doesn't talk feed
  assert.match(fitToMachine(bp, 10186, 0.001, c("in", bp)).warnings[0], /Feed is figured at 2720 RPM/);
  assert.equal(fitToMachine(bp, 10186, 0, c("in", bp)).warnings[0], "Bridgeport tops out at 2720 RPM. Wanted 10186.");
});

test("one turn moves more than the machine's max feed: cantRun with a plain reason, never a 0 RPM cut", () => {
  const lathe5 = { name: "Lathe 5", type: "lathe", maxRpm: 2000, maxFeed: 5, units: "in" };
  const f = fitToMachine(lathe5, 800, 7, c("in", lathe5));
  assert.equal(f.cantRun, true);
  assert.equal(f.rpm, 0);
  assert.equal(f.feedIpm, 0);
  assert.equal(f.problem, "Lathe 5 max feed is 5 IPM, less than one turn at 7 IPR. Check the feed per rev, or the max feed in Shop.");
  assert.deepEqual(f.warnings, [f.problem]);
  // the same cut on a metric screen reads in mm
  const mm = fitToMachine(lathe5, 800, 7, c("mm", lathe5));
  assert.equal(mm.problem, "Lathe 5 max feed is 127 mm/min, less than one turn at 177.8 mm/rev. Check the feed per rev, or the max feed in Shop.");
  // exactly one turn's worth is the slowest cut that runs: 1 RPM
  const one = fitToMachine(lathe5, 800, 5, c("in", lathe5));
  assert.equal(one.cantRun, false);
  assert.equal(one.rpm, 1);
  assert.equal(one.problem, null);
  // no machine: nothing can't run
  assert.equal(fitToMachine(null, 800, 7, c()).cantRun, false);
});

test("a feed cap that divides evenly lands on the whole RPM, not one under it", () => {
  // 7 ÷ 0.035 is 199.99999999999997 in floating point; the machine runs 200 RPM at 7 IPM, not 199
  const bp = { name: "BP", type: "mill", maxRpm: 0, maxFeed: 7, units: "in" };
  assert.equal(fitToMachine(bp, 3000, 0.035, c("in", bp)).rpm, 200);
  assert.equal(maxRpmAtFeed(bp, 0.035), 200);
  assert.equal(maxRpmAtFeed(null, 0.015), Infinity);
  assert.equal(maxRpmAtFeed({ ...bp, maxRpm: 150 }, 0.035), 150);
  assert.equal(maxRpmAtFeed(bp, 40), 0);
});
