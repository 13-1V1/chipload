// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread tools, fix round 3: the mm screen on Thread data and ACME, the drill-chart ends, the chart drill's
// over-85% advice, STI chart keys, the finest-pitch ISO internal classes, and B1.1 Table 1 series names.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";

// the context render.js builds: a units:false tool runs in its own unit, the app's setting rides in settings.units
const run = (id, over = {}, units = "in") => {
  const def = allCalcs().find((d) => d.id === id);
  const own = def.units === false ? "in" : units;
  const c = { units: own, L: UNIT_LABEL[own], settings: { units, pro: true }, machine: null, fmt };
  const built = buildValues(def, defaultRaw(def, over, own), c);
  return def.compute(built.values, c);
};
const stat = (out, label) => out.stats.find((s) => s.label === label);
/** Every line a person reads, numbers formatted the way the screen does. */
const readable = (out) => [
  `${out.primary.label} ${out.primary.text ?? fmt(out.primary.value, out.primary.places)} ${out.primary.unit ?? ""}`,
  ...out.stats.map((s) => `${s.label}: ${s.text ?? fmt(s.value, s.places)} ${s.unit ?? ""}`),
  ...(out.warnings || []), ...(out.notes || []), ...(out.explain || []).map((e) => `${e.formula} ${e.plugged}`),
  ...(out.tables || []).flatMap((t) => [...t.columns.map((c) => c.label), ...t.rows.map((r) => Object.values(r).join(" "))]),
];

// Project metric rule, and the round-1 rule Tap drill and STI follow: on a mm screen an inch thread's lengths read in mm.
// 1/4-20 UNC basic PD 0.2175 in = 5.525 mm; #7 = 0.2010 in = 5.105 mm (ASME B94.11M); 1/2-10 Acme PD 0.45 in = 11.43 mm.
test("thread data and ACME read an inch thread in mm when the app is set to mm", () => {
  const td = run("thread-data", { thread: "1/4-20" }, "mm");
  assert.equal(td.primary.unit, "mm");
  assert.equal(fmt(td.primary.value, td.primary.places), "5.525");
  assert.equal(stat(td, "Major diameter").unit, "mm");
  assert.equal(stat(td, "Pitch").unit, "mm");
  assert.equal(stat(td, "Threads per inch").value, 20, "TPI stays TPI");
  assert.equal(stat(td, "Tap drill (75%)").text, "#7 (5.105 mm) · 75%");
  assert.ok(td.notes.some((n) => /specified in inches/.test(n)));
  assert.match(td.tables[0].columns[1].label, /mm/);
  for (const line of readable(td)) assert.doesNotMatch(line, /\d in\b/, line);
  // 2A PD 0.2127–0.2164 in → 5.403–5.496 mm, rounded inward
  const a2 = td.tables[0].rows[0];
  assert.equal(fmt(a2.pdMin, 3), "5.403"); assert.equal(fmt(a2.pdMax, 3), "5.496");
  // inch screen unchanged
  const tdIn = run("thread-data", { thread: "1/4-20" }, "in");
  assert.equal(tdIn.primary.unit, "in");
  assert.equal(stat(tdIn, "Tap drill (75%)").text, "#7 · 75%");

  const ac = run("acme", { thread: "1/2-10" }, "mm");
  assert.equal(ac.primary.unit, "mm");
  near(ac.primary.value, 11.43, 1e-9);
  near(stat(ac, "External PD max (2G)").value, (0.45 - 0.008 * Math.sqrt(0.5)) * 25.4, 1e-9);
  for (const line of readable(ac)) assert.doesNotMatch(line, /\d in\b/, line);
  const acIn = run("acme", { thread: "1/2-10" }, "in");
  assert.equal(acIn.primary.unit, "in");
  assert.match(acIn.explain[0].plugged, /^P = 0\.1 in, D = 0\.5 in$/, "every number carries its unit in inches too");
});

// Tap drill (round 2): under the smallest drill (#80, 0.2 mm) by enough that it would leave under 55% thread, name no
// drill and give the micro-drill size. Thread data uses the same cut-off, so the two tools agree.
test("thread data and tap drill agree past the small end of the drill chart", () => {
  const td = (thread) => stat(run("thread-data", { thread }), "Tap drill (75%)").text;
  const tp = (thread) => run("tap-drill", { thread });
  assert.equal(td("0.01-300"), "Micro drill 0.0068 in · under the drill chart");
  assert.match(tp("0.01-300").primary.label, /^Micro drill/);
  assert.equal(td("M0.25x0.075"), "Micro drill 0.177 mm · under the drill chart");
  assert.match(tp("M0.25x0.075").primary.label, /^Micro drill/);
  // M0.3x0.08: 0.2 mm still leaves over 55%, so both name it
  assert.equal(td("M0.3x0.08"), "0.2 mm · figured");
  assert.equal(tp("M0.3x0.08").primary.text, "0.2 mm");
  assert.equal(stat(run("thread-data", { thread: "M0.25x0.075" }, "mm"), "Tap drill (75%)").text, "Micro drill 0.177 mm · under the drill chart");
});

