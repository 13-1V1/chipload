// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Unit converter. Free tier. Shop units only — length, speed, feed, angle, temperature, weight, torque, pressure.

import { register } from "../app/registry.js";
import { fmt, sigPlaces } from "../core/format.js";

// Exact definitions (NIST SP 811 App. B; NIST Handbook 44 App. C): 1 in = 0.0254 m, 1 ft = 0.3048 m,
// 1 lb = 0.45359237 kg, standard gravity 9.80665 m/s² (1 kgf = 9.80665 N), 1 US gal = 231 in³, 1 fl oz = 1/128 gal.
const LB_KG = 0.45359237, G_N = 9.80665;
const LBF_N = LB_KG * G_N; // 1 lbf in newtons
const PSI_PA = LBF_N / 0.0254 ** 2; // 1 psi in pascals

// Each unit: factor to the base unit (or to/from functions for temperature), written as its exact expression.
const CATS = {
  length: { label: "Length", base: "in", units: { in: 1, thou: 0.001, ft: 12, mm: 1 / 25.4, cm: 1 / 2.54, m: 1 / 0.0254 } },
  speed: { label: "Surface speed", base: "SFM", units: { SFM: 1, "m/min": 1 / 0.3048, "ft/sec": 60, "m/sec": 60 / 0.3048 } },
  feed: { label: "Feed", base: "IPM", units: { IPM: 1, "mm/min": 1 / 25.4, "in/sec": 60, "mm/sec": 60 / 25.4 } },
  angle: { label: "Angle", base: "deg", units: { deg: 1, rad: 180 / Math.PI, "arc-min": 1 / 60, "arc-sec": 1 / 3600 } },
  temp: { label: "Temperature", base: "°F", units: { "°F": 1, "°C": 1, K: 1 } },
  weight: { label: "Weight", base: "lb", units: { lb: 1, oz: 1 / 16, kg: 1 / LB_KG, g: 1 / (1000 * LB_KG) } },
  torque: { label: "Torque", base: "ft·lb", units: { "ft·lb": 1, "in·lb": 1 / 12, "N·m": 1 / (0.3048 * LBF_N), "kgf·m": G_N / (0.3048 * LBF_N) } },
  pressure: { label: "Pressure", base: "psi", units: { psi: 1, bar: 1e5 / PSI_PA, MPa: 1e6 / PSI_PA, kPa: 1e3 / PSI_PA, ksi: 1000 } },
  volume: { label: "Volume / MRR", base: "in³", units: { "in³": 1, "cm³": 1 / 2.54 ** 3, L: 1000 / 2.54 ** 3, "fl oz": 231 / 128, gal: 231 } },
};
const opts = (cat) => Object.keys(CATS[cat].units).map((u) => ({ value: u, label: u }));

function tempToF(v, u) { return u === "°C" ? v * 9 / 5 + 32 : u === "K" ? (v - 273.15) * 9 / 5 + 32 : v; }
function tempFromF(f, u) { return u === "°C" ? (f - 32) * 5 / 9 : u === "K" ? (f - 32) * 5 / 9 + 273.15 : f; }

/** Absolute zero, 0 K = -273.15 °C = -459.67 °F (SI definition of the kelvin): nothing is colder. */
const ABSOLUTE_ZERO_F = -459.67;

export function convertUnits(value, cat, from, to) {
  if (cat === "temp") return tempFromF(tempToF(value, from), to);
  const u = CATS[cat].units;
  return value * u[from] / u[to];
}

/** Places that show a result to 6 significant figures (at most 10): 0.001 in = 0.0000254 m, never "0 m". */
const placesFor = (x) => Math.min(10, sigPlaces(x, 6));

// The To list puts the field's default (mm) first when it's on offer, so the screen's "first option" and the
// calculator's "default" fallback both land on the same unit when the old To stops being offered.
const toOptions = (raw) => {
  const list = opts(raw.cat).filter((o) => o.value !== raw.from);
  const i = list.findIndex((o) => o.value === "mm");
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
};

export default register({
  id: "unit-converter",
  title: "Unit converter",
  short: "Length, speed, feed, temp, weight, torque, pressure",
  help: "Convert shop units: inches and mm, SFM and m/min, °F and °C, torque, pressure, weight.",
  category: "reference",
  keywords: ["convert", "units", "mm", "inch", "celsius", "fahrenheit", "kg", "lb", "torque", "psi", "bar", "sfm", "m/min", "inch", "temperature", "conversion"],
  pro: false,
  units: false,
  inputs: [
    { id: "cat", label: "What", kind: "select", default: "length", options: Object.entries(CATS).map(([value, c]) => ({ value, label: c.label })) },
    { id: "value", label: "Value", kind: "number", default: "1" },
    { id: "from", label: "From", kind: "select", default: "in", options: (raw) => opts(raw.cat) },
    // never offers the unit you're converting from, so a new category starts on a real conversion
    { id: "to", label: "To", kind: "select", default: "mm", options: toOptions },
  ],
  compute(v) {
    if (v.cat === "temp" && tempToF(v.value, v.from) < ABSOLUTE_ZERO_F - 1e-9) {
      throw new Error("That's colder than absolute zero (-459.67 °F, -273.15 °C, 0 K). Check the sign and the unit.");
    }
    const out = convertUnits(v.value, v.cat, v.from, v.to);
    const all = opts(v.cat).filter((o) => o.value !== v.from).map((o) => {
      const value = convertUnits(v.value, v.cat, v.from, o.value);
      return { label: o.value, value, unit: "", places: placesFor(value) };
    });
    const typed = fmt(v.value, placesFor(v.value));
    const factor = convertUnits(1, v.cat, v.from, v.to);
    return {
      primary: { label: `${typed} ${v.from} =`, value: out, unit: v.to, places: placesFor(out) },
      stats: all,
      source: "geometry",
      explain: v.cat === "temp"
        ? [{ title: "Temperature", formula: "°F = °C × 9/5 + 32   K = °C + 273.15" }]
        : [{ title: "Factor", formula: `1 ${v.from} = ${fmt(factor, Math.min(12, sigPlaces(factor, 7)))} ${v.to}` }],
      historyLabel: `${typed} ${v.from} → ${v.to}`,
    };
  },
});
