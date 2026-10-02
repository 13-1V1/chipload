// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { MATERIALS, materialSpeeds, materialById } from "../../src/data/materials-library.js";
import { convertHardness } from "../../src/data/hardness.js";
import { SHCS_INCH } from "../../src/data/shcs.js";
import { GDT_SYMBOLS } from "../../src/data/gdt.js";

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

// ASTM E140: HRC 40 ↔ HV 392 ↔ HB 371; HRB 90 ↔ HB 185
test("hardness conversion round-trips through the E140 table", () => {
  const r = convertHardness("hrc", 40);
  near(r.hv, 392, 0.5); near(r.hb, 371, 0.5); near(r.tensile, 182, 0.5);
  near(convertHardness("hv", 392).hrc, 40, 0.05);
  near(convertHardness("hb", 371).hrc, 40, 0.1);
  near(convertHardness("hrb", 90).hb, 185, 0.5);
  near(convertHardness("hrc", 45).hv, 446, 0.5);
  assert.equal(convertHardness("hrc", 70), null);
  // Vickers off both ends of the steel table is an error, not a row of "off scale" (HV 93–940)
  for (const hv of [40, 92, 941, 2000]) assert.equal(convertHardness("hv", hv), null, `HV ${hv}`);
  near(convertHardness("hv", 93).hrb, 50, 0.5);
  near(convertHardness("hv", 940).hrc, 68, 0.5);
});

test("SHCS chart: 1/4 SHCS gets a 7/16 counterbore, 0.250 deep", () => {
  const q = SHCS_INCH.find((r) => r.size === "1/4");
  assert.equal(q.cbore[1], 0.4375);
  assert.equal(q.height, 0.25);
  assert.equal(q.normal[1], 0.28125);
});

test("GD&T guide covers the 14 Y14.5 characteristics", () => {
  const names = GDT_SYMBOLS.map((s) => s.name.toLowerCase());
  for (const n of ["straightness", "flatness", "circularity", "cylindricity", "profile of a line", "profile of a surface", "angularity", "perpendicularity", "parallelism", "position", "circular runout", "total runout"]) {
    assert.ok(names.some((x) => x.includes(n)), `missing ${n}`);
  }
});
