// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread tools, fix round 4: a metric size past ISO 965-1 says why Measure over wires gives no verdict, the ASME
// B1.1 class-limit note stays off metric threads, and the thread and saw source lines match what the code does.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";
import { CALCULATION_SOURCES } from "../../src/data/sources.js";
import { bandSawSpeed } from "../../src/core/saw.js";
import { TAP_DRILL_METRIC_TABLE, METRIC_DEFAULT_PITCH } from "../../src/data/threads-metric.js";
import { DRILL_CHART_MM } from "../../src/data/drills.js";
import { lookupTapDrillMetric } from "../../src/core/tapdrill.js";

const run = (id, over = {}, units = "in") => {
  const def = allCalcs().find((d) => d.id === id);
  const own = def.units === false ? "in" : units;
  const c = { units: own, L: UNIT_LABEL[own], settings: { units, pro: true }, machine: null, fmt };
  const built = buildValues(def, defaultRaw(def, over, own), c);
  return def.compute(built.values, c);
};

test("mow: a metric size outside ISO 965-1 (M1–M355, 0.2–8 mm pitch) says there is no pass/fail, and why", () => {
  // M400x6 measured: PD solves 1.3 mm under basic, and there used to be no limits row and no warning at all
  for (const [over, units, why] of [
    [{ thread: "M400x6", mode: "e", m: "400" }, "mm", /M1 to M355/],
    [{ thread: "M400x6", mode: "e", m: "15.75" }, "in", /M1 to M355/],
    [{ thread: "M0.8x0.2", side: "internal", mode: "e", m: "0.5" }, "mm", /M1 to M355/],
    [{ thread: "M400x6", mode: "m" }, "mm", /M1 to M355/],
  ]) {
    const out = run("mow", over, units);
    assert.ok(!out.stats.some((s) => /limits/.test(s.label)), `${over.thread}: no class-limit rows`);
    const w = out.warnings.find((x) => /no pass\/fail/.test(x));
    assert.ok(w, `${over.thread} ${units}: ${JSON.stringify(out.warnings)}`);
    assert.match(w, why);
  }
  // inside the range nothing changes: M10 6g still gets its limits and no such warning
  const ok = run("mow", { thread: "M10", mode: "e", m: "9.98" }, "mm");
  assert.ok(ok.stats.some((s) => s.label === "6g PD limits"));
  assert.ok(!ok.warnings.some((x) => /no pass\/fail/.test(x)));
});

test("mow: a pitch outside 0.2-8 mm says 'Check the pitch.' once, with one no-pass/fail line", () => {
  // the thread's own caution already says check the pitch; the no-limits line must not repeat it
  for (const [over, units] of [
    [{ thread: "M100x10", mode: "m" }, "mm"],
    [{ thread: "M100x10", mode: "m" }, "in"],
    [{ thread: "M5x0.1", mode: "m" }, "mm"],
  ]) {
    const out = run("mow", over, units);
    const why = JSON.stringify(out.warnings);
    assert.equal(out.warnings.filter((x) => /Check the pitch/.test(x)).length, 1, `${over.thread} ${units}: ${why}`);
    assert.equal(out.warnings.filter((x) => /no pass\/fail/.test(x)).length, 1, `${over.thread} ${units}: ${why}`);
  }
});

test("thread-data: the ASME B1.1 class-limit note shows only with the B1.1 table (inch threads)", () => {
  for (const units of ["in", "mm"]) {
    for (const thread of ["M8", "M64x2"]) {
      const out = run("thread-data", { thread }, units);
      assert.equal(out.tables.length, 0, thread);
      assert.ok(!out.notes.some((n) => /ASME B1\.1/.test(n)), `${thread} ${units}: ${out.notes.join(" | ")}`);
      assert.ok(out.notes.some((n) => /ISO 965-1/.test(n) && /Metric thread limits/.test(n)), thread);
    }
    const un = run("thread-data", { thread: "1/4-20" }, units);
    assert.equal(un.tables[0].title, "Class limits (ASME B1.1)");
    assert.ok(un.notes.some((n) => /ASME B1\.1-2003 Table 2/.test(n)));
    assert.ok(!un.notes.some((n) => /Metric thread limits/.test(n)));
  }
  // the pointer names a real tool
  assert.ok(allCalcs().some((d) => d.title === "Metric thread limits"));
});

