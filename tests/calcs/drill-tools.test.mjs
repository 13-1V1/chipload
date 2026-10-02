// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The drill and tap tools the way people run them (feeds-drill, tapping-feed, thread-mill, tap-drill,
// center-drill, ream, sti, acme, npt): published values through compute(), the Shop machine fit, impossible
// inputs, and mm screens that read in mm.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import "../../src/calcs/index.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { drillFeedPerRev } from "../../src/calcs/feeds-drill.js";
import { reamAllowanceOnDia } from "../../src/calcs/ream.js";
import { NPT_TABLE } from "../../src/data/npt.js";

const ctx = (units = "in", machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const run = (id, over = {}, units = "in", machine = null) => {
  const def = getCalc(id);
  const c = ctx(units, machine);
  const { values, invalid } = buildValues(def, defaultRaw(def, over, units), c);
  assert.equal(invalid.size, 0, `invalid: ${[...invalid].join(",")}`);
  return def.compute(values, c);
};
const stat = (out, re) => out.stats.find((s) => re.test(s.label));
const allText = (out) => [out.primary.label, out.primary.text, out.primary.unit, ...out.stats.flatMap((s) => [s.label, s.text, s.unit]), ...(out.warnings || []), ...out.explain.flatMap((e) => [e.title, e.formula, e.plugged])].filter(Boolean).join(" | ");

// ── NPT ──────────────────────────────────────────────────────────────────────
// Drill only: Engineers Edge "Pipe Thread Tap and Drill Size Chart" (1/8 R … 3 3-1/4), 1/16 D.
// With a taper reamer: Machinery's Handbook / ASME B1.20.1 practice as tabulated by AmesWeb (1/16 A … 2-1/2 2-37/64).
const NPT_DRILLS = {
  "1/16-27": ["D", "A"], "1/8-27": ["R", '21/64"'], "1/4-18": ['7/16"', '27/64"'], "3/8-18": ['37/64"', '9/16"'],
  "1/2-14": ['23/32"', '11/16"'], "3/4-14": ['59/64"', '57/64"'], "1-11.5": ['1-5/32"', '1-1/8"'], "1-1/4-11.5": ['1-1/2"', '1-15/32"'],
  "1-1/2-11.5": ['1-47/64"', '1-45/64"'], "2-11.5": ['2-7/32"', '2-11/64"'], "2-1/2-8": ['2-5/8"', '2-37/64"'], "3-8": ['3-1/4"', '3-13/64"'],
};

test("NPT drills match the published charts, every size", () => {
  for (const r of NPT_TABLE) {
    const [noReam, ream] = NPT_DRILLS[r.name];
    assert.equal(run("npt", { size: r.name }).primary.text, noReam, `${r.name} drill only`);
    assert.equal(run("npt", { size: r.name, reamer: "yes" }).primary.text, ream, `${r.name} with reamer`);
  }
});

// ASME B1.20.1: internal minor at the hand-tight plane = E0 − 0.8P + L1/16. A drill over it leaves the first
// threads short of full form; a reamed hole starts from a smaller drill.
test("NPT drill-only stays under the minor diameter at the opening; reamed is smaller still", () => {
  for (const r of NPT_TABLE) {
    const minorAtFace = r.e0 - 0.8 / r.tpi + r.l1 / 16;
    assert.ok(r.drill[1] <= minorAtFace, `${r.name}: ${r.drill[0]} (${r.drill[1]}) over ${minorAtFace.toFixed(4)}`);
    assert.ok(r.drillReam[1] < r.drill[1], `${r.name}: reamed drill must be smaller`);
  }
});

// ASME B1.20.1 Table 2 L3 (Engineers Edge reproduction): 3 threads for 2 in and smaller, 2 threads above.
// 2-1/2-8: L1 + L3 = 0.682 + 0.250 = 0.932 in; 3-8: 0.766 + 0.250 = 1.016 in (25.806 mm); 2-11.5: 0.436 + 0.2609.
test("NPT wrench makeup is L1 + L3 from B1.20.1", () => {
  near(stat(run("npt", { size: "2-1/2-8" }), /Wrench makeup/).value, 0.932, 0.0005);
  near(stat(run("npt", { size: "3-8" }), /Wrench makeup/).value, 1.016, 0.0005);
  near(stat(run("npt", { size: "3-8" }, "mm"), /Wrench makeup/).value, 25.806, 0.001);
  near(stat(run("npt", { size: "2-11.5" }), /Wrench makeup/).value, 0.6969, 0.0005);
});

test("NPT search prefill finds the fractional pipe sizes", () => {
  const def = getCalc("npt");
  assert.equal(def.prefill("1-1/4 npt").params.size, "1-1/4-11.5");
  assert.equal(def.prefill("1 1/4 npt").params.size, "1-1/4-11.5");
  assert.equal(def.prefill("1-1/2").params.size, "1-1/2-11.5");
  assert.equal(def.prefill("2-1/2 npt").params.size, "2-1/2-8");
  assert.equal(def.prefill("1 npt").params.size, "1-11.5");
});

// ── Drill feeds ──────────────────────────────────────────────────────────────
// Under 1/16 the feed keeps scaling at 0.016 × D ("0.001 per rev for every 1/16 of diameter", Norseman Drill),
// under M.A. Ford Twister Micro XD's carbide figure of 0.0005 IPR at 0.5 mm (0.0197 in) in low-carbon steel.
test("micro drill feed per rev keeps shrinking below 1/16 in", () => {
  near(drillFeedPerRev(0.0625), 0.001, 1e-12);
  near(drillFeedPerRev(0.020), 0.00032, 1e-9);
  near(drillFeedPerRev(0.0135), 0.000216, 1e-9);
  assert.ok(drillFeedPerRev(0.5 / 25.4) <= 0.0005, "at or under the maker's micro-drill feed at 0.5 mm");
  const out = run("feeds-drill", { diameter: "0.0135" });
  assert.ok(stat(out, /Feed per rev/).value < 0.0003);
  assert.ok(out.warnings.some((w) => /Micro drill/.test(w)));
  assert.ok(stat(run("feeds-drill", { diameter: "0.3" }, "mm"), /Feed per rev/).value < 0.006, "0.3 mm drill under 0.006 mm/rev");
});

// A feed-per-rev cut held inside the machine: 3000 RPM cap, then 5 IPM max feed → the spindle slows so IPR holds.
test("drill feed honors the machine's max feed and keeps the feed per rev", () => {
  const machine = { name: "Mini", maxRpm: 3000, maxFeed: 5, units: "in" };
  const out = run("feeds-drill", { diameter: "0.5", material: "al6061", toolType: "carbide", depth: "1" }, "in", machine);
  assert.ok(out.primary.value <= 5 + 1e-9);
  assert.equal(out.primary.clamped, true);
  const ipr = stat(out, /Feed per rev/).value;
  near(out.primary.value, stat(out, /Spindle/).value * ipr, 1e-9);
  near(stat(out, /Time per hole/).value, (1 + 0.15) / out.primary.value * 60, 1e-6);
  assert.ok(out.warnings.some((w) => /max feed/.test(w)));
});

// Metric drilling formulas (Sandvik Coromant): n = 1000·Vc ÷ (π·D), vf = n·fn.
test("drill working reads in metric on a metric screen", () => {
  const out = run("feeds-drill", { depth: "25" }, "mm");
  const text = out.explain.map((e) => e.plugged).join(" ");
  assert.match(text, /mm\/min/);
  assert.match(text, /π × 6\)/);
  assert.doesNotMatch(text, /IPM|IPR|SFM/);
});

