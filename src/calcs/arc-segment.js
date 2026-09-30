// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Arc / chord / segment from any two knowns. Pro.

import { register } from "../app/registry.js";
import { circularSegment } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

const PAIRS = {
  "radius,chord": ["Radius", "Chord"],
  "radius,height": ["Radius", "Height (sagitta)"],
  "radius,angle": ["Radius", "Angle"],
  "chord,height": ["Chord", "Height (sagitta)"],
  "chord,angle": ["Chord", "Angle"],
  "height,angle": ["Height (sagitta)", "Angle"],
};

export default register({
  id: "arc-segment",
  title: "Arc, chord & segment",
  short: "Radius, chord, height, angle, arc length — from any two",
  category: "geometry",
  keywords: ["arc", "chord", "segment", "sagitta", "radius", "arc length", "bow", "height of arc", "radius gauge"],
  pro: true,
  inputs: [
    { id: "pair", label: "I know", kind: "select", default: "chord,height", options: Object.entries(PAIRS).map(([value, l]) => ({ value, label: `${l[0]} + ${l[1]}` })) },
    { id: "a", label: "First value", kind: "number", default: "2", min: 0 },
    { id: "b", label: "Second value", kind: "number", default: "0.25", min: 0 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const [k1, k2] = v.pair.split(",");
    const s = circularSegment({ [k1]: v.a, [k2]: v.b });
    return {
      primary: { label: k1 === "radius" || k2 === "radius" ? "Chord" : "Radius", value: k1 === "radius" || k2 === "radius" ? s.chord : s.radius, unit: c.L.length, places: p },
      stats: [
        { label: "Radius", value: s.radius, unit: c.L.length, places: p },
        { label: "Diameter", value: s.radius * 2, unit: c.L.length, places: p },
        { label: "Chord", value: s.chord, unit: c.L.length, places: p },
        { label: "Height (sagitta)", value: s.height, unit: c.L.length, places: p },
        { label: "Central angle", value: s.angle, unit: "°", places: 3 },
        { label: "Arc length", value: s.arcLength, unit: c.L.length, places: p },
        { label: "Segment area", value: s.area, unit: c.L.area, places: p },
      ],
      source: "geometry",
      explain: [{ title: "Segment relations", formula: "R = (c²/4h + h) ÷ 2     c = 2 √(2Rh − h²)     θ = 2 asin(c ÷ 2R)     arc = R θ", plugged: `R ${fmt(s.radius, p)}, c ${fmt(s.chord, p)}, h ${fmt(s.height, p)}, θ ${fmt(s.angle, 3)}°` }],
      notes: ["Measuring a radius on a part: lay a rule across (chord) and measure the gap at the middle (height)."],
      historyLabel: `${PAIRS[v.pair][0]} ${fmt(v.a, 3)} · ${PAIRS[v.pair][1]} ${fmt(v.b, 3)}`,
    };
  },
});
