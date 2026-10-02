// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe speeds & feeds. Pro. SFM ⇄ RPM by material, IPR ⇄ IPM, CSS clamp.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { materialOptions, materialSpeeds, toolCaution } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm, lenPlaces } from "./_util.js";
import { machineFor, fitToMachine, maxRpmOf, maxRpmAtFeed, spindleSanity } from "./_machine.js";
import { latheFeedIpr } from "./_advice.js";

// Beyond this most lathes can't turn (same line spindleSanity draws for "lathe").
const LATHE_SANE_RPM = 6000;

export default register({
  id: "lathe-feeds",
  title: "Speeds & feeds — lathe",
  short: "RPM, feed per rev, and G96 surface speed",
  help: "RPM and feed for turning. Pick the diameter you're cutting and the material. Also gives the G96 surface speed and a max RPM to set.",
  category: "lathe",
  keywords: ["lathe", "turning", "rpm", "ipr", "sfm", "css", "g96", "g97", "feed per rev", "boring"],
  pro: true,
  safety: "Starting point. Verify with your tooling maker and dry run.",
  inputs: [
    { id: "diameter", label: "Work diameter (at the cut)", kind: "length", default: "2", defaultMm: "50", min: 0.0001 },
    { id: "material", label: "Material", kind: "select", default: "s1018", options: materialOptions() },
    { id: "toolType", label: "Insert", kind: "segment", default: "coated", options: [{ value: "hss", label: "HSS" }, { value: "carbide", label: "Carbide" }, { value: "coated", label: "Coated" }] },
    { id: "cut", label: "Cut", kind: "segment", default: "rough", options: [{ value: "rough", label: "Rough" }, { value: "finish", label: "Finish" }] },
    { id: "sfm", advanced: true, label: "Surface speed", kind: "speed", default: "", places: 0, auto: (raw, c) => fromSfm(materialSpeeds(raw.material, raw.toolType).turnSfm, c.units), hint: "Blank = library turning speed." },
    { id: "ipr", advanced: true, label: "Feed per revolution", kind: "feedRev", default: "", places: 4, auto: (raw, c) => fromIn(latheFeedIpr(raw.material, raw.cut), c.units),
      hint: "Blank = library rough or finish feed (lighter for hardened stock, 45 HRC and up)." },
    { id: "length", positive: true, advanced: true, label: "Length of cut", kind: "length", default: "", optional: true, placeholder: "optional — gives time per pass" },
    // 0 is a face to center (X0): G96 then has no top of its own, so G50 comes from the machine or the chuck.
    { id: "minDia", min: 0, advanced: true, label: "Smallest diameter this cut reaches", kind: "length", default: "", optional: true, placeholder: "optional — sets the G50", hint: "Facing toward center? Enter how far in you go (0 = to center). Blank = the work diameter." },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const inch = c.units === "in";
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const requestedRpm = rpmFromSfm(sfm, dIn);
    const m = machineFor(c, "lathe");
    const fit = fitToMachine(m, requestedRpm, iprIn, c);
    if (fit.cantRun) throw new Error(fit.problem);
    const { rpm, feedIpm: ipm } = fit;
    const slowed = fit.rpmCapped || fit.feedCapped;
    const time = Number.isFinite(v.length) ? toIn(v.length, c.units) / ipm : null;
    // G50 is a job cap: the speed G96 needs at the smallest diameter this cut reaches, never above the
    // machine's top speed. It is not the machine's top speed itself — that would make the clamp do nothing.
    const smallIn = Number.isFinite(v.minDia) ? Math.min(dIn, toIn(v.minDia, c.units)) : dIn;
    const jobCap = smallIn > 0 ? Math.ceil(rpmFromSfm(sfm, smallIn) / 100) * 100 : Infinity; // to center G96 never tops out
    const g50 = Math.min(jobCap, maxRpmAtFeed(m, iprIn));
    // With no top speed to go on (no machine, or a profile with Max spindle blank), a cap beyond any lathe
    // isn't advice; the chuck's rating is the number to use.
    const g50Wild = !Number.isFinite(maxRpmOf(m)) && g50 > LATHE_SANE_RPM;
    const caution = toolCaution(v.material, v.toolType, c.units);
    const sanity = spindleSanity(rpm, m, "lathe", c);
    const wildWhy = smallIn > 0
      ? `G96 would ask for ${fmt(jobCap, 0)} RPM at Ø${fmt(fromIn(smallIn, c.units), p)} ${c.L.length}.`
      : "Facing to center, G96 keeps speeding up all the way to X0.";
    return {
      // Feed cap first: with both caps hit the spindle runs under the machine max, slowed for the feed.
      primary: { label: fit.feedCapped ? "Spindle (slowed for max feed)" : fit.rpmCapped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped: slowed },
      stats: [
        { label: "Feed", value: fromIn(ipm, c.units), unit: c.L.feed, places: 1, clamped: fit.feedCapped },
        { label: "G96 S (constant surface speed)", value: v.sfm, unit: c.L.speed, places: 0 },
        g50Wild
          ? { label: "G50 / max RPM to set", text: "your chuck's rated max" }
          : { label: "G50 / max RPM to set", value: g50, unit: "RPM", places: 0, clamped: g50 < jobCap },
        ...(slowed ? [{ label: "Actual surface speed", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0, clamped: true }] : []),
        ...(time != null ? [{ label: "Time per pass", value: time * 60, unit: "sec", places: 1 }] : []),
      ],
      warnings: [
        ...fit.warnings,
        ...sanity,
        ...(g50Wild && !sanity.length ? [`${wildWhy} Set G50 to your chuck's rated max (or lower)${smallIn > 0 ? ", not that" : ""}.`] : []),
        ...(caution ? [caution] : []),
      ],
      source: "feeds",
      explain: inch
        ? [
          { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} SFM × 12) ÷ (π × ${fmt(dIn, 4)} in) = ${fmt(requestedRpm, 0)} RPM` },
          { title: "Feed", formula: "IPM = RPM × IPR", plugged: `= ${fmt(rpm, 0)} RPM × ${fmt(iprIn, 4)} IPR = ${fmt(ipm, 1)} IPM` },
        ]
        : [
          { title: "Spindle speed", formula: "RPM = (m/min × 1000) ÷ (π × D)", plugged: `= (${fmt(v.sfm, 1)} m/min × 1000) ÷ (π × ${fmt(v.diameter, p)} mm) = ${fmt(requestedRpm, 0)} RPM` },
          { title: "Feed", formula: "mm/min = RPM × mm/rev", plugged: `= ${fmt(rpm, 0)} RPM × ${fmt(v.ipr, 3)} mm/rev = ${fmt(fromIn(ipm, c.units), 1)} mm/min` },
        ],
      notes: ["Under G96 the control changes RPM as the diameter changes. Set a G50 (Fanuc) or G96 S… with a max RPM so a facing cut doesn't run away toward center."],
      historyLabel: `Ø${fmt(v.diameter, p)} ${c.L.length} · ${materialSpeeds(v.material).material.name} · ${v.cut}`,
    };
  },
});
