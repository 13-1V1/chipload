// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Chip thinning — radial (light WOC / HSM), lead angle (face mill, high-feed), and corner radius. Pro.

import { register } from "../app/registry.js";
import { radialChipThinningFactor, rpmFromSfm } from "../core/feeds.js";
import { leadAngleThinningFactor, cornerRadiusThinningFactor } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, lenPlaces } from "./_util.js";

export default register({
  id: "chip-thinning",
  title: "Chip thinning & HSM",
  short: "Real chip load with light radial cuts, lead angles, corner radii",
  help: "When you take a light sideways cut, the chip comes out thinner than the number you programmed. This bumps the feed back up so the tool actually cuts instead of rubbing.",
  category: "mill",
  keywords: ["chip thinning", "hsm", "high speed", "trochoidal", "radial", "axial", "lead angle", "face mill", "high feed", "corner radius", "feed"],
  pro: true,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "diameter", label: "Tool diameter", kind: "length", default: "0.5", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "4", min: 1 },
    { id: "sfm", label: "Surface speed", kind: "speed", default: "600", min: 1 },
    { id: "chip", label: "Target chip thickness (hex)", kind: "length", default: "0.003", min: 0, hint: "The chip the tool maker rates the insert or flute for." },
    { id: "woc", label: "Radial width of cut", kind: "length", default: "0.05", min: 0 },
    { id: "edge", label: "Cutting edge", kind: "segment", default: "square",
      options: [{ value: "square", label: "Square" }, { value: "lead", label: "Lead angle" }, { value: "corner", label: "Corner radius" }] },
    { id: "lead", label: "Lead angle (κ, from the axis)", kind: "angle", default: "45", min: 1, max: 90, showIf: (r) => r.edge === "lead", hint: "45° face mill, 10–17° high-feed, 90° square shoulder." },
    { id: "cornerR", label: "Corner radius", kind: "length", default: "0.03", min: 0, showIf: (r) => r.edge === "corner" },
    { id: "doc", label: "Axial depth of cut", kind: "length", default: "0.015", min: 0, showIf: (r) => r.edge === "corner" },
    { id: "mode", advanced: true, label: "Cap", kind: "segment", default: "std", options: [{ value: "std", label: "Standard (2.5×)" }, { value: "hsm", label: "HSM (5×)" }] },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const cap = v.mode === "hsm" ? 5 : 2.5;
    const radial = radialChipThinningFactor(v.diameter, v.woc, cap);
    let axial = 1, axialLabel = "";
    if (v.edge === "lead") { axial = Math.min(leadAngleThinningFactor(v.lead), cap); axialLabel = `lead ${fmt(v.lead, 0)}°`; }
    if (v.edge === "corner") { axial = Math.min(cornerRadiusThinningFactor({ cornerRadius: v.cornerR, depth: v.doc }), cap); axialLabel = `r ${fmt(v.cornerR, p)} @ ap ${fmt(v.doc, p)}`; }
    const total = Math.min(radial * axial, cap);
    const fz = v.chip * total;
    const rpm = rpmFromSfm(toSfm(v.sfm, c.units), toIn(v.diameter, c.units));
    const feed = rpm * v.flutes * fz;
    const warnings = [];
    if (total >= cap) warnings.push(`Thinning capped at ${cap}×. Beyond that, rubbing and chatter set in before the math does.`);
    if (v.woc > v.diameter / 2 && v.edge === "square") warnings.push("Radial cut is over half the diameter — no radial thinning applies.");
    return {
      primary: { label: `Program this chip load (${fmt(total, 2)}× thinning)`, value: fz, unit: c.L.length, places: 4 },
      stats: [
        { label: "Feed at that chip load", value: feed, unit: c.L.feed, places: 1 },
        { label: "Spindle", value: rpm, unit: "RPM", places: 0 },
        { label: "Radial factor", value: radial, unit: "×", places: 2 },
        ...(axialLabel ? [{ label: `Axial factor (${axialLabel})`, value: axial, unit: "×", places: 2 }] : []),
        { label: "Radial engagement", value: 100 * v.woc / v.diameter, unit: "% of dia", places: 1 },
        { label: "Unthinned feed (for comparison)", value: rpm * v.flutes * v.chip, unit: c.L.feed, places: 1 },
      ],
      warnings,
      source: "feeds",
      explain: [
        { title: "Radial chip thinning", formula: "factor = D ÷ (2 √(ae (D − ae)))   (ae < D/2)", plugged: `= ${fmt(v.diameter, p)} ÷ (2 √(${fmt(v.woc, p)} × ${fmt(v.diameter - v.woc, p)})) = ${fmt(radial, 3)}` },
        ...(v.edge === "lead" ? [{ title: "Lead angle", formula: "factor = 1 ÷ sin κ", plugged: `= 1 ÷ sin ${fmt(v.lead, 1)}° = ${fmt(axial, 3)}` }] : []),
        ...(v.edge === "corner" ? [{ title: "Corner radius", formula: "κ = acos((r − ap) ÷ r),  factor = 1 ÷ sin κ", plugged: `= ${fmt(axial, 3)}` }] : []),
        { title: "Programmed chip load", formula: "fz = hex × factor", plugged: `= ${fmt(v.chip, 4)} × ${fmt(total, 3)} = ${fmt(fz, 4)}` },
      ],
      notes: ["HSM (trochoidal / peel milling) lives on this: a light radial cut lets you push feed hard while the chip stays where the insert wants it."],
      historyLabel: `Ø${fmt(v.diameter, p)} · ae ${fmt(v.woc, p)} · ${fmt(total, 2)}×`,
    };
  },
});
