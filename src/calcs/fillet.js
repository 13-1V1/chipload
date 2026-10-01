// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Fillet tangent points between two lines. Pro.

import { register } from "../app/registry.js";
import { filletTangents } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "fillet",
  title: "Fillet tangent points",
  short: "Where an arc starts and ends between two lines",
  help: "Where an arc starts and ends when it blends two lines — for programming G02/G03.",
  category: "geometry",
  keywords: ["fillet", "tangent", "corner radius", "blend", "arc start", "g02", "g03", "included angle"],
  pro: true,
  inputs: [
    { id: "radius", label: "Fillet radius", kind: "length", default: "0.25", min: 0.0001 },
    { id: "angle", label: "Included angle between the lines", kind: "angle", default: "90", min: 0.1, max: 179.9 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const f = filletTangents({ radius: v.radius, includedAngle: v.angle });
    return {
      primary: { label: "Tangent distance from the corner (each line)", value: f.tangentDistance, unit: c.L.length, places: p },
      stats: [
        { label: "Corner to arc center", value: f.cornerToCenter, unit: c.L.length, places: p },
        { label: "Arc sweep", value: f.arcAngle, unit: "°", places: 3 },
        { label: "Arc length", value: f.arcLength, unit: c.L.length, places: p },
        { label: "Corner to arc (gap removed)", value: f.cornerToCenter - v.radius, unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [{ title: "Fillet geometry", formula: "t = r ÷ tan(θ/2)     d = r ÷ sin(θ/2)     sweep = 180° − θ", plugged: `r ${fmt(v.radius, p)}, θ ${fmt(v.angle, 2)}° → t ${fmt(f.tangentDistance, p)}` }],
      notes: ["Program the line to the tangent point, then G02/G03 to the other tangent point with R = fillet radius."],
      historyLabel: `R${fmt(v.radius, p)} at ${fmt(v.angle, 1)}°`,
    };
  },
});
