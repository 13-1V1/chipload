// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Home search and chart filters: a value typed the way a machinist writes it lands on the right tool
// and the right row. Sizes are checked against the standards they come from.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs, getCalc } from "../../src/app/registry.js";
import { searchCalcs, recognize } from "../../src/app/search.js";
import { chartCells, chartFilter, normCodes, threadCallout } from "../../src/app/chart-filter.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { readSize } from "../../src/calcs/fraction-converter.js";

const first = (q) => searchCalcs(q, allCalcs())[0];
const ids = (q) => searchCalcs(q, allCalcs()).map((h) => h.def.id);

test("a unit after a space stays with its number: 8.5 mm is millimeters, not inches", () => {
  // 1 in = 25.4 mm exactly (NIST SP 811), so 8.5 mm = 0.33465 in — the fraction converter must get mm.
  assert.deepEqual(recognize.number("8.5 mm"), { value: 8.5, unit: "mm" });
  assert.deepEqual(recognize.number("8.5 millimeters"), { value: 8.5, unit: "mm" });
  assert.deepEqual(recognize.number('3/8"'), { value: 0.375, unit: "in" });
  for (const q of ["8.5 mm", "8.5mm", "drill 8.5 mm"]) {
    const hit = searchCalcs(q, allCalcs()).find((h) => h.def.id === "fraction-converter");
    assert.equal(hit?.params?.units, "mm", `${q} → ${JSON.stringify(hit?.params)}`);
    assert.equal(recognize.number(hit.params.value)?.value, 8.5, `${q} keeps 8.5`);
  }
});

test("a mixed number is one value: 1 1/4 is 1.25, never the 1 in pipe size", () => {
  assert.equal(recognize.number("1 1/4").value, 1.25);
  assert.equal(recognize.number("1-1/4").value, 1.25);
  const conv = searchCalcs("1 1/4", allCalcs()).find((h) => h.def.id === "fraction-converter");
  assert.equal(recognize.number(conv.params.value).value, 1.25);
  // ASME B1.20.1: 1 NPT is 1-11.5, 1-1/4 NPT is 1-1/4-11.5, 2-1/2 NPT is 2-1/2-8 (distinct sizes, distinct tap drills)
  for (const q of ["1 1/4", "1 1/4 npt", "1-1/4 npt", "2 1/2 npt"]) {
    const npt = searchCalcs(q, allCalcs()).find((h) => h.def.id === "npt");
    assert.notEqual(npt?.params?.size, "1-11.5", `${q} must not open 1 in NPT`);
    assert.notEqual(npt?.params?.size, "2-11.5", `${q} must not open 2 in NPT`);
  }
  assert.equal(first("1 1/4 npt").def.id, "npt");
  // ASME B1.1: 1-1/8-7 UNC, written with a space between the whole number and the fraction
  const tap = first("tap drill 1 1/8-7");
  assert.equal(tap.def.id, "tap-drill");
  assert.equal(tap.params.thread, "1 1/8-7");
});

test("a question with a material or a numbered size still finds the tool", () => {
  assert.equal(first("aluminum end mill").def.id, "feeds-mill");
  assert.equal(first("how fast should i run a 1/2 end mill in aluminum").def.id, "feeds-mill");
  assert.equal(first("drill 304 stainless").def.id, "feeds-drill");
  assert.equal(first("how fast drill steel").def.id, "feeds-drill");
  const screw = first("#10 screw");
  assert.equal(screw.def.id, "shcs");
  assert.equal(screw.params.q, "#10"); // the chart opens filtered to the #10 row
  const drill = first("#7 drill");
  assert.equal(drill.def.id, "drill-chart");
  assert.equal(drill.params.q, "#7");
  assert.ok(ids("6061").includes("materials"), "a grade number reaches the material library");
  // exact searches rank as before
  assert.equal(first("rpm").def.id, "feeds-mill");
  assert.equal(first("tap").def.id, "tap-drill");
  assert.deepEqual(ids("1/4-20").slice(0, 2), ["tap-drill", "thread-data"]);
});

/** The chart's rows as text, filtered by `q`: [first-column text, highlighted?]. */
function chartRows(id, q) {
  const def = getCalc(id);
  const { cells } = chartCells(def, { units: "in", L: UNIT_LABEL.in, settings: { units: "in", pro: true } });
  // the chart screen passes the definition's own flag (chart.js)
  return chartFilter(cells, { threadToSize: !!def.threadToSize })(q).map(({ i, hit }) => [cells[i][0], hit]);
}

test("G-code reference: leading zeros are optional, as on the control", () => {
  // Fanuc / Haas word address format: G1 = G01, M6 = M06, M3 = M03; M30 and G54.1 are their own codes
  assert.equal(normCodes("g01 m06 m30 g54.1 g10"), "g1 m6 m30 g54.1 g10");
  for (const [q, code] of [["M6", "M06"], ["M3", "M03"], ["G1", "G01"], ["G0", "G00"], ["M8", "M08"], ["M30", "M30"]]) {
    const rows = chartRows("gcode-ref", q);
    assert.equal(rows[0]?.[0], code, `${q} → ${rows[0]?.[0]}`);
    assert.equal(rows[0][1], true, `${code} is highlighted`);
  }
});

