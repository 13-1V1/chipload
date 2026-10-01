// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// STI (helical insert) tap drill. Pro. Estimated; confirm with the insert maker's chart.

import { register } from "../app/registry.js";
import { stiTapDrill } from "../core/thread.js";
import { nearestDrillsInch, nearestDrillsMm } from "../core/drills.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, COMMON_THREADS } from "./_util.js";

export default register({
  id: "sti",
  title: "STI insert tap drill",
  short: "Drill for Heli-Coil style screw-thread inserts",
  help: "Drill size for a Heli-Coil type wire insert — bigger than the plain tap drill.",
  category: "thread",
  keywords: ["sti", "helicoil", "heli-coil", "insert", "thread repair", "wire insert", "keensert", "tap drill"],
  pro: true,
  units: false,
  prefillRank: 13,
  prefill: (q) => (/sti|heli/i.test(q) ? threadPrefill(q.replace(/sti|heli-?coil/gi, "").trim()) : null),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Finished thread (the screw that goes in)", kind: "text", default: "1/4-20", placeholder: "1/4-20, M8x1.25" },
  ],
  compute(v) {
    const t = threadFromSpec(v.thread);
    const hit = t.isUn ? stiTapDrill(t.major, 1 / t.tpi, { isUn: true, tpi: t.tpi }) : stiTapDrill(t.major, t.pitch, { isUn: false });
    const fromTable = hit.source === "table";
    const sizeIn = t.isUn ? hit.size : hit.size / 25.4;
    const near = t.isUn ? nearestDrillsInch(sizeIn) : nearestDrillsMm(hit.size);
    const chosen = fromTable && hit.label ? { label: hit.label, size: hit.size } : near.nearest;
    const insertLengths = [1, 1.5, 2, 2.5, 3].map((k) => ({ k, len: k * t.majorIn }));
    return {
      primary: { label: `STI tap drill for ${t.label}${fromTable ? "" : " (estimate)"}`, text: chosen.label, unit: t.isUn ? `(${fmt(chosen.size, 4)} in)` : `(${fmt(chosen.size, 2)} mm)` },
      stats: [
        { label: fromTable ? "Chart value" : "Calculated drill", value: hit.size, unit: t.nativeUnits, places: t.isUn ? 4 : 2 },
        { label: "Oversize vs. the plain major", value: chosen.size - t.major, unit: t.nativeUnits, places: t.isUn ? 4 : 2 },
        ...(near.next && near.next.label !== chosen.label ? [{ label: "Next size up", text: `${near.next.label}` }] : []),
        { label: "Insert lengths (× D)", text: insertLengths.map((i) => `${i.k}D=${fmt(i.len, 3)}`).join("  ") },
        { label: "STI tap", text: `${t.label} STI (a different tap from the plain one)` },
      ],
      warnings: fromTable ? [] : ["Not in the published chart — estimated from D + 0.25P. Confirm with the insert maker before drilling."],
      source: "tapDrill",
      explain: [fromTable
        ? { title: "ASME B18.29.1 suggested drill", formula: "Table lookup by thread size", plugged: `${t.label} → ${chosen.label}` }
        : { title: "STI hole estimate", formula: "drill ≈ D + 0.25 P", plugged: `= ${fmt(t.majorIn, 4)} + 0.25 × ${fmt(t.pitchIn, 4)} = ${fmt(sizeIn, 4)} in → ${chosen.label}` }],
      notes: ["Drill depth = insert length + point + ~1 extra thread. Tap with the STI tap, install the insert one-quarter to one-half turn below the surface, then break the tang."],
      historyLabel: `${t.label} STI → ${chosen.label}`,
    };
  },
});
