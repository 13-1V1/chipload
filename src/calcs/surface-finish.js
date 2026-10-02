// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Surface finish from feed and nose radius, or the max feed for a target Ra. Pro.

import { register } from "../app/registry.js";
import { surfaceFinish, feedForRa, NOSE_RADII_IN } from "../core/lathe.js";
import { fmt, parseFraction } from "../core/format.js";
import { toIn, fromIn } from "./_util.js";

const NOSE = [["0.0156", '1/64"'], ["0.0312", '1/32"'], ["0.0469", '3/64"'], ["0.0625", '1/16"'], ["custom", "Other"]];

export default register({
  id: "surface-finish",
  title: "Surface finish (Ra)",
  short: "Finish from feed and nose radius, or feed for a target Ra",
  help: "Predicts the finish (Ra) you'll get from a feed and nose radius on the lathe, or the feed you need for a finish callout.",
  category: "lathe",
  keywords: ["surface finish", "ra", "rms", "roughness", "nose radius", "microinch", "feed", "finish pass"],
  pro: true,
  inputs: [
    { id: "mode", label: "Find", kind: "segment", default: "finish", options: [{ value: "finish", label: "Finish" }, { value: "feed", label: "Feed for Ra" }] },
    { id: "nose", label: "Nose radius", kind: "segment", default: "0.0312", options: NOSE.map(([value, label]) => ({ value, label })) },
    { id: "noseCustom", label: "Nose radius", kind: "length", default: "0.0312", defaultMm: "0.8", min: 0.0001, showIf: (r) => r.nose === "custom" },
    { id: "ipr", label: "Feed per revolution", kind: "feedRev", default: "0.005", defaultMm: "0.12", min: 0, showIf: (r) => r.mode === "finish" },
    { id: "ra", label: "Target Ra", kind: "number", default: "32", defaultMm: "0.8", unit: (u) => (u === "in" ? "µin" : "µm"), min: 0.001, showIf: (r) => r.mode === "feed",
      // µin ⇄ µm when the unit system flips (1 µin = 0.0254 µm), so the callout stays the same finish
      convert: (text, from, to) => { const x = parseFraction(text); return Number.isFinite(x) && from !== to ? fmt(to === "mm" ? x * 0.0254 : x / 0.0254, to === "mm" ? 3 : 1) : text; } },
  ],
  compute(v, c) {
    const inch = c.units === "in";
    const lp = inch ? 4 : 3;
    const raUnit = inch ? "µin" : "µm";
    const raOf = (lenIn) => (inch ? lenIn * 1e6 : lenIn * 25400); // a roughness height in inches, in µin or µm
    const rIn = v.nose === "custom" ? toIn(v.noseCustom, c.units) : NOSE_RADII_IN[v.nose];
    const r = `${fmt(fromIn(rIn, c.units), lp)} ${c.L.length}`;
    if (v.mode === "finish") {
      const fIn = toIn(v.ipr, c.units);
      const f = surfaceFinish({ feedPerRev: fIn, noseRadius: rIn });
      const ra = raOf(f.ra);
      return {
        primary: { label: "Theoretical Ra", value: ra, unit: raUnit, places: inch ? 0 : 2 },
        stats: [
          ...(inch ? [{ label: "Ra (metric)", value: f.ra * 25400, unit: "µm", places: 2 }] : []),
          { label: "RMS", value: raOf(f.rms), unit: raUnit, places: inch ? 0 : 2 },
          { label: "Peak to valley (Rt)", value: raOf(f.rt), unit: raUnit, places: inch ? 0 : 2 },
          { label: "Nose radius", value: fromIn(rIn, c.units), unit: c.L.length, places: lp },
          { label: "Meets callout", text: meetsCallout(ra, c.units) },
        ],
        warnings: feedVsNose(fIn, rIn),
        source: "advanced",
        explain: [{ title: "Theoretical finish", formula: "Rt = f² ÷ (8 r)     Ra ≈ f² ÷ (31.2 r)", plugged: `f = ${fmt(v.ipr, lp)} ${c.L.feedRev}, r = ${r} → Ra = ${fmt(ra, inch ? 1 : 2)} ${raUnit}` }],
        notes: ["Real parts run 1.5–3× rougher than theory from vibration, built-up edge, and wear. Use this to pick a feed, not to certify a part."],
        historyLabel: `${fmt(v.ipr, lp)} ${c.L.feedRev} · r ${r} → ${fmt(ra, inch ? 0 : 2)} ${raUnit}`,
      };
    }
    const raIn = inch ? v.ra / 1e6 : v.ra / 25400;
    const fIn = feedForRa({ ra: raIn, noseRadius: rIn });
    // the target as typed: fmt drops trailing zeros, so 32 stays "32" and ASME B46.1's 0.5 µin stays "0.5"
    const raText = `${fmt(v.ra, inch ? 2 : 3)} ${raUnit}`;
    return {
      primary: { label: `Max feed for Ra ${raText}`, value: fromIn(fIn, c.units), unit: c.L.feedRev, places: lp },
      stats: [
        { label: "Suggested (÷1.5 for real life)", value: fromIn(fIn / 1.5, c.units), unit: c.L.feedRev, places: lp },
        { label: "Nose radius", value: fromIn(rIn, c.units), unit: c.L.length, places: lp },
        ...(inch ? [{ label: "Target Ra", value: v.ra * 0.0254, unit: "µm", places: 2 }] : []),
      ],
      warnings: fIn > rIn ? ["That finish would need a feed past the nose radius, where this math stops holding. Finish passes usually run at half the nose radius or less."] : [],
      source: "advanced",
      explain: [{ title: "Feed for a finish", formula: "f = √(31.2 × r × Ra)", plugged: `= √(31.2 × ${r} × ${fmt(fromIn(raIn, c.units), inch ? 7 : 6)} ${c.L.length}) = ${fmt(fromIn(fIn, c.units), lp)} ${c.L.feedRev}` }],
      historyLabel: `Ra ${raText} · r ${r}`,
    };
  },
});

/**
 * The f² ÷ (8 r) cusp model only describes a nose that overlaps itself from rev to rev. Finishing feeds
 * normally run at about half the nose radius or less (Sandvik turning guidance; Machinery's Handbook); past
 * the radius the number gets poor, and at 2 r the nose cuts a thread, not a finish.
 */
function feedVsNose(fIn, rIn) {
  if (fIn >= 2 * rIn) return ["Feed per rev is twice the nose radius or more — the nose leaves a thread, not a finish, and this Ra means nothing. Drop the feed below the nose radius."];
  if (fIn > rIn) return ["Feed per rev is more than the nose radius, past where this finish math holds. Finish passes usually run at half the nose radius or less."];
  return [];
}

// Standard roughness callouts: ISO 1302 grades N1–N12 in µm with the ASME B46.1 µin values they match.
const CALLOUTS = Object.freeze([[1, 0.025], [2, 0.05], [4, 0.1], [8, 0.2], [16, 0.4], [32, 0.8], [63, 1.6], [125, 3.2], [250, 6.3], [500, 12.5], [1000, 25], [2000, 50]]);

/** The finest standard callout this Ra still passes — the first one at or above it, never the nearest below. */
export function meetsCallout(ra, units) {
  const col = units === "in" ? 0 : 1, unit = units === "in" ? "µin" : "µm";
  const hit = CALLOUTS.find((row) => row[col] >= ra * (1 - 1e-9));
  return hit ? `${hit[col]} ${unit}` : `rougher than ${CALLOUTS[CALLOUTS.length - 1][col]} ${unit}`;
}
