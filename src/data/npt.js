// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// American National Standard Taper Pipe Threads. Source: ASME B1.20.1 Table 2 (basic dimensions). Inches.
// E0 = pitch diameter at the small end of the external thread; E1 = at the hand-tight plane (E0 + L1/16).
// L1 = hand-tight engagement; L2 = effective external thread length; L3 = wrench makeup (3 threads for
// 2 in and smaller, 2 threads for larger sizes). Taper is 1/16 on diameter (3/4 in/ft).
//
// Tap drills. A taper-pipe drill has to stay under the internal minor diameter at the opening of the
// hole (E0 − 0.8P + L1/16), or the first threads come out short of full form and the joint weeps.
//   drill  — drill only: the common NPT shop chart (Engineers Edge "Pipe Thread Tap and Drill Size
//            Chart", 1/8 R … 3 3-1/4); 1/16 D from the same chart family (Carbide Depot pipe tap chart).
//   drillReam — drill, then a 3/4 in/ft taper reamer: Machinery's Handbook / ASME B1.20.1 practice as
//            tabulated by AmesWeb (1/16 A … 2-1/2 2-37/64). 3-8 is not in that table: 3-13/64 keeps the
//            same 1/32 under the no-ream drill that 2-1/2-8 has.
// (The straight-pipe NPS chart — S, 29/64, 19/32 … — is for NPS taps only; it is too big for NPT.)

export const NPT_TAPER_HALF_ANGLE = 1.7899;
export const NPT_TAPER_PER_FOOT = 0.75;

/** name, tpi, OD, E0, L1, L2, L3, drill with reamer, drill without reamer */
export const NPT_TABLE = Object.freeze([
  { name: "1/16-27", tpi: 27, od: 0.3125, e0: 0.27118, l1: 0.160, l2: 0.2611, l3: 0.1111, drillReam: ["A", 0.234], drill: ["D", 0.246] },
  { name: "1/8-27", tpi: 27, od: 0.405, e0: 0.36351, l1: 0.1615, l2: 0.2639, l3: 0.1111, drillReam: ['21/64"', 0.328125], drill: ["R", 0.339] },
  { name: "1/4-18", tpi: 18, od: 0.540, e0: 0.47739, l1: 0.2278, l2: 0.4018, l3: 0.1667, drillReam: ['27/64"', 0.421875], drill: ['7/16"', 0.4375] },
  { name: "3/8-18", tpi: 18, od: 0.675, e0: 0.61201, l1: 0.240, l2: 0.4078, l3: 0.1667, drillReam: ['9/16"', 0.5625], drill: ['37/64"', 0.578125] },
  { name: "1/2-14", tpi: 14, od: 0.840, e0: 0.75843, l1: 0.320, l2: 0.5337, l3: 0.2143, drillReam: ['11/16"', 0.6875], drill: ['23/32"', 0.71875] },
  { name: "3/4-14", tpi: 14, od: 1.050, e0: 0.96768, l1: 0.339, l2: 0.5457, l3: 0.2143, drillReam: ['57/64"', 0.890625], drill: ['59/64"', 0.921875] },
  { name: "1-11.5", tpi: 11.5, od: 1.315, e0: 1.21363, l1: 0.400, l2: 0.6828, l3: 0.2609, drillReam: ['1-1/8"', 1.125], drill: ['1-5/32"', 1.15625] },
  { name: "1-1/4-11.5", tpi: 11.5, od: 1.660, e0: 1.55713, l1: 0.420, l2: 0.7068, l3: 0.2609, drillReam: ['1-15/32"', 1.46875], drill: ['1-1/2"', 1.5] },
  { name: "1-1/2-11.5", tpi: 11.5, od: 1.900, e0: 1.79609, l1: 0.420, l2: 0.7235, l3: 0.2609, drillReam: ['1-45/64"', 1.703125], drill: ['1-47/64"', 1.734375] },
  { name: "2-11.5", tpi: 11.5, od: 2.375, e0: 2.26902, l1: 0.436, l2: 0.7565, l3: 0.2609, drillReam: ['2-11/64"', 2.171875], drill: ['2-7/32"', 2.21875] },
  { name: "2-1/2-8", tpi: 8, od: 2.875, e0: 2.71953, l1: 0.682, l2: 1.1375, l3: 0.2500, drillReam: ['2-37/64"', 2.578125], drill: ['2-5/8"', 2.625] },
  { name: "3-8", tpi: 8, od: 3.500, e0: 3.34062, l1: 0.766, l2: 1.2000, l3: 0.2500, drillReam: ['3-13/64"', 3.203125], drill: ['3-1/4"', 3.25] },
]);

/** Nominal pipe size of a table name: "1-1/4-11.5" → "1-1/4". */
export const nptNominal = (name) => name.replace(/-[\d.]+$/, "");
