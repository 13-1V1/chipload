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

const slot = (i) => ({ label: (r) => PAIRS[r.pair]?.[i] ?? "Value", as: (r) => (PAIRS[r.pair]?.[i] === "Angle" ? "angle" : "length") });

export default register({
  id: "arc-segment",
  title: "Arc, chord & segment",
  short: "Radius, chord, height, angle, arc length — from any two",
  help: "Measure a radius you can't reach: lay a rule across (chord), measure the gap (height), get the radius. Or any two of the four.",
  category: "geometry",
  keywords: ["arc", "chord", "segment", "sagitta", "radius", "arc length", "bow", "height of arc", "radius gauge"],
  pro: true,
  inputs: [
    { id: "pair", label: "I know", kind: "select", default: "chord,height", options: Object.entries(PAIRS).map(([value, l]) => ({ value, label: `${l[0]} + ${l[1]}` })) },
    { id: "a", positive: true, kind: "number", default: "2", defaultMm: "50", ...slot(0) },
    { id: "b", positive: true, kind: "number", default: "0.25", defaultMm: "6", ...slot(1) },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const [k1, k2] = v.pair.split(",");
    if ((k1 === "angle" && v.a >= 360) || (k2 === "angle" && v.b >= 360)) throw new Error("Angle has to be less than 360°");
    const s = circularSegment({ [k1]: v.a, [k2]: v.b });
    if (![s.radius, s.chord, s.height, s.angle, s.arcLength, s.area].every(Number.isFinite)) throw new Error("Those two values don't describe an arc");
    // Every pair holds to the same limit as a typed angle: a full circle is not a segment.
    if (s.angle >= 360) throw new Error("Angle has to be less than 360°");
    const notes = ["Measuring a radius on a part: lay a rule across (chord) and measure the gap at the middle (height)."];
    // A radius and a chord fit two arcs; the short one is shown, so name the long one too (not for a half circle — they're the same).
    if (v.pair === "radius,chord" && s.angle < 180 - 1e-9) {
      const major = 360 - s.angle;
      notes.unshift(`This is the short arc. The same radius and chord also make the long arc: ${fmt(major, 3)}°, height ${fmt(2 * s.radius - s.height, p)} ${c.L.length}, arc length ${fmt(s.radius * major * Math.PI / 180, p)} ${c.L.length}. For that one, use Radius + Height.`);
    }
    // The answer is a number the user didn't type: radius + chord gives the height, the other radius pairs the
    // chord, and every pair without the radius gives the radius.
    const [label, value] = v.pair === "radius,chord" ? ["Height (sagitta)", s.height] : k1 === "radius" ? ["Chord", s.chord] : ["Radius", s.radius];
    return {
      primary: { label, value, unit: c.L.length, places: p },
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
      explain: [{ title: "Segment relations", formula: "R = (c²/4h + h) ÷ 2     c = 2 √(2Rh − h²)     θ = 2 asin(c ÷ 2R), or 360° − that when h > R (past a half circle)     arc = R θ", plugged: `R ${fmt(s.radius, p)} ${c.L.length}, c ${fmt(s.chord, p)} ${c.L.length}, h ${fmt(s.height, p)} ${c.L.length}, θ ${fmt(s.angle, 3)}°` }],
      notes,
      historyLabel: `${PAIRS[v.pair][0]} ${fmt(v.a, 3)} · ${PAIRS[v.pair][1]} ${fmt(v.b, 3)}`,
    };
  },
});
