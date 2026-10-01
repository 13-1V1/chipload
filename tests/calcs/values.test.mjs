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
import { convertStackLines } from "../../src/calcs/tol-stack.js";
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
  assert.equal(mm, "25.4 ± 0.127\n50.8 ± 0.254\n-12.7 ± 0.051");
  assert.equal(convertStackLines(mm, "mm", "in"), "1 ± 0.005\n2 ± 0.01\n-0.5 ± 0.002");
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
  assert.equal(out.stats.find((s) => s.label === "Shaft g6").text, "0.9992 – 0.9997");
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
  const mm = run("mow", { thread: "M10x1.5" }, "mm");
  assert.ok([0.8, 0.9, 1.0].includes(mm.values.wire), `stock mm wire, got ${mm.values.wire}`);
  const inch = run("mow", { thread: "1/4-20" }, "in");
  near(inch.values.wire, 0.03, 0.003);
});
