// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe G-code snippets (tnr-comp), checked from the geometry rather than against the app's own output:
// every arc's center is solved from its endpoints, R word and G2/G3, and every compensated move is checked
// for which side of the path the nose sits on.
//
// Convention (Fanuc / Haas lathe, G18): view the part with Z to the right and X (diameter) up; toward the
// chuck is −Z. +Y = Z × X points at the viewer, so G2 is clockwise in this view and G3 counter-clockwise.
// G41 / G42 puts the tool left / right of the path looking along the travel. Front- and rear-turret machines
// run the same program. Sources: Haas Lathe Programming Workbook (TNC section: OD turning toward the chuck
// = G42, boring toward the chuck = G41; tip 3 = OD turning tool, tip 2 = boring bar; p.43 "G03 X2. Z-0.25
// R0.25" rounds a face-to-OD corner; G71 example "N17 G03 X1. Z-0.5 R.125" corner, "N19 G02 ... R.125"
// fillet), Goodheart-Willcox "CNC Machining" ch.19 (outside corner "G3 X2. Z-.1 R.1", inside fillet
// "G2 X2.5 Z-1. R.25", both turning toward the chuck under G42).

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/tnr-comp.js";
import { getCalc } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";
import { NOSE_RADII_IN } from "../../src/core/lathe.js";
import { near } from "../helpers.mjs";

const run = (over = {}, units = "in") => {
  const def = getCalc("tnr-comp"), ctx = { units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine: null, fmt };
  const built = buildValues(def, defaultRaw(def, over, units), ctx);
  assert.equal(built.invalid.size, 0, [...built.invalid].join(","));
  return { v: built.values, out: def.compute(built.values, ctx) };
};

