// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Unit converter. Free tier. Shop units only — length, speed, feed, angle, temperature, weight, torque, pressure.

import { register } from "../app/registry.js";
import { fmt } from "../core/format.js";

// Each unit: factor to the base unit (or to/from functions for temperature).
const CATS = {
  length: { label: "Length", base: "in", units: { in: 1, thou: 0.001, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 1 / 0.0254 } },
  speed: { label: "Surface speed", base: "SFM", units: { SFM: 1, "m/min": 3.28084, "ft/sec": 60, "m/sec": 196.85 } },
  feed: { label: "Feed", base: "IPM", units: { IPM: 1, "mm/min": 1 / 25.4, "in/sec": 60, "mm/sec": 60 / 25.4 } },
  angle: { label: "Angle", base: "deg", units: { deg: 1, rad: 180 / Math.PI, "arc-min": 1 / 60, "arc-sec": 1 / 3600, "TPF (in/ft, per side)": NaN } },
  temp: { label: "Temperature", base: "°F", units: { "°F": 1, "°C": 1, K: 1 } },
  weight: { label: "Weight", base: "lb", units: { lb: 1, oz: 1 / 16, kg: 2.20462, g: 0.00220462 } },
  torque: { label: "Torque", base: "ft·lb", units: { "ft·lb": 1, "in·lb": 1 / 12, "N·m": 0.737562, "kgf·m": 7.23301 } },
  pressure: { label: "Pressure", base: "psi", units: { psi: 1, bar: 14.5038, MPa: 145.038, kPa: 0.145038, ksi: 1000 } },
  volume: { label: "Volume / MRR", base: "in³", units: { "in³": 1, "cm³": 0.0610237, L: 61.0237, "fl oz": 1.80469, gal: 231 } },
};
const opts = (cat) => Object.keys(CATS[cat].units).filter((u) => !u.startsWith("TPF")).map((u) => ({ value: u, label: u }));

function tempToF(v, u) { return u === "°C" ? v * 9 / 5 + 32 : u === "K" ? (v - 273.15) * 9 / 5 + 32 : v; }
function tempFromF(f, u) { return u === "°C" ? (f - 32) * 5 / 9 : u === "K" ? (f - 32) * 5 / 9 + 273.15 : f; }

export function convertUnits(value, cat, from, to) {
  if (cat === "temp") return tempFromF(tempToF(value, from), to);
  const u = CATS[cat].units;
  return value * u[from] / u[to];
}

export default register({
  id: "unit-converter",
  title: "Unit converter",
  short: "Length, speed, feed, temp, weight, torque, pressure",
  category: "reference",
  keywords: ["convert", "units", "mm", "inch", "celsius", "fahrenheit", "kg", "lb", "torque", "psi", "bar", "sfm", "m/min"],
  pro: false,
  units: false,
  inputs: [
    { id: "cat", label: "What", kind: "select", default: "length", options: Object.entries(CATS).map(([value, c]) => ({ value, label: c.label })) },
    { id: "value", label: "Value", kind: "number", default: "1" },
    { id: "from", label: "From", kind: "select", default: "in", options: (raw) => opts(raw.cat) },
    { id: "to", label: "To", kind: "select", default: "mm", options: (raw) => opts(raw.cat) },
  ],
  compute(v) {
    const out = convertUnits(v.value, v.cat, v.from, v.to);
    const all = opts(v.cat).filter((o) => o.value !== v.from).map((o) => ({ label: o.value, value: convertUnits(v.value, v.cat, v.from, o.value), unit: "", places: 4 }));
    return {
      primary: { label: `${fmt(v.value, 4)} ${v.from} =`, value: out, unit: v.to, places: Math.abs(out) >= 1000 ? 2 : 4 },
      stats: all,
      source: "geometry",
      explain: v.cat === "temp"
        ? [{ title: "Temperature", formula: "°F = °C × 9/5 + 32   K = °C + 273.15" }]
        : [{ title: "Factor", formula: `1 ${v.from} = ${fmt(convertUnits(1, v.cat, v.from, v.to), 6)} ${v.to}` }],
      historyLabel: `${fmt(v.value, 4)} ${v.from} → ${v.to}`,
    };
  },
});
