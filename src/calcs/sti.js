// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// STI (helical insert) tap drill. Pro. Estimated; confirm with the insert maker's chart.

import { register } from "../app/registry.js";
import { stiTapDrill } from "../core/thread.js";
import { drillsAtOrAboveInch, drillsAtOrAboveMm } from "../core/drills.js";
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
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const pitch = t.isUn ? 1 / t.tpi : t.pitch;
    const hit = t.isUn ? stiTapDrill(t.major, pitch, { isUn: true, tpi: t.tpi }) : stiTapDrill(t.major, pitch, { isUn: false });
    const fromTable = hit.source === "table";
    // No inch/mm switch here (units: false): a metric thread reads in mm, an inch thread in inches unless the app
    // is set to mm, then every length is turned to mm (17/64 = 0.2656 in = 6.747 mm).
    const toMm = t.isUn && (c?.units === "mm" || c?.settings?.units === "mm");
    const L = (x) => (toMm ? x * 25.4 : x);
    const u = toMm ? "mm" : t.nativeUnits;
    const places = t.isUn ? (toMm ? 3 : 4) : 2;
    // An estimated hole must not be under the STI minor minimum, so take the first stock drill at or above it.
    const around = (size) => (t.isUn ? drillsAtOrAboveInch(size) : drillsAtOrAboveMm(size));
    const near = around(fromTable ? hit.size : hit.minMinor);
    if (!near.nearest) throw new Error(`${t.label} STI needs a hole bigger than the drill chart — bore or thread-mill it, and use the insert maker's chart`);
    const chosen = fromTable && hit.label ? { label: hit.label, size: hit.size } : near.nearest;
    const insertLengths = [1, 1.5, 2, 2.5, 3].map((k) => ({ k, len: L(k * t.major) }));
    const metricChart = fromTable && !t.isUn;
    return {
      primary: { label: `STI tap drill for ${t.label}${fromTable ? "" : " (estimate)"}`, text: chosen.label, ...(t.isUn ? { unit: `(${fmt(L(chosen.size), places)} ${u})` } : {}) },
      stats: [
        fromTable
          ? { label: metricChart ? "Chart value (steel, magnesium, plastic)" : "Chart value", value: L(hit.size), unit: u, places }
          : { label: "STI minor diameter, min", value: L(hit.minMinor), unit: u, places },
        ...(metricChart && hit.alt !== hit.size ? [{ label: "Chart value in aluminum", value: hit.alt, unit: u, places }] : []),
        { label: "Oversize vs. the plain major", value: L(chosen.size - t.major), unit: u, places },
        ...(near.next && near.next.label !== chosen.label ? [{ label: "Next size up", text: `${near.next.label}` }] : []),
        { label: "Insert lengths (× D)", text: insertLengths.map((i) => `${i.k}D = ${fmt(i.len, t.isUn && !toMm ? 3 : 2)} ${u}`).join("  ") },
        { label: "STI tap", text: `${t.label} STI (a different tap from the plain one)` },
      ],
      warnings: [...(t.caution ? [t.caution] : []), ...(fromTable ? [] : [`${t.label} isn't in the insert chart here, so the drill is figured from the STI minor diameter. Confirm with the insert maker before drilling.`])],
      source: "sti",
      explain: [fromTable
        ? { title: t.isUn ? "ASME B18.29.1 suggested drill" : "Heli-Coil metric chart (ASME B18.29.2M hole)", formula: "Table lookup by thread size", plugged: `${t.label} → ${chosen.label}` }
        : { title: "STI hole from the minor diameter", formula: "STI minor min = D + 0.2165 P;  drill = first stock size at or above it",
            plugged: `= ${fmt(L(t.major), places)} + 0.2165 × ${fmt(L(pitch), places)} = ${fmt(L(hit.minMinor), places)} ${u} → ${chosen.label}` }],
      notes: ["Drill depth = insert length + point + ~1 extra thread. Tap with the STI tap, install the insert one-quarter to one-half turn below the surface, then break the tang."],
      historyLabel: `${t.label} STI → ${chosen.label}`,
    };
  },
});