// UNEF chart drills 33/64, 37/64, 41/64 run ~87% on paper; the next drill up is past the ASME B1.1-2003 Table 2 2B minor
// max (9/16-24: 17/32 = 0.5312 vs 0.527, ~58%). The tool must not tell the user to go bigger.
test("tap drill: a chart drill over 85% is not answered with 'consider a bigger drill' when bigger is out of the class", () => {
  for (const [thread, max] of [["9/16-24", "0.527"], ["5/8-24", "0.59"], ["11/16-24", "0.652"]]) {
    const w = run("tap-drill", { thread }).warnings.join(" ");
    assert.doesNotMatch(w, /Consider a bigger drill/, thread);
    assert.match(w, new RegExp(`past the 2B minor-diameter max ${max.replace(".", "\\.")} in`), `${thread}: ${w}`);
  }
  assert.doesNotMatch(run("tap-drill", { thread: "9/16-24" }, "mm").warnings.join(" "), /\d in\b/);
});

// Staying is only right when the kept drill is the smaller miss. Table 2: 9/16-18 2B minor 0.502–0.515; at 80% the
// nearest drill 1/2 (0.500) is 0.0020 in under the min, 33/64 (0.5156) only 0.0006 in over the max, so go bigger, to
// the drill the 75% chart names. Same for 1-1/16-18 UNEF (1.002–1.015: 1 in vs 1-1/64).
test("tap drill: an undersize drill over 85% is not kept when the next drill misses the class by less", () => {
  for (const [thread, kept, next] of [["9/16-18", '1/2"', '33/64"'], ["1-1/16-18", '1"', '1-1/64"']]) {
    const out = run("tap-drill", { thread, percent: "80" });
    assert.equal(out.primary.text, kept, thread);
    const w = out.warnings.join(" ");
    assert.doesNotMatch(w, /Stay with/, `${thread}: ${w}`);
    assert.match(w, new RegExp(`Consider a bigger drill \\(${next.replace(/[/"]/g, (m) => `\\${m}`)}`), `${thread}: ${w}`);
    assert.equal(run("tap-drill", { thread }).primary.text, next, `${thread} at 75% is the chart drill`);
  }
});

// B1.1-2003 Table 1 has no 3/16 in size: 3/16-32 is a special, not a standard UN size.
test("thread data: 3/16-32 is not named as a standard UN size", () => {
  assert.equal(stat(run("thread-data", { thread: "3/16-32" }), "Series").text, "non-standard");
});

// ASME B18.29.1 lists whole standard TPIs only: 1/4-19.6 is not the 1/4-20 row.
test("STI: an odd pitch is an estimate, never the neighboring chart row", () => {
  const odd = run("sti", { thread: "1/4-19.6" });
  assert.match(odd.primary.label, /\(estimate\)/);
  assert.ok(stat(odd, "STI minor diameter, min"));
  assert.match(odd.warnings.join(" "), /isn't in the insert chart/);
  assert.doesNotMatch(run("sti", { thread: "1/4-20" }).primary.label, /estimate/);
});

// ISO 965-1 Table 4: no grade-6 internal PD tolerance at 0.25 mm pitch (4 and 5 only) or 0.2 mm (4 only).
test("measure over wires: the finest metric pitches fall back to the class ISO 965-1 defines, and say so", () => {
  for (const [thread, cls] of [["M1x0.25", "5H"], ["M1.2x0.25", "5H"], ["M1.4x0.2", "4H"], ["M2x0.25", "5H"]]) {
    for (const units of ["in", "mm"]) {
      const out = run("mow", { thread, side: "internal" }, units);
      assert.ok(stat(out, `${cls} PD limits`), `${thread} ${units}: ${out.stats.map((s) => s.label).join(", ")}`);
      assert.match(out.warnings.join(" "), new RegExp(`no 6H .* ${cls}`), `${thread} ${units}`);
    }
  }
  assert.ok(stat(run("mow", { thread: "M10x1.5", side: "internal" }), "6H PD limits"), "a normal pitch keeps 6H");
});

// ASME B1.1-2003 Table 1: 32-UN stops at 1 in, 20-UN at 3 in; above 2 in sizes step 1/8 in.
test("thread data names only the constant-pitch sizes Table 1 lists", () => {
  assert.equal(stat(run("thread-data", { thread: "3-32" }), "Series").text, "non-standard");
  assert.equal(stat(run("thread-data", { thread: "3-32 UN" }), "Series").text, "UN special (not a standard-series size)");
  assert.equal(stat(run("thread-data", { thread: "4-1/8-16" }), "Series").text, "4-1/8-16 UN");
});

// pitch ≥ diameter: the plain reason, not the generic "Type a thread like…"
test("a metric pitch as big as the diameter says why it is refused", () => {
  for (const id of ["thread-data", "tap-drill", "mow"]) assert.throws(() => run(id, { thread: "M1x1" }), /too coarse/, id);
});
