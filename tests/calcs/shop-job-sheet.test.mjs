// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Job sheet: the machine for the work, the cut fitted inside it, and every number on the sheet describing
// that fitted cut (feed, chip load, time, price), in the units on screen.

import test from "node:test";
import assert from "node:assert/strict";
import jobSheet, { LATHE_ROUGH_IPR } from "../../src/calcs/job-sheet.js";
import latheFeeds from "../../src/calcs/lathe-feeds.js";
import { buildValues, defaultRaw, measureOf, labelOf, convertInput } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { near } from "../helpers.mjs";

const ctx = (units = "in", machine = null, pro = true) => ({ units, L: UNIT_LABEL[units], settings: { units, pro }, machine, fmt });
const run = (over, c = ctx()) => jobSheet.compute(buildValues(jobSheet, defaultRaw(jobSheet, over, c.units), c).values, c);
const stat = (out, re) => out.stats.find((s) => re.test(s.label));

test("lathe: time per pass is length ÷ the feed the machine will run (T = L ÷ (f × N), Machinery's Handbook)", () => {
  // 10 in at a 5 IPM machine max feed = 2.0 min = 120 s per pass (verifier's case, 0.010 in/rev typed)
  const lathe = { name: "Lathe 10", type: "lathe", maxRpm: 4000, maxFeed: 5, units: "in" };
  const out = run({ op: "lathe", material: "al6061", diameter: "1", length: "10", chip: "0.010" }, ctx("in", lathe));
  assert.ok(out.primary.value <= 5 + 1e-9);
  near(stat(out, /Time per pass/).value, 10 / out.primary.value * 60, 1e-9, "time per pass = L / F");
  near(stat(out, /Time per pass/).value, 120, 0.01, "120 s at 5 IPM");
  near(stat(out, /Feed per rev/).value, 0.010, 1e-12, "feed per rev holds; the spindle slows instead");
  assert.equal(stat(out, /^Spindle/).value, 500);
  assert.equal(stat(out, /^Spindle/).clamped, true);
  // 500 RPM is far under the 4000 RPM max: the label says why it dropped, not "machine max"
  assert.equal(stat(out, /^Spindle/).label, "Spindle (slowed for max feed)");
  assert.ok(out.warnings.some((w) => /Lathe 10 max feed is 5 IPM/.test(w)), "says the max feed slowed the spindle");
});

test("mill: a feed cap slows the spindle and the chip load on the sheet is the one programmed (F = N × z × fz)", () => {
  const bridgeport = { name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, units: "in" };
  const out = run({ op: "mill", material: "al6061", diameter: "0.5", flutes: "4", woc: "0.05", length: "6", qty: "10", rate: "92.50" }, ctx("in", bridgeport));
  const rpm = stat(out, /^Spindle/).value, chip = stat(out, /Chip load programmed/).value;
  assert.ok(out.primary.value <= 30 + 1e-9);
  near(out.primary.value, rpm * 4 * chip, 1e-9, "feed = RPM × flutes × chip load programmed");
  near(stat(out, /Time per pass/).value, 6 / out.primary.value * 60, 1e-9);
  assert.equal(out.primary.clamped, true);
  // both caps hit (RPM to 2720, then the 30 IPM feed slows it further): the label names the feed, as feeds-mill does
  assert.ok(rpm < 2720, "slowed below the RPM cap");
  assert.equal(stat(out, /^Spindle/).label, "Spindle (slowed for max feed)");
  assert.ok(out.warnings.some((w) => /Bridgeport max feed is 30 IPM/.test(w)));
  // money reads as money, and the rate as typed
  const rows = out.tables[0].rows;
  assert.equal(rows[1].k, "At $92.50/hr");
  assert.match(rows[1].v, /^\$\d{1,3}(,\d{3})*\.\d{2}$/);
});

test("mill: the thinned value is labeled 'Chip load programmed' (Sandvik fz = hex × D ÷ (2√(ae (D − ae))))", () => {
  // D 0.5, ae 0.05, hex 0.003 → fz = 0.003 × 0.5 ÷ (2 × √(0.05 × 0.45)) = 0.0050 in
  const out = run({ op: "mill", material: "al6061", diameter: "0.5", flutes: "4", woc: "0.05", chip: "0.003" });
  near(stat(out, /Chip load programmed/).value, 0.005, 1e-6);
  near(stat(out, /Chip thinning factor/).value, 5 / 3, 1e-9);
  assert.ok(!out.stats.some((s) => s.label === "Chip load per tooth"), "the input's words aren't reused for the thinned value");
  const mm = run({ op: "mill", material: "al6061", diameter: "12", flutes: "4" }, ctx("mm"));
  assert.equal(stat(mm, /Chip load programmed/).places, 3);
});

