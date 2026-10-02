// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { MATERIALS, materialSpeeds, materialById } from "../../src/data/materials-library.js";
import { convertHardness } from "../../src/data/hardness.js";
import { SHCS_INCH, SHCS_METRIC } from "../../src/data/shcs.js";
import { GDT_SYMBOLS } from "../../src/data/gdt.js";
import { G_CODES, M_CODES } from "../../src/data/gcodes.js";
import { GLOSSARY } from "../../src/data/glossary.js";
import { DRILL_CHART_INCH } from "../../src/data/drills.js";
import "../../src/calcs/index.js";
import { getCalc } from "../../src/app/registry.js";

test("material library has 150+ unique entries with sane numbers", () => {
  assert.ok(MATERIALS.length >= 150, `only ${MATERIALS.length}`);
  const ids = new Set(MATERIALS.map((m) => m.id));
  assert.equal(ids.size, MATERIALS.length, "duplicate id");
  for (const m of MATERIALS) {
    assert.ok(m.sfmHss > 0 && m.sfmCarbide >= m.sfmHss, `${m.id} sfm`);
    assert.ok(m.chipIn > 0 && m.chipIn < 0.01, `${m.id} chip`);
    assert.ok(m.density > 0.02 && m.density < 0.75, `${m.id} density`);
  }
  assert.equal(materialById("s1018").sfmHss, 100);
  near(materialSpeeds("al6061", "coated").sfm, 1250);
  near(materialSpeeds("ss304", "hss").chipIn, 0.0015 * 0.75, 1e-12);
});

// ASTM E140-07 Table 1: HRC 40 ↔ HV 392 ↔ HB 371; Table 2: HRB 90 ↔ HV 185 ↔ HB 185.
// Tensile is ASTM A370 Table 2 (HRC 40 = 182 ksi), not E140 — E140 has no tensile column.
test("hardness conversion round-trips through the E140 tables", () => {
  const r = convertHardness("hrc", 40);
  near(r.hv, 392, 0.5); near(r.hb, 371, 0.5); near(r.tensile, 182, 0.5);
  near(convertHardness("hv", 392).hrc, 40, 0.05);
  near(convertHardness("hb", 371).hrc, 40, 0.1);
  near(convertHardness("hrb", 90).hb, 185, 0.5);
  near(convertHardness("hrb", 90).hv, 185, 0.5);
  near(convertHardness("hrc", 45).hv, 446, 0.5);
  near(convertHardness("hrc", 62).hv, 746, 0.5); // E140 Table 1
  assert.equal(convertHardness("hrc", 70), null);
  // Off both ends of the steel tables is an error, not a row of "off scale". E140 Table 2 gives HV/HB only
  // down to HRB 55 = HV 100 = HB 100, so HRB 50 / HV 93 are no longer answered (they were extrapolated).
  for (const hv of [40, 93, 99, 941, 2000]) assert.equal(convertHardness("hv", hv), null, `HV ${hv}`);
  for (const hrb of [50, 54.9, 100.1]) assert.equal(convertHardness("hrb", hrb), null, `HRB ${hrb}`);
  assert.equal(convertHardness("hb", 99), null);
  near(convertHardness("hv", 100).hrb, 55, 0.01);
  near(convertHardness("hv", 940).hrc, 68, 0.5);
});

// ASTM A370 Table 2, approximate tensile strength (ksi), HRC 59 down to 20. A370 lists none at HRC 60 and up.
const A370_TENSILE_HRC = [[59, 351], [58, 338], [57, 325], [56, 313], [55, 301], [54, 292], [53, 283], [52, 273], [51, 264], [50, 255],
  [49, 246], [48, 238], [47, 229], [46, 221], [45, 215], [44, 208], [43, 201], [42, 194], [41, 188], [40, 182], [39, 177], [38, 171],
  [37, 166], [36, 161], [35, 156], [34, 152], [33, 149], [32, 146], [31, 141], [30, 138], [29, 135], [28, 131], [27, 128], [26, 125],
  [25, 123], [24, 119], [23, 117], [22, 115], [21, 112], [20, 110]];
// ASTM A370 Table 3, approximate tensile strength (ksi), HRB 100 down to 65. A370 lists none below HRB 65.
const A370_TENSILE_HRB = [[100, 116], [99, 114], [98, 109], [97, 104], [96, 102], [95, 100], [94, 98], [93, 94], [92, 92], [91, 90],
  [90, 89], [89, 88], [88, 86], [87, 84], [86, 83], [85, 82], [84, 81], [83, 80], [82, 77], [81, 73], [80, 72], [79, 70], [78, 69],
  [77, 68], [76, 67], [75, 66], [74, 65], [73, 64], [72, 63], [71, 62], [70, 61], [69, 60], [68, 59], [67, 58], [66, 57], [65, 56]];

