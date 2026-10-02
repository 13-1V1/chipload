// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// How typed text becomes numbers: unit switches, metric defaults, fields whose meaning follows a mode,
// and the sentence a user gets when a field can't be used.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs, getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, defaultFor, convertForUnits, convertInput, measureOf, labelOf, invalidReason, sanitizeChoices, NUMERIC_KINDS } from "../../src/app/values.js";
import { fmt, parseFraction } from "../../src/core/format.js";
import { rpmFromSfm } from "../../src/core/feeds.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { convertStackLines, parseStackLines } from "../../src/calcs/tol-stack.js";
import { near } from "../helpers.mjs";

const ctxFor = (units, machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id), ctx = ctxFor(units, machine);
  const built = buildValues(def, defaultRaw(def, over, units), ctx);
  return { def, ctx, ...built, out: built.invalid.size ? null : def.compute(built.values, ctx) };
};

test("a unit switch re-expresses the number so it means the same cut", () => {
  assert.equal(convertForUnits("length", "0.5", "in", "mm"), "12.7");
  assert.equal(convertForUnits("length", "12.7", "mm", "in"), "0.5");
  assert.equal(convertForUnits("length", "1 1/4", "in", "mm"), "31.75");
  assert.equal(convertForUnits("feed", "40", "in", "mm"), "1016");
  assert.equal(convertForUnits("feedRev", "0.010", "in", "mm"), "0.254");
  assert.equal(convertForUnits("speed", "800", "in", "mm"), "243.8");
  assert.equal(convertForUnits("speed", "243.8", "mm", "in"), "800");
  assert.equal(convertForUnits("temp", "68", "in", "mm"), "20");
  assert.equal(convertForUnits("temp", "20", "mm", "in"), "68");
  // nothing to convert: blank, junk, same system, and things with no unit
  for (const [measure, text] of [["length", ""], ["length", "abc"], ["number", "4"], ["int", "6"], ["angle", "45"], ["percent", "20"], ["text", "1/4-20"]]) {
    assert.equal(convertForUnits(measure, text, "in", "mm"), text, `${measure} ${JSON.stringify(text)}`);
  }
  assert.equal(convertForUnits("length", "0.5", "in", "in"), "0.5");
});

test("metric defaults: a round metric size where one is given, otherwise the inch default converted", () => {
  const mill = getCalc("feeds-mill");
  assert.equal(defaultRaw(mill, {}, "mm").diameter, "10");
  assert.equal(defaultRaw(mill, {}, "in").diameter, "0.375");
  // the first thing a metric user sees is a real cut, not a 0.375 mm end mill at a quarter-million RPM
  const { out, values } = run("feeds-mill", {}, "mm");
  const rpm = out.stats.find((s) => s.label.startsWith("Spindle")).value;
  near(rpm, rpmFromSfm(values.sfm * 3.28084, 10 / 25.4), 1e-6);
  assert.ok(rpm > 500 && rpm < 30000, `plausible RPM, got ${rpm}`);
  assert.equal(out.warnings.length, 0);

  const factor = { length: 25.4, feed: 25.4, feedRev: 25.4 };
  for (const def of allCalcs().filter((d) => d.view !== "chart" && d.units !== false)) {
    const inch = defaultRaw(def, {}, "in"), mm = defaultRaw(def, {}, "mm");
    for (const input of def.inputs) {
      if (!NUMERIC_KINDS.has(input.kind) || String(input.default ?? "") === "") continue;
      const measure = measureOf(input, inch);
      if (input.defaultMm != null) { assert.equal(mm[input.id], input.defaultMm, `${def.id}.${input.id}`); continue; }
      if (factor[measure]) near(parseFraction(mm[input.id]), parseFraction(inch[input.id]) * factor[measure], Math.abs(parseFraction(inch[input.id])) * 0.2 + 0.0006, `${def.id}.${input.id} converts`);
      else if (measure !== "speed" && measure !== "temp") assert.equal(mm[input.id], inch[input.id], `${def.id}.${input.id} has no unit, so it stays`);
    }
  }
  // tools with no unit toggle keep their inch defaults whatever the app setting is
  assert.deepEqual(defaultRaw(getCalc("tap-drill"), {}, "mm"), defaultRaw(getCalc("tap-drill"), {}, "in"));
});

