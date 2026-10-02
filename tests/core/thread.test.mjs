// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { parseThreadSpec, threadSpecProblem, basicThreadGeometry, unToleranceEnvelope, lookupUnThread, lookupMetricThread } from "../../src/core/thread.js";
import { UN_THREAD_TABLE, TAP_DRILL_UN_TABLE } from "../../src/data/threads-un.js";
import { TAP_DRILL_METRIC_TABLE, METRIC_THREAD_TABLE } from "../../src/data/threads-metric.js";

test("parseThreadSpec recognizes Unified, machine screw, and metric forms", () => {
  const unified = parseThreadSpec("1/4-20 UNC");
  assert.equal(unified.system, "un");
  assert.equal(unified.major, 0.25);
  assert.equal(unified.tpi, 20);
  assert.equal(unified.suppliedSeries, "UNC");
  assert.equal(parseThreadSpec("#10-32").major, 0.19);
  assert.equal(parseThreadSpec("M10").pitch, 1.5);
  assert.equal(parseThreadSpec("M10x1.25").pitch, 1.25);
  assert.equal(parseThreadSpec("not a thread"), null);
});

// Published basic dimensions, ASME B1.1 Table 3A: 1/4-20 UNC
test("1/4-20 basic geometry matches ASME B1.1", () => {
  const g = basicThreadGeometry(0.25, 1 / 20);
  near(g.pitchDiameter, 0.2175, 0.0001, "basic PD");
  near(g.internalMinor, 0.1959, 0.0001, "basic minor (internal)");
});

// ASME B1.1 / Machinery's Handbook "Unified Screw Threads — Limits of Size", inches.
// [name, major, tpi, 2A PD max, 2A PD min, 2B PD min, 2B PD max]
const PUBLISHED_UN_LIMITS = [
  ["#4-40 UNC", 0.112, 40, 0.0950, 0.0925, 0.0958, 0.0991],
  ["#6-32 UNC", 0.138, 32, 0.1169, 0.1141, 0.1177, 0.1214],
  ["#8-32 UNC", 0.164, 32, 0.1428, 0.1399, 0.1437, 0.1475],
  ["#10-24 UNC", 0.19, 24, 0.1619, 0.1586, 0.1629, 0.1672],
  ["#10-32 UNF", 0.19, 32, 0.1688, 0.1658, 0.1697, 0.1736],
  ["1/4-20 UNC", 0.25, 20, 0.2164, 0.2127, 0.2175, 0.2224],
  ["5/16-18 UNC", 0.3125, 18, 0.2752, 0.2712, 0.2764, 0.2817],
  ["3/8-16 UNC", 0.375, 16, 0.3331, 0.3287, 0.3344, 0.3401],
  ["3/8-24 UNF", 0.375, 24, 0.3468, 0.3430, 0.3479, 0.3528],
  ["1/2-13 UNC", 0.5, 13, 0.4485, 0.4435, 0.4500, 0.4565],
  ["1/2-20 UNF", 0.5, 20, 0.4662, 0.4619, 0.4675, 0.4731],
  ["3/4-10 UNC", 0.75, 10, 0.6832, 0.6773, 0.6850, 0.6927],
  ["1-8 UNC", 1, 8, 0.9168, 0.9100, 0.9188, 0.9276],
];

test("UN pitch-diameter limits match the ASME B1.1 tables to the fourth place", () => {
  for (const [name, major, tpi, aMax, aMin, bMin, bMax] of PUBLISHED_UN_LIMITS) {
    const env = unToleranceEnvelope({ major, pitch: 1 / tpi });
    near(env["2A"].pdMax, aMax, 5e-5, `${name} 2A PD max`);
    near(env["2A"].pdMin, aMin, 5e-5, `${name} 2A PD min`);
    near(env["2B"].pdMin, bMin, 5e-5, `${name} 2B PD min`);
    near(env["2B"].pdMax, bMax, 5e-5, `${name} 2B PD max`);
  }
});

