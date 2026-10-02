// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw blade speed and tooth pitch. Free tier — the hobbyist's first question.

import { register } from "../app/registry.js";
import { bandSawSpeed, bladeForStock, bladeSpeedFromWheel, wheelRpmForSpeed } from "../core/saw.js";
import { materialOptions, materialById } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, fromSfm, lenPlaces } from "./_util.js";

const SHAPES = [{ value: "round", label: "Round bar" }, { value: "flat", label: "Flat / square bar" }, { value: "tube", label: "Tube / structural" }];
const SHAPE_WORD = { round: "round bar (diameter)", flat: "flat or square bar (width)", tube: "tube or structural (wall)" };

export default register({
  id: "saw-speed",
  title: "Band saw speed & blade",
  short: "Blade speed and teeth per inch for what you're cutting",
  help: "How fast to run a band saw blade and which blade (teeth per inch) to use for the stock you're cutting. Also turns your saw's wheel size and motor RPM into blade speed, so you can see which pulley step to use.",
  category: "drill",
  keywords: ["band saw", "bandsaw", "saw", "blade", "tpi", "teeth per inch", "saw speed", "blade speed", "fpm", "hacksaw", "cutoff", "cut off saw", "horizontal saw", "vertical saw", "pulley"],
  pro: false,
  safety: "Starting point. A dull blade or a thin wall wants the low number.",
  inputs: [
    { id: "material", label: "Material", kind: "select", default: "s1018", options: materialOptions() },
    { id: "shape", label: "Stock shape", kind: "segment", default: "round", options: SHAPES },
    { id: "thickness", label: "Stock size (the part the blade goes through)", kind: "length", default: "1", defaultMm: "25", min: 0.001, hint: "Round bar: the diameter. Flat or square bar: the width the blade crosses. Tube, pipe, angle, channel: the wall thickness." },
    { id: "wheel", positive: true, label: "Saw wheel diameter", kind: "length", default: "", optional: true, placeholder: "optional — gives the wheel RPM to aim for", advanced: true },
    { id: "rpm", min: 1, label: "Wheel RPM you have", kind: "int", default: "", unit: "RPM", optional: true, placeholder: "optional — checks your saw's speed (needs the wheel size too)", advanced: true },
  ],
  compute(v, c) {
    const m = materialById(v.material);
    const mm = c.units === "mm";
    const shape = SHAPE_WORD[v.shape] ? v.shape : "round";
    const tIn = toIn(v.thickness, c.units);
    const speed = bandSawSpeed(m, tIn);
    const blade = bladeForStock(tIn, shape);
    const p = lenPlaces(c.units);
    // Blade speed shows in FPM, or m/min in metric (same conversion as SFM ⇄ m/min).
    const spUnit = mm ? "m/min" : "FPM";
    const sp = (fpm) => `${fmt(fromSfm(fpm, c.units), 0)} ${spUnit}`;
    const size = `${fmt(v.thickness, p)} ${c.L.length}`;
    const stats = [
      { label: "Speed range for this material", text: speed.basis === "chart" ? `${sp(speed.min)} dry – ${sp(speed.max)} with coolant` : `${sp(speed.min)} – ${sp(speed.max)}` },
      { label: "Blade to use", text: `${blade.pitch} TPI variable pitch (about ${fmt(blade.teethInCut, 1)} teeth in the cut)` },
      { label: "One-pitch blade instead", text: `${blade.constant} TPI` },
      { label: "Material", text: `${m.name} · ${m.group}` },
    ];
    const warnings = [];
    const explain = [];
    if (speed.basis === "chart") {
      const parts = [`${sp(speed.chartFpm)} chart speed (${mm ? "100 mm" : "4 in"} annealed stock)`];
      if (speed.sizePct) parts.push(`× ${fmt(1 + speed.sizePct / 100, 3)} for ${size} stock`);
      if (speed.hardPct) parts.push(`× ${fmt(1 - speed.hardPct / 100, 3)} for about ${speed.hrc} HRC`);
      explain.push({ title: "Blade speed", formula: "LENOX bi-metal chart speed × size adjustment × hardness adjustment", plugged: `${parts.join(" ")} = ${sp(speed.start)}` });
    } else {
      explain.push({ title: "Blade speed", formula: speed.basis === "wood" ? `Wood: start near ${mm ? "900 m/min" : "3,000 FPM"}` : "No maker chart row for this family: a published range, placed by machinability", plugged: `${sp(speed.min)} – ${sp(speed.max)} → start ${sp(speed.start)}` });
    }
    explain.push({ title: "Tooth pitch", formula: "Blade maker's tooth chart: round bar by diameter, flat bar by width, tube by wall", plugged: `${size} ${SHAPE_WORD[shape]} → ${blade.pitch} TPI` });
    if (speed.bimetalUnsuitable) warnings.push(`${m.name} is about ${speed.hrc} HRC — too hard for a bi-metal blade. Use a carbide-tipped blade or an abrasive cutoff saw. The speed shown is only a ceiling if you try a bi-metal blade anyway.`);
    else if (speed.beyondChart) warnings.push(`${m.name} is about ${speed.hrc} HRC, past the end of the blade maker's hardness table (40 HRC). Stay at or under this speed with a light feed, or use a carbide-tipped blade.`);
    if (Number.isFinite(v.wheel) && v.wheel > 0) {
      const wheelIn = toIn(v.wheel, c.units);
      const needRpm = wheelRpmForSpeed(wheelIn, speed.start);
      const wheel = `${fmt(v.wheel, mm ? 1 : 2)} ${c.L.length}`;
      stats.push({ label: "Wheel RPM to aim for", value: needRpm, unit: "RPM", places: 0 });
      explain.push({ title: "Blade speed from the wheel", formula: mm ? "m/min = π × D(mm) × RPM ÷ 1000" : "FPM = π × D(in) × RPM ÷ 12", plugged: `RPM for ${sp(speed.start)} on a ${wheel} wheel = ${fmt(needRpm, 0)}` });
      if (Number.isFinite(v.rpm) && v.rpm > 0) {
        const have = bladeSpeedFromWheel(wheelIn, v.rpm);
        const tooFast = have > speed.fastLimit;
        stats.push({ label: "Your blade speed", value: fromSfm(have, c.units), unit: spUnit, places: 0, clamped: tooFast });
        if (tooFast) warnings.push(`At ${v.rpm} wheel RPM the blade runs ${sp(have)} — too fast for ${m.name} (aim for about ${sp(speed.start)}). Drop to a lower pulley step or add a speed reducer, or the teeth dull fast.`);
        else if (have < speed.slowLimit) warnings.push(`At ${v.rpm} wheel RPM the blade runs ${sp(have)} — slow for ${m.name}. It will cut, just slowly.`);
      }
    } else if (Number.isFinite(v.rpm) && v.rpm > 0) {
      warnings.push(`To check ${v.rpm} wheel RPM, also enter the saw wheel diameter (just above it under More options). Blade speed needs both.`);
    }
    if (tIn < 3 / 32) warnings.push("Thin stock: use the finest blade you have (14/18, or a 24 TPI one-pitch blade) and a light feed, or the teeth will catch.");
    const notes = [`${spUnit} is how fast the blade's edge travels. Most small band saws run ${mm ? "900+ m/min" : "3,000+ FPM"} — fine for wood and aluminum, way too fast for steel. A saw that only does wood speeds needs a speed reducer to cut steel.`];
    if (speed.basis === "chart") notes.push("Speeds are for a bi-metal blade with flood coolant. Spray lube: 15% slower. No coolant: 30–50% slower. Carbon-steel blade: half speed.");
    if (speed.basis === "wood") notes.push("The tooth chart is for metal. For wood use a hook-tooth blade: about 3–4 TPI for thick stock, finer for thin stock and tight curves.");
    return {
      primary: { label: `Blade speed to start · ${m.name.split(" ")[0]}`, value: fromSfm(speed.start, c.units), unit: spUnit, places: 0 },
      stats, warnings, explain,
      source: "feeds",
      notes,
      historyLabel: `${m.name.split(" ")[0]} · ${size} → ${blade.pitch} TPI`,
    };
  },
});