test("tensile matches ASTM A370 row for row, and stops where A370 stops", () => {
  for (const [hrc, ksi] of A370_TENSILE_HRC) near(convertHardness("hrc", hrc).tensile, ksi, 1e-9, `HRC ${hrc}`);
  for (const [hrb, ksi] of A370_TENSILE_HRB) near(convertHardness("hrb", hrb).tensile, ksi, 1e-9, `HRB ${hrb}`);
  for (const hrc of [60, 62, 65, 68]) assert.equal(convertHardness("hrc", hrc).tensile, null, `HRC ${hrc}`);
  for (const hrb of [55, 60, 64]) assert.equal(convertHardness("hrb", hrb).tensile, null, `HRB ${hrb}`);
  // E140 Table 1 prints HB above HRC 60 only in parentheses; A370 17.4.4: Brinell not recommended over 650 HBW
  assert.equal(convertHardness("hrc", 62).hb, null);
  near(convertHardness("hrc", 60).hb, 654, 1e-9);
});

// E140 Table 2: HRB 100 = HV 240 = HB 240; Table 1: HRC 20 = HV 238 = HB 226, HRC 23 = HV 254 = HB 243.
// A370: HRB 100 = 116 ksi, HRC 23 = 117 ksi. The tables disagree where they meet, so no sweep of any one
// scale may step backward on any other: a harder part never shows a lower number.
test("hardness: no backward step where the Rockwell B and C tables meet", () => {
  near(convertHardness("hrb", 100).hb, 240, 1e-9);
  near(convertHardness("hrb", 100).tensile, 116, 1e-9);
  const sweep = (scale, from, to, step) => {
    const last = {};
    for (let x = from; x <= to + 1e-9; x += step) {
      const r = convertHardness(scale, x);
      assert.ok(r, `${scale} ${x.toFixed(2)} converts`);
      for (const k of ["hrc", "hrb", "hv", "hb", "tensile"]) {
        if (r[k] == null) continue;
        assert.ok(last[k] == null || r[k] >= last[k] - 1e-9, `${scale} ${x.toFixed(2)}: ${k} ${r[k]} < ${last[k]}`);
        last[k] = r[k];
      }
    }
  };
  sweep("hrb", 55, 100, 0.1);
  sweep("hrc", 20, 68, 0.1);
  sweep("hv", 100, 940, 0.5); // crossed HV 240 → 241 backward (HB 240 → 229, 116 → 111 ksi) before the fix
  sweep("hb", 100, 654, 0.5);
  // Across the gap the chain runs straight from HRB 100 to HRC 23 (published rows both ends)
  near(convertHardness("hv", 254).hb, 243, 1e-9);
  near(convertHardness("hv", 254).tensile, 117, 1e-9);
  near(convertHardness("hb", 243).hv, 254, 1e-9);
  // Rockwell numbers stay published: HB 234 is HRB 99 in Table 2 and about HRC 21.5 in Table 1
  near(convertHardness("hb", 234).hrb, 99, 1e-9);
  near(convertHardness("hb", 234).hrc, 21.5, 0.01);
  near(convertHardness("hrc", 21).hb, 231, 1e-9);
  // ...and the seam is flagged so the calculator can say the conversion is rougher there
  for (const [s, x] of [["hrb", 99], ["hrc", 20], ["hv", 241], ["hb", 230]]) assert.equal(convertHardness(s, x).seam, true, `${s} ${x}`);
  for (const [s, x] of [["hrb", 90], ["hrc", 30], ["hv", 300], ["hb", 180]]) assert.equal(convertHardness(s, x).seam, false, `${s} ${x}`);
});

