// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Critic harness: drive every calculator in inch and mm, with Pro on and off, with no machine and with mill,
// lathe and odd machine profiles. Five passes:
//   1. defaults under every machine profile, Pro on and off
//   2. every option of every dropdown and segment (options built from other fields are resolved the way the
//      screen does), each with every machine profile
//   3. every combination of a tool's choices (a seeded sample past COMBO_CAP), under every machine and with Pro off
//   4. hostile text in one field at a time, in every mode (every option of every short list, a spread of the
//      long ones like the 198 materials)
//   5. dead controls: every visible field has to change the answer in some state, unless INERT says why not
// Reports crashes, any NaN / undefined / Infinity that reaches the user, stale choices that survive, and dead controls.
// Run: node tests/critic/fuzz.mjs

import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw, optionsFor, NUMERIC_KINDS } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const HOSTILE_NUM = ["0", "-1", "-0.5", "1e9", "999999999", "0.000001", "1e-12", "abc", "1/0", "0/0", "", "   ", "NaN", "Infinity", "-Infinity",
  "1 1/4", "3/8", "1,5", "1..2", "--5", "5-", "1/2/3", "٣", "💥", "<img src=x onerror=alert(1)>", "1e400", "0x10", "  7  ", "+5", ".5", "5.", "90", "180", "360", "0.0001", "100000"];
const HOSTILE_TEXT = ["", "   ", "abc", "1/4-20", "1-8", "1 1/8-7", "M0x0", "M10x0", "0-0", "1/0-20", "<script>alert(1)</script>", "💥", "999-999", "-1/4-20", "1/4--20", "m10x1.5x2", "#99-99", "1/4-0", "a".repeat(5000),
  "H7", "g6", "Z9", "h99", "g", "H7/g6", " k6 ", "zc11", "H0", "1.000 ± 0.005", "1 +0.002 -0.001\n-0.5 ± 0", "± ±"]; // fit codes and stack lines too
// Odd profiles (no limit, negative, tiny, HTML in the name) and real ones. machineFor() reads type: a mill profile
// must not limit a lathe tool and a lathe profile must not limit an end mill.
const MACHINES = [null,
  { id: "a", name: "Zero", type: "mill", maxRpm: 0, maxFeed: 0, controller: "fanuc", units: "in" },
  { id: "b", name: "Neg", type: "lathe", maxRpm: -5, maxFeed: -5, controller: "fanuc", units: "in" },
  { id: "c", name: "Tiny", type: "mill", maxRpm: 1, maxFeed: 1, controller: "haas", units: "in" }, // the least the Shop form takes
  { id: "d", name: "Metric mill", type: "mill", maxRpm: 8000, maxFeed: 10000, controller: "siemens", units: "mm" },
  { id: "e", name: "<b>x</b>", type: "lathe", maxRpm: 500, maxFeed: 5, controller: "other", units: "in" },
  { id: "f", name: "Bridgeport", type: "mill", maxRpm: 2720, maxFeed: 30, controller: "linuxcnc", units: "in" },
  { id: "g", name: "Haas ST-10", type: "lathe", maxRpm: 6000, maxFeed: 400, controller: "haas", units: "in" },
  { id: "h", name: "Okuma LB", type: "lathe", maxRpm: 2500, maxFeed: 2000, controller: "okuma", units: "mm" }];
const COMBO_CAP = 5000;  // choice combinations per tool and unit system; past this a seeded sample (none reach it today)
const LONG_LIST = 20;    // a list longer than this is "long": the hostile pass takes a spread of it

/**
 * Fields that may sit visible without changing the answer, and why. A field listed here that comes back
 * to life is reported as stale so the list stays honest. `handoff` = an app defect reported to its owner.
 */
const INERT = [
  { calc: "lathe-cycle", input: "od", when: (r) => r.op === "turn" && r.speedMode === "rpm",
    why: "handoff (lathe-cycle.js): turning at a typed G97 RPM, time = L ÷ (f × N) never reads the OD, yet the field stays on screen" },
];

