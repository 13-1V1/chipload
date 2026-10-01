// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Lathe speeds & feeds. Pro. SFM ⇄ RPM by material, IPR ⇄ IPM, CSS clamp.

import { register } from "../app/registry.js";
import { rpmFromSfm, sfmFromRpm } from "../core/feeds.js";
import { materialOptions, materialSpeeds } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, toSfm, fromSfm, lenPlaces } from "./_util.js";

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
    { id: "sfm", advanced: true, label: "Surface speed", kind: "speed", default: "", places: 0, auto: (raw, c) => fromSfm(materialSpeeds(raw.material, raw.toolType).sfm * 1.2, c.units), hint: "Blank = library value × 1.2 (turning runs a bit faster)." },
    { id: "ipr", advanced: true, label: "Feed per revolution", kind: "feedRev", default: "", places: 4, auto: (raw, c) => fromIn(raw.cut === "finish" ? 0.004 : 0.012, c.units), hint: "Blank = 0.012 rough / 0.004 finish." },
    { id: "length", positive: true, advanced: true, label: "Length of cut", kind: "length", default: "", optional: true, placeholder: "optional — gives time per pass" },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const dIn = toIn(v.diameter, c.units);
    const sfm = toSfm(v.sfm, c.units);
    const iprIn = toIn(v.ipr, c.units);
    const requestedRpm = rpmFromSfm(sfm, dIn);
    const maxRpm = c.machine?.maxRpm > 0 ? c.machine.maxRpm : Infinity;
    const rpm = Math.min(requestedRpm, maxRpm);
    const clamped = rpm < requestedRpm;
    const ipm = rpm * iprIn;
    const time = Number.isFinite(v.length) ? toIn(v.length, c.units) / ipm : null;
    return {
      primary: { label: clamped ? "Spindle (machine max)" : "Spindle", value: rpm, unit: "RPM", places: 0, clamped },
      stats: [
        { label: "Feed", value: fromIn(ipm, c.units), unit: c.L.feed, places: 1 },
        { label: "G96 S (constant surface speed)", value: v.sfm, unit: c.L.speed, places: 0 },
        { label: "G50 / max RPM to set", value: Number.isFinite(maxRpm) ? maxRpm : Math.ceil(requestedRpm / 100) * 100, unit: "RPM", places: 0 },
        ...(clamped ? [{ label: "Actual surface speed", value: fromSfm(sfmFromRpm(rpm, dIn), c.units), unit: c.L.speed, places: 0 }] : []),
        ...(time != null ? [{ label: "Time per pass", value: time * 60, unit: "sec", places: 1 }] : []),
      ],
      warnings: clamped ? [`${c.machine.name} tops out at ${fmt(maxRpm, 0)} RPM. Wanted ${fmt(requestedRpm, 0)} at Ø${fmt(v.diameter, p)}. Surface speed will be low — feed per rev still holds.`] : [],
      source: "feeds",
      explain: [
        { title: "Spindle speed", formula: "RPM = (SFM × 12) ÷ (π × D)", plugged: `= (${fmt(sfm, 0)} × 12) ÷ (π × ${fmt(dIn, 4)}) = ${fmt(requestedRpm, 0)}` },
        { title: "Feed", formula: "IPM = RPM × IPR", plugged: `= ${fmt(rpm, 0)} × ${fmt(iprIn, 4)} = ${fmt(ipm, 1)}` },
      ],
      notes: ["Under G96 the control changes RPM as the diameter changes. Set a G50 (Fanuc) or G96 S… with a max RPM so a facing cut doesn't run away toward center."],
      historyLabel: `Ø${fmt(v.diameter, p)} · ${materialSpeeds(v.material).material.name} · ${v.cut}`,
    };
  },
});