test("fields that change meaning with a mode carry the right label and unit", () => {
  const tri = getCalc("right-triangle");
  const [a, b] = ["a", "b"].map((id) => tri.inputs.find((i) => i.id === id));
  assert.equal(labelOf(a, { mode: "runRise" }), "Run (adjacent)");
  assert.equal(labelOf(b, { mode: "runRise" }), "Rise (opposite)");
  assert.equal(measureOf(b, { mode: "runRise" }), "length");
  assert.equal(labelOf(b, { mode: "hypAngle" }), "Angle");
  assert.equal(measureOf(b, { mode: "hypAngle" }), "angle");
  // switching to mm converts the hypotenuse and leaves the angle alone
  assert.equal(convertInput(a, "5", "in", "mm", { mode: "hypAngle" }), "127");
  assert.equal(convertInput(b, "30", "in", "mm", { mode: "hypAngle" }), "30");
  const { out } = run("right-triangle", { mode: "hypAngle", a: "127", b: "30" }, "mm");
  near(out.stats.find((s) => s.label.startsWith("Rise")).value, 63.5, 1e-9);
  // a length still takes a unit suffix; an unknown mode from a stale link can't crash a label
  near(run("right-triangle", { a: "76.2mm", b: "4" }).values.a, 3, 1e-9);
  assert.equal(labelOf(a, { mode: "nope" }), "Value");

  const any = getCalc("oblique-triangle");
  const p3 = any.inputs.find((i) => i.id === "p3");
  assert.equal(labelOf(p3, { mode: "SAS" }), "Angle C (between them)");
  assert.equal(measureOf(p3, { mode: "SAS" }), "angle");
  assert.equal(measureOf(p3, { mode: "SSS" }), "length");
  const arc = getCalc("arc-segment");
  assert.equal(measureOf(arc.inputs.find((i) => i.id === "b"), { pair: "chord,angle" }), "angle");
  assert.equal(labelOf(arc.inputs.find((i) => i.id === "a"), { pair: "chord,angle" }), "Chord");
});

test("the message names the field and says what is wrong with it", () => {
  const mill = getCalc("feeds-mill");
  const input = (id) => mill.inputs.find((i) => i.id === id);
  assert.equal(invalidReason(input("diameter"), NaN, "", {}), "Enter Tool diameter");
  assert.equal(invalidReason(input("diameter"), NaN, "1/", {}), 'Check Tool diameter — "1/" isn\'t a number');
  assert.equal(invalidReason(input("diameter"), 0, "0", {}), "Tool diameter has to be more than zero");
  assert.equal(invalidReason(input("flutes"), 0, "0", {}), "Flutes can't be less than 1");
  assert.equal(invalidReason(input("flutes"), 99, "99", {}), "Flutes can't be more than 20");
  assert.equal(invalidReason(input("sfm"), -5, "-5", {}), "Surface speed has to be more than zero");
  assert.equal(invalidReason(input("diameter"), 1e9, "1000000000", {}), "Check Tool diameter — that number is too big");
  // the label's fine print is dropped, and a mode-driven label is used as it reads on screen
  const sheet = getCalc("job-sheet").inputs.find((i) => i.id === "diameter");
  assert.equal(invalidReason(sheet, NaN, "", {}), "Enter Diameter");
  const tri = getCalc("right-triangle").inputs.find((i) => i.id === "b");
  assert.equal(invalidReason(tri, NaN, "", { mode: "hypAngle" }), "Enter Angle");
  assert.equal(invalidReason(tri, -1, "-1", { mode: "runRise" }), "Rise has to be more than zero");
});

test("a blank auto field that can't be figured leaves the real reason to the tool", () => {
  // 3-wire with an unreadable thread: the wire and pitch-diameter autos fail, but the thread is the problem
  const { def, ctx, invalid, values } = run("mow", { thread: "garbage" });
  assert.ok(invalid.has("wire"));
  assert.throws(() => def.compute(values, ctx), /Type a thread like/);
});

