// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw: blade speed by material, tooth pitch by stock thickness, wheel ↔ blade speed.

import { SAW_SPEEDS_FPM, COMMON_TPI } from "../data/saw.js";

/** { start, max } blade speed in ft/min for a material group. Harder-to-machine members of a group sit near `start`. */
export function bandSawSpeed(group, rating = 100) {
  const [lo, hi] = SAW_SPEEDS_FPM[group] || SAW_SPEEDS_FPM.Other;
  // Rating is vs. B1112 = 100%; scale within the group's range, clamped.
  const t = Math.max(0, Math.min(1, (rating - 20) / 100));
  return { start: Math.round(lo + (hi - lo) * t * 0.5), max: hi, min: lo };
}

/**
 * Tooth pitch rule: keep at least 3 teeth in the cut and no more than 24 (ideally 6–12),
 * so chips clear and the blade doesn't strip. thickness in inches.
 * Source: Machinery's Handbook "Band Saw Blade Selection"; blade maker charts.
 */
export function tpiForThickness(thicknessIn) {
  if (!(thicknessIn > 0)) return null;
  const minTpi = 3 / thicknessIn;
  const maxTpi = 24 / thicknessIn;
  const ideal = 8 / thicknessIn;
  const usable = COMMON_TPI.filter((t) => t >= minTpi - 1e-9 && t <= maxTpi + 1e-9);
  const pick = (usable.length ? usable : COMMON_TPI).reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a));
  return { minTpi, maxTpi, ideal, pick, teethInCut: pick * thicknessIn, usable };
}

/** Blade speed from wheel diameter (in) and wheel RPM: FPM = π D RPM ÷ 12. */
export function bladeSpeedFromWheel(wheelDiaIn, rpm) {
  return (Math.PI * wheelDiaIn * rpm) / 12;
}

/** Wheel RPM needed for a blade speed. */
export function wheelRpmForSpeed(wheelDiaIn, fpm) {
  return (fpm * 12) / (Math.PI * wheelDiaIn);
}
