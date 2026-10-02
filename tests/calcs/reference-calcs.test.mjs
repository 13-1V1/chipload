// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Reference-team calculators run the way the app runs them: hardness headline, true position at MMC/LMC,
// thermal limits in °F and °C, inch fit limits rounded inward, and each tool's Source line.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, invalidReason, convertInput } from "../../src/app/values.js";
import { near } from "../helpers.mjs";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { CALCULATION_SOURCES } from "../../src/data/sources.js";

const ctxFor = (units) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine: null, fmt });
const run = (id, over = {}, units = "in") => {
  const def = getCalc(id), ctx = ctxFor(units);
  const built = buildValues(def, defaultRaw(def, over, units), ctx);
  return { ...built, out: built.invalid.size ? null : def.compute(built.values, ctx) };
};

// ASTM E140 Table 2: HRB 90 = HV 185 = HB 185. Table 1: HRC 62 = HV 746 (no Brinell over HRC 60); HB 200 = HRB 93.
test("hardness headline is a scale that has a value, never 'off scale'", () => {
  const p = (scale, value) => run("hardness", { scale, value: String(value) }).out.primary;
  assert.deepEqual([p("hrb", 90).label, p("hrb", 90).text, p("hrb", 90).unit], ["Brinell", "185", "HB"]);
  assert.deepEqual([p("hrc", 62).label, p("hrc", 62).text, p("hrc", 62).unit], ["Vickers", "746", "HV"]);
  assert.deepEqual([p("hrc", 40).label, p("hrc", 40).text], ["Brinell", "371"]);
  assert.deepEqual([p("hb", 200).label, p("hb", 200).text], ["Rockwell B", "93"]);
  assert.deepEqual([p("hv", 150).label, p("hv", 150).text], ["Rockwell B", "80"]);
  assert.deepEqual([p("hv", 392).label, p("hv", 392).text], ["Rockwell C", "40"]);
  for (const [scale, value] of [["hrb", 60], ["hrb", 100], ["hb", 120], ["hv", 900], ["hrc", 68], ["hrc", 20]]) {
    assert.doesNotMatch(p(scale, value).text, /off scale/, `${scale} ${value}`);
  }
  assert.throws(() => run("hardness", { scale: "hrb", value: "50" }), /HRB 55–100/);
  const out = run("hardness", { scale: "hrc", value: "40" }).out;
  assert.equal(out.source, "hardness");
  assert.match(out.explain.map((e) => e.title).join(" "), /A370/);
});

// E140 Table 2 tops out at HRB 100 = HB 240 (A370: 116 ksi); Table 1 passes it at HRC 23 = HV 254 = HB 243 (117 ksi).
test("hardness: HV 241 never reads softer than HV 240, and the seam says why it's rough", () => {
  const stat = (out, label) => out.stats.find((s) => s.label.startsWith(label)).text;
  const a = run("hardness", { scale: "hv", value: "240" }).out, b = run("hardness", { scale: "hv", value: "241" }).out;
  assert.ok(Number(stat(b, "Brinell")) >= Number(stat(a, "Brinell")), `${stat(b, "Brinell")} < ${stat(a, "Brinell")}`);
  assert.ok(parseFloat(stat(b, "Approx. tensile")) >= parseFloat(stat(a, "Approx. tensile")));
  for (const [scale, value] of [["hv", 241], ["hb", 230], ["hrb", 99], ["hrc", 21]]) {
    assert.match(run("hardness", { scale, value: String(value) }).out.notes.join(" "), /disagree by up to 14 HB/, `${scale} ${value}`);
  }
  assert.doesNotMatch(run("hardness", { scale: "hrc", value: "40" }).out.notes.join(" "), /disagree/);
});

test("true position: an oversize hole can't pass on unlimited bonus", () => {
  // Ø.250–.255 hole measured .300 with a .0424 position error: bonus stops at .005, part is out on size and position
  const out = run("true-position", { dx: "0.015", dy: "0.015", tol: "0.010", mmc: "mmc", mmcSize: "0.250", lmc: "0.255", actual: "0.300" }).out;
  assert.match(out.primary.label, /OUT/);
  assert.equal(out.primary.clamped, true);
  near(out.stats.find((s) => s.label === "Bonus tolerance").value, 0.005, 1e-12);
  assert.match(out.warnings.join(" "), /bigger than its LMC size/);
  // position fine, size past LMC: still a reject
  const past = run("true-position", { mmc: "mmc", lmc: "0.255", actual: "0.256" }).out;
  assert.equal(past.primary.label, "Position OK, size OUT");
  // pin: Ø.245–.250 pin measured .240 is under LMC — out on size, bonus capped at .005
  const pin = run("true-position", { mmc: "mmc", feature: "pin", lmc: "0.245", actual: "0.240" }).out;
  assert.equal(pin.primary.label, "Position OK, size OUT");
  near(pin.stats.find((s) => s.label === "Bonus tolerance").value, 0.005, 1e-12);
});