test("tolerance stack converts with the unit switch", () => {
  const inch = "1.000 ± 0.005\n2.000 ± 0.010\n-0.500 ± 0.002";
  const mm = convertStackLines(inch, "in", "mm");
  // 1 in = 25.4 mm exactly (NIST SP 811 App. B): ±0.002 in is ±0.0508 mm, not ±0.051 (+0.4 %)
  assert.equal(mm, "25.4 ± 0.127\n50.8 ± 0.254\n-12.7 ± 0.0508");
  // flipping straight back gives the lines exactly as typed
  assert.equal(convertStackLines(mm, "mm", "in"), inch);
  assert.equal(convertStackLines("not a stack", "in", "mm"), "not a stack");
  const def = getCalc("tol-stack");
  assert.equal(convertInput(def.inputs[0], inch, "in", "mm", {}), mm);
  near(run("tol-stack", {}, "mm").out.stats.find((s) => s.label === "Nominal").value, 63, 1e-9);
});

test("unit converter: a new category starts on a real conversion", () => {
  const def = getCalc("unit-converter");
  const r = sanitizeChoices(def, { cat: "speed", value: "100", from: "in", to: "mm" }, ctxFor("in"));
  assert.equal(r.from, "SFM");
  assert.equal(r.to, "m/min");
  const temp = sanitizeChoices(def, { cat: "temp", value: "212", from: "°F", to: "°F" }, ctxFor("in"));
  assert.notEqual(temp.to, temp.from);
});

test("material weight: price per pound becomes price per kilogram", () => {
  const price = getCalc("material-weight").inputs.find((i) => i.id === "price");
  assert.equal(convertInput(price, "2.00", "in", "mm", {}), "4.41");
  assert.equal(convertInput(price, "4.41", "mm", "in", {}), "2");
  assert.equal(convertInput(price, "", "in", "mm", {}), "");
  // the same bar costs the same either way
  const inch = run("material-weight", { shape: "round", d: "2", len: "12", price: "2" }, "in").out;
  const mm = run("material-weight", { shape: "round", d: "50.8", len: "304.8", price: "4.40924" }, "mm").out;
  const cost = (o) => Number(o.stats.find((s) => s.label === "Material cost").text.replace("$", ""));
  near(cost(mm), cost(inch), 0.01);
  assert.match(mm.explain[0].plugged, /mm².*g\/cm³.*kg$/);
  assert.equal(mm.stats.find((s) => s.unit === "kg/m").label, "Per meter");
});

test("bolt circle: tool number, problems, and controls that don't speak Fanuc", () => {
  const code = (over, machine) => run("bolt-circle", { gcode: "drill", ...over }, "in", machine).out;
  const ok = code({ tool: "5" });
  assert.match(ok.code[0].text, /\nT5 M6\n/);
  assert.match(ok.code[0].text, /\nG43 H5 Z1\.0\n/);
  assert.equal(ok.warnings.length, 0);
  assert.equal(code({ z: "0.5" }).code.length, 0, "a positive depth writes no program");
  assert.match(code({ z: "0.5" }).warnings[0], /G-code not written/);
  assert.match(code({ r: "0" }).warnings.join(" "), /R plane is at or below Z0/);
  const okuma = code({}, { id: "m", name: "LB3000", maxRpm: 5000, maxFeed: 400, controller: "okuma", units: "in" });
  assert.equal(okuma.code[0].title, "Hole positions (X Y)");
  assert.doesNotMatch(okuma.code[0].text, /G\d|M\d/);
  assert.match(okuma.warnings.join(" "), /Okuma/);
  // metric: the cycle fields start on round metric numbers and the program says G21
  assert.match(run("bolt-circle", { gcode: "drill" }, "mm").out.code[0].text, /G21 G17[^]*G43 H1 Z25\.0[^]*Z-12\.0 R2\.0 F120\.0/);
  // the coordinate table never shows "-0"
  const rows = run("bolt-circle", { holes: "4", diameter: "2" }).out.tables[0].rows;
  assert.ok(rows.every((r) => fmt(r.x, 4) !== "-0" && fmt(r.y, 4) !== "-0"));
});

