// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Critic harness: the checks a working machinist would make. Prints PASS/FAIL lines with numbers.
// Run: node tests/critic/domain.mjs

import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt, parseFraction, parseDimension } from "../../src/core/format.js";
import { featureLimits } from "../../src/core/inspect.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { parseThreadSpec, unToleranceEnvelope } from "../../src/core/thread.js";
import { UN_THREAD_TABLE, TAP_DRILL_UN_TABLE } from "../../src/data/threads-un.js";
import { METRIC_THREAD_TABLE, TAP_DRILL_METRIC_TABLE } from "../../src/data/threads-metric.js";
import { DRILL_CHART_INCH, DRILL_CHART_MM } from "../../src/data/drills.js";

let pass = 0, fail = 0;
const out = [];
const check = (ok, msg) => { ok ? pass++ : fail++; out.push(`${ok ? "PASS" : "FAIL"}  ${msg}`); };
const ctx = (units = "in", machine = null) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine, fmt });
const calc = (id, over = {}, units = "in", machine = null) => { const def = allCalcs().find((d) => d.id === id); const c = ctx(units, machine); return def.compute(buildValues(def, defaultRaw(def, over, units), c).values, c); };

// ── 1. Thread callouts the way they're written on prints ──
const callouts = [
  ["1/4-20", 0.25, 20], ["1/4-20 UNC", 0.25, 20], ["#10-32", 0.19, 32], ["10-32", 0.19, 32], ["#0-80", 0.06, 80], ["0-80", 0.06, 80],
  ["1-8", 1.0, 8], ["1-12", 1.0, 12], ["1-14", 1.0, 14], ["1\"-8", 1.0, 8], ["2-4.5", 2.0, 4.5], ["2-56", 0.086, 56], ["4-40", 0.112, 40],
  ["1 1/8-7", 1.125, 7], ["1-1/8-7", 1.125, 7], ["1-1/4-7", 1.25, 7], ["1 1/2-6", 1.5, 6], ["1.125-7", 1.125, 7], [".250-20", 0.25, 20], ["0.250-20", 0.25, 20],
  ["1/4\"-20", 0.25, 20], ["1/4 - 20", 0.25, 20], ["1/4x20", 0.25, 20], ["3/8-16 UNC-2B", 0.375, 16], ["1/2-13 unc", 0.5, 13],
];
for (const [text, major, tpi] of callouts) {
  const t = parseThreadSpec(text);
  check(t && t.system === "un" && Math.abs(t.major - major) < 1e-9 && Math.abs(t.tpi - tpi) < 1e-9, `thread "${text}" → ${t ? `${t.major} / ${t.tpi} TPI` : "not recognized"} (want ${major} / ${tpi})`);
}
const metricCallouts = [["M6", 6, 1], ["M6x1", 6, 1], ["M6X1.0", 6, 1], ["m10x1.5", 10, 1.5], ["M10-1.5", 10, 1.5], ["M8 x 1.25", 8, 1.25], ["M12x1.75-6H", 12, 1.75], ["M3", 3, 0.5], ["M2.5", 2.5, 0.45], ["M10 × 1.25", 10, 1.25]];
for (const [text, major, pitch] of metricCallouts) {
  const t = parseThreadSpec(text);
  check(t && t.system === "metric" && Math.abs(t.major - major) < 1e-9 && Math.abs(t.pitch - pitch) < 1e-9, `thread "${text}" → ${t ? `M${t.major} × ${t.pitch}` : "not recognized"} (want M${major} × ${pitch})`);
}

