// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tolerance stack-up. Pro. One dimension per line: "1.000 ± 0.005" (or "1.000 0.005", or "-0.5 +-0.002").

import { register } from "../app/registry.js";
import { toleranceStack } from "../core/tolstack.js";
import { fmt, parseFraction } from "../core/format.js";
import { convertedText, convertRemembering } from "../app/values.js";
import { lenPlaces } from "./_util.js";

/** Parse stack lines into [{nominal, tolerance}]. Negative nominal = dimension that subtracts. */
export function parseStackLines(text) {
  const items = [];
  for (const line of String(text || "").split(/\n/)) {
    // the label prints a typographic minus (U+2212), and PDFs paste an en dash: both are "-" (as in format.js)
    const t = line.trim().replace(/[−–]/g, "-");
    if (!t || t.startsWith("#")) continue;
    // "1 1/4" alone is one size with no tolerance, not 1 ± 1/4 — the same as "1.250" alone (ASME Y14.5: every dimension has a tolerance).
    if (Number.isFinite(parseFraction(t))) throw new Error(`"${t}" has no tolerance. Write it as nominal ± tolerance, like ${t} ± 0.005.`);
    // the nominal may be a mixed number written with a hyphen, the way prints write it: "1-1/4 ± .005"
    const m = t.match(/^([+-]?(?:\d+-\d+\/\d+|[\d.\s\/]+?))\s*(?:±|\+\/?-|\+-|,|\s)\s*([\d.\/]+)\s*$/);
    if (!m) throw new Error(`Can't read "${t}". Use: nominal ± tolerance, one per line.`);
    const nominal = parseFraction(m[1].trim());
    const tolerance = parseFraction(m[2].trim());
    if (!Number.isFinite(nominal) || !Number.isFinite(tolerance)) throw new Error(`Can't read "${t}".`);
    items.push({ nominal, tolerance });
  }
  return items;
}

/**
 * The same stack written in the other unit system, so switching units doesn't turn 1.000 in into 1.000 mm.
 * Tolerances keep four significant figures (±0.001 mm → ±0.00003937 in, never ±0), and flipping straight
 * back gives the lines exactly as typed. Line by line: a "#" note or a blank line comes through as typed, and a
 * line that can't be read stays as typed for the user to fix — it never stops the good lines from converting.
 * `field` names the screen field, so only its own untouched text comes back on a flip (values.js).
 */
export function convertStackLines(text, from, to, field) {
  if (from === to) return text;
  const k = to === "mm" ? 25.4 : 1 / 25.4;
  const convertLine = (line) => {
    let items;
    try { items = parseStackLines(line); } catch { return line; }
    if (items.length !== 1) return line; // blank or a note
    const [i] = items;
    return `${convertedText(i.nominal * k, "length", to)} ± ${convertedText(i.tolerance * k, "length", to)}`;
  };
  return convertRemembering("tol-stack", text, from, to, (t) => String(t).split("\n").map(convertLine).join("\n"), field);
}

export default register({
  id: "tol-stack",
  title: "Tolerance stack",
  short: "Worst case and RSS stack-up",
  help: "Add up several toleranced dimensions and see the worst case and the statistical (RSS) range.",
  category: "inspect",
  keywords: ["tolerance", "stack", "stackup", "stack-up", "rss", "worst case", "statistical"],
  pro: true,
  inputs: [
    { id: "lines", label: "Dimensions (one per line, − for subtracting)", kind: "textarea", rows: 5, default: "1.000 ± 0.005\n2.000 ± 0.010\n-0.500 ± 0.002", defaultMm: "25.00 ± 0.10\n50.00 ± 0.20\n-12.00 ± 0.05", placeholder: "1.000 ± 0.005\n-0.250 ± 0.001", convert: convertStackLines },
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