// The spindle line's own arithmetic has to land on the RPM it prints, even on tiny drills where
// rounding Vc moves the answer (80 SFM = 24.384 m/min; 0.5 mm → 15523 RPM, 0.3 mm → 25872 RPM).
test("metric drill spindle line adds up to the RPM it shows", () => {
  for (const d of ["0.5", "0.3", "6"]) {
    const line = run("feeds-drill", { diameter: d }, "mm").explain.find((e) => e.title === "Spindle speed").plugged;
    const [, vc, dia, shown] = line.match(/1000 × ([\d.]+)\) ÷ \(π × ([\d.]+)\) = ([\d,]+)/);
    near(1000 * Number(vc) / (Math.PI * Number(dia)), Number(shown.replace(/,/g, "")), 0.5 + 1e-9);
  }
});

// Same rule for the "Feed rate" line: RPM × feed per rev, as printed, has to land on the feed it shows
// (to the 0.1 it is printed to), down to the micro sizes where 2 significant figures were ~3% off.
test("drill feed line adds up to the feed it shows, micro drills included", () => {
  for (const [d, u] of [["0.02", "in"], ["0.0135", "in"], ["0.25", "in"], ["0.3", "mm"], ["0.5", "mm"], ["6", "mm"]]) {
    const out = run("feeds-drill", { diameter: d }, u);
    const line = out.explain.find((e) => e.title === "Feed rate").plugged;
    const [, rpm, rev, shown] = line.match(/= ([\d,]+) × ([\d.]+) = ([\d.]+)/);
    assert.equal(Number(shown), Number(fmt(out.primary.value, 1)), `${d} ${u}: line shows the answer`);
    // rev is printed to within 0.005 of the feed; the whole-number RPM adds up to half a rev's worth.
    near(Number(rpm.replace(/,/g, "")) * Number(rev), out.primary.value, 0.005 + Number(rev) / 2 + 1e-9, `${d} ${u}: ${line}`);
  }
});