test("true position: hole and pin both start inside their limits, with LMC left for the user", () => {
  for (const units of ["in", "mm"]) {
    for (const feature of ["hole", "pin"]) {
      const b = run("true-position", { mmc: "mmc", feature }, units);
      assert.equal(b.out.primary.label, "Position (in tolerance)", `${units} ${feature}`);
      assert.deepEqual(b.out.warnings, [], `${units} ${feature}`);
      assert.equal(b.values.actualAuto, true, "a blank actual is taken as MMC");
      assert.equal(b.out.stats.find((s) => s.label === "Bonus tolerance").value, 0);
      assert.match(b.out.notes.join(" "), /enter LMC to check/);
      // typing MMC well over the old LMC default never raises an LMC error the user didn't cause
      assert.ok(run("true-position", { mmc: "mmc", feature, mmcSize: units === "in" ? "0.500" : "12" }, units).out, `${units} ${feature} big MMC`);
    }
  }
  // every default case passes in mm too, not only in inches
  assert.equal(run("true-position", {}, "mm").out.primary.label, "Position (in tolerance)");
});

test("true position: saved jobs from before LMC existed reopen with what was typed", () => {
  // A pin job kept its measured size in "actual" and had no LMC: bonus = .250 − .2405 = .0095 (ASME Y14.5 pin bonus)
  const pin = run("true-position", { dx: "0.003", dy: "0.004", tol: "0.010", mmc: "mmc", feature: "pin", mmcSize: "0.250", actual: "0.2405" });
  assert.equal(pin.values.actual, 0.2405);
  near(pin.out.stats.find((s) => s.label === "Bonus tolerance").value, 0.0095, 1e-12);
  assert.equal(pin.out.primary.label, "Position (in tolerance)");
  // A hole job at MMC .500, measured .506: no LMC to trip on, bonus .006, with a note that size wasn't checked
  const hole = run("true-position", { dx: "0.003", dy: "0.004", tol: "0.010", mmc: "mmc", feature: "hole", mmcSize: "0.500", actual: "0.506" });
  near(hole.out.stats.find((s) => s.label === "Bonus tolerance").value, 0.006, 1e-12);
  assert.equal(hole.out.stats.find((s) => s.label === "Size").text, "Not checked (no LMC)");
  assert.match(hole.out.notes.join(" "), /enter LMC to check/);
});

test("true position: a miss under one display digit never reads 'out by 0'", () => {
  const out = run("true-position", { dx: "0.003", dy: "0.00401", tol: "0.010" }).out;
  assert.equal(out.primary.label, "Position (OUT)");
  const w = out.warnings.join(" ");
  assert.doesNotMatch(w, /by 0\b(?!\.)/);
  assert.match(w, /Out of position by (0\.0000\d+ in|less than)/);
  assert.notEqual(fmt(out.primary.value, out.primary.places), fmt(out.stats[0].value, out.stats[0].places), "position and allowed differ on screen");
  const mm = run("true-position", { dx: "0.076", dy: "0.102", tol: "0.254" }, "mm").out;
  assert.match(mm.warnings.join(" "), /Out of position by 0\.000\d+ mm/);
});