test("a lathe profile never caps an end mill, a mill profile never caps a lathe; drilling takes either", () => {
  const lathe = { name: "Lathe 10", type: "lathe", maxRpm: 4000, maxFeed: 20, units: "in" };
  const mill = { name: "VF-2", type: "mill", maxRpm: 1000, maxFeed: 20, units: "in" };
  const m = run({ op: "mill", material: "al6061", diameter: "0.25" }, ctx("in", lathe));
  assert.equal(stat(m, /^Spindle/).clamped, false);
  assert.match(stat(m, /Machine/).text, /Lathe 10 is a lathe, not used for end milling/);
  const l = run({ op: "lathe", material: "s1018", diameter: "2" }, ctx("in", mill));
  assert.equal(stat(l, /^Spindle/).clamped, false);
  const d = run({ op: "drill", material: "al6061", diameter: "0.25" }, ctx("in", mill));
  assert.equal(stat(d, /^Spindle/).value, 1000, "drilling on the mill is capped by it");
  assert.equal(stat(d, /^Spindle/).label, "Spindle (machine max)", "RPM cap only: the spindle is at the machine max");
});

test("no machine: drill and lathe warn about spindle speeds most machines can't reach", () => {
  const d = run({ op: "drill", material: "al6061", toolType: "carbide", diameter: "0.0625" });
  assert.ok(stat(d, /^Spindle/).value > 20000);
  assert.ok(d.warnings.some((w) => /more than most spindles turn/.test(w)));
  const l = run({ op: "lathe", material: "al6061", diameter: "0.25" });
  assert.ok(l.warnings.some((w) => /more than most lathes turn/.test(w)));
  const lMm = run({ op: "lathe", material: "al6061", diameter: "6" }, ctx("mm"));
  assert.ok(lMm.warnings.some((w) => /more than most lathes turn/.test(w)));
});

test("Machine stat says 'no RPM limit' instead of a dash, and shows the feed limit in the units on screen", () => {
  const out = run({ op: "mill", material: "al6061", diameter: "0.5" }, ctx("mm", { name: "Bridgeport", type: "mill", maxRpm: 0, maxFeed: 30, units: "in" }));
  assert.equal(stat(out, /Machine/).text, "Bridgeport · no RPM limit · max 762 mm/min");
});

test("free users are told Shop is Pro before the tap", () => {
  const out = run({ op: "mill" }, ctx("in", null, false));
  assert.equal(stat(out, /Machine/).text, "none set (Shop, Pro)");
  assert.ok(out.next.some((n) => n.href === "#/shop" && /\(Pro\)/.test(n.get)));
  const pro = run({ op: "mill" }, ctx("in", null, true));
  assert.ok(pro.next.some((n) => n.href === "#/shop" && !/\(Pro\)/.test(n.get)));
});

test("the override field is a chip load (length) on the mill and a feed per rev (IPR / mm/rev) on the drill and lathe", () => {
  const chip = jobSheet.inputs.find((i) => i.id === "chip");
  assert.equal(measureOf(chip, { op: "mill" }), "length");
  assert.equal(measureOf(chip, { op: "lathe" }), "feedRev");
  assert.equal(measureOf(chip, { op: "drill" }), "feedRev");
  assert.equal(labelOf(chip, { op: "mill" }), "Chip load per tooth");
  assert.equal(labelOf(chip, { op: "drill" }), "Feed per rev");
  // a feed per rev keeps its feed-per-rev places on a unit switch: 0.05 mm/rev = 0.00197 in/rev, not the 4-place 0.002
  const ipr = Number(convertInput(chip, "0.05", "mm", "in", { op: "lathe" }));
  near(ipr, 0.05 / 25.4, 5e-6);
});

test("lathe blank feed is the roughing feed Speeds & feeds — lathe uses (0.012 in/rev, Machinery's Handbook turning tables)", () => {
  assert.equal(LATHE_ROUGH_IPR, 0.012);
  const out = run({ op: "lathe", material: "s1018", diameter: "2" });
  near(stat(out, /Feed per rev/).value, 0.012, 1e-12);
  const lf = latheFeeds.inputs.find((i) => i.id === "ipr");
  near(lf.auto({ cut: "rough" }, ctx()), LATHE_ROUGH_IPR, 1e-12, "same as lathe-feeds rough");
  const mm = run({ op: "lathe", material: "s1018", diameter: "50" }, ctx("mm"));
  near(stat(mm, /Feed per rev/).value, 0.3048, 1e-9);
});

test("mm mode: the explain lines are written in m/min, mm and mm/min", () => {
  const out = run({ op: "mill", material: "al6061", diameter: "12", flutes: "4", woc: "1" }, ctx("mm"));
  const text = out.explain.map((e) => `${e.formula} ${e.plugged}`).join(" | ");
  assert.match(text, /m\/min × 1000/);
  assert.match(text, /12 mm\)/);
  assert.match(text, /mm\/min/);
  assert.doesNotMatch(text, /IPM|SFM|× 12\)|0\.4724/);
  // the feed line ends on the number in the answer bar
  assert.ok(out.explain[1].plugged.endsWith(`${fmt(out.primary.value, 1)} mm/min`));
});

