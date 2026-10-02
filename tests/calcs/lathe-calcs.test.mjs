// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe tools as a user meets them: the Shop machine applied the same way as the other speeds & feeds tools,
// G50 left as the user's clamp, Ra read and shown in µm on a metric screen, and every number on a metric
// screen in metric units.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/lathe-feeds.js";
import "../../src/calcs/lathe-cycle.js";
import "../../src/calcs/surface-finish.js";
import "../../src/calcs/taper.js";
import "../../src/calcs/tnr-comp.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw, convertInput } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";
import { toolCaution } from "../../src/data/materials-library.js";
import { meetsCallout } from "../../src/calcs/surface-finish.js";
import { near } from "../helpers.mjs";

const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id), ctx = { units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt };
  const built = buildValues(def, defaultRaw(def, over, units), ctx);
  assert.equal(built.invalid.size, 0, `${id}: ${[...built.invalid].join(",")}`);
  return def.compute(built.values, ctx);
};
const stat = (out, re) => out.stats.find((s) => re.test(s.label));
const ST10 = { name: "ST-10", type: "lathe", maxRpm: 4000, units: "in" };

// Turning time Tc = lm ÷ (fn × n) (Sandvik Coromant turning formulas; Machinery's Handbook "Estimating
// Machining Time"). 0.5 in at 800 SFM wants 12 × 800 ÷ (π × 0.5) = 6112 RPM; a 4000 RPM lathe runs 4000,
// so 4 in at 0.010 IPR takes 4 ÷ (0.010 × 4000) = 0.100 min = 6.0 s.
test("lathe cycle: G96 turning is timed at the machine's top speed when the machine can't reach it", () => {
  const out = run("lathe-cycle", { od: "0.5", sfm: "800" }, "in", ST10);
  near(stat(out, /Per pass/).value, 6.0, 1e-9);
  assert.equal(stat(out, /Spindle/).value, 4000);
  assert.equal(stat(out, /Spindle/).clamped, true);
  assert.match(out.warnings.join(" "), /ST-10 tops out at 4000/);
  // a mill profile never limits a lathe
  near(stat(run("lathe-cycle", { od: "0.5", sfm: "800" }, "in", { ...ST10, type: "mill" }), /Spindle/).value, 12 * 800 / (Math.PI * 0.5), 1e-6);
  // the G50 typed in is the user's clamp: below the machine it holds and isn't flagged, above it the machine wins
  const g50 = run("lathe-cycle", { od: "0.5", sfm: "800", maxRpm: "3000" }, "in", ST10);
  assert.equal(stat(g50, /Spindle/).value, 3000);
  assert.equal(stat(g50, /Spindle/).clamped, false);
  assert.equal(stat(run("lathe-cycle", { od: "0.5", sfm: "800", maxRpm: "5000" }, "in", ST10), /Spindle/).value, 4000);
  // the machine's top feed slows the spindle so feed per rev holds: 5 IPM ÷ 0.010 IPR = 500 RPM → 4 ÷ 5 = 0.8 min
  const slow = run("lathe-cycle", {}, "in", { ...ST10, maxFeed: 5 });
  assert.equal(stat(slow, /Spindle/).value, 500);
  near(stat(slow, /Per pass/).value, 48, 1e-9);
});

test("lathe cycle: no machine and a spindle speed no lathe turns gets a warning", () => {
  const out = run("lathe-cycle", { od: "0.1", sfm: "800" });
  assert.match(out.warnings.join(" "), /30558 RPM is more than most lathes turn/);
  assert.equal(run("lathe-cycle", {}).warnings.length, 0);
});