// ── Tapping ──────────────────────────────────────────────────────────────────
// Rigid tap feed = RPM × lead (Machinery's Handbook). #10-32 on an 8100 RPM machine: 8100 / 32 = 253.125 IPM.
test("rigid tapping caps the spindle at the machine max", () => {
  const out = run("tapping-feed", { thread: "#10-32", rpm: "10000" }, "in", { name: "VF-2", maxRpm: 8100, maxFeed: 650, units: "in" });
  near(out.primary.value, 253.125, 1e-9);
  assert.equal(out.primary.clamped, true);
  assert.ok(out.warnings.some((w) => /8100 RPM/.test(w)));
  const fed = run("tapping-feed", { thread: "1/2-13", rpm: "20000" }, "in", { name: "VF-2", maxRpm: 8100, maxFeed: 300, units: "in" });
  assert.ok(stat(fed, /Spindle/).value <= 8100, "the max-feed drop never asks for more than max RPM");
  assert.ok(fed.primary.value <= 300 + 1e-9);
});

// M6x1 at 500 RPM = 500 mm/min; 25 mm of thread takes 25 ÷ 500 × 60 = 3.0 s.
test("tapping feed reads in mm on a metric screen", () => {
  const out = run("tapping-feed", { thread: "M6", rpm: "500" }, "mm");
  near(out.primary.value, 500, 1e-9);
  const t = stat(out, /Time for/);
  assert.match(t.label, /25 mm/);
  near(t.value, 3.0, 1e-9);
  assert.doesNotMatch(allText(out), /IPM|Time for 1 in/);
});

// ── Thread milling ───────────────────────────────────────────────────────────
// External full-depth tool path = external minor + cutter; d3 = D − 1.226869P (ASME B1.1 / ISO 68-1).
// 1/2-13 with a 0.375 cutter: 0.4056 + 0.375 = 0.7806 in. M12x1.75 with 10 mm: 9.853 + 10 = 19.853 mm.
test("external thread-mill path is the full-depth path", () => {
  near(stat(run("thread-mill", { side: "external" }), /Helix path/).value, 0.7806, 0.0001);
  near(stat(run("thread-mill", { side: "external", thread: "M12x1.75", cutter: "10" }, "mm"), /Helix path/).value, 19.853, 0.001);
  near(stat(run("thread-mill", {}), /Helix path/).value, 0.125, 1e-9, "internal path D − d");
});

