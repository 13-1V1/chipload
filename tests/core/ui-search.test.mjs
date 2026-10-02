// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Home search and chart filters: a value typed the way a machinist writes it lands on the right tool
// and the right row. Sizes are checked against the standards they come from.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs, getCalc } from "../../src/app/registry.js";
import { searchCalcs, recognize } from "../../src/app/search.js";
import { chartFilter, normCodes, threadCallout } from "../../src/app/chart-filter.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

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
  const ctx = { units: "in", L: UNIT_LABEL.in, settings: { units: "in", pro: true } };
  const cols = typeof def.columns === "function" ? def.columns(ctx) : def.columns;
  const rows = def.rows(ctx);
  const cell = (r, c) => typeof r[c.key] === "number" ? fmt(r[c.key], c.places ?? 4) : String(r[c.key] ?? "");
  const cells = rows.map((r) => cols.map((c) => cell(r, c)));
  return chartFilter(cells)(q).map(({ i, hit }) => [cells[i][0], hit]);
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