/**
 * App defects already handed to their owners (10/02/2026). They print as notes, not failures, until fixed;
 * an entry that no longer matches anything is reported as stale. Never park a new defect here without a handoff.
 */
const KNOWN = [
  { calc: /^(thread-mill|lathe-cycle)$/, issue: /^stat "Feed per rev of helix" value=NaN|^primary has neither a finite value nor text \(value=Infinity\)|^stat "Per pass \(cutting\)" value=Infinity|^stat "Total" shows "Infinity:NaN min"/,
    why: "handoff (_machine.js fitToMachine, lathe-cycle.js face/groove CSS cap): a feed per rev bigger than the machine's max feed per minute floors the spindle to 0 RPM, so time reads Infinity and helix feed NaN" },
  { calc: /^(feeds-mill|lathe-feeds|feeds-drill|job-sheet)$/, issue: /^inch unit in mm mode: "(Uncoated carbide wears|Milling at these speeds)/,
    why: "handoff (materials team, open): pass c.units as toolCaution's third argument so the hard-material caution is metric-only in mm" },
];

const BAD = /\bNaN\b|undefined|Infinity|\[object|null\b/;
// Inch units a metric screen must not show. A number inside a word (G50 in the program) is not a length.
const INCH_UNIT = /\b(IPM|SFM|IPR)\b|°F|(?<![A-Za-z]\d*)\d+(\.\d+)? (in|inch|inches)\b/;
const anomalies = [];
const notes = [];
let runs = 0, rejected = 0, friendly = 0, ok = 0;
const onScreen = new Set(), fuzzedOnScreen = new Set(); // "calc|field": ever visible / given hostile text while visible

/** Seeded so a failure repeats run to run. */
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ctxFor = (units, pro, machine) => ({ units, L: UNIT_LABEL[units], settings: { units, pro }, machine: pro ? machine : null, fmt }); // render.js hands a machine over only with Pro on
const isChoice = (input) => input.kind === "select" || input.kind === "segment";
const unitsOf = (def) => (def.units === false ? ["in"] : ["in", "mm"]);

function choicesOf(def, input, raw, ctx) {
  try { return optionsFor(input, raw, ctx) || []; }
  catch (e) { anomalies.push({ calc: def.id, where: `${input.id} options`, issue: `options threw ${e.name}: ${e.message}` }); return []; }
}

/** Every combination of the tool's choices, each list resolved against the choices before it; a seeded sample past the cap. */
function combos(def, units) {
  const ctx = ctxFor(units, true, null), pick = rng(def.id.length * 7919 + units.length);
  let list = [{}];
  for (const input of def.inputs.filter(isChoice)) {
    const next = [];
    for (const partial of list) for (const o of choicesOf(def, input, defaultRaw(def, partial, units), ctx)) next.push({ ...partial, [input.id]: o.value });
    list = next;
    while (list.length > COMBO_CAP) list.splice(Math.floor(pick() * list.length), 1);
  }
  return list;
}

function scan(def, out, where, units) {
  const issues = [];
  const p = out.primary;
  if (!p) issues.push("no primary");
  else {
    if (!(Number.isFinite(p.value) || typeof p.text === "string")) issues.push(`primary has neither a finite value nor text (value=${p.value})`);
    if (typeof p.text === "string" && BAD.test(p.text)) issues.push(`primary text "${p.text}"`);
    if (BAD.test(String(p.label || ""))) issues.push(`primary label "${p.label}"`);
  }
  for (const s of out.stats || []) {
    const shown = Number.isFinite(s.value) ? fmt(s.value, s.places ?? 4) : String(s.text ?? "—");
    if (s.value !== undefined && !Number.isFinite(s.value) && s.text === undefined) issues.push(`stat "${s.label}" value=${s.value}`);
    if (BAD.test(shown) || BAD.test(String(s.label))) issues.push(`stat "${s.label}" shows "${shown}"`);
    if (Number.isFinite(s.value) && s.value < 0 && /time|rpm|spindle|passes|weight|removal|speed used|teeth/i.test(s.label)) issues.push(`negative ${s.label} = ${s.value}`);
  }
  for (const w of out.warnings || []) if (BAD.test(w)) issues.push(`warning "${w.slice(0, 80)}"`);
  for (const e of out.explain || []) if (BAD.test(`${e.formula} ${e.plugged || ""}`)) issues.push(`explain "${(e.plugged || e.formula).slice(0, 90)}"`);
  for (const t of out.tables || []) for (const r of t.rows) for (const c of t.columns) { const v = r[c.key]; if ((typeof v === "number" && !Number.isFinite(v)) || BAD.test(String(v))) issues.push(`table cell ${c.key}=${v}`); }
  for (const b of out.code || []) if (BAD.test(b.text)) issues.push(`code contains NaN/undefined: ${b.text.split("\n").find((l) => BAD.test(l))}`);
  for (const n of out.next || []) if (!n.add || !n.get) issues.push("next item missing text");
  if (Number.isFinite(p?.value) && p.value < 0 && /feed|time|rpm|spindle|weight|price|speed/i.test(String(p.label))) issues.push(`negative primary ${p.label} = ${p.value}`);
  if (units === "mm") { // metric rule: in mm every number the user reads is metric (a drill's name like 7/16" is a name, not a unit)
    const read = [`${p?.label ?? ""} ${p?.text ?? ""} ${p?.unit ?? ""}`, ...(out.stats || []).map((s) => `${s.label} ${s.text ?? ""} ${s.unit ?? ""}`), ...(out.warnings || []), ...(out.notes || []), ...(out.explain || []).map((e) => `${e.title} ${e.formula} ${e.plugged || ""}`)];
    for (const t of read) if (INCH_UNIT.test(t.replace(/20 °C \(68 °F\)/g, ""))) issues.push(`inch unit in mm mode: "${t.slice(0, 90)}"`);
  }
  for (const i of issues) anomalies.push({ calc: def.id, where, issue: i });
}

function run(def, raw, units, machine, where, pro = true, field = null) {
  runs++;
  const ctx = ctxFor(units, pro, machine);
  where = `${where}/${units}/${pro ? `pro/machine=${machine?.name ?? "none"}` : "free"}`;
  let built;
  try { built = buildValues(def, raw, ctx); }
  catch (e) { anomalies.push({ calc: def.id, where, issue: `buildValues threw ${e.name}: ${e.message}` }); return; }
  for (const input of def.inputs) if (!built.hidden.has(input.id)) onScreen.add(`${def.id}|${input.id}`);
  if (field && !built.hidden.has(field)) fuzzedOnScreen.add(`${def.id}|${field}`);
  // A choice that isn't offered (stale link, hand-edited storage) must come back as one that is.
  for (const input of def.inputs) {
    if (!isChoice(input) || built.hidden.has(input.id)) continue;
    const offered = choicesOf(def, input, built.raw, ctx);
    if (offered.length && !offered.some((o) => o.value === built.raw[input.id])) anomalies.push({ calc: def.id, where, issue: `${input.id} kept "${built.raw[input.id]}", which isn't one of its options` });
  }
  if (built.invalid.size) { rejected++; return; }
  let out;
  try { out = def.compute(built.values, ctx); }
  catch (e) {
    if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) anomalies.push({ calc: def.id, where, issue: `compute threw ${e.name}: ${e.message}` });
    else if (BAD.test(e.message)) anomalies.push({ calc: def.id, where, issue: `error message leaks: "${e.message}"` });
    else friendly++;
    return;
  }
  if (!out) { friendly++; return; }
  ok++;
  scan(def, out, where, units);
}

