// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// NPT pipe threads. Pro. Dimensions, tap drills, engagement, and the taper.

import { register } from "../app/registry.js";
import { NPT_TABLE, NPT_TAPER_HALF_ANGLE, NPT_TAPER_PER_FOOT } from "../data/npt.js";
import { fmt } from "../core/format.js";
import { fromIn } from "./_util.js";

export default register({
  id: "npt",
  title: "NPT pipe thread",
  short: "Tap drill, engagement, E0/E1, taper",
  help: "Tapered pipe threads: tap drill, how far the thread should engage, and the dimensions from the standard.",
  category: "thread",
  keywords: ["npt", "pipe thread", "pipe tap", "taper", "1/8-27", "1/4-18", "1/2-14", "3/4-14", "nptf", "hand tight"],
  pro: true,
  prefillRank: 15,
  prefill: (q) => { const s = q.trim().toLowerCase().replace(/\s*npt\s*$/, ""); const hit = NPT_TABLE.find((r) => r.name === s || r.name.split("-")[0] === s); return hit ? { params: { size: hit.name }, label: `${hit.name} NPT` } : null; },
  inputs: [
    { id: "size", label: "Size", kind: "select", default: "1/4-18", options: NPT_TABLE.map((r) => ({ value: r.name, label: `${r.name} NPT` })) },
    { id: "reamer", label: "Before tapping", kind: "segment", default: "no", options: [{ value: "no", label: "Drill only" }, { value: "yes", label: "Drill + taper ream" }] },
  ],
  compute(v, c) {
    const r = NPT_TABLE.find((x) => x.name === v.size);
    const p = c.units === "in" ? 4 : 3;
    const drill = v.reamer === "yes" ? r.drillReam : r.drill;
    const e1 = r.e0 + r.l1 / 16;
    const pitch = 1 / r.tpi;
    const wrench = r.l1 + 3 * pitch; // hand tight + ~3 turns
    const L = (x) => fromIn(x, c.units);
    return {
      primary: { label: `Tap drill for ${r.name} NPT (${v.reamer === "yes" ? "with reamer" : "no reamer"})`, text: drill[0], unit: `(${fmt(L(drill[1]), p)} ${c.L.length})` },
      stats: [
        { label: "Pipe OD", value: L(r.od), unit: c.L.length, places: p },
        { label: "Threads per inch", value: r.tpi, unit: "TPI", places: 1 },
        { label: "Hand-tight engagement (L1)", value: L(r.l1), unit: c.L.length, places: p },
        { label: "Hand tight, turns", value: r.l1 / pitch, unit: "turns", places: 1 },
        { label: "Wrench makeup (L1 + 3 turns)", value: L(wrench), unit: c.L.length, places: p },
        { label: "Effective thread (L2)", value: L(r.l2), unit: c.L.length, places: p },
        { label: "PD at small end (E0)", value: L(r.e0), unit: c.L.length, places: p },
        { label: "PD at hand-tight plane (E1)", value: L(e1), unit: c.L.length, places: p },
        { label: "Taper", text: `${NPT_TAPER_PER_FOOT} in/ft on dia · ${NPT_TAPER_HALF_ANGLE}° per side` },
        { label: "Other drill", text: v.reamer === "yes" ? `${r.drill[0]} without reamer` : `${r.drillReam[0]} with reamer` },
      ],
      source: "threadGeometry",
      explain: [{ title: "ASME B1.20.1", formula: "E1 = E0 + L1 ÷ 16     taper = 1/16 on diameter", plugged: `E1 = ${fmt(r.e0, 5)} + ${fmt(r.l1, 4)} ÷ 16 = ${fmt(e1, 5)} in` }],
      notes: ["Tap depth sets the fit: tap until the plug gauge sits L1 deep (about the hand-tight turns above) ± 1 turn. NPTF (dryseal) uses the same drills but tighter crest/root control."],
      historyLabel: `${r.name} NPT`,
    };
  },
});