// 0.08 mm = 0.0031496 in (÷ 25.4). A part exactly on the line must give the same verdict after a unit switch.
test("true position: a unit switch never flips the verdict of a part on the line", () => {
  const def = getCalc("true-position");
  const switched = (over, from, to) => {
    const raw = defaultRaw(def, over, from), out = {};
    for (const i of def.inputs) out[i.id] = convertInput(i, raw[i.id], from, to, raw);
    return out;
  };
  const cases = [
    { dx: "0.08", dy: "0.06", tol: "0.2" }, // TP exactly 0.2 mm; four-figure inches made it OUT by 0.0000004
    { dx: "0.08", dy: "0.06", tol: "0.15", mmc: "mmc", mmcSize: "6.00", lmc: "6.05", actual: "6.05" }, // bonus 0.05 fills the gap
    { dx: "0.03", dy: "0.04", tol: "0.08", mmc: "mmc", feature: "pin", mmcSize: "12.7", lmc: "12.68", actual: "12.68" },
  ];
  for (const c of cases) {
    const mm = run("true-position", c, "mm").out;
    assert.equal(mm.primary.label, "Position (in tolerance)", JSON.stringify(c));
    const inch = switched(c, "mm", "in");
    if (c.dx === "0.08") assert.equal(inch.dx, "0.003149606");
    assert.equal(run("true-position", inch, "in").out.primary.label, "Position (in tolerance)", JSON.stringify(inch));
    // ...and straight back gives the typed mm text again
    assert.deepEqual(Object.fromEntries(Object.entries(switched(inch, "in", "mm")).filter(([k]) => k in c)), c);
  }
  // inch → mm is exact (×25.4): 0.003, 0.004 on a 0.010 zone is exactly on the line in both
  const onLine = { dx: "0.003", dy: "0.004", tol: "0.010" };
  assert.equal(run("true-position", onLine).out.primary.label, "Position (in tolerance)");
  const mmText = switched(onLine, "in", "mm");
  assert.deepEqual([mmText.dx, mmText.dy, mmText.tol], ["0.0762", "0.1016", "0.254"]);
  assert.equal(run("true-position", mmText, "mm").out.primary.label, "Position (in tolerance)");
});

// One physical band (0.000001 in = 0.0000254 mm). mm 0.110 / 0.150 on a 0.372 zone: TP 0.3720215 mm, 0.0000215 mm
// (0.00000085 in) past the line. A band of 1e-6 of the active unit called that OUT in mm and IN after the switch.
test("true position: a part within a millionth of an inch of the line keeps its verdict on a unit switch", () => {
  const def = getCalc("true-position");
  const switched = (over, from, to) => {
    const raw = defaultRaw(def, over, from), out = {};
    for (const i of def.inputs) out[i.id] = convertInput(i, raw[i.id], from, to, raw);
    return out;
  };
  // Right at the band's edge, where seven-decimal inches flipped the verdict:
  // 0.002 / 0.156 on 0.312: TP 0.3120256 mm, 0.0000256 mm past the line (just outside the 0.0000254 band) → OUT.
  // 0.001 / 0.008 on 0.0161: TP 0.0161245 mm, 0.0000245 mm past (inside the band) → in tolerance.
  // 0.002 / 0.149 on 0.298: TP 0.2980268 mm, 0.0000268 mm past → OUT.
  for (const [c, want] of [
    [{ dx: "0.110", dy: "0.150", tol: "0.372" }, "Position (in tolerance)"],
    [{ dx: "0.110", dy: "0.150", tol: "0.3719" }, "Position (OUT)"],
    [{ dx: "0.002", dy: "0.156", tol: "0.312" }, "Position (OUT)"],
    [{ dx: "0.001", dy: "0.008", tol: "0.0161" }, "Position (in tolerance)"],
    [{ dx: "0.002", dy: "0.149", tol: "0.298" }, "Position (OUT)"],
  ]) {
    const mm = run("true-position", c, "mm").out;
    const inch = run("true-position", switched(c, "mm", "in"), "in").out;
    assert.equal(mm.primary.label, want, `mm ${JSON.stringify(c)}`);
    assert.equal(inch.primary.label, want, `in ${JSON.stringify(c)}`);
    // the red Margin flag follows the verdict, in both systems
    for (const out of [mm, inch]) assert.equal(out.stats.find((s) => s.label === "Margin").clamped, out.primary.label !== "Position (in tolerance)");
  }
});

test("true position: the Margin stat is red exactly when the headline says out of position", () => {
  // 0.0000005 in past a 0.010 zone: inside the band, so in tolerance, and Margin (slightly negative) is not red
  const onLine = run("true-position", { dx: "0.003", dy: "0.0040004", tol: "0.010" }).out;
  assert.equal(onLine.primary.label, "Position (in tolerance)");
  assert.ok(onLine.stats.find((s) => s.label === "Margin").value < 0);
  assert.equal(onLine.stats.find((s) => s.label === "Margin").clamped, false);
  const out = run("true-position", { dx: "0.003", dy: "0.00401", tol: "0.010" }).out;
  assert.equal(out.stats.find((s) => s.label === "Margin").clamped, true);
  // out on size only: the position margin stays green, the Size stat carries the red
  const size = run("true-position", { mmc: "mmc", lmc: "0.255", actual: "0.256" }).out;
  assert.equal(size.stats.find((s) => s.label === "Margin").clamped, false);
  assert.equal(size.stats.find((s) => s.label === "Size").clamped, true);
});

