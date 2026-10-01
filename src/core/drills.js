// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Nearest-drill lookups against the standard inch and metric charts.

import { DRILL_CHART_INCH, DRILL_CHART_MM } from "../data/drills.js";

function nearestIndex(values, target) {
  let bestIdx = 0, bestDelta = Infinity;
  for (let i = 0; i < values.length; i++) {
    const delta = Math.abs(target - values[i]);
    if (delta < bestDelta) { bestIdx = i; bestDelta = delta; }
  }
  return bestIdx;
}

const INCH_SIZES = DRILL_CHART_INCH.map((entry) => entry[0]);

const inchEntry = (i) => (i >= 0 && i < DRILL_CHART_INCH.length) ? { size: DRILL_CHART_INCH[i][0], label: DRILL_CHART_INCH[i][1] } : null;
const mmEntry = (i) => (i >= 0 && i < DRILL_CHART_MM.length) ? { size: DRILL_CHART_MM[i], label: `${DRILL_CHART_MM[i]} mm` } : null;

export function nearestDrillInch(sizeIn) {
  return inchEntry(nearestIndex(INCH_SIZES, sizeIn));
}

export function nearestDrillMm(sizeMm) {
  return mmEntry(nearestIndex(DRILL_CHART_MM, sizeMm));
}

/** { prev, nearest, next } around the closest inch drill. */
export function nearestDrillsInch(sizeIn) {
  const i = nearestIndex(INCH_SIZES, sizeIn);
  return { prev: inchEntry(i - 1), nearest: inchEntry(i), next: inchEntry(i + 1) };
}

export function nearestDrillsMm(sizeMm) {
  const i = nearestIndex(DRILL_CHART_MM, sizeMm);
  return { prev: mmEntry(i - 1), nearest: mmEntry(i), next: mmEntry(i + 1) };
}

/** Full inch chart as rows for the drill-chart screen. */
export function drillChartRows() {
  return DRILL_CHART_INCH.map(([size, label]) => ({ size, label, mm: size * 25.4 }));
}