// ── 2. Tap drill calculator vs the published chart, every listed thread, 75% cutting tap ──
let unMismatch = [];
for (const [major, tpi, name] of UN_THREAD_TABLE) {
  const chart = TAP_DRILL_UN_TABLE[`${major.toFixed(4)}|${tpi}`];
  const spec = name.replace(/ UN.*$/, "");
  let o; try { o = calc("tap-drill", { thread: spec }); } catch (e) { unMismatch.push(`${name}: ${e.message}`); continue; }
  const picked = o.primary.text;
  if (chart && picked.replace(/"/g, "") !== chart[1].replace(/"/g, "")) unMismatch.push(`${name}: calc ${picked}, chart ${chart[1]}`);
}
check(unMismatch.length === 0, `tap drill calc agrees with the chart for all ${UN_THREAD_TABLE.length} UN threads — ${unMismatch.length} differ: ${unMismatch.join("; ") || "none"}`);
let mMismatch = [];
for (const [major, pitch, name] of METRIC_THREAD_TABLE) {
  const chart = TAP_DRILL_METRIC_TABLE[`${major.toFixed(1)}|${pitch.toFixed(2)}`];
  let o; try { o = calc("tap-drill", { thread: `M${major}x${pitch}` }); } catch (e) { mMismatch.push(`${name}: ${e.message}`); continue; }
  const picked = parseFloat(o.primary.text);
  if (chart && Math.abs(picked - chart[0]) > 0.051) mMismatch.push(`${name}: calc ${o.primary.text}, chart ${chart[1]}`);
}
check(mMismatch.length === 0, `tap drill calc agrees with the chart for all ${METRIC_THREAD_TABLE.length} metric threads — ${mMismatch.length} differ: ${mMismatch.join("; ") || "none"}`);

// ── 3. UN class limits vs ASME B1.1 tables (inches) ──
const asme = [ // [thread, major, tpi, 2A PD max, 2A PD min, 2B PD max]
  ["#10-32", 0.19, 32, 0.1688, 0.1658, 0.1736], ["1/4-20", 0.25, 20, 0.2164, 0.2127, 0.2224], ["5/16-18", 0.3125, 18, 0.2752, 0.2712, 0.2817],
  ["3/8-16", 0.375, 16, 0.3331, 0.3287, 0.3401], ["1/2-13", 0.5, 13, 0.4485, 0.4435, 0.4565], ["3/4-10", 0.75, 10, 0.6832, 0.6773, 0.6927], ["1-8", 1.0, 8, 0.9168, 0.9100, 0.9276],
];
let worst = 0;
for (const [name, major, tpi, aMax, aMin, bMax] of asme) {
  const e = unToleranceEnvelope({ major, pitch: 1 / tpi });
  const d = Math.max(Math.abs(e["2A"].pdMax - aMax), Math.abs(e["2A"].pdMin - aMin), Math.abs(e["2B"].pdMax - bMax));
  worst = Math.max(worst, d);
  check(d < 0.00006, `${name} class limits match ASME B1.1 to the fourth place (max error ${d.toFixed(5)}): 2A ${e["2A"].pdMin.toFixed(4)}–${e["2A"].pdMax.toFixed(4)} vs ${aMin}–${aMax}; 2B max ${e["2B"].pdMax.toFixed(4)} vs ${bMax}`);
}
{ // class 3 and the diameters an inspector also checks: 1/4-20 3A major min 0.2419, 3B minor max 0.2067, 2B minor max 0.207
  const e = unToleranceEnvelope({ major: 0.25, pitch: 1 / 20 });
  check(Math.abs(e["3A"].majorMin - 0.2419) < 0.00006, `1/4-20 3A major min 0.2419 (got ${e["3A"].majorMin.toFixed(4)})`);
  check(Math.abs(e["3B"].minorMax - 0.2067) < 0.00006, `1/4-20 3B minor max 0.2067 (got ${e["3B"].minorMax.toFixed(4)})`);
  check(Math.abs(e["2B"].minorMax - 0.207) < 0.0006, `1/4-20 2B minor max 0.207 (got ${e["2B"].minorMax.toFixed(4)})`);
}

