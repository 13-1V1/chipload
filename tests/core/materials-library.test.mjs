// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Materials library: published densities and ratings, hardened rows, and the tool caution.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { materialById, materialSpeeds, toolCaution, ratingScale } from "../../src/data/materials-library.js";
import * as materialsData from "../../src/data/materials.js";

// C64200: 0.278 lb/in³ at 68 °F (CDA, via Concast C64200 data sheet).
// Haynes International data sheets: 230 = 0.324 lb/in³ (8.97 g/cm³), 282 = 0.299 lb/in³ (8.27 g/cm³).
// MDF ≈ 0.027 lb/in³ (≈750 kg/m³); plywood 540 kg/m³ softwood (Engineering ToolBox) to ≈680 birch = 0.0195–0.0246 lb/in³.
test("densities match the published data sheets", () => {
  near(materialById("c642").density, 0.278, 0.0005);
  near(materialById("niHay230").density, 0.324, 0.0005);
  near(materialById("niHay282").density, 0.299, 0.0005);
  near(materialById("oMDF").density, 0.027, 0.0005);
  const ply = materialById("oPlywood").density;
  assert.ok(ply >= 0.0195 && ply <= 0.0246, `plywood ${ply}`);
});

// Enerpac "Metal Machinability Ratings" / Doppler Gear tables, B1112 = 100%:
// gray iron class 20 73%, class 40 48%, ductile 60-40-18 61%, 80-55-06 39%, 100-70-03 30%.
test("cast iron ratings are on the B1112 scale; other families say which scale they use", () => {
  assert.equal(materialById("ciG20").rating, 73);
  assert.equal(materialById("ciG40").rating, 48);
  assert.equal(materialById("ciD6040").rating, 61);
  assert.equal(materialById("ciD8055").rating, 39);
  assert.equal(materialById("ciD10070").rating, 30);
  assert.match(ratingScale("Cast iron"), /B1112/);
  assert.match(ratingScale("Copper alloys"), /C360/);   // CDA scale: C36000 = 100
  assert.doesNotMatch(ratingScale("Aluminum"), /B1112/);
});

// Lakeshore Carbide HARDMILL chart (catalog p.29), 55–60 HRC, 3/8–1/2 in: 300–500 SFM coated at WOC ≤ 0.025D,
// programmed .003–.004/tooth ≈ .001 real chip.
test("55–60 HRC row carries hard-milling numbers and no tool type the app lacks", () => {
  const h = materialById("tHard55");
  assert.doesNotMatch(h.name, /CBN|ceramic/);
  assert.equal(materialSpeeds("tHard55", "coated").sfm, 300);
  near(h.chipIn, 0.001, 1e-12);
  assert.equal(h.hrc, 58);
});

// The hard-milling speed holds only for light radial cuts, so it must not leak into drilling or turning.
// Haas Tooling "Carbide Drills, General Purpose (TSC)" chart, ISO H38 hardened steel 550 HB / 55 HRC:
// 98 SFM for 1/8–3/4 in drills. Coated-carbide hard turning at 55–60 HRC: about 40–70 m/min (131–230 SFM).
test("55–60 HRC drilling and turning use their own published speeds, not the hard-mill number", () => {
  for (const t of ["carbide", "coated"]) {
    const sp = materialSpeeds("tHard55", t);
    assert.equal(sp.drillSfm, 98, `${t} drill`);
    assert.ok(sp.turnSfm >= 131 && sp.turnSfm <= 230, `${t} turn ${sp.turnSfm}`);
  }
  assert.equal(materialSpeeds("tHard55", "coated").turnSfm, 165);   // ≈ 50 m/min
  assert.ok(materialSpeeds("tHard55", "hss").drillSfm <= 15);       // HSS falls back to its own (tiny) row speed
});

test("ordinary rows keep drill = 0.8 × and turning = 1.2 × the milling SFM", () => {
  for (const t of ["hss", "carbide", "coated"]) {
    const sp = materialSpeeds("s4140", t);
    near(sp.drillSfm, sp.sfm * 0.8, 1);
    near(sp.turnSfm, sp.sfm * 1.2, 1e-9);
  }
  assert.equal(materialSpeeds("s1018", "carbide").drillSfm, Math.round(materialById("s1018").sfmCarbide * 0.8));
});

test("tool caution: HSS on stock about as hard as the cutter", () => {
  for (const id of ["tHard55", "ciWhite", "niStellite", "pG10", "pCF"]) assert.match(toolCaution(id, "hss") || "", /HSS won't cut/, id);
  assert.match(toolCaution("tHard45", "hss") || "", /HSS barely cuts/);
  assert.match(toolCaution("tHard55", "coated") || "", /light cuts/);
  assert.match(toolCaution("tHard55", "carbide") || "", /Uncoated carbide/);
  assert.equal(toolCaution("s1018", "hss"), null);
  assert.equal(toolCaution("al6061", "coated"), null);
  assert.equal(toolCaution("tHard45", "carbide"), null);
  assert.equal(toolCaution("nope", "hss"), null);
});

// Coated carbide hard turning runs up to about 50 m/min (Tungaloy "Hard Turning", AH8000) at a light feed.
// The caution states the turning numbers itself, so a lathe screen that still shows sfm × 1.2 (360 SFM
// for tHard55 coated) can't mislead.
test("tool caution: hardened-steel turning numbers, in the user's units", () => {
  const both = toolCaution("tHard55", "coated");
  assert.match(both, /165 SFM \(50 m\/min\)/);
  assert.match(both, /0\.002–0\.004 IPR \(0\.05–0\.10 mm\/rev\)/);
  assert.doesNotMatch(both, /speed shown is for/);
  assert.match(toolCaution("tHard55", "carbide"), /130 SFM \(40 m\/min\)/);
  const inch = toolCaution("tHard55", "coated", "in");
  assert.match(inch, /165 SFM at 0\.002–0\.004 IPR/);
  assert.doesNotMatch(inch, /m\/min|mm\/rev/);
  const mm = toolCaution("tHard55", "coated", "mm");
  assert.match(mm, /50 m\/min at 0\.05–0\.10 mm\/rev/);
  assert.doesNotMatch(mm, /SFM|IPR/);
});

test("dead speed tables are gone; tool labels stay", () => {
  assert.equal(materialsData.SF_DEFAULTS, undefined);
  assert.equal(materialsData.MATERIAL_LABELS, undefined);
  assert.deepEqual(Object.keys(materialsData.TOOL_LABELS), ["hss", "carbide", "coated"]);
});
