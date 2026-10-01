// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw blade speed and tooth pitch. Free tier — the hobbyist's first question.

import { register } from "../app/registry.js";
import { bandSawSpeed, tpiForThickness, bladeSpeedFromWheel, wheelRpmForSpeed } from "../core/saw.js";
import { materialOptions, materialById } from "../data/materials-library.js";
import { fmt } from "../core/format.js";
import { toIn, lenPlaces } from "./_util.js";

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
    { id: "thickness", label: "Stock thickness (the part the blade goes through)", kind: "length", default: "1", defaultMm: "25", min: 0.001, hint: "For round bar use the diameter; for tube use the wall thickness." },
    { id: "wheel", positive: true, label: "Saw wheel diameter", kind: "length", default: "", optional: true, placeholder: "optional — gives the wheel RPM to aim for", advanced: true },
    { id: "rpm", min: 1, label: "Wheel RPM you have", kind: "int", default: "", unit: "RPM", optional: true, placeholder: "optional — checks your saw's speed", advanced: true },
  ],
  compute(v, c) {
    const m = materialById(v.material);
    const speed = bandSawSpeed(m.group, m.rating);
    const tIn = toIn(v.thickness, c.units);
    const tpi = tpiForThickness(tIn);
    const p = lenPlaces(c.units);
    const stats = [
      { label: "Speed range for this material", text: `${speed.min} – ${speed.max} FPM` },
      { label: "Blade to use", text: `${tpi.pick} TPI (${fmt(tpi.teethInCut, 1)} teeth in the cut)` },
      { label: "TPI that will work", text: tpi.usable.length ? `${tpi.usable[0]} – ${tpi.usable[tpi.usable.length - 1]} TPI` : "none common — see note" },
      { label: "Material", text: `${m.name} · ${m.group}` },
    ];
    const warnings = [];
    const explain = [
      { title: "Tooth pitch rule", formula: "3 teeth minimum in the cut, 24 maximum, aim for 6–12", plugged: `${fmt(tIn, p)} in thick → ${fmt(tpi.minTpi, 1)} to ${fmt(tpi.maxTpi, 1)} TPI, aim ${fmt(tpi.ideal, 1)} → ${tpi.pick} TPI` },
    ];
    if (Number.isFinite(v.wheel) && v.wheel > 0) {
      const wheelIn = toIn(v.wheel, c.units);
      const needRpm = wheelRpmForSpeed(wheelIn, speed.start);
      stats.push({ label: "Wheel RPM to aim for", value: needRpm, unit: "RPM", places: 0 });
      explain.push({ title: "Blade speed from the wheel", formula: "FPM = π × D × RPM ÷ 12", plugged: `RPM for ${speed.start} FPM on a ${fmt(wheelIn, 2)} in wheel = ${fmt(needRpm, 0)}` });
      if (Number.isFinite(v.rpm) && v.rpm > 0) {
        const have = bladeSpeedFromWheel(wheelIn, v.rpm);
        stats.push({ label: "Your blade speed", value: have, unit: "FPM", places: 0, clamped: have > speed.max * 1.1 });
        if (have > speed.max * 1.1) warnings.push(`At ${v.rpm} wheel RPM the blade runs ${fmt(have, 0)} FPM — too fast for ${m.name}. Drop to a lower pulley step or expect a short blade life.`);
        else if (have < speed.min * 0.5) warnings.push(`At ${v.rpm} wheel RPM the blade runs ${fmt(have, 0)} FPM — slow for ${m.name}. It will cut, just slowly.`);
      }
    }
    if (tIn < 3 / 32) warnings.push("Thin stock: use the finest blade you have (24–32 TPI) and let the saw do the work, or the teeth will catch.");
    return {
      primary: { label: `Blade speed to start · ${m.name.split(" ")[0]}`, value: speed.start, unit: "FPM", places: 0 },
      stats, warnings, explain,
      source: "feeds",
      notes: ["FPM is how fast the blade's edge travels. Most small band saws run 3,000+ FPM — fine for wood and aluminum, way too fast for steel. A saw that only does wood speeds needs a speed reducer to cut steel."],
      historyLabel: `${m.name.split(" ")[0]} · ${fmt(v.thickness, p)} ${c.L.length} → ${tpi.pick} TPI`,
    };
  },
});