// Published 1/4-20 UNC: 2A major 0.2489/0.2408; 3A PD 0.2175/0.2147, major 0.2500/0.2419; 3B PD max 0.2211;
// minor 2B 0.196/0.207, 3B 0.1960/0.2067. 1/2-13 UNC: 2A major 0.4985/0.4876, 3A 0.4463 / 0.4891, 3B PD max 0.4548, minor 3B max 0.4284.
test("UN major and minor diameter limits, and class 3, match the tables", () => {
  const q = unToleranceEnvelope({ major: 0.25, pitch: 1 / 20 });
  near(q["2A"].majorMax, 0.2489, 5e-5); near(q["2A"].majorMin, 0.2408, 5e-5);
  near(q["3A"].pdMax, 0.2175, 5e-5); near(q["3A"].pdMin, 0.2147, 5e-5);
  near(q["3A"].majorMax, 0.2500, 5e-5); near(q["3A"].majorMin, 0.2419, 5e-5, "3A shares the 2A major tolerance");
  near(q["3B"].pdMax, 0.2211, 5e-5);
  near(q["2B"].minorMin, 0.196, 5e-6); near(q["2B"].minorMax, 0.207, 5e-6);
  near(q["3B"].minorMax, 0.2067, 5e-5);
  const h = unToleranceEnvelope({ major: 0.5, pitch: 1 / 13 });
  near(h["2A"].majorMax, 0.4985, 5e-5); near(h["2A"].majorMin, 0.4876, 5e-5);
  near(h["3A"].pdMin, 0.4463, 5e-5); near(h["3A"].majorMin, 0.4891, 5e-5);
  near(h["3B"].pdMax, 0.4548, 5e-5); near(h["3B"].minorMax, 0.4284, 5e-5);
  near(h["2B"].minorMin, 0.417, 5e-6); near(h["2B"].minorMax, 0.434, 5e-6);
  // small sizes use the D-dependent minor tolerance: #10-32 2B minor 0.156/0.164, #4-40 0.0849/0.0939
  const ten = unToleranceEnvelope({ major: 0.19, pitch: 1 / 32 });
  near(ten["2B"].minorMin, 0.156, 5e-6); near(ten["2B"].minorMax, 0.164, 5e-6);
  const four = unToleranceEnvelope({ major: 0.112, pitch: 1 / 40 });
  near(four["2B"].minorMin, 0.0849, 5e-6); near(four["2B"].minorMax, 0.0939, 5e-6);
});

// UNEF and specials are toleranced on nine pitches of engagement, not one diameter: 1/2-28 UNEF-2A PD 0.4757/0.4720.
test("engagement length: one diameter for UNC and UNF, nine pitches otherwise", () => {
  const unef = unToleranceEnvelope({ major: 0.5, pitch: 1 / 28 });
  near(unef.engagement, 9 / 28, 1e-12);
  near(unef["2A"].pdMax, 0.4757, 5e-5); near(unef["2A"].pdMin, 0.4720, 5e-5);
  near(unToleranceEnvelope({ major: 0.5, pitch: 1 / 13 }).engagement, 0.5, 1e-12);
  near(unToleranceEnvelope({ major: 1.125, pitch: 1 / 8 }).engagement, 1.125, 1e-12, "8-thread series");
});

test("series name lookups", () => {
  assert.equal(lookupUnThread(0.25, 20), "1/4-20 UNC");
  assert.equal(lookupUnThread(0.5, 13), "1/2-13 UNC");
  assert.equal(lookupMetricThread(10, 1.5), "M10x1.5");
  assert.equal(lookupUnThread(0.33, 17), null);
});

