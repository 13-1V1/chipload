// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Taper. Pro (lathe). Two diameters and a length → taper per foot, included and half angles, compound set-over.

import { register } from "../app/registry.js";
import { taperGeometry } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "taper",
  title: "Taper & included angle",
  short: "TPF, angle, and compound-rest setting",
  help: "Taper per foot and the angle to set the compound rest, from two diameters and a length.",
  category: "lathe",
  keywords: ["taper", "tpf", "taper per foot", "included angle", "half angle", "compound", "morse", "jacobs"],
  pro: true,
  inputs: [
    { id: "large", label: "Large diameter", kind: "length", default: "1", defaultMm: "25", min: 0 },
    { id: "small", label: "Small diameter", kind: "length", default: "0.75", defaultMm: "20", min: 0 },
    { id: "length", label: "Length of taper", kind: "length", default: "2", defaultMm: "50", min: 0.0001 },
  ],
  compute(v, c) {
    if (v.large <= v.small) throw new Error("Large diameter must be bigger than the small one");
    const t = taperGeometry({ largeDiameter: v.large, smallDiameter: v.small, length: v.length });
    const p = lenPlaces(c.units);
    const inch = c.units === "in";
    return {
      primary: { label: "Half angle (compound rest)", value: t.halfAngle, unit: "°", places: 4 },
      stats: [
        { label: "Included angle", value: t.includedAngle, unit: "°", places: 4 },
        inch ? { label: "Taper per foot", value: t.taperPerFoot, unit: "in/ft", places: 4 } : { label: "Taper ratio (on diameter)", text: `1 : ${fmt(t.taperRatio, 3)}` },
        { label: `Taper per ${c.L.length}`, value: t.taperPerLength, unit: `${c.L.length}/${c.L.length}`, places: 5 },
        { label: "Diameter change", value: t.diameterChange, unit: c.L.length, places: p },
        { label: "Offset per side", value: t.diameterChange / 2, unit: c.L.length, places: p },
      ],
      source: "geometry",
      explain: [
        inch
          ? { title: "Taper", formula: "TPF = 12 × (D − d) ÷ L     tan(θ/2) = (D − d) ÷ (2 L)", plugged: `= 12 × ${fmt(t.diameterChange, p)} ÷ ${fmt(v.length, p)} = ${fmt(t.taperPerFoot, 4)}; θ/2 = ${fmt(t.halfAngle, 4)}°` }
          : { title: "Taper", formula: "ratio 1 : x,  x = L ÷ (D − d)     tan(θ/2) = (D − d) ÷ (2 L)", plugged: `x = ${fmt(v.length, p)} ÷ ${fmt(t.diameterChange, p)} = ${fmt(t.taperRatio, 3)}; θ/2 = ${fmt(t.halfAngle, 4)}°` },
      ],
      notes: ["Set the compound rest to the half angle. Common tapers: Morse ≈ 0.6 in/ft (varies by size), Jacobs JT6 = 0.6761 in/ft, 7/24 (CAT/BT) = 3.5 in/ft."],
      historyLabel: `${fmt(v.large, p)} → ${fmt(v.small, p)} over ${fmt(v.length, p)}`,
    };
  },
});