// ── dead controls ──
const NUM_ALT = ["1", "2", "0.5", "3", "10", "45", "0.1", "100", "5", "0.01"];
const TEXT_ALT = ["3/8-16", "M8x1.25", "1/2-13", "#10-32", "H8", "f7", "k6", "1.000 ± 0.005\n0.500 ± 0.002", "2"];

/** What the user sees, to tell whether a field did anything (the Recent label and the source key aside). */
function shown(def, raw, ctx, choice = false) {
  const b = buildValues(def, raw, ctx);
  // a choice that swaps the fields on screen did something, even before the new ones are filled in
  if (b.invalid.size) return choice ? `asks for ${[...b.invalid]}, hides ${[...b.hidden]}` : null;
  // so does one that shows or hides a field, or changes another list's options
  const form = JSON.stringify([[...b.hidden], def.inputs.filter((i) => typeof i.options === "function").map((i) => choicesOf(def, i, b.raw, ctx).map((o) => o.label))]);
  try { const out = def.compute(b.values, ctx); if (!out) return `${form} empty`; const { historyLabel, source, ...seen } = out; return `${form} ${JSON.stringify(seen)}`; }
  catch (e) { return `${form} message ${e.message}`; }
}

/** Values to try in a field: its other options, nearby and round numbers, other threads, fit codes and stack lines. */
function alternatives(def, input, b, ctx) {
  if (isChoice(input)) return choicesOf(def, input, b.raw, ctx).map((o) => o.value);
  if (!NUMERIC_KINDS.has(input.kind)) return TEXT_ALT;
  const v = b.values[input.id];
  return [...(Number.isFinite(v) ? [v * 1.25, v * 0.8, v + 1, v * 2, v / 2].map((x) => String(+x.toPrecision(6))) : []), ...NUM_ALT];
}

