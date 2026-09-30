// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tool-nose radius comp for chamfers, tapers, and radii — with a G-code snippet. Pro.

import { register } from "../app/registry.js";
import { noseRadiusTaperComp, arcCenterPathRadius } from "../core/lathe.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

const NOSE = [["0.0156", '1/64"'], ["0.0312", '1/32"'], ["0.0469", '3/64"'], ["0.0625", '1/16"'], ["custom", "Other"]];

export default register({
  id: "tnr-comp",
  title: "Nose radius comp & G-code",
  short: "Chamfer / taper / radius offsets without G41-G42, plus a snippet",
  category: "lathe",
  keywords: ["tool nose", "tnr", "nose radius", "compensation", "g41", "g42", "chamfer", "taper", "radius", "g02", "g03", "lathe g-code"],
  pro: true,
  safety: "G-code is a starting point. Simulate, single-block, and dry run above the part.",
  inputs: [
    { id: "feature", label: "Feature", kind: "segment", default: "chamfer", options: [{ value: "chamfer", label: "Chamfer / taper" }, { value: "radius", label: "Radius" }] },
    { id: "nose", label: "Nose radius", kind: "segment", default: "0.0312", options: NOSE.map(([value, label]) => ({ value, label })) },
    { id: "noseCustom", label: "Nose radius", kind: "length", default: "0.8", min: 0.0001, showIf: (r) => r.nose === "custom" },
    { id: "angle", label: "Angle from the Z axis (centerline)", kind: "angle", default: "45", min: 0.1, max: 89.9, showIf: (r) => r.feature === "chamfer", hint: "45° chamfer = 45. A 30° chamfer callout off the face = 60 here." },
    { id: "size", label: "Chamfer size (axial, Z)", kind: "length", default: "0.05", min: 0, showIf: (r) => r.feature === "chamfer" },
    { id: "radius", label: "Part radius", kind: "length", default: "0.125", min: 0.0001, showIf: (r) => r.feature === "radius" },
    { id: "convex", label: "Radius is", kind: "segment", default: "convex", options: [{ value: "convex", label: "Outside corner" }, { value: "concave", label: "Inside fillet" }], showIf: (r) => r.feature === "radius" },
    { id: "dia", label: "Diameter the feature starts from", kind: "length", default: "1", min: 0 },
    { id: "z", label: "Z of the face / corner", kind: "length", default: "0" },
    { id: "feed", label: "Feed per rev", kind: "feedRev", default: "0.006", min: 0 },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const r = v.nose === "custom" ? v.noseCustom : (c.units === "in" ? Number(v.nose) : Number(v.nose) * 25.4);
    const dp = c.units === "in" ? 4 : 3;
    const F = fmt(v.feed, 4);
    if (v.feature === "chamfer") {
      const comp = noseRadiusTaperComp({ noseRadius: r, angleFromZ: v.angle });
      const dz = v.size; // axial length of chamfer
      const dxRad = dz * Math.tan(v.angle * Math.PI / 180); // radial
      // Imaginary-tip program (compensated by hand): start on the face early, end on the diameter late.
      const xStart = v.dia - 2 * dxRad - 2 * comp.dx;
      const zStart = v.z;
      const xEnd = v.dia;
      const zEnd = v.z - dz - comp.dz;
      const manual = [
        `(Chamfer ${fmt(dz, dp)} x ${fmt(v.angle, 1)} deg, nose r ${fmt(r, dp)}, tip-programmed with comp by hand)`,
        `G0 X${fmt(xStart, dp)} Z${fmt(zStart + 0.1, dp)}`,
        `G1 Z${fmt(zStart, dp)} F${F}`,
        `G1 X${fmt(xEnd, dp)} Z${fmt(zEnd, dp)}`,
        `G1 Z${fmt(zEnd - 0.2, dp)}`,
      ].join("\n");
      const withComp = [
        `(Same chamfer using G42 - put ${fmt(r, dp)} in the tool's R offset and the tip type T3)`,
        `G0 X${fmt(v.dia - 2 * dxRad, dp)} Z${fmt(v.z + 0.1, dp)}`,
        `G42 G1 Z${fmt(v.z, dp)} F${F}`,
        `G1 X${fmt(v.dia, dp)} Z${fmt(v.z - dz, dp)}`,
        `G1 Z${fmt(v.z - dz - 0.2, dp)}`,
        `G40 G0 X${fmt(v.dia + 0.2, dp)}`,
      ].join("\n");
      return {
        primary: { label: "Z shift at the diameter end", value: comp.dz, unit: c.L.length, places: dp },
        stats: [
          { label: "X shift at the face end (radius)", value: comp.dx, unit: c.L.length, places: dp },
          { label: "Same on diameter", value: comp.dx * 2, unit: c.L.length, places: dp },
          { label: "Error if not compensated", value: comp.error, unit: c.L.length, places: dp, clamped: comp.error > 0.0005 },
          { label: "Radial size of chamfer", value: dxRad, unit: c.L.length, places: dp },
        ],
        code: [{ title: "Tip-programmed (no G41/G42)", text: manual, pro: true, filename: "chamfer-tip.nc" }, { title: "With G42", text: withComp, pro: true, filename: "chamfer-g42.nc" }],
        source: "gcode",
        explain: [
          { title: "Nose radius comp", formula: "ΔZ = r (1 − tan(θ/2))   ΔX = r (1 − tan((90° − θ)/2))", plugged: `r = ${fmt(r, dp)}, θ = ${fmt(v.angle, 1)}° → ΔZ ${fmt(comp.dz, dp)}, ΔX ${fmt(comp.dx, dp)}` },
          { title: "Surface error without comp", formula: "e = r (sin θ + cos θ − 1)", plugged: `= ${fmt(comp.error, dp)}` },
        ],
        notes: ["The imaginary tip cuts faces and diameters right, but leaves a taper undersize by e. Shifting the endpoints fixes it; G41/G42 does the same thing automatically."],
        historyLabel: `${fmt(v.angle, 0)}° chamfer · r ${fmt(r, dp)}`,
      };
    }
    const convex = v.convex === "convex";
    const pathR = arcCenterPathRadius({ radius: v.radius, noseRadius: r, convex });
    if (pathR <= 0) throw new Error("Nose radius is bigger than the fillet — it can't cut it");
    const R = v.radius;
    const snippet = convex
      ? [`(Outside corner radius ${fmt(R, dp)} from face to diameter, G42, nose r ${fmt(r, dp)})`, `G0 X${fmt(v.dia - 2 * R, dp)} Z${fmt(v.z + 0.1, dp)}`, `G42 G1 Z${fmt(v.z, dp)} F${F}`, `G2 X${fmt(v.dia, dp)} Z${fmt(v.z - R, dp)} R${fmt(R, dp)}`, `G1 Z${fmt(v.z - R - 0.2, dp)}`, `G40 G0 X${fmt(v.dia + 0.2, dp)}`].join("\n")
      : [`(Inside fillet radius ${fmt(R, dp)} at a shoulder, G42, nose r ${fmt(r, dp)})`, `G0 X${fmt(v.dia + 0.2, dp)} Z${fmt(v.z - R - 0.2, dp)}`, `G42 G1 X${fmt(v.dia, dp)} F${F}`, `G1 Z${fmt(v.z - R, dp)}`, `G3 X${fmt(v.dia + 2 * R, dp)} Z${fmt(v.z, dp)} R${fmt(R, dp)}`, `G40 G0 X${fmt(v.dia + 2 * R + 0.2, dp)}`].join("\n");
    return {
      primary: { label: "Nose-center path radius", value: pathR, unit: c.L.length, places: dp },
      stats: [
        { label: "Part radius", value: R, unit: c.L.length, places: dp },
        { label: "Nose radius", value: r, unit: c.L.length, places: dp },
        { label: "Without comp, the arc comes out", text: convex ? `smaller by up to ${fmt(r * 0.4142, dp)} at 45°` : `larger by up to ${fmt(r * 0.4142, dp)} at 45°` },
      ],
      code: [{ title: convex ? "Outside radius with G42" : "Inside fillet with G42", text: snippet, pro: true, filename: "radius.nc" }],
      source: "gcode",
      explain: [{ title: "Center path", formula: convex ? "Rpath = R + r" : "Rpath = R − r", plugged: `= ${fmt(R, dp)} ${convex ? "+" : "−"} ${fmt(r, dp)} = ${fmt(pathR, dp)}` }],
      notes: ["Use G41/G42 for arcs. Tip-programming an arc without comp needs the endpoints shifted the same way as a chamfer — every point along the arc is a different angle."],
      historyLabel: `${convex ? "OD" : "ID"} R${fmt(R, dp)} · r ${fmt(r, dp)}`,
    };
  },
});