// Facing under G96 (Machinery's Handbook facing time, ∫ 2πr dr ÷ (12 SFM f)): CSS from D down to the
// diameter where the spindle tops out, Dcap = 12 SFM ÷ (π Nmax), then constant Nmax to center.
// 2 in face, 400 SFM, 0.010 IPR, 4000 RPM top: Dcap = 0.38197 in,
// t = π (2² − 0.38197²) ÷ (48 × 400 × 0.010) + (0.38197 ÷ 2) ÷ (0.010 × 4000) = 0.063064 + 0.004775 = 0.067839 min.
test("lathe cycle: facing to center under G96 tops out at the machine's speed, and says so", () => {
  const out = run("lathe-cycle", { op: "face" }, "in", ST10);
  near(stat(out, /Per pass/).value, 0.067839 * 60, 0.001);
  assert.equal(stat(out, /tops out/).value, 4000);
  assert.match(out.warnings.join(" "), /ST-10's top of 4000 RPM/);
  assert.doesNotMatch(out.warnings.join(" "), /infinite/);
  // no machine and no G50: the spindle would run away at center
  assert.match(run("lathe-cycle", { op: "face" }).warnings.join(" "), /infinite at center/);
  // a groove never reaches center, so it never runs away
  assert.doesNotMatch(run("lathe-cycle", { op: "groove" }).warnings.join(" "), /infinite/);
});

// When the machine's top feed is the limit, the spindle can't pass maxFeed ÷ f: 200 IPM ÷ 0.2 IPR = 1000 RPM
// on a 4000 RPM lathe. The warning has to name the feed limit, not call 1000 RPM the machine's top speed.
test("lathe cycle: facing under G96 on a feed-bound machine names the max feed as the limit", () => {
  const out = run("lathe-cycle", { op: "face", ipr: "0.2" }, "in", { ...ST10, maxFeed: 200 });
  const w = out.warnings.join(" ");
  assert.equal(stat(out, /tops out/).value, 1000);
  assert.match(w, /Figured at 1000 RPM, where ST-10's max feed of 200 IPM is reached/);
  assert.doesNotMatch(w, /top of 1000 RPM/);
  // same machine saved in mm (5080 mm/min = 200 IPM) on a metric screen: 5080 ÷ 5.08 mm/rev = 1000 RPM
  const mm = run("lathe-cycle", { op: "face", ipr: "5.08" }, "mm", { ...ST10, maxFeed: 5080, units: "mm" });
  assert.match(mm.warnings.join(" "), /Figured at 1000 RPM, where ST-10's max feed of 5080 mm\/min is reached/);
  // when max RPM is the lower limit the speed wording stays
  assert.match(run("lathe-cycle", { op: "face" }, "in", { ...ST10, maxFeed: 200 }).warnings.join(" "), /ST-10's top of 4000 RPM/);
});

// Same cut in metric: t = π (D² − d²) ÷ (4000 × Vc × f), D in mm, Vc in m/min, f in mm/rev.
test("lathe cycle in mm: explain lines are in mm, m/min and mm/rev", () => {
  const face = run("lathe-cycle", { op: "face" }, "mm");
  assert.match(face.explain[0].formula, /4000 × m\/min/);
  assert.match(face.explain[0].plugged, /\(50 mm\)² .* 120 m\/min × 0\.25 mm\/rev/);
  near(stat(face, /Per pass/).value, Math.PI * 50 ** 2 / (4000 * 120 * 0.25) * 60, 0.01);
  assert.match(run("lathe-cycle", {}, "mm").explain[0].plugged, /100 mm ÷ \(0\.25 mm\/rev × 764 RPM\)/);
  assert.match(run("lathe-cycle", { op: "face", maxRpm: "2000" }, "mm").explain[0].plugged, /Dcap = 19\.099 mm at 2000 RPM/);
});

test("lathe feeds: G50 is a job cap, not the machine's top speed", () => {
  // 2 in 1018, coated, rough: 1146 RPM → G50 1200, with or without a 6000 RPM lathe set
  assert.equal(stat(run("lathe-feeds"), /G50/).value, 1200);
  assert.equal(stat(run("lathe-feeds", {}, "in", { ...ST10, maxRpm: 6000 }), /G50/).value, 1200);
  // facing down to 0.5 in raises the cap to the speed G96 needs there, but never past the machine
  assert.equal(stat(run("lathe-feeds", { minDia: "0.5" }), /G50/).value, 4600);
  const capped = stat(run("lathe-feeds", { minDia: "0.5" }, "in", ST10), /G50/);
  assert.equal(capped.value, 4000);
  assert.equal(capped.clamped, true);
});

test("lathe feeds: machine caps RPM, then feed, and the stats describe the cut that runs", () => {
  const out = run("lathe-feeds", { diameter: "0.5" }, "in", ST10);
  assert.equal(out.primary.value, 4000);
  assert.equal(out.primary.clamped, true);
  near(stat(out, /^Feed/).value, 4000 * 0.012, 1e-9);
  assert.ok(stat(out, /Actual surface speed/));
  // 5 IPM top feed at 0.012 IPR: the spindle slows to 416 RPM, feed per rev holds
  const slow = run("lathe-feeds", {}, "in", { ...ST10, maxFeed: 5 });
  assert.equal(slow.primary.value, 416);
  assert.equal(stat(slow, /^Feed/).clamped, true);
  near(stat(slow, /^Feed/).value, 416 * 0.012, 1e-9);
  assert.equal(stat(slow, /G50/).value, 416);
});

test("lathe feeds: no machine and a speed beyond any lathe — warn, and never hand over a six-figure G50", () => {
  const out = run("lathe-feeds", { diameter: "0.1" });
  assert.match(out.warnings.join(" "), /more than most lathes turn/);
  const g50 = stat(out, /G50/);
  assert.equal(g50.value, undefined);
  assert.match(g50.text, /chuck/);
  // the cut itself is fine but facing toward center would need a wild G50
  const face = run("lathe-feeds", { minDia: "0.05" });
  assert.match(face.warnings.join(" "), /Set G50 to your chuck's rated max/);
});

test("lathe feeds: a tool caution for the material reaches the warnings", () => {
  for (const material of ["s1018", "tHard55", "ti64", "ni718", "al6061"]) {
    for (const toolType of ["hss", "carbide", "coated"]) {
      const caution = toolCaution(material, toolType);
      if (caution) assert.ok(run("lathe-feeds", { material, toolType }).warnings.includes(caution), `${material} ${toolType}`);
    }
  }
});

// Ra ≈ f² ÷ (31.2 r) (Machinery's Handbook, surface finish from feed and nose radius). A drawing callout of
// Ra 1.6 µm with a 1/32 in (0.79375 mm) nose: f = √(31.2 × 0.79375 × 0.0016) = 0.1991 mm/rev.
test("surface finish in mm takes and gives Ra in µm", () => {
  const feed = run("surface-finish", { mode: "feed", ra: "1.6" }, "mm");
  near(feed.primary.value, 0.1991, 0.0001);
  assert.equal(feed.primary.unit, "mm/rev");
  assert.match(feed.primary.label, /1\.6 µm/);
  const fin = run("surface-finish", {}, "mm");
  assert.equal(fin.primary.unit, "µm");
  // 0.12 mm/rev, 0.79375 mm nose: Ra = 0.12² ÷ (31.2 × 0.79375) mm = 0.581 µm → passes a 0.8 µm callout
  near(fin.primary.value, 0.12 ** 2 / (31.2 * 0.79375) * 1000, 1e-9);
  assert.equal(stat(fin, /callout/).text, "0.8 µm");
  assert.match(fin.historyLabel, /mm\/rev/);
  assert.doesNotMatch(fin.historyLabel, /ipr/i);
  // a unit switch keeps the same finish: 1 µin = 0.0254 µm
  const ra = getCalc("surface-finish").inputs.find((i) => i.id === "ra");
  assert.equal(convertInput(ra, "32", "in", "mm"), "0.813");
  assert.equal(convertInput(ra, "0.8", "mm", "in"), "31.5");
  assert.equal(ra.unit("mm"), "µm");
});

// Standard callouts (ASME B46.1 µin / ISO 1302 N-grades µm): the part has to come in at or under the callout.
test("surface finish picks the callout the part meets, not the nearest one", () => {
  assert.equal(meetsCallout(65.7, "in"), "125 µin");
  assert.equal(meetsCallout(22.9, "in"), "32 µin");
  assert.equal(meetsCallout(32, "in"), "32 µin");
  assert.equal(meetsCallout(1.0, "mm"), "1.6 µm");
  assert.equal(meetsCallout(1.6, "mm"), "1.6 µm");
  assert.match(meetsCallout(2500, "in"), /rougher than 2000 µin/);
  // 0.005 IPR, 1/32 nose: Ra = 25.6 µin → 32 µin
  assert.equal(stat(run("surface-finish"), /callout/).text, "32 µin");
});

// ASME B46.1 lists 0.5 µin among its preferred Ra values: the label has to show the target that was used,
// not a whole-µin rounding of it. f = √(31.2 × 0.03125 in × 0.5e-6 in) = 0.000698 in/rev.
test("surface finish shows a fractional µin target as typed", () => {
  const half = run("surface-finish", { mode: "feed", ra: "0.5" });
  near(half.primary.value, Math.sqrt(31.2 * 0.03125 * 0.5e-6), 1e-9);
  assert.equal(half.primary.label, "Max feed for Ra 0.5 µin");
  assert.match(half.historyLabel, /^Ra 0\.5 µin · /);
  assert.equal(run("surface-finish", { mode: "feed", ra: "32" }).primary.label, "Max feed for Ra 32 µin");
  assert.equal(run("surface-finish", { mode: "feed", ra: "1.6" }, "mm").primary.label, "Max feed for Ra 1.6 µm");
});

// Finishing feeds run at about half the nose radius or less (Sandvik); the cusp formula breaks down past r.
test("surface finish warns when the feed per rev passes the nose radius", () => {
  assert.equal(run("surface-finish", { ipr: "0.015" }).warnings.length, 0);
  assert.match(run("surface-finish", { ipr: "0.04" }).warnings.join(" "), /more than the nose radius/);
  assert.match(run("surface-finish", { ipr: "0.07" }).warnings.join(" "), /twice the nose radius/);
  assert.match(run("surface-finish", { mode: "feed", ra: "1500" }).warnings.join(" "), /past the nose radius/);
});

// Jacobs JT6: large end 0.6760, small end 0.6241, length 1.00, taper per foot 0.6229; JT33 TPF 0.7619
// (littlemachineshop.com, Dimensions of Standard Tapers).
test("taper note gives the published Jacobs taper per foot", () => {
  const note = run("taper").notes.join(" ");
  assert.match(note, /JT6 = 0\.6229 in\/ft/);
  assert.match(note, /JT33 = 0\.7619 in\/ft/);
  assert.doesNotMatch(note, /0\.6761/);
  // the same tapers as a ratio on diameter on a metric screen: 12 ÷ 0.6229 = 19.26
  assert.match(run("taper", {}, "mm").notes.join(" "), /JT6 = 1 : 19\.26/);
});

test("on a metric screen every lathe number is metric", () => {
  // a number with an inch unit ("3000 RPM — put a G50 in the program" is a word, not a unit)
  const inchy = /\d\s?(in\b(?! the| a )|in\/ft|µin)|\b(IPM|IPR|SFM|ipr)\b/;
  const cases = [
    ["lathe-feeds", {}], ["lathe-feeds", { diameter: "2", minDia: "1" }],
    ["lathe-cycle", {}], ["lathe-cycle", { op: "face" }], ["lathe-cycle", { op: "face", maxRpm: "2000" }], ["lathe-cycle", { op: "groove" }], ["lathe-cycle", { speedMode: "rpm", op: "cutoff" }],
    ["surface-finish", {}], ["surface-finish", { mode: "feed" }],
    ["taper", {}],
    ["tnr-comp", {}], ["tnr-comp", { side: "id" }], ["tnr-comp", { feature: "radius" }], ["tnr-comp", { feature: "radius", convex: "concave" }],
  ];
  for (const [id, over] of cases) {
    const out = run(id, over, "mm", { ...ST10, maxRpm: 3000 });
    const shown = JSON.stringify({ ...out, code: (out.code || []).map((b) => b.title) });
    assert.doesNotMatch(shown, inchy, `${id} ${JSON.stringify(over)}: ${shown.match(inchy)?.[0]}`);
  }
});