// Callouts the way they are written on prints. "1-8" is one inch, not a #1 screw.
test("thread callouts: big inch sizes, mixed numbers, suffixes, quotes", () => {
  const un = [["1-8", 1, 8], ["1-12", 1, 12], ["1-14", 1, 14], ['1"-8', 1, 8], ["2-4.5", 2, 4.5], ["2-56", 0.086, 56], ["4-40", 0.112, 40], ["10-32", 0.19, 32],
    ["1 1/8-7", 1.125, 7], ["1-1/8-7", 1.125, 7], ["1-1/4-7", 1.25, 7], ["1 1/2-6", 1.5, 6], [".250-20", 0.25, 20], ['1/4"-20', 0.25, 20], ["3/8-16 UNC-2B", 0.375, 16], ["1/4-20 UNC 2A", 0.25, 20], ["5/16-18 NC", 0.3125, 18], ["4-8", 4, 8], ["3-48", 0.099, 48]];
  for (const [text, major, tpi] of un) { const t = parseThreadSpec(text); assert.ok(t && t.system === "un" && Math.abs(t.major - major) < 1e-9 && t.tpi === tpi, `${text} → ${JSON.stringify(t)}`); }
  const metric = [["M12x1.75-6H", 12, 1.75], ["M10x1.5 6g", 10, 1.5], ["M8-6H", 8, 1.25], ["M16x2-6H/6g", 16, 2], ["M 10", 10, 1.5]];
  for (const [text, major, pitch] of metric) { const t = parseThreadSpec(text); assert.ok(t && t.system === "metric" && t.major === major && t.pitch === pitch, `${text} → ${JSON.stringify(t)}`); }
  for (const bad of ["M0x0", "M10x0", "M10x12", "0-0", "1/0-20", "1/4-0", "#99-99", "1/4--20", "m10x1.5x2", "-1/4-20", "1/4", "20", "<script>", "a".repeat(5000)]) assert.equal(parseThreadSpec(bad), null, `should reject ${bad.slice(0, 20)}`);
  assert.equal(parseThreadSpec("1 1/8-7").label, "1-1/8-7");
  assert.equal(parseThreadSpec("3/8-16 UNC-2B").suppliedSeries, "UNC");
});

// ASME B1.1 §2 designations: the series straight after the pitch is common on drawings ("1/4-20UNC"), and UNR
// (rolled, rounded root) is the usual bolt callout. Both name the same size and limits as UN.
test("print callouts with the series run on, UNR and UNJ series, class and hand run together", () => {
  const cases = [["1/4-20UNC", 0.25, 20, "UNC"], ["#10-32UNF", 0.19, 32, "UNF"], ["1/2-13UNC-2B", 0.5, 13, "UNC"], ["1/4-20 UNRC-2A", 0.25, 20, "UNRC"],
    ["3/8-24 UNRF-3A", 0.375, 24, "UNRF"], ["1/2-28UNEF", 0.5, 28, "UNEF"], ["1/2-28 UNREF-2A", 0.5, 28, "UNREF"], ["1-8UN", 1, 8, "UN"], ["1/4-20 UNJC-3A", 0.25, 20, "UNJC"],
    ["1/2-20UNF-2ALH", 0.5, 20, "UNF"], [".250-20UNC", 0.25, 20, "UNC"], ["1-14 UNS", 1, 14, "UNS"], ["5/16-18 NC", 0.3125, 18, "UNC"],
    // B1.1 §2 left hand: the hand after its own hyphen
    ["1/4-20 UNC-2A-LH", 0.25, 20, "UNC"], ["1/2-20 UNF-2A-LH", 0.5, 20, "UNF"], ["1/4-20-2A-LH", 0.25, 20, null], ["3/8-16 UNC-2B LH", 0.375, 16, "UNC"]];
  for (const [text, major, tpi, series] of cases) {
    const t = parseThreadSpec(text);
    assert.ok(t && t.system === "un" && Math.abs(t.major - major) < 1e-9 && t.tpi === tpi, `${text} → ${JSON.stringify(t)}`);
    assert.equal(t.suppliedSeries, series, text);
  }
  // ISO 965-1 §4: "M10x1.5-6H-LH"
  for (const [text, major, pitch] of [["M10x1.5-6H-LH", 10, 1.5], ["M8x1.25-6g-LH", 8, 1.25], ["M12-LH", 12, 1.75]]) {
    const t = parseThreadSpec(text);
    assert.ok(t && t.system === "metric" && t.major === major && t.pitch === pitch, `${text} → ${JSON.stringify(t)}`);
  }
});

