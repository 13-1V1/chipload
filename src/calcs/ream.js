// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Pre-ream drill size. Pro. Stock allowance by diameter and the nearest drill.

import { register } from "../app/registry.js";
import { reamerAllowance } from "../core/tapping.js";
import { nearestDrillsInch, nearestDrillsMm } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { toIn, fromIn, lenPlaces } from "./_util.js";

/** Reaming allowance on diameter. Machinery's Handbook "Reaming": ≤1/4 → 0.010, ≤1/2 → 0.015, ≤1 → 0.020, ≤1.5 → 0.025, else 0.030 in. */
export function reamAllowanceOnDia(dIn) {
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
  category: "drill",
  keywords: ["ream", "reamer", "pre-ream", "allowance", "stock", "hole"],
  pro: true,
  inputs: [
    { id: "target", label: "Reamed hole diameter", kind: "length", default: "0.5", min: 0.0001 },
    { id: "allow", label: "Stock on diameter", kind: "length", default: "", places: 4, auto: (raw, c, v) => fromIn(reamAllowanceOnDia(toIn(Number.isFinite(v.target) ? v.target : 0.5, c.units)), c.units), hint: "Blank = handbook allowance for this size." },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const r = reamerAllowance({ targetDiameter: v.target, allowancePerSide: v.allow / 2 });
    const preIn = toIn(r.preReamDiameter, c.units);
    const near = c.units === "in" ? nearestDrillsInch(preIn) : nearestDrillsMm(preIn * 25.4);
    // Prefer a drill at or under the pre-ream size so stock is never negative.
    const pick = near.nearest.size <= r.preReamDiameter + 1e-9 ? near.nearest : (near.prev || near.nearest);
    const actualStock = v.target - pick.size;
    const warnings = [];
    if (actualStock <= 0) warnings.push("That drill is bigger than the reamed size. Pick a smaller drill.");
    if (actualStock > v.allow * 2) warnings.push("Stock is more than twice the allowance — the reamer will work hard and may cut oversize.");
    return {
      primary: { label: "Drill", text: pick.label, unit: `(${fmt(pick.size, p)} ${c.L.length})` },
      stats: [
        { label: "Calculated pre-ream size", value: r.preReamDiameter, unit: c.L.length, places: p },
        { label: "Stock this drill leaves", value: actualStock, unit: c.L.length, places: p, clamped: actualStock <= 0 },
        { label: "Per side", value: actualStock / 2, unit: c.L.length, places: p },
        ...(near.next ? [{ label: "Next drill up", text: `${near.next.label} · ${fmt(near.next.size, p)}` }] : []),
      ],
      warnings,
      source: "advanced",
      explain: [{ title: "Pre-ream size", formula: "drill = reamed Ø − stock on diameter", plugged: `= ${fmt(v.target, p)} − ${fmt(v.allow, p)} = ${fmt(r.preReamDiameter, p)}` }],
      notes: ["Too little stock and the reamer rubs and glazes; too much and it cuts oversize. Soft materials take the high side of the range."],
      historyLabel: `Ø${fmt(v.target, p)} → ${pick.label}`,
    };
  },
});
