// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { metricToleranceEnvelope, acmeGeometry, stiTapDrill, parseThreadSpec } from "../../src/core/thread.js";
import { NPT_TABLE } from "../../src/data/npt.js";
import { nearestDrillInch } from "../../src/core/drills.js";
import { drillPointLength } from "../../src/calcs/drill-point.js";

// ISO 965-2: M10x1.5-6g PD 8.862–8.994, major 9.732–9.968; 6H PD 9.026–9.206, minor 8.376–8.676.
// Built from the ISO 965-1 tables (es(g) 32, Td 236, Td2 132, TD2 180, TD1 300 µm), so held to half a µm.
test("M10x1.5 6g/6H limits match ISO 965-2 to the micron", () => {
  const e = metricToleranceEnvelope({ major: 10, pitch: 1.5 });
  near(e.external.pdMax, 8.994, 5e-4, "6g PD max");
  near(e.external.pdMin, 8.862, 5e-4, "6g PD min");
  near(e.external.majorMax, 9.968, 5e-4, "6g major max");
  near(e.external.majorMin, 9.732, 5e-4, "6g major min");
  near(e.internal.pdMin, 9.026, 5e-4, "6H PD min");
  near(e.internal.pdMax, 9.206, 5e-4, "6H PD max");
  near(e.internal.minorMin, 8.376, 5e-4, "6H minor min");
  near(e.internal.minorMax, 8.676, 5e-4, "6H minor max");
});

// ISO 965-2 6g / 6H, mm (Optimas ISO metric tolerances, ASMC 6H chart, Willrich metric gauge chart):
// M20x2.5 6H minor 17.294–17.744, PD 18.376–18.600; M36x4 6g major 35.465–35.940, PD 33.118–33.342;
// M12x1.75 6H PD 10.863–11.063, minor 10.106–10.441; M8x1.25 6g PD 7.042–7.160; M48x5 6g PD 44.431–44.681;
// M3 6g PD 2.580–2.655; M12x1.25 6H PD 11.188–11.368; M6 6H minor max 5.153.
test("ISO 965-2 6g / 6H limits across the size range", () => {
  const rows = [
    [20, 2.5, "internal", "minorMin", 17.294], [20, 2.5, "internal", "minorMax", 17.744], [20, 2.5, "internal", "pdMax", 18.600],
    [36, 4, "external", "majorMin", 35.465], [36, 4, "external", "majorMax", 35.940], [36, 4, "external", "pdMin", 33.118], [36, 4, "external", "pdMax", 33.342],
    [12, 1.75, "internal", "pdMax", 11.063], [12, 1.75, "internal", "minorMin", 10.106], [12, 1.75, "internal", "minorMax", 10.441],
    [8, 1.25, "external", "pdMin", 7.042], [8, 1.25, "external", "pdMax", 7.160], [48, 5, "external", "pdMin", 44.431], [48, 5, "external", "pdMax", 44.681],
    [3, 0.5, "external", "pdMin", 2.580], [3, 0.5, "external", "pdMax", 2.655], [12, 1.25, "internal", "pdMax", 11.368], [6, 1, "internal", "minorMax", 5.153],
  ];
  for (const [major, pitch, side, key, want] of rows) near(metricToleranceEnvelope({ major, pitch })[side][key], want, 5e-4, `M${major}x${pitch} ${side} ${key}`);
});

// ISO 965-1 §13.4.2: TD2 grade 7 = 1.7 × Td2(6), not 1.25 × TD2(6). Table 5, 5.6–11.2 mm, P 1.5: TD2(7) = 224 µm;
// Table 3, P 1.5: TD1(7) = 375 µm. So M10x1.5-7H PD 9.026–9.250, minor 8.376–8.751.
test("grade 7 internal uses the ISO 965-1 table (7H)", () => {
  const e = metricToleranceEnvelope({ major: 10, pitch: 1.5, intGrade: 7 });
  near(e.internal.pdMax, 9.250, 5e-4, "7H PD max");
  near(e.internal.minorMax, 8.751, 5e-4, "7H minor max");
  near(e.tolerances.TD2, 224, 0, "TD2(7)");
});