test("fits read the ISO table in inches too", () => {
  const { out } = run("fits", { nominal: "1", fit: "H7/g6" });
  assert.equal(out.stats.find((s) => s.label === "Hole H7").text, "1 – 1.0008");
  // ISO 286-2 g6 over 24–30 mm: -7 / -20 µm → 25.380–25.393 mm = 0.999213–0.999724 in. Converted limits round
  // inward (ISO 370 / IEEE/ASTM SI 10: max down, min up) so they stay inside the ISO limits: 0.9993 – 0.9997.
  assert.equal(out.stats.find((s) => s.label === "Shaft g6").text, "0.9993 – 0.9997");
  assert.match(out.explain[0].plugged, /H7 = \+21 \/ 0 µm, g6 = -7 \/ -20 µm/);
  const custom = run("fits", { nominal: "25", fit: "custom", hole: "K7", shaft: "h6" }, "mm").out;
  assert.equal(custom.stats.find((s) => s.label === "Hole K7").text, "24.985 – 25.006");
});

test("lathe snippets refuse a feature bigger than the part", () => {
  assert.throws(() => run("tnr-comp", { dia: "0.05", size: "0.05" }), /bigger than the part/);
  assert.throws(() => run("tnr-comp", { feature: "radius", dia: "0.2", radius: "0.125" }), /bigger than the part/);
  // approach and run-off are sized for the unit in use
  assert.match(run("tnr-comp", {}, "mm").out.code[0].text, /Z2\.5\n/);
  assert.match(run("tnr-comp", {}, "in").out.code[0].text, /Z0\.1\n/);
});

test("three-wire: a metric shop gets a metric wire", () => {
  // A blank wire is the best wire, 0.57735 × P (ASME B1.2 App. B / ISO 1502 three-wire method):
  // 1.5 mm pitch → 0.866 mm, written in mm; 20 TPI → 0.02887 in.
  const mm = run("mow", { thread: "M10x1.5" }, "mm");
  near(mm.values.wire, 0.866, 0.001);
  const inch = run("mow", { thread: "1/4-20" }, "in");
  near(inch.values.wire, 0.02887, 0.00001);
});

// ── values team fixes (10/02/2026 audit) ──

// 1 in = 25.4 mm and 1 ft = 0.3048 m exactly (NIST SP 811 App. B). A unit switch used to round to fixed
// places, so a 0.0003 in chip load became 0.008 mm (5 % heavier) and 0.08 mm became 0.0031 in (−1.6 %).
test("a unit switch keeps small numbers to four significant figures", () => {
  for (const [measure, text, from, to, want] of [
    ["length", "0.0003", "in", "mm", "0.00762"], ["length", "0.0001", "in", "mm", "0.00254"], ["length", "0.0005", "in", "mm", "0.0127"],
    ["length", "0.08", "mm", "in", "0.00315"], ["length", "0.05", "mm", "in", "0.001969"], ["length", "0.001", "mm", "in", "0.00003937"],
    ["feedRev", "0.0005", "in", "mm", "0.0127"], ["feedRev", "0.012", "mm", "in", "0.0004724"],
    // ordinary sizes still read to a tenth / a micron, as before
    ["length", "25", "mm", "in", "0.9843"], ["length", "0.375", "in", "mm", "9.525"], ["feed", "1000", "mm", "in", "39.37"],
  ]) assert.equal(convertForUnits(measure, text, from, to), want, `${measure} ${text} ${from}→${to}`);

  // every converted number is within half a step (a tenth, a micron…) and within 0.05 % of the exact value
  const step = { length: { in: 0.0001, mm: 0.001 }, feedRev: { in: 0.00001, mm: 0.001 }, feed: { in: 0.01, mm: 0.1 } };
  for (const measure of ["length", "feedRev", "feed"]) {
    for (const [from, to] of [["in", "mm"], ["mm", "in"]]) {
      for (let i = 1; i <= 3000; i++) {
        const typed = (i * (from === "in" ? 0.0001 : 0.001)).toFixed(from === "in" ? 4 : 3);
        const exact = to === "mm" ? Number(typed) * 25.4 : Number(typed) / 25.4;
        const got = Number(convertForUnits(measure, typed, from, to));
        assert.ok(Math.abs(got - exact) <= Math.min(step[measure][to] / 2, exact * 5e-4) + 1e-12, `${measure} ${typed} ${from}→${to} gave ${got}, exact ${exact}`);
      }
    }
  }
  // the same cut: a micro end mill's feed in mm matches its inch feed
  const over = { diameter: "0.0625", sfm: "300", chip: "0.0005" };
  const inchFeed = run("feeds-mill", over, "in").values.chip * 25.4;
  const mmChip = parseFraction(convertForUnits("length", over.chip, "in", "mm"));
  near(mmChip, inchFeed, inchFeed * 5e-4, "chip load after the switch");
});

