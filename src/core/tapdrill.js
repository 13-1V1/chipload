// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tap drill sizing: table lookup and percent-of-thread formula.

import { TAP_DRILL_UN_TABLE } from "../data/threads-un.js";
import { TAP_DRILL_METRIC_TABLE } from "../data/threads-metric.js";

/**
 * Cut-tap drill diameter for a given % of full thread.
 * Source: Machinery's Handbook "Tap Drill Sizes" — drill = D − (0.01299 × %thread) / TPI
 * for inch; generalized here as D − (% / 76.98) × P which is the same relationship.
 */
export function tapDrillByPercent(major, pitch, percent) {
  return major - ((percent / 76.98) * pitch);
}

/** Inverse: % thread a given drill produces. */
export function percentThreadForDrill(major, pitch, drill) {
  return ((major - drill) / pitch) * 76.98;
}

/**
 * Roll-form (thread forming) tap drill. Source: common tap-maker guidance
 * (Emuge / OSG): drill ≈ D − 0.0068 × %thread × P, i.e. much larger than cut-tap.
 */
export function formTapDrillByPercent(major, pitch, percent) {
  return major - (0.0068 * percent * pitch);
}

/** Published stock drill for a UN size (~75%), or null. */
export function lookupTapDrillUN(majorIn, tpi) {
  const key = `${majorIn.toFixed(4)}|${tpi | 0}`;
  const row = TAP_DRILL_UN_TABLE[key];
  return row ? { size: row[0], label: row[1], percent: row[2] } : null;
}

export function lookupTapDrillMetric(majorMm, pitchMm) {
  const key = `${majorMm.toFixed(1)}|${pitchMm.toFixed(2)}`;
  const row = TAP_DRILL_METRIC_TABLE[key];
  return row ? { size: row[0], label: row[1], percent: row[2] } : null;
}
