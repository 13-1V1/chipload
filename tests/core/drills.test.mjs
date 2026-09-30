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
  assert.equal(around.next.label, "#6");
});

test("metric nearest and chart rows", () => {
  assert.equal(nearestDrillMm(8.4).label, "8.4 mm");
  const rows = drillChartRows();
  assert.ok(rows.length > 150);
  assert.ok(Math.abs(rows.find(r => r.label === '1/2"').mm - 12.7) < 1e-9);
});