// The size check uses the verdict's band. A hole 0.00001 mm under MMC 6.00 (or 0.0000005 in under 0.250) is inside
// the 0.0000254 mm / 0.000001 in band: in size, so no "rejected" warning may contradict an in-tolerance headline.
test("true position: a size inside the band gets no out-of-size warning, in either unit", () => {
  const cases = [
    ["mm", { mmc: "mmc", mmcSize: "6.00", lmc: "6.05", actual: "5.99999" }],
    ["mm", { mmc: "mmc", feature: "pin", mmcSize: "6.00", lmc: "5.95", actual: "6.00001" }],
    ["in", { mmc: "mmc", mmcSize: "0.250", lmc: "0.255", actual: "0.2499995" }],
    ["in", { mmc: "mmc", feature: "pin", mmcSize: "0.250", lmc: "0.245", actual: "0.2500005" }],
  ];
  for (const [units, c] of cases) {
    const out = run("true-position", c, units).out;
    assert.equal(out.primary.label, "Position (in tolerance)", `${units} ${JSON.stringify(c)}`);
    assert.equal(out.stats.find((s) => s.label === "Size").text, "Within MMC–LMC");
    assert.doesNotMatch(out.warnings.join(" "), /out of size|rejected/, `${units} ${JSON.stringify(c)}`);
  }
  // past the band it is out of size, the warning shows, and the headline agrees
  for (const [units, c] of [["mm", { mmc: "mmc", mmcSize: "6.00", lmc: "6.05", actual: "5.9999" }], ["in", { mmc: "mmc", mmcSize: "0.250", lmc: "0.255", actual: "0.249998" }]]) {
    const out = run("true-position", c, units).out;
    assert.equal(out.primary.label, "Position OK, size OUT", units);
    assert.match(out.warnings.join(" "), /Hole is smaller than its MMC size — out of size/, units);
  }
});

// Absolute zero: −459.67 °F = −273.15 °C (exact, SI Brochure 9th ed. §2.3.1)
test("thermal refuses a temperature below absolute zero in either unit", () => {
  // The field check (values.js) or compute() may refuse it; either way the user gets a reason in their unit.
  const refused = (over, units) => {
    const def = getCalc("thermal"), ctx = ctxFor(units);
    const b = buildValues(def, defaultRaw(def, over, units), ctx);
    if (b.invalid.size) { const id = [...b.invalid][0]; return invalidReason(def.inputs.find((i) => i.id === id), b.values[id], b.raw[id], b.raw, units); }
    try { def.compute(b.values, ctx); return null; } catch (e) { return e.message; }
  };
  assert.match(refused({ from: "-400", to: "20" }, "mm"), /absolute zero \(−?-?273\.15 °C\)/);
  assert.match(refused({ from: "68", to: "4000" }, "mm"), /2760 °C/);
  assert.match(refused({ from: "-470" }, "in"), /459\.67 °F/);
  // compute() is a backstop on its own, in the active unit
  const def = getCalc("thermal");
  assert.throws(() => def.compute({ material: "steel", length: 250, from: -400, to: 20 }, ctxFor("mm")), /below absolute zero \(−273\.15 °C\)/);
  assert.throws(() => def.compute({ material: "steel", length: 10, from: 68, to: 6000 }, ctxFor("in")), /5000 °F/);
  assert.ok(run("thermal", { from: "-196", to: "20" }, "mm").out, "liquid nitrogen shrink fit still works");
  const out = run("thermal", {}, "mm").out;
  assert.equal(out.source, "thermal");
  assert.match(out.explain[0].plugged, / mm × .* °C = .* mm$/);
});