// ── 4. G-code: every coordinate word must carry a decimal point (Fanuc reads X1 as 0.0001) ──
const g = calc("bolt-circle", { diameter: "2", holes: "4", gcode: "peck", z: "-0.5", r: "0.1", feed: "5", peck: "0.1" });
const code = g.code[0].text;
const bare = [...code.matchAll(/\b([XYZRQF])(-?\d+)(?![\d.])/g)].map((m) => m[0]);
check(bare.length === 0, `bolt-circle G-code has a decimal point on every X/Y/Z/R/Q/F word — bare integers found: ${[...new Set(bare)].join(" ") || "none"}`);
const posZ = calc("bolt-circle", { gcode: "drill", z: "0.5", r: "0.1" });
check(posZ.code.length === 0 && posZ.warnings.some((w) => /R plane/.test(w)), `bolt-circle refuses a drill cycle whose Z (0.5) is above the R plane (0.1) — ${posZ.code.length ? "generated: " + posZ.code[0].text.split(String.fromCharCode(10)).find((l) => /G81/.test(l)) : "refused: " + posZ.warnings.join(" | ")}`);
const lowSafe = calc("bolt-circle", { gcode: "drill", z: "-0.5", r: "0.1", safeZ: "0.05" });
check(lowSafe.code.length === 0 && lowSafe.warnings.some((w) => /Safe Z/.test(w)), `bolt-circle refuses a safe Z (0.05) below the R plane (0.1) — ${lowSafe.warnings.join(" | ") || "silent"}`);
const goodCycle = calc("bolt-circle", { gcode: "drill", z: "-0.5", r: "0.1", safeZ: "1" });
check(goodCycle.code.length === 1 && goodCycle.warnings.length === 0, `a correct drill cycle still posts (${goodCycle.code.length} block, ${goodCycle.warnings.length} warnings)`);
const lathe = calc("tnr-comp", {});
const latheBare = lathe.code.flatMap((b) => [...b.text.matchAll(/\b([XZRF])(-?\d+)(?![\d.])/g)].map((m) => m[0]));
check(latheBare.length === 0, `lathe G-code snippets have decimal points — bare integers: ${[...new Set(latheBare)].join(" ") || "none"}`);

// ── 5. Speeds & feeds sanity ──
const tiny = calc("feeds-mill", { diameter: "0.125", material: "al6061" });
const tinyRpm = tiny.stats[0].value;
check(tinyRpm < 25000 || (tiny.warnings || []).length > 0, `1/8" end mill in 6061 with no machine set: ${fmt(tinyRpm, 0)} RPM — ${tiny.warnings.length ? "warned: " + tiny.warnings[0].slice(0, 70) : "no warning that this exceeds most spindles"}`);
const slot = calc("feeds-mill", { diameter: "0.5", woc: "0.5" });
check((slot.warnings || []).some((w) => /slot|full/i.test(w)), `full-width slot (WOC = D) gets a caution — ${slot.warnings.join(" | ") || "silent"}`);
const dAl = calc("feeds-drill", { diameter: "0.25", material: "al6061" }), dInc = calc("feeds-drill", { diameter: "0.25", material: "ni718" });
const iprAl = dAl.stats.find((s) => /Feed per rev/.test(s.label)).value, iprInc = dInc.stats.find((s) => /Feed per rev/.test(s.label)).value;
check(iprInc < iprAl * 0.8, `drill feed/rev backs off for Inconel 718 vs 6061 (${iprInc} vs ${iprAl} IPR)`);
const deep = calc("feeds-drill", { diameter: "0.25", depth: "2" });
check((deep.warnings || []).some((w) => /peck/i.test(w)), `8×D deep hole suggests pecking — ${deep.warnings.join(" | ") || "silent"}`);

// ── 6. Big threads: the drill has to exist in the chart ──
for (const [spec, want] of [["1 1/4-7", 1.1094], ["1 1/2-6", 1.3438], ["1 3/8-12", 1.2969]]) {
  let o; try { o = calc("tap-drill", { thread: spec }); } catch (e) { o = e; }
  const got = o instanceof Error ? NaN : parseFloat(String(o.primary.unit).replace(/[^\d.]/g, ""));
  check(Math.abs(got - want) < 0.005, `tap drill for ${spec} ≈ ${want} — ${o instanceof Error ? o.message : `${o.primary.text} ${o.primary.unit}`}`);
}
for (const [spec, want] of [["M30x3.5", 26.5], ["M36x4", 32], ["M48x5", 43]]) {
  const o = calc("tap-drill", { thread: spec });
  check(Math.abs(parseFloat(o.primary.text) - want) < 0.26, `tap drill for ${spec} ≈ ${want} mm — got ${o.primary.text}`);
}

