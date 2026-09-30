// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// STI (helical insert) tap drill. Pro. Estimated; confirm with the insert maker's chart.

import { register } from "../app/registry.js";
import { stiTapDrill } from "../core/thread.js";
import { nearestDrillsInch, nearestDrillsMm } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill } from "./_util.js";

export default register({
  id: "sti",
  title: "STI insert tap drill",
  short: "Drill for Heli-Coil style screw-thread inserts",
  category: "thread",
  keywords: ["sti", "helicoil", "heli-coil", "insert", "thread repair", "wire insert", "keensert", "tap drill"],
  pro: true,
  units: false,
  prefill: (q) => (/sti|heli/i.test(q) ? threadPrefill(q.replace(/sti|heli-?coil/gi, "").trim()) : null),
  inputs: [
    { id: "thread", label: "Finished thread (the screw that goes in)", kind: "text", default: "1/4-20", placeholder: "1/4-20, M8x1.25" },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    const dIn = stiTapDrill(t.majorIn, t.pitchIn);
    const near = t.isUn ? nearestDrillsInch(dIn) : nearestDrillsMm(dIn * 25.4);
    const chosen = near.nearest;
    const chosenIn = t.isUn ? chosen.size : chosen.size / 25.4;
    const insertLengths = [1, 1.5, 2, 2.5, 3].map((k) => ({ k, len: k * t.majorIn }));
    return {
      primary: { label: `STI tap drill for ${t.label} (estimate)`, text: chosen.label, unit: t.isUn ? `(${fmt(chosen.size, 4)} in)` : `(${fmt(chosen.size, 2)} mm)` },
      stats: [
        { label: "Calculated drill", value: t.isUn ? dIn : dIn * 25.4, unit: t.nativeUnits, places: t.isUn ? 4 : 3 },
        { label: "Oversize vs. plain tap drill", value: t.isUn ? 0.35 * t.pitchIn + 0.65 * t.pitchIn * 0.0 : 0.35 * t.pitchMm, unit: t.nativeUnits, places: 3 },
        ...(near.next ? [{ label: "Next size up", text: `${near.next.label}` }] : []),
        { label: "Insert lengths (× D)", text: insertLengths.map((i) => `${i.k}D=${fmt(i.len, 3)}`).join("  ") },
        { label: "STI tap", text: `${t.label} STI (a different tap from the plain one)` },
      ],
      warnings: ["Estimate from D + 0.35P. Confirm against the insert maker's chart before drilling — sizes differ by brand."],
      source: "tapDrill",
      explain: [{ title: "STI hole", formula: "drill ≈ D + 0.35 P", plugged: `= ${fmt(t.majorIn, 4)} + 0.35 × ${fmt(t.pitchIn, 4)} = ${fmt(dIn, 4)} in → ${chosen.label}` }],
      notes: ["Drill depth = insert length + point + ~1 extra thread. Tap with the STI tap, install the insert one-quarter to one-half turn below the surface, then break the tang."],
      historyLabel: `${t.label} STI → ${chosen.label}`,
    };
  },
});
