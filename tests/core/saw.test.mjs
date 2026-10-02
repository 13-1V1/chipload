// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { bandSawSpeed, bladeForStock, woodBladeForStock, bladeSpeedFromWheel, wheelRpmForSpeed } from "../../src/core/saw.js";
import { MATERIALS, materialById } from "../../src/data/materials-library.js";
import { SAW_CHART_FPM } from "../../src/data/saw.js";
import { GLOSSARY } from "../../src/data/glossary.js";
import { fmt } from "../../src/core/format.js";

const speed = (id, t = 4) => bandSawSpeed(materialById(id), t);

// LENOX Guide to Band Sawing p.21, Bi-Metal Speed Chart (4 in annealed stock, flood fluid), FPM:
// CDA 360 295, Be-Cu 160, Al bronze 865 150, 1018 270, 4140 225, 440C 70, T-15 60, A48 class 40 115.
test("band saw speeds match the LENOX bi-metal chart at 4 in", () => {
  assert.equal(speed("c360").start, 295);
  assert.equal(speed("c172").start, 160);
  assert.equal(speed("c954").start, 150);
  assert.equal(speed("s1018").start, 270);
  assert.equal(speed("s4140").start, 225);
  assert.equal(speed("ss440c").start, 70);
  assert.equal(speed("tT15").start, 60);
  assert.equal(speed("ciG40").start, 115);
  // every copper alloy sits in the chart's 150–295 FPM band (the old table said 800–1500)
  for (const m of MATERIALS.filter((x) => x.group === "Copper alloys")) {
    const s = speed(m.id).start;
    assert.ok(s >= 150 && s <= 295, `${m.id} ${s}`);
  }
});

// LENOX size adjustment: 1/4 in +15%, 3/4 in +12%, 1-1/4 in +10%, 8 in −12%.
test("band saw speed follows the LENOX size adjustment", () => {
  near(speed("s1018", 0.25).start, 270 * 1.15, 1);
  near(speed("s1018", 0.75).start, 270 * 1.12, 1);
  near(speed("s1018", 1.25).start, 270 * 1.10, 1);
  near(speed("s1018", 8).start, 270 * 0.88, 1);
  near(speed("s1018", 20).start, 270 * 0.88, 1); // held flat past the chart
  // LENOX: no fluid runs 30–50% slower; the dry end of the range is half the chart speed
  assert.equal(speed("s1018").min, 135);
});

// LENOX heat-treated adjustment: 30 HRC −25%, 40 HRC −45%; the table stops at 40 HRC.
test("hardened rows are derated and flagged past the chart", () => {
  assert.equal(speed("s4140ph").start, Math.round(225 * 0.75)); // 4140 pre-hard ~30 HRC → 169
  const ar = speed("sAR400");                                    // AR400 ~43 HRC → A36 250 × 0.55
  near(ar.start, 250 * 0.55, 1);
  assert.equal(ar.beyondChart, true);
  assert.equal(ar.bimetalUnsuitable, false);
  near(speed("ss174h").start, 70 * 0.55, 1);                     // 17-4 H900 44 HRC
  for (const id of ["tHard45", "tHard55", "ciWhite"]) assert.equal(speed(id).bimetalUnsuitable, true, id);
  assert.equal(speed("s1018").hardPct, 0);
});

// Wood runs near 3,000 FPM (Highland Woodworking; LENOX wood blades are built for ~3,000 FPM).
test("wood and families off the chart use a range", () => {
  const oak = speed("oHardwood", 1);
  assert.equal(oak.start, 3000);
  assert.ok(oak.fastLimit > 3005, "a normal 3,000 FPM wood saw is not too fast");
  assert.equal(speed("oPlywood").basis, "wood");
  assert.ok(speed("al6061").start >= 1500, "aluminum stays fast");
  assert.ok(bandSawSpeed({ id: "x", group: "Nope", rating: 50 }).start >= 200, "unknown group falls back");
  // a chart group row with no mapping starts at the group's slowest chart speed
  assert.equal(bandSawSpeed({ id: "x", group: "Copper alloys", rating: 100 }).start, 150);
});

