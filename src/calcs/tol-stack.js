// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tolerance stack-up. Pro. One dimension per line: "1.000 ± 0.005" (or "1.000 0.005", or "-0.5 +-0.002").

import { register } from "../app/registry.js";
import { toleranceStack } from "../core/tolstack.js";
import { fmt, parseFraction } from "../core/format.js";
import { lenPlaces } from "./_util.js";

/** Parse stack lines into [{nominal, tolerance}]. Negative nominal = dimension that subtracts. */
export function parseStackLines(text) {
  const items = [];
  for (const line of String(text || "").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^([+-]?[\d.\s\/]+?)\s*(?:±|\+\/?-|\+-|,|\s)\s*([\d.\/]+)\s*$/);
    if (!m) throw new Error(`Can't read "${t}". Use: nominal ± tolerance, one per line.`);
    const nominal = parseFraction(m[1].trim());
    const tolerance = parseFraction(m[2].trim());
    if (!Number.isFinite(nominal) || !Number.isFinite(tolerance)) throw new Error(`Can't read "${t}".`);
    items.push({ nominal, tolerance });
  }
  return items;
}

export default register({
  id: "tol-stack",
  title: "Tolerance stack",
  short: "Worst case and RSS stack-up",
  category: "inspect",
  keywords: ["tolerance", "stack", "stackup", "stack-up", "rss", "worst case", "statistical"],
  pro: true,
  inputs: [
    { id: "lines", label: "Dimensions (one per line, − for subtracting)", kind: "textarea", rows: 5, default: "1.000 ± 0.005\n2.000 ± 0.010\n-0.500 ± 0.002", placeholder: "1.000 ± 0.005\n-0.250 ± 0.001" },
  ],
  compute(v, c) {
    const items = parseStackLines(v.lines);
    if (items.length < 2) throw new Error("Add at least two dimensions");
    const r = toleranceStack(items);
    const p = lenPlaces(c.units);
    return {
      primary: { label: `Worst case · ${items.length} dimensions`, text: `${fmt(r.nominal, p)} ± ${fmt(r.worstCaseTolerance, p)}`, unit: c.L.length },
      stats: [
        { label: "Worst case min", value: r.worstCaseMin, unit: c.L.length, places: p },
        { label: "Worst case max", value: r.worstCaseMax, unit: c.L.length, places: p },
        { label: "RSS ±", value: r.rssTolerance, unit: c.L.length, places: p },
        { label: "RSS range", text: `${fmt(r.rssMin, p)} – ${fmt(r.rssMax, p)}` },
        { label: "Nominal", value: r.nominal, unit: c.L.length, places: p },
        { label: "RSS saves", value: r.worstCaseTolerance - r.rssTolerance, unit: c.L.length, places: p },
      ],
      source: "advanced",
      explain: [
        { title: "Worst case", formula: "T = Σ|tᵢ|", plugged: `= ${items.map((i) => fmt(i.tolerance, p)).join(" + ")} = ${fmt(r.worstCaseTolerance, p)}` },
        { title: "Root sum square", formula: "T = √(Σ tᵢ²)", plugged: `= √(${items.map((i) => `${fmt(i.tolerance, p)}²`).join(" + ")}) = ${fmt(r.rssTolerance, p)}` },
      ],
      notes: ["RSS assumes each dimension varies independently and normally. Use worst case for safety-critical fits or short runs."],
      historyLabel: `${items.length} dims · ${fmt(r.nominal, p)} ± ${fmt(r.worstCaseTolerance, p)}`,
    };
  },
});