/** Moves of a snippet in part coordinates: p = [z, radius]. `start` is where the tool sits before the first block. */
function moves(text, start = null) {
  const list = [];
  let pos = start, motion = null, comp = "G40";
  for (const line of text.split("\n")) {
    if (line.startsWith("(")) continue;
    const words = Object.fromEntries([...line.matchAll(/([GXZRF])(-?[\d.]+)/g)].map((m) => [m[1] + (m[1] === "G" ? m[2] : ""), m[1] === "G" ? true : Number(m[2])]));
    for (const g of ["G0", "G1", "G2", "G3"]) if (words[g]) motion = g;
    for (const g of ["G40", "G41", "G42"]) if (words[g]) comp = g;
    const to = [words.Z ?? pos?.[0], words.X != null ? words.X / 2 : pos?.[1]];
    if (pos && (words.X != null || words.Z != null)) list.push({ motion, comp, from: pos, to, R: words.R, line });
    pos = to;
  }
  return list;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => [a[0] / len(a), a[1] / len(a)];
const left = (d) => [-d[1], d[0]]; // +90°, counter-clockwise in the Z-right / X-up view
const right = (d) => [d[1], -d[0]];

/** Center of a G2/G3 R-word arc (R > 0 = the short way round): left of the chord for G3, right for G2. */
function arcCenter(m) {
  const chord = sub(m.to, m.from), mid = add(m.from, chord, 0.5), half = len(chord) / 2;
  const h = Math.sqrt(Math.max(0, m.R * m.R - half * half));
  return add(mid, (m.motion === "G3" ? left : right)(unit(chord)), h);
}

/** Points along a move with the travel direction there. */
function samples(m) {
  if (m.motion === "G2" || m.motion === "G3") {
    const c = arcCenter(m), a0 = Math.atan2(m.from[1] - c[1], m.from[0] - c[0]);
    let sweep = Math.atan2(m.to[1] - c[1], m.to[0] - c[0]) - a0;
    if (m.motion === "G3" && sweep < 0) sweep += 2 * Math.PI;
    if (m.motion === "G2" && sweep > 0) sweep -= 2 * Math.PI;
    return [0.25, 0.5, 0.75].map((t) => {
      const a = a0 + t * sweep, radial = [Math.cos(a), Math.sin(a)];
      return { p: add(c, radial, m.R), dir: m.motion === "G3" ? left(radial) : right(radial) };
    });
  }
  const d = unit(sub(m.to, m.from));
  return [0.25, 0.5, 0.75].map((t) => ({ p: add(m.from, sub(m.to, m.from), t), dir: d }));
}

/** The finished part for each case, as "is this point metal?" in [z, radius]. Shoulders and floors run on forever. */
function partOf(v, r) {
  const d = v.dia / 2, z0 = v.z, R = v.radius, id = v.side === "id";
  if (v.feature === "chamfer") {
    const a = v.size * Math.tan(v.angle * Math.PI / 180), dz = v.size;
    return id
      ? ([z, x]) => z <= z0 && x >= Math.max(d, d + a - (z0 - z) * a / dz)
      : ([z, x]) => z <= z0 && x >= 0 && x <= Math.min(d, d - a + (z0 - z) * a / dz);
  }
  if (v.convex === "convex") {
    const c = [z0 - R, id ? d + R : d - R];
    const inCorner = ([z, x]) => z > c[0] && (id ? x < c[1] : x > c[1]);
    return id
      ? (p) => p[0] <= z0 && p[1] >= d && !(inCorner(p) && len(sub(p, c)) > R)
      : (p) => p[0] <= z0 && p[1] >= 0 && p[1] <= d && !(inCorner(p) && len(sub(p, c)) > R);
  }
  const c = [z0 + R, id ? d - R : d + R];
  const inFillet = ([z, x]) => z < c[0] && (id ? x > c[1] : x < c[1]);
  return id
    ? (p) => p[0] <= z0 || p[1] >= d || (inFillet(p) && len(sub(p, c)) > R)
    : (p) => p[1] >= 0 && (p[0] <= z0 || p[1] <= d || (inFillet(p) && len(sub(p, c)) > R));
}

const isFilletCase = (v) => v.feature === "radius" && v.convex === "concave";

/** Where the arc's center has to be: in the metal for a rounded corner, in the air for a fillet. */
function profileCenter(v) {
  const d = v.dia / 2, R = v.radius, id = v.side === "id";
  return v.convex === "convex" ? [v.z - R, id ? d + R : d - R] : [v.z + R, id ? d - R : d + R];
}

const CASES = [];
for (const units of ["in", "mm"]) {
  for (const side of ["od", "id"]) {
    CASES.push({ feature: "chamfer", side }, { feature: "chamfer", side, angle: "30", z: units === "in" ? "-0.5" : "-12" });
    for (const convex of ["convex", "concave"]) CASES.push({ feature: "radius", side, convex }, { feature: "radius", side, convex, z: units === "in" ? "-1.25" : "-30", dia: units === "in" ? "2" : "50" });
  }
  for (const c of CASES.slice(-12)) c.units = units;
}

test("every compensated move keeps the nose on the air side, and every arc is centered where the drawing says", () => {
  for (const { units, ...over } of CASES) {
    const { v, out } = run(over, units);
    const metal = partOf(v);
    const eps = units === "in" ? 0.002 : 0.05;
    const block = out.code.find((b) => /G4[12]/.test(b.text));
    const label = `${units} ${JSON.stringify(over)}`;
    // The tool starts in front of the part and outside it (like X4.0 Z1.0 over a 1 in bore). For the rapids the
    // part gets a front face: at Z for a chamfer or corner, a full inch (25.4 mm) past the fillet for a step,
    // so a fillet's entry point is deep inside a bore and the way in has to stay in the air.
    const k = units === "in" ? 1 : 25.4;
    const zFront = isFilletCase(v) ? v.z + v.radius + k : v.z;
    const solid = (p) => p[0] <= zFront + 1e-9 && metal(p);
    let profileMoves = 0;
    for (const m of moves(block.text, [zFront + k, v.dia / 2 + 1.5 * k])) {
      if (m.motion === "G0") {
        // from just past the start (a retract begins on the finished surface) to the end point
        for (let t = 1 / 64; t <= 1; t += 1 / 64) assert.ok(!solid(add(m.from, sub(m.to, m.from), t)), `${label}: rapid "${m.line}" runs through metal`);
        continue;
      }
      assert.notEqual(m.comp, "G40", `${label}: "${m.line}" cuts with comp off`);
      const isProfile = m.motion !== "G1" || (m.from[0] !== m.to[0] && m.from[1] !== m.to[1]);
      for (const s of samples(m)) {
        const side = (m.comp === "G41" ? left : right)(s.dir);
        assert.ok(!metal(add(s.p, side, eps)), `${label}: ${m.comp} on "${m.line}" puts the nose in the metal`);
        if (isProfile) assert.ok(metal(add(s.p, side, -eps)), `${label}: "${m.line}" isn't cutting the part outline`);
      }
      if (m.motion === "G2" || m.motion === "G3") {
        profileMoves++;
        const want = profileCenter(v), got = arcCenter(m);
        assert.ok(len(sub(got, want)) < 1e-3, `${label}: ${m.line} is centered at Z${fmt(got[0], 4)} X${fmt(got[1] * 2, 4)}, the drawing's center is Z${fmt(want[0], 4)} X${fmt(want[1] * 2, 4)}`);
        assert.equal(metal(got), v.convex === "convex", `${label}: arc center should be in the ${v.convex === "convex" ? "metal (rounded corner)" : "air (fillet)"}`);
      } else if (isProfile) profileMoves++;
    }
    assert.equal(profileMoves, 1, `${label}: one chamfer line or arc`);
    // A boring bar leaves the bore in Z before it is done.
    if (v.side === "id") assert.match(block.text, /G0 Z[\d.-]+\n?(\([A-Z0-9 .\-/]+\))?$/, label);
  }
});

// Haas Lathe Programming Workbook p.43: face to OD, toward the chuck, is "G03 X2. Z-0.25 R0.25" (CCW).
test("published shapes: OD corner is G3, OD fillet into a shoulder is G2, both under G42; a bore mirrors to G2 / G3 under G41", () => {
  assert.match(run({ feature: "radius" }).out.code[0].text, /^G42 G1 Z0\.0 F0\.006\nG3 X1\.0 Z-0\.125 R0\.125$/m);
  assert.match(run({ feature: "radius" }, "mm").out.code[0].text, /\nG3 X25\.0 Z-3\.0 R3\.0\n/);
  // Goodheart-Willcox ch.19: "G1 Z-.75 / G2 X2.5 Z-1. R.25" — along the small diameter toward the chuck, CW up into the shoulder
  const fillet = run({ feature: "radius", convex: "concave", dia: "2", z: "-1", radius: "0.25" }).out.code[0].text;
  assert.match(fillet, /^G42 G1 X2\.0 F0\.006\nG1 Z-0\.75\nG2 X2\.5 Z-1\.0 R0\.25$/m);
  const bore = run({ feature: "radius", side: "id" }).out.code[0].text;
  assert.match(bore, /^G41 G1 Z0\.0 F0\.006\nG2 X1\.0 Z-0\.125 R0\.125$/m);
  assert.match(bore, /TIP 2/);
  const boreFillet = run({ feature: "radius", side: "id", convex: "concave" }).out.code[0].text;
  assert.match(boreFillet, /\nG3 X0\.75 Z0\.0 R0\.125\n/);
  assert.doesNotMatch(boreFillet, /G42/);
  assert.match(run({ side: "id" }).out.code[1].text, /^G41 G1 Z0\.0/m);
  assert.match(run({}).out.code[1].text, /^G42 G1 Z0\.0/m);
});

// The hand-shifted (tip-programmed) chamfer: with the nose center at tip + (r, r) for tip 3 or tip + (r, −r)
// for tip 2, the nose circle has to touch the true chamfer line at both ends of the move, from the air side.
test("tip-programmed chamfer puts the real nose on the chamfer line, OD and bore, any angle", () => {
  for (const units of ["in", "mm"]) {
    for (const side of ["od", "id"]) {
      for (const angle of ["30", "45", "60", "15"]) {
        const { v, out } = run({ side, angle }, units);
        const r = units === "in" ? 1 / 32 : 25.4 / 32;
        const metal = partOf(v);
        const m = moves(out.code[0].text).find((x) => x.motion === "G1" && x.from[0] !== x.to[0] && x.from[1] !== x.to[1]);
        const a = v.size * Math.tan(v.angle * Math.PI / 180), d = v.dia / 2, out1 = side === "id" ? -1 : 1;
        const P0 = [v.z, d - out1 * a], P1 = [v.z - v.size, d];
        const dir = unit(sub(P1, P0));
        for (const tipPt of [m.from, m.to]) {
          const center = add(tipPt, [r, side === "id" ? -r : r]);
          const dist = Math.abs((center[0] - P0[0]) * dir[1] - (center[1] - P0[1]) * dir[0]);
          near(dist, r, 1e-3 * r, `${units} ${side} ${angle}°: nose center off the chamfer line by`);
          assert.ok(!metal(center), `${units} ${side} ${angle}°: nose center in the metal`);
        }
      }
    }
  }
});

test("bad combinations get a plain refusal instead of a snippet", () => {
  const def = getCalc("tnr-comp");
  const ctx = { units: "in", L: UNIT_LABEL.in, settings: { units: "in", pro: true }, machine: null, fmt };
  const go = (over) => { const b = buildValues(def, defaultRaw(def, over, "in"), ctx); return () => def.compute(b.values, ctx); };
  assert.throws(go({ feature: "radius", convex: "concave", radius: "0.03125" }), /same size as the nose/);
  // A print writes a 1/32 nose as 0.0312: within a tenth (0.0001 in) of the nose it is the same size, not bigger.
  assert.throws(go({ feature: "radius", convex: "concave", radius: "0.0312" }), /same size as the nose/);
  assert.throws(go({ feature: "radius", convex: "concave", radius: "0.02" }), /bigger than the fillet/);
  // 0.0315 is 0.00025 in over a 1/32 nose: a real, if small, nose-center path
  assert.doesNotThrow(go({ feature: "radius", convex: "concave", radius: "0.0315" }));
  const mm = { units: "mm", L: UNIT_LABEL.mm, settings: { units: "mm", pro: true }, machine: null, fmt };
  const goMm = (over) => { const b = buildValues(def, defaultRaw(def, over, "mm"), mm); return () => def.compute(b.values, mm); };
  // 1/32 in = 0.79375 mm; 0.794 mm is 0.00025 mm (0.00001 in) off it
  assert.throws(goMm({ feature: "radius", convex: "concave", radius: "0.794" }), /same size as the nose/);
  assert.throws(goMm({ feature: "radius", convex: "concave", radius: "0.7" }), /bigger than the fillet/);
  assert.throws(go({ feature: "radius", side: "id", convex: "concave", dia: "0.25", radius: "0.125" }), /past the centerline/);
  assert.throws(go({ side: "id", dia: "0" }), /bore diameter/);
});

test("snippet comments use only capitals, digits, space and . - / and fit 36 characters", () => {
  for (const units of ["in", "mm"]) {
    for (const over of [{}, { side: "id" }, { feature: "radius" }, { feature: "radius", convex: "concave", side: "id" }, { size: "12.345", dia: "9999.999", angle: "45", nose: "custom", noseCustom: "12.3456" }, { feature: "radius", radius: "1234.567", dia: "9999.999", nose: "custom", noseCustom: "123.456" }]) {
      for (const block of run(over, units).out.code) {
        for (const l of block.text.split("\n").filter((x) => x.startsWith("("))) {
          assert.match(l, /^\([A-Z0-9 .\-/]+\)$/, l);
          assert.ok(l.length <= 36, `"${l}" is ${l.length} characters`);
        }
      }
    }
  }
});

test("mm mode reads in mm, and the error highlight uses 0.0005 in whatever the unit", () => {
  const { out } = run({}, "mm");
  const text = JSON.stringify({ ...out, code: null });
  assert.doesNotMatch(text, /\bin\b|IPR|IPM|SFM/);
  assert.match(out.explain[0].plugged, /0\.794 mm/);
  // 1/32 nose at 45°: e = 0.4142 r = 0.0129 in = 0.329 mm — over 0.0005 in either way
  assert.equal(out.stats.find((s) => /Error/.test(s.label)).clamped, true);
  // 1/64 nose at 1.5°: e = r (sin 1.5° + cos 1.5° − 1) = 0.0258 r = 0.0103 mm — under 0.0005 in (0.0127 mm)
  assert.equal(run({ nose: "0.0156", angle: "1.5" }, "mm").out.stats.find((s) => /Error/.test(s.label)).clamped, false);
  assert.equal(NOSE_RADII_IN["0.0312"], 0.03125);
  near(run({}, "mm").out.stats.find((s) => s.label === "Same on diameter").value / 2, 25.4 / 32 * (1 - Math.tan(Math.PI / 8)), 1e-9);
});