test("thread-data: points to Metric thread limits only where ISO 965-1 has limits (M1–M355, 0.2–8 mm pitch)", () => {
  // fix 5: M400x6 and M100x10 were sent to Metric thread limits, which only throws for them; Measure over wires
  // already says there is no pass/fail for these, so the two tools now agree
  for (const units of ["in", "mm"]) {
    for (const thread of ["M400x6", "M356x6", "M0.8x0.2", "M100x10", "M5x0.1"]) {
      const out = run("thread-data", { thread }, units);
      const why = `${thread} ${units}: ${out.notes.join(" | ")}`;
      assert.ok(!out.notes.some((n) => /Metric thread limits/.test(n)), why);
      assert.ok(out.notes.some((n) => /ISO 965-1 has no class limits for this size and pitch \(M1 to M355, 0\.2 to 8 mm pitch\)/.test(n)), why);
      // the tool it used to point to really has nothing for these
      assert.throws(() => run("thread-metric", { thread }, units), /ISO 965 class limits cover/, thread);
      // an out-of-range pitch says "Check the pitch." once (the thread's caution), not again in the note
      assert.ok(!out.notes.some((n) => /Check the pitch/.test(n)), why);
    }
    // in range: the pointer stays, and the limits tool answers
    const m10 = run("thread-data", { thread: "M10" }, units);
    assert.ok(m10.notes.includes("6g / 6H class limits (ISO 965-1): see Metric thread limits."), m10.notes.join(" | "));
    assert.ok(run("thread-metric", { thread: "M10" }, units).primary);
    // ISO 965-1 defines no 6H at 0.2 or 0.25 mm pitch (4H/5H only): name only 6g and say so
    for (const thread of ["M1x0.2", "M2x0.25"]) {
      const n = run("thread-data", { thread }, units).notes.find((x) => /ISO 965-1/.test(x));
      assert.match(n, /^6g class limits \(ISO 965-1\): see Metric thread limits\. ISO 965-1 has no 6H for a 0\.2/, thread);
    }
  }
});

test("mow: the wire in history, the plugged line and the range warning reads to the place wires are marked (p + 1)", () => {
  // best wire 0.57735 P (Machinery's Handbook three-wire method): 20 TPI .02887 in; 1/4-20 in mm 0.7332; 1.5 mm 0.866
  const inch = run("mow", {}, "in");
  assert.equal(inch.historyLabel, "1/4-20 · ext · W 0.02887 in");
  assert.match(inch.stats[0].text, /^0\.02887 in/);
  // Machinery's Handbook: 1/4-20 at basic PD 0.2175 with a .02887 wire measures 0.2608 over wires
  assert.equal(inch.explain[0].plugged, "M = 0.2175 + 3 × 0.02887 − 0.86603 × 0.05 = 0.2608 in");
  assert.equal(run("mow", {}, "mm").historyLabel, "1/4-20 · ext · W 0.7332 mm");
  assert.equal(run("mow", { thread: "M10" }, "mm").historyLabel, "M10x1.5 · ext · W 0.866 mm");
  // a typed wire outside the range: the warning shows it the way "Wire used" does
  const off = run("mow", { thread: "M10", wire: "0.3125" }, "mm");
  assert.ok(off.warnings.some((w) => w.startsWith("Wire 0.3125 mm is outside")), JSON.stringify(off.warnings));
  assert.match(off.stats[0].text, /^0\.3125 mm/);
});

