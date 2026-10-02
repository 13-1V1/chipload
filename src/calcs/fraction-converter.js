// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Decimal ⇄ fraction ⇄ nearest drill. Free tier. Prefills from any typed number on the home search.

import { register } from "../app/registry.js";
import { decimalToFraction, fmt, parseDimension, parseFraction, splitUnit } from "../core/format.js";
import { nearestDrillsInch, nearestDrillMm, DRILL_MIN_IN, DRILL_MAX_IN, DRILL_MIN_MM, DRILL_MAX_MM } from "../core/drills.js";

// Past a chart's end there is no drill to name. The same margins tap-drill.js uses: 1/64" over the
// biggest inch drill or 0.002" under #80; 0.5 mm over the biggest metric drill or 0.05 mm under the smallest.
const offInch = (inches) => inches > DRILL_MAX_IN + 1 / 64 || inches < DRILL_MIN_IN - 0.002;
const offMm = (mm) => mm > DRILL_MAX_MM + 0.5 || mm < DRILL_MIN_MM - 0.05;

/** A size typed with or without its unit: "8.5 mm", "8.5mm", '3/8"', "13/64in", "1 1/4". Null if it isn't one. */
export function readSize(text) {
  const s = splitUnit(text);
  const value = s ? parseFraction(s.number) : NaN;
  return Number.isFinite(value) ? { text: s.number.trim(), value, unit: s.unit } : null;
}

export default register({
  id: "fraction-converter",
  title: "Decimal ⇄ fraction ⇄ drill",
  short: "Nearest 1/64, mm, and drill for any size",
  help: "Turn a decimal into the nearest fraction, millimeters, or drill size — and back. Type 0.201, 3/8, 1 1/4, or 8.5 mm.",
  category: "reference",
  keywords: ["fraction", "decimal", "convert", "64ths", "drill", "mm", "inch", "size", "mm to inch", "inch to mm", "decimal to fraction", "drill size", "convert size"],
  pro: false,
  units: false,
  prefillRank: 3,
  // The field gets the number alone and the switch gets the unit typed with it, so "8.5 mm" opens on 8.5 mm, not 8.5 in.
  prefill: (q) => {
    const n = readSize(q);
    if (!n || n.value <= 0 || n.value > 100) return null;
    const units = n.unit || "in";
    return { params: { value: n.text, units }, label: `${fmt(n.value, 4)} ${units}` };
  },
  inputs: [
    { id: "units", label: "Value is in", kind: "segment", default: "in", options: [{ value: "in", label: "inch" }, { value: "mm", label: "mm" }] },
    // A unit typed with the number wins over the switch: "8.5mm" is 8.5 mm even with the switch on inch.
    // The value is handed to compute() in the switch's unit.
    { id: "value", label: "Size", kind: "number", default: "0.201", positive: true, placeholder: "0.201, 3/8, 1 1/4, 8.5 mm",
      parse: (text, _units, raw) => parseDimension(text, raw.units === "mm" ? "mm" : "in") },
  ],
  compute(v) {
    const inches = v.units === "in" ? v.value : v.value / 25.4;
    const mm = inches * 25.4;
    const n64 = Math.round(inches * 64);
    const f64 = decimalToFraction(n64 / 64, { tolerance: 1e-9 });
    const near = nearestDrillsInch(inches);
    const nearMm = nearestDrillMm(mm);
    const inchOff = offInch(inches), mmOff = offMm(mm);
    const inchEnd = nearestDrillsInch(inches > DRILL_MAX_IN ? DRILL_MAX_IN : DRILL_MIN_IN).nearest;
    const mmEnd = mm > DRILL_MAX_MM ? DRILL_MAX_MM : DRILL_MIN_MM;
    const err64 = n64 / 64 - inches;
    // "Exact" only when it is: 0.2035 is 13/64 + 0.0004, and 25 mm is not 63/64.
    const exact = Math.abs(err64) < 1e-6;
    const errPlaces = Math.abs(err64) < 0.0001 ? 6 : 4;
    return {
      primary: exact
        ? { label: "Fraction (exact to 1/64)", text: f64 ? f64.text : "—", unit: "in" }
        : { label: `Nearest 1/64 (${err64 >= 0 ? "+" : "−"}${fmt(Math.abs(err64), errPlaces)} in)`, text: f64 ? f64.text : "—", unit: "in" },
      stats: [
        { label: "Decimal inch", value: inches, unit: "in", places: 4 },
        { label: "Millimeters", value: mm, unit: "mm", places: 3 },
        { label: "Nearest drill (inch)", text: inchOff ? `None on the chart (${inches > DRILL_MAX_IN ? "largest" : "smallest"} ${inchEnd.label} · ${fmt(inchEnd.size, 4)} in)` : `${near.nearest.label} · ${fmt(near.nearest.size, 4)} in` },
        { label: "Nearest drill (mm)", text: mmOff ? `None on the chart (${mm > DRILL_MAX_MM ? "largest" : "smallest"} ${mmEnd} mm · ${fmt(mmEnd / 25.4, 4)} in)` : `${nearMm.label} · ${fmt(nearMm.size / 25.4, 4)} in` },
        ...(near.prev && !inchOff ? [{ label: "Drill under", text: `${near.prev.label} · ${fmt(near.prev.size, 4)} in` }] : []),
        ...(near.next && !inchOff ? [{ label: "Drill over", text: `${near.next.label} · ${fmt(near.next.size, 4)} in` }] : []),
        { label: "Thousandths", value: inches * 1000, unit: "thou", places: 1 },
      ],
      source: "geometry",
      explain: [{ title: "Nearest 64th", formula: "n = round(inches × 64)", plugged: `= round(${fmt(inches, 4)} × 64) = ${n64} → ${n64}/64` }],
      historyLabel: `${fmt(v.value, 4)} ${v.units}`,
    };
  },
});
