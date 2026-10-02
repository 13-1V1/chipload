// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw: blade speed by material, tooth pitch by stock size, wheel ↔ blade speed.

import { SAW_CHART_FPM, SAW_RANGE_FPM, WOOD_IDS, SAW_SIZE_ADJUST, SAW_HARDNESS_DERATE, SAW_DRY_FACTOR, TOOTH_CHART, COMMON_TPI } from "../data/saw.js";

const RANGE_FAMILIES = ["Aluminum", "Magnesium & zinc", "Plastics & composites", "Other"];

/** Straight-line lookup in a [[x, y], …] table, held flat past either end. */
function interp(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * Bi-metal blade speed in ft/min for a library material ({ id, group, rating, hrc? }) and stock size (in).
 * Chart rows: LENOX Bi-Metal Speed Chart value × size adjustment × heat-treat derate (LENOX Guide to Band
 * Sawing p.21). Groups the chart doesn't list (aluminum, magnesium, plastics, wood, other) use a range.
 * Returns { start, min, max, fastLimit, slowLimit, basis, chartFpm, sizePct, hardPct, hrc, beyondChart, bimetalUnsuitable }.
 */
export function bandSawSpeed(m, thicknessIn = 4) {
  const wood = WOOD_IDS.includes(m.id);
  const chartFpm = wood ? undefined : SAW_CHART_FPM[m.id];
  const hrc = Number(m.hrc) || 0;
  if (chartFpm == null) {
    const key = wood ? "Wood" : m.group;
    const [lo, hi] = SAW_RANGE_FPM[key] || SAW_RANGE_FPM.Other;
    // Families the chart skips rank their members by rating (within-family scale); a chart-group row with no
    // mapping starts at that group's slowest chart speed.
    const ranked = RANGE_FAMILIES.includes(key) || !SAW_RANGE_FPM[key];
    const t = Math.max(0, Math.min(1, ((Number(m.rating) || 0) - 20) / 100));
    const start = wood ? 3000 : ranked ? Math.round(lo + (hi - lo) * t * 0.5) : lo;
    return { start, min: lo, max: hi, fastLimit: hi * 1.1, slowLimit: lo * 0.5, basis: wood ? "wood" : "range", hrc, beyondChart: false, bimetalUnsuitable: false };
  }
  const sizePct = interp(SAW_SIZE_ADJUST, thicknessIn > 0 ? thicknessIn : 4);
  const hardPct = hrc > 20 ? interp(SAW_HARDNESS_DERATE, hrc) : 0;
  const start = Math.round(chartFpm * (1 + sizePct / 100) * (1 - hardPct / 100));
  return {
    start, min: Math.round(start * SAW_DRY_FACTOR), max: start, fastLimit: start * 1.25, slowLimit: start * SAW_DRY_FACTOR,
    basis: "chart", chartFpm, sizePct, hardPct, hrc,
    beyondChart: hrc > 40,          // the LENOX derate table stops at 40 HRC
    bimetalUnsuitable: hrc >= 45,   // LENOX sells carbide-tipped (HRc) blades for through-hardened stock
  };
}

/**
 * Variable-pitch blade for the stock: "round" (diameter), "flat" (width of square/flat bar) or "tube" (wall).
 * Source: USA Band Saw Blades Tooth Selection Guide p.23, cross-checked with the LENOX bi-metal tooth chart.
 * Returns { pitch: "5/8", coarse, fine, mean, teethInCut, constant } — constant is the nearest one-pitch blade.
 */
export function bladeForStock(thicknessIn, shape = "round") {
  if (!(thicknessIn > 0)) return null;
  const chart = TOOTH_CHART[shape] || TOOTH_CHART.round;
  const pitch = chart.find(([upTo]) => thicknessIn < upTo)[1];
  const [coarse, fine] = pitch.split("/").map(Number);
  const mean = (coarse + fine) / 2;
  const constant = COMMON_TPI.reduce((a, b) => (Math.abs(b - mean) < Math.abs(a - mean) ? b : a));
  return { pitch, coarse, fine, mean, teethInCut: mean * thicknessIn, constant };
}

/** Blade speed from wheel diameter (in) and wheel RPM: FPM = π D RPM ÷ 12. */
export function bladeSpeedFromWheel(wheelDiaIn, rpm) {
  return (Math.PI * wheelDiaIn * rpm) / 12;
}

/** Wheel RPM needed for a blade speed. */
export function wheelRpmForSpeed(wheelDiaIn, fpm) {
  return (fpm * 12) / (Math.PI * wheelDiaIn);
}