// A 60° thread needs metal under the root: basic external minor d3 = D − 1.226869 P > 0 (ASME B1.1 §5, ISO 68-1).
// The coarsest standard pitches are about D/4 (M1x0.25); ISO 965 covers 0.2 to 8 mm pitch.
test("impossible pitches are refused with a reason, very coarse ones carry a caution", () => {
  for (const bad of ["1/4-2", "1/4-4", "1/2-0.5", "M10x9"]) {
    assert.equal(parseThreadSpec(bad), null, bad);
    assert.match(threadSpecProblem(bad), /too coarse/, bad);
  }
  assert.equal(threadSpecProblem("not a thread"), null);
  assert.match(parseThreadSpec("1/4-10").caution, /coarser than any standard/);
  assert.match(parseThreadSpec("M10x0.1").caution, /0\.2 to 8 mm/);
  for (const ok of ["1/4-20", "#0-80", "#4-40", "M1x0.25", "M1.6", "4-4", "M64x6"]) assert.equal(parseThreadSpec(ok).caution, null, ok);
});

// Willrich Precision gauge PD chart (reproduces ASME B1.1): [major, tpi, 2A max, 2A min, 3A min, 2B max, 3B max].
// Includes the UNEF / UN / UNS rows and the rows the B1.1 tables smoothed by hand (5/8-11, #6-32 3B, 7/8-20 UNEF …).
const WILLRICH = [
  [0.06, 80, 0.0514, 0.0496, 0.0506, 0.0542, 0.0536], [0.138, 32, 0.1169, 0.1141, 0.1156, 0.1214, 0.1204], [0.138, 40, 0.1210, 0.1184, 0.1198, 0.1252, 0.1243],
  [0.216, 32, 0.1948, 0.1917, 0.1933, 0.1998, 0.1988], [0.25, 32, 0.2287, 0.2255, 0.2273, 0.2339, 0.2328], [0.3125, 32, 0.2912, 0.2880, 0.2898, 0.2964, 0.2953],
  [0.5, 28, 0.4757, 0.4720, 0.4740, 0.4816, 0.4804], [0.625, 11, 0.5644, 0.5589, 0.5619, 0.5732, 0.5714], [0.875, 20, 0.8412, 0.8368, 0.8392, 0.8482, 0.8468],
  [1, 14, 0.9519, 0.9463, 0.9494, 0.9609, 0.9590], [1, 20, 0.9661, 0.9616, 0.9641, 0.9734, 0.9719], [1.0625, 12, 1.0067, 1.0010, 1.0042, 1.0158, 1.0139],
  [1.125, 7, 1.0300, 1.0228, 1.0268, 1.0416, 1.0393], [1.1875, 18, 1.1499, 1.1450, 1.1478, 1.1577, 1.1561], [1.3125, 12, 1.2567, 1.2509, 1.2541, 1.2659, 1.2640],
  [1.4375, 18, 1.3999, 1.3949, 1.3977, 1.4079, 1.4062], [1.5, 6, 1.3893, 1.3812, 1.3856, 1.4022, 1.3996],
];
test("UN pitch-diameter limits match the Willrich / ASME B1.1 values to the last digit", () => {
  for (const [major, tpi, a2max, a2min, a3min, b2max, b3max] of WILLRICH) {
    const e = unToleranceEnvelope({ major, pitch: 1 / tpi }), at = `${major}-${tpi}`;
    near(e["2A"].pdMax, a2max, 5e-6, `${at} 2A max`); near(e["2A"].pdMin, a2min, 5e-6, `${at} 2A min`);
    near(e["3A"].pdMin, a3min, 5e-6, `${at} 3A min`); near(e["2B"].pdMax, b2max, 5e-6, `${at} 2B max`); near(e["3B"].pdMax, b3max, 5e-6, `${at} 3B max`);
  }
});