test("charts: the row named what was typed comes first; a thread callout finds its screw", () => {
  // ASME B94.11M: letter E = 0.250 = 1/4"; #7 = 0.2010
  let rows = chartRows("drill-chart", "1/4");
  assert.match(rows[0][0], /^1\/4"/);
  assert.equal(rows.filter(([, hit]) => hit).length, 1, "only the 1/4 drill is highlighted");
  assert.match(chartRows("drill-chart", "3/8")[0][0], /^3\/8"/);
  assert.equal(chartRows("drill-chart", "0.201")[0][0], "#7");
  // ASME B18.3 clearance chart lists screws by size; a 1/4-20 is the 1/4 screw, never the #5
  for (const q of ["1/4-20", "1/4 20", "1/4-28"]) assert.equal(chartRows("shcs", q)[0]?.[0], "1/4 SHCS", q);
  assert.equal(chartRows("shcs", "#10-32")[0]?.[0], "#10 SHCS");
  assert.equal(chartRows("shcs", "3/8 16")[0]?.[0], "3/8 SHCS");
  assert.equal(chartRows("shcs", "M8x1.25")[0]?.[0], "M8 SHCS");
  assert.equal(threadCallout("1 1/8-7"), "1-1/8-7");
  assert.equal(chartRows("tap-drill-chart", "1 1/8-7")[0]?.[0], "1-1/8-7 UNC");
});

// ── app team fixes, round 3 (10/02/2026) ──

// Machinery's Handbook tap drill chart (ASME B1.1, 75 % thread): 1/4-20 → #7 (0.201), #10-32 → #21 (0.159),
// 5/16-18 → F (0.257). A drill the size of the thread's major diameter leaves no thread to cut.
test("a thread callout is a screw size only on a chart listed by screw size, never a drill on the drill chart", () => {
  assert.equal(getCalc("shcs").threadToSize, true, "the clearance chart opts in (reference.js)");
  assert.ok(!getCalc("drill-chart").threadToSize);
  for (const q of ["1/4-20", "#10-32", "5/16-18", "1/4 20"]) {
    const hits = chartRows("drill-chart", q).filter(([, hit]) => hit).map(([name]) => name);
    assert.ok(!hits.some((n) => /^(1\/4"|#10|5\/16")/.test(n)), `${q} highlights ${hits}`);
  }
  // the fallback is opt-in on the filter itself
  const cells = [["1/4 SHCS", "0.266"], ["#5 SHCS", "1/4"]];
  assert.deepEqual(chartFilter(cells)("1/4-20"), []);
  assert.equal(chartFilter(cells, { threadToSize: true })("1/4-20")[0].i, 0);
  // home search: no thread filter handed to the drill chart, but the tap drill chart still opens on its row
  const drill = searchCalcs("drill chart 1/4-20", allCalcs()).find((h) => h.def.id === "drill-chart");
  assert.equal(drill?.params?.q, undefined);
  assert.equal(searchCalcs("what drill for 1/4-20", allCalcs()).find((h) => h.def.id === "drill-chart")?.params?.q, undefined);
  assert.equal(first("tap drill chart 1/4-20").params.q, "1/4-20");
});

// ASME B18.3 lists #10 by its screw (0.190 major); ASME B94.11M's #10 drill is 0.1935. A counterbore, clearance
// hole or spotface only exists for a fastener, so those words make #10 the screw.
test("a numbered size next to counterbore or clearance words is a screw, not a number drill", () => {
  for (const q of ["#10 counterbore", "counterbore for #10", "#10 clearance", "#10 cbore", "#10 spotface", "#10 drill clearance", "clearance drill for #10"]) {
    const top = first(q);
    assert.equal(top?.def.id, "shcs", `${q} → ${top?.def.id}`);
    assert.equal(top.params.q, "#10", q);
  }
  assert.equal(first("#7 drill").def.id, "drill-chart");
  assert.equal(first("#10").def.id, "drill-chart");
  assert.equal(first("#10 drill").def.id, "drill-chart");
});

// ISO 2306 / DIN 336 tap drill = D − P: M10x1.25 → 8.75 → 8.8 mm, not the 8.5 mm of M10x1.5.
test("a thread typed with a space before its pitch opens that pitch, the way the chart filter reads it", () => {
  for (const [q, want] of [["M10 1.25", "M10x1.25"], ["m8 1", "M8x1"], ["tap drill M8 1", "M8x1"], ["1/4 28", "1/4-28"], ["1/4 20", "1/4-20"], ["what drill for 3/8 24", "3/8-24"]]) {
    const tap = searchCalcs(q, allCalcs()).find((h) => h.def.id === "tap-drill");
    assert.equal(tap?.params?.thread, want, q);
  }
  assert.equal(first("M10 1.25").params.thread, "M10x1.25");
  // a mixed number stays a size, and a flute count is not a pitch
  assert.equal(first("1 1/4").params.value, "1 1/4");
  assert.equal(searchCalcs("1/2 2 flute end mill", allCalcs()).find((h) => h.params?.thread), undefined);
});

// Machinery's Handbook tap drill chart: #10-32 → #21 (0.159), #8-32 → #29, #4-40 → #43. A numbered screw typed with
// a space before its TPI is that thread, read the way tap-drill-chart's own filter reads it (threadCallout).
// ASME B1.1 Table 1: 1/2-8 isn't listed (8-UN starts at 1 in), and a pitch followed by "flute" is a flute count.
test("a numbered screw or a spaced thread is read the same in home search and the chart filter; a flute count is not a pitch", () => {
  for (const [q, want] of [["#10 32", "#10-32"], ["#8 32", "#8-32"], ["#4 40", "#4-40"], ["#10 24", "#10-24"], ["tap drill #10 32", "#10-32"]]) {
    assert.equal(threadCallout(q.replace(/^tap drill /, "")), want, "chart filter");
    const hits = searchCalcs(q, allCalcs());
    assert.equal(hits.find((h) => h.def.id === "tap-drill")?.params?.thread, want, q);
    // the drill chart is never filtered to the TPI alone (the 32 mm drill)
    assert.ok(!hits.some((h) => h.def.id === "drill-chart" && /^\d+$/.test(h.params?.q ?? "")), `${q} → drill-chart q ${hits.find((h) => h.def.id === "drill-chart")?.params?.q}`);
  }
  assert.equal(searchCalcs("tap drill chart #10 32", allCalcs()).find((h) => h.def.id === "tap-drill-chart")?.params?.q, "#10-32");
  // a numbered size with no pitch keeps its old reading
  assert.equal(first("#7 drill").def.id, "drill-chart");
  assert.equal(first("#7 drill").params.q, "#7");
  for (const q of ["1/2 8 flute", "3/4 10 flute end mill", "1/2 8 flute end mill", "1/2 8", "3/8 4 fl"]) {
    assert.equal(searchCalcs(q, allCalcs()).find((h) => h.params?.thread), undefined, q);
  }
  assert.equal(searchCalcs("3/4 10", allCalcs()).find((h) => h.def.id === "tap-drill")?.params?.thread, "3/4-10");
});

// ISO 261 writes a fine thread "M10 x 1.25"; ISO 2306 / DIN 336 tap drill D − P = 8.75 → 8.8 mm (coarse M10 is 8.5).
test("a thread with a spaced separator keeps its pitch; a pitch thread.js cautions on is not joined", () => {
  for (const [q, want] of [["M10 x 1.25 tap drill", "M10x1.25"], ["tap drill M10 x 1.25", "M10x1.25"], ["M10 × 1.25", "M10x1.25"],
    ["M10 x1.25", "M10x1.25"], ["M10 ×1.25", "M10x1.25"], ["M8 x 1", "M8x1"], ["1/4 - 28", "1/4-28"], ["#10 x 32", "#10-32"]]) {
    const hits = searchCalcs(q, allCalcs());
    const thread = hits.find((h) => h.params?.thread)?.params.thread;
    assert.equal(thread, want, q);
    for (const h of hits) if (h.params?.thread) assert.equal(h.params.thread, want, `${q} → ${h.def.id}`);
  }
  assert.equal(first("M10 x 1.25 tap drill").def.id, "tap-drill");
  // a flute count after a separator is still not a pitch, and a screw length is not one either (ASME B1.1, ISO 261)
  for (const q of ["1/2 x 2 flute end mill", "M8 x 20", "1/4 x 1"]) {
    assert.equal(searchCalcs(q, allCalcs()).find((h) => h.params?.thread && /x20|-1$|-2$/.test(h.params.thread)), undefined, q);
  }
  // "M10 3" is two numbers, not M10x3 (coarser than any standard thread)
  assert.equal(searchCalcs("M10 3", allCalcs()).find((h) => h.params?.thread === "M10x3"), undefined);
});

test("endmill spellings and a material word next to a tool's own word still find the tool", () => {
  for (const q of ["endmill", "end-mill", "endmills", "endmill aluminum", "how fast should i run a 1/2 endmill in aluminum"]) assert.equal(first(q)?.def.id, "feeds-mill", q);
  assert.equal(first("steel hardness")?.def.id, "hardness");
  assert.ok(["tap-drill", "tapping-feed"].includes(first("brass tap")?.def.id), first("brass tap")?.def.id);
  assert.ok(["tap-drill", "tapping-feed"].includes(first("tap aluminum")?.def.id));
  // a material alone, or with a material property, keeps working
  assert.ok(ids("aluminum").includes("materials"));
  assert.ok(ids("aluminum density").includes("materials"));
  assert.equal(first("steel weight").def.id, "material-weight");
});

test("search reads a size with the same parser the fraction converter runs", () => {
  for (const q of ["8.5 mm", "8.5 millimeters", '3/8"', "1 1/4", "1-1/4", "13/64in"]) {
    assert.deepEqual(recognize.number(q), readSize(q) && { value: readSize(q).value, unit: readSize(q).unit }, q);
  }
  const conv = searchCalcs("1 1/4", allCalcs()).find((h) => h.def.id === "fraction-converter");
  assert.equal(readSize(conv.params.value).value, 1.25);
});