// ISO 370 practice for converted toleranced limits: round inward (max down, min up), so the inch limits stay
// inside the ISO zone. 1 in g6 = 25.380–25.393 mm = 0.999213–0.999724 in → 0.9993–0.9997 (nearest would give 0.9992).
test("fits: inch limits round inward so they never sit outside the ISO limit", () => {
  const out = run("fits", { nominal: "1", fit: "H7/g6" }).out;
  assert.equal(out.stats.find((s) => s.label === "Shaft g6").text, "0.9993 – 0.9997");
  assert.equal(out.stats.find((s) => s.label === "Hole H7").text, "1 – 1.0008");
  assert.equal(out.source, "fits");
  assert.match(out.explain.map((e) => e.plugged).join(" "), /in → /);
  // 1/4 in k6: 6.35 mm k6 = +10/+1 µm → 0.250039–0.250394 in → min rounds up to 0.2501
  const k6 = run("fits", { nominal: "0.25", fit: "H7/k6" }).out;
  assert.match(k6.stats.find((s) => s.label === "Shaft k6").text, /^0\.2501 – /);
  // mm stays exact
  assert.equal(run("fits", { nominal: "25", fit: "H7/g6" }, "mm").out.stats.find((s) => s.label === "Shaft g6").text, "24.98 – 24.993");
  assert.throws(() => run("fits", { nominal: "25", fit: "custom", hole: "K11", shaft: "h11" }, "mm"), /no K11 hole over 3 mm/);
});

test("source lines name the standard each tool uses", () => {
  for (const key of ["hardness", "thermal", "fits", "sti", "acme", "npt"]) {
    assert.ok(CALCULATION_SOURCES[key]?.source && CALCULATION_SOURCES[key]?.confidence, key);
  }
  assert.match(CALCULATION_SOURCES.acme.source, /B1\.5/); assert.match(CALCULATION_SOURCES.acme.source, /29/);
  assert.match(CALCULATION_SOURCES.npt.source, /B1\.20\.1/);
  assert.match(CALCULATION_SOURCES.sti.source, /B18\.29\.1/);
  assert.match(CALCULATION_SOURCES.hardness.confidence, /Approximate/);
  assert.doesNotMatch(CALCULATION_SOURCES.tapDrill.source, /explicitly selected/);
  for (const id of ["hardness", "material-weight", "thermal", "fits", "true-position"]) assert.ok(CALCULATION_SOURCES[run(id).out.source], id);
  // ISO 965-1 tables for metric limits; DIN 336 / ISO 2306 D − P for metric fine tap drills
  assert.match(CALCULATION_SOURCES.threadGeometry.source, /ISO 965-1 table values/);
  // M10x0.5, M3x0.2 etc. have no table row; iso965Tolerances falls back to the formulas, and the source says so
  assert.match(CALCULATION_SOURCES.threadGeometry.source, /no row for that size and pitch, its §13 formulas/);
  assert.doesNotMatch(CALCULATION_SOURCES.threadGeometry.source, /within a few microns/);
  assert.match(CALCULATION_SOURCES.tapDrill.source, /DIN 336 \/ ISO 2306, drill = D − P/);
  assert.match(CALCULATION_SOURCES.sti.source, /Heli-Coil metric/);
  assert.match(CALCULATION_SOURCES.npt.source, /tap drill charts/);
  // tools whose numbers come from their own source point at it
  assert.equal(run("saw-speed").out.source, "saw");
  assert.match(CALCULATION_SOURCES.saw.source, /LENOX Guide to Band Sawing p\.21[^]*Tooth Selection Guide p\.23/);
  assert.equal(run("center-drill").out.source, "centerDrill");
  assert.match(CALCULATION_SOURCES.centerDrill.source, /B94\.11M/);
  assert.equal(run("quote").out.source, "quote");
  for (const key of ["saw", "centerDrill", "quote"]) assert.ok(CALCULATION_SOURCES[key].title && CALCULATION_SOURCES[key].confidence, key);
});