/** Does changing this field change what the user sees — here, or once one other number is pushed well up or down? */
function isLive(def, input, b, ctx) {
  const alts = alternatives(def, input, b, ctx), choice = isChoice(input);
  const changes = (raw) => {
    const base = shown(def, raw, ctx);
    return base != null && alts.some((a) => { if (a === raw[input.id]) return false; const s = shown(def, { ...raw, [input.id]: a }, ctx, choice); return s != null && s !== base; });
  };
  if (changes(b.raw)) return true;
  for (const other of def.inputs) {
    if (other === input || !NUMERIC_KINDS.has(other.kind) || b.hidden.has(other.id) || !Number.isFinite(b.values[other.id])) continue;
    for (const k of [0.1, 10, 0.3, 3]) if (changes({ ...b.raw, [other.id]: String(+(b.values[other.id] * k).toPrecision(6)) })) return true;
  }
  return false;
}

const inertSeen = new Set();
function deadControls(def, units, modes) {
  const ctx = ctxFor(units, true, null);
  for (const mode of modes) {
    const b = buildValues(def, defaultRaw(def, mode, units), ctx);
    if (shown(def, b.raw, ctx) == null) continue; // this mode needs a number first; the hostile pass covers it
    for (const input of def.inputs) {
      if (b.hidden.has(input.id) || isLive(def, input, b, ctx)) continue;
      const known = INERT.findIndex((x) => x.calc === def.id && x.input === input.id && x.when(b.raw));
      if (known >= 0) { inertSeen.add(known); continue; }
      anomalies.push({ calc: def.id, where: `${JSON.stringify(mode)}/${units}`, issue: `"${input.id}" is on screen but changing it changes nothing — hide it in this mode, use it, or list it in INERT with the reason` });
    }
  }
}

const rot = rng(20261002);
/** A machine and Pro setting for the next run: every profile turns up, and Pro is off about one run in five. */
function rotate() { return { pro: rot() > 0.2, machine: MACHINES[Math.floor(rot() * MACHINES.length)] }; }

