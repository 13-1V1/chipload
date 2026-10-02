// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// True position with bonus tolerance. Pro.

import { register } from "../app/registry.js";
import { truePosition } from "../core/inspect.js";
import { fmt, parseDimension } from "../core/format.js";
import { convertRemembering } from "../app/values.js";
import { lenPlaces } from "./_util.js";

// The general rule writes a converted length to four figures (0.08 mm → 0.00315 in), which can push a part
// sitting on the line just outside it. Here a length keeps up to nine decimals in inches (off by under
// 0.0000000005 in, 1/2000 of the verdict's 0.000001 in band) and is exact in mm (inches × 25.4 always ends).
// mm → inch still rounds, so a part within that sliver of the band's edge can still change verdict.
function convertLength(text, from, to) {
  if (from === to || String(text ?? "").trim() === "") return text;
  return convertRemembering("length", text, from, to, (t) => {
    const v = parseDimension(t, from);
    if (!Number.isFinite(v)) return t;
    const x = to === "mm" ? v * 25.4 : v / 25.4;
    const most = 9;
    for (let p = 0; p < most; p++) if (Math.abs(Number(x.toFixed(p)) - x) <= Math.abs(x) * 1e-12) return fmt(x, p);
    return fmt(x, most);
  });
}

export default register({
  id: "true-position",
  title: "True position",
  short: "Position error from X/Y deviation, with MMC bonus",
  help: "Is a hole where the print says? Converts X/Y error to the position value inspectors use, with bonus tolerance at MMC.",
  category: "inspect",
  keywords: ["true position", "position", "gd&t", "mmc", "bonus", "tolerance zone", "cmm", "deviation", "y14.5"],
  pro: true,
  // One "actual" and one "lmc" serve the hole and the pin, so saved jobs from before LMC existed reopen as typed.
  // A blank actual is taken as MMC (in size for a hole and a pin, no bonus). A blank LMC means the size isn't
  // checked on that side and the bonus isn't capped; a note says so.
  inputs: [
    { id: "dx", label: "X deviation (actual − nominal)", kind: "length", default: "0.003", defaultMm: "0.08", convert: convertLength },
    { id: "dy", label: "Y deviation (actual − nominal)", kind: "length", default: "0.004", defaultMm: "0.10", convert: convertLength },
    { id: "tol", positive: true, label: "Position tolerance (diameter)", kind: "length", default: "0.014", defaultMm: "0.35", min: 0, convert: convertLength },
    { id: "mmc", label: "Material condition", kind: "segment", default: "rfs", options: [{ value: "rfs", label: "RFS" }, { value: "mmc", label: "MMC (bonus)" }] },
    { id: "feature", label: "Feature", kind: "segment", default: "hole", options: [{ value: "hole", label: "Hole" }, { value: "pin", label: "Pin" }], showIf: (r) => r.mmc === "mmc" },
    { id: "mmcSize", positive: true, label: (r) => (r.feature === "pin" ? "MMC size (largest pin allowed)" : "MMC size (smallest hole allowed)"), kind: "length", default: "0.250", defaultMm: "6.00", min: 0, convert: convertLength, showIf: (r) => r.mmc === "mmc" },
    { id: "lmc", positive: true, optional: true, placeholder: "optional — checks size", label: (r) => (r.feature === "pin" ? "LMC size (smallest pin allowed)" : "LMC size (largest hole allowed)"), kind: "length", default: "", min: 0, convert: convertLength, showIf: (r) => r.mmc === "mmc" },
    { id: "actual", positive: true, label: (r) => (r.feature === "pin" ? "Actual pin size" : "Actual hole size"), kind: "length", default: "", min: 0, convert: convertLength, auto: (r, c, vals) => vals.mmcSize, showIf: (r) => r.mmc === "mmc" },
  ],
  compute(v, c) {
    const p = lenPlaces(c.units);
    const u = c.L.length;
    const useMmc = v.mmc === "mmc";
    const hole = v.feature !== "pin";
    const hasLmc = useMmc && Number.isFinite(v.lmc);
    const actual = v.actual;
    // One physical comparison band, 0.000001 in (= 0.0000254 mm): the same size in both units, so the unit
    // itself doesn't decide the verdict. (A rounded mm → inch conversion can still nudge a part sitting right
    // at the band's edge; see convertLength.)
    const eps = c.units === "mm" ? 0.0000254 : 0.000001;
    const r = truePosition({ dx: v.dx, dy: v.dy, tolerance: v.tol, mmc: useMmc ? v.mmcSize : null, lmc: hasLmc ? v.lmc : null, actualSize: useMmc ? actual : null, internal: hole, eps });
    const sizeTol = hasLmc ? Math.abs(v.lmc - v.mmcSize) : 0;
    // Same band as the verdict: a size inside it is in size, so it gets no "rejected" warning.
    const underMmc = useMmc && !r.sizeOk && (hole ? actual < v.mmcSize : actual > v.mmcSize);
    // A miss smaller than the last shown digit gets more digits, never "out by 0"
    const shownPlaces = (x) => { for (let q = p; q < p + 3; q++) if (Number(fmt(Math.abs(x), q)) > 0) return q; return p + 3; };
    const pp = r.positionOk ? p : shownPlaces(r.margin);
    const missText = Number(fmt(-r.margin, pp)) > 0 ? `${fmt(-r.margin, pp)} ${u}` : `less than ${fmt(10 ** -pp, pp)} ${u}`;
    const warnings = [];
    if (underMmc) warnings.push(`${hole ? "Hole is smaller" : "Pin is bigger"} than its MMC size — out of size, so the part is rejected whatever its position. No bonus.`);
    else if (hasLmc && !r.sizeOk) warnings.push(`${hole ? "Hole is bigger" : "Pin is smaller"} than its LMC size — out of size, so the part is rejected whatever its position. Bonus stops at the size tolerance, ${fmt(sizeTol, p)} ${u}.`);
    if (!r.positionOk) warnings.push(`Out of position by ${missText}. ${useMmc ? "Even with bonus." : "Check if MMC applies — bonus may save it."}`);
    const label = r.pass ? "Position (in tolerance)" : r.sizeOk ? "Position (OUT)" : r.positionOk ? "Position OK, size OUT" : "Position and size OUT";
    return {
      primary: { label, value: r.deviation, unit: u, places: pp, clamped: !r.pass },
      stats: [
        { label: "Allowed (tol + bonus)", value: r.allowed, unit: u, places: pp },
        // Red exactly when the headline says out of position: the verdict's band, not the raw sign.
        { label: "Margin", value: r.margin, unit: u, places: pp, clamped: !r.positionOk },
        { label: "Radial error", value: r.radial, unit: u, places: p },
        ...(useMmc ? [{ label: "Bonus tolerance", value: r.bonus, unit: u, places: p }, { label: "Size", text: !r.sizeOk ? "OUT of limits" : hasLmc ? "Within MMC–LMC" : "Not checked (no LMC)", clamped: !r.sizeOk }] : []),
        { label: "Used", value: 100 * r.deviation / r.allowed, unit: "% of zone", places: 0 },
      ],
      warnings,
      source: "geometry",
      explain: [
        { title: "ASME Y14.5 position", formula: "TP = 2 √(Δx² + Δy²)", plugged: `= 2 √(${fmt(v.dx, p)}² + ${fmt(v.dy, p)}²) = ${fmt(r.deviation, pp)} ${u}` },
        ...(useMmc ? [{ title: "Bonus at MMC", formula: `${hole ? "bonus = actual − MMC" : "bonus = MMC − actual"}${hasLmc ? `, at most ${hole ? "LMC − MMC" : "MMC − LMC"}` : ""}`,
          plugged: `= ${hole ? `${fmt(actual, p)} − ${fmt(v.mmcSize, p)}` : `${fmt(v.mmcSize, p)} − ${fmt(actual, p)}`} ${u}${hasLmc ? `, capped at ${fmt(sizeTol, p)} ${u}` : ""} → ${fmt(r.bonus, p)} ${u}` }] : []),
      ],
      notes: !useMmc ? [] : [
        ...(v.actualAuto ? ["No actual size entered, so the part is taken as at MMC: no bonus. Type the measured size to earn bonus."] : []),
        hasLmc ? "Bonus only counts while the size is inside its limits: it grows from 0 at MMC to the full size tolerance at LMC."
          : "Bonus assumes the size is within its limits — enter LMC to check it and cap the bonus.",
      ],
      historyLabel: `Δ${fmt(v.dx, p)}, ${fmt(v.dy, p)} → ${fmt(r.deviation, p)}`,
    };
  },
});
