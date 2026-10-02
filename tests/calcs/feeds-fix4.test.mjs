// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Fix round 4 for the speeds & feeds tools: the too-fast-spindle line judges the spindle the screen shows (after
// the machine fit), the nose-radius chips read in the units on screen, and every history row carries its units.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, optionsFor } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";
import { near } from "../helpers.mjs";

const ctx = (units = "in", machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id), c = ctx(units, machine);
  const built = buildValues(def, defaultRaw(def, over, units), c);
  assert.equal(built.invalid.size, 0, `${id}: ${[...built.invalid].join(",")}`);
  return def.compute(built.values, c);
};
const stat = (out, re) => out.stats.find((s) => re.test(s.label));
const tooFast = (out) => out.warnings.filter((w) => /more than most (lathes|spindles) turn/.test(w));

// Profiles saved with Max spindle blank (0 = no limit) but a max feed: the feed cap can bring the spindle down
// to a speed the machine runs, and then there is nothing to warn about.
const FOL = { name: "FOL", type: "lathe", maxRpm: 0, maxFeed: 200, units: "in" };
const ROUTER = { name: "Router", type: "mill", maxRpm: 0, maxFeed: 100, units: "in" };

// 0.1 in at the default SFM wants ~22,900 RPM; 0.05 IPR × that is far past 200 IPM, so the spindle drops to
// 200 ÷ 0.05 = 4000 RPM — under the 6000 RPM lathe line.
test("lathe feeds: no too-fast line once the max feed has slowed the spindle under 6000 RPM", () => {
  const out = run("lathe-feeds", { diameter: "0.1", ipr: "0.05" }, "in", FOL);
  assert.equal(out.primary.value, 4000);
  assert.equal(out.primary.label, "Spindle (slowed for max feed)");
  assert.deepEqual(tooFast(out), []);
  // still over the line after the cap: the warning quotes the speed shown, 200 ÷ 0.01 = 20000, not the wanted one
  const still = run("lathe-feeds", { diameter: "0.1", ipr: "0.01" }, "in", FOL);
  assert.equal(still.primary.value, 20000);
  assert.deepEqual(tooFast(still).map((w) => w.split(" RPM")[0]), [fmt(20000, 0)]);
  // no machine: nothing fits the cut, the asked-for speed is the one shown and still flagged
  const bare = run("lathe-feeds", { diameter: "0.1", ipr: "0.05" });
  assert.equal(tooFast(bare).length, 1);
  assert.match(tooFast(bare)[0], new RegExp(`^${fmt(bare.primary.value, 0)} RPM`));
});

test("lathe cycle: turning and G97 facing judge the spindle used, not the one asked for", () => {
  const turn = run("lathe-cycle", { op: "turn", od: "0.1", ipr: "0.05" }, "in", FOL);
  assert.equal(stat(turn, /Spindle used/).value, 4000);
  assert.deepEqual(tooFast(turn), []);
  const g97 = run("lathe-cycle", { op: "face", speedMode: "rpm", rpm: "30000", ipr: "0.05" }, "in", FOL);
  assert.equal(stat(g97, /Spindle used/).value, 4000);
  assert.deepEqual(tooFast(g97), []);
});

// Every mill/drill tool: any too-fast line names the RPM on screen, and a spindle the feed cap brought under
// 20,000 RPM gets none.
test("mill and drill tools: the too-fast line only ever names the spindle shown", () => {
  const cases = [
    ["feeds-mill", { diameter: "0.125", material: "al6061" }, (o) => o.stats.find((s) => /^Spindle/.test(s.label)).value],
    ["job-sheet", { op: "mill", diameter: "0.125", material: "al6061" }, (o) => stat(o, /^Spindle/).value],
    ["chip-thinning", { diameter: "0.125" }, (o) => stat(o, /^Spindle/).value],
    ["feeds-drill", { diameter: "0.04", material: "al6061" }, (o) => stat(o, /^Spindle/).value],
    // 40000 × 0.00075 in per rev of helix = 30 IPM, under the cap: the typed 40000 runs and is flagged
    ["thread-mill", { rpm: "40000" }, (o) => stat(o, /^Spindle/)?.value ?? 40000],
    ["tapping-feed", { rpm: "40000" }, (o) => stat(o, /^Spindle/)?.value ?? 40000],
  ];
  for (const [id, over, shown] of cases) {
    const out = run(id, over, "in", ROUTER);
    const rpm = shown(out);
    const lines = tooFast(out);
    if (rpm > 20000) assert.deepEqual(lines.map((w) => w.split(" RPM")[0]), [fmt(rpm, 0)], `${id} at ${rpm}`);
    else assert.deepEqual(lines, [], `${id} at ${rpm}`);
  }
});

// 1/8 in in 6061 wants ~30,560 RPM at 0.00533 in per rev (163 IPM). A 200 IPM router runs that as asked, so it
// is flagged at 30,560. A 100 IPM router drops it to 100 ÷ 0.00533 = 18,750 RPM, under 20,000: no line.
test("feeds mill: the too-fast line follows the feed cap", () => {
  const free = run("feeds-mill", { diameter: "0.125", material: "al6061" }, "in", { ...ROUTER, maxFeed: 200 });
  assert.deepEqual(tooFast(free).map((w) => w.split(" RPM")[0]), [fmt(stat(free, /^Spindle/).value, 0)]);
  const out = run("feeds-mill", { diameter: "0.125", material: "al6061" }, "in", ROUTER);
  assert.equal(stat(out, /^Spindle/).value, 18750);
  assert.ok(stat(out, /Wanted RPM/).value > 20000);
  assert.deepEqual(tooFast(out), []);
});

