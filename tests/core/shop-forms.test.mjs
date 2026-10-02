// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Shop forms refuse what they can't use, and the links they open carry every field.

import test from "node:test";
import assert from "node:assert/strict";
import { readMachineLimits, readFlutes, toolFeedsParams, jobParams } from "../../src/app/shop-forms.js";
import feedsMill from "../../src/calcs/feeds-mill.js";
import feedsDrill from "../../src/calcs/feeds-drill.js";

test("machine limits: blank is no limit; a typo or an impossible number is refused, never saved as 'no cap'", () => {
  assert.deepEqual(readMachineLimits("", "", "in"), { maxRpm: 0, maxFeed: 0 });
  assert.deepEqual(readMachineLimits("8100", "650", "in"), { maxRpm: 8100, maxFeed: 650 });
  assert.deepEqual(readMachineLimits("12,000", "", "in"), { maxRpm: 12000, maxFeed: 0 });
  assert.match(readMachineLimits("-500", "", "in").error, /Max spindle has to be at least 1 RPM/);
  assert.match(readMachineLimits("0.001", "", "in").error, /Max spindle/);
  // Under 1 RPM is refused before rounding: 0.5 must not round up to a 1 RPM cap.
  assert.match(readMachineLimits("1/2", "", "in").error, /Max spindle has to be at least 1 RPM/);
  assert.match(readMachineLimits("0.5", "", "in").error, /Max spindle has to be at least 1 RPM/);
  assert.equal(readMachineLimits("1", "", "in").maxRpm, 1, "1 RPM is the floor and is allowed");
  assert.match(readMachineLimits("12k", "", "in").error, /Check Max spindle/);
  assert.match(readMachineLimits("1/0", "", "in").error, /Check Max spindle/);
  assert.match(readMachineLimits("8100", "-400", "in").error, /Max feed has to be at least 1 IPM/);
  assert.match(readMachineLimits("8100", "0.01", "in").error, /Max feed/);
  assert.match(readMachineLimits("8100", "10", "mm").error, /at least 25 mm\/min/);
  assert.equal(readMachineLimits("8100.4", "", "in").maxRpm, 8100, "RPM is a whole number");
});

test("flutes: a whole number from 1 to 20; 0, junk and fractions are refused instead of saved as 2", () => {
  assert.deepEqual(readFlutes("4", "endmill"), { flutes: 4 });
  assert.equal(readFlutes("0", "endmill").error, "Flutes can't be less than 1");
  assert.equal(readFlutes("-4", "endmill").error, "Flutes can't be less than 1");
  assert.match(readFlutes("abc", "endmill").error, /Check Flutes/);
  assert.equal(readFlutes("2.5", "endmill").error, "Flutes has to be a whole number");
  assert.equal(readFlutes("40", "endmill").error, "Flutes can't be more than 20");
  assert.equal(readFlutes("", "endmill").error, "Enter the number of flutes");
  assert.deepEqual(readFlutes("", "drill"), { flutes: 2 }, "a twist drill left blank is 2-flute");
});

test("Tools → Feeds: overrides come up blank (table values), not the last tool's", () => {
  const t = { kind: "endmill", diameter: 0.125, flutes: 2, toolType: "carbide", units: "in" };
  const { params, note } = toolFeedsParams(t, feedsMill, "s1018");
  assert.equal(note, null);
  assert.equal(params.diameter, "0.125");
  assert.equal(params.flutes, "2");
  assert.equal(params.toolType, "carbide");
  assert.equal(params.units, "in");
  assert.equal(params.material, "s1018", "the material last used stays (it's the job's, not the cutter's)");
  for (const id of ["sfm", "chip", "woc", "doc"]) assert.equal(params[id], "", `${id} blank`);
  assert.equal(toolFeedsParams(t, feedsMill, "not-a-material").params.material, feedsMill.inputs.find((i) => i.id === "material").default);
});

test("Tools → Feeds on a coated drill never silently becomes HSS", () => {
  const t = { kind: "drill", diameter: 0.5, flutes: 2, toolType: "coated", units: "in" };
  const { params, note } = toolFeedsParams(t, feedsDrill);
  const offered = feedsDrill.inputs.find((i) => i.id === "toolType").options.map((o) => o.value);
  if (offered.includes("coated")) { assert.equal(params.toolType, "coated"); assert.equal(note, null); }
  else { assert.equal(params.toolType, "carbide"); assert.match(note, /Opened as Carbide/); }
  assert.notEqual(params.toolType, "hss");
  assert.equal(params.flutes, undefined, "the drill tool has no flutes field");
  for (const i of feedsDrill.inputs) assert.ok(i.id in params, `${i.id} carried`);
});

test("reopening a saved job: the fraction converter's own 'units' field wins over the job's inch/mm", () => {
  const fc = { id: "fraction-converter", units: false, inputs: [
    { id: "units", label: "Value is in", kind: "segment", default: "in", options: [{ value: "in" }, { value: "mm" }] },
    { id: "value", label: "Size", kind: "number", default: "0.201" }] };
  assert.deepEqual(jobParams({ raw: { units: "mm", value: "8.5" }, units: "in" }, fc), { units: "mm", value: "8.5" });
  // a tool with the inch/mm switch gets the job's units; a field the job predates gets its default, not a leftover
  const p = jobParams({ raw: { diameter: "10", flutes: "3" }, units: "mm" }, feedsMill);
  assert.equal(p.units, "mm");
  assert.equal(p.diameter, "10");
  assert.equal(p.sfm, "");
  assert.ok(p.material, "missing field filled with its default");
});
