// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Fix round 5, machine team: bolt circle's too-fast line judges the S word it posts, drilling on a lathe profile
// is judged by the lathe line, lathe fit messages say "feed per rev", and the TNR radius history row has units.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";
import { spindleSanity } from "../../src/calcs/_machine.js";

const ctx = (units = "in", machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id), c = ctx(units, machine);
  const built = buildValues(def, defaultRaw(def, over, units), c);
  assert.equal(built.invalid.size, 0, `${id}: ${[...built.invalid].join(",")}`);
  return def.compute(built.values, c);
};
const tooFast = (out) => out.warnings.filter((w) => /more than most (lathes|spindles) turn/.test(w));

const ROUTER = { name: "Router", type: "mill", maxRpm: 0, maxFeed: 50, units: "in" };
const FOL = { name: "FOL", type: "lathe", maxRpm: 0, maxFeed: 200, units: "in" };

// 100 IPM ÷ 25000 RPM = 0.004 IPR; a 50 IPM machine runs that at 50 ÷ 0.004 = 12500 RPM.
test("bolt circle: the too-fast line describes the S word posted, and only when a program is written", () => {
  const out = run("bolt-circle", { gcode: "drill", spindle: "25000", feed: "100" }, "in", ROUTER);
  assert.match(out.code[0].text, /\nS12500 M3\n/);
  assert.deepEqual(tooFast(out), [], out.warnings.join(" | "));
  // still over the line after the cap, the line names the posted S: 150 IPM ÷ 30000 RPM = 0.005 IPR, and a
  // 120 IPM machine runs that at 120 ÷ 0.005 = 24000 RPM.
  const wide = { ...ROUTER, maxFeed: 120 };
  const fast = run("bolt-circle", { gcode: "drill", spindle: "30000", feed: "150" }, "in", wide);
  assert.match(fast.code[0].text, /\nS24000 M3\n/);
  assert.deepEqual(tooFast(fast).map((w) => w.split(" RPM")[0]), [fmt(24000, 0)]);
  // nothing capped: the typed spindle is the posted one and is still flagged (no machine)
  assert.match(tooFast(run("bolt-circle", { gcode: "drill", spindle: "30000", feed: "90" }))[0], /^30000 RPM is more than most spindles/);
  // blocked (one turn moves more than the max feed): no program, so no spindle line about it
  const blocked = run("bolt-circle", { gcode: "drill", spindle: "25000", feed: "5000000" }, "in", { ...ROUTER, maxFeed: 1 });
  assert.equal(blocked.code.length, 0);
  assert.ok(blocked.warnings.some((w) => /^G-code not written/.test(w)), blocked.warnings.join(" | "));
  assert.deepEqual(tooFast(blocked), []);
});

// 6061 drill SFM at Ø0.0625 in wants ~14,668 RPM (the packet's measured value), far past the 6000 RPM lathe line.
test("drilling on a lathe profile with Max spindle blank is judged by the lathe line", () => {
  const out = run("feeds-drill", { diameter: "0.0625", material: "al6061" }, "in", FOL);
  const lines = tooFast(out);
  assert.equal(lines.length, 1, out.warnings.join(" | "));
  const rpm = out.stats.find((s) => /^Spindle/.test(s.label)).value;
  assert.equal(fmt(rpm, 0), "14668");
  assert.match(lines[0], /^14668 RPM is more than most lathes turn\. FOL has no max spindle set/);
  // the shared helper: "any" follows the profile, and with no profile or a mill profile stays on the 20,000 line
  assert.equal(spindleSanity(8000, FOL, "any", ctx()).length, 1);
  assert.deepEqual(spindleSanity(8000, ROUTER, "any", ctx()), []);
  assert.deepEqual(spindleSanity(8000, null, "any", ctx()), []);
  assert.match(spindleSanity(21000, null, "any", ctx())[0], /more than most spindles turn/);
});

// 0.1 in at the default turning SFM is far past 200 IPM at 0.05 IPR, so the spindle drops to 200 ÷ 0.05 = 4000.
test("lathe and drill screens: a slowed spindle keeps the feed per rev, never 'the chip load'", () => {
  const capped = { name: "ST", type: "lathe", maxRpm: 3000, maxFeed: 0, units: "in" };
  const outs = [
    run("lathe-feeds", { diameter: "0.1", ipr: "0.05" }, "in", FOL),
    run("lathe-feeds", { diameter: "0.5" }, "in", capped),
    run("lathe-cycle", { op: "turn", od: "0.1", ipr: "0.05" }, "in", FOL),
    run("lathe-cycle", { op: "face", speedMode: "rpm", rpm: "8000" }, "in", capped),
    run("job-sheet", { op: "lathe", diameter: "0.1" }, "in", FOL),
    run("job-sheet", { op: "drill", diameter: "0.0625", material: "al6061" }, "in", { ...FOL, maxRpm: 3000 }),
    // a feed-capped drill on a mill profile (the reviewer's case): 5 IPM max feed
    run("job-sheet", { op: "drill", diameter: "0.0625", material: "al6061" }, "in", { ...ROUTER, maxFeed: 5 }),
  ];
  for (const out of outs) {
    const fit = out.warnings.filter((w) => /to keep /.test(w));
    assert.ok(fit.length >= 1, out.warnings.join(" | "));
    for (const w of fit) assert.match(w, /to keep the feed per rev\.$/);
    assert.doesNotMatch(out.warnings.join(" "), /chip load/);
  }
  // the mill op still talks about the chip load
  assert.match(run("job-sheet", { op: "mill", diameter: "0.1" }, "in", { ...ROUTER, maxFeed: 5 }).warnings.join(" "), /to keep the chip load\./);
});

test("TNR radius history row: part radius in display format with its unit", () => {
  assert.equal(run("tnr-comp", { feature: "radius" }).historyLabel, "OD corner R0.125 in · r 0.0313 in");
  assert.equal(run("tnr-comp", { feature: "radius" }, "mm").historyLabel, "OD corner R3 mm · r 0.8 mm");
});