// ── 7. Drill chart completeness ──
const labels = new Set(DRILL_CHART_INCH.map((d) => d[1].replace(/ \(E\)/, "")));
const missing = [];
for (let n = 1; n <= 80; n++) if (!labels.has(`#${n}`)) missing.push(`#${n}`);
for (const L of "ABCDFGHIJKLMNOPQRSTUVWXYZ") if (!labels.has(L)) missing.push(L);
if (![...labels].some((l) => /E\b|1\/4"/.test(l))) missing.push("E");
for (let n = 1; n <= 64; n++) { const size = n / 64; if (!DRILL_CHART_INCH.some((d) => Math.abs(d[0] - size) < 1e-6)) missing.push(`${n}/64`); }
check(missing.length === 0, `inch drill chart has every number, letter, and 64th to 1" — missing: ${missing.join(", ") || "none"}`);
check(Math.max(...DRILL_CHART_INCH.map((d) => d[0])) >= 1.5, `inch drill chart reaches 1-1/2" for large tap drills — max is ${Math.max(...DRILL_CHART_INCH.map((d) => d[0]))}`);
check(Math.max(...DRILL_CHART_MM) >= 58, `metric drill chart reaches 58 mm (M64 tap drill) — max is ${Math.max(...DRILL_CHART_MM)}`);

// ── 8. Spot values a machinist knows by heart ──
check(calc("tap-drill", { thread: "1/4-20" }).primary.text === "#7", `1/4-20 → #7`);
check(calc("tap-drill", { thread: "10-32" }).primary.text === "#21", `10-32 → #21`);
check(calc("tap-drill", { thread: "M6" }).primary.text === "5 mm", `M6 → 5 mm (got ${calc("tap-drill", { thread: "M6" }).primary.text})`);
check(Math.abs(calc("material-weight", { shape: "round", material: "s1018", d: "1", len: "12" }).primary.value - 2.676) < 0.01, `1" steel round × 12" weighs 2.68 lb (got ${fmt(calc("material-weight", { shape: "round", material: "s1018", d: "1", len: "12" }).primary.value, 3)})`);
check(Math.abs(calc("sine-bar", { bar: "5", angle: "30" }).primary.value - 2.5) < 1e-9, `5" sine bar at 30° → 2.5000`);
check(Math.abs(calc("drill-point", { diameter: "0.5", angle: "118", depth: "1" }).stats[0].value - 0.1502) < 0.0005, `1/2" 118° point length 0.150`);
check(Math.abs(calc("surface-finish", { ipr: "0.005", nose: "0.0312" }).primary.value - 25.7) < 0.5, `0.005 ipr, 1/32 nose → ~26 µin Ra (got ${fmt(calc("surface-finish", { ipr: "0.005", nose: "0.0312" }).primary.value, 1)})`);
check(Math.abs(calc("feeds-mill", { diameter: "0.5", material: "s1018", toolType: "hss", sfm: "100" }).stats[0].value - 764) < 1, `1/2" at 100 SFM → 764 RPM`);
const mm = calc("feeds-mill", { diameter: "12.7", material: "s1018", toolType: "hss", sfm: "30.48" }, "mm");
check(Math.abs(mm.stats[0].value - 764) < 1, `same cut in metric (12.7 mm, 30.48 m/min) → 764 RPM (got ${fmt(mm.stats[0].value, 0)})`);

// ── 9. What a second pass with the machinist hat on turned up ──
{ // ISO 286 fits against the published tables (µm), including the bearing-housing holes K7 / N7 / P7
  const um = (x) => Math.round(x * 1e4) / 10;
  for (const [d, spec, upper, lower] of [[25, "H7", 21, 0], [25, "g6", -7, -20], [25, "p6", 35, 22], [25, "K7", 6, -15], [25, "N7", -7, -28], [25, "P7", -14, -35], [25, "c11", -110, -240], [50, "s6", 59, 43], [25, "u6", 61, 48], [20, "x6", 67, 54], [20, "z6", 86, 73], [100, "H7", 35, 0]]) {
    const f = featureLimits(d, spec);
    check(um(f.upper) === upper && um(f.lower) === lower, `${d} mm ${spec} = ${upper > 0 ? "+" : ""}${upper} / ${lower > 0 ? "+" : ""}${lower} µm (got ${um(f.upper)} / ${um(f.lower)})`);
  }
}
{ // the drill program, read line by line the way a setup man would
  const text = calc("bolt-circle", { gcode: "drill", holes: "4", diameter: "2", tool: "3" }).code[0].text;
  const lines = text.split("\n"), at = (re) => lines.findIndex((l) => re.test(l));
  check(at(/G49/) >= 0 && at(/G49/) < at(/^T3 M6$/) && at(/^T3 M6$/) < at(/^G43 H3 Z/), "G49 safety line comes before the tool call, G43 after it — the length offset is never cancelled");
  check(lines.slice(at(/^G43/) + 1, at(/^G81/)).every((l) => !/Z/.test(l)), "no Z move between G43 and G81: G98 lifts to Safe Z between holes, not to R");
  check(lines.filter((l) => l.startsWith("(")).every((l) => /^\([A-Z0-9 .\-/]+\)$/.test(l)), "comments are capitals, digits and . - / only");
  check(!/ADD YOUR/.test(text), "no 'add your G43 here' comment sitting above a G49");
  const pos = calc("bolt-circle", { gcode: "positions", holes: "4", diameter: "2" }).code[0].text.split("\n");
  check(pos.every((l) => l.startsWith("(") || !/Z/.test(l)) && pos.filter((l) => l === "M0").length === 4, "positions program never moves Z and stops at each of the 4 holes");
  const rows = calc("bolt-circle", { holes: "4", diameter: "2" }).tables[0].rows;
  check(rows.every((r) => fmt(r.x, 4) !== "-0" && fmt(r.y, 4) !== "-0"), "4 holes on the axes: the table shows 0, never -0");
  const okuma = calc("bolt-circle", { gcode: "drill" }, "in", { id: "m", name: "LB", maxRpm: 4000, maxFeed: 300, controller: "okuma", units: "in" });
  check(!/G\d/.test(okuma.code[0].text) && /Okuma/.test(okuma.warnings.join(" ")), "an Okuma (not Fanuc-style) gets bare X Y positions and a reason, not G54 / G43 / G81");
}
{ // numbers the way they get typed
  check(parseFraction("1,200") === 1200 && parseFraction("0,5") === 0.5, `"1,200" is twelve hundred and "0,5" is a half (got ${parseFraction("1,200")}, ${parseFraction("0,5")})`);
  check(Math.abs(parseDimension("10mm", "in") - 10 / 25.4) < 1e-12 && Math.abs(parseDimension("0.5in", "mm") - 12.7) < 1e-12, `"10mm" and "0.5in" read with the unit tight against the number`);
}
{ // a metric shop's first look
  const metric = calc("feeds-mill", {}, "mm");
  check(metric.stats[0].value > 500 && metric.stats[0].value < 30000 && metric.warnings.length === 0, `metric default end mill is a real cut (${fmt(metric.stats[0].value, 0)} RPM, no warnings)`);
  const tri = calc("right-triangle", { mode: "hypAngle", a: "127", b: "30" }, "mm");
  check(Math.abs(tri.stats[1].value - 63.5) < 1e-9, `right triangle in mm: hypotenuse 127 at 30° → rise 63.5 (got ${fmt(tri.stats[1].value, 3)})`);
  const taper = calc("taper", { large: "25", small: "20", length: "100" }, "mm");
  check(taper.stats[1].text === "1 : 20", `metric taper reads as a ratio: 1 : 20 (got ${taper.stats[1].text})`);
}

console.log(out.join("\n"));
console.log(`\n${pass} pass, ${fail} fail`);
process.exitCode = fail ? 1 : 0;