test("material library: count, per-family rating scales, and cost in dollars and cents", () => {
  const lib = getCalc("materials");
  const count = lib.rows({ units: "in" }).length;
  assert.match(lib.help, new RegExp(`for ${count} materials`));
  assert.match(lib.short, new RegExp(`^${count} materials`));
  // AISI B1112 for steels, CDA C36000 for copper alloys, own family for the rest (materials-library.js ratingScale)
  assert.doesNotMatch(lib.note, /Rating is vs\. B1112 = 100%\./);
  assert.match(lib.note, /Carbon steel[^.]*stainless[^.]*: vs\. B1112 steel = 100%/);
  assert.match(lib.note, /Copper alloys: vs\. C360 brass = 100/);
  assert.match(lib.note, /Aluminum[^.]*: ranked within its own family only/);
  // Money reads like a quote: always cents, thousands grouped (_money.js), never "$18.4" or "$7350.1".
  const cost = (price, units = "in") => {
    const out = run("material-weight", { price }, units).out;
    return { text: out.stats.find((s) => s.label === "Material cost").text, weight: out.primary.value };
  };
  const dollars = (x) => `$${(Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const [price, units] of [["4.10", "in"], ["5", "in"], ["2000", "in"], ["10", "mm"]]) {
    const { text, weight } = cost(price, units);
    assert.equal(text, dollars(weight * Number(price)), `${price} ${units}`);
    assert.match(text, /^\$[\d,]+\.\d\d$/);
  }
  assert.match(cost("2000").text, /^\$\d,\d{3}\.\d\d$/);
});

// ASME Y14.5-2018 zero positional tolerance at MMC: the frame says Ø0 Ⓜ and the whole zone is bonus
// (hole: actual − MMC, capped at LMC − MMC). 0.253 hole, MMC 0.250, LMC 0.255 → bonus 0.003;
// TP = 2√(0.0006² + 0.0008²) = 0.002 → in, 0.001 margin.
test("true position: Ø0 at MMC is accepted, the zone is all bonus; RFS still refuses a zero tolerance", () => {
  const z = { tol: "0", mmc: "mmc", feature: "hole", mmcSize: "0.250", lmc: "0.255", actual: "0.253", dx: "0.0006", dy: "0.0008" };
  const inch = run("true-position", z);
  assert.equal(inch.invalid.size, 0, [...inch.invalid].join());
  near(inch.out.stats.find((s) => s.label === "Allowed (tol + bonus)").value, 0.003, 1e-12);
  near(inch.out.primary.value, 0.002, 1e-12);
  assert.equal(inch.out.primary.label, "Position (in tolerance)");
  near(inch.out.stats.find((s) => s.label === "Used").value, 66.67, 0.01);
  assert.ok(inch.out.notes.some((n) => /Ø0 at MMC/.test(n)));
  // the same part in mm: 6.35 / 6.477 / 6.4262, dx 0.01524, dy 0.02032 → allowed 0.0762, TP 0.0508
  const mm = run("true-position", { ...z, mmcSize: "6.35", lmc: "6.477", actual: "6.4262", dx: "0.01524", dy: "0.02032" }, "mm").out;
  near(mm.stats.find((s) => s.label === "Allowed (tol + bonus)").value, 0.0762, 1e-9);
  near(mm.primary.value, 0.0508, 1e-9);
  assert.equal(mm.primary.label, "Position (in tolerance)");
  // a part at MMC with Ø0 has no zone: on true position it passes, off it fails, and "Used" never reads NaN or ∞
  for (const [dx, pass] of [["0", true], ["0.001", false]]) {
    const out = run("true-position", { ...z, actual: "0.250", dx, dy: "0" }).out;
    assert.equal(out.primary.label === "Position (in tolerance)", pass, dx);
    const used = out.stats.find((s) => s.label === "Used");
    assert.equal(used.value, undefined);
    assert.match(used.text, /No zone/);
    assert.doesNotMatch(JSON.stringify(out), /NaN|Infinity/);
  }
  assert.throws(() => run("true-position", { tol: "0" }), /only works at MMC/);
  assert.equal(run("true-position", { tol: "-0.001", mmc: "mmc" }).invalid.has("tol"), true);
});

// The explain line's α is the Coefficient stat's number: C360 brass 11.4 µin/in/°F (= 20.52 µm/m/°C), so
// 11.4e-6 × 10 in × 32 °F = 0.003648 in and 20.52e-6 × 250 mm × 20 °C = 0.1026 mm.
test("thermal: the plugged α multiplies out to the answer shown", () => {
  for (const [units, raw] of [["in", { material: "brass", length: "10", from: "68", to: "100" }], ["mm", { material: "brass", length: "250", from: "20", to: "40" }]]) {
    const out = run("thermal", raw, units).out;
    const coef = out.stats.find((s) => s.label === "Coefficient");
    const plugged = out.explain[0].plugged;
    const m = plugged.match(/= ([\d.]+) × 10⁻⁶ \/°[FC] × ([\d.]+) (?:in|mm) × ([\d.]+) °[FC] = ([\d.]+)/);
    assert.ok(m, plugged);
    assert.equal(m[1], fmt(coef.value, coef.places), units);
    const product = Number(m[1]) * 1e-6 * Number(m[2]) * Number(m[3]);
    assert.equal(fmt(product, units === "in" ? 5 : 4), m[4], `${units}: ${plugged}`);
  }
});

// The inch limits round inward (ISO 370); the clearance and tolerance on the same screen are worked from them.
// 1 in H7/g6: hole 1.0000–1.0008, shaft 0.9993–0.9997 → clearance 0.0003–0.0015, tolerances 0.0008 and 0.0004.
test("fits: in inches, the clearance and tolerance add up from the limits shown", () => {
  const g6 = run("fits", { nominal: "1", fit: "H7/g6" }).out;
  const stat = (out, label) => out.stats.find((s) => s.label.startsWith(label)).value;
  assert.equal(g6.primary.text, "0.0003 – 0.0015");
  near(stat(g6, "Max clearance"), 0.0015, 1e-12);
  near(stat(g6, "Min clearance"), 0.0003, 1e-12);
  near(stat(g6, "Hole tolerance"), 0.0008, 1e-12);
  near(stat(g6, "Shaft tolerance"), 0.0004, 1e-12);
  assert.match(g6.notes[0], /worked from those limits/);
  for (const [nominal, fit, units] of [["0.04", "H7/p6", "in"], ["0.5", "H7/s6", "in"], ["2", "H8/f7", "in"], ["0.25", "H7/k6", "in"], ["25", "H7/p6", "mm"], ["40", "H9/d9", "mm"]]) {
    const out = run("fits", { nominal, fit }, units).out;
    const [hole, shaft] = out.tables[0].rows;
    near(stat(out, "Max clearance"), hole.max - shaft.min, 1e-9, `${nominal} ${fit}`);
    near(stat(out, "Min clearance"), hole.min - shaft.max, 1e-9, `${nominal} ${fit}`);
    near(stat(out, "Hole tolerance"), hole.max - hole.min, 1e-9, `${nominal} ${fit}`);
    near(hole.tol, hole.max - hole.min, 1e-9);
    near(shaft.tol, shaft.max - shaft.min, 1e-9);
  }
  // mm stays the exact ISO 286 values: 25 H7/g6 = +21/0 and −7/−20 µm → 0.007–0.041 mm
  const mm = run("fits", { nominal: "25", fit: "H7/g6" }, "mm").out;
  assert.equal(mm.primary.text, "0.007 – 0.041");
});

// 0.010–0.030 in = 0.254–0.762 mm. The chart lists inch and metric screws in both modes, so both units show,
// the active one first.
test("shcs chart: the sink allowance reads in the active unit, and the chart looks a thread up by size", () => {
  const shcs = getCalc("shcs");
  assert.equal(typeof shcs.note, "function");
  assert.match(shcs.note({ units: "mm" }), /Add 0\.25–0\.76 mm \(0\.010–0\.030 in\)/);
  assert.match(shcs.note({ units: "in" }), /Add 0\.010–0\.030 in \(0\.25–0\.76 mm\)/);
  assert.equal(shcs.threadToSize, true);
  // every other chart keeps a plain-string note
  for (const id of ["gdt", "materials"]) assert.equal(typeof getCalc(id).note, "string", id);
});

// ISO 286-1, 3–6 mm: H7 = +12/0 µm, n6 = +16/+8 µm, so 0.12 in (3.048 mm) H7/n6 is a transition fit, −16 to +4 µm
// (−0.00063 to +0.00016 in). Rounded inward the limits are hole 0.1200–0.1204, shaft 0.1204–0.1206: max clearance 0.
// The label keeps the ISO name, and a note says why the numbers shown never run loose.
test("fits: a transition fit whose inch limits close one side says so", () => {
  const out = run("fits", { nominal: "0.12", fit: "H7/n6" }).out;
  assert.equal(out.primary.label, "H7/n6 · Transition fit");
  assert.equal(out.primary.text, "-0.0006 – 0");
  assert.match(out.notes.join(" "), /ISO 286 calls H7\/n6 a transition fit.*leave no clearance \(max clearance 0 in\).*never run loose/);
  // every preset, inch sizes up to 19.6 in: a transition label next to numbers that aren't a transition carries the note
  const fits = getCalc("fits").inputs.find((i) => i.id === "fit").options.map((o) => o.value).filter((f) => f !== "custom");
  for (let n = 0.01; n < 19.6; n += 0.01) {
    for (const fit of fits) {
      const o = run("fits", { nominal: n.toFixed(2), fit }).out;
      const stat = (label) => o.stats.find((s) => s.label.startsWith(label)).value;
      const shown = stat("Min clearance") >= 0 ? "Clearance" : stat("Max clearance") <= 0 ? "Interference" : "Transition";
      if (!o.primary.label.endsWith(`${shown} fit`)) {
        assert.match(o.primary.label, /Transition fit/, `${n.toFixed(2)} ${fit}`);
        assert.match(o.notes[0], /^ISO 286 calls .* a transition fit/, `${n.toFixed(2)} ${fit}`);
      } else assert.doesNotMatch(o.notes.join(" "), /ISO 286 calls/, `${n.toFixed(2)} ${fit}`);
    }
  }
  // mm shows the ISO values, so the label and numbers always agree there
  assert.doesNotMatch(run("fits", { nominal: "3.048", fit: "H7/n6" }, "mm").out.notes.join(" "), /ISO 286 calls/);
});

// 1 in H7/g6: ISO min clearance 7 µm = 0.000276 in shows 0.0003 (looser); 0.5 in H7/s6: ISO max interference
// 39 µm = 0.001535 in shows 0.0015 (less; ISO min 10 µm = 0.00039 in shows 0.0005). Both ends move inward, so the note says narrower, never "tighter".
test("fits: the inch note says the range narrows at both ends", () => {
  const note = run("fits", { nominal: "1", fit: "H7/g6" }).out.notes.join(" ");
  assert.match(note, /each end of the clearance range can sit up to 0\.0002 in inside the ISO range/);
  assert.doesNotMatch(note, /tighter than the ISO values/);
  near(run("fits", { nominal: "1", fit: "H7/g6" }).out.stats.find((s) => s.label.startsWith("Min clearance")).value, 0.0003, 1e-12);
  assert.equal(run("fits", { nominal: "0.5", fit: "H7/s6" }).out.primary.text, "0.0005 – 0.0015 tight");
});

// mm steel 250 mm, 20 → 37.75 °C: 11.7 × 10⁻⁶ × 250 × 17.75 = 0.0519 mm. ΔT keeps its typed 17.75, so the
// plugged line multiplies out to the answer (17.8 would give 0.0521).
test("thermal: a two-decimal temperature change still multiplies out", () => {
  for (const [units, raw] of [["mm", { material: "steel", length: "250", from: "20", to: "37.75" }], ["in", { material: "steel", length: "10", from: "68", to: "99.95" }]]) {
    const out = run("thermal", raw, units).out;
    const m = out.explain[0].plugged.match(/= ([\d.]+) × 10⁻⁶ \/°[FC] × ([\d.]+) (?:in|mm) × ([\d.]+) °[FC] = ([\d.]+)/);
    assert.ok(m, out.explain[0].plugged);
    assert.equal(fmt(Number(m[1]) * 1e-6 * Number(m[2]) * Number(m[3]), units === "in" ? 5 : 4), m[4], out.explain[0].plugged);
    const dT = out.stats.find((s) => s.label === "Temperature change");
    assert.equal(fmt(dT.value, dT.places), m[3], units);
  }
  assert.match(run("thermal", { material: "steel", length: "250", from: "20", to: "37.75" }, "mm").out.explain[0].plugged, / × 17\.75 °C = 0\.0519 mm$/);
});

// A history row reads on its own: every length in it carries its unit, metric in mm mode.
test("reference tools: history labels give lengths with their unit", () => {
  for (const units of ["in", "mm"]) {
    const u = units === "mm" ? "mm" : "in";
    for (const id of ["fits", "thermal", "true-position", "saw-speed"]) {
      const label = run(id, {}, units).out.historyLabel;
      assert.match(label, new RegExp(`\\d ${u}\\b`), `${id} ${units}: ${label}`);
      assert.doesNotMatch(label, new RegExp(`\\d ${units === "mm" ? "in" : "mm"}\\b`), `${id} ${units}: ${label}`);
    }
  }
  assert.equal(run("true-position", { dx: "0.003", dy: "0.004", tol: "0.014" }).out.historyLabel, "Δ0.003, 0.004 → 0.01 in");
  assert.equal(run("thermal", { material: "steel", length: "250", from: "20", to: "37.75" }, "mm").out.historyLabel, "Carbon / alloy steel 250 mm · 20→37.75 °C");
  // the label shows temperatures as typed, the way the ΔT stat does (it once rounded 0.25 to 0.3)
  assert.equal(run("thermal", { material: "steel", length: "250", from: "-0.5", to: "0.25" }, "mm").out.historyLabel, "Carbon / alloy steel 250 mm · -0.5→0.25 °C");
  assert.equal(run("thermal", {}, "in").out.historyLabel, "Carbon / alloy steel 10 in · 68→100 °F");
});
