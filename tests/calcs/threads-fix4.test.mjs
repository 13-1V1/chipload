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