test("flipping units and straight back gives back what was typed", () => {
  const flip = (measure, text, a, b) => convertForUnits(measure, convertForUnits(measure, text, a, b), b, a);
  for (const [measure, text, from] of [
    ["length", "10.25", "mm"], ["length", "12.345", "mm"], ["length", "0.001", "mm"], ["feedRev", "0.0025", "in"], ["feedRev", "0.0001", "in"],
    ["feed", "100.5", "mm"], ["speed", "1", "mm"], ["temp", "2", "in"], ["length", "1 1/4", "in"], ["length", "10mm", "in"],
  ]) assert.equal(flip(measure, text, from, from === "in" ? "mm" : "in"), text, `${measure} ${text}`);
  let lost = 0;
  for (let i = 1; i <= 9999; i++) { const t = (i / 100).toFixed(2); if (flip("length", t, "mm", "in") !== t) lost++; }
  assert.equal(lost, 0, "two-place mm lengths that came back different");
  // an edit in between is a new number: it converts fresh
  const out = convertForUnits("length", "10.25", "mm", "in");
  assert.equal(convertForUnits("length", `${out}1`, "in", "mm"), "10.249"); // 0.40351 in × 25.4 = 10.24915 mm
});

test("a count has to be a whole number", () => {
  const mill = getCalc("feeds-mill");
  const flutes = mill.inputs.find((i) => i.id === "flutes");
  for (const typed of ["2.5", "3.4", "1/2", "0.6", "20.4"]) {
    const { invalid, values } = run("feeds-mill", { flutes: typed });
    assert.ok(invalid.has("flutes"), `${typed} flutes must not run`);
    assert.equal(invalidReason(flutes, values.flutes, typed, {}, "in"), "Flutes has to be a whole number");
  }
  assert.equal(run("feeds-mill", { flutes: "4.0" }).values.flutes, 4);
  assert.equal(run("feeds-mill", { flutes: "8/2" }).values.flutes, 4);
  // a tool number of 1.5 must not post T2
  assert.ok(run("bolt-circle", { gcode: "drill", tool: "1.5" }).invalid.has("tool"));
  assert.ok(run("acme", { starts: "1.5" }).invalid.has("starts"));
});