// ── round 2: turning speed, hard turning feed, machine that can't run the cut, family-scale drill feeds ──
import { materialSpeeds as speeds2, materialById as byId2, toolCaution as caution2 } from "../../src/data/materials-library.js";
import { drillFeedPerRev as dfr2 } from "../../src/calcs/feeds-drill.js";
import { drillFeedFactor, latheFeedIpr } from "../../src/calcs/_advice.js";

test("lathe: the sheet turns at the library turning speed and takes the same blank feed as Speeds & feeds — lathe", () => {
  const ipr = latheFeeds.inputs.find((i) => i.id === "ipr");
  for (const [material, toolType] of [["s1018", "carbide"], ["tHard55", "coated"], ["tHard45", "carbide"], ["al6061", "hss"]]) {
    const out = run({ op: "lathe", material, toolType, diameter: "2" });
    // 2 in part: surface speed used = the turning speed (RPM from SFM and back)
    near(stat(out, /Surface speed used/).value, speeds2(material, toolType).turnSfm, 1e-9, `${material} ${toolType}`);
    near(stat(out, /Feed per rev/).value, ipr.auto({ material, cut: "rough" }, ctx()), 1e-12, `${material}: same blank feed`);
  }
  // hardened 55–60 HRC: 0.004 in/rev = 0.10 mm/rev, inside the published 0.05–0.15 mm/rev (Tungaloy hard turning)
  near(stat(run({ op: "lathe", material: "tHard55", diameter: "2" }), /Feed per rev/).value, 0.004, 1e-12);
  near(latheFeedIpr("tHard55", "finish"), 0.002, 1e-12);
  near(latheFeedIpr("s1018", "finish"), 0.004, 1e-12);
  assert.ok(byId2("tHard55").hrc >= 45 && byId2("ss174h").hrc < 45);
});

test("a feed per rev the machine can't move once per minute is a plain message, not 0 RPM", () => {
  const lathe = { name: "Lathe 5", type: "lathe", maxRpm: 2000, maxFeed: 5, units: "in" };
  const c = ctx("in", lathe);
  const values = buildValues(jobSheet, defaultRaw(jobSheet, { op: "lathe", chip: "7", length: "4" }, "in"), c).values;
  assert.throws(() => jobSheet.compute(values, c), /Lathe 5 max feed is 5 IPM, less than one turn at 7 IPR\. Check the feed per rev, or the max feed in Shop\./);
});

test("the hard-material caution on the sheet is in the units on screen", () => {
  for (const units of ["in", "mm"]) {
    const out = run({ op: "mill", material: "tHard55", toolType: "carbide" }, ctx(units));
    assert.ok(out.warnings.includes(caution2("tHard55", "carbide", units)), units);
  }
});

// Drill feed factor: the AISI scale (B1112 = 100%) for steels; aluminum, magnesium, zinc and plastics are ranked
// in their own family and all cut far easier than B1112, so they take the top 1.25×; C360 brass (copper scale 100)
// too. Before, 6061 (90 in its family) read as 90% of B1112: 0.95×, about 24% low.
test("drill feed factor reads each family's rating on its own scale", () => {
  near(drillFeedFactor(speeds2("s1018").material), 0.5 + 78 / 200, 1e-12, "1018 on B1112");
  near(drillFeedFactor(78), 0.89, 1e-12, "a bare rating is still B1112 %");
  for (const id of ["al6061", "al7075", "mgAZ31", "znZamak3", "pAcetal", "c360", "c353", "c544"]) near(drillFeedFactor(speeds2(id).material), 1.25, 1e-12, id);
  near(drillFeedFactor(speeds2("c110").material), 0.6, 1e-12, "gummy pure copper stays conservative");
  near(drillFeedFactor(speeds2("ni718").material), 0.55, 1e-12);
  const out = run({ op: "drill", material: "al6061", diameter: "0.25" });
  near(stat(out, /Feed per rev/).value, dfr2(0.25) * 1.25, 1e-12, "the sheet's aluminum drill feed");
});

test("drilling to exactly 3× diameter is not a peck hole in mm either (no float noise past the line)", () => {
  // 0.25 in drill 0.75 in deep = 3.0×; 4 mm drill 12 mm deep = 3.0× too, which the inch round trip made 3.0000000000000004
  const peck = (out) => out.warnings.some((w) => /peck/.test(w));
  assert.equal(peck(run({ op: "drill", diameter: "0.25", depth: "0.75" })), false);
  for (const [d, depth] of [["4", "12"], ["1", "3"], ["5.5", "16.5"]]) assert.equal(peck(run({ op: "drill", diameter: d, depth }, ctx("mm"))), false, `${d} mm × ${depth} mm`);
  // exactly 5× and 8× stay in the band below: the plain peck line, then the 20% line
  const said = (d, depth) => run({ op: "drill", diameter: d, depth }, ctx("mm")).warnings.find((w) => /peck/.test(w));
  assert.match(said("2", "10"), /^5× diameter deep: peck \(G83\) to clear the chips\.$/);
  assert.match(said("2", "16"), /about 20%/);
  assert.equal(peck(run({ op: "drill", diameter: "4", depth: "12.1" }, ctx("mm"))), true);
});
