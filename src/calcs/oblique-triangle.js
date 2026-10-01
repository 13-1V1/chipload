// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Oblique (any) triangle solver. Pro.

import { register } from "../app/registry.js";
import { solveTriangle } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

const MODES = {
  SSS: ["Side a", "Side b", "Side c"],
  SAS: ["Side a", "Side b", "Angle C (between them)"],
  ASA: ["Angle A", "Angle B", "Side c (between them)"],
  AAS: ["Angle A", "Angle B", "Side a (opposite A)"],
  SSA: ["Side a", "Side b", "Angle A (opposite a)"],
};
const isAngle = (label) => String(label).startsWith("Angle");
const slot = (i) => ({ label: (r) => MODES[r.mode]?.[i] ?? "Value", as: (r) => (isAngle(MODES[r.mode]?.[i]) ? "angle" : "length") });

export default register({
  id: "oblique-triangle",
  title: "Any triangle",
  short: "Law of sines / cosines from three knowns",
  help: "Any triangle, not just right ones. Give three things and get the rest.",
  category: "geometry",
  keywords: ["oblique", "triangle", "law of sines", "law of cosines", "sss", "sas", "asa", "angle", "any triangle"],
  pro: true,
  inputs: [
    { id: "mode", label: "I know", kind: "select", default: "SSS", options: Object.entries(MODES).map(([value, l]) => ({ value, label: `${value} — ${l.join(", ")}` })) },
    { id: "p1", positive: true, kind: "number", default: "3", defaultMm: "30", ...slot(0) },
    { id: "p2", positive: true, kind: "number", default: "4", defaultMm: "40", ...slot(1) },
    { id: "p3", positive: true, kind: "number", default: "5", defaultMm: "50", ...slot(2) },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const labels = MODES[v.mode];
    const args = { SSS: { a: v.p1, b: v.p2, c: v.p3 }, SAS: { a: v.p1, b: v.p2, C: v.p3 }, ASA: { A: v.p1, B: v.p2, c: v.p3 }, AAS: { A: v.p1, B: v.p2, a: v.p3 }, SSA: { a: v.p1, b: v.p2, A: v.p3 } }[v.mode];
    for (const [label, val] of labels.map((l, i) => [l, [v.p1, v.p2, v.p3][i]])) {
      if (isAngle(label) && !(val > 0 && val < 180)) throw new Error("Angles have to be between 0° and 180°");
    }
    const t = solveTriangle(v.mode, args);
    if (![t.a, t.b, t.c, t.A, t.B, t.C].every((x) => Number.isFinite(x) && x > 0)) throw new Error("Those values don't make a triangle");
    const stats = [
      { label: "Side a", value: t.a, unit: c.L.length, places: p }, { label: "Angle A", value: t.A, unit: "°", places: 3 },
      { label: "Side b", value: t.b, unit: c.L.length, places: p }, { label: "Angle B", value: t.B, unit: "°", places: 3 },
      { label: "Side c", value: t.c, unit: c.L.length, places: p }, { label: "Angle C", value: t.C, unit: "°", places: 3 },
      { label: "Area", value: t.area, unit: c.L.area, places: p },
      { label: "Perimeter", value: t.a + t.b + t.c, unit: c.L.length, places: p },
    ];
    const warnings = t.ambiguous ? [`Two triangles fit these values. The other one: c = ${fmt(t.ambiguous.c, p)}, B = ${fmt(t.ambiguous.B, 3)}°, C = ${fmt(t.ambiguous.C, 3)}°.`] : [];
    return {
      primary: { label: v.mode === "SSS" ? "Angle C (opposite side c)" : v.mode === "SAS" ? "Side c" : v.mode === "ASA" || v.mode === "AAS" ? "Side b" : "Side c", value: v.mode === "SSS" ? t.C : v.mode === "ASA" || v.mode === "AAS" ? t.b : t.c, unit: v.mode === "SSS" ? "°" : c.L.length, places: v.mode === "SSS" ? 3 : p },
      stats, warnings,
      source: "geometry",
      explain: [
        { title: "Law of cosines / sines", formula: "c² = a² + b² − 2ab cos C      a ÷ sin A = b ÷ sin B = c ÷ sin C", plugged: labels.map((l, i) => `${l} = ${fmt([v.p1, v.p2, v.p3][i], isAngle(l) ? 3 : p)}`).join(", ") },
      ],
      historyLabel: `${v.mode} ${fmt(v.p1, 3)}, ${fmt(v.p2, 3)}, ${fmt(v.p3, 3)}`,
    };
  },
});
