// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { nearestDrillInch, nearestDrillsInch, nearestDrillMm, nearestDrillsMm, drillsAtOrAboveMm, drillsAtOrAboveInch, drillChartRows } from "../../src/core/drills.js";
import { DRILL_CHART_INCH, DRILL_CHART_MM } from "../../src/data/drills.js";
import { STI_DRILL_METRIC } from "../../src/data/sti.js";
import { TAP_DRILL_METRIC_TABLE } from "../../src/data/threads-metric.js";

const onMmChart = (mm) => DRILL_CHART_MM.some((d) => Math.abs(d - mm) < 1e-9);

// ISO 235 / BS 328 metric series (Wikipedia "Drill bit sizes", metric section): every N·0.1 mm from 3.0 to
// 13.9, then M, M+0.25, M+0.5, M+0.75 from 14 to 25 mm.
test("metric chart carries the full ISO 235 series", () => {
  for (let n = 30; n <= 139; n++) assert.ok(onMmChart(n / 10), `${n / 10} mm missing`);
  for (let q = 56; q <= 100; q++) assert.ok(onMmChart(q / 4), `${q / 4} mm missing`);
  for (let i = 1; i < DRILL_CHART_MM.length; i++) assert.ok(DRILL_CHART_MM[i] > DRILL_CHART_MM[i - 1], `metric chart out of order at ${DRILL_CHART_MM[i]}`);
  assert.equal(DRILL_CHART_MM[DRILL_CHART_MM.length - 1], 60);
});

test("every published tap and STI drill is a drill on the chart", () => {
  for (const [key, row] of Object.entries(TAP_DRILL_METRIC_TABLE)) assert.ok(onMmChart(row[0]), `tap drill ${row[0]} mm (${key}) missing`);
  for (const [key, [steel, al]] of Object.entries(STI_DRILL_METRIC)) {
    assert.ok(onMmChart(steel), `STI drill ${steel} mm (${key}) missing`);
    assert.ok(onMmChart(al), `STI aluminum drill ${al} mm (${key}) missing`);
  }
});

// With the full series: DIN 336 lists 12.8 mm for M14x1.25 (75%: 14 − 0.974 × 1.25 = 12.78); 10.4 → next 10.5.
test("nearest metric picks land on the standard sizes between 10 and 25 mm", () => {
  assert.equal(nearestDrillMm(12.78).label, "12.8 mm");
  assert.equal(nearestDrillMm(15.3).label, "15.25 mm");
  assert.equal(nearestDrillsMm(10.4).next.label, "10.5 mm");
  assert.equal(nearestDrillMm(19.3).label, "19.25 mm");
});

test("at-or-above picks never come in under the size asked for", () => {
  assert.equal(drillsAtOrAboveMm(24.649).nearest.label, "24.75 mm");
  assert.equal(drillsAtOrAboveMm(10.5).nearest.label, "10.5 mm");
  assert.equal(drillsAtOrAboveMm(61).nearest, null);
  assert.equal(drillsAtOrAboveInch(1.02706).nearest.label, '1-1/32"');
  assert.equal(drillsAtOrAboveInch(0.2).nearest.label, "#7");
});

test("inch chart is sorted ascending with no duplicate sizes", () => {
  for (let i = 1; i < DRILL_CHART_INCH.length; i++) {
    assert.ok(DRILL_CHART_INCH[i][0] > DRILL_CHART_INCH[i - 1][0], `chart out of order at ${DRILL_CHART_INCH[i][1]}`);
  }
});

// ANSI B94.11M published sizes
test("letter and number drills match ANSI B94.11M", () => {
  assert.equal(nearestDrillInch(0.257).label, "F");
  assert.equal(nearestDrillInch(0.2210).label, "#2");
  assert.equal(nearestDrillInch(0.2280).label, "#1");
  assert.equal(nearestDrillInch(0.413).label, "Z");
  assert.equal(nearestDrillInch(0.0135).label, "#80");
  const around = nearestDrillsInch(0.201);
  assert.equal(around.nearest.label, "#7");
  assert.equal(around.prev.label, "#8");
  assert.equal(around.next.label, '13/64"', "13/64 (0.2031) sits between #7 and #6");
});

test("metric nearest and chart rows", () => {
  assert.equal(nearestDrillMm(8.4).label, "8.4 mm");
  const rows = drillChartRows();
  assert.ok(rows.length > 150);
  assert.ok(Math.abs(rows.find(r => r.label === '1/2"').mm - 12.7) < 1e-9);
});

test("fractional drills: every 64th is there, chart runs to 3-1/2 in and 60 mm", () => {
  for (let n = 1; n <= 112; n++) assert.ok(DRILL_CHART_INCH.some((d) => Math.abs(d[0] - n / 64) < 1e-9), `${n}/64 missing`);
  assert.equal(nearestDrillInch(3 / 64).label, '3/64"');
  assert.equal(nearestDrillInch(0.203125).label, '13/64"');
  assert.equal(nearestDrillInch(1.1094).label, '1-7/64"');
  assert.equal(nearestDrillInch(1.3438).label, '1-11/32"');
  assert.equal(nearestDrillInch(0.25).label, '1/4" (E)');
  assert.equal(DRILL_CHART_INCH[DRILL_CHART_INCH.length - 1][1], '3-1/2"');
  assert.equal(nearestDrillMm(26.5).label, "26.5 mm");
  assert.equal(nearestDrillMm(20.5).label, "20.5 mm");
  assert.equal(nearestDrillMm(58).label, "58 mm");
});
