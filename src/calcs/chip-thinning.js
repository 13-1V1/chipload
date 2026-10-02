// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Chip thinning — radial (light WOC / HSM), lead angle (face mill, high-feed), and corner radius. Pro.

import { register } from "../app/registry.js";
import { radialChipThinningRaw, rpmFromSfm } from "../core/feeds.js";
import { leadAngleThinningFactor, cornerRadiusThinningFactor } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, lenPlaces } from "./_util.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

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
    { id: "diameter", label: "Tool diameter", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "4", min: 1 },
    { id: "sfm", label: "Surface speed", kind: "speed", default: "600", defaultMm: "180", min: 1 },
    { id: "chip", positive: true, label: "Target chip thickness (hex)", kind: "length", default: "0.003", defaultMm: "0.08", min: 0, hint: "The chip the tool maker rates the insert or flute for." },
    { id: "woc", positive: true, label: "Radial width of cut", kind: "length", default: "0.05", defaultMm: "1.2", min: 0 },
    { id: "edge", label: "Cutting edge", kind: "segment", default: "square",
      options: [{ value: "square", label: "Square" }, { value: "lead", label: "Lead angle" }, { value: "corner", label: "Corner radius" }] },
    // Entering angle κr (Sandvik): measured from the work face, so 90° is a square shoulder.
    { id: "lead", label: "Edge angle from the work face (κr)", kind: "angle", default: "45", min: 1, max: 90, showIf: (r) => r.edge === "lead",
      hint: "90° = square shoulder, 45° face mill, 10–17° high-feed. Catalog lead angle measured from the axis (0° = square)? Enter 90 minus it: a “15° lead” mill is 75." },
    { id: "cornerR", label: "Corner radius", kind: "length", default: "0.03", defaultMm: "0.8", min: 0, showIf: (r) => r.edge === "corner" },
    { id: "doc", positive: true, label: "Axial depth of cut", kind: "length", default: "0.015", defaultMm: "0.4", min: 0, showIf: (r) => r.edge === "corner" },
    { id: "mode", advanced: true, label: "Cap", kind: "segment", default: "std", options: [{ value: "std", label: "Standard (2.5×)" }, { value: "hsm", label: "HSM (5×)" }] },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const cp = c.units === "in" ? 5 : 4;   // chip loads
    const len = (x) => `${fmt(x, p)} ${c.L.length}`;
    const chip = (x) => `${fmt(x, cp)} ${c.L.length}`;
    const cap = v.mode === "hsm" ? 5 : 2.5;
    if (v.woc > v.diameter * 1.0001) throw new Error("Width of cut can't be more than the tool diameter");
    if (v.edge === "corner" && v.cornerR > (v.diameter / 2) * 1.0001) throw new Error("Corner radius can't be more than half the tool diameter (that's a ball end mill)");
    const radialRaw = radialChipThinningRaw(v.diameter, v.woc);
    const radial = Math.min(radialRaw, cap);
    let axialRaw = 1, axialLabel = "";
    if (v.edge === "lead") { axialRaw = leadAngleThinningFactor(v.lead); axialLabel = `κr ${fmt(v.lead, 0)}°`; }
    if (v.edge === "corner") { axialRaw = cornerRadiusThinningFactor({ cornerRadius: v.cornerR, depth: v.doc }); axialLabel = `r ${len(v.cornerR)} @ ap ${len(v.doc)}`; }
    const axial = Math.min(axialRaw, cap);
    const total = Math.min(radial * axial, cap);
    const fz = v.chip * total;

    // Fit inside the machine the same way feeds-mill does: the chip load holds, the spindle gives way.
    const m = machineFor(c, "mill");
    const wantedRpm = rpmFromSfm(toSfm(v.sfm, c.units), toIn(v.diameter, c.units));
    const fit = fitToMachine(m, wantedRpm, v.flutes * toIn(fz, c.units), c, { check: "the chip thickness and flutes" });
    // One turn moving more than the machine's whole max feed leaves no spindle speed: say so, don't show 0 RPM.
    if (fit.cantRun) throw new Error(fit.problem);
    const { rpm } = fit;
    const slowed = fit.rpmCapped || fit.feedCapped;
    const feed = fromIn(fit.feedIpm, c.units);

    const warnings = [...fit.warnings, ...spindleSanity(rpm, m, "mill", c)];
    if (total >= cap) warnings.push(`Thinning capped at ${cap}×. Beyond that, rubbing and chatter set in before the math does.`);
    if (v.woc > v.diameter / 2 && v.edge === "square") warnings.push("Radial cut is over half the diameter — no radial thinning applies.");
    if (v.edge === "lead" && v.lead < 30) warnings.push(`κr ${fmt(v.lead, 0)}° is a high-feed cutter (${fmt(axialRaw, 2)}× the chip). If your catalog angle is measured from the axis (0° = square shoulder), enter ${fmt(90 - v.lead, 0)} instead.`);

    const radialPlugged = !(v.woc < v.diameter / 2)
      ? `ae ${len(v.woc)} is at least half of D ${len(v.diameter)}: no radial thinning, factor = 1`
      : `= ${len(v.diameter)} ÷ (2 √(${len(v.woc)} × ${len(v.diameter - v.woc)})) = ${fmt(radialRaw, 3)}${radialRaw > cap ? `, held at ${cap}` : ""}`;
    const kappa = v.edge === "corner" && v.cornerR > 0 && v.doc < v.cornerR ? Math.acos((v.cornerR - v.doc) / v.cornerR) * 180 / Math.PI : 90;
    const cornerPlugged = !(v.doc > 0)
      ? "no axial depth given: factor = 1"
      : !(v.doc < v.cornerR)
      ? `ap ${len(v.doc)} is at least r ${len(v.cornerR)}: the straight edge cuts, factor = 1`
      : `κ = acos((${len(v.cornerR)} − ${len(v.doc)}) ÷ ${len(v.cornerR)}) = ${fmt(kappa, 1)}°, factor = 1 ÷ sin ${fmt(kappa, 1)}° = ${fmt(axialRaw, 3)}${axialRaw > cap ? `, held at ${cap}` : ""}`;
    const product = radial * axial;
    return {
      primary: { label: `Program this chip load (${fmt(total, 2)}× thinning)`, value: fz, unit: c.L.length, places: cp },
      stats: [
        { label: "Feed at that chip load", value: feed, unit: c.L.feed, places: 1, clamped: fit.feedCapped },
        { label: fit.feedCapped ? "Spindle (slowed for max feed)" : fit.rpmCapped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: slowed },
        ...(slowed ? [{ label: "Wanted RPM", value: wantedRpm, unit: "RPM", places: 0 }] : []),
        { label: "Radial factor", value: radial, unit: "×", places: 2 },
        ...(axialLabel ? [{ label: `Axial factor (${axialLabel})`, value: axial, unit: "×", places: 2 }] : []),
        { label: "Radial engagement", value: 100 * v.woc / v.diameter, unit: "% of dia", places: 1 },
        { label: "Unthinned feed (for comparison)", value: fromIn(rpm * v.flutes * toIn(v.chip, c.units), c.units), unit: c.L.feed, places: 1 },
      ],
      warnings,
      source: "feeds",
      explain: [
        { title: "Radial chip thinning", formula: "factor = D ÷ (2 √(ae (D − ae)))   (ae < D/2)", plugged: radialPlugged },
        ...(v.edge === "lead" ? [{ title: "Entering angle", formula: "factor = 1 ÷ sin κr   (κr from the work face; 90° = square shoulder)", plugged: `= 1 ÷ sin ${fmt(v.lead, 1)}° = ${fmt(axialRaw, 3)}${axialRaw > cap ? `, held at ${cap}` : ""}` }] : []),
        ...(v.edge === "corner" ? [{ title: "Corner radius", formula: "κ = acos((r − ap) ÷ r),  factor = 1 ÷ sin κ", plugged: cornerPlugged }] : []),
        { title: "Programmed chip load", formula: "fz = hex × factor", plugged: `= ${chip(v.chip)} × ${fmt(total, 3)}${product > cap ? ` (${fmt(product, 3)} held at ${cap})` : ""} = ${chip(fz)}` },
        { title: "Feed", formula: `${c.L.feed} = RPM × flutes × fz`, plugged: `= ${fmt(rpm, 0)} RPM × ${v.flutes} × ${chip(fz)} = ${fmt(feed, 1)} ${c.L.feed}${slowed ? ` (${m.name}; wanted ${fmt(wantedRpm, 0)} RPM)` : ""}` },
      ],
      notes: ["HSM (trochoidal / peel milling) lives on this: a light radial cut lets you push feed hard while the chip stays where the insert wants it."],
      historyLabel: `Ø${fmt(v.diameter, p)} ${c.L.length} · ae ${fmt(v.woc, p)} ${c.L.length} · ${fmt(total, 2)}×`,
    };
  },
});