test("thread mill: metric defaults open clean, a cutter bigger than the hole is refused, machine limits apply", () => {
  const mm = run("thread-mill", {}, "mm");
  assert.deepEqual(mm.warnings, []);
  assert.doesNotMatch(allText(mm), /IPM/);
  assert.deepEqual(run("thread-mill", { cutter: "9.525" }, "mm").warnings, [], "exactly 75% is not over 75%");
  assert.throws(() => run("thread-mill", { cutter: "0.45" }), /won't fit/);
  const out = run("thread-mill", { thread: "M6", cutter: "0.18", rpm: "10000" }, "in", { name: "Tormach", maxRpm: 5140, maxFeed: 110, units: "in", type: "mill" });
  assert.equal(stat(out, /Spindle/).value, 5140);
  assert.ok(out.warnings.some((w) => /5140 RPM/.test(w)));
});

// ── Tap drill ────────────────────────────────────────────────────────────────
// 4-4 UNC at 75%: 4 − 0.974 × 0.25 = 3.756 in (published 3-3/4); ISO 2306 M72x6 → 66 mm. Both past the chart.
test("tap drill past the chart gives a bore size, and impossible threads are refused", () => {
  const big = run("tap-drill", { thread: "4-4" });
  assert.match(big.primary.text, /Bore to 3\.756/);
  assert.match(run("tap-drill", { thread: "M72x6" }).primary.text, /Bore to 66\.15 mm/);
  assert.throws(() => run("tap-drill", { thread: "1/4-2" }));
  assert.throws(() => run("tap-drill", { thread: "1/4-5" }), /too coarse/, "a drill under a quarter of the major is not a thread");
  assert.equal(run("tap-drill", { thread: "1/4-20" }).primary.text, "#7");
  assert.match(run("tap-drill", { thread: "M10" }).explain[0].plugged, /8\.539 mm/);
});

// 3-4 UNC (ASME B1.1, D = 3.000, P = 0.250): 75% hole = 3 − (75 ÷ 76.98) × 0.25 = 2.7564 in = 70.01 mm, past the
// 60 mm end of the ISO 235 metric series, so there is no metric drill to name (the old answer was 60 mm, 10 mm small).
test("tap drill names no metric drill past the metric chart, and mm drills don't print mm twice", () => {
  const out = run("tap-drill", { thread: "3-4" });
  assert.equal(out.primary.text, '2-3/4"', "Machinery's Handbook 3-4 UNC tap drill");
  assert.match(stat(out, /Nearest metric drill/).text, /None on the chart \(hole is 70\.01 mm\)/);
  assert.match(stat(run("tap-drill", { thread: "3-5/8-4" }), /Nearest metric drill/).text, /None on the chart/);
  assert.equal(stat(run("tap-drill", { thread: "1/4-20" }), /Nearest metric drill/).text, "5.1 mm");
  const m10 = run("tap-drill", { thread: "M10" }, "mm");
  assert.equal(m10.primary.text, "8.5 mm");
  assert.equal(m10.primary.unit, undefined);
  assert.equal(stat(m10, /One size smaller/).text, "8.4 mm");
  assert.equal(stat(run("tap-drill", { thread: "1/4-20" }), /One size smaller/).text, "#8 · 0.199 in");
});

// ── Ream ─────────────────────────────────────────────────────────────────────
// Alvord-Polk (CTE "Getting reaming right"): up to 3/32 → 0.003–0.006, 3/32–1/4 → 0.008–0.010;
// Redline: 1/32 → 0.002–0.003, 1/16 → 0.004–0.006, 1/8 → 0.009–0.011; MH: ≤1/2 → 0.015.
test("ream stock follows the published small-hole allowances", () => {
  near(reamAllowanceOnDia(1 / 32), 0.003, 1e-12);
  near(reamAllowanceOnDia(1 / 16), 0.004, 1e-12);
  near(reamAllowanceOnDia(3 / 32), 0.006, 1e-12);
  near(reamAllowanceOnDia(0.125), 0.010, 1e-12);
  near(reamAllowanceOnDia(0.5), 0.015, 1e-12);
  assert.ok(stat(run("ream", { target: "0.0625" }), /Stock this drill/).value <= 0.006 + 1e-9);
});

test("ream refuses impossible stock, flags too much, and bores past the chart", () => {
  assert.throws(() => run("ream", { target: "0.5", allow: "0.6" }), /smaller than the reamed size/);
  assert.throws(() => run("ream", { target: "0.25", allow: "0.25" }), /smaller than the reamed size/);
  assert.ok(run("ream", { target: "0.5", allow: "0.1" }).warnings.some((w) => /usual 0\.015/.test(w)));
  assert.match(run("ream", { target: "4" }).primary.text, /Bore to 3\.97 in/);
  assert.match(run("ream", { target: "80" }, "mm").primary.text, /Bore to 79\.238 mm/);
  // 20 mm reamer, 0.508 mm stock: 19.5 mm leaves 0.5 mm — right on the allowance, not a whole size under.
  assert.equal(run("ream", { target: "20" }, "mm").primary.text, "19.5 mm");
});

// Bottom of the charts: ISO 235 starts at 0.20 mm and the number series at #80 (0.0135 in). A 0.2 mm or 0.010 in
// reamed hole has no smaller stock drill, so no drill is named (it used to answer 0.2 mm / #80 with 0 or −0.0035 stock).
test("ream names no drill when even the smallest one is not under the reamed size", () => {
  for (const [target, u] of [["0.2", "mm"], ["0.01", "in"]]) {
    const out = run("ream", { target }, u);
    assert.match(out.primary.text, /No drill on the chart is small enough/, `${target} ${u}`);
    assert.ok(stat(out, /Calculated pre-ream size/).value < Number(target));
    assert.ok(out.warnings.some((w) => /not smaller than/.test(w)));
  }
  assert.equal(run("ream", { target: "0.016" }).primary.text, "#80", "0.016 in: #80 leaves 0.0025 in, a real answer");
});

test("ream's metric drill sizes print mm once", () => {
  const mm = run("ream", {}, "mm");
  assert.equal(stat(mm, /Next drill up/).text, "11.7 mm");
  assert.equal(mm.primary.unit, undefined);
  assert.equal(stat(run("ream", { target: "20" }, "mm"), /Next drill up/).text, "19.75 mm");
  assert.equal(stat(run("ream", {}), /Next drill up/).text, '1/2" · 0.5 in');
});

// ── STI ──────────────────────────────────────────────────────────────────────
// Heli-Coil metric drilling data (Vargus Heli-Coil PDF p.3): M24x3 24.75, M20x2.5 20.75, M8x1 8.3 (steel),
// M10x1.5 10.5. Not in the chart: drill the first stock size at or above the STI minor min D + 0.2165P.
test("STI metric drills come from the Heli-Coil chart and never land under the STI minor", () => {
  assert.equal(run("sti", { thread: "M24x3" }).primary.text, "24.75 mm");
  assert.equal(run("sti", { thread: "M20x2.5" }).primary.text, "20.75 mm");
  assert.equal(run("sti", { thread: "M8x1" }).primary.text, "8.3 mm");
  const m10 = run("sti", { thread: "M10" });
  assert.equal(m10.primary.text, "10.5 mm");
  assert.equal(stat(m10, /Next size up/).text, "10.6 mm");
  const est = run("sti", { thread: "M16x1" });
  assert.equal(est.primary.text, "16.25 mm");
  assert.ok(est.warnings.length === 1);
});

// Insert lengths are 1D–3D of the nominal size in the thread's own unit (M8: 8, 12, 16, 20, 24 mm).
test("STI insert lengths read in the thread's unit", () => {
  assert.match(stat(run("sti", { thread: "M8" }), /Insert lengths/).text, /1D = 8 mm .*3D = 24 mm/);
  assert.match(stat(run("sti", { thread: "1/4-20" }), /Insert lengths/).text, /1D = 0\.25 in/);
  // Heli-Coil metric nominal lengths are quarter-millimeters on small sizes: M2.5 = 2.5 / 3.75 / 5 / 6.25 / 7.5 mm,
  // M3.5 1.5D = 5.25 mm. Rounding to 0.1 mm would print inserts that don't exist (3.8, 6.3).
  assert.match(stat(run("sti", { thread: "M2.5" }, "mm"), /Insert lengths/).text, /1D = 2\.5 mm {2}1\.5D = 3\.75 mm {2}2D = 5 mm {2}2\.5D = 6\.25 mm {2}3D = 7\.5 mm/);
  assert.match(stat(run("sti", { thread: "M3.5" }, "mm"), /Insert lengths/).text, /1\.5D = 5\.25 mm/);
});

// ── Acme ─────────────────────────────────────────────────────────────────────
// ASME B1.5: external minor = D − P − clearance must stay positive; 1/4-16 (P = D/4) is the coarsest standard size.
test("Acme refuses a thread with no core and flags non-standard coarse pitches", () => {
  assert.throws(() => run("acme", { thread: "1/8-4" }), /too coarse/);
  assert.throws(() => run("acme", { thread: "1/4-4" }), /too coarse/);
  assert.equal(run("acme", { thread: "1/4-16" }).warnings.length, 0);
  assert.equal(run("acme", { thread: "0.25-4.5" }).warnings.length, 1);
});

// ── Center drill ─────────────────────────────────────────────────────────────
// Catalog C runs to the lip corners (KEO, FM Carbide drawings), so Z = C + Dpilot ÷ (2 tan 59°) + cone.
// #3, 0.1875 csk: 0.109 + 0.0329 + 0.0677 = 0.2095 in (5.32 mm).
test("center drill depth includes the drill point, and the picker reads in mm on a metric screen", () => {
  near(run("center-drill", {}).primary.value, 0.2095, 0.0001);
  near(run("center-drill", {}, "mm").primary.value, 5.322, 0.001);
  const def = getCalc("center-drill");
  const opts = def.inputs.find((i) => i.id === "size").options({}, ctx("mm"));
  assert.match(opts.find((o) => o.value === "#3").label, /body 6\.35 mm/);
});
