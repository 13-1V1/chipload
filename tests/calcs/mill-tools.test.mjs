// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The mill tools the way people run them (feeds-mill, chip-thinning, ball-nose, circle-interp): published
// formulas through compute(), the Shop machine fit, micro tools, and mm screens that read in mm.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import "../../src/calcs/feeds-mill.js";
import "../../src/calcs/chip-thinning.js";
import "../../src/calcs/ball-nose.js";
import "../../src/calcs/circle-interp.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, invalidReason } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctx = (units = "in", machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const build = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id);
  const c = ctx(units, machine);
  return { def, c, ...buildValues(def, defaultRaw(def, over, units), c) };
};
const run = (id, over, units, machine) => {
  const { def, c, values, invalid } = build(id, over, units, machine);
  assert.equal(invalid.size, 0, `invalid: ${[...invalid].join(",")}`);
  return def.compute(values, c);
};
const stat = (out, re) => out.stats.find((s) => re.test(s.label));
const explainText = (out) => out.explain.map((e) => `${e.formula} ${e.plugged}`).join(" | ");

const bridgeport = { id: "bp", name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, units: "in" };
const tormach = { id: "t", name: "Tormach", type: "mill", maxRpm: 5140, maxFeed: 110, units: "in" };

// ── feeds-mill ──

// Machinery's Handbook: RPM = 12·SFM ÷ (π·D), IPM = RPM × flutes × chip load.
test("feeds-mill: 3/8 4FL at 400 SFM, 0.003 chip → 4074 RPM, 48.9 IPM; same cut in mm", () => {
  const inch = run("feeds-mill", { diameter: "0.375", flutes: "4", sfm: "400", chip: "0.003" });
  near(inch.stats[0].value, 4074.4, 0.1);
  near(inch.primary.value, 48.89, 0.01);
  const mm = run("feeds-mill", { diameter: "9.525", flutes: "4", sfm: String(400 / 3.28084), chip: "0.0762" }, "mm");
  near(mm.stats[0].value, inch.stats[0].value, 0.01);
  near(mm.primary.value, inch.primary.value * 25.4, 0.01);
});

// Sandvik radial chip thinning: ae = D/10 → factor 5/3, applied to the feed.
test("feeds-mill: light radial cut thins the chip and the feed goes up 5/3", () => {
  const out = run("feeds-mill", { diameter: "0.5", sfm: "400", chip: "0.003", woc: "0.05" });
  near(stat(out, /Chip load programmed/).value, 0.005, 1e-12);
  near(out.primary.value, rpmAt(400, 0.5) * 4 * 0.005, 1e-9);
});
function rpmAt(sfm, d) { return (sfm * 12) / (Math.PI * d); }

test("feeds-mill: a width of cut too light for the cap says so", () => {
  const out = run("feeds-mill", { diameter: "0.5", sfm: "400", chip: "0.003", woc: "0.005" });
  assert.ok(out.warnings.some((w) => /held at 2.5×/.test(w)), out.warnings.join(" | "));
});

test("feeds-mill: a typed 0 width of cut is rejected, blank still means 'not given'", () => {
  assert.ok(build("feeds-mill", { woc: "0" }).invalid.has("woc"));
  assert.equal(build("feeds-mill", { woc: "" }).invalid.size, 0);
  assert.ok(build("chip-thinning", { woc: "0" }).invalid.has("woc"));
});

