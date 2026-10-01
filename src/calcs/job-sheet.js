// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Job sheet. Free. Plug in what you know — tool, material, machine, cut — and it figures everything
// it can, then tells you what one more number would unlock. Price per part is the Pro line.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm, radialChipThinningFactor } from "../core/feeds.js";
import { cutTime, metalRemovalRate } from "../core/milling.js";
import { turningTime } from "../core/lathe.js";
import { materialOptions, materialSpeeds } from "../data/materials-library.js";
import { TOOL_LABELS } from "../data/materials.js";
import { drillFeedPerRev } from "./feeds-drill.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm, lenPlaces } from "./_util.js";

const isMill = (r) => r.op === "mill";
const isDrill = (r) => r.op === "drill";
const isLathe = (r) => r.op === "lathe";

export default register({
  id: "job-sheet",
  title: "Job sheet",
  short: "Plug in what you know; get everything it can figure",
  help: "Start with the tool, the material, and what you're doing. The sheet gives speed and feed right away, then each number you add — depth of cut, length, quantity, shop rate — unlocks the next answer: removal rate, cut time, job time, price. Your Shop machine profile caps the RPM automatically.",
  category: "shop",
  keywords: ["job", "job sheet", "setup", "project", "plan", "whole job", "everything", "cycle time", "quote", "how long", "price", "start here"],
  pro: false,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "op", label: "What are you doing?", kind: "segment", default: "mill", options: [{ value: "mill", label: "End mill" }, { value: "drill", label: "Drill" }, { value: "lathe", label: "Lathe" }] },
    { id: "material", label: "Material", kind: "select", default: "al6061", options: materialOptions() },
    { id: "toolType", label: "Tool", kind: "segment", default: "carbide", options: Object.entries(TOOL_LABELS).map(([value, label]) => ({ value, label })) },
    { id: "diameter", label: "Diameter (tool — or the part, on a lathe)", kind: "length", default: "0.5", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "4", min: 1, max: 20, showIf: isMill },
    { id: "woc", label: "Width of cut (sideways)", kind: "length", default: "", optional: true, placeholder: "add for chip thinning & removal rate", showIf: isMill },
    { id: "doc", label: "Depth of cut per pass", kind: "length", default: "", optional: true, placeholder: "add for removal rate & passes", showIf: (r) => !isDrill(r) },
    { id: "length", label: "Length of cut per pass", kind: "length", default: "", optional: true, placeholder: "add for cut time", showIf: (r) => !isDrill(r) },
    { id: "depth", label: "Hole depth", kind: "length", default: "", optional: true, placeholder: "add for time per hole", showIf: isDrill },
    { id: "holes", label: "Holes per part", kind: "int", default: "", optional: true, placeholder: "add for drilling time per part", min: 1, showIf: isDrill },
    { id: "stock", label: "Total depth to remove", kind: "length", default: "", optional: true, placeholder: "add for number of passes", showIf: (r) => !isDrill(r) },
    { id: "qty", label: "Parts to make", kind: "int", default: "", optional: true, placeholder: "add for job time", min: 1 },
    { id: "rate", label: "Shop rate", kind: "number", default: "", unit: "$/hr", optional: true, placeholder: "add for price (Pro)", min: 0 },
    { id: "setup", label: "Setup time", kind: "number", default: "", unit: "min", optional: true, placeholder: "optional, spread over the parts", min: 0 },
    { id: "sfm", label: "Surface speed override", kind: "speed", default: "", optional: true, placeholder: "blank = library value", advanced: true },
    { id: "chip", label: "Chip load / feed-per-rev override", kind: "length", default: "", optional: true, placeholder: "blank = library value", advanced: true },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const dIn = toIn(v.diameter, c.units);
    const sp = materialSpeeds(v.material, v.toolType);
    const lathe = v.op === "lathe", drill = v.op === "drill", mill = v.op === "mill";
    const baseSfm = Number.isFinite(v.sfm) ? toSfm(v.sfm, c.units) : (drill ? sp.drillSfm : lathe ? sp.sfm * 1.2 : sp.sfm);
    const requestedRpm = rpmFromSfm(baseSfm, dIn);
    const maxRpm = c.machine?.maxRpm > 0 ? c.machine.maxRpm : Infinity;
    const rpm = Math.min(requestedRpm, maxRpm);
    const clamped = rpm < requestedRpm;

    // feed per rev (drill/lathe) or chip load per tooth (mill), in inches
    let perRevIn, feedIpm, thin = 1, chipIn = NaN;
    if (mill) {
      const scale = Math.max(0.25, Math.min(1.5, dIn / 0.375));
      chipIn = Number.isFinite(v.chip) ? toIn(v.chip, c.units) : sp.chipIn * scale;
      const wocIn = Number.isFinite(v.woc) ? toIn(v.woc, c.units) : NaN;
      thin = radialChipThinningFactor(dIn, wocIn);
      feedIpm = rpm * v.flutes * chipIn * thin;
      perRevIn = feedIpm / rpm;
    } else if (drill) {
      perRevIn = Number.isFinite(v.chip) ? toIn(v.chip, c.units) : drillFeedPerRev(dIn);
      feedIpm = rpm * perRevIn;
    } else {
      perRevIn = Number.isFinite(v.chip) ? toIn(v.chip, c.units) : 0.010;
      feedIpm = rpm * perRevIn;
    }
    const maxFeedIpm = c.machine?.maxFeed > 0 ? toIn(c.machine.maxFeed, c.machine.units || "in") : Infinity;
    const feedOut = Math.min(feedIpm, maxFeedIpm);

    const stats = [
      { label: clamped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped },
      { label: mill ? "Chip load per tooth" : "Feed per rev", value: fromIn(mill ? chipIn * thin : perRevIn, c.units), unit: mill ? c.L.length : c.L.feedRev, places: 4 },
      { label: "Surface speed used", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0 },
      { label: "Machine", text: c.machine ? `${c.machine.name} · max ${fmt(maxRpm, 0)} RPM` : "none set (Shop → Machines)" },
    ];
    if (mill && thin > 1) stats.push({ label: "Chip thinning", value: thin, unit: "×", places: 2 });
    const next = [];
    const warnings = [];
    if (mill && Number.isFinite(v.chip) && chipIn > Math.max(sp.chipIn * Math.max(0.25, Math.min(1.5, dIn / 0.375)) * 3, dIn * 0.02)) warnings.push(`${fmt(fromIn(chipIn, c.units), 4)} ${c.L.length} per tooth is a very heavy chip for this tool. Expect it to break.`);
    if (clamped) warnings.push(`${c.machine.name} tops out at ${fmt(maxRpm, 0)} RPM. Wanted ${fmt(requestedRpm, 0)}. Feed is figured at ${fmt(rpm, 0)} RPM.`);
    if (!c.machine) next.push({ add: "A machine profile", get: "RPM and feed capped to your machine", href: "#/shop" });

    // ── what the cut adds ──
    const wocIn = Number.isFinite(v.woc) ? toIn(v.woc, c.units) : NaN, docIn = Number.isFinite(v.doc) ? toIn(v.doc, c.units) : NaN;
    let perPassMin = null, passes = 1, timePerPart = null;
    if (mill) {
      if (wocIn > 0 && docIn > 0) { const mrr = metalRemovalRate({ widthOfCut: wocIn, depthOfCut: docIn, feed: feedOut }); stats.push({ label: "Metal removal rate", value: c.units === "in" ? mrr : mrr * 16.387064, unit: c.L.volume, places: 2 }); }
      else next.push({ add: !(wocIn > 0) ? "Width of cut" : "Depth of cut", get: "removal rate", input: !(wocIn > 0) ? "woc" : "doc" });
    }
    if (!drill) {
      const lenIn = Number.isFinite(v.length) ? toIn(v.length, c.units) : NaN;
      if (lenIn > 0) { perPassMin = lathe ? turningTime({ length: lenIn, ipr: perRevIn, rpm }) : cutTime({ length: lenIn, feed: feedOut }); stats.push({ label: "Time per pass", value: perPassMin * 60, unit: "sec", places: 1 }); }
      else next.push({ add: "Length of cut", get: "time per pass", input: "length" });
      const stockIn = Number.isFinite(v.stock) ? toIn(v.stock, c.units) : NaN;
      if (stockIn > 0 && docIn > 0) { passes = Math.ceil(stockIn / docIn - 1e-9); stats.push({ label: "Passes", value: passes, unit: "", places: 0 }); }
      else if (perPassMin != null) next.push({ add: !(docIn > 0) ? "Depth of cut per pass" : "Total depth to remove", get: "number of passes", input: !(docIn > 0) ? "doc" : "stock" });
      if (perPassMin != null) { timePerPart = perPassMin * passes; stats.push({ label: passes > 1 ? `Cut time per part (${passes} passes)` : "Cut time per part", value: timePerPart, unit: "min", places: 2 }); }
    } else {
      const depthIn = Number.isFinite(v.depth) ? toIn(v.depth, c.units) : NaN;
      if (depthIn > 0) { const perHole = (depthIn + 0.3 * dIn) / feedOut; stats.push({ label: "Time per hole", value: perHole * 60, unit: "sec", places: 1 });
        if (v.holes > 0) { timePerPart = perHole * v.holes; stats.push({ label: `Drilling time per part (${v.holes} holes)`, value: timePerPart, unit: "min", places: 2 }); }
        else next.push({ add: "Holes per part", get: "drilling time per part", input: "holes" });
      } else next.push({ add: "Hole depth", get: "time per hole", input: "depth" });
    }

    // ── job and price ──
    let jobMin = null;
    if (timePerPart != null) {
      if (v.qty > 0) { jobMin = timePerPart * v.qty + (Number.isFinite(v.setup) ? v.setup : 0); stats.push({ label: `Job time (${v.qty} parts${Number.isFinite(v.setup) ? " + setup" : ""})`, value: jobMin, unit: "min", places: 1 }); }
      else next.push({ add: "Parts to make", get: "total job time", input: "qty" });
    }
    const tables = [];
    if (jobMin != null) {
      if (v.rate > 0) {
        const cost = (jobMin / 60) * v.rate;
        tables.push({ title: "Price (machine time only — add material and markup in Quote helper)", pro: true, columns: [{ key: "k", label: "" }, { key: "v", label: "", align: "right" }],
          rows: [{ k: "Machine time", v: `${fmt(jobMin / 60, 2)} hr` }, { k: `At $${fmt(v.rate, 0)}/hr`, v: `$${fmt(cost, 2)}` }, { k: "Per part", v: `$${fmt(cost / v.qty, 2)}` }] });
      } else next.push({ add: "Shop rate", get: "price per part (Pro)", input: "rate" });
    }

    return {
      primary: { label: `Feed · ${sp.material.name}`, value: fromIn(feedOut, c.units), unit: c.L.feed, places: 1, clamped: feedOut < feedIpm },
      stats, warnings, next, tables,
      source: "feeds",
      explain: [
        { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(baseSfm, 0)} × 12) ÷ (π × ${fmt(dIn, 4)}) = ${fmt(requestedRpm, 0)}${clamped ? ` → machine max ${fmt(rpm, 0)}` : ""}` },
        mill ? { title: "Feed", formula: "IPM = RPM × flutes × chip load × thinning", plugged: `= ${fmt(rpm, 0)} × ${v.flutes} × ${fmt(chipIn, 4)} × ${fmt(thin, 2)} = ${fmt(feedIpm, 1)}` }
             : { title: "Feed", formula: "IPM = RPM × feed per rev", plugged: `= ${fmt(rpm, 0)} × ${fmt(perRevIn, 4)} = ${fmt(feedIpm, 1)}` },
        ...(timePerPart != null ? [{ title: "Time", formula: drill ? "t = holes × (depth + 0.3 D) ÷ IPM" : "t = passes × length ÷ feed", plugged: `= ${fmt(timePerPart, 2)} min per part` }] : []),
      ],
      notes: ["Each line you fill in unlocks the next answer. Save the whole sheet with ⋯ → Save job once it's set."],
      historyLabel: `${v.op} · Ø${fmt(v.diameter, p)} · ${sp.material.name.split(" ")[0]}`,
    };
  },
});