test("every library row in a charted group has a LENOX chart speed", () => {
  const charted = ["Copper alloys", "Carbon steel", "Alloy steel", "Tool steel", "Stainless", "Cast iron", "Titanium", "Nickel & superalloys"];
  for (const m of MATERIALS.filter((x) => charted.includes(x.group))) assert.ok(SAW_CHART_FPM[m.id] > 0, `${m.id} has no saw speed`);
});

// USA Band Saw Blades Tooth Selection Guide p.23 (also the LENOX bi-metal tooth chart):
// round 1/8 → 14/18, 1/4 → 10/14, 1/2 → 8/12, 1 → 5/8, 2 → 4/6, 4 → 3/4; flat 1-1/2 → 4/6;
// tube wall 0.1 → 10/14, 1/4 → 5/8, 1/2 → 4/6.
test("tooth pitch follows the maker's chart", () => {
  const pitch = (t, shape) => bladeForStock(t, shape).pitch;
  assert.equal(pitch(0.125, "round"), "14/18");
  assert.equal(pitch(0.25, "round"), "10/14");
  assert.equal(pitch(0.5, "round"), "8/12");
  assert.equal(pitch(1, "round"), "5/8");
  assert.equal(pitch(2, "round"), "4/6");
  assert.equal(pitch(4, "round"), "3/4");
  assert.equal(pitch(1.5, "flat"), "4/6");
  assert.equal(pitch(0.1, "tube"), "10/14");
  assert.equal(pitch(0.25, "tube"), "5/8");
  assert.equal(pitch(0.5, "tube"), "4/6");
  const one = bladeForStock(1, "round");
  assert.equal(one.constant, 6);               // 5/8 averages 6.5 → nearest one-pitch blade 6 TPI
  near(one.teethInCut, 6.5, 1e-9);             // 3–6 teeth in the cut, where the charts aim
  assert.equal(bladeForStock(0, "round"), null);
});

// 14/18 averages 16, halfway between the 14 and 18 TPI blades. A tie keeps the coarser blade only while it
// leaves 3 teeth in the cut (the usual minimum), so 1/8 in gets 18, not 14 (1.75 teeth). Under 3/32 in the
// one-pitch pick is 24 TPI, the finest common blade, the one the thin-stock warning names.
test("one-pitch blade: a tie goes finer when the coarser leaves under 3 teeth; thin stock gets 24 TPI", () => {
  assert.equal(bladeForStock(0.125, "round").constant, 18);   // 14 × 0.125 = 1.75 teeth
  assert.equal(bladeForStock(0.1, "flat").constant, 18);
  assert.equal(bladeForStock(0.25, "round").constant, 14);    // 10/14 averages 12; 10 × 0.25 = 2.5 teeth
  assert.equal(bladeForStock(0.35, "round").constant, 10);    // 10 × 0.35 = 3.5 teeth: the coarser stands
  assert.equal(bladeForStock(4, "round").constant, 3);        // 3/4 averages 3.5; 3 × 4 = 12 teeth
  assert.equal(bladeForStock(2, "round").constant, 4);        // 4/6 averages 5; 4 × 2 = 8 teeth
  for (const [t, shape] of [[0.05, "round"], [0.05, "flat"], [0.07, "tube"], [0.09, "tube"]]) {
    const b = bladeForStock(t, shape);
    assert.equal(b.thin, true, `${t} ${shape}`);
    assert.equal(b.constant, 24, `${t} ${shape}`);
  }
  assert.equal(bladeForStock(3 / 32, "round").thin, false);
});

// Woodworking blade guides: hook tooth 3–4 TPI for thick stock; thinner stock keeps at least 3 teeth in the cut.
test("wood blade: hook tooth for thick stock, enough teeth for thin", () => {
  assert.deepEqual([woodBladeForStock(1).tooth, woodBladeForStock(1).tpi], ["hook", "3–4"]);
  assert.equal(woodBladeForStock(0.75).tooth, "hook");                 // 4 TPI × 3/4 in = 3 teeth
  assert.equal(woodBladeForStock(19 / 25.4).tooth, "hook");            // a 19 mm board is metric 3/4 stock
  assert.equal(woodBladeForStock(18 / 25.4).tooth, "regular");         // 18 mm plywood sits under the 19 mm line
  assert.deepEqual([woodBladeForStock(0.5).tooth, woodBladeForStock(0.5).tpi], ["regular", "6"]);   // 3 ÷ 0.5 = 6
  assert.equal(woodBladeForStock(0.25).tpi, "14");                     // 3 ÷ 0.25 = 12 → next common size 14
  assert.equal(woodBladeForStock(0.05).tpi, "24");                     // capped at the finest common blade
  assert.equal(woodBladeForStock(0.05).thin, true);
  for (const t of [0.125, 0.2, 0.3, 0.5, 0.7]) assert.ok(woodBladeForStock(t).teethInCut >= 3 - 1e-9, String(t));
  assert.equal(woodBladeForStock(0), null);
});