// ISO 1832 corner codes 04/08/12/16 = 0.4/0.8/1.2/1.6 mm, the same inserts as ANSI B212.4 1/64…1/16 in
// (CNMG 120408 = CNMG 432): a metric screen names the chip by the size it computes with.
test("surface finish and nose radius comp: nose chips read in the units on screen", () => {
  for (const id of ["surface-finish", "tnr-comp"]) {
    const nose = getCalc(id).inputs.find((i) => i.id === "nose");
    const mm = optionsFor(nose, {}, ctx("mm")).map((o) => o.label);
    const inch = optionsFor(nose, {}, ctx("in")).map((o) => o.label);
    assert.deepEqual(mm, ["0.4 mm", "0.8 mm", "1.2 mm", "1.6 mm", "Other"], id);
    assert.deepEqual(inch, ['1/64"', '1/32"', '3/64"', '1/16"', "Other"], id);
    // the saved key is the same in both systems, so jobs, links and history keep working
    assert.deepEqual(optionsFor(nose, {}, ctx("mm")).map((o) => o.value), optionsFor(nose, {}, ctx("in")).map((o) => o.value));
  }
  const fin = run("surface-finish", { nose: "0.0312" }, "mm");
  near(stat(fin, /Nose radius/).value, 0.8, 1e-12);
});

// Every number a user reads carries its unit — the history rows too. Defaults on each screen; the lengths in the
// row must say mm on a metric screen and in on an inch one.
const LABELLED = {
  "chip-thinning": { mm: /^Ø\S+ mm · ae \S+ mm · /, in: /^Ø\S+ in · ae \S+ in · / },
  "thread-mill": { mm: / · Ø\S+ mm$/, in: / · Ø\S+ in$/ },
  "ball-nose": { mm: /^Ø\S+ mm · [hs] \S+ mm$/, in: /^Ø\S+ in · [hs] \S+ in$/ },
  "circle-interp": { mm: /^[IO]D Ø\S+ mm · Ø\S+ mm$/, in: /^[IO]D Ø\S+ in · Ø\S+ in$/ },
  "circle3": { mm: /^Ø\S+ mm at \S+, \S+ mm$/, in: /^Ø\S+ in at \S+, \S+ in$/ },
  "drill-point": { mm: /^Ø\S+ mm · \S+° · \S+ mm deep$/, in: /^Ø\S+ in · \S+° · \S+ in deep$/ },
  "center-drill": { mm: / → Ø\S+ mm csk$/, in: / → Ø\S+ in csk$/ },
  "chamfer": { mm: / → \S+ mm$/, in: / → \S+ in$/ },
  "fillet": { mm: /^R\S+ mm at /, in: /^R\S+ in at / },
  "cut-time": { mm: /^\S+ mm @ \S+ mm\/min · /, in: /^\S+ in @ \S+ IPM · / },
  "mow": { mm: / · W \S+ mm$/, in: / · W \S+ in$/ },
  "sine-bar": { mm: / → \S+ mm$/, in: / → \S+ in$/ },
  "tol-stack": { mm: / ± \S+ mm$/, in: / ± \S+ in$/ },
  "ream": { mm: /^Ø\S+ mm → /, in: /^Ø\S+ in → / },
  "arc-segment": { mm: /^\S.* \S+ mm · .* \S+ (mm|°)$/, in: /^\S.* \S+ in · .* \S+ (in|°)$/ },
  "right-triangle": { mm: /^\S+ \S+ mm · \S+ \S+ (mm|°)$/, in: /^\S+ \S+ in · \S+ \S+ (in|°)$/ },
  "oblique-triangle": { mm: /^[SA]{3} \S+ (mm|°), \S+ (mm|°), \S+ (mm|°)$/, in: /^[SA]{3} \S+ (in|°), \S+ (in|°), \S+ (in|°)$/ },
};
test("history rows carry the length unit on inch and metric screens", () => {
  for (const [id, re] of Object.entries(LABELLED)) {
    for (const units of ["in", "mm"]) {
      const label = run(id, {}, units).historyLabel;
      assert.match(label, re[units], `${id} ${units}: ${label}`);
      if (units === "mm") assert.doesNotMatch(label, /\d in\b/, `${id} mm: ${label}`);
    }
  }
  // angles in a mixed pair read in degrees, sides in the length unit
  assert.equal(run("right-triangle", { mode: "hypAngle", a: "5", b: "30" }).historyLabel, "Hypotenuse 5 in · Angle 30°");
  assert.match(run("oblique-triangle", { mode: "SAS", p1: "3", p2: "4", p3: "60" }, "mm").historyLabel, /^SAS 3 mm, 4 mm, 60°$/);
  assert.match(run("arc-segment", { pair: "radius,angle", a: "25", b: "90" }, "mm").historyLabel, /^Radius 25 mm · Angle 90°$/);
});
