// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// True position with bonus tolerance. Pro.

import { register } from "../app/registry.js";
import { truePosition } from "../core/inspect.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "true-position",
  title: "True position",
  short: "Position error from X/Y deviation, with MMC bonus",
  help: "Is a hole where the print says? Converts X/Y error to the position value inspectors use, with bonus tolerance at MMC.",
  category: "inspect",
  keywords: ["true position", "position", "gd&t", "mmc", "bonus", "tolerance zone", "cmm", "deviation", "y14.5"],
  pro: true,
  inputs: [
    { id: "dx", label: "X deviation (actual − nominal)", kind: "length", default: "0.003" },
    { id: "dy", label: "Y deviation (actual − nominal)", kind: "length", default: "0.004" },
    { id: "tol", label: "Position tolerance (diameter)", kind: "length", default: "0.010", min: 0 },
    { id: "mmc", label: "Material condition", kind: "segment", default: "rfs", options: [{ value: "rfs", label: "RFS" }, { value: "mmc", label: "MMC (bonus)" }] },
    { id: "feature", label: "Feature", kind: "segment", default: "hole", options: [{ value: "hole", label: "Hole" }, { value: "pin", label: "Pin" }], showIf: (r) => r.mmc === "mmc" },
    { id: "mmcSize", label: "MMC size (hole min / pin max)", kind: "length", default: "0.250", min: 0, showIf: (r) => r.mmc === "mmc" },
    { id: "actual", label: "Actual measured size", kind: "length", default: "0.253", min: 0, showIf: (r) => r.mmc === "mmc" },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const useMmc = v.mmc === "mmc";
    const r = truePosition({ dx: v.dx, dy: v.dy, tolerance: v.tol, mmc: useMmc ? v.mmcSize : null, actualSize: useMmc ? v.actual : null, internal: v.feature === "hole" });
    const warnings = [];
    if (useMmc && ((v.feature === "hole" && v.actual < v.mmcSize) || (v.feature === "pin" && v.actual > v.mmcSize))) warnings.push("Feature is outside its size limit on the MMC side — no bonus, and the size itself is out.");
    if (!r.pass) warnings.push(`Out of position by ${fmt(-r.margin, p)}. ${useMmc ? "Even with bonus." : "Check if MMC applies — bonus may save it."}`);
    return {
      primary: { label: r.pass ? "Position (in tolerance)" : "Position (OUT)", value: r.deviation, unit: c.L.length, places: p, clamped: !r.pass },
      stats: [
        { label: "Allowed (tol + bonus)", value: r.allowed, unit: c.L.length, places: p },
        { label: "Margin", value: r.margin, unit: c.L.length, places: p, clamped: r.margin < 0 },
        { label: "Radial error", value: r.radial, unit: c.L.length, places: p },
        ...(useMmc ? [{ label: "Bonus tolerance", value: r.bonus, unit: c.L.length, places: p }] : []),
        { label: "Used", value: 100 * r.deviation / r.allowed, unit: "% of zone", places: 0 },
      ],
      warnings,
      source: "geometry",
      explain: [
        { title: "ASME Y14.5 position", formula: "TP = 2 √(Δx² + Δy²)", plugged: `= 2 √(${fmt(v.dx, p)}² + ${fmt(v.dy, p)}²) = ${fmt(r.deviation, p)}` },
        ...(useMmc ? [{ title: "Bonus at MMC", formula: v.feature === "hole" ? "bonus = actual − MMC" : "bonus = MMC − actual", plugged: `= ${fmt(r.bonus, p)}` }] : []),
      ],
      historyLabel: `Δ${fmt(v.dx, p)}, ${fmt(v.dy, p)} → ${fmt(r.deviation, p)}`,
    };
  },
});
