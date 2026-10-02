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
 * Returns { pitch: "5/8", coarse, fine, mean, teethInCut, constant, thin } — constant is the nearest one-pitch
 * blade. On a tie (3/4 → 3 or 4) the coarser one stands while it keeps 3 teeth in the cut, the usual minimum;
 * past that the finer one wins (1/8 in on 14/18 → 18, not 14). Under THIN_STOCK_IN (thin: true) it is the finest
 * common blade, 24 TPI, the one the tool's thin-stock warning names.
 */
export function bladeForStock(thicknessIn, shape = "round") {
  if (!(thicknessIn > 0)) return null;
  const chart = TOOTH_CHART[shape] || TOOTH_CHART.round;
  const pitch = chart.find(([upTo]) => thicknessIn < upTo)[1];
  const [coarse, fine] = pitch.split("/").map(Number);
  const mean = (coarse + fine) / 2;
  const thin = thicknessIn < THIN_STOCK_IN;
  const nearest = COMMON_TPI.reduce((a, b) => {
    const da = Math.abs(a - mean), db = Math.abs(b - mean);
    return db < da || (db === da && a * thicknessIn < 3) ? b : a;   // COMMON_TPI runs coarse → fine, so b is finer
  });
  const constant = thin ? COMMON_TPI[COMMON_TPI.length - 1] : nearest;
  return { pitch, coarse, fine, mean, teethInCut: mean * thicknessIn, constant, thin };
}

/** Stock under 3/32 in: fewer than 3 teeth in the cut even on the chart's finest blade, so it gets the finest you can buy. */
export const THIN_STOCK_IN = 3 / 32;

/**
 * Wood stock this thick and up takes a 4 TPI hook-tooth blade (Olson: 4 TPI from 3/4 in). Set at 19 mm (0.748 in),
 * the metric 3/4 board, so a 19 mm entry lands on the side the "from 19 mm up" line promises;
 * 4 TPI × 0.748 in = 2.99 teeth, still the 3-tooth rule to the figure shown.
 */
export const WOOD_HOOK_MIN_IN = 19 / 25.4;

/**
 * From here up the hook blade can be 3–4 TPI: Olson gives 3 TPI from 1 in, where 3 TPI × 1 in = 3 teeth. Exactly
 * 1 in (25.4 mm), not the 25 mm metric board: 3 TPI × 0.984 in = 2.95 teeth, and the inch line "from 1 in up" would
 * be wrong from 0.984 to 1 in. A 25 mm board gets 4 TPI (3.9 teeth).
 */
export const WOOD_HOOK_3TPI_MIN_IN = 1;

/**
 * Band saw blade for wood (the metal tooth chart doesn't apply). Olson Saw, "What band saw blade should I get?"
 * (olsonsaw.net, 2024): at least 3 teeth in the work; hook tooth for thick wood and resawing; 4 TPI from 3/4 in,
 * 6 from 1/2, 8 from 3/8, 10 from 5/16, 14 from 1/4 (each = 3 teeth in the cut). Laguna's blade guide gives the same
 * 3-tooth minimum. Hook tooth: 4 TPI from WOOD_HOOK_MIN_IN, 3–4 TPI from WOOD_HOOK_3TPI_MIN_IN. Under that this picks
 * the coarsest common pitch that keeps 3 teeth in the cut; stock too thin for 3 teeth even on the finest common blade
 * (24 TPI, so under 1/8 in) is `thin`. Returns { tooth: "hook" | "regular", tpi: "3–4" | "4" | "6" …, teethInCut
 * (null for the hook range), thin }.
 */
export function woodBladeForStock(thicknessIn) {
  if (!(thicknessIn > 0)) return null;
  if (thicknessIn >= WOOD_HOOK_MIN_IN) return { tooth: "hook", tpi: thicknessIn >= WOOD_HOOK_3TPI_MIN_IN ? "3–4" : "4", teethInCut: null, thin: false };
  const need = 3 / thicknessIn;
  const tpi = COMMON_TPI.find((n) => n >= need - 1e-9) ?? COMMON_TPI[COMMON_TPI.length - 1];
  return { tooth: "regular", tpi: String(tpi), teethInCut: tpi * thicknessIn, thin: tpi * thicknessIn < 3 - 1e-9 };
}

/** Blade speed from wheel diameter (in) and wheel RPM: FPM = π D RPM ÷ 12. */
export function bladeSpeedFromWheel(wheelDiaIn, rpm) {
  return (Math.PI * wheelDiaIn * rpm) / 12;
}

/** Wheel RPM needed for a blade speed. */
export function wheelRpmForSpeed(wheelDiaIn, fpm) {
  return (fpm * 12) / (Math.PI * wheelDiaIn);
}