// Harvey Tool SF_74000, wrought aluminum slotting: 1/32 (0.031) in → 0.00039 IPT, 0.015 in → 0.00019 IPT.
// The table chip for a micro end mill must scale down with it (the 0.25× floor gave 0.001 for both).
test("feeds-mill: micro end mills get a micro chip load and a heavy typed chip is caught", () => {
  for (const [d, harvey] of [["0.03125", 0.00039], ["0.015", 0.00019]]) {
    const chip = stat(run("feeds-mill", { diameter: d, material: "al6061", toolType: "carbide" }), /Chip load programmed/).value;
    assert.ok(chip <= harvey && chip >= harvey * 0.75, `${d} in: ${chip} vs Harvey ${harvey}`);
  }
  // 0.5 mm in aluminum: about 0.005 mm/tooth (Harvey's 0.015–0.031 in row, ~0.00019–0.00039 in = 0.005–0.010 mm)
  const mm = stat(run("feeds-mill", { diameter: "0.5", material: "al6061", toolType: "carbide" }, "mm"), /Chip load programmed/).value;
  assert.ok(mm > 0.004 && mm < 0.0075, `0.5 mm tool: ${mm} mm`);
  const heavy = run("feeds-mill", { diameter: "0.03125", material: "al6061", chip: "0.0015" });
  assert.ok(heavy.warnings.some((w) => /very heavy chip/.test(w)), heavy.warnings.join(" | "));
});

// Every number a user reads carries its unit: the library chip in the heavy and light warnings too.
test("feeds-mill: heavy and light chip warnings write the library chip with its unit", () => {
  const heavyMm = run("feeds-mill", { diameter: "0.8", material: "al6061", chip: "0.04" }, "mm");
  assert.ok(heavyMm.warnings.some((w) => /library says about [\d.]+ mm\)/.test(w)), heavyMm.warnings.join(" | "));
  const lightIn = run("feeds-mill", { material: "al6061", chip: "0.0005" });
  assert.ok(lightIn.warnings.some((w) => /Typical is about [\d.]+ in\./.test(w)), lightIn.warnings.join(" | "));
});

// Feed-limited machine: hold the chip, drop the spindle. 30 IPM ÷ (4 × 0.004) = 1875 RPM.
test("feeds-mill: a feed cap slows the spindle so the chip load on screen is the chip load cut", () => {
  const out = run("feeds-mill", { diameter: "0.375", flutes: "4", material: "al6061", sfm: "1000", chip: "0.004" }, "in", bridgeport);
  assert.equal(out.stats[0].value, 1875);
  assert.equal(out.stats[0].clamped, true);
  near(out.primary.value, 30, 1e-9);
  near(stat(out, /Chip load programmed/).value, 0.004, 1e-12);
  near(stat(out, /Feed per revolution/).value, 0.016, 1e-12);
  assert.ok(out.warnings.some((w) => /Bridgeport max feed is 30 IPM/.test(w) && /1875 RPM/.test(w)), out.warnings.join(" | "));
  assert.match(explainText(out), /1875 RPM × 4 × 0\.004 in = 30 IPM/);
});

test("feeds-mill: a machine saved in mm/min limits an inch screen the same, and the reverse", () => {
  const mmMachine = { ...bridgeport, maxFeed: 762, units: "mm" };
  const a = run("feeds-mill", { diameter: "0.375", sfm: "1000", chip: "0.004" }, "in", mmMachine);
  assert.equal(a.stats[0].value, 1875);
  const b = run("feeds-mill", { diameter: "9.525", sfm: String(1000 / 3.28084), chip: "0.1016" }, "mm", bridgeport);
  assert.equal(b.stats[0].value, 1875);
  near(b.primary.value, 762, 1e-6);
});

// 2500 RPM × 4 × 0.002 in = exactly 20 IPM on a 20 IPM machine: not a clamp, in inch or in mm.
test("feeds-mill: a cut that lands exactly on the max feed isn't flagged in either unit system", () => {
  const m = { id: "mini", name: "Mini mill", type: "mill", maxRpm: 2500, maxFeed: 20, units: "in" };
  const inch = run("feeds-mill", { diameter: "0.375", sfm: "1000", chip: "0.002" }, "in", m);
  const mm = run("feeds-mill", { diameter: "9.525", sfm: String(1000 / 3.28084), chip: "0.0508" }, "mm", m);
  for (const out of [inch, mm]) {
    assert.equal(out.primary.clamped, false);
    assert.ok(!out.warnings.some((w) => /max feed/.test(w)), out.warnings.join(" | "));
  }
});

