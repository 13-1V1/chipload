// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Drill size charts. Source: ANSI/ASME B94.11M (number, letter, and fractional series) and the
// ISO 235 / DIN 338 metric series. The inch chart is [diameter_in, label], ascending.
// Fractional sizes are generated so none can be mistyped or left out: every 1/64 to 1-3/4",
// every 1/32 to 2-1/4", every 1/16 to 3-1/2" (the B94.11M increments).

const NUMBER_DRILLS = [
  [80, 0.0135], [79, 0.0145], [78, 0.016], [77, 0.018], [76, 0.02], [75, 0.021], [74, 0.0225], [73, 0.024], [72, 0.025], [71, 0.026],
  [70, 0.028], [69, 0.0292], [68, 0.031], [67, 0.032], [66, 0.033], [65, 0.035], [64, 0.036], [63, 0.037], [62, 0.038], [61, 0.039],
  [60, 0.04], [59, 0.041], [58, 0.042], [57, 0.043], [56, 0.0465], [55, 0.052], [54, 0.055], [53, 0.0595], [52, 0.0635], [51, 0.067],
  [50, 0.07], [49, 0.073], [48, 0.076], [47, 0.0785], [46, 0.081], [45, 0.082], [44, 0.086], [43, 0.089], [42, 0.0935], [41, 0.096],
  [40, 0.098], [39, 0.0995], [38, 0.1015], [37, 0.104], [36, 0.1065], [35, 0.11], [34, 0.111], [33, 0.113], [32, 0.116], [31, 0.12],
  [30, 0.1285], [29, 0.136], [28, 0.1405], [27, 0.144], [26, 0.147], [25, 0.1495], [24, 0.152], [23, 0.154], [22, 0.157], [21, 0.159],
  [20, 0.161], [19, 0.166], [18, 0.1695], [17, 0.173], [16, 0.177], [15, 0.18], [14, 0.182], [13, 0.185], [12, 0.189], [11, 0.191],
  [10, 0.1935], [9, 0.196], [8, 0.199], [7, 0.201], [6, 0.204], [5, 0.2055], [4, 0.209], [3, 0.213], [2, 0.221], [1, 0.228],
];

const LETTER_DRILLS = [
  ["A", 0.234], ["B", 0.238], ["C", 0.242], ["D", 0.246], ["E", 0.25], ["F", 0.257], ["G", 0.261], ["H", 0.266], ["I", 0.272], ["J", 0.277],
  ["K", 0.281], ["L", 0.29], ["M", 0.295], ["N", 0.302], ["O", 0.316], ["P", 0.323], ["Q", 0.332], ["R", 0.339], ["S", 0.348], ["T", 0.358],
  ["U", 0.368], ["V", 0.377], ["W", 0.386], ["X", 0.397], ["Y", 0.404], ["Z", 0.413],
];

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/** '27/64"', '1-3/64"', '2"' */
export function fractionLabel(numerator, denominator) {
  const g = gcd(numerator, denominator);
  const n = numerator / g, d = denominator / g;
  const whole = Math.floor(n / d), rem = n - whole * d;
  if (rem === 0) return `${whole}"`;
  return whole ? `${whole}-${rem}/${d}"` : `${rem}/${d}"`;
}

function buildInchChart() {
  const bySize = new Map();
  const add = (size, label) => {
    const key = size.toFixed(6);
    // a letter drill and a fraction can share a size (E = 1/4"): show both
    bySize.set(key, bySize.has(key) ? [size, `${bySize.get(key)[1]} (${label})`] : [size, label]);
  };
  for (let n = 1; n <= 112; n++) add(n / 64, fractionLabel(n, 64));          // 1/64 … 1-3/4
  for (let n = 57; n <= 72; n++) add(n / 32, fractionLabel(n, 32));          // 1-25/32 … 2-1/4
  for (let n = 37; n <= 56; n++) add(n / 16, fractionLabel(n, 16));          // 2-5/16 … 3-1/2
  for (const [num, size] of NUMBER_DRILLS) add(size, `#${num}`);
  for (const [letter, size] of LETTER_DRILLS) add(size, letter);
  return [...bySize.values()].sort((a, b) => a[0] - b[0]);
}

export const DRILL_CHART_INCH = Object.freeze(buildInchChart());

/** Metric drill series in mm, ascending: 0.05 steps to 3, 0.1 to 10, common sizes to 14, then every 0.5 to 60. */
export const DRILL_CHART_MM = Object.freeze((() => {
  const out = new Set();
  for (let i = 6; i <= 60; i++) out.add(Math.round(i * 5) / 100);            // 0.30 … 3.00 by 0.05
  for (let i = 30; i <= 100; i++) out.add(Math.round(i) / 10);               // 3.0 … 10.0 by 0.1
  for (const v of [10.2, 10.25, 10.5, 10.75, 10.8, 11.0, 11.2, 11.25, 11.5, 11.75, 11.8, 12.0, 12.25, 12.5, 12.75, 13.0, 13.25, 13.5, 13.75, 14.0]) out.add(v);
  for (let i = 29; i <= 120; i++) out.add(i / 2);                            // 14.5 … 60.0 by 0.5
  return [...out].sort((a, b) => a - b);
})());

/** Standard thread-wire sets. Inch set per common 3-wire kits; mm set per DIN 2269 style kits. */
export const WIRE_SET_INCH = Object.freeze([0.010, 0.012, 0.014, 0.016, 0.018, 0.020, 0.022, 0.024, 0.025, 0.026, 0.028, 0.030, 0.032, 0.035, 0.040, 0.045, 0.050, 0.055, 0.060, 0.063, 0.070, 0.080, 0.090, 0.100]);
export const WIRE_SET_MM = Object.freeze([0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.10, 1.20, 1.30, 1.40, 1.50, 1.60, 1.70, 1.80, 2.00]);
