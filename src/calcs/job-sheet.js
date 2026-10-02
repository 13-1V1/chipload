// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Job sheet. Free. Plug in what you know — tool, material, machine, cut — and it figures everything
// it can, then tells you what one more number would unlock. Price per part is the Pro line.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm, radialChipThinningFactor, chipLoadScale } from "../core/feeds.js";
import { cutTime, metalRemovalRate } from "../core/milling.js";
import { materialOptions, materialSpeeds, toolCaution } from "../data/materials-library.js";
import { TOOL_LABELS } from "../data/materials.js";
import { drillFeedPerRev } from "./feeds-drill.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm, lenPlaces } from "./_util.js";
import { drillFeedFactor, millAdvice, drillAdvice } from "./_advice.js";
import { machineFor, fitToMachine, spindleSanity, maxRpmOf, maxFeedIpmOf } from "./_machine.js";
import { money } from "./_money.js";

const isMill = (r) => r.op === "mill";
const isDrill = (r) => r.op === "drill";
const isLathe = (r) => r.op === "lathe";
// Optional fields stay out of the way until they hold a value or the user taps "add …" for them.
const want = (r, id) => String(r[id] ?? "").trim() !== "" || String(r.shown || "").split(",").includes(id);
// The sheet's lathe line is a stock-removal plan, so it takes the roughing feed Speeds & feeds — lathe uses
// (0.012 in/rev; Machinery's Handbook bases its turning speed tables on 0.012 in/rev at 0.125 in depth).
export const LATHE_ROUGH_IPR = 0.012;

/** Library feed in inches: chip load per tooth before thinning (mill), or feed per rev (drill, lathe). */
function libraryFeedIn(r, dIn) {
  const sp = materialSpeeds(r.material, r.toolType);
  if (isMill(r)) return sp.chipIn * chipLoadScale(dIn);
  if (isDrill(r)) return drillFeedPerRev(dIn) * drillFeedFactor(sp.material.rating);
  return LATHE_ROUGH_IPR;
}

/** The Machine stat: the profile in play and its limits in words, or why none applies. */
function machineText(m, mill, c) {
  if (m) {
    const rpm = maxRpmOf(m), feed = maxFeedIpmOf(m);
    return [m.name, Number.isFinite(rpm) ? `max ${fmt(rpm, 0)} RPM` : "no RPM limit",
      Number.isFinite(feed) ? `max ${fmt(fromIn(feed, c.units), 1)} ${c.L.feed}` : "no feed limit"].join(" · ");
  }
  if (c.machine) return `${c.machine.name} is a ${c.machine.type === "lathe" ? "lathe" : "mill"}, not used for ${mill ? "end milling" : "turning"}`;
  return c.settings?.pro ? "none set (Shop → Machines)" : "none set (Shop, Pro)";
}