// Absolute zero is 0 K = −273.15 °C = −459.67 °F, exact by the SI definition of the kelvin (BIPM SI Brochure 9th ed. §2.3.1).
// The thermal limits are written in °F (min −460, max 5000); in °C they convert: 5000 °F = 2760 °C.
test("temperature limits follow the unit and stop at absolute zero", () => {
  const def = getCalc("thermal");
  const from = def.inputs.find((i) => i.id === "from"), to = def.inputs.find((i) => i.id === "to");
  const mm = run("thermal", { from: "-400", to: "20" }, "mm");
  assert.ok(mm.invalid.has("from"), "-400 °C is colder than absolute zero");
  assert.equal(invalidReason(from, -400, "-400", {}, "mm"), "From temperature can't be colder than absolute zero (-273.15 °C)");
  assert.ok(run("thermal", { from: "-300" }, "mm").invalid.has("from"));
  assert.ok(!run("thermal", { from: "-273" }, "mm").invalid.has("from"));
  assert.ok(!run("thermal", { from: "-196" }, "mm").invalid.has("from"), "liquid nitrogen is a real shrink-fit temperature");
  assert.ok(run("thermal", { from: "-459.9" }, "in").invalid.has("from"));
  assert.ok(!run("thermal", { from: "-459.67" }, "in").invalid.has("from"));
  assert.equal(invalidReason(from, -470, "-470", {}, "in"), "From temperature can't be colder than absolute zero (-459.67 °F)");
  assert.ok(run("thermal", { to: "5000" }, "mm").invalid.has("to"));
  assert.ok(!run("thermal", { to: "2760" }, "mm").invalid.has("to"));
  assert.equal(invalidReason(to, 5000, "5000", {}, "mm"), "To temperature can't be more than 2760 °C");
  // a temperature typed with its scale is read in that scale
  near(run("thermal", { from: "68°F" }, "mm").values.from, 20, 1e-9);
  near(run("thermal", { from: "20 °C" }, "in").values.from, 68, 1e-9);
  near(run("thermal", { from: "20°" }, "mm").values.from, 20, 1e-9);
  // an angle typed with its degree sign is still a number
  near(run("chamfer", { angle: "custom", customAngle: "45°" }).values.customAngle, 45, 1e-12);
});

test("a limit in a message is never rounded to 0 and carries its unit", () => {
  const ipr = getCalc("lathe-cycle").inputs.find((i) => i.id === "ipr");
  assert.equal(invalidReason(ipr, 0.000005, "0.000005", {}, "in"), "Feed per revolution can't be less than 0.00001 IPR");
  // in mm the inch limit is converted: 0.00001 in/rev = 0.000254 mm/rev
  assert.equal(invalidReason(ipr, 0.0001, "0.0001", {}, "mm"), "Feed per revolution can't be less than 0.000254 mm/rev");
  const spindle = getCalc("tapping-feed").inputs.find((i) => i.id === "rpm");
  assert.equal(invalidReason(spindle, 0, "0", {}, "in"), "Spindle can't be less than 1 RPM");
});

test("a unit that follows the system (a function of it) still reaches the limit message", () => {
  // Surface finish Target Ra: µin in inch mode, µm in mm (ASME B46.1 / ISO 4287 Ra units)
  const ra = getCalc("surface-finish").inputs.find((i) => i.id === "ra");
  assert.equal(invalidReason(ra, 0.0005, "0.0005", { mode: "feed" }, "in"), "Target Ra can't be less than 0.001 µin");
  assert.equal(invalidReason(ra, 0.0005, "0.0005", { mode: "feed" }, "mm"), "Target Ra can't be less than 0.001 µm");
  // Material weight price: $/lb in inch mode, $/kg in mm
  const price = getCalc("material-weight").inputs.find((i) => i.id === "price");
  assert.equal(invalidReason(price, -1, "-1", {}, "in"), "Material price can't be less than 0 $/lb");
  assert.equal(invalidReason(price, -1, "-1", {}, "mm"), "Material price can't be less than 0 $/kg");
  // and through buildValues: the system it checked in is the one the message quotes
  const def = getCalc("surface-finish");
  const built = buildValues(def, defaultRaw(def, { mode: "feed", ra: "0.0001" }, "mm"), ctxFor("mm"));
  assert.ok(built.invalid.has("ra"));
  assert.match(invalidReason(ra, built.values.ra, "0.0001", built.raw), / µm$/);
});

