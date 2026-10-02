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

/**
 * Metric drill series in mm, ascending. ISO 235 / BS 328 (DIN 338 jobbers): 0.05 steps to 3, every 0.1 from
 * 3.0 to 13.9, every 0.25 from 14 to 25; then 0.5 steps to 60. Kept as extras: the quarter sizes from 10 to 14
 * that shops stock for tap drills, and the in-between sizes the Heli-Coil metric chart calls for.
 */
export const DRILL_CHART_MM = Object.freeze((() => {
  const out = new Set();
  for (let i = 4; i <= 60; i++) out.add(Math.round(i * 5) / 100);            // 0.20 … 3.00 by 0.05
  for (let i = 30; i <= 140; i++) out.add(i / 10);                           // 3.0 … 14.0 by 0.1
  for (let i = 56; i <= 100; i++) out.add(i / 4);                            // 14.00 … 25.00 by 0.25
  for (let i = 51; i <= 120; i++) out.add(i / 2);                            // 25.5 … 60.0 by 0.5
  for (const v of [10.25, 10.75, 11.25, 11.75, 12.25, 12.75, 13.25, 13.75]) out.add(v);
  for (const v of [3.15, 4.25, 6.25, 7.25, 8.25, 27.75]) out.add(v);         // Heli-Coil metric chart drills
  return [...out].sort((a, b) => a - b);
})());

/**
 * 60° thread-measuring wires as sold: one best-size wire per pitch, W = 0.57735 P (Pratt & Whitney / Thread Check
 * wire charts; Machinery's Handbook three-wire method). Inch: every UN pitch, 80 to 4 TPI (20 TPI = .02887).
 * mm: every ISO 261 pitch, 0.2 to 6 mm, to 0.0001 mm (1.5 mm = 0.8660, 1 mm = 0.5774). DIN 2269 metric sets use their own near-best series.
 */
export const WIRE_SET_INCH = Object.freeze([0.00722, 0.00802, 0.00902, 0.01031, 0.01203, 0.01312, 0.01443, 0.01604, 0.01804, 0.02062, 0.02138, 0.02406, 0.02887, 0.03208, 0.03608, 0.04124, 0.04441, 0.04811, 0.0502, 0.05249, 0.05774, 0.06415, 0.07217, 0.08248, 0.09623, 0.11547, 0.1283, 0.14434]);
export const WIRE_SET_MM = Object.freeze([0.1155, 0.1443, 0.1732, 0.2021, 0.2309, 0.2598, 0.2887, 0.3464, 0.4041, 0.433, 0.4619, 0.5774, 0.7217, 0.866, 1.0104, 1.1547, 1.4434, 1.7321, 2.0207, 2.3094, 2.5981, 2.8868, 3.1754, 3.4641]);
