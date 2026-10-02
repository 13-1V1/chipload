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

// The smallest drill at or above a size (a hole that must not be undersize). nearest is null past the chart end.
function atOrAboveIndex(values, target) {
  return values.findIndex((v) => v >= target - 1e-9);
}

/** { prev, nearest, next } where nearest is the smallest inch drill at or above sizeIn. */
export function drillsAtOrAboveInch(sizeIn) {
  const i = atOrAboveIndex(INCH_SIZES, sizeIn);
  return i < 0 ? { prev: inchEntry(INCH_SIZES.length - 1), nearest: null, next: null } : { prev: inchEntry(i - 1), nearest: inchEntry(i), next: inchEntry(i + 1) };
}

export function drillsAtOrAboveMm(sizeMm) {
  const i = atOrAboveIndex(DRILL_CHART_MM, sizeMm);
  return i < 0 ? { prev: mmEntry(DRILL_CHART_MM.length - 1), nearest: null, next: null } : { prev: mmEntry(i - 1), nearest: mmEntry(i), next: mmEntry(i + 1) };
}

/** Ends of the charts: a size past these has no drill near it (bore it). */
export const DRILL_MIN_IN = INCH_SIZES[0];
export const DRILL_MAX_IN = INCH_SIZES[INCH_SIZES.length - 1];
export const DRILL_MIN_MM = DRILL_CHART_MM[0];
export const DRILL_MAX_MM = DRILL_CHART_MM[DRILL_CHART_MM.length - 1];

/** Full inch chart as rows for the drill-chart screen. */
export function drillChartRows() {
  return DRILL_CHART_INCH.map(([size, label]) => ({ size, label, mm: size * 25.4 }));
}
