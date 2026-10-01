// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Decimal ⇄ fraction ⇄ nearest drill. Free tier. Prefills from any typed number on the home search.

import { register } from "../app/registry.js";
import { decimalToFraction, fmt } from "../core/format.js";
import { nearestDrillsInch, nearestDrillMm } from "../core/drills.js";
import { recognize } from "../app/search.js";

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
  prefill: (q) => {
    const n = recognize.number(q);
    if (!n || n.value <= 0 || n.value > 100) return null;
    return { params: { value: q.trim(), units: n.unit || "in" }, label: `${fmt(n.value, 4)} ${n.unit || "in"}` };
  },
  inputs: [
    { id: "units", label: "Value is in", kind: "segment", default: "in", options: [{ value: "in", label: "inch" }, { value: "mm", label: "mm" }] },
    { id: "value", label: "Size", kind: "number", default: "0.201", min: 0, placeholder: "0.201, 3/8, 1 1/4, 8.5" },
  ],
  compute(v) {
    const inches = v.units === "in" ? v.value : v.value / 25.4;
    const mm = inches * 25.4;
    const exact = decimalToFraction(inches, { tolerance: 0.0005 });
    const n64 = Math.round(inches * 64);
    const f64 = decimalToFraction(n64 / 64, { tolerance: 1e-9 });
    const near = nearestDrillsInch(inches);
    const nearMm = nearestDrillMm(mm);
    const err64 = n64 / 64 - inches;
    return {
      primary: exact
        ? { label: "Fraction (exact to 1/64)", text: exact.text, unit: "in" }
        : { label: `Nearest 1/64 (${err64 >= 0 ? "+" : "−"}${fmt(Math.abs(err64), 4)})`, text: f64 ? f64.text : "—", unit: "in" },
      stats: [
        { label: "Decimal inch", value: inches, unit: "in", places: 4 },
        { label: "Millimeters", value: mm, unit: "mm", places: 3 },
        { label: "Nearest drill (inch)", text: `${near.nearest.label} · ${fmt(near.nearest.size, 4)}` },
        { label: "Nearest drill (mm)", text: `${nearMm.label} · ${fmt(nearMm.size / 25.4, 4)} in` },
        ...(near.prev ? [{ label: "Drill under", text: `${near.prev.label} · ${fmt(near.prev.size, 4)}` }] : []),
        ...(near.next ? [{ label: "Drill over", text: `${near.next.label} · ${fmt(near.next.size, 4)}` }] : []),
        { label: "Thousandths", value: inches * 1000, unit: "thou", places: 1 },
      ],
      source: "geometry",
      explain: [{ title: "Nearest 64th", formula: "n = round(inches × 64)", plugged: `= round(${fmt(inches, 4)} × 64) = ${n64} → ${n64}/64` }],
      historyLabel: `${fmt(v.value, 4)} ${v.units}`,
    };
  },
});