// ASME B18.2.8-1999 inch clearance holes (close / normal / loose), as reproduced by amesweb.info Clearance-Hole-Chart,
// jandesupply.com reference-clearance-holes and mechanicalc.com fastener-size-tables. Decimals are the B94.11M drill sizes.
const B18_2_8 = {
  "#0": [["#51", 0.067], ["#48", 0.076], ['3/32"', 0.09375]],
  "#1": [["#46", 0.081], ["#43", 0.089], ["#37", 0.104]],
  "#2": [['3/32"', 0.09375], ["#38", 0.1015], ["#32", 0.116]],
  "#3": [["#36", 0.1065], ["#32", 0.116], ["#30", 0.1285]],
  "#4": [["#31", 0.120], ["#30", 0.1285], ["#27", 0.144]],
  "#5": [['9/64"', 9 / 64], ['5/32"', 5 / 32], ['11/64"', 11 / 64]],
  "#6": [["#23", 0.154], ["#18", 0.1695], ["#13", 0.185]],
  "#8": [["#15", 0.180], ["#9", 0.196], ["#3", 0.213]],
  "#10": [["#5", 0.2055], ["#2", 0.221], ["B", 0.238]],
  "1/4": [['17/64"', 17 / 64], ['9/32"', 9 / 32], ['19/64"', 19 / 64]],
  "5/16": [['21/64"', 21 / 64], ['11/32"', 11 / 32], ['23/64"', 23 / 64]],
  "3/8": [['25/64"', 25 / 64], ['13/32"', 13 / 32], ['27/64"', 27 / 64]],
  "7/16": [['29/64"', 29 / 64], ['15/32"', 15 / 32], ['31/64"', 31 / 64]],
  "1/2": [['17/32"', 17 / 32], ['9/16"', 9 / 16], ['39/64"', 39 / 64]],
  "5/8": [['21/32"', 21 / 32], ['11/16"', 11 / 16], ['47/64"', 47 / 64]],
  "3/4": [['25/32"', 25 / 32], ['13/16"', 13 / 16], ['29/32"', 29 / 32]],
  "7/8": [['29/32"', 29 / 32], ['15/16"', 15 / 16], ['1-1/32"', 1 + 1 / 32]],
  "1": [['1-1/32"', 1 + 1 / 32], ['1-3/32"', 1 + 3 / 32], ['1-5/32"', 1 + 5 / 32]],
};

test("SHCS inch clearance holes match ASME B18.2.8 on every row", () => {
  assert.equal(SHCS_INCH.length, Object.keys(B18_2_8).length);
  for (const r of SHCS_INCH) {
    const want = B18_2_8[r.size];
    assert.ok(want, `${r.size} not in B18.2.8 list`);
    ["close", "normal", "loose"].forEach((fit, i) => {
      assert.equal(r[fit][0], want[i][0], `${r.size} ${fit} drill`);
      near(r[fit][1], want[i][1], 1e-9, `${r.size} ${fit} size`);
    });
    // every hole clears the screw, and the fits get looser in order
    assert.ok(r.close[1] < r.normal[1] && r.normal[1] < r.loose[1], `${r.size} fits in order`);
  }
  // B94.11M number/letter drill decimals, the same values the drill chart uses
  for (const r of SHCS_INCH) for (const fit of ["close", "normal", "loose"]) {
    const [label, size] = r[fit];
    if (label.endsWith('"')) continue;
    const hit = DRILL_CHART_INCH.find(([, l]) => l === label);
    assert.ok(hit, `${label} in drill chart`);
    near(size, hit[0], 1e-9, `${r.size} ${fit} ${label}`);
  }
});

test("SHCS chart: 1/4 SHCS gets a 7/16 counterbore, 0.250 deep", () => {
  const q = SHCS_INCH.find((r) => r.size === "1/4");
  assert.equal(q.cbore[1], 0.4375);
  assert.equal(q.height, 0.25);
  assert.equal(q.normal[1], 0.28125);
});

// ISO 273 clearance holes, fine / medium / coarse (mm)
const ISO_273 = { M2: [2.2, 2.4, 2.6], "M2.5": [2.7, 2.9, 3.1], M3: [3.2, 3.4, 3.6], M4: [4.3, 4.5, 4.8], M5: [5.3, 5.5, 5.8], M6: [6.4, 6.6, 7],
  M8: [8.4, 9, 10], M10: [10.5, 11, 12], M12: [13, 13.5, 14.5], M14: [15, 15.5, 16.5], M16: [17, 17.5, 18.5], M20: [21, 22, 24], M24: [25, 26, 28] };

test("SHCS metric clearance holes match ISO 273", () => {
  for (const r of SHCS_METRIC) assert.deepEqual([r.fine, r.medium, r.coarse], ISO_273[r.size], r.size);
});

