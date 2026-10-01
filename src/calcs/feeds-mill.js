// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds & feeds — mill. Free tier. SFM → RPM, chip load → feed, with machine-limit clamping.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm, radialChipThinningFactor, chipLoadScale } from "../core/feeds.js";
import { TOOL_LABELS } from "../data/materials.js";
import { materialOptions, materialSpeeds } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm } from "./_util.js";
import { millAdvice } from "./_advice.js";

function defaults(raw) {
  return materialSpeeds(raw.material, raw.toolType);
}

export default register({
  id: "feeds-mill",
  title: "Speeds & feeds — mill",
  short: "RPM and feed for an end mill",
  help: "Tells you how fast to spin an end mill (RPM) and how fast to push it (feed). Pick the cutter size, number of flutes, and the material; the table fills in the rest. These are starting points — ease off if it chatters.",
  category: "mill",
  keywords: ["rpm", "ipm", "sfm", "feed", "speed", "chip load", "end mill", "surface speed", "feed rate", "how fast", "end mill speed", "milling speed", "cutter", "spindle speed"],
  pro: false,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "diameter", label: "Tool diameter", kind: "length", default: "0.375", defaultMm: "10", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "4", min: 1, max: 20 },
    { id: "material", label: "Material", kind: "select", default: "al6061", options: materialOptions() },
    { id: "toolType", label: "Tool", kind: "segment", default: "carbide",
      options: Object.entries(TOOL_LABELS).map(([value, label]) => ({ value, label })) },
    { id: "sfm", advanced: true, label: "Surface speed", kind: "speed", default: "", places: 0,
      auto: (raw, c) => fromSfm(defaults(raw).sfm, c.units), hint: "Leave blank to use the table value for this material." },
    { id: "chip", positive: true, advanced: true, label: "Chip load per tooth", kind: "length", default: "", places: 4,
      auto: (raw, c, values) => {
        const dIn = Number.isFinite(values.diameter) ? toIn(values.diameter, c.units) : 0.375;
        return fromIn(defaults(raw).chipIn * chipLoadScale(dIn), c.units);
      } },
    { id: "woc", min: 0, advanced: true, label: "Width of cut (radial)", kind: "length", default: "", optional: true, placeholder: "optional — enables chip thinning" },
    { id: "doc", min: 0, advanced: true, label: "Depth of cut (axial)", kind: "length", default: "", optional: true, placeholder: "optional — enables removal rate" },
  ],
  compute(v, c) {
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const chipIn = toIn(v.chip, c.units);
    const wocIn = Number.isFinite(v.woc) ? toIn(v.woc, c.units) : NaN;
    const docIn = Number.isFinite(v.doc) ? toIn(v.doc, c.units) : NaN;

    const requestedRpm = rpmFromSfm(sfm, dIn);
    const maxRpm = c.machine?.maxRpm > 0 ? c.machine.maxRpm : Infinity;
    const rpm = Math.min(requestedRpm, maxRpm);
    const thin = radialChipThinningFactor(dIn, wocIn);
    const programmedChip = chipIn * thin;
    const requestedFeedIpm = rpm * v.flutes * programmedChip;
    const maxFeedIpm = c.machine?.maxFeed > 0 ? toIn(c.machine.maxFeed, c.machine.units || "in") : Infinity;
    const feedIpm = Math.min(requestedFeedIpm, maxFeedIpm);
    const clampedRpm = rpm < requestedRpm;
    const clampedFeed = feedIpm < requestedFeedIpm;
    const actualSfm = sfmFromRpm(rpm, dIn);
    const mrr = wocIn > 0 && docIn > 0 ? wocIn * docIn * feedIpm : null;

    if (wocIn > dIn * 1.0001) throw new Error("Width of cut can't be more than the tool diameter");
    const warnings = millAdvice({ dIn, wocIn, docIn, requestedRpm, machine: c.machine });
    // The math will happily feed 5× faster if you type 5× the chip load — the tool won't.
    const libChip = defaults(v).chipIn * chipLoadScale(dIn);
    if (!v.chipAuto && chipIn > Math.max(libChip * 3, dIn * 0.02)) warnings.push(`${fmt(fromIn(chipIn, c.units), 4)} ${c.L.length} per tooth is a very heavy chip for a ${fmt(v.diameter, c.units === "in" ? 3 : 1)} ${c.L.length} tool (the library says about ${fmt(fromIn(libChip, c.units), 4)}). Expect a broken tool.`);
    if (!v.chipAuto && chipIn > 0 && chipIn < libChip * 0.25) warnings.push(`${fmt(fromIn(chipIn, c.units), 4)} ${c.L.length} per tooth is very light — the tool will rub and dull instead of cutting. Typical is about ${fmt(fromIn(libChip, c.units), 4)}.`);
    if (clampedRpm) warnings.push(`${c.machine.name} tops out at ${fmt(maxRpm, 0)} RPM. Wanted ${fmt(requestedRpm, 0)}. Feed is figured at ${fmt(rpm, 0)} RPM so chip load stays right.`);
    if (clampedFeed) warnings.push(`${c.machine.name} max feed is ${fmt(fromIn(maxFeedIpm, c.units), 1)} ${c.L.feed}. Wanted ${fmt(fromIn(requestedFeedIpm, c.units), 1)}. Chip load will be thinner than planned.`);

    const stats = [
      { label: clampedRpm ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: clampedRpm },
      { label: "Chip load programmed", value: fromIn(programmedChip, c.units), unit: c.L.length, places: c.units === "in" ? 4 : 3 },
    ];
    if (clampedRpm) stats.push({ label: "Wanted RPM", value: requestedRpm, unit: "RPM", places: 0 }, { label: "Actual surface speed", value: fromSfm(actualSfm, c.units), unit: c.L.speed, places: 0 });
    if (thin > 1) stats.push({ label: "Chip thinning factor", value: thin, unit: "×", places: 2 });
    if (mrr != null) stats.push({ label: "Metal removal rate", value: c.units === "in" ? mrr : mrr * 16.387064, unit: c.L.volume, places: 2 });
    stats.push({ label: "Feed per revolution", value: fromIn(feedIpm / rpm, c.units), unit: c.L.feedRev, places: 4 });

    return {
      primary: { label: "Feed rate", value: fromIn(feedIpm, c.units), unit: c.L.feed, places: 1, clamped: clampedFeed },
      stats,
      warnings,
      source: "feeds",
      explain: [
        { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} × 12) ÷ (π × ${fmt(dIn, 4)}) = ${fmt(requestedRpm, 0)}${clampedRpm ? ` → clamped to ${fmt(rpm, 0)}` : ""}` },
        ...(thin > 1 ? [{ title: "Radial chip thinning", formula: "factor = D ÷ (2 √(ae (D − ae)))", plugged: `= ${fmt(dIn, 4)} ÷ (2 √(${fmt(wocIn, 4)} × ${fmt(dIn - wocIn, 4)})) = ${fmt(thin, 3)}` }] : []),
        { title: "Feed rate", formula: "IPM = RPM × flutes × chip load", plugged: `= ${fmt(rpm, 0)} × ${v.flutes} × ${fmt(programmedChip, 4)} = ${fmt(requestedFeedIpm, 1)}` },
      ],
      notes: v.sfmAuto || v.chipAuto ? ["Table values are conservative starting points for this material and tool type."] : [],
      historyLabel: `${fmt(v.diameter, c.units === "in" ? 4 : 2)} ${c.L.length} · ${v.flutes}FL · ${materialSpeeds(v.material).material.name}`,
    };
  },
});