// amesweb UNC chart (ASME B1.1-2003) and engineersedge: UNC above 1-1/2 in is toleranced on one diameter.
// 1-3/4-5 2A PD 1.6174/1.6085, 2B 1.6201/1.6317, minor 1.534/1.568; 2-1/4-4.5 2A 2.1028/2.0931, 2B max 2.1183.
// 1-14 UNS 2A major 0.9983/0.9880 (allowance 0.0017, LE = D); 5/8-11 2A major 0.6234/0.6113 (published allowance 0.0016).
test("large UNC, 1-14 UNS and the hand-adjusted 5/8-11 major diameter", () => {
  const a = unToleranceEnvelope({ major: 1.75, pitch: 1 / 5 });
  near(a["2A"].pdMax, 1.6174, 5e-6); near(a["2A"].pdMin, 1.6085, 5e-6); near(a["2B"].pdMin, 1.6201, 5e-6); near(a["2B"].pdMax, 1.6317, 5e-6);
  near(a["2B"].minorMin, 1.534, 5e-6); near(a["2B"].minorMax, 1.568, 5e-6);
  const b = unToleranceEnvelope({ major: 2.25, pitch: 1 / 4.5 });
  near(b["2A"].pdMax, 2.1028, 5e-6); near(b["2A"].pdMin, 2.0931, 5e-6); near(b["2B"].pdMax, 2.1183, 5e-6);
  const u = unToleranceEnvelope({ major: 1, pitch: 1 / 14 });
  near(u.engagement, 1, 1e-12, "1-14 UNS engages one diameter");
  near(u["2A"].majorMax, 0.9983, 5e-6); near(u["2A"].majorMin, 0.9880, 5e-6);
  const f = unToleranceEnvelope({ major: 0.625, pitch: 1 / 11 });
  near(f["2A"].majorMax, 0.6234, 5e-6); near(f["2A"].majorMin, 0.6113, 5e-6);
});

// ASME B1.1 Table 2 / Machinery's Handbook internal minor limits (engineersedge internal thread chart):
// from #6 up the 2B min/max and 3B min print to 3 places, the 3B max to 4. Below #6 everything is 4 places.
test("internal minor-diameter limits round the way B1.1 prints them, 3B minimum included", () => {
  const rows = [[0.25, 20, 0.196, 0.207, 0.2067], [0.19, 24, 0.145, 0.156, 0.1555], [0.3125, 24, 0.267, 0.277, null], [0.375, 16, 0.307, 0.321, 0.3182],
    [0.5, 13, 0.417, 0.434, 0.4284], [0.5, 20, 0.446, 0.457, null], [0.875, 14, 0.798, 0.814, 0.8068], [0.112, 40, 0.0849, 0.0939, null]];
  for (const [major, tpi, min, max2, max3] of rows) {
    const e = unToleranceEnvelope({ major, pitch: 1 / tpi }), at = `${major}-${tpi}`;
    near(e["2B"].minorMin, min, 5e-6, `${at} 2B minor min`); near(e["3B"].minorMin, min, 5e-6, `${at} 3B minor min`);
    near(e["2B"].minorMax, max2, 5e-6, `${at} 2B minor max`);
    if (max3 !== null) near(e["3B"].minorMax, max3, 5e-6, `${at} 3B minor max`);
  }
});

// ASME B1.1 Table 1 standard series: UNC to 4 in, every UNEF size, 1-14 UNS (formerly NF), and the constant-pitch
// 8/12/16UN series (Willrich lists 1-1/16-12 UN, 1-3/16-12 UN …).
test("series names: large UNC, UNEF, 1-14 UNS, constant-pitch UN, ISO 261 fine pitches", () => {
  const un = [[0.5, 28, "1/2-28 UNEF"], [1, 20, "1-20 UNEF"], [0.25, 32, "1/4-32 UNEF"], [0.216, 32, "#12-32 UNEF"], [1.6875, 18, "1-11/16-18 UNEF"],
    [1, 14, "1-14 UNS"], [1.75, 5, "1-3/4-5 UNC"], [2, 4.5, "2-4.5 UNC"], [2.25, 4.5, "2-1/4-4.5 UNC"], [4, 4, "4-4 UNC"],
    [1.0625, 12, "1-1/16-12 UN"], [1.25, 8, "1-1/4-8 UN"], [0.4375, 16, "7/16-16 UN"], [3, 8, "3-8 UN"], [0.5, 12, null], [1.1, 8, null], [1.75, 18, null]];
  for (const [d, tpi, name] of un) assert.equal(lookupUnThread(d, tpi), name, `${d}-${tpi}`);
  assert.equal(UN_THREAD_TABLE.filter((r) => /UNEF$/.test(r[2])).length, 25, "UNEF #12-32 through 1-11/16-18");
  assert.equal(lookupMetricThread(12, 1.5), "M12x1.5 (fine)");
  assert.equal(lookupMetricThread(14, 1.25), "M14x1.25 (fine)");
  assert.equal(lookupMetricThread(6, 0.75), "M6x0.75 (fine)");
  assert.equal(lookupMetricThread(1.4, 0.35), null, "0.35 is not 0.3: M1.4x0.35 is not M1.4x0.3");
  assert.equal(lookupMetricThread(5, 0.75), null, "M5x0.75 is not M5x0.8");
});

