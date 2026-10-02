// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw data, bi-metal blade.
//
// Blade speed: LENOX "Guide to Band Sawing", Bi-Metal Speed Chart p.21 (lenoxtools.com). The chart is for
// 4 in (100 mm) annealed stock with flood fluid. Each library row maps to its chart grade; a row the chart
// doesn't list takes the nearest chart grade, the slower one when it sits between two (noted inline).

export const SAW_CHART_FPM = Object.freeze({
  // Copper, bronze, brass. Chart: CDA 220 210, CDA 360 295, Cu-Ni (30%) 200, Be-Cu 160, leaded tin bronze 290,
  // Al bronze 865 150, Mn bronze 215, 932 280, cartridge/red brass 220, naval brass 200, AMPCO 18 180.
  c110: 200,      // pure copper: Cu-Ni / CDA 220 class
  c145: 210,      // free-machining copper: CDA 220
  c172: 160, c17510: 160,
  c260: 220,
  c280: 200,      // Muntz (60/40): naval brass
  c353: 295, c360: 295, c385: 295, // leaded free-cutting brasses: CDA 360
  c464: 200,
  c510: 180,      // unleaded phosphor bronze: AMPCO 18 (no direct row)
  c544: 290,      // leaded tin bronze
  c630: 150, c642: 150, c954: 150, // aluminum bronzes: Al bronze 865
  c655: 180,      // silicon bronze: AMPCO 18 (no direct row)
  c863: 215,
  c932: 280,
  c706: 200,
  // Carbon and structural. Chart: 1145 270, 1215 325, 12L14 350, 1008/1018 270, 1030 250, 1035 240, 1045 230,
  // 1060 200, 1080 195, 1095 185, A36 250.
  s1008: 270, s1018: 270, s1020: 270, s1026: 250, s1030: 250, s1035: 240, s1040: 230, s1045: 230,
  s1050: 230, s1060: 200, s1080: 195, s1095: 185,
  s1117: 270, s1141: 270, s1144: 270, // resulfurized: 1145
  s1212: 325, s1213: 325, s1215: 325, s12l14: 350,
  sA36: 250, sA514: 250, sAR400: 250, // plate grades: A36, then the hardness derate
  // Alloy. Chart: 4140 225, 4150H 200, 6150 190, 5160 195, 4340 195, 8620 215, 8640 185, E9310 160, 52100 160.
  s4130: 225, s4140: 225, s4140ph: 225, s4142: 225, s4150: 200,
  s4340: 195, s4340h: 195, s300m: 195,
  s4615: 215, s8620: 215,
  s5140: 195, s6150: 190, s9260: 190,
  s8640: 185, sHY80: 185, s9310: 160, s52100: 160,
  sEtd150: 225,   // 4140-class
  // Tool. Chart: L-6 145, W-1 145, D-2 90, A-2 150, A-6 135, H-13 140, O-1 140, M-2 105, M-4/M-42 95,
  // T-15 60, S-5/S-7 125, P-20 165.
  tA2: 150, tA6: 135, tD2: 90, tD3: 90, tH11: 140, tH13: 140, tL6: 145,
  tM2: 105, tM4: 95, tM42: 95, tO1: 140, tO6: 140, tP20: 165,
  tS5: 125, tS7: 125, tT15: 60, tW1: 145,
  tHard45: 90, tHard55: 90, // D-2 base, then the hardness rule
  // Stainless. Chart: 304 115, 316 90, 410/420 135, 440C 70, 17-4/15-5 PH 70, 420F 150, 301 125.
  ss201: 115, ss301: 125, ss303: 125, ss304: 115, ss321: 115, ss347: 115,
  ss309: 90, ss310: 90, ss316: 90,
  ss410: 135, ss420: 135, ss430: 135, ss416: 150, ss440c: 70,
  ss174a: 70, ss174h: 70, ss155: 70, ss138: 70, ss177: 70, ss455: 70,
  ssNit50: 70, ssNit60: 70, ss2205: 70, ss2507: 70, ss254: 70, ss904l: 70, // no chart row: slowest stainless
  // Cast iron. Chart: A48 class 20 160, class 40 115, class 60 95; A536 60-40-18 225, 120-90-02 110.
  ciG20: 160, ciG30: 135, ciG40: 115, // class 30 halfway between 20 and 40
  ciD6040: 225, ciD6545: 215, ciD8055: 185, ciD10070: 150, // ductile: by tensile between 60-40-18 and 120-90-02
  ciMall: 160, ciCgi: 115, ciNiRes: 95, ciWhite: 95,
  // Titanium. Chart: CP 85, Ti-6Al-4V 65.
  tiCP2: 85, tiCP4: 85, ti64: 65, ti64eli: 65, ti6242: 65, ti662: 65, ti5553: 65, ti1023: 65,
  // Nickel. Chart: Monel K-500 70, Duranickel 301 55, Incoloy 825 80, Incoloy 600 55, Inconel 600/718 60,
  // Inconel 625 80, Hastelloy B / Waspaloy 55, Nimonic 75 / Rene 88 50, Rene 41 60.
  ni625: 80, ni718: 60, ni718a: 60, niX750: 60, ni600: 60, niRene41: 60,
  niMonel400: 70, niMonelK: 70, ni800: 80, ni825: 80, niAlloy20: 80,
  niC276: 55, niC22: 55, niHX: 55, niWasp: 55, niHay230: 55, niHay282: 55, ni200: 55, niInvar: 55, niKovar: 55,
  niStellite: 50, niNitinol: 50,
});