// ISO 965-1 Tables 3 and 5 define no grade-6 internal tolerance for 0.25 mm pitch (M1x0.25 comes in 5H);
// Table 4 has no Td grade 8 under 0.8 mm pitch. Outside 0.2–8 mm pitch the standard gives nothing.
test("classes ISO 965-1 doesn't define come back empty with the reason", () => {
  const m1 = metricToleranceEnvelope({ major: 1, pitch: 0.25 });
  assert.equal(m1.internal, null);
  assert.match(m1.undefinedReasons.join(" "), /6H/);
  near(metricToleranceEnvelope({ major: 1, pitch: 0.25, intGrade: 5 }).internal.tolPd, 0.056, 1e-9, "5H TD2 = 56 µm");
  assert.equal(metricToleranceEnvelope({ major: 5, pitch: 0.5, extGrade: 8 }).external, null);
  assert.throws(() => metricToleranceEnvelope({ major: 10, pitch: 0.1 }), /0\.2 to 8 mm/);
});

test("M6x1 6g allowance is 0.026 and 4h has none", () => {
  near(metricToleranceEnvelope({ major: 6, pitch: 1 }).external.allowance, 0.026, 0.0005);
  assert.equal(metricToleranceEnvelope({ major: 6, pitch: 1, extPos: "h", extGrade: 4 }).external.allowance, 0);
});

// ASME B1.5: 1/2-10 Acme basic PD 0.4500, minor (int) 0.4000, depth 0.0500
test("1/2-10 Acme basic geometry", () => {
  const g = acmeGeometry({ major: 0.5, tpi: 10 });
  near(g.pitchDiameter, 0.45);
  near(g.internalMinor, 0.4);
  near(g.depth, 0.05);
  near(g.externalMinor, 0.38);
  near(g.allowance["2G"], 0.008 * Math.sqrt(0.5), 1e-12);
});

// ASME B18.29.1 suggested STI drills: 1/4-20 → 17/64, 3/8-16 → 25/64, 1/2-13 → 33/64, 10-32 → #7.
// Heli-Coil metric drilling data (Vargus Heli-Coil PDF p.3), steel / aluminum: M10x1.5 → 10.5 / 10.5,
// M3x0.5 → 3.2 / 3.15, M24x3 → 24.75; STI minor min M24x3 = 24.649 (= D + 0.2165P).
test("STI drills come from the B18.29.1 table, with an estimate fallback", () => {
  assert.equal(stiTapDrill(0.25, 1 / 20, { isUn: true, tpi: 20 }).label, '17/64"');
  assert.equal(stiTapDrill(0.375, 1 / 16, { isUn: true, tpi: 16 }).label, '25/64"');
  assert.equal(stiTapDrill(0.5, 1 / 13, { isUn: true, tpi: 13 }).label, '33/64"');
  assert.equal(stiTapDrill(0.19, 1 / 32, { isUn: true, tpi: 32 }).label, "#7");
  assert.equal(stiTapDrill(10, 1.5, { isUn: false }).size, 10.5);
  const m3 = stiTapDrill(3, 0.5, { isUn: false });
  assert.equal(m3.size, 3.2);
  assert.equal(m3.alt, 3.15);
  assert.equal(stiTapDrill(24, 3, { isUn: false }).size, 24.75);
  near(stiTapDrill(24, 3, { isUn: false }).minMinor, 24.649, 0.001);
  const est = stiTapDrill(1.25, 1 / 7, { isUn: true, tpi: 7 });
  assert.equal(est.source, "estimate");
  near(est.size, 1.25 + 0.25 / 7, 1e-12);
});

// ASME B1.20.1: 1/8-27 E1 = 0.37360, 1/2-14 E1 = 0.77843
test("NPT E1 = E0 + L1/16 matches the standard", () => {
  const r = NPT_TABLE.find((x) => x.name === "1/8-27");
  near(r.e0 + r.l1 / 16, 0.37360, 0.0001);
  const h = NPT_TABLE.find((x) => x.name === "1/2-14");
  near(h.e0 + h.l1 / 16, 0.77843, 0.0001);
});

test("drill point: 118° is 0.300 D, 135° is 0.207 D", () => {
  near(drillPointLength(1, 118), 0.3004, 0.0005);
  near(drillPointLength(1, 135), 0.2071, 0.0005);
  near(drillPointLength(1, 90), 0.5);
});

test("UNJ suffix parses as a UN thread with the series kept", () => {
  const t = parseThreadSpec("1/4-28 UNJ");
  assert.equal(t.system, "un");
  assert.equal(t.suppliedSeries, "UNJ");
});