for (const def of allCalcs()) {
  if (def.view === "chart") {
    for (const units of ["in", "mm"]) for (const pro of [true, false]) { const where = `${units}/${pro ? "pro" : "free"}`; try { const rows = def.rows(ctxFor(units, pro, null)); if (!rows.length) anomalies.push({ calc: def.id, where, issue: "chart has no rows" }); for (const r of rows) for (const v of Object.values(r)) if ((typeof v === "number" && !Number.isFinite(v)) || BAD.test(String(v))) anomalies.push({ calc: def.id, where, issue: `chart cell ${v}` }); } catch (e) { anomalies.push({ calc: def.id, where, issue: `rows() threw ${e.message}` }); } }
    continue;
  }
  for (const units of unitsOf(def)) {
    const atDefaults = defaultRaw(def, {}, units);
    // 1. defaults under every machine profile, and with Pro off
    for (const machine of MACHINES) run(def, atDefaults, units, machine, "defaults");
    run(def, atDefaults, units, null, "defaults", false);
    // 2. every option of every choice on its own, under every machine and with Pro off
    const modes = [{}];
    for (const input of def.inputs.filter(isChoice)) {
      const all = choicesOf(def, input, atDefaults, ctxFor(units, true, null));
      for (const o of all) {
        const raw = defaultRaw(def, { [input.id]: o.value }, units);
        for (const machine of MACHINES) run(def, raw, units, machine, `${input.id}=${o.value}`);
        run(def, raw, units, null, `${input.id}=${o.value}`, false);
      }
      // the hostile pass takes every option of a short list and a spread of a long one
      all.forEach((o, k) => { if (all.length <= LONG_LIST || k % 15 === 0 || k === all.length - 1) modes.push({ [input.id]: o.value }); });
    }
    // 3. every combination of the choices (options built from other choices resolved for each), every machine, Pro off
    const mixes = combos(def, units);
    for (const mix of mixes) {
      const raw = defaultRaw(def, mix, units);
      for (const machine of MACHINES) run(def, raw, units, machine, `combo ${JSON.stringify(mix)}`);
      run(def, raw, units, null, `combo ${JSON.stringify(mix)}`, false);
    }
    // 4. hostile input, one field at a time, in every mode
    for (const mode of modes) for (const input of def.inputs) {
      const list = NUMERIC_KINDS.has(input.kind) ? HOSTILE_NUM : (input.kind === "text" || input.kind === "textarea") ? HOSTILE_TEXT : ["bogus", "", "__proto__"];
      for (const h of list) { const { pro, machine } = rotate(); run(def, defaultRaw(def, { ...mode, [input.id]: h }, units), units, machine, `${JSON.stringify(mode)} ${input.id}=${JSON.stringify(h.length > 40 ? h.slice(0, 40) + "…" : h)}`, pro, input.id); }
    }
    // 5. dead controls, in every mode and a spread of the combinations
    deadControls(def, units, [...modes, ...mixes.filter((_, k) => k % Math.max(1, Math.floor(mixes.length / 40)) === 0)]);
  }
}
// the harness's own coverage: every field that can be on screen got hostile text while it was
for (const def of allCalcs()) for (const input of def.inputs || []) {
  const key = `${def.id}|${input.id}`;
  if (onScreen.has(key) && !fuzzedOnScreen.has(key)) anomalies.push({ calc: def.id, where: "coverage", issue: `"${input.id}" shows in some mode but never got hostile input while on screen — add that mode to the hostile pass` });
}
INERT.forEach((x, k) => notes.push(inertSeen.has(k) ? `known inert: [${x.calc}] ${x.input} — ${x.why}` : `stale INERT entry: [${x.calc}] ${x.input} now changes the answer (or never shows) — remove it`));

// park the handed-off defects, then dedupe the rest by calc + issue text (keep first repro)
const parked = KNOWN.map(() => 0);
const open = anomalies.filter((a) => { const k = KNOWN.findIndex((x) => x.calc.test(a.calc) && x.issue.test(a.issue)); if (k < 0) return true; parked[k]++; return false; });
KNOWN.forEach((x, k) => notes.push(parked[k] ? `known defect ×${parked[k]}: ${x.why}` : `stale KNOWN entry (nothing matches it now — remove it): ${x.why}`));
const seen = new Map();
for (const a of open) { const k = `${a.calc}|${a.issue.replace(/[-\d.e+]+/g, "#")}`; if (!seen.has(k)) seen.set(k, { ...a, count: 1 }); else seen.get(k).count++; }
console.log(JSON.stringify({ calculators: allCalcs().length, runs, rejectedByValidation: rejected, friendlyErrors: friendly, computed: ok, anomalyKinds: seen.size, anomaliesTotal: open.length, knownDefects: anomalies.length - open.length }, null, 1));
for (const a of seen.values()) console.log(`- [${a.calc}] ${a.issue}   ×${a.count}   e.g. ${a.where}`);
for (const n of notes) console.log(`  note: ${n}`);
process.exitCode = seen.size ? 1 : 0;
