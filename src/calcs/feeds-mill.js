// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds & feeds — mill. Free tier. SFM → RPM, chip load → feed, with machine-limit clamping.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm, radialChipThinningRaw, chipLoadScale } from "../core/feeds.js";
import { TOOL_LABELS } from "../data/materials.js";
import { materialOptions, materialSpeeds, toolCaution } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm } from "./_util.js";
import { millAdvice } from "./_advice.js";
import { machineFor, fitToMachine } from "./_machine.js";

// Radial chip thinning stops here: past 2.5× the edge rubs before the math catches up.
const THIN_CAP = 2.5;

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
    { id: "chip", positive: true, advanced: true, label: "Chip load per tooth", kind: "length", default: "", places: 5,
      auto: (raw, c, values) => {
        const dIn = Number.isFinite(values.diameter) ? toIn(values.diameter, c.units) : 0.375;
        return fromIn(defaults(raw).chipIn * chipLoadScale(dIn), c.units);
      } },
    { id: "woc", positive: true, advanced: true, label: "Width of cut (radial)", kind: "length", default: "", optional: true, placeholder: "optional — enables chip thinning" },
    { id: "doc", min: 0, advanced: true, label: "Depth of cut (axial)", kind: "length", default: "", optional: true, placeholder: "optional — enables removal rate" },
  ],
  compute(v, c) {
    const inch = c.units === "in";
    const lp = inch ? 4 : 3;       // lengths
    const cp = inch ? 5 : 4;       // chip loads: a 1/32 in end mill takes 0.0003 in
    const len = (x) => `${fmt(x, lp)} ${c.L.length}`;
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const chipIn = toIn(v.chip, c.units);
    const wocIn = Number.isFinite(v.woc) ? toIn(v.woc, c.units) : NaN;
    const docIn = Number.isFinite(v.doc) ? toIn(v.doc, c.units) : NaN;
    if (wocIn > dIn * 1.0001) throw new Error("Width of cut can't be more than the tool diameter");

    const m = machineFor(c, "mill");
    const requestedRpm = rpmFromSfm(sfm, dIn);
    const thinRaw = radialChipThinningRaw(dIn, wocIn);
    const thin = Math.min(thinRaw, THIN_CAP);
    const programmedChip = chipIn * thin;
    // Fit inside the machine: RPM cap first, then slow the spindle for a feed cap so the chip load holds.
    const fit = fitToMachine(m, requestedRpm, v.flutes * programmedChip, c);
    const { rpm, feedIpm } = fit;
    const slowed = fit.rpmCapped || fit.feedCapped;
    const chipCut = rpm > 0 ? feedIpm / (rpm * v.flutes) : programmedChip;   // the chip the S and F on screen actually make
    const actualSfm = sfmFromRpm(rpm, dIn);
    const mrr = wocIn > 0 && docIn > 0 ? wocIn * docIn * feedIpm : null;

    const warnings = [...fit.warnings, ...millAdvice({ dIn, wocIn, docIn, requestedRpm, machine: m, c })];
    const caution = toolCaution(v.material, v.toolType);
    if (caution) warnings.push(caution);
    // The math will happily feed 5× faster if you type 5× the chip load — the tool won't.
    const libChip = defaults(v).chipIn * chipLoadScale(dIn);
    if (!v.chipAuto && chipIn > Math.max(libChip * 3, dIn * 0.02)) warnings.push(`${fmt(fromIn(chipIn, c.units), cp)} ${c.L.length} per tooth is a very heavy chip for a ${fmt(v.diameter, inch ? 3 : 1)} ${c.L.length} tool (the library says about ${fmt(fromIn(libChip, c.units), cp)} ${c.L.length}). Expect a broken tool.`);
    if (!v.chipAuto && chipIn > 0 && chipIn < libChip * 0.25) warnings.push(`${fmt(fromIn(chipIn, c.units), cp)} ${c.L.length} per tooth is very light — the tool will rub and dull instead of cutting. Typical is about ${fmt(fromIn(libChip, c.units), cp)} ${c.L.length}.`);
    if (thinRaw > THIN_CAP) warnings.push(`A ${len(fromIn(wocIn, c.units))} width of cut would need ${fmt(thinRaw, 1)}× thinning; it's held at ${THIN_CAP}×. Lighter than that, the edge rubs before the math catches up.`);

    const stats = [
      { label: fit.feedCapped ? "Spindle (slowed for max feed)" : fit.rpmCapped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: slowed },
      { label: "Chip load programmed", value: fromIn(chipCut, c.units), unit: c.L.length, places: cp },
    ];
    if (slowed) stats.push({ label: "Wanted RPM", value: requestedRpm, unit: "RPM", places: 0 }, { label: "Actual surface speed", value: fromSfm(actualSfm, c.units), unit: c.L.speed, places: 0 });
    if (thin > 1) stats.push({ label: "Chip thinning factor", value: thin, unit: "×", places: 2 });
    if (mrr != null) stats.push({ label: "Metal removal rate", value: inch ? mrr : mrr * 16.387064, unit: c.L.volume, places: 2 });
    stats.push({ label: "Feed per revolution", value: fromIn(v.flutes * chipCut, c.units), unit: c.L.feedRev, places: cp });

    const rpmNote = slowed ? ` → ${fmt(rpm, 0)} on ${m.name}` : "";
    return {
      primary: { label: "Feed rate", value: fromIn(feedIpm, c.units), unit: c.L.feed, places: 1, clamped: fit.feedCapped },
      stats,
      warnings,
      source: "feeds",
      explain: [
        inch
          ? { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} SFM × 12) ÷ (π × ${len(dIn)}) = ${fmt(requestedRpm, 0)} RPM${rpmNote}` }
          : { title: "Spindle speed", formula: "RPM = (m/min × 1000) ÷ (π × D)", plugged: `= (${fmt(v.sfm, 1)} m/min × 1000) ÷ (π × ${len(v.diameter)}) = ${fmt(requestedRpm, 0)} RPM${rpmNote}` },
        ...(thin > 1 ? [{ title: "Radial chip thinning", formula: "factor = D ÷ (2 √(ae (D − ae)))", plugged: `= ${len(fromIn(dIn, c.units))} ÷ (2 √(${len(fromIn(wocIn, c.units))} × ${len(fromIn(dIn - wocIn, c.units))})) = ${fmt(thinRaw, 3)}${thinRaw > THIN_CAP ? `, held at ${THIN_CAP}` : ""}` }] : []),
        { title: "Feed rate", formula: `${c.L.feed} = RPM × flutes × chip load`, plugged: `= ${fmt(rpm, 0)} RPM × ${v.flutes} × ${fmt(fromIn(chipCut, c.units), cp)} ${c.L.length} = ${fmt(fromIn(feedIpm, c.units), 1)} ${c.L.feed}` },
      ],
      notes: v.sfmAuto || v.chipAuto ? ["Table values are conservative starting points for this material and tool type."] : [],
      historyLabel: `${fmt(v.diameter, c.units === "in" ? 4 : 2)} ${c.L.length} · ${v.flutes}FL · ${materialSpeeds(v.material).material.name}`,
    };
  },
});