test("sources: thread and tap drill lines describe the code as it is", () => {
  const g = CALCULATION_SOURCES.threadGeometry.source;
  // unToleranceEnvelope reproduces B1.1-2003 Table 2 by formula with B1.30 rounding; nothing is hand-entered
  assert.match(g, /ASME B1\.1-2003 Table 2/);
  assert.match(g, /ASME B1\.30/);
  assert.doesNotMatch(g, /hand-adjusted/);
  // Measure over wires reports under this key: its formula and the no-lead-correction caveat are named
  assert.match(g, /M = E \+ 3W − 0\.86603 P/);
  assert.match(g, /no lead-angle correction/);
  // metric drills are the ISO 235 series (src/data/drills.js), not B94.11M
  assert.match(CALCULATION_SOURCES.tapDrill.source, /ISO 235/);
});

test("sources: the metric fine-pitch tap drill rule is the one the table follows (DIN 13-2 to 13-11 / DIN 336)", () => {
  const s = CALCULATION_SOURCES.tapDrill.source;
  assert.match(s, /DIN 13-2 to 13-11 and DIN 336 \/ ISO 2306/);
  assert.match(s, /next 0\.1 mm size down where D − P isn't a stock drill/);
  assert.match(s, /1\.25 mm pitch takes D − 1\.2/);
  // DIN 13 / DIN 336 core-hole drills, the three named in the line: M10x1.25 8.8, M12x1.25 10.8, M14x1.25 12.8
  for (const [major, want] of [[10, 8.8], [12, 10.8], [14, 12.8]]) {
    assert.equal(lookupTapDrillMetric(major, 1.25).size, want, `M${major}x1.25`);
    assert.ok(s.includes(`M${major}x1.25 ${want} mm`), `M${major}x1.25 named in the line`);
  }
  // every fine-pitch row in the table follows the stated rule, so a reader who works it out gets the table's drill
  const stock = (x) => DRILL_CHART_MM.some((d) => Math.abs(d - x) < 1e-9);
  let rows = 0;
  for (const [key, [drill]] of Object.entries(TAP_DRILL_METRIC_TABLE)) {
    const [D, P] = key.split("|").map(Number);
    if (METRIC_DEFAULT_PITCH[D] === P) continue;
    const dp = Math.round((D - P) * 1000) / 1000;
    const want = P === 1.25 ? D - 1.2 : stock(dp) ? dp : Math.floor(dp * 10 + 1e-9) / 10;
    assert.ok(Math.abs(drill - want) < 1e-9, `M${D}x${P}: table ${drill}, rule ${want}`);
    rows++;
  }
  assert.ok(rows > 50, `checked ${rows} fine rows`);
});

test("sources: the saw line names where the wood tooth pitch comes from (Olson Saw)", () => {
  const s = CALCULATION_SOURCES.saw.source;
  assert.match(s, /Olson Saw/);
  assert.match(s, /at least 3 teeth in the work/);
  assert.match(s, /4 TPI from 3\/4 in \(19 mm\), 3–4 TPI from 1 in \(25\.4 mm\)/);
});

test("sources: the saw line places only the non-wood range groups by rating; wood starts near 3,000 FPM", () => {
  const s = CALCULATION_SOURCES.saw.source;
  // what bandSawSpeed does: range families start by rating, wood always at 3,000 inside 2,500-5,000 FPM
  const lo = bandSawSpeed({ id: "x", group: "Aluminum", rating: 20 }).start;
  const hi = bandSawSpeed({ id: "x", group: "Aluminum", rating: 120 }).start;
  assert.ok(hi > lo, "aluminum start moves with rating");
  for (const rating of [20, 120]) {
    const w = bandSawSpeed({ id: "oHardwood", group: "Other", rating });
    assert.deepEqual([w.start, w.min, w.max], [3000, 2500, 5000], "wood ignores rating");
  }
  const rated = s.match(/doesn't list \(([^)]*)\)[^;]*placed by the material's rating/);
  assert.ok(rated, s);
  assert.doesNotMatch(rated[1], /wood/);
  assert.match(s, /wood starts near 3,000 FPM/);
  assert.match(s, /2,500 to 5,000 FPM/);
});
