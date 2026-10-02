// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The geometry tools, run the way the app runs them (buildValues → compute), in inch and mm.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
// Only the tools under test, so a half-finished edit in another tool can't stop these from running.
import "../../src/calcs/right-triangle.js";
import "../../src/calcs/oblique-triangle.js";
import "../../src/calcs/arc-segment.js";
import "../../src/calcs/circle3.js";
import "../../src/calcs/sine-bar.js";
import "../../src/calcs/bolt-circle.js";
import "../../src/calcs/drill-point.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, invalidReason } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctxFor = (units, machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id), ctx = ctxFor(units, machine);
  const built = buildValues(def, defaultRaw(def, over, units), ctx);
  return { def, ...built, out: built.invalid.size ? null : def.compute(built.values, ctx) };
};
const fails = (id, over, units = "in") => {
  try { run(id, over, units); } catch (e) { return e.message; }
  return null;
};

test("right triangle: a leg as long as the hypotenuse names the hypotenuse, not an angle", () => {
  assert.equal(fails("right-triangle", { mode: "runHyp", a: "5", b: "3" }), "Hypotenuse has to be longer than the run");
  assert.equal(fails("right-triangle", { mode: "riseHyp", a: "5", b: "5" }), "Hypotenuse has to be longer than the rise");
  assert.equal(fails("right-triangle", { mode: "runHyp", a: "127", b: "76.2" }, "mm"), "Hypotenuse has to be longer than the run");
  near(run("right-triangle", { mode: "runHyp", a: "3", b: "5" }).out.stats[1].value, 4, 1e-12);
  assert.match(getCalc("right-triangle").inputs.find((i) => i.id === "mode").hint, /opposite the rise/);
});