test("SHCS chart shows drill decimals to 4 places, like the drill chart", () => {
  const rows = getCalc("shcs").rows({ units: "in" });
  const row = (s) => rows.find((r) => r.size === `${s} SHCS`);
  assert.equal(row("#2").normal, "#38 0.1015");
  assert.equal(row("#3").close, "#36 0.1065");
  assert.equal(row("#10").normal, "#2 0.221");
  assert.equal(row("3/4").normal, '13/16" 0.8125');
});

test("GD&T guide covers the 14 Y14.5 characteristics", () => {
  const names = GDT_SYMBOLS.map((s) => s.name.toLowerCase());
  for (const n of ["straightness", "flatness", "circularity", "cylindricity", "profile of a line", "profile of a surface", "angularity", "perpendicularity", "parallelism", "position", "circular runout", "total runout"]) {
    assert.ok(names.some((x) => x.includes(n)), `missing ${n}`);
  }
  // Y14.5-2018 symbols a US print uses daily
  for (const n of ["all around", "all over", "from-to", "dynamic profile", "translation", "movable datum target", "square", "slope", "conical taper", "arc length"]) {
    assert.ok(names.some((x) => x.includes(n)), `missing ${n}`);
  }
  // Surface texture is the ASME Y14.36 check mark, not the old DIN/ISO triangles
  const tex = GDT_SYMBOLS.find((s) => /surface texture/i.test(s.name));
  assert.match(tex.sym, /√/);
  assert.match(tex.name, /Y14\.36/);
});

// Haas lathe G-code list and Fanuc lathe G-code system A: G74 face groove / peck drill, G90 OD/ID turning cycle,
// G94 end facing cycle, G98 feed per minute, G99 feed per rev. The mill meanings stay alongside.
test("G-code reference flags the lathe meaning where it differs from the mill", () => {
  const g = (code) => G_CODES.find((r) => r[0] === code);
  const text = (code) => `${g(code)[1]} ${g(code)[3]}`;
  assert.match(text("G90"), /Mill: absolute/); assert.match(text("G90"), /Lathe: OD\/ID turning cycle/);
  assert.match(text("G94"), /Mill: feed per minute/); assert.match(text("G94"), /Lathe: end facing cycle/);
  assert.match(text("G98"), /Mill: canned cycle return to initial Z/); assert.match(text("G98"), /Lathe: feed per minute/);
  assert.match(text("G99"), /Lathe: feed per revolution/);
  assert.match(text("G74"), /Mill: left-hand tapping/); assert.match(text("G74"), /Lathe: face grooving \/ peck drill/);
  assert.match(text("G91"), /U and W/);
  assert.ok(g("G75"), "G75 lathe grooving cycle listed");
  // Haas mills use M48/M49 for pallets, not feed override
  const m = (code) => M_CODES.find((r) => r[0] === code);
  for (const code of ["M48", "M49"]) assert.match(m(code)[2], /Not Haas/);
});

// Common finish charts (Machinery's Handbook surface-finish table): 250 rough, 125 ordinary machined, 63 good, 32 fine.
// ASME B1.1: pitch diameter is where the thread ridge and the groove are the same width.
test("glossary: Ra 125 is an ordinary machined finish; PD is where thread and gap are equal", () => {
  const term = (t) => GLOSSARY.find((r) => r[0] === t)[2];
  assert.match(term("Ra"), /125 is an ordinary machined finish/);
  assert.match(term("Pitch diameter (PD)"), /same width/);
});

// 1 lb/in³ = 27.68 g/cm³; 1 SFM = 0.3048 m/min; 1 in = 25.4 mm. 6061: 1000 SFM carbide = 304.8 m/min, 0.098 lb/in³ = 2.71 g/cm³.
test("material library chart follows the metric setting", () => {
  const def = getCalc("materials");
  const inCols = def.columns({ units: "in" }).map((c) => c.label).join(" ");
  const mmCols = def.columns({ units: "mm" }).map((c) => c.label).join(" ");
  assert.match(inCols, /SFM/); assert.match(inCols, /lb\/in³/);
  assert.match(mmCols, /m\/min/); assert.match(mmCols, /g\/cm³/); assert.match(mmCols, /mm\/tooth/);
  assert.doesNotMatch(mmCols, /SFM|lb\/in³/);
  const m = materialById("al6061");
  const row = def.rows({ units: "mm" }).find((r) => r.name.startsWith(m.name));
  near(row.sfmCarbide, m.sfmCarbide * 0.3048, 1e-9);
  near(row.density, m.density * 27.68, 1e-9);
  assert.equal(row.chip, String(Number((m.chipIn * 25.4).toFixed(3))));
});
