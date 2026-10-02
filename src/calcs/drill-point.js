// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Drill point length and total Z for a full-diameter hole. Pro.

import { register } from "../app/registry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

/** Point length = D ÷ (2 tan(θ/2)). 118° → 0.300 D, 135° → 0.207 D, 90° → 0.5 D. */
export function drillPointLength(diameter, includedAngle) {
  return diameter / (2 * Math.tan((includedAngle / 2) * Math.PI / 180));
}

export default register({
  id: "drill-point",
  title: "Drill point & hole depth",
  short: "Point length, Z for full diameter, breakthrough",
  help: "A drill's point adds length. Gives the Z depth so the full-diameter part of the hole reaches your depth, or breaks through.",
  category: "drill",
  keywords: ["drill point", "point length", "118", "135", "depth", "full diameter", "breakthrough", "through hole", "z depth"],
  pro: true,
  inputs: [
    { id: "diameter", label: "Drill diameter", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "angle", label: "Point angle", kind: "segment", default: "118", options: [{ value: "90", label: "90°" }, { value: "118", label: "118°" }, { value: "135", label: "135°" }, { value: "140", label: "140°" }, { value: "custom", label: "Other" }] },
    { id: "customAngle", label: "Point angle", kind: "angle", default: "120", min: 1, max: 179, showIf: (r) => r.angle === "custom" },
    { id: "depth", label: "Hole depth needed (full diameter)", kind: "length", default: "1", defaultMm: "25", min: 0 },
    { id: "through", label: "Hole is", kind: "segment", default: "blind", options: [{ value: "blind", label: "Blind" }, { value: "through", label: "Through" }] },
    { id: "clear", label: "Breakthrough clearance", kind: "length", default: "0.05", defaultMm: "1", min: 0, showIf: (r) => r.through === "through" },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const angle = v.angle === "custom" ? v.customAngle : Number(v.angle);
    const pt = drillPointLength(v.diameter, angle);
    const z = v.depth + pt + (v.through === "through" ? v.clear : 0);
    return {
      primary: { label: `Program Z (${v.through === "through" ? "through + clearance" : "blind, full dia to depth"})`, value: -z, unit: c.L.length, places: p },
      stats: [
        { label: "Point length", value: pt, unit: c.L.length, places: p },
        { label: "Point as fraction of D", value: pt / v.diameter, unit: "× D", places: 3 },
        { label: "Full-diameter depth", value: v.depth, unit: c.L.length, places: p },
        ...(v.through === "through" ? [{ label: "Past the far face", value: pt + v.clear, unit: c.L.length, places: p }] : []),
      ],
      source: "geometry",
      explain: [
        { title: "Point length", formula: "L = D ÷ (2 tan(θ/2))", plugged: `= ${fmt(v.diameter, p)} ${c.L.length} ÷ (2 tan ${fmt(angle / 2, 1)}°) = ${fmt(pt, p)} ${c.L.length}` },
        { title: "Z depth", formula: v.through === "through" ? "Z = depth + point + clearance" : "Z = depth + point", plugged: `= ${fmt(z, p)} ${c.L.length}` },
      ],
      notes: ["Blind holes with a tapped depth callout are measured at full diameter — the point adds to the drill depth, not the thread depth."],
      historyLabel: `Ø${fmt(v.diameter, p)} · ${fmt(angle, 0)}° · ${fmt(v.depth, p)} deep`,
    };
  },
});