// Olson Saw, "What band saw blade should I get?": at least 3 teeth in the work; 4 TPI from 3/4 in, 6 from 1/2,
// 8 from 3/8, 10 from 5/16, 14 from 1/4. So 3 TPI only from 1 in (3 × 1 = 3 teeth), and under 1/8 in even 24 TPI
// leaves fewer than 3 teeth (24 × 0.1 = 2.4): that stock is thin and gets the warning.
test("wood blade: every pitch offered keeps 3 teeth, and stock too thin for that is marked thin", () => {
  assert.deepEqual([woodBladeForStock(0.75).tooth, woodBladeForStock(0.75).tpi], ["hook", "4"]);
  assert.equal(woodBladeForStock(0.9).tpi, "4");                       // 3 TPI × 0.9 in = 2.7 teeth: not offered
  assert.equal(woodBladeForStock(1).tpi, "3–4");
  assert.equal(woodBladeForStock(25.4 / 25.4).tpi, "3–4");             // 25.4 mm = 1 in, Olson's 3 TPI line
  assert.equal(woodBladeForStock(25 / 25.4).tpi, "4");                 // 25 mm: 3 TPI × 0.984 in = 2.95 teeth
  assert.equal(woodBladeForStock(0.99).tpi, "4");                      // under 1 in, as the "from 1 in up" line says
  assert.equal(woodBladeForStock(24 / 25.4).tpi, "4");
  for (const [t, tpi] of [[0.5, "6"], [0.375, "8"], [5 / 16, "10"], [0.25, "14"]]) assert.equal(woodBladeForStock(t).tpi, tpi, String(t));
  // the 3-tooth rule, whatever pitch is named (4 TPI from 19 mm to the figure shown; 3 TPI exactly, from 1 in)
  for (let t = 0.75; t < 3; t += 0.001) {
    const b = woodBladeForStock(t);
    if (b.tpi === "3–4") assert.ok(3 * t >= 3 - 1e-9, `${t} in → 3–4 TPI`);
  }
  for (let t = 0.125; t < 3; t += 0.001) {
    const b = woodBladeForStock(t);
    const coarsest = b.tpi === "3–4" ? 3 : Number(b.tpi);
    assert.ok(Number(fmt(coarsest * t, 1)) >= 3, `${t} in → ${b.tpi} TPI`);
    assert.equal(b.thin, false, String(t));
  }
  assert.equal(woodBladeForStock(0.1).thin, true);                     // 24 × 0.1 = 2.4 teeth
  assert.equal(woodBladeForStock(3 / 25.4).thin, true);                // 3 mm plywood: 2.8 teeth
  assert.equal(woodBladeForStock(0.124).thin, true);
  assert.equal(woodBladeForStock(0.125).thin, false);                  // 24 × 1/8 = 3 teeth
  assert.equal(woodBladeForStock(1).thin, false);
});

// 14 in wheel at 60 RPM → π × 14 × 60 ÷ 12 = 219.9 FPM
test("wheel diameter and RPM ↔ blade speed", () => {
  near(bladeSpeedFromWheel(14, 60), 219.9, 0.1);
  near(wheelRpmForSpeed(14, 219.9), 60, 0.05);
});

test("glossary covers the words beginners hit first", () => {
  const terms = GLOSSARY.map((g) => g[0].toLowerCase());
  for (const t of ["sfm", "rpm", "ipm", "chip load", "tpi", "tap drill", "counterbore", "clearance hole", "ra", "true position"]) {
    assert.ok(terms.some((x) => x.includes(t)), `missing ${t}`);
  }
  for (const g of GLOSSARY) assert.ok(g[2].length > 20, `${g[0]} needs a real explanation`);
});
