// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw blade speed and tooth pitch. Free tier — the hobbyist's first question.

import { register } from "../app/registry.js";
import { bandSawSpeed, bladeForStock, woodBladeForStock, bladeSpeedFromWheel, wheelRpmForSpeed } from "../core/saw.js";
import { WOOD_IDS, TOOTH_CHART } from "../data/saw.js";
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
    // Shape picks a row of the metal tooth chart; a wood blade goes by thickness alone, so wood hides it.
    { id: "shape", label: "Stock shape", kind: "segment", default: "round", options: SHAPES, showIf: (r) => !WOOD_IDS.includes(r.material) },
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
    // Wood gets a wood blade (hook or regular tooth); the variable-pitch tooth chart is for metal.
    const wood = speed.basis === "wood";
    const blade = wood ? woodBladeForStock(tIn) : bladeForStock(tIn, shape);
    const p = lenPlaces(c.units);
    // Blade speed shows in FPM, or m/min in metric (same conversion as SFM ⇄ m/min).
    const spUnit = mm ? "m/min" : "FPM";
    const sp = (fpm) => `${fmt(fromSfm(fpm, c.units), 0)} ${spUnit}`;
    const size = `${fmt(v.thickness, p)} ${c.L.length}`;
    // Thin stock is under 3 teeth, and the thin warning says so: round that count down, never up to "3"
    // (24 TPI × 0.124 in = 2.976 shows 2.9, not 3). thin needs teethInCut < 3 − 1e-9, so the nudge can't reach 3.
    const teethShown = (n) => fmt(blade.thin ? Math.floor(n * 10 + 1e-9) / 10 : n, 1);
    const woodText = () => (blade.tooth === "hook" ? `Hook tooth, about ${blade.tpi} TPI`
      : `Regular tooth, about ${blade.tpi} TPI (about ${teethShown(blade.teethInCut)} teeth in the cut)`);
    const stats = [
      { label: "Speed range for this material", text: speed.basis === "chart" ? `${sp(speed.min)} dry – ${sp(speed.max)} with coolant` : `${sp(speed.min)} – ${sp(speed.max)}` },
      ...(wood ? [{ label: "Blade to use", text: woodText() }] : [
        { label: "Blade to use", text: `${blade.pitch} TPI variable pitch (about ${fmt(blade.teethInCut, 1)} teeth in the cut)` },
        { label: "One-pitch blade instead", text: `${blade.constant} TPI` },
      ]),
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
    if (wood) explain.push({ title: "Tooth pitch", formula: `Wood: at least 3 teeth in the cut. Hook tooth from ${mm ? "19 mm" : "3/4 in"} up: 4 TPI, or 3–4 TPI from ${mm ? "25.4 mm" : "1 in"} up; thinner stock gets a finer regular tooth`, plugged: `${size} → ${woodText()}` });
    else explain.push({ title: "Tooth pitch", formula: "Blade maker's tooth chart: round bar by diameter, flat bar by width, tube by wall", plugged: `${size} ${SHAPE_WORD[shape]} → ${blade.pitch} TPI` });
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
    // Names the same blades as the stats above, so the screen gives one answer. Thin tube wall (1/16–3/32 in) sits
    // on the chart's 10/14 row, which isn't its finest pitch: name the finer blades instead of calling 10/14 the finest.
    // Metal thin is a size cutoff (THIN_STOCK_IN), not a tooth count: the chart leaves under 3 teeth on tube wall up to
    // about 0.6 in on purpose, so the warning must not give "under 3 teeth" as its reason (0.1 in wall shows 1.2 teeth
    // and no warning). It names no cutoff figure either — 3/32 in is 2.38125 mm, and any rounding of it would let a
    // typed size on the cutoff contradict the text.
    const finest = TOOTH_CHART[shape][0][1];
    if (blade.thin) warnings.push(wood ? `Thin stock: under 3 teeth in the cut even on the finest common blade. Use the finest blade you have (${blade.tpi} TPI) and a light feed, or the teeth will catch.`
      : blade.pitch === finest ? `Thin stock: use the finest blade you have (${blade.pitch}, or a ${blade.constant} TPI one-pitch blade) and a light feed, or the teeth will catch.`
      : `Thin stock: the chart's ${blade.pitch} TPI isn't its finest pitch, and stock this thin wants the finest. Use a finer blade if you have one (${finest}, or a ${blade.constant} TPI one-pitch blade) and a light feed, or the teeth will catch.`);
    const notes = [`${spUnit} is how fast the blade's edge travels. Most small band saws run ${mm ? "900+ m/min" : "3,000+ FPM"} — fine for wood and aluminum, way too fast for steel. A saw that only does wood speeds needs a speed reducer to cut steel.`];
    if (speed.basis === "chart") notes.push("Speeds are for a bi-metal blade with flood coolant. Spray lube: 15% slower. No coolant: 30–50% slower. Carbon-steel blade: half speed.");
    // No pitch here: the "Blade to use" stat gives the one pitch for this thickness (a second figure here once disagreed)
    if (speed.basis === "wood") notes.push("The metal tooth chart doesn't apply to wood: a hook-tooth blade for thick stock, a finer regular-tooth blade for thin stock and tight curves."
      + (blade.thin ? "" : " The blade shown above keeps at least 3 teeth in the cut."));
    return {
      primary: { label: `Blade speed to start · ${m.name.split(" ")[0]}`, value: fromSfm(speed.start, c.units), unit: spUnit, places: 0 },
      stats, warnings, explain,
      source: "saw",
      notes,
      historyLabel: `${m.name.split(" ")[0]} · ${size} → ${wood ? blade.tpi : blade.pitch} TPI`,
    };
  },
});
