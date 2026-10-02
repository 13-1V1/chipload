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
import { DRILL_CHART_INCH, DRILL_CHART_MM } from "../../src/data/drills.js";

// Every expected number below is typed in from a published source named next to it. Nothing is compared
// against the app's own tables: a wrong table must fail here.

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
  ["1/4-20UNC", 0.25, 20], ["1/4-20 UNC-2A-LH", 0.25, 20], ["#10-32UNF", 0.19, 32], // series, class and left-hand run on, as an ASME B1.1 thread designation writes them
];
for (const [text, major, tpi] of callouts) {
  const t = parseThreadSpec(text);
  check(t && t.system === "un" && Math.abs(t.major - major) < 1e-9 && Math.abs(t.tpi - tpi) < 1e-9, `thread "${text}" → ${t ? `${t.major} / ${t.tpi} TPI` : "not recognized"} (want ${major} / ${tpi})`);
}
const metricCallouts = [["M6", 6, 1], ["M6x1", 6, 1], ["M6X1.0", 6, 1], ["m10x1.5", 10, 1.5], ["M10-1.5", 10, 1.5], ["M8 x 1.25", 8, 1.25], ["M12x1.75-6H", 12, 1.75], ["M3", 3, 0.5], ["M2.5", 2.5, 0.45], ["M10 × 1.25", 10, 1.25], ["M10x1.5-6H-LH", 10, 1.5]]; // coarse pitches per ISO 261
for (const [text, major, pitch] of metricCallouts) {
  const t = parseThreadSpec(text);
  check(t && t.system === "metric" && Math.abs(t.major - major) < 1e-9 && Math.abs(t.pitch - pitch) < 1e-9, `thread "${text}" → ${t ? `M${t.major} × ${t.pitch}` : "not recognized"} (want M${major} × ${pitch})`);
}

