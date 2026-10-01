// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Critic harness: drive every calculator with hostile input, one field at a time, in inch and mm,
// with odd machine profiles. Reports crashes and any NaN / undefined / Infinity that reaches the user.
// Run: node tests/critic/fuzz.mjs

import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw, NUMERIC_KINDS } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const HOSTILE_NUM = ["0", "-1", "-0.5", "1e9", "999999999", "0.000001", "1e-12", "abc", "1/0", "0/0", "", "   ", "NaN", "Infinity", "-Infinity",
  "1 1/4", "3/8", "1,5", "1..2", "--5", "5-", "1/2/3", "٣", "💥", "<img src=x onerror=alert(1)>", "1e400", "0x10", "  7  ", "+5", ".5", "5.", "90", "180", "360", "0.0001", "100000"];
const HOSTILE_TEXT = ["", "   ", "abc", "1/4-20", "1-8", "1 1/8-7", "M0x0", "M10x0", "0-0", "1/0-20", "<script>alert(1)</script>", "💥", "999-999", "-1/4-20", "1/4--20", "m10x1.5x2", "#99-99", "1/4-0", "a".repeat(5000)];
const MACHINES = [null, { id: "a", name: "Zero", maxRpm: 0, maxFeed: 0, units: "in" }, { id: "b", name: "Neg", maxRpm: -5, maxFeed: -5, units: "in" },
  { id: "c", name: "Tiny", maxRpm: 1, maxFeed: 0.001, units: "in" }, { id: "d", name: "Metric", maxRpm: 8000, maxFeed: 10000, units: "mm" }, { id: "e", name: "<b>x</b>", maxRpm: 500, maxFeed: 5, units: "in" }];

const BAD = /\bNaN\b|undefined|Infinity|\[object|null\b/;
const anomalies = [];
let runs = 0, rejected = 0, friendly = 0, ok = 0;

function scan(def, out, where) {
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
  for (const i of issues) anomalies.push({ calc: def.id, where, issue: i });
}

function run(def, raw, units, machine, where) {
  runs++;
  const ctx = { units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt };
  let built;
  try { built = buildValues(def, raw, ctx); }
  catch (e) { anomalies.push({ calc: def.id, where, issue: `buildValues threw ${e.name}: ${e.message}` }); return; }
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
  scan(def, out, where);
}

for (const def of allCalcs()) {
  if (def.view === "chart") {
    for (const units of ["in", "mm"]) { try { const rows = def.rows({ units, L: UNIT_LABEL[units], settings: {} }); if (!rows.length) anomalies.push({ calc: def.id, where: units, issue: "chart has no rows" }); for (const r of rows) for (const v of Object.values(r)) if ((typeof v === "number" && !Number.isFinite(v)) || BAD.test(String(v))) anomalies.push({ calc: def.id, where: units, issue: `chart cell ${v}` }); } catch (e) { anomalies.push({ calc: def.id, where: units, issue: `rows() threw ${e.message}` }); } }
    continue;
  }
  const unitsList = def.units === false ? ["in"] : ["in", "mm"];
  for (const units of unitsList) {
    for (const machine of MACHINES) run(def, defaultRaw(def, {}, units), units, machine, `defaults/${units}/machine=${machine?.name ?? "none"}`);
    // every select/segment option, so each mode's fields get fuzzed too
    const modes = [{}];
    for (const input of def.inputs) {
      if ((input.kind === "select" || input.kind === "segment") && Array.isArray(input.options) && input.options.length <= 8) {
        for (const o of input.options) modes.push({ [input.id]: o.value });
      }
    }
    for (const mode of modes) {
      run(def, defaultRaw(def, mode, units), units, null, `mode ${JSON.stringify(mode)}/${units}`);
      for (const input of def.inputs) {
        const list = NUMERIC_KINDS.has(input.kind) ? HOSTILE_NUM : (input.kind === "text" || input.kind === "textarea") ? HOSTILE_TEXT : ["bogus", ""];
        for (const h of list) run(def, defaultRaw(def, { ...mode, [input.id]: h }, units), units, null, `${JSON.stringify(mode)} ${input.id}=${JSON.stringify(h.length > 40 ? h.slice(0, 40) + "…" : h)} /${units}`);
      }
    }
  }
}

// dedupe by calc + issue text (keep first repro)
const seen = new Map();
for (const a of anomalies) { const k = `${a.calc}|${a.issue.replace(/[-\d.e+]+/g, "#")}`; if (!seen.has(k)) seen.set(k, { ...a, count: 1 }); else seen.get(k).count++; }
console.log(JSON.stringify({ calculators: allCalcs().length, runs, rejectedByValidation: rejected, friendlyErrors: friendly, computed: ok, anomalyKinds: seen.size, anomaliesTotal: anomalies.length }, null, 1));
for (const a of seen.values()) console.log(`- [${a.calc}] ${a.issue}   ×${a.count}   e.g. ${a.where}`);
process.exitCode = seen.size ? 1 : 0;
