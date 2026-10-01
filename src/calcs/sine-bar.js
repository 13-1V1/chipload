// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Sine bar. Pro. Gauge-block stack for an angle, or angle from a stack.

import { register } from "../app/registry.js";
import { sineBarHeight, sineBarAngle } from "../core/geometry.js";
import { fmt } from "../core/format.js";
import { lenPlaces } from "./_util.js";

export default register({
  id: "sine-bar",
  title: "Sine bar",
  short: "Gauge block stack for an angle",
  help: "A sine bar sets an exact angle: stack gauge blocks under one end. This gives the stack height for an angle, or the angle from a stack.",
  category: "inspect",
  keywords: ["sine bar", "sine plate", "gauge blocks", "gage blocks", "angle", "stack"],
  pro: true,
  inputs: [
    { id: "bar", label: "Sine bar length", kind: "segment", default: "5", options: [{ value: "5", label: '5"' }, { value: "10", label: '10"' }, { value: "custom", label: "Other" }] },
    { id: "barLen", label: "Bar length (roll centers)", kind: "length", default: "2.5", defaultMm: "100", min: 0.0001, showIf: (r) => r.bar === "custom" },
    { id: "mode", label: "Find", kind: "segment", default: "height", options: [{ value: "height", label: "Stack height" }, { value: "angle", label: "Angle" }] },
    { id: "angle", label: "Angle", kind: "angle", default: "30", min: 0, max: 90, showIf: (r) => r.mode === "height" },
    { id: "height", label: "Stack height", kind: "length", default: "2.5", defaultMm: "50", min: 0, showIf: (r) => r.mode === "angle" },
  ],
  compute(v, c) {
    const p = c.units === "in" ? 4 : 3;
    // Named bars are inch bars; convert to the current unit.
    const barLen = v.bar === "custom" ? v.barLen : (c.units === "in" ? Number(v.bar) : Number(v.bar) * 25.4);
    if (v.mode === "height") {
      const h = sineBarHeight({ barLength: barLen, angleDegrees: v.angle });
      return {
        primary: { label: `Stack for ${fmt(v.angle, 3)}° on ${fmt(barLen, c.units === "in" ? 0 : 1)} ${c.L.length} bar`, value: h, unit: c.L.length, places: p },
        stats: [{ label: "Bar length", value: barLen, unit: c.L.length, places: p }, { label: "Complement angle", value: 90 - v.angle, unit: "°", places: 3 }],
        source: "geometry",
        explain: [{ title: "Sine bar", formula: "H = L × sin θ", plugged: `= ${fmt(barLen, p)} × sin ${fmt(v.angle, 3)}° = ${fmt(h, p)}` }],
        historyLabel: `${fmt(v.angle, 3)}° → ${fmt(h, p)}`,
      };
    }
    const a = sineBarAngle({ barLength: barLen, stackHeight: v.height });
    if (!Number.isFinite(a)) throw new Error("Stack can't be taller than the bar");
    // round to the second first, then split — otherwise 29°59′59.7″ prints as 29° 59′ 60″
    const totalSec = Math.round(a * 3600);
    const deg = Math.floor(totalSec / 3600), min = Math.floor((totalSec % 3600) / 60), sec = totalSec % 60;
    return {
      primary: { label: "Angle", value: a, unit: "°", places: 4 },
      stats: [{ label: "Degrees · minutes · seconds", text: `${deg}° ${min}′ ${sec}″` }, { label: "Bar length", value: barLen, unit: c.L.length, places: p }],
      source: "geometry",
      explain: [{ title: "Sine bar", formula: "θ = asin(H ÷ L)", plugged: `= asin(${fmt(v.height, p)} ÷ ${fmt(barLen, p)}) = ${fmt(a, 4)}°` }],
      historyLabel: `${fmt(v.height, p)} → ${fmt(a, 3)}°`,
    };
  },
});
