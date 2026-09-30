// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// American National Standard Taper Pipe Threads. Source: ASME B1.20.1 Table 2 (basic dimensions)
// and common tap-drill charts (with / without a taper reamer). Inches.
// E0 = pitch diameter at the small end of the external thread; E1 = at the hand-tight plane (E0 + L1/16).
// L1 = hand-tight engagement; L2 = effective external thread length. Taper is 1/16 on diameter (3/4 in/ft).

export const NPT_TAPER_HALF_ANGLE = 1.7899;
export const NPT_TAPER_PER_FOOT = 0.75;

/** name, tpi, OD, E0, L1, L2, drill with reamer, drill without reamer */
export const NPT_TABLE = Object.freeze([
  { name: "1/16-27", tpi: 27, od: 0.3125, e0: 0.27118, l1: 0.160, l2: 0.2611, drillReam: ["C", 0.242], drill: ["D", 0.246] },
  { name: "1/8-27", tpi: 27, od: 0.405, e0: 0.36351, l1: 0.1615, l2: 0.2639, drillReam: ["R", 0.339], drill: ['11/32"', 0.34375] },
  { name: "1/4-18", tpi: 18, od: 0.540, e0: 0.47739, l1: 0.2278, l2: 0.4018, drillReam: ['7/16"', 0.4375], drill: ['29/64"', 0.453125] },
  { name: "3/8-18", tpi: 18, od: 0.675, e0: 0.61201, l1: 0.240, l2: 0.4078, drillReam: ['37/64"', 0.578125], drill: ['19/32"', 0.59375] },
  { name: "1/2-14", tpi: 14, od: 0.840, e0: 0.75843, l1: 0.320, l2: 0.5337, drillReam: ['45/64"', 0.703125], drill: ['23/32"', 0.71875] },
  { name: "3/4-14", tpi: 14, od: 1.050, e0: 0.96768, l1: 0.339, l2: 0.5457, drillReam: ['59/64"', 0.921875], drill: ['15/16"', 0.9375] },
  { name: "1-11.5", tpi: 11.5, od: 1.315, e0: 1.21363, l1: 0.400, l2: 0.6828, drillReam: ['1-5/32"', 1.15625], drill: ['1-3/16"', 1.1875] },
  { name: "1-1/4-11.5", tpi: 11.5, od: 1.660, e0: 1.55713, l1: 0.420, l2: 0.7068, drillReam: ['1-1/2"', 1.5], drill: ['1-33/64"', 1.515625] },
  { name: "1-1/2-11.5", tpi: 11.5, od: 1.900, e0: 1.79609, l1: 0.420, l2: 0.7235, drillReam: ['1-47/64"', 1.734375], drill: ['1-3/4"', 1.75] },
  { name: "2-11.5", tpi: 11.5, od: 2.375, e0: 2.26902, l1: 0.436, l2: 0.7565, drillReam: ['2-7/32"', 2.21875], drill: ['2-1/4"', 2.25] },
  { name: "2-1/2-8", tpi: 8, od: 2.875, e0: 2.71953, l1: 0.682, l2: 1.1375, drillReam: ['2-5/8"', 2.625], drill: ['2-21/32"', 2.65625] },
  { name: "3-8", tpi: 8, od: 3.500, e0: 3.34062, l1: 0.766, l2: 1.2000, drillReam: ['3-1/4"', 3.25], drill: ['3-9/32"', 3.28125] },
]);