test("feeds-mill: a lathe profile doesn't limit an end mill; no machine past 20,000 RPM warns", () => {
  const lathe = { id: "l", name: "ST-10", type: "lathe", maxRpm: 2000, maxFeed: 10, units: "in" };
  const out = run("feeds-mill", { diameter: "0.375", sfm: "400", chip: "0.003" }, "in", lathe);
  near(out.stats[0].value, 4074.4, 0.1);
  const fast = run("feeds-mill", { diameter: "0.125", material: "al6061" });
  assert.ok(fast.warnings.some((w) => /more than most spindles turn/.test(w)), fast.warnings.join(" | "));
});

test("feeds-mill: the mm screen explains itself in mm and m/min", () => {
  const out = run("feeds-mill", { woc: "1" }, "mm");
  const text = explainText(out);
  assert.match(text, /m\/min × 1000/);
  assert.match(text, /10 mm/);
  assert.match(text, /mm\/min/);
  assert.doesNotMatch(text, /0\.3937|SFM|IPM/);
  assert.match(text, new RegExp(`= ${fmt(out.primary.value, 1)} mm/min`));
});

// ── chip-thinning ──

// Sandvik Coromant: programmed fz = hex ÷ sin κr, κr from the work face. US "15° lead" = κr 75° → 1.035×.
test("chip-thinning: entering angle is from the work face and the label says so", () => {
  const input = getCalc("chip-thinning").inputs.find((i) => i.id === "lead");
  assert.match(input.label, /from the work face/);
  assert.match(input.hint, /90° = square shoulder/);
  const out = run("chip-thinning", { edge: "lead", lead: "75", woc: "2", chip: "0.006", diameter: "3" });
  near(out.primary.value, 0.006 * 1.0353, 0.000001);
  const steep = run("chip-thinning", { edge: "lead", lead: "15", woc: "2", diameter: "3" });
  assert.ok(steep.warnings.some((w) => /enter 75 instead/.test(w)), steep.warnings.join(" | "));
});

