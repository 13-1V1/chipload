// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Right triangle solver. Free tier. Pick any two knowns.

import { register } from "../app/registry.js";
import { solveRightTriangle } from "../core/geometry.js";
import { fmt } from "../core/format.js";

const MODES = {
  runRise: ["Run (adjacent)", "Rise (opposite)"],
  hypAngle: ["Hypotenuse", "Angle"],
  runAngle: ["Run (adjacent)", "Angle"],
  riseAngle: ["Rise (opposite)", "Angle"],
  runHyp: ["Run (adjacent)", "Hypotenuse"],
  riseHyp: ["Rise (opposite)", "Hypotenuse"],
};
const isAngle = (mode, slot) => MODES[mode]?.[slot] === "Angle";
// A field is whatever the chosen pair says it is: its label, its unit, and how a unit switch treats it.
const slot = (i) => ({ label: (r) => MODES[r.mode]?.[i] ?? "Value", as: (r) => (isAngle(r.mode, i) ? "angle" : "length") });

export default register({
  id: "right-triangle",
  title: "Right triangle",
  short: "Sides and angles from any two knowns",
  help: "Enter any two things you know about a right triangle and get the rest — for angles, chamfers, or setting a part over at an angle.",
  category: "geometry",
  keywords: ["triangle", "trig", "angle", "hypotenuse", "sine", "cosine", "tangent", "rise", "run", "chamfer angle", "angle", "chamfer angle", "degrees", "side"],
  pro: false,
  inputs: [
    { id: "mode", label: "I know", kind: "select", default: "runRise",
      options: Object.entries(MODES).map(([value, [a, b]]) => ({ value, label: `${a} + ${b}` })),
      hint: "Angle means angle A: at the end of the run, opposite the rise." },
    { id: "a", positive: true, kind: "number", default: "3", defaultMm: "30", ...slot(0) },
    { id: "b", positive: true, kind: "number", default: "4", defaultMm: "40", ...slot(1) },
  ],
  compute(v, c) {
    // A leg as long as the hypotenuse leaves nothing for the other leg — say so, not "angle out of range".
    if ((v.mode === "runHyp" || v.mode === "riseHyp") && v.a >= v.b) throw new Error(`Hypotenuse has to be longer than the ${v.mode === "runHyp" ? "run" : "rise"}`);
    const r = solveRightTriangle(v.mode, v.a, v.b);
    if (![r.run, r.rise, r.hypotenuse, r.angle].every(Number.isFinite) || r.hypotenuse <= 0) throw new Error("Those values don't make a right triangle");
    if (r.angle <= 0 || r.angle >= 90) throw new Error("Angle must be between 0° and 90°");
    const p = c.units === "in" ? 4 : 3;
    const [la, lb] = MODES[v.mode];
    return {
      primary: { label: "Hypotenuse", value: r.hypotenuse, unit: c.L.length, places: p },
      stats: [
        { label: "Run (adjacent)", value: r.run, unit: c.L.length, places: p },
        { label: "Rise (opposite)", value: r.rise, unit: c.L.length, places: p },
        { label: "Angle A (opposite rise)", value: r.angle, unit: "°", places: 3 },
        { label: "Angle B", value: r.complementaryAngle, unit: "°", places: 3 },
        { label: "Slope (rise ÷ run)", value: r.slope, unit: "", places: 4 },
        { label: "Area", value: 0.5 * r.run * r.rise, unit: c.L.area, places: p },
      ],
      source: "geometry",
      explain: [
        { title: "Right triangle", formula: "hyp² = run² + rise²   tan A = rise ÷ run   sin A = rise ÷ hyp   cos A = run ÷ hyp", plugged: `${la} = ${fmt(v.a, p)} ${c.L.length}, ${lb} = ${isAngle(v.mode, 1) ? `${fmt(v.b, 3)}°` : `${fmt(v.b, p)} ${c.L.length}`}` },
      ],
      historyLabel: `${la.split(" ")[0]} ${fmt(v.a, p)} · ${lb.split(" ")[0]} ${fmt(v.b, p)}`,
    };
  },
});