export default register({
  id: "job-sheet",
  title: "Job sheet",
  short: "Plug in what you know; get everything it can figure",
  help: "Start with the tool, the material, and what you're doing. The sheet gives speed and feed right away, then each number you add — depth of cut, length, quantity, shop rate — unlocks the next answer: removal rate, cut time, job time, price. With Pro, your Shop machine profile caps the RPM and feed automatically.",
  category: "shop",
  keywords: ["job", "job sheet", "setup", "project", "plan", "whole job", "everything", "cycle time", "quote", "how long", "price", "start here"],
  pro: false,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "op", label: "What are you doing?", kind: "segment", default: "mill", options: [{ value: "mill", label: "End mill" }, { value: "drill", label: "Drill" }, { value: "lathe", label: "Lathe" }] },
    { id: "material", label: "Material", kind: "select", default: "al6061", options: materialOptions() },
    { id: "toolType", label: "Tool", kind: "segment", default: "carbide", options: Object.entries(TOOL_LABELS).map(([value, label]) => ({ value, label })) },
    { id: "diameter", label: "Diameter (tool — or the part, on a lathe)", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "4", min: 1, max: 20, showIf: isMill },
    { id: "woc", positive: true, label: "Width of cut (sideways)", kind: "length", default: "", optional: true, placeholder: "add for chip thinning & removal rate", showIf: (r) => isMill(r) && want(r, "woc") },
    { id: "doc", positive: true, label: "Depth of cut per pass", kind: "length", default: "", optional: true, placeholder: "add for removal rate & passes", showIf: (r) => !isDrill(r) && want(r, "doc") },
    { id: "length", positive: true, label: "Length of cut per pass", kind: "length", default: "", optional: true, placeholder: "add for cut time", showIf: (r) => !isDrill(r) && want(r, "length") },
    { id: "depth", positive: true, label: "Hole depth", kind: "length", default: "", optional: true, placeholder: "add for time per hole", showIf: (r) => isDrill(r) && want(r, "depth") },
    { id: "holes", label: "Holes per part", kind: "int", default: "", optional: true, placeholder: "add for drilling time per part", min: 1, showIf: (r) => isDrill(r) && want(r, "holes") },
    { id: "stock", positive: true, label: "Total depth to remove", kind: "length", default: "", optional: true, placeholder: "add for number of passes", showIf: (r) => !isDrill(r) && want(r, "stock") },
    { id: "qty", label: "Parts to make", kind: "int", default: "", optional: true, placeholder: "add for job time", min: 1, showIf: (r) => want(r, "qty") },
    { id: "rate", label: "Shop rate", kind: "number", default: "", unit: "$/hr", optional: true, placeholder: "add for price (Pro)", min: 0, showIf: (r) => want(r, "rate") },
    { id: "setup", label: "Setup time", kind: "number", default: "", unit: "min", optional: true, placeholder: "optional, spread over the parts", min: 0, showIf: (r) => want(r, "setup") || want(r, "rate") },
    { id: "shown", label: "", kind: "text", default: "", showIf: () => false },
    { id: "sfm", label: "Surface speed override", kind: "speed", default: "", optional: true, placeholder: "blank = library value", advanced: true },
    // A chip load per tooth on the mill, a feed per rev on the drill and lathe: the label and unit follow the job.
    { id: "chip", positive: true, label: (r) => (isMill(r) ? "Chip load per tooth" : "Feed per rev"), as: (r) => (isMill(r) ? "length" : "feedRev"), kind: "length", default: "", places: 4, advanced: true,
      auto: (raw, c, values) => fromIn(libraryFeedIn(raw, Number.isFinite(values.diameter) ? toIn(values.diameter, c.units) : 0.5), c.units),
      hint: "Leave blank for the library value (on a lathe, the roughing feed)." },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const dIn = toIn(v.diameter, c.units);
    const wocIn = Number.isFinite(v.woc) ? toIn(v.woc, c.units) : NaN, docIn = Number.isFinite(v.doc) ? toIn(v.doc, c.units) : NaN;
    const sp = materialSpeeds(v.material, v.toolType);
    const lathe = v.op === "lathe", drill = v.op === "drill", mill = v.op === "mill";
    const baseSfm = Number.isFinite(v.sfm) ? toSfm(v.sfm, c.units) : (drill ? sp.drillSfm : lathe ? sp.sfm * 1.2 : sp.sfm);
    const requestedRpm = rpmFromSfm(baseSfm, dIn);
    if (mill && wocIn > dIn * 1.0001) throw new Error("Width of cut can't be more than the tool diameter");

    // Feed per rev in inches: flutes × chip load × thinning on the mill, the drill or turning feed otherwise.
    // v.chip is the typed override or the library value (its "auto").
    let thin = 1, chipIn = NaN, iprIn;
    if (mill) {
      chipIn = toIn(v.chip, c.units);
      thin = radialChipThinningFactor(dIn, wocIn);
      iprIn = v.flutes * chipIn * thin;
    } else iprIn = toIn(v.chip, c.units);

    // The machine for this work (a mill for end milling, a lathe for turning, either for drilling), and the
    // cut fitted inside it. Every number below describes the cut as fitted.
    const work = mill ? "mill" : lathe ? "lathe" : "any";
    const m = machineFor(c, work);
    const fit = fitToMachine(m, requestedRpm, iprIn, c);
    const rpm = fit.rpm, feedOut = fit.feedIpm;
    const spindleCapped = fit.rpmCapped || fit.feedCapped;
    const fp = c.units === "in" ? 4 : 3;

    const stats = [
      { label: fit.feedCapped ? "Spindle (slowed for max feed)" : fit.rpmCapped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: spindleCapped },
      mill ? { label: "Chip load programmed", value: fromIn(chipIn * thin, c.units), unit: c.L.length, places: fp }
        : { label: "Feed per rev", value: fromIn(iprIn, c.units), unit: c.L.feedRev, places: fp },
      { label: "Surface speed used", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0 },
      { label: "Machine", text: machineText(m, mill, c) },
    ];
    if (spindleCapped) stats.push({ label: "Wanted RPM", value: requestedRpm, unit: "RPM", places: 0 });
    if (mill && thin > 1) stats.push({ label: "Chip thinning factor", value: thin, unit: "×", places: 2 });
    const next = [];
    // The too-fast-spindle check is spindleSanity's, the same for every op (millAdvice gets no RPM for it).
    const warnings = [...spindleSanity(requestedRpm, m, work, c), ...fit.warnings];
    if (mill) warnings.push(...millAdvice({ dIn, wocIn, docIn, requestedRpm: NaN, machine: m }));
    if (drill) warnings.push(...drillAdvice({ dIn, depthIn: Number.isFinite(v.depth) ? toIn(v.depth, c.units) : NaN }));
    if (mill && !v.chipAuto && chipIn > Math.max(sp.chipIn * chipLoadScale(dIn) * 3, dIn * 0.02)) warnings.push(`${fmt(fromIn(chipIn, c.units), fp)} ${c.L.length} per tooth is a very heavy chip for this tool. Expect it to break.`);
    const caution = toolCaution(v.material, v.toolType);
    if (caution) warnings.push(caution);

    // ── what the cut adds ──
    let perPassMin = null, passes = 1, timePerPart = null;
    if (mill) {
      if (wocIn > 0 && docIn > 0) { const mrr = metalRemovalRate({ widthOfCut: wocIn, depthOfCut: docIn, feed: feedOut }); stats.push({ label: "Metal removal rate", value: c.units === "in" ? mrr : mrr * 16.387064, unit: c.L.volume, places: 2 }); }
      else next.push({ add: !(wocIn > 0) ? "Width of cut" : "Depth of cut", get: "removal rate", input: !(wocIn > 0) ? "woc" : "doc" });
    }
    if (!drill) {
      const lenIn = Number.isFinite(v.length) ? toIn(v.length, c.units) : NaN;
      // t = L ÷ F at the feed the machine will actually run (turning too: T = L ÷ (f × N), Machinery's Handbook)
      if (lenIn > 0) { perPassMin = cutTime({ length: lenIn, feed: feedOut }); stats.push({ label: "Time per pass", value: perPassMin * 60, unit: "sec", places: 1 }); }
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
          rows: [{ k: "Machine time", v: `${fmt(jobMin / 60, 2)} hr` }, { k: `At ${money(v.rate)}/hr`, v: money(cost) }, { k: "Per part", v: money(cost / v.qty) }] });
      } else next.push({ add: "Shop rate", get: "price per part (Pro)", input: "rate" });
    }

    // Shop is Pro: say so before the tap lands on a lock screen.
    if (!m) next.push({ add: lathe ? "Your lathe (Shop)" : "Your machine (Shop)", get: c.settings?.pro ? "RPM and feed capped to its limits" : "RPM and feed capped to its limits (Pro)", href: "#/shop" });

    // Explain lines in the units on screen: SFM and inches, or m/min and mm.
    const inch = c.units === "in";
    const spindleTail = fit.rpmCapped ? ` → machine max ${fmt(maxRpmOf(m), 0)}` : "";
    const feedTail = fit.feedCapped ? ` → ${fmt(rpm, 0)} so the feed stays under the machine's max` : "";
    return {
      primary: { label: `Feed · ${sp.material.name}`, value: fromIn(feedOut, c.units), unit: c.L.feed, places: 1, clamped: fit.feedCapped },
      stats, warnings, next, tables,
      source: "feeds",
      explain: [
        inch ? { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(baseSfm, 0)} × 12) ÷ (π × ${fmt(dIn, 4)} in) = ${fmt(requestedRpm, 0)}${spindleTail}${feedTail}` }
          : { title: "Spindle speed", formula: "RPM = (m/min × 1000) ÷ (π × D)", plugged: `= (${fmt(fromSfm(baseSfm, "mm"), 1)} × 1000) ÷ (π × ${fmt(dIn * 25.4, 3)} mm) = ${fmt(requestedRpm, 0)}${spindleTail}${feedTail}` },
        mill ? { title: "Feed", formula: `${c.L.feed} = RPM × flutes × chip load × thinning`, plugged: `= ${fmt(rpm, 0)} × ${v.flutes} × ${fmt(fromIn(chipIn, c.units), p)} ${c.L.length} × ${fmt(thin, 2)} = ${fmt(fromIn(feedOut, c.units), 1)} ${c.L.feed}` }
             : { title: "Feed", formula: `${c.L.feed} = RPM × feed per rev`, plugged: `= ${fmt(rpm, 0)} × ${fmt(fromIn(iprIn, c.units), p)} ${c.L.feedRev} = ${fmt(fromIn(feedOut, c.units), 1)} ${c.L.feed}` },
        ...(timePerPart != null ? [{ title: "Time", formula: drill ? `t = holes × (depth + 0.3 D) ÷ ${c.L.feed}` : "t = passes × length ÷ feed", plugged: `= ${fmt(timePerPart, 2)} min per part` }] : []),
      ],
      notes: ["Each line you fill in unlocks the next answer. Save the whole sheet with ⋯ → Save job once it's set."],
      historyLabel: `${v.op} · Ø${fmt(v.diameter, p)} · ${sp.material.name.split(" ")[0]}`,
    };
  },
});