// Letter drill Q = 0.332 in (ASME B94.11M; Machinery's Handbook letter-drill table). 8.5 mm = 0.33465 in → 21/64 (−0.0065).
test("fraction converter: a size typed with its unit opens on that unit", () => {
  const fc = getCalc("fraction-converter");
  for (const [q, value, units] of [["8.5 mm", "8.5", "mm"], ["8.5mm", "8.5", "mm"], ["10mm", "10", "mm"], ['3/8"', "3/8", "in"], ["13/64in", "13/64", "in"],
    ["0.201 in", "0.201", "in"], ["0.201", "0.201", "in"], ["1 1/4", "1 1/4", "in"], ["1-1/4", "1-1/4", "in"], ["8.5 millimeters", "8.5", "mm"]]) {
    assert.deepEqual(fc.prefill(q)?.params, { value, units }, q);
  }
  assert.equal(fc.prefill("1-1/4").label, "1.25 in");
  for (const q of ["tap drill", "1/4-20", "0", "mm"]) assert.equal(fc.prefill(q), null, q);

  // a typed unit wins over the switch
  for (const [value, units] of [["8.5mm", "in"], ["8.5 mm", "in"], ["8.5", "mm"]]) {
    const { out, invalid } = run("fraction-converter", { value, units });
    assert.equal(invalid.size, 0, value);
    assert.equal(out.primary.text, "21/64");
    assert.equal(out.primary.label, "Nearest 1/64 (−0.0065 in)");
    assert.equal(out.stats.find((s) => s.label === "Nearest drill (inch)").text, "Q · 0.332");
  }
  near(run("fraction-converter", { value: '3/8"', units: "mm" }).out.stats.find((s) => s.label === "Millimeters").value, 9.525, 1e-12);
  near(run("fraction-converter", { value: "1-1/4", units: "in" }).out.stats.find((s) => s.label === "Millimeters").value, 31.75, 1e-12);
  assert.ok(run("fraction-converter", { value: "0" }).invalid.has("value"), "0 is not a size");
});

// 13/64 = 0.203125 exactly (Machinery's Handbook decimal equivalents). 0.2035 is 0.000375 over it, so it is not "exact".
test("fraction converter: exact only when the size is a 64th", () => {
  const primary = (value, units = "in") => run("fraction-converter", { value, units }).out.primary;
  assert.equal(primary("0.203125").label, "Fraction (exact to 1/64)");
  assert.equal(primary("0.203125").text, "13/64");
  assert.match(primary("0.2035").label, /^Nearest 1\/64 \(−0\.000[34] in\)$/);
  assert.equal(primary("0.2035").text, "13/64");
  assert.match(primary("0.5005").label, /^Nearest/);
  assert.match(primary("25", "mm").label, /^Nearest/, "25 mm is not 63/64");
  assert.equal(primary("3.175", "mm").label, "Fraction (exact to 1/64)", "3.175 mm is exactly 1/8");
  assert.equal(primary("3.175", "mm").text, "1/8");
});

// Exact factors (NIST SP 811 App. B, NIST Handbook 44 App. C): 1 in = 0.0254 m, 1 lb = 0.45359237 kg,
// 1 lbf = 0.45359237 × 9.80665 N, 1 US gal = 231 in³ = 128 fl oz, 1 arc-sec = π/648000 rad.
test("unit converter: exact factors, enough figures for small results, nothing below absolute zero", () => {
  const shown = (over) => { const p = run("unit-converter", over).out.primary; return fmt(p.value, p.places); };
  const stat = (over, label) => { const s = run("unit-converter", over).out.stats.find((x) => x.label === label); return fmt(s.value, s.places); };
  assert.equal(shown({ cat: "length", value: "0.001", from: "in", to: "m" }), "0.0000254");
  assert.equal(shown({ cat: "angle", value: "10", from: "arc-sec", to: "rad" }), "0.0000484814");
  assert.equal(shown({ cat: "pressure", value: "1", from: "psi", to: "MPa" }), "0.00689476");
  assert.equal(shown({ cat: "length", value: "0.002", from: "mm", to: "in" }), "0.0000787402");
  assert.equal(stat({ cat: "speed", value: "1", from: "m/sec", to: "m/min" }, "m/min"), "60");
  assert.equal(stat({ cat: "volume", value: "1", from: "gal", to: "in³" }, "fl oz"), "128");
  assert.equal(stat({ cat: "volume", value: "1", from: "gal", to: "in³" }, "cm³"), "3785.41");
  assert.equal(shown({ cat: "weight", value: "1000", from: "lb", to: "kg" }), "453.592");
  assert.equal(shown({ cat: "pressure", value: "1000", from: "psi", to: "bar" }), "68.9476");
  assert.equal(shown({ cat: "torque", value: "1", from: "kgf·m", to: "N·m" }), "9.80665");
  assert.match(run("unit-converter", { cat: "length", value: "1", from: "thou", to: "m" }).out.explain[0].formula, /= 0\.0000254 m$/);
  assert.equal(shown({ cat: "temp", value: "212", from: "°F", to: "°C" }), "100");
  for (const [value, from] of [["-500", "°C"], ["-1000", "°F"], ["-1", "K"]]) {
    assert.throws(() => run("unit-converter", { cat: "temp", value, from, to: from === "K" ? "°C" : "K" }), /absolute zero/, `${value} ${from}`);
  }
  assert.equal(shown({ cat: "temp", value: "0", from: "K", to: "°F" }), "-459.67");
});

