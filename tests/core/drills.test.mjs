// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { nearestDrillInch, nearestDrillsInch, nearestDrillMm, drillChartRows } from "../../src/core/drills.js";
import { DRILL_CHART_INCH } from "../../src/data/drills.js";

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
