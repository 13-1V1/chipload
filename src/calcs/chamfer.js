// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Countersink / chamfer depth. Pro. Depth to go from one diameter to another at an included angle.

import { register } from "../app/registry.js";
import { chamferDepth } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "chamfer",
  title: "Countersink & chamfer depth",
  short: "Z depth for a countersink or chamfer",
  help: "How deep to go with a countersink or chamfer tool to reach a given diameter.",
  category: "drill",
  keywords: ["countersink", "chamfer", "csk", "82", "90", "100", "118", "depth", "spot drill"],
  pro: true,
  inputs: [
    { id: "angle", label: "Included angle", kind: "segment", default: "90",
      options: [{ value: "82", label: "82°" }, { value: "90", label: "90°" }, { value: "100", label: "100°" }, { value: "118", label: "118°" }, { value: "120", label: "120°" }, { value: "custom", label: "Other" }] },
    { id: "customAngle", label: "Angle", kind: "angle", default: "60", min: 1, max: 179, showIf: (r) => r.angle === "custom" },
    { id: "small", label: "Small diameter (tool tip or hole)", kind: "length", default: "0", min: 0 },
    { id: "large", label: "Large diameter (top of chamfer)", kind: "length", default: "0.5", defaultMm: "12", min: 0 },
  ],
  compute(v, c) {
    const angle = v.angle === "custom" ? v.customAngle : Number(v.angle);
    if (v.large <= v.small) throw new Error("Large diameter must be bigger than the small one");
    const depth = chamferDepth(v.small, v.large, angle);
    const p = lenPlaces(c.units);
    const leg = (v.large - v.small) / 2;
    return {
      primary: { label: "Depth", value: depth, unit: c.L.length, places: p },
      stats: [
        { label: "Radial size (per side)", value: leg, unit: c.L.length, places: p },
        { label: "Angle per side", value: angle / 2, unit: "°", places: 2 },
        { label: "Face width (hypotenuse)", value: Math.hypot(leg, depth), unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [{ title: "Chamfer depth", formula: "depth = (Dlarge − Dsmall) ÷ (2 tan(θ ÷ 2))", plugged: `= (${fmt(v.large, p)} − ${fmt(v.small, p)} ${c.L.length}) ÷ (2 tan ${fmt(angle / 2, 1)}°) = ${fmt(depth, p)} ${c.L.length}` }],
      notes: ["For a spot drill, small diameter is 0 (the point). For a chamfer tool with a flat tip, enter the tip diameter."],
      historyLabel: `${angle}° · ${fmt(v.small, p)} → ${fmt(v.large, p)} ${c.L.length}`,
    };
  },
});