// Percent of thread a drill gives: % = (D − drill) × TPI ÷ 0.01299 (Machinery's Handbook). Imperial Supplies tap & die
// chart, top of its "probable %" range: 0-80 3/64 81, 4-40 #43 71, 4-48 #42 68, 10-32 #21 76, 9/16-18 33/64 65,
// 5/8-11 17/32 79, 7/8-14 13/16 67, 1-14 15/16 67; 1/4-20 #7 75. ISO 2306 D − P drills give 77%.
test("tap drill chart percent is what the listed drill gives", () => {
  for (const [key, want] of [["0.0600|80", 81], ["0.1120|40", 71], ["0.1120|48", 68], ["0.1900|32", 76], ["0.5625|18", 65], ["0.6250|11", 79], ["0.8750|14", 67], ["1.0000|14", 67], ["0.2500|20", 75]]) {
    assert.equal(TAP_DRILL_UN_TABLE[key][2], want, key);
  }
  for (const [key, [drill, , pct]] of Object.entries(TAP_DRILL_UN_TABLE)) {
    const [d, tpi] = key.split("|").map(Number);
    assert.ok(Math.abs(pct - (d - drill) * tpi / 0.01299) <= 0.6, `${key} ${pct}%`);
  }
  for (const key of ["1.0|0.25", "1.6|0.35", "2.0|0.40", "2.5|0.45", "10.0|1.50"]) assert.equal(TAP_DRILL_METRIC_TABLE[key][2], 77, key);
});

// Every thread the app names gets a chart drill, so the tap drill chart and Thread data never fall back to "figured"
// for a standard size. DIN 336 / ISO 2306 (D − P): M12x1.5 10.5, M12x1 11.0, M20x2 18.0, M8x1 7.0, M8x0.75 7.25,
// M10x0.75 9.2; DIN 336 M14x1.25 12.8. UNEF (B94.11M-style chart): #12-32 #13, 1/2-28 15/32, 9/16-24 33/64, 1-20 61/64.
// Left out on purpose, because the hole is past the drill chart and gets bored: 4-4 UNC (75% = 3.7565 in, chart ends at
// 3-1/2 in) and M64x3/x2/x1.5 (61–62.5 mm, chart ends at 60 mm).
test("every standard thread in the series tables has a chart tap drill", () => {
  const missingUn = UN_THREAD_TABLE.filter(([d, tpi]) => !TAP_DRILL_UN_TABLE[`${d.toFixed(4)}|${tpi}`]).map((r) => r[2]);
  assert.deepEqual(missingUn, ["4-4 UNC"]);
  const missingM = METRIC_THREAD_TABLE.filter(([d, p]) => !TAP_DRILL_METRIC_TABLE[`${d.toFixed(1)}|${p.toFixed(2)}`]).map((r) => r[2]);
  assert.deepEqual(missingM, ["M64x3 (fine)", "M64x2 (fine)", "M64x1.5 (fine)"]);
  for (const [key, drill] of [["12.0|1.50", 10.5], ["12.0|1.00", 11], ["20.0|2.00", 18], ["8.0|1.00", 7], ["8.0|0.75", 7.25], ["10.0|0.75", 9.2], ["14.0|1.25", 12.8], ["1.0|0.20", 0.8]]) {
    assert.equal(TAP_DRILL_METRIC_TABLE[key][0], drill, key);
  }
  for (const [key, label] of [["0.2160|32", "#13"], ["0.5000|28", '15/32"'], ["0.5625|24", '33/64"'], ["1.0000|20", '61/64"']]) {
    assert.equal(TAP_DRILL_UN_TABLE[key][1], label, key);
  }
  // a chart drill always leaves a usable thread: 60–90% by % = (D − drill) ÷ P × 76.98
  for (const [key, [, , pct]] of [...Object.entries(TAP_DRILL_UN_TABLE), ...Object.entries(TAP_DRILL_METRIC_TABLE)]) assert.ok(pct >= 60 && pct <= 90, `${key} ${pct}%`);
});