test("chip-thinning: a corner radius over half the tool is refused", () => {
  const { def, c, values } = build("chip-thinning", { edge: "corner", cornerR: "0.4", diameter: "0.5" });
  assert.throws(() => def.compute(values, c), /Corner radius can't be more than half the tool diameter/);
  run("chip-thinning", { edge: "corner", cornerR: "0.25", diameter: "0.5" }); // a ball is fine
});

test("chip-thinning: explain lines add up — no thinning past D/2, and a cap is shown as a cap", () => {
  const half = run("chip-thinning", { woc: "0.3" });
  assert.match(half.explain[0].plugged, /no radial thinning, factor = 1/);
  const light = run("chip-thinning", { woc: "0.005" });
  assert.match(light.explain[0].plugged, /= 5\.025, held at 2\.5/);
  const corner = run("chip-thinning", { edge: "corner", cornerR: "0.03", doc: "0.015", woc: "0.3" });
  assert.match(corner.explain[1].plugged, /= 60°.*= 1\.155/);
});

// Same fit as feeds-mill: 1/2 in, 600 SFM, hex 0.003 at ae 0.05 → fz 0.005; Bridgeport caps 4584 → 2720 RPM,
// then 2720 × 4 × 0.005 = 54.4 IPM is over 30, so the spindle drops to 30 ÷ 0.02 = 1500 RPM.
test("chip-thinning: fits the machine and holds the chip", () => {
  const out = run("chip-thinning", {}, "in", bridgeport);
  near(out.primary.value, 0.005, 1e-12);
  assert.equal(stat(out, /^Spindle/).value, 1500);
  near(stat(out, /^Feed at that chip load/).value, 30, 1e-9);
  assert.ok(out.warnings.some((w) => /Bridgeport/.test(w)));
  const fast = run("chip-thinning", { diameter: "0.125", sfm: "1000" });
  assert.ok(fast.warnings.some((w) => /more than most spindles turn/.test(w)), fast.warnings.join(" | "));
});

// A zero axial depth isn't a cut, and 1 ÷ sin 0° has no value: the field refuses 0 by name, and the
// explain never prints that division.
test("chip-thinning: corner mode refuses a 0 axial depth and never explains 1 ÷ sin 0°", () => {
  const { def, c, values, invalid, raw } = build("chip-thinning", { edge: "corner", doc: "0" });
  assert.ok(invalid.has("doc"));
  const input = def.inputs.find((i) => i.id === "doc");
  assert.match(invalidReason(input, values.doc, raw.doc, raw, "in"), /Axial depth of cut has to be more than zero/);
  const text = explainText(def.compute(values, c));
  assert.doesNotMatch(text, /sin 0°/);
  assert.match(text, /no axial depth given: factor = 1/);
  assert.equal(build("chip-thinning", { doc: "0" }).invalid.size, 0); // hidden outside corner mode
});

test("chip-thinning: mm explain lines carry mm", () => {
  const text = explainText(run("chip-thinning", { edge: "corner" }, "mm"));
  assert.match(text, /12 mm/);
  assert.match(text, /0\.8 mm/);
  assert.match(text, /mm\/min/);
  assert.doesNotMatch(text, /IPM|SFM/);
});

// ── ball-nose ──

// Effective diameter Deff = 2 √(D·ap − ap²) (Sandvik Coromant ball-nose): 1/2 ball at ap 0.05 → 0.3 in.
test("ball-nose: effective diameter and RPM there", () => {
  const out = run("ball-nose", { diameter: "0.5", depth: "0.05", sfm: "800" });
  near(stat(out, /Effective cutting/).value, 0.3, 1e-12);
  near(stat(out, /RPM at effective/).value, rpmAt(800, 0.3), 1e-6);
  assert.ok(stat(out, /full dia \(too slow\)/));
});

test("ball-nose: surface speed with no depth asks for the depth instead of doing nothing", () => {
  const out = run("ball-nose", { sfm: "800" });
  assert.ok(out.warnings.some((w) => /Axial depth of cut/.test(w)), out.warnings.join(" | "));
});

test("ball-nose: at depth ≥ R the full ball cuts — no 'too slow' row, explain says why", () => {
  const out = run("ball-nose", { diameter: "0.5", depth: "0.3", sfm: "800" });
  assert.equal(stat(out, /too slow/), undefined);
  assert.match(out.explain[1].plugged, /full ball cuts/);
});

// 1/8 ball, ap 0.003, 600 SFM wants 59,898 RPM; a 5140 RPM spindle reaches 5140·π·Deff/12 ≈ 51.5 SFM.
test("ball-nose: the machine caps the spindle and says what surface speed is left", () => {
  const out = run("ball-nose", { diameter: "0.125", depth: "0.003", sfm: "600" }, "in", tormach);
  const r = stat(out, /RPM at effective/);
  assert.equal(r.value, 5140);
  assert.equal(r.clamped, true);
  near(stat(out, /Surface speed reached/).value, 51.5, 0.1);
  // One cap line, in this tool's terms: ball-nose shows no feed, so nothing about "feed is figured at".
  const cap = out.warnings.filter((w) => /Tormach tops out at 5140 RPM/.test(w));
  assert.equal(cap.length, 1, out.warnings.join(" | "));
  assert.match(cap[0], /wants 59898/);
  assert.match(cap[0], /51 SFM at the 0\.0383 in cutting diameter/);
  assert.ok(!out.warnings.some((w) => /[Ff]eed/.test(w)), out.warnings.join(" | "));
  assert.match(cap[0], /Take a deeper pass/);
  // At ap ≥ R the full ball already cuts (Deff = D): a deeper pass can't raise the speed, so don't say so.
  const full = run("ball-nose", { diameter: "0.125", depth: "0.1", sfm: "600" }, "in", tormach);
  const fullCap = full.warnings.find((w) => /Tormach tops out at 5140 RPM/.test(w));
  assert.ok(fullCap, full.warnings.join(" | "));
  assert.doesNotMatch(fullCap, /deeper pass|tilt/);
  assert.match(fullCap, /full ball is already cutting/);
  const free =run("ball-nose", { diameter: "0.125", depth: "0.003", sfm: "600" });
  assert.ok(free.warnings.some((w) => /more than most spindles turn/.test(w)));
});

// ── circle-interp ──

// Outside circle Fc = F × (Df + Dt) ÷ Df: 100 IPM, 0.5 tool, 0.5 boss → 200 IPM, over a 110 IPM machine.
test("circle-interp: a tool-center feed over the machine max is capped with a spindle fix", () => {
  const out = run("circle-interp", { feed: "100", tool: "0.5", feature: "0.5", side: "external" }, "in", tormach);
  assert.equal(out.primary.value, 110);
  assert.equal(out.primary.clamped, true);
  near(out.stats[0].value, 55, 1e-9);
  assert.ok(out.warnings.some((w) => /Tormach max feed is 110 IPM/.test(w) && /55%/.test(w)), out.warnings.join(" | "));
  const ok = run("circle-interp", {}, "in", tormach);
  assert.equal(ok.primary.clamped, false);
  near(ok.primary.value, 20, 1e-9);
});

// ── machine fit and units (round 2) ──

// 3/8 in, 1000 SFM wants 10186 RPM; 0.004 in/tooth thinned at 0.05 in WOC (×1.471) is 0.0235 in/rev on
// 4 flutes, 64 IPM at 2720 RPM, so the spindle drops to floor(30 ÷ 0.02353) = 1274 RPM.
test("feeds-mill on a Bridgeport, both caps hit: the warnings don't contradict each other", () => {
  const out = run("feeds-mill", { diameter: "0.375", sfm: "1000", chip: "0.004", woc: "0.05" }, "in", bridgeport);
  const text = out.warnings.join(" | ");
  assert.match(text, /Bridgeport tops out at 2720 RPM\. Wanted 10186\./);
  assert.match(text, /drops to 1274 RPM/);
  assert.doesNotMatch(text, /figured at 2720 RPM/);
  assert.equal(stat(out, /^Spindle/).value, 1274);
});

test("feeds-mill: a cut no whole RPM can feed says so instead of 0 RPM", () => {
  const tiny = { name: "Tiny", type: "mill", maxRpm: 1, maxFeed: 1, units: "in" };
  const { def, c, values } = build("feeds-mill", { chip: "0.5" }, "in", tiny);
  assert.throws(() => def.compute(values, c), /Tiny max feed is 1 IPM, less than one turn at 2 IPR\. Check the chip load and flutes, or the max feed in Shop\./);
  const mm = build("feeds-mill", { chip: "12.7" }, "mm", tiny);
  assert.throws(() => mm.def.compute(mm.values, mm.c), /Tiny max feed is 25\.4 mm\/min, less than one turn at 50\.8 mm\/rev/);
});

test("feeds-mill: the hard-material caution reads in the units on screen only", () => {
  const inch = run("feeds-mill", { material: "tHard55", toolType: "carbide" }, "in").warnings.join(" ");
  const mm = run("feeds-mill", { material: "tHard55", toolType: "carbide" }, "mm").warnings.join(" ");
  assert.match(inch, /SFM/);
  assert.doesNotMatch(inch, /m\/min|mm\/rev/);
  assert.match(mm, /m\/min/);
  assert.doesNotMatch(mm, /\bSFM\b|\bIPR\b/);
});

// The full-slot line is at 95% of the tool: 9.5 mm on a 10 mm tool sits on it in mm, the same as 0.35625 in
// on a 3/8 in tool; the inch ⇄ mm round trip must not drop it on one side.
test("feeds-mill: the full-slot warning lands the same at the line in inch and mm", () => {
  const slot = /Full-width slot/;
  // 26.25 / 24.9375 mm and the others: (24.9375 ÷ 25.4) < (26.25 ÷ 25.4) × 0.95 by float noise alone
  for (const d of [2, 10, 12, 26.25, 35.75, 38.75, 40.25]) {
    const out = run("feeds-mill", { diameter: String(d), woc: String(+(d * 0.95).toFixed(6)) }, "mm");
    assert.ok(out.warnings.some((w) => slot.test(w)), `${d} mm tool at 95% WOC`);
  }
  assert.ok(run("feeds-mill", { diameter: "0.375", woc: "0.35625" }, "in").warnings.some((w) => slot.test(w)));
  assert.ok(!run("feeds-mill", { diameter: "10", woc: "9.4" }, "mm").warnings.some((w) => slot.test(w)));
});

test("circle-interp: the tool-center feed is held to the machine's max feed in mm too", () => {
  // 1000 mm/min edge feed, 25 mm boss, 12 mm tool outside: 1000 × 37 ÷ 25 = 1480 mm/min; a 30 IPM (762 mm/min) mill caps it
  const out = run("circle-interp", { side: "external" }, "mm", bridgeport);
  assert.equal(out.primary.clamped, true);
  near(out.primary.value, 762, 1e-9);
  assert.match(out.warnings[0], /Bridgeport max feed is 762 mm\/min; this circle needs 1480 mm\/min/);
});

// ── fix round 3 ──

// fitToMachine's contract (_machine.js): when one turn moves more than the machine's whole max feed, the tool
// shows the reason, not 0 RPM / 0 IPM. Tiny (1 RPM / 1 IPM, the least the Shop form takes) at a 0.5 in chip:
// 4 flutes × 0.5 × 1.667 thinning = 3.33 in per turn. The Bridgeport needs a 5 in chip to get there.
test("chip-thinning: a cut no whole RPM can feed says so instead of 0 RPM", () => {
  const tiny = { name: "Tiny", type: "mill", maxRpm: 1, maxFeed: 1, units: "in" };
  const inch = build("chip-thinning", { chip: "0.5" }, "in", tiny);
  assert.throws(() => inch.def.compute(inch.values, inch.c), /Tiny max feed is 1 IPM, less than one turn at 3\.3333 IPR\. Check the chip thickness and flutes/);
  const mm = build("chip-thinning", { chip: "12.7" }, "mm", tiny);
  assert.throws(() => mm.def.compute(mm.values, mm.c), /Tiny max feed is 25\.4 mm\/min, less than one turn at [\d.]+ mm\/rev/);
  const bp = build("chip-thinning", { chip: "5" }, "in", bridgeport);
  assert.throws(() => bp.def.compute(bp.values, bp.c), /less than one turn/);
  assert.ok(stat(run("chip-thinning", {}, "in", bridgeport), /^Spindle/).value > 0, "a real cut still runs");
});

// The heavy-chip warning names the tool at the size typed (lengths to 4 places in inch, 3 in mm), not rounded
// to 0.3 mm or 0.016 in: micro end mills are a supported case.
test("feeds-mill: the heavy-chip warning names a micro tool at its real size", () => {
  const mm = run("feeds-mill", { diameter: "0.25", chip: "0.05" }, "mm").warnings.join(" | ");
  assert.match(mm, /very heavy chip for a 0\.25 mm tool/);
  const inch = run("feeds-mill", { diameter: "0.0156", chip: "0.002" }, "in").warnings.join(" | ");
  assert.match(inch, /very heavy chip for a 0\.0156 in tool/);
  assert.match(run("feeds-mill", { diameter: "0.125" }, "mm").historyLabel, /^0\.125 mm/);
});
