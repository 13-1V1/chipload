// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Pre-ream drill size. Pro. Stock allowance by diameter and the nearest drill.

import { register } from "../app/registry.js";
import { reamerAllowance } from "../core/tapping.js";
import { nearestDrillsInch, nearestDrillsMm, DRILL_MAX_IN, DRILL_MAX_MM } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, lenPlaces } from "./_util.js";

/**
 * Machine-reaming stock on diameter, inches. Small holes: Alvord-Polk (CTE "Getting reaming right": up to
 * 3/32 → 0.003–0.006, 3/32–1/4 → 0.008–0.010) and Redline "Total Stock Allowance by Reamer Diameter"
 * (1/32 → 0.002–0.003, 1/16 → 0.004–0.006, 1/8 → 0.009–0.011). Larger: Machinery's Handbook "Reaming":
 * ≤1/2 → 0.015, ≤1 → 0.020, ≤1.5 → 0.025, else 0.030 in.
 */
export function reamAllowanceOnDia(dIn) {
  if (dIn <= 1 / 32) return 0.003;
  if (dIn <= 1 / 16) return 0.004;
  if (dIn <= 3 / 32) return 0.006;
  if (dIn <= 0.25) return 0.010;
  if (dIn <= 0.5) return 0.015;
  if (dIn <= 1) return 0.020;
  if (dIn <= 1.5) return 0.025;
  return 0.030;
}

export default register({
  id: "ream",
  title: "Pre-ream drill",
  short: "Drill size to leave the right reaming stock",
  help: "Drill size that leaves the right amount of stock for a reamer.",
  category: "drill",
  keywords: ["ream", "reamer", "pre-ream", "allowance", "stock", "hole"],
  pro: true,
  inputs: [
    { id: "target", label: "Reamed hole diameter", kind: "length", default: "0.5", defaultMm: "12", min: 0.0001 },
    { id: "allow", positive: true, label: "Stock on diameter", kind: "length", default: "", places: 4, auto: (raw, c, v) => fromIn(reamAllowanceOnDia(toIn(Number.isFinite(v.target) ? v.target : 0.5, c.units)), c.units), hint: "Blank = handbook allowance for this size." },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    if (v.allow >= v.target) throw new Error("Stock on diameter has to be smaller than the reamed size");
    const r = reamerAllowance({ targetDiameter: v.target, allowancePerSide: v.allow / 2 });
    const preIn = toIn(r.preReamDiameter, c.units);
    const handbook = fromIn(reamAllowanceOnDia(toIn(v.target, c.units)), c.units);
    const tooMuch = v.allow > handbook * 3
      ? [`${fmt(v.allow, p)} ${c.L.length} of stock is ${fmt(v.allow / handbook, 0)}× the usual ${fmt(handbook, p)} ${c.L.length} for this size. A reamer only takes a few thousandths: check the number (it's on diameter, not per side).`]
      : [];
    // Bigger than the drill chart: no drill comes close, so the hole gets bored to size first.
    const chartMax = c.units === "in" ? DRILL_MAX_IN : DRILL_MAX_MM;
    if (r.preReamDiameter - chartMax > v.allow) {
      return {
        primary: { label: "Bore before reaming", text: `Bore to ${fmt(r.preReamDiameter, p)} ${c.L.length}` },
        stats: [
          { label: "Calculated pre-ream size", value: r.preReamDiameter, unit: c.L.length, places: p },
          { label: "Largest drill on the chart", value: chartMax, unit: c.L.length, places: p },
        ],
        warnings: [`No drill comes near ${fmt(r.preReamDiameter, p)} ${c.L.length}. Drill under size, bore to ${fmt(r.preReamDiameter, p)} ${c.L.length}, then ream.`, ...tooMuch],
        source: "advanced",
        explain: [{ title: "Pre-ream size", formula: "hole = reamed Ø − stock on diameter", plugged: `= ${fmt(v.target, p)} − ${fmt(v.allow, p)} = ${fmt(r.preReamDiameter, p)} ${c.L.length}` }],
        historyLabel: `Ø${fmt(v.target, p)} ${c.L.length} → bore ${fmt(r.preReamDiameter, p)} ${c.L.length}`,
      };
    }
    const near = c.units === "in" ? nearestDrillsInch(preIn) : nearestDrillsMm(preIn * 25.4);
    // The nearest drill wins unless it would leave less than half the stock (or none); then step down a size.
    const leaves = (d) => v.target - d.size;
    const pick = leaves(near.nearest) >= v.allow / 2 - 1e-9 ? near.nearest : (near.prev || near.nearest);
    const actualStock = leaves(pick);
    // Metric chart labels already carry "mm"; inch labels (#7, 1/4") get the decimal size after them.
    const inchSize = (d) => (c.units === "in" ? ` · ${fmt(d.size, p)} in` : "");
    // Under the small end of the chart even the smallest drill leaves no stock: there is no drill to name.
    if (actualStock <= 1e-9) {
      const smallest = `${pick.label}${inchSize(pick)}`;
      return {
        primary: { label: "Drill", text: "No drill on the chart is small enough" },
        stats: [
          { label: "Calculated pre-ream size", value: r.preReamDiameter, unit: c.L.length, places: p },
          { label: "Smallest drill on the chart", text: smallest },
        ],
        warnings: [`The smallest drill here (${smallest}) is not smaller than the ${fmt(v.target, p)} ${c.L.length} reamed hole, so it would leave nothing to ream. Get a micro drill near ${fmt(r.preReamDiameter, p)} ${c.L.length} from a specialty maker, or skip the reamer and drill to size.`, ...tooMuch],
        source: "advanced",
        explain: [{ title: "Pre-ream size", formula: "drill = reamed Ø − stock on diameter", plugged: `= ${fmt(v.target, p)} − ${fmt(v.allow, p)} = ${fmt(r.preReamDiameter, p)} ${c.L.length}` }],
        historyLabel: `Ø${fmt(v.target, p)} ${c.L.length} → no drill small enough`,
      };
    }
    const warnings = [...tooMuch];
    if (actualStock < v.allow / 2 - 1e-9) warnings.push(`This drill leaves only ${fmt(actualStock, p)} ${c.L.length} to ream, under half the ${fmt(v.allow, p)} ${c.L.length} wanted. The reamer may rub and glaze instead of cutting.`);
    if (actualStock > v.allow * 2) warnings.push("Stock is more than twice the allowance — the reamer will work hard and may cut oversize.");
    return {
      primary: { label: "Drill", text: pick.label, ...(c.units === "in" ? { unit: `(${fmt(pick.size, p)} in)` } : {}) },
      stats: [
        { label: "Calculated pre-ream size", value: r.preReamDiameter, unit: c.L.length, places: p },
        { label: "Stock this drill leaves", value: actualStock, unit: c.L.length, places: p },
        { label: "Per side", value: actualStock / 2, unit: c.L.length, places: p },
        ...(near.next ? [{ label: "Next drill up", text: `${near.next.label}${inchSize(near.next)}` }] : []),
      ],
      warnings,
      source: "advanced",
      explain: [{ title: "Pre-ream size", formula: "drill = reamed Ø − stock on diameter", plugged: `= ${fmt(v.target, p)} − ${fmt(v.allow, p)} = ${fmt(r.preReamDiameter, p)} ${c.L.length}` }],
      notes: ["Too little stock and the reamer rubs and glazes; too much and it cuts oversize. Soft materials take the high side of the range."],
      historyLabel: `Ø${fmt(v.target, p)} ${c.L.length} → ${pick.label}`,
    };
  },
});