test("unit converter: the To box and the answer always name the same unit", () => {
  const def = getCalc("unit-converter");
  const to = def.inputs.find((i) => i.id === "to");
  const cats = def.inputs.find((i) => i.id === "cat").options.map((o) => o.value);
  const every = cats.flatMap((cat) => def.inputs.find((i) => i.id === "from").options({ cat }).map((o) => o.value));
  for (const cat of cats) {
    for (const from of def.inputs.find((i) => i.id === "from").options({ cat }).map((o) => o.value)) {
      for (const stale of every) {
        const offered = to.options({ cat, from });
        if (offered.some((o) => o.value === stale)) continue;
        // the screen falls back to the first option; buildValues falls back to the default if offered — they must agree
        assert.equal(sanitizeChoices(def, { cat, value: "1", from, to: stale }, ctxFor("in")).to, offered[0].value, `${cat} ${from} with To=${stale}`);
      }
    }
  }
});

// ASME Y14.5-2018 §1.4(a): every dimension has a tolerance. "1 1/4" alone is the size 1.25, not 1 ± 1/4.
test("tolerance stack: a fraction with no tolerance is refused, and tolerances survive a unit switch", () => {
  for (const text of ["1 1/4\n1.000 ± 0.005", "2 3/8\n1.000 ± .005", "-1 1/4\n1 ± 0.005", "1.250\n1 ± 0.005"]) {
    assert.throws(() => run("tol-stack", { lines: text }), /no tolerance/, text);
  }
  const ok = run("tol-stack", { lines: "1 1/4 ± 1/64\n1 1/4 .005" }).out;
  near(ok.stats.find((s) => s.label === "Nominal").value, 2.5, 1e-12);
  near(ok.stats.find((s) => s.label === "Worst case max").value - 2.5, 0.015625 + 0.005, 1e-12);
  // A mixed number written with a hyphen, the way prints and stock lists write it: 1-1/4 = 1 + 1/4 = 1.25
  assert.deepEqual(parseStackLines("1-1/4 ± .005\n-1-1/4 ± .005\n2-3/8 +-1/64\n1-1/4,.002"), [
    { nominal: 1.25, tolerance: 0.005 }, { nominal: -1.25, tolerance: 0.005 },
    { nominal: 2.375, tolerance: 0.015625 }, { nominal: 1.25, tolerance: 0.002 },
  ]);
  assert.throws(() => parseStackLines("1-1/4\n1 ± .005"), /no tolerance/);
  assert.equal(run("tol-stack", { lines: "1-1/4 ± .005\n-1-1/4 ± .005" }).out.stats.find((s) => s.label === "Nominal").value, 0);
  // ±0.001 mm = ±0.00003937 in, never ±0; ±0.00025 in = ±0.00635 mm
  assert.equal(convertStackLines("25 ± 0.001\n10 ± 0.002", "mm", "in"), "0.9843 ± 0.00003937\n0.3937 ± 0.00007874");
  assert.equal(convertStackLines("1.000 ± 0.00025\n0.5 ± 0.00015", "in", "mm"), "25.4 ± 0.00635\n12.7 ± 0.00381");
  const typed = "0.750 ± 0.00025\n-0.250 ± 0.0001";
  assert.equal(convertStackLines(convertStackLines(typed, "in", "mm"), "mm", "in"), typed);
});
