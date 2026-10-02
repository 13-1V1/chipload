// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The Shop forms' checks and the links they open, kept free of the DOM so the tests can run them.
// A form refuses what it can't use and says why; it never saves a quiet stand-in.

import { parseFraction } from "../core/format.js";
import { defaultRaw } from "./values.js";

/**
 * Max spindle and max feed as typed on the machine form. Blank = no limit (stored as 0).
 * Anything else has to be a real top speed: a whole RPM of at least 1, a feed of at least 1 IPM / 25 mm/min.
 * @returns {{ maxRpm: number, maxFeed: number } | { error: string }}
 */
export function readMachineLimits(rpmText, feedText, units = "in") {
  const rpmT = String(rpmText ?? "").trim(), feedT = String(feedText ?? "").trim();
  const feedUnit = units === "mm" ? "mm/min" : "IPM";
  let maxRpm = 0, maxFeed = 0;
  if (rpmT) {
    const v = parseFraction(rpmT);
    if (!Number.isFinite(v)) return { error: `Check Max spindle — "${short(rpmT)}" isn't a number. Leave it blank for no limit.` };
    if (v < 1) return { error: "Max spindle has to be at least 1 RPM. Leave it blank for no limit." };
    maxRpm = Math.round(v);
  }
  if (feedT) {
    const v = parseFraction(feedT);
    const min = units === "mm" ? 25 : 1;
    if (!Number.isFinite(v)) return { error: `Check Max feed — "${short(feedT)}" isn't a number. Leave it blank for no limit.` };
    if (v < min) return { error: `Max feed has to be at least ${min} ${feedUnit}. Leave it blank for no limit.` };
    maxFeed = v;
  }
  return { maxRpm, maxFeed };
}

/**
 * Flute count as typed on the tool form: a whole number from 1 to 20 (the same range Speeds & feeds — mill takes).
 * A drill left blank is a 2-flute twist drill.
 * @returns {{ flutes: number } | { error: string }}
 */
export function readFlutes(text, kind = "endmill") {
  const t = String(text ?? "").trim();
  if (!t) return kind === "drill" ? { flutes: 2 } : { error: "Enter the number of flutes" };
  const v = parseFraction(t);
  if (!Number.isFinite(v)) return { error: `Check Flutes — "${short(t)}" isn't a number` };
  if (v < 1) return { error: "Flutes can't be less than 1" };
  if (v > 20) return { error: "Flutes can't be more than 20" };
  if (!Number.isInteger(v)) return { error: "Flutes has to be a whole number" };
  return { flutes: v };
}

/**
 * The link Shop → Tools → Feeds opens: every field of the target tool, so the overrides (surface speed,
 * chip load or feed per rev, width and depth of cut) come up blank — table values for this tool — instead of
 * whatever was typed for the last one. The material is the one last used in that tool (the job's, not the
 * cutter's), or the default.
 * A tool type the target can't take is swapped for the closest real one, and `note` says so.
 * @param {object} t  saved tool (diameter in t.units)
 * @param {object} def  the feeds-mill or feeds-drill definition
 * @param {string} [lastMaterial]  material last used in that tool
 * @returns {{ params: object, note: string|null }}
 */
export function toolFeedsParams(t, def, lastMaterial) {
  const has = (id) => def.inputs.some((i) => i.id === id);
  const typeInput = def.inputs.find((i) => i.id === "toolType");
  const typeOpts = (typeInput?.options || []).map((o) => o.value);
  let toolType = t.toolType, note = null;
  if (typeInput && !typeOpts.includes(toolType)) {
    // "Coated" in the tool library is coated carbide (TOOL_LABELS); a drill tool without that choice gets carbide.
    toolType = toolType === "coated" && typeOpts.includes("carbide") ? "carbide" : typeInput.default;
    const label = typeInput.options.find((o) => o.value === toolType)?.label || toolType;
    note = t.toolType === "coated" && toolType === "carbide"
      ? `Opened as Carbide — ${def.title} has no coated choice. A coated carbide drill can usually run a little faster.`
      : `Opened as ${label} — ${def.title} has no ${t.toolType} choice.`;
  }
  const over = { diameter: String(t.diameter) };
  if (typeInput) over.toolType = toolType;
  if (has("flutes")) over.flutes = String(t.flutes);
  const matInput = def.inputs.find((i) => i.id === "material");
  if (matInput && (matInput.options || []).some((o) => o.value === lastMaterial)) over.material = lastMaterial;
  return { params: { ...defaultRaw(def, over, t.units), units: t.units }, note };
}

/**
 * The link that reopens a saved job. Every field goes in, blank ones too, and a field the job predates gets its
 * default, so nothing picks up what was last typed in that tool. The job's units go in only for a tool that has
 * the inch/mm switch: the fraction converter's own "Value is in" field is called "units" and must win.
 */
export function jobParams(j, def) {
  const raw = Object.fromEntries(Object.entries(j.raw || {}).map(([k, v]) => [k, String(v ?? "")]));
  if (!def) return { ...raw, units: j.units };
  const params = defaultRaw(def, raw, j.units);
  if (def.units !== false) params.units = j.units;
  return params;
}

const short = (s) => (s.length > 12 ? `${s.slice(0, 12)}…` : s);
