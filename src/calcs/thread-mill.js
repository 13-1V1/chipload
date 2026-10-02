// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread milling feed compensation. Pro. Internal and external.

import { register } from "../app/registry.js";
import { threadMilling } from "../core/milling.js";
import { fmt } from "../core/format.js";
import { basicThreadGeometry } from "../core/thread.js";
import { tapDrillByPercent } from "../core/tapdrill.js";
import { threadFromSpec, threadPrefill, fromIn, toIn, COMMON_THREADS } from "./_util.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

export default register({
  id: "thread-mill",
  title: "Thread mill feed",
  short: "Centerline feed comp for thread milling",
  help: "Feed for a thread mill: the control feeds the tool center, which travels a smaller circle than the cutting edge.",
  category: "mill",
  keywords: ["thread mill", "thread milling", "feed comp", "centerline", "helical", "internal", "external"],
  pro: true,
  prefillRank: 14,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/2-13", placeholder: "1/2-13, M12x1.75" },
    { id: "side", label: "Thread is", kind: "segment", default: "internal", options: [{ value: "internal", label: "Internal" }, { value: "external", label: "External" }] },
    { id: "cutter", label: "Thread mill diameter", kind: "length", default: "0.375", defaultMm: "9.5", min: 0.0001 },
    { id: "flutes", label: "Flutes", kind: "int", default: "3", min: 1 },
    { id: "rpm", label: "Spindle", kind: "int", default: "3000", unit: "RPM", min: 1 },
    { id: "chip", positive: true, label: "Chip load per tooth", kind: "length", default: "0.001", defaultMm: "0.025", min: 0 },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const majorIn = t.majorIn;
    const cutterIn = toIn(v.cutter, c.units);
    const chipIn = toIn(v.chip, c.units);
    const internal = v.side === "internal";
    const p = c.units === "in" ? 4 : 3;
    const len = (x) => `${fmt(fromIn(x, c.units), p)} ${c.L.length}`;
    if (internal) {
      // The cutter has to go down the drilled hole (about the 75% tap drill) before it can cut.
      const holeIn = tapDrillByPercent(majorIn, t.pitchIn, 75);
      if (cutterIn >= holeIn) throw new Error(`A ${len(cutterIn)} thread mill won't fit the ${len(holeIn)} tap-drill hole for ${t.label}. Use a smaller cutter`);
    }
    // Centerline feed per rev of the spindle. Feed comp uses the major diameter (the tool makers' convention):
    // internal Fc = Fs × (D − d) ÷ D, external Fc = Fs × (D + d) ÷ D.
    const perRevIn = internal
      ? threadMilling({ majorDiameter: majorIn, cutterDiameter: cutterIn, rpm: 1, flutes: v.flutes, chipLoad: chipIn }).centerlineFeed
      : v.flutes * chipIn * (majorIn + cutterIn) / majorIn;
    const m = machineFor(c, "mill");
    const fit = fitToMachine(m, v.rpm, perRevIn, c, { check: "the chip load and flutes" });
    const rpm = fit.rpm;
    // A centerline feed per rev bigger than the machine's whole max feed leaves no spindle speed: say so, don't show 0 RPM.
    if (fit.cantRun) throw new Error(fit.problem);
    const slowed = fit.rpmCapped || fit.feedCapped;
    const surface = rpm * v.flutes * chipIn;
    const centerline = fit.feedIpm;
    // Tool-center path at full thread depth: internal the edge reaches the major (D − d); external it reaches
    // the external minor (d3 = D − 1.2269 P, ASME B1.1 / ISO 68-1), so the path is d3 + d. D + d only touches the OD.
    const pathDia = internal ? majorIn - cutterIn : basicThreadGeometry(majorIn, t.pitchIn).externalMinor + cutterIn;
    const warnings = [...(t.caution ? [t.caution] : []), ...fit.warnings, ...spindleSanity(rpm, m, "mill", c)];
    // Tool makers' limit for an internal thread mill: about 75% of the thread's major (nominal) diameter.
    if (internal && cutterIn > majorIn * 0.75 * (1 + 1e-9)) warnings.push(`Thread mill is over 75% of the thread's major diameter (${len(majorIn * 0.75)} max) — expect deflection and a poor form. Use a smaller cutter.`);
    const F = (ipm) => `${fmt(fromIn(ipm, c.units), 2)} ${c.L.feed}`;
    const N = (x) => fmt(fromIn(x, c.units), p);
    return {
      primary: { label: "Program this feed (centerline)", value: fromIn(centerline, c.units), unit: c.L.feed, places: 2, clamped: fit.feedCapped },
      stats: [
        ...(slowed ? [{ label: "Spindle (machine limit)", value: rpm, unit: "RPM", places: 0, clamped: true }, { label: "Wanted RPM", value: v.rpm, unit: "RPM", places: 0 }] : []),
        { label: "Surface (tooth) feed", value: fromIn(surface, c.units), unit: c.L.feed, places: 2 },
        { label: "Helix path diameter (tool center, full depth)", value: fromIn(pathDia, c.units), unit: c.L.length, places: p },
        ...(internal ? [] : [{ label: "Path where the tool first touches the OD", value: fromIn(majorIn + cutterIn, c.units), unit: c.L.length, places: p }]),
        { label: "Feed per rev of helix", value: fromIn(centerline / rpm, c.units), unit: c.L.feedRev, places: 4 },
        { label: "Thread", text: `${t.label} · ${t.pitchLabel}` },
      ],
      warnings,
      source: "advanced",
      explain: [
        { title: "Surface feed", formula: "Fs = RPM × flutes × chip", plugged: `= ${rpm} × ${v.flutes} × ${fmt(fromIn(chipIn, c.units), c.units === "in" ? 4 : 3)} = ${F(surface)}` },
        internal
          ? { title: "Internal comp (major diameter)", formula: "Fc = Fs × (Dmajor − Dcutter) ÷ Dmajor", plugged: `= ${fmt(fromIn(surface, c.units), 2)} × (${N(majorIn)} − ${N(cutterIn)}) ÷ ${N(majorIn)} = ${F(centerline)}` }
          : { title: "External comp (major diameter)", formula: "Fc = Fs × (Dmajor + Dcutter) ÷ Dmajor", plugged: `= ${fmt(fromIn(surface, c.units), 2)} × (${N(majorIn)} + ${N(cutterIn)}) ÷ ${N(majorIn)} = ${F(centerline)}` },
        internal
          ? { title: "Helix path (full depth)", formula: "path = Dmajor − Dcutter", plugged: `= ${N(majorIn)} − ${N(cutterIn)} = ${len(pathDia)}` }
          : { title: "Helix path (full depth)", formula: "path = external minor + Dcutter = (D − 1.2269 P) + Dcutter", plugged: `= ${N(pathDia - cutterIn)} + ${N(cutterIn)} = ${len(pathDia)}` },
      ],
      historyLabel: `${t.label} · ${v.side} · Ø${fmt(v.cutter, p)} ${c.L.length}`,
    };
  },
});