// H = L sin θ (Machinery's Handbook, sine bar). The label names the bar the user has.
test("sine bar: the label shows the real bar length; steep angles warn; 90° is refused", () => {
  const custom = run("sine-bar", { bar: "custom", barLen: "2.5", angle: "30" }).out;
  assert.equal(custom.primary.label, "Stack for 30° on 2.5 in bar");
  near(custom.primary.value, 1.25, 1e-12);
  assert.equal(run("sine-bar", { bar: "custom", barLen: "7.5", angle: "30" }).out.primary.label, "Stack for 30° on 7.5 in bar");
  assert.equal(run("sine-bar", { bar: "5", angle: "30" }).out.primary.label, "Stack for 30° on 5 in bar");
  assert.equal(run("sine-bar", { bar: "custom", barLen: "62.55", angle: "30" }, "mm").out.primary.label, "Stack for 30° on 62.55 mm bar");
  assert.deepEqual(run("sine-bar", { angle: "45" }).out.warnings, []);
  // dθ = dH ÷ (L cos θ): at 75° a stack error counts 1/cos 75° = 3.9× more
  const steep = run("sine-bar", { angle: "75" }).out;
  near(steep.primary.value, 4.82963, 0.00001);
  assert.match(steep.warnings[0], /3\.9×.*complement, 15°/);
  assert.match(run("sine-bar", { mode: "angle", height: "4.5" }).out.warnings[0], /Above 45°/);
  assert.match(fails("sine-bar", { angle: "90" }), /can't be set to 90°/);
  assert.match(fails("sine-bar", { mode: "angle", height: "5" }), /90°/);
});

// Machinery's Handbook "Segments of Circles": past a half circle θ = 360° − 2 asin(c/2R).
test("arc segment: chord + height past a half circle, and radius + chord names the long arc", () => {
  const major = run("arc-segment", { pair: "chord,height", a: "2", b: "1.5" }).out;
  near(major.stats.find((s) => s.label === "Central angle").value, 225.240, 0.001);
  near(major.stats.find((s) => s.label === "Arc length").value, 4.2588, 0.0001);
  const mm = run("arc-segment", { pair: "chord,height", a: "50", b: "40" }, "mm").out;
  near(mm.stats.find((s) => s.label === "Segment area").value, 1870.63, 0.01);
  assert.match(mm.explain[0].plugged, /R 27\.813 mm, c 50 mm, h 40 mm/);
  // R 1, c √3: the short arc is 120°, the long one 240°, height 1.5, arc 4.1888
  const rc = run("arc-segment", { pair: "radius,chord", a: "1", b: String(Math.sqrt(3)) }).out;
  near(rc.stats.find((s) => s.label === "Central angle").value, 120, 1e-6);
  assert.match(rc.notes[0], /long arc: 240°, height 1\.5 in, arc length 4\.1888 in/);
  const rcMm = run("arc-segment", { pair: "radius,chord", a: "25", b: "30" }, "mm").out;
  assert.match(rcMm.notes[0], /height \d+(\.\d+)? mm, arc length \d+(\.\d+)? mm/);
  // a half circle has no second arc to name
  assert.equal(run("arc-segment", { pair: "radius,chord", a: "1", b: "2" }).out.notes.length, 1);
});

// The answer is a number the user didn't type. Machinery's Handbook "Segments of Circles": h = R − √(R² − c²/4),
// so R 1, c √3 → h 0.5 (120°).
test("arc segment: the answer is never one of the two values typed", () => {
  const rc = run("arc-segment", { pair: "radius,chord", a: "1", b: String(Math.sqrt(3)) }).out.primary;
  assert.equal(rc.label, "Height (sagitta)");
  near(rc.value, 0.5, 1e-9);
  assert.equal(rc.unit, "in");
  const rcMm = run("arc-segment", { pair: "radius,chord", a: "25", b: String(25 * Math.sqrt(3)) }, "mm").out.primary;
  assert.equal(rcMm.label, "Height (sagitta)");
  near(rcMm.value, 12.5, 1e-9);
  assert.equal(rcMm.unit, "mm");
  const picks = { "radius,chord": "Height (sagitta)", "radius,height": "Chord", "radius,angle": "Chord", "chord,height": "Radius", "chord,angle": "Radius", "height,angle": "Radius" };
  const named = { radius: "Radius", chord: "Chord", height: "Height (sagitta)", angle: "Central angle" };
  for (const [pair, label] of Object.entries(picks)) {
    const out = run("arc-segment", { pair, a: pair.startsWith("radius") ? "2" : "1", b: pair.endsWith("angle") ? "60" : "0.5" }).out;
    assert.equal(out.primary.label, label, pair);
    assert.ok(!pair.split(",").map((k) => named[k]).includes(out.primary.label), `${pair} answers with a typed value`);
  }
});

// A height of the full diameter is the whole circle, refused the same as a 360° angle; just under it is still a segment.
test("arc segment: radius + height of the full diameter is refused like a 360° angle", () => {
  assert.equal(fails("arc-segment", { pair: "radius,height", a: "1", b: "2" }), "Height has to be less than the diameter");
  assert.equal(fails("arc-segment", { pair: "radius,height", a: "25", b: "50" }, "mm"), "Height has to be less than the diameter");
  assert.equal(fails("arc-segment", { pair: "radius,angle", a: "1", b: "360" }), "Angle has to be less than 360°");
  const under = run("arc-segment", { pair: "radius,height", a: "1", b: "1.999" }).out;
  assert.ok(under.stats.find((s) => s.label === "Central angle").value < 360);
  assert.ok(under.primary.value > 0);
});

// Point length L = D ÷ (2 tan(θ/2)): ½ in, 118° → 0.1502 in. The explain line ends on the Z the answer says to program.
test("drill point: the Z depth explain line has the same sign and number as Program Z", () => {
  for (const [over, units] of [[{}, "in"], [{ through: "through" }, "in"], [{}, "mm"], [{ through: "through" }, "mm"]]) {
    const out = run("drill-point", over, units).out;
    const line = out.explain.find((e) => e.title === "Z depth");
    assert.match(line.formula, /^Z = −\(/);
    const [, num, unit] = line.plugged.match(/^= (-?[\d.]+) (\S+)$/);
    assert.ok(out.primary.value < 0);
    near(Number(num), out.primary.value, units === "in" ? 0.00005 : 0.0005);
    assert.equal(unit, units);
  }
  assert.equal(run("drill-point").out.explain.find((e) => e.title === "Z depth").plugged, "= -1.1502 in");
});

test("circle from 3 points: collinear in mm, same point twice, and points bunched together", () => {
  assert.match(fails("circle3", { x1: "84.92", y1: "161.822", x2: "94.316", y2: "171.446", x3: "131.9", y3: "209.942" }, "mm"), /straight line/);
  assert.match(fails("circle3", { x1: "1", y1: "0", x2: "1", y2: "0", x3: "-1", y3: "0" }), /Point 1 and point 2 are the same/);
  assert.deepEqual(run("circle3").out.warnings, []);
  // 3 points across 2 in of a 20 in bore (11.5° of arc) is fine; across 0.2 in (1.1°) it warns
  const ok = run("circle3", { x1: "-1", y1: String(Math.sqrt(100 - 1) - 10), x2: "0", y2: "0", x3: "1", y3: String(Math.sqrt(100 - 1) - 10) }).out;
  assert.deepEqual(ok.warnings, []);
  const bunched = run("circle3", { x1: "-0.1", y1: String(Math.sqrt(100 - 0.01) - 10), x2: "0", y2: "0", x3: "0.1", y3: String(Math.sqrt(100 - 0.01) - 10) }).out;
  near(bunched.stats[0].value, 20, 1e-6);
  assert.match(bunched.warnings[0], /cover only 1\.1° .*Spread the points/);
});

test("any triangle: the 30-60-90 and an isosceles SSA show one triangle, no second", () => {
  const t = run("oblique-triangle", { mode: "SSA", p1: "5", p2: "10", p3: "30" }).out;
  near(t.primary.value, 8.66025, 0.00001);
  assert.deepEqual(t.warnings, []);
  assert.deepEqual(run("oblique-triangle", { mode: "SSA", p1: "1", p2: "1", p3: "52" }).out.warnings, []);
  assert.deepEqual(run("oblique-triangle", { mode: "SSA", p1: "50", p2: "100", p3: "30" }, "mm").out.warnings, []);
  assert.match(run("oblique-triangle", { mode: "SSA", p1: "5", p2: "7", p3: "40" }).out.warnings[0], /Two triangles/);
  // Law of sines, a=50 b=70 A=40°: sin B = 70·sin 40°/50 → B = 64.145° or 115.855°, C2 = 24.145°, c2 = 50·sin C2/sin A = 31.819.
  assert.equal(run("oblique-triangle", { mode: "SSA", p1: "50", p2: "70", p3: "40" }, "mm").out.warnings[0],
    "Two triangles fit these values. The other one: c = 31.819 mm, B = 115.855°, C = 24.145°.");
});

test("bolt circle: a sweep of 0, below 0 or over 360 is refused by name; 360 says it's the full circle", () => {
  const def = getCalc("bolt-circle"), sweep = def.inputs.find((i) => i.id === "sweep");
  for (const [text, reason] of [["-90", "Partial circle sweep has to be more than zero"], ["0", "Partial circle sweep has to be more than zero"], ["400", "Partial circle sweep can't be more than 360"]]) {
    const r = run("bolt-circle", { holes: "4", sweep: text });
    assert.ok(r.invalid.has("sweep"), `${text} is refused`);
    // the sentence starts by naming the field (values.js may add the unit after the number)
    assert.ok(invalidReason(sweep, r.values.sweep, text, r.raw).startsWith(reason), invalidReason(sweep, r.values.sweep, text, r.raw));
  }
  const full = run("bolt-circle", { holes: "4", sweep: "360" }).out;
  assert.equal(full.tables[0].title, "Coordinates");
  assert.match(full.notes.join(" "), /360° sweep is the full circle/);
  const half = run("bolt-circle", { holes: "3", sweep: "180", direction: "cw" }).out;
  assert.deepEqual(half.tables[0].rows.map((h) => Math.round(h.angleDeg)), [0, 270, 180]);
  assert.deepEqual(half.warnings, []);
  // the last hole of a 359.9° sweep sits on top of the first
  const almost = run("bolt-circle", { holes: "4", sweep: "359.9" }).out;
  assert.match(almost.warnings[0], /0\.1° short of the first/);
  assert.match(almost.historyLabel, /359\.9°/);
});

const vf2 = { id: "m", name: "VF-2", type: "mill", maxRpm: 6000, maxFeed: 200, controller: "haas", units: "in" };

test("bolt circle G-code: S and F fit the machine and keep the feed per rev", () => {
  const out = run("bolt-circle", { gcode: "drill", spindle: "12000", feed: "60" }, "in", vf2).out;
  const text = out.code[0].text;
  // 60 IPM at 12000 RPM = 0.005 IPR; capped at 6000 RPM → F30
  assert.match(text, /\nS6000 M3\n/);
  assert.match(text, / F30\.0\n/);
  assert.match(out.warnings.join(" "), /VF-2 tops out at 6000 RPM/);
  assert.match(out.warnings.join(" "), /posts S6000 F30 \(IPM\): the same feed per rev/);
  assert.match(run("bolt-circle", { gcode: "drill", spindle: "6000", feed: "6000" }, "mm", { ...vf2, maxRpm: 10000, maxFeed: 3000, units: "mm" }).out.warnings.join(" "), /max feed is 3000 mm\/min[^]*posts S3000 F3000 \(mm\/min\)/);
  assert.match(text, /\nG53 G0 Z0\.0\nM30/, "Haas sends Z home with G53");
  // feed over the machine's top feed: spindle slows so the chip holds
  const fast = run("bolt-circle", { gcode: "drill", spindle: "5000", feed: "500" }, "in", vf2).out;
  assert.match(fast.code[0].text, /\nS2000 M3\n/);
  assert.match(fast.code[0].text, / F200\.0\n/);
  // a machine saved in mm limits a metric program the same way: 3000 mm/min max, 0.1 mm/rev at 6000 → 30000 wanted
  const mmMill = { ...vf2, maxRpm: 10000, maxFeed: 3000, units: "mm" };
  const mm = run("bolt-circle", { gcode: "drill", spindle: "6000", feed: "600" }, "mm", mmMill).out;
  assert.match(mm.code[0].text, /\nS6000 M3\n[^]* F600\.0\n/, "600 mm/min is under 3000");
  const mmFast = run("bolt-circle", { gcode: "drill", spindle: "6000", feed: "6000" }, "mm", mmMill).out;
  assert.match(mmFast.code[0].text, /\nS3000 M3\n[^]* F3000\.0\n/);
  // inside the limits nothing changes and nothing is said
  assert.deepEqual(run("bolt-circle", { gcode: "drill" }, "in", vf2).out.warnings, []);
  // no machine set: a spindle beyond most machines is flagged
  assert.match(run("bolt-circle", { gcode: "drill", spindle: "30000", feed: "90" }).out.warnings.join(" "), /30000 RPM is more than most spindles/);
});

test("bolt circle G-code: a lathe profile gets a mill program and is told so", () => {
  const lathe = { id: "l", name: "ST-10", type: "lathe", maxRpm: 4000, maxFeed: 100, controller: "okuma", units: "in" };
  for (const gcode of ["drill", "positions"]) {
    const out = run("bolt-circle", { gcode }, "in", lathe).out;
    assert.match(out.warnings[0], /ST-10 is set up as a lathe\. This is a mill program/);
    assert.match(out.code[0].text, /G20 G17/, "a Fanuc-style mill program, not the lathe's Okuma positions");
    // the warning names only what this program holds
    const toolChange = /\bM6\b/.test(out.code[0].text) && /\bG43\b/.test(out.code[0].text);
    assert.equal(/tool change, G43 length offset/.test(out.warnings[0]), toolChange, `${gcode}: warning matches the program`);
    assert.match(out.warnings[0], /X\/Y moves/);
  }
  assert.ok(!/G43|M6/.test(run("bolt-circle", { gcode: "positions" }, "in", lathe).out.code[0].text), "positions has no tool change");
  // the lathe's limits don't apply to a mill program
  assert.match(run("bolt-circle", { gcode: "drill", spindle: "8000", feed: "40" }, "in", lathe).out.code[0].text, /\nS8000 M3\n/);
  assert.deepEqual(run("bolt-circle", {}, "in", lathe).out.warnings, [], "no program, nothing to say");
});

test("bolt circle G-code: a feed typed as feed per rev is caught, never posted as F0", () => {
  const ipr = run("bolt-circle", { gcode: "drill", feed: "0.004" }).out;
  assert.match(ipr.code[0].text, / F0\.004\n/);
  assert.match(ipr.warnings.join(" "), /looks like a feed per rev/);
  const zero = run("bolt-circle", { gcode: "drill", feed: "0.00001" }).out;
  assert.equal(zero.code.length, 0);
  assert.match(zero.warnings[0], /G-code not written: .*posts as F0/);
  assert.match(run("bolt-circle", { gcode: "peck", feed: "0.1" }, "mm").out.warnings.join(" "), /mm\/rev/);
  assert.match(run("bolt-circle", { gcode: "drill" }).out.code[0].text, /\nG20 G17 G40 G49 G80 G90 G94\n[^]*\nG91 G28 Z0\.0\nG90\nM30\n%$/);
});

// After the machine fit, the S and F the control reads get the same check as the typed ones. Spindle and Feed typed
// into each other's boxes on a VF-2 (6000 RPM, 200 IPM): 30000 IPM at 100 RPM is 300 IPR, more than the machine
// moves in a minute (S would floor to 0); 0.0002 IPM at 30000 RPM, capped to 6000, is 0.00004 IPM (F would read 0).
test("bolt circle G-code: a fitted S under 1 or an F that posts as zero is not written", () => {
  for (const [over, units] of [[{ spindle: "100", feed: "30000" }, "in"], [{ spindle: "30000", feed: "0.0002" }, "in"], [{ spindle: "100", feed: "800000" }, "mm"], [{ spindle: "30000", feed: "0.002" }, "mm"]]) {
    for (const gcode of ["drill", "peck"]) {
      const out = run("bolt-circle", { gcode, ...over }, units, vf2).out;
      const said = out.warnings.join(" | ");
      assert.equal(out.code.length, 0, `${gcode} ${JSON.stringify(over)} ${units}: ${out.code[0]?.text}`);
      assert.match(said, /G-code not written: .*Check that Spindle and Feed aren't swapped(: | \()Spindle is RPM, Feed is per minute/, said);
      assert.equal(said.match(/Check/g).length, 1, `one fix sentence: ${said}`);
      assert.doesNotMatch(said, /\bS0\b|F0\.0|program posts/, said);
    }
  }
  // One turn longer than the machine's top feed (cantRun): the fix names this screen's own fields. Bolt circle has
  // Spindle and Feed (per minute), no feed per rev field to check — in one fix sentence, not two naming the same fields.
  for (const [over, units, feedUnit] of [[{ spindle: "5", feed: "5000" }, "in", "IPM"], [{ spindle: "5", feed: "127000" }, "mm", "mm\\/min"]]) {
    const said = run("bolt-circle", { gcode: "drill", ...over }, units, vf2).out.warnings.join(" | ");
    assert.match(said, new RegExp(`G-code not written: VF-2 max feed is [^|]*less than one turn at [^|]*\\. Check that Spindle and Feed aren't swapped \\(Spindle is RPM, Feed is per minute, ${feedUnit}\\), or the max feed in Shop\\.$`), said);
    assert.equal(said.match(/Check/g).length, 1, said);
    assert.doesNotMatch(said, /feed per rev,/, said);
  }
  // An F that rounds up after the fit: the ratio is against the fitted feed, which nobody typed, so the sentence
  // must not call it the feed asked for. 0.0004 IPM at 30000 → 6000 RPM is 0.00008 IPM, posts F0.0001 (1.25×).
  for (const [over, units, said] of [[{ spindle: "30000", feed: "0.0004" }, "in", /comes to 0\.00008 IPM, which posts as F0\.0001, 1\.3× that feed: /], [{ spindle: "30000", feed: "0.004" }, "mm", /comes to 0\.0008 mm\/min, which posts as F0\.001, 1\.3× that feed: /]]) {
    const out = run("bolt-circle", { gcode: "drill", ...over }, units, { ...vf2, units }).out;
    assert.equal(out.code.length, 0);
    assert.match(out.warnings.join(" | "), said);
    assert.doesNotMatch(out.warnings.join(" | "), /asked for/);
  }
  // the coordinates are still there
  assert.equal(run("bolt-circle", { gcode: "drill", spindle: "100", feed: "30000" }, "in", vf2).out.tables[0].rows.length, 6);
  // a fit that still posts real numbers is unchanged: 12000 → 6000 RPM, F30
  assert.match(run("bolt-circle", { gcode: "drill", spindle: "12000", feed: "60" }, "in", vf2).out.code[0].text, /\nS6000 M3\n[^]* F30\.0\n/);
});

// A sweep so small the holes land on each other: chord D sin(step/2) under the last written digit (0.0001 in / 0.001 mm).
// 4 in circle, 0.0001° sweep, 4 holes: step 0.0000333°, chord 4 × sin(0.0000167°) = 0.0000012 in.
test("bolt circle: holes closer than the last written digit are flagged and get no program", () => {
  const tiny = run("bolt-circle", { holes: "4", sweep: "0.0001", gcode: "drill" }, "in", vf2).out;
  assert.equal(tiny.code.length, 0);
  assert.match(tiny.warnings.join(" "), /G-code not written: neighbor holes are less than 0\.0001 in apart[^]*neighbors land on top of each other\. Check Partial circle sweep/);
  const coords = run("bolt-circle", { holes: "4", sweep: "0.0001" }).out;
  // no G-code prefix: the sentence still starts with a capital
  assert.match(coords.warnings.join(" "), /^Neighbor holes are less than 0\.0001 in apart/);
  // only neighbors stack; a many-hole pattern still spreads out, so never claim every hole is on one spot
  // (360 holes over 1° on a 4 in circle: first X2 Y0, last X1.99970 Y0.03490, neighbors 0.0001 in apart)
  const spread = run("bolt-circle", { holes: "360", sweep: "1" }).out;
  assert.match(spread.warnings.join(" "), /^Neighbor holes are less than/);
  for (const w of [tiny, coords, spread, run("bolt-circle", { diameter: "0.01", holes: "360" }).out]) assert.doesNotMatch(w.warnings.join(" "), /every hole|same spot/);
  assert.match(run("bolt-circle", { holes: "4", sweep: "0.0001" }, "mm").out.warnings.join(" "), /less than 0\.001 mm apart/);
  assert.equal(run("bolt-circle", { holes: "4", sweep: "0.0001", gcode: "positions" }).out.code.length, 0);
  // a full circle that small says to check the diameter, not the sweep
  assert.match(run("bolt-circle", { diameter: "0.0001", holes: "360" }).out.warnings.join(" "), /Check the bolt circle diameter/);
  // 0.01° on a 4 in circle: chord 0.00035 in, still separate holes, nothing said
  assert.deepEqual(run("bolt-circle", { holes: "2", sweep: "0.01" }).out.warnings, []);
  assert.equal(run("bolt-circle", { holes: "2", sweep: "0.01", gcode: "drill" }).out.code.length, 1);
  // one hole has no neighbor
  assert.deepEqual(run("bolt-circle", { holes: "1" }).out.warnings, []);
});

// The last hole of a partial circle and the first are neighbors in space. Wrap chord D sin((360 − sweep)/2):
// 4 in, 359.99999° → 4 × sin(0.000005°) = 0.00000035 in; 100 mm, 359.9999° → 0.000087 mm. Both under the last digit.
test("bolt circle: a sweep a hair under 360 puts the last hole on the first and gets no program", () => {
  for (const [sweep, units, digit] of [["359.99999", "in", "0.0001 in"], ["359.999", "in", "0.0001 in"], ["359.9999", "mm", "0.001 mm"]]) {
    for (const gcode of ["positions", "drill", "peck"]) {
      const out = run("bolt-circle", { holes: "4", sweep, gcode }, units).out;
      const said = out.warnings.join(" | ");
      assert.equal(out.code.length, 0, `${sweep} ${units} ${gcode}: ${out.code[0]?.text}`);
      assert.match(said, new RegExp(`^G-code not written: the last hole is only [\\d.]+° short of the first, so the two are less than ${digit.replace(".", "\\.")} apart`), said);
      assert.doesNotMatch(said, / 0° /, "the gap never reads 0°");
      assert.doesNotMatch(out.notes.join(" "), /G98/, "no G98 to change");
    }
    // a Heidenhain gets no positions list either
    const heid = run("bolt-circle", { holes: "4", sweep, gcode: "drill" }, units, { ...vf2, controller: "heidenhain" }).out;
    assert.equal(heid.code.length, 0);
  }
  const none = run("bolt-circle", { holes: "4", sweep: "359.99999" }).out;
  assert.match(none.warnings[0], /^The last hole is only 0\.00001° short of the first/);
  assert.equal(none.warnings.length, 1, "one sentence, not the near-360 one as well");
  // 13 nines: 360 − sweep = 1.1e-13°, under fmtSig's 12 places. Still a real gap, so it reads "a hair", never 0°.
  for (const units of ["in", "mm"]) {
    const hair = run("bolt-circle", { holes: "4", sweep: "359.9999999999999", gcode: "drill" }, units).out;
    assert.equal(hair.code.length, 0);
    assert.match(hair.warnings[0], /^G-code not written: the last hole is a hair short of the first, so the two are less than/);
    assert.doesNotMatch(hair.warnings.join(" | "), / 0° |only 0°/);
  }
  // Two holes on a partial circle are one pair: the neighbor sentence alone, in inch and mm, with or without a program,
  // never the near-360 one about "the others" on top of it.
  for (const units of ["in", "mm"]) {
    for (const gcode of ["none", "drill"]) {
      const pair = run("bolt-circle", { holes: "2", sweep: "359.99999", gcode }, units).out;
      assert.equal(pair.code.length, 0);
      assert.equal(pair.warnings.length, 1, pair.warnings.join(" | "));
      assert.match(pair.warnings[0], /neighbor holes are less than/i);
    }
  }
  // two holes 60° apart the short way (300° sweep) are a normal layout: no "others", nothing said
  for (const sweep of ["300", "270", "359"]) assert.deepEqual(run("bolt-circle", { holes: "2", sweep }).out.warnings, [], sweep);
  // 359.99° on 4 in: the gap is 0.00035 in, separate holes — still posted, with the near-360 note
  const near360 = run("bolt-circle", { holes: "4", sweep: "359.99", gcode: "drill" }).out;
  assert.equal(near360.code.length, 1);
  assert.match(near360.warnings[0], /^The last hole lands only 0\.01° short of the first/);
});

// Stacking is decided from the posted words: 4 in, start 31°, 0.009° over 4 holes, chord 0.000105 in — over the
// 0.0001 in digit, but diagonal neighbors still round to the same X and Y.
test("bolt circle: neighbors that post on the same X/Y get no program", () => {
  const out = run("bolt-circle", { holes: "4", start: "31", sweep: "0.009", gcode: "drill" }).out;
  assert.equal(out.code.length, 0);
  assert.match(out.warnings.join(" "), /^G-code not written: neighbor holes are 0\.000105 in apart, which rounds to the same X\/Y/);
  // every program the tool writes has each X/Y once
  for (const [over, units] of [[{ holes: "360", sweep: "1" }, "in"], [{ holes: "360", sweep: "2" }, "in"], [{ holes: "100", sweep: "359.9" }, "in"], [{ holes: "360", diameter: "0.2" }, "in"], [{ holes: "360", sweep: "1" }, "mm"], [{ holes: "50", start: "31", sweep: "0.2" }, "mm"]]) {
    const text = run("bolt-circle", { ...over, gcode: "drill" }, units).out.code[0]?.text;
    if (!text) continue;
    const xy = text.split("\n").map((l) => l.match(/X(-?[\d.]+) Y(-?[\d.]+)/)?.slice(1).join(" ")).filter(Boolean).slice(1);
    assert.equal(new Set(xy).size, xy.length, `${JSON.stringify(over)} ${units} drills one X/Y twice`);
  }
});

// The G98 → G99 note is about the G81/G83 program: only where one was written.
test("bolt circle: the G98 note shows only with a written G81/G83 program", () => {
  const g98 = (over, units = "in", machine = null) => /G98/.test(run("bolt-circle", over, units, machine).out.notes.join(" "));
  assert.ok(g98({ gcode: "drill" }));
  assert.ok(g98({ gcode: "peck" }, "mm"));
  assert.ok(!g98({ gcode: "positions" }));
  assert.ok(!g98({ gcode: "peck" }, "in", { ...vf2, controller: "heidenhain" }), "Heidenhain gets bare positions");
  assert.ok(!g98({ gcode: "drill", diameter: "0.001", holes: "100" }), "stacked");
  assert.ok(!g98({ gcode: "drill", z: "0.5" }), "Z above R");
  assert.ok(!g98({ gcode: "drill", spindle: "30000", feed: "0.0002" }, "in", vf2), "F posts as zero after the fit");
});

// The F word carries 4 places in inch, 3 in mm (Haas Mill Programming Workbook): a feed under that is refused,
// never rounded up to a different feed.
test("bolt circle: a feed under the F word's last digit is refused, not rounded to another feed", () => {
  for (const [feed, units, posted] of [["0.00005", "in", "F0\\.0001"], ["0.0007", "mm", "F0\\.001"], ["0.0015", "mm", "F0\\.002"]]) {
    const out = run("bolt-circle", { gcode: "drill", feed }, units).out;
    assert.equal(out.code.length, 0, `${feed} ${units}`);
    assert.match(out.warnings[0], new RegExp(`^G-code not written: Feed ${feed.replace(".", "\\.")} ${units === "in" ? "IPM" : "mm\\/min"} posts as ${posted}, `));
  }
  // a crawl that posts true is still posted, with the warning's sum right
  const crawl = run("bolt-circle", { gcode: "drill", feed: "0.06" }, "mm").out;
  assert.match(crawl.code[0].text, / F0\.06\n/);
  assert.match(crawl.warnings.join(" "), /0\.06 × 1000 RPM = 60 mm\/min/);
});

test("bolt circle: the angle column reads 0 to under 360", () => {
  const rows = run("bolt-circle", { holes: "6", start: "300" }).out.tables[0].rows;
  assert.deepEqual(rows.map((h) => Math.round(h.angleDeg)), [300, 0, 60, 120, 180, 240]);
  const cw = run("bolt-circle", { holes: "6", direction: "cw" }).out.tables[0].rows;
  assert.deepEqual(cw.map((h) => Math.round(h.angleDeg)), [0, 300, 240, 180, 120, 60]);
});