// ── 2. Tap drills at 75% vs published charts, typed in here — never read back from the app's own tables ──
// Drill picks: the ANSI tap drill chart as Machinery's Handbook prints it ("Tap Drill Sizes"), drill decimals per
// ASME B94.11M; the UNEF rows #12-32 to 1-20 as the same chart prints them. 3-56 lists #46, some charts #45.
const PUBLISHED_UN = [ // [thread, drill(s), decimal of the first; 32nds exact, the app rounds them to 4 places]
  ["0-80", ['3/64"'], 0.0469], ["1-64", ["#53"], 0.0595], ["1-72", ["#53"], 0.0595], ["2-56", ["#50"], 0.0700], ["2-64", ["#50"], 0.0700],
  ["3-48", ["#47"], 0.0785], ["3-56", ["#46", "#45"], 0.0810], ["4-40", ["#43"], 0.0890], ["4-48", ["#42"], 0.0935], ["5-40", ["#38"], 0.1015],
  ["5-44", ["#37"], 0.1040], ["6-32", ["#36"], 0.1065], ["6-40", ["#33"], 0.1130], ["8-32", ["#29"], 0.1360], ["8-36", ["#29"], 0.1360],
  ["10-24", ["#25"], 0.1495], ["10-32", ["#21"], 0.1590], ["12-24", ["#16"], 0.1770], ["12-28", ["#14"], 0.1820], ["1/4-20", ["#7"], 0.2010],
  ["1/4-28", ["#3"], 0.2130], ["5/16-18", ["F"], 0.2570], ["5/16-24", ["I"], 0.2720], ["3/8-16", ['5/16"'], 0.3125], ["3/8-24", ["Q"], 0.3320],
  ["7/16-14", ["U"], 0.3680], ["7/16-20", ['25/64"'], 0.3906], ["1/2-13", ['27/64"'], 0.4219], ["1/2-20", ['29/64"'], 0.4531],
  ["9/16-12", ['31/64"'], 0.4844], ["9/16-18", ['33/64"'], 0.5156], ["5/8-11", ['17/32"'], 0.53125], ["5/8-18", ['37/64"'], 0.5781],
  ["3/4-10", ['21/32"'], 0.65625], ["3/4-16", ['11/16"'], 0.6875], ["7/8-9", ['49/64"'], 0.7656], ["7/8-14", ['13/16"'], 0.8125],
  ["1-8", ['7/8"'], 0.875], ["1-12", ['59/64"'], 0.9219], ["1-14", ['15/16"'], 0.9375], ["1 1/8-7", ['63/64"'], 0.9844], ["1 1/8-12", ['1-3/64"'], 1.0469],
  ["1 1/4-7", ['1-7/64"'], 1.1094], ["1 1/4-12", ['1-11/64"'], 1.1719], ["1 3/8-6", ['1-7/32"'], 1.21875], ["1 3/8-12", ['1-19/64"'], 1.2969],
  ["1 1/2-6", ['1-11/32"'], 1.3438], ["1 1/2-12", ['1-27/64"'], 1.4219], ["1 3/4-5", ['1-9/16"'], 1.5625], ["2-4.5", ['1-25/32"'], 1.78125],
  ["12-32", ["#13"], 0.1850], ["1/4-32", ['7/32"'], 0.2188], ["5/16-32", ['9/32"'], 0.28125], ["3/8-32", ['11/32"'], 0.3438], ["1/2-28", ['15/32"'], 0.4688],
  ["9/16-24", ['33/64"'], 0.5156], ["5/8-24", ['37/64"'], 0.5781], ["11/16-24", ['41/64"'], 0.6406], ["3/4-20", ['45/64"'], 0.7031],
  ["13/16-20", ['49/64"'], 0.7656], ["7/8-20", ['53/64"'], 0.8281], ["15/16-20", ['57/64"'], 0.8906], ["1-20", ['61/64"'], 0.9531],
];
const unquote = (s) => String(s).replace(/"/g, "");
const unWrong = [];
for (const [spec, drills, dec] of PUBLISHED_UN) {
  let o; try { o = calc("tap-drill", { thread: spec }); } catch (e) { unWrong.push(`${spec}: ${e.message}`); continue; }
  const got = parseFloat(String(o.primary.unit).replace(/[^\d.]/g, ""));
  if (!drills.map(unquote).includes(unquote(o.primary.text)) || (unquote(o.primary.text) === unquote(drills[0]) && Math.abs(got - dec) > 0.00006)) unWrong.push(`${spec}: ${o.primary.text} ${o.primary.unit}, chart ${drills.join(" or ")} (${dec})`);
}
check(unWrong.length === 0, `tap drill gives the published chart drill for all ${PUBLISHED_UN.length} UN threads checked — ${unWrong.length} differ: ${unWrong.join("; ") || "none"}`);
// ISO 2306 / DIN 336: coarse pitch drill = D − P; the fine pitches as DIN 336 lists them (M10x1.25 8.8, M12x1.25 10.8).
const PUBLISHED_METRIC = [
  ["M1", 0.75], ["M1.2", 0.95], ["M1.4", 1.1], ["M1.6", 1.25], ["M1.8", 1.45], ["M2", 1.6], ["M2.5", 2.05], ["M3", 2.5], ["M3.5", 2.9], ["M4", 3.3],
  ["M5", 4.2], ["M6", 5], ["M7", 6], ["M8", 6.8], ["M10", 8.5], ["M12", 10.2], ["M14", 12], ["M16", 14], ["M18", 15.5], ["M20", 17.5], ["M22", 19.5],
  ["M24", 21], ["M27", 24], ["M30", 26.5], ["M33", 29.5], ["M36", 32], ["M39", 35], ["M42", 37.5], ["M45", 40.5], ["M48", 43], ["M52", 47],
  ["M56", 50.5], ["M60", 54.5], ["M64", 58],
  ["M8x1", 7], ["M10x1.25", 8.8], ["M10x1", 9], ["M12x1.5", 10.5], ["M12x1.25", 10.8], ["M14x1.5", 12.5], ["M16x1.5", 14.5], ["M18x1.5", 16.5],
  ["M20x1.5", 18.5], ["M20x2", 18], ["M22x1.5", 20.5], ["M24x2", 22],
];
const mWrong = [];
for (const [spec, want] of PUBLISHED_METRIC) {
  let o; try { o = calc("tap-drill", { thread: spec }); } catch (e) { mWrong.push(`${spec}: ${e.message}`); continue; }
  if (Math.abs(parseFloat(o.primary.text) - want) > 0.001) mWrong.push(`${spec}: ${o.primary.text}, chart ${want} mm`);
}
check(mWrong.length === 0, `tap drill gives the ISO 2306 / DIN 336 drill for all ${PUBLISHED_METRIC.length} metric threads checked — ${mWrong.length} differ: ${mWrong.join("; ") || "none"}`);

// % of thread a drill gives: theoretical %, Harvey Tool "Tap Drill & Thread Height Chart"
// (= TPI × (D − drill) ÷ 0.01299, Machinery's Handbook). Shown three places: the calc's "Drill gives", the tap drill
// chart's % column, and the calc's "Chart drill (75%)" line at any other %.
const HARVEY_PCT = [["0-80", 80.7], ["4-40", 70.8], ["4-48", 68.4], ["5-44", 71.1], ["8-32", 69.0], ["8-36", 77.6], ["10-24", 74.8], ["10-32", 76.4],
  ["12-24", 72.1], ["12-28", 73.3], ["5/16-24", 74.8], ["7/16-20", 72.2], ["5/8-11", 79.4]];
const chartRows = allCalcs().find((d) => d.id === "tap-drill-chart").rows(ctx());
const pctWrong = [];
for (const [spec, want] of HARVEY_PCT) {
  const gives = calc("tap-drill", { thread: spec }).stats.find((s) => s.label === "Drill gives")?.value;
  if (!(Math.abs(gives - want) < 0.15)) pctWrong.push(`${spec} calc ${fmt(gives, 1)}%`);
  const row = chartRows.find((r) => r.thread.replace(/^#/, "").replace(/ UN.*$/, "") === spec);
  if (!row || row.pct !== Math.round(want)) pctWrong.push(`${spec} chart ${row ? row.pct : "missing"}%`);
}
check(pctWrong.length === 0, `% thread matches Harvey Tool's chart for ${HARVEY_PCT.length} threads, in the calc and on the chart — off: ${pctWrong.join("; ") || "none"}`);
{ // the same drill can't read two numbers: 10-32 at 70% still names #21 at 76% (Harvey 76.4), not 83
  const line = calc("tap-drill", { thread: "10-32", percent: "70" }).stats.find((s) => /^Chart drill/.test(s.label))?.text ?? "";
  check(/#21 \(76%\)/.test(line), `10-32 at 70%: chart drill line reads "#21 (76%)" — got "${line}"`);
  // ISO metric: drill = D − P is 76.98 ≈ 77% of the 60° thread at every size, M1 to M2.5 included
  const tiny = ["M1x0.25", "M1.2x0.25", "M1.4x0.3", "M1.6x0.35", "M1.8x0.35", "M2x0.4", "M2.5x0.45"].map((n) => [n, chartRows.find((r) => r.thread === n)?.pct]);
  check(tiny.every(([, p]) => p === 77), `metric D − P drills read 77% on the chart, M1 to M2.5 — got ${tiny.map(([n, p]) => `${n} ${p}`).join(", ")}`);
}

// ── 3. UN class limits vs ASME B1.1-2003 Table 2 (inches), as typed from the standard ──
const asme = [ // [thread, major, tpi, 2A PD max, 2A PD min, 2B PD max]
  ["#10-32", 0.19, 32, 0.1688, 0.1658, 0.1736], ["1/4-20", 0.25, 20, 0.2164, 0.2127, 0.2224], ["5/16-18", 0.3125, 18, 0.2752, 0.2712, 0.2817],
  ["3/8-16", 0.375, 16, 0.3331, 0.3287, 0.3401], ["1/2-13", 0.5, 13, 0.4485, 0.4435, 0.4565], ["3/4-10", 0.75, 10, 0.6832, 0.6773, 0.6927], ["1-8", 1.0, 8, 0.9168, 0.9101, 0.9276], // 0.9100 is the pre-2003 Table E-1 value
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
  check(Math.abs(e["2B"].minorMax - 0.207) < 0.000005, `1/4-20 2B minor max 0.207 (got ${e["2B"].minorMax.toFixed(4)})`);
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

// ── 6. Big threads: the drill has to exist in the chart (Machinery's Handbook tap drills; metric D − P per ISO 2306) ──
for (const [spec, want] of [["1 1/4-7", 1.1094], ["1 1/2-6", 1.3438], ["1 3/8-12", 1.2969]]) {
  let o; try { o = calc("tap-drill", { thread: spec }); } catch (e) { o = e; }
  const got = o instanceof Error ? NaN : parseFloat(String(o.primary.unit).replace(/[^\d.]/g, ""));
  check(Math.abs(got - want) < 0.005, `tap drill for ${spec} ≈ ${want} — ${o instanceof Error ? o.message : `${o.primary.text} ${o.primary.unit}`}`);
}
for (const [spec, want] of [["M30x3.5", 26.5], ["M36x4", 32], ["M48x5", 43]]) {
  const o = calc("tap-drill", { thread: spec });
  check(Math.abs(parseFloat(o.primary.text) - want) < 0.26, `tap drill for ${spec} ≈ ${want} mm — got ${o.primary.text}`);
}

// ── 7. Drill chart completeness: the full number (1–80), letter (A–Z) and 64th series ──
const labels = new Set(DRILL_CHART_INCH.map((d) => d[1].replace(/ \(E\)/, "")));
const missing = [];
for (let n = 1; n <= 80; n++) if (!labels.has(`#${n}`)) missing.push(`#${n}`);
for (const L of "ABCDFGHIJKLMNOPQRSTUVWXYZ") if (!labels.has(L)) missing.push(L);
if (![...labels].some((l) => /E\b|1\/4"/.test(l))) missing.push("E");
for (let n = 1; n <= 64; n++) { const size = n / 64; if (!DRILL_CHART_INCH.some((d) => Math.abs(d[0] - size) < 1e-6)) missing.push(`${n}/64`); }
check(missing.length === 0, `inch drill chart has every number, letter, and 64th to 1" — missing: ${missing.join(", ") || "none"}`);
{ // number and letter drill decimals, ASME B94.11M (twist drill sizes)
  const B94 = [["#80", 0.0135], ["#70", 0.028], ["#60", 0.040], ["#53", 0.0595], ["#50", 0.070], ["#43", 0.089], ["#36", 0.1065], ["#29", 0.136], ["#25", 0.1495],
    ["#21", 0.159], ["#16", 0.177], ["#7", 0.201], ["#3", 0.213], ["#1", 0.228], ["A", 0.234], ["F", 0.257], ["I", 0.272], ["Q", 0.332], ["U", 0.368], ["Z", 0.413]];
  const off = B94.filter(([label, dec]) => { const d = DRILL_CHART_INCH.find((x) => x[1].replace(/ \(E\)/, "") === label); return !d || Math.abs(d[0] - dec) > 0.00005; });
  check(off.length === 0, `number and letter drills match ASME B94.11M decimals (${B94.length} checked) — off: ${off.map(([l, d]) => `${l} want ${d}`).join(", ") || "none"}`);
}
check(Math.max(...DRILL_CHART_INCH.map((d) => d[0])) >= 1.5, `inch drill chart reaches 1-1/2" for large tap drills — max is ${Math.max(...DRILL_CHART_INCH.map((d) => d[0]))}`);
check(Math.max(...DRILL_CHART_MM) >= 58, `metric drill chart reaches 58 mm (M64 tap drill) — max is ${Math.max(...DRILL_CHART_MM)}`);

// ── 8. Spot values a machinist knows by heart (each worked by hand from the textbook formula) ──
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
{ // ISO 286 fits against the ISO 286-2 tables (µm), typed in, including the bearing-housing holes K7 / N7 / P7
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