/** Groups the Lenox chart doesn't list: a range, and a row's rating places it inside. FPM. */
export const SAW_RANGE_FPM = Object.freeze({
  "Aluminum": [1500, 3000],
  "Magnesium & zinc": [1500, 3000],
  "Plastics & composites": [1000, 3000],
  "Other": [200, 400],
  // Wood: about 3,000 FPM (Highland Woodworking; LENOX wood blades are built for ~3,000 FPM). Small wood
  // saws run 3,000–5,000.
  "Wood": [2500, 5000],
  // Fallback for a chart group row with no mapping: the chart's slowest to fastest for that group.
  "Copper alloys": [150, 295], "Carbon steel": [185, 350], "Alloy steel": [160, 235], "Tool steel": [60, 150],
  "Stainless": [70, 150], "Cast iron": [95, 225], "Titanium": [65, 85], "Nickel & superalloys": [50, 80],
});

export const WOOD_IDS = Object.freeze(["oHardwood", "oMDF", "oPlywood"]);

/** LENOX size adjustment: [stock size in, % change to chart speed]. */
export const SAW_SIZE_ADJUST = Object.freeze([[0.25, 15], [0.75, 12], [1.25, 10], [2.5, 5], [4, 0], [8, -12]]);

/** LENOX heat-treated adjustment: [HRC, % slower]. The chart stops at 40 HRC. */
export const SAW_HARDNESS_DERATE = Object.freeze([[20, 0], [22, 5], [24, 10], [26, 15], [28, 20], [30, 25], [32, 30], [36, 35], [38, 40], [40, 45]]);

/** LENOX: no fluid runs 30–50% under chart speed. */
export const SAW_DRY_FACTOR = 0.5;

// Tooth pitch: USA Band Saw Blades "Tooth Selection Guide", p.23 (usabandsawblades.com/content/tooth_selection.pdf),
// cross-checked with the LENOX bi-metal tooth selection chart. [stock size up to (in), variable pitch].
// Round bar uses the diameter, flat/square bar the width, tube and structurals the wall.
export const TOOTH_CHART = Object.freeze({
  round: [[0.2, "14/18"], [0.4, "10/14"], [0.65, "8/12"], [0.9, "6/10"], [1.2, "5/8"], [2.6, "4/6"], [5.5, "3/4"], [9, "2/3"], [15, "1.4/2.5"], [Infinity, "1/1.5"]],
  flat: [[0.15, "14/18"], [0.3, "10/14"], [0.55, "8/12"], [0.65, "6/10"], [1, "5/8"], [2.25, "4/6"], [4.5, "3/4"], [8, "2/3"], [15, "1.4/2.5"], [Infinity, "1/1.5"]],
  tube: [[0.0625, "14/18"], [0.125, "10/14"], [0.1875, "8/12"], [0.25, "6/10"], [0.375, "5/8"], [0.75, "4/6"], [1.3, "3/4"], [Infinity, "2/3"]],
});

/** Constant-pitch sizes you can actually buy. */
export const COMMON_TPI = Object.freeze([2, 3, 4, 6, 8, 10, 14, 18, 24]);
