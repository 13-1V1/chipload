// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Thread data, metric thread limits and measure over wires, run the way the app runs them.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { UNIT_LABEL } from "../../src/app/settings.js";
import { fmt } from "../../src/core/format.js";

const run = (id, over = {}, units = "in") => {
  const def = allCalcs().find((d) => d.id === id);
  const c = { units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine: null, fmt };
  const built = buildValues(def, defaultRaw(def, over, units), c);
  return def.compute(built.values, c);
};
const stat = (out, label) => out.stats.find((s) => s.label === label);

// ASME B1.1 Table 1 lists 2-4.5 and 2-1/4-4.5 UNC: the TPI line has to say 4.5, not round to 5.
test("thread data keeps a half thread per inch and names the series", () => {
  const out = run("thread-data", { thread: "2-4.5" });
  const tpi = stat(out, "Threads per inch");
  assert.equal(fmt(tpi.value, tpi.places), "4.5");
  assert.equal(stat(out, "Series").text, "2-4.5 UNC");
  const twenty = stat(run("thread-data", { thread: "1/4-20" }), "Threads per inch");
  assert.equal(fmt(twenty.value, twenty.places), "20");
});

// 1-14 is UNS (formerly NF), not UNEF: the 1 in UNEF is 20 TPI (ASME B1.1 Table 1).
test("thread data: standard callouts get their series, a wrong series name is pointed out", () => {
  assert.equal(stat(run("thread-data", { thread: "1/2-28" }), "Series").text, "1/2-28 UNEF");
  assert.equal(stat(run("thread-data", { thread: "1-20" }), "Series").text, "1-20 UNEF");
  const s = run("thread-data", { thread: "1-14 UNEF" });
  assert.equal(stat(s, "Series").text, "1-14 UNS");
  assert.match(s.warnings.join(" "), /You wrote UNEF, but 1-14 is UNS/);
  assert.equal(stat(run("thread-data", { thread: "M12x1.5" }), "Series").text, "M12x1.5 (fine)");
  assert.equal(stat(run("thread-data", { thread: "1/4-20UNC" }), "Series").text, "1/4-20 UNC");
});

// ASME B1.15: UNJC / UNJF are UNJ threads and need the root-radius note, same as a bare "UNJ".
test("thread data: UNJC and UNJF get the UNJ note, UNR gets its own", () => {
  for (const callout of ["1/4-20 UNJC-3A", "1/4-28 UNJF-3A", "1/4-28 UNJ"]) assert.ok(run("thread-data", { thread: callout }).notes.some((n) => /UNJ \(ASME B1\.15\)/.test(n)), callout);
  assert.ok(run("thread-data", { thread: "1/4-20 UNRC-2A" }).notes.some((n) => /UNR/.test(n)));
});

// Machinery's Handbook: % = (D − drill) × TPI ÷ 0.01299. #10-32 with #21 gives 76%, 5/8-18 with 37/64 gives 65%.
test("thread data shows the percent the chart drill really gives", () => {
  assert.equal(stat(run("thread-data", { thread: "#10-32" }), "Tap drill (75%)").text, "#21 · 76%");
  assert.equal(stat(run("thread-data", { thread: "5/8-18" }), "Tap drill (75%)").text, '37/64" · 65%');
});

test("a very coarse pitch is flagged on every thread screen", () => {
  assert.match(run("thread-data", { thread: "1/4-10" }).warnings.join(" "), /coarser than any standard/);
  assert.match(run("mow", { thread: "1/4-10" }).warnings.join(" "), /coarser than any standard/);
});

// ISO 965-2: M10x1.5 6g PD 8.862–8.994, 6H 9.026–9.206. ISO 965-1 Tables 8 / 9 recommend 4g 4h 6e 6f 6g 6h 8e 8g
// and 4H–8H, 5G–8G; anything else gets a warning, and the explain line shows the table values used.
test("metric thread limits: table values, explain line and class warnings", () => {
  const out = run("thread-metric", { thread: "M10" });
  assert.equal(out.primary.text, "8.862 – 8.994");
  assert.equal(stat(out, "6H pitch dia").text, "9.026 – 9.206 mm");
  assert.match(out.explain[0].plugged, /Td2\(6\) = 132 µm/);
  assert.match(out.explain[0].plugged, /TD2\(6\) = 180 µm/);
  assert.match(out.explain[0].plugged, /TD1\(6\) = 300 µm/);
  assert.deepEqual(out.warnings, []);
  for (const [extPos, extGrade] of [["e", "4"], ["f", "4"], ["f", "8"], ["h", "8"]]) {
    assert.match(run("thread-metric", { thread: "M10", extPos, extGrade }).warnings.join(" "), /not one of the ISO 965-1 recommended/, `${extGrade}${extPos}`);
  }
  const m1 = run("thread-metric", { thread: "M1" });
  assert.match(m1.warnings.join(" "), /doesn't define 6H/);
});

// A blank wire is the best wire, 0.57735 P (Pratt & Whitney: 20 TPI = .02887). Machinery's Handbook: 1/4-20 at
// basic PD 0.2175 over .02887 wires reads 0.2608.
test("measure over wires: a blank wire is the best wire, and the screen says so", () => {
  const out = run("mow", { thread: "1/4-20" });
  near(out.primary.value, 0.2608, 5e-5);
  assert.equal(stat(out, "Wire used").text, "0.02887 in · best wire for 20 TPI");
  const mm = run("mow", { thread: "M10x1.5" }, "mm");
  assert.equal(stat(mm, "Wire used").text, "0.866 mm · best wire for 1.5 mm pitch");
  assert.match(mm.explain[0].plugged, / mm$/);
  assert.ok(mm.notes[0].includes("0.003 mm"));
});

// Best-size wires are sold for every common metric pitch (P&W / Thread Check: 0.5 mm = 0.2887, 1.0 = 0.5774,
// 1.25 = 0.7217, 1.75 = 1.0104, 2.5 = 1.4434), so a blank wire on these must never read "special".
test("measure over wires: common metric threads are not called a special wire", () => {
  for (const thread of ["M1x0.25", "M3x0.5", "M4x0.5", "M6x1", "M8x1.25", "M12x1.75", "M16x2", "M20x2.5"]) {
    for (const units of ["mm", "in"]) {
      const text = stat(run("mow", { thread }, units), "Wire used").text;
      assert.ok(!text.includes("special"), `${thread} ${units}: ${text}`);
    }
  }
  assert.equal(stat(run("mow", { thread: "M3x0.5" }, "mm"), "Wire used").text, "0.2887 mm · best wire for 0.5 mm pitch");
  assert.match(stat(run("mow", { thread: "M10x1.3" }, "mm"), "Wire used").text, /special/);
});

// A reading just past a limit must not print the same number as the limit.
test("measure over wires: a verdict never prints the reading equal to the limit", () => {
  // M10x1.5 6g PD min 8.862 mm (ISO 965-2) = 0.348898 in; m = 0.40 in works out to PD 0.348857 in.
  const w = run("mow", { thread: "M10x1.5", mode: "e", m: "0.40" }).warnings.join(" ");
  const hit = w.match(/Pitch diameter ([\d.]+) in is under the 6g minimum ([\d.]+) in/);
  assert.ok(hit, w);
  assert.notEqual(hit[1], hit[2]);
  assert.ok(Number(hit[1]) < Number(hit[2]), w);
  // 1/4-20 2A PD min 0.2127 (ASME B1.1); a PD of 0.21265 is under it and must read 0.21265, not 0.2127.
  const m = 0.21265 + 3 * (0.05 / Math.sqrt(3)) - (Math.sqrt(3) / 2) * 0.05;
  const un = run("mow", { thread: "1/4-20", mode: "e", m: String(m) }).warnings.join(" ");
  assert.match(un, /Pitch diameter 0\.21265 in is under the 2A minimum 0\.2127 in/);
});

// DIN 336 M12x1.5 10.5 mm, M14x1.25 12.8 mm; UNEF chart 1/2-28 15/32, 1-20 61/64. A hole past the drill chart
// (4-4 UNC 75% = 4 − 0.974/4 = 3.7565 in, Machinery's Handbook) is bored, not given the chart's last drill.
test("thread data: standard fine and UNEF sizes show their chart drill, huge holes say bore", () => {
  const tap = (thread) => stat(run("thread-data", { thread }), "Tap drill (75%)").text;
  assert.equal(tap("M12x1.5"), "10.5 mm · 77%");
  assert.equal(tap("M14x1.25"), "12.8 mm · 74%");
  assert.equal(tap("1/2-28"), '15/32" · 67%');
  assert.equal(tap("1-20"), '61/64" · 72%'); // (1 − 0.9531) × 20 ÷ 0.01299
  assert.match(tap("4-4"), /^Bore to 3\.756\d in/);
  assert.match(tap("M64x2"), /^Bore to 62\.05 mm/);
  assert.match(tap("M10x1.3"), /figured/);
});

// The shown limits round toward the inside of the band, so a part read at exactly the shown limit passes and one read
// a digit outside it is called. 1/4-20 2A PD 0.2127–0.2164 (ASME B1.1): true M limits 0.2560012–0.2597 in with the
// 0.02887 in best wire; M10x1.5 6g PD 8.862–8.994 mm (ISO 965-2): true M min 10.161031 mm.
test("measure over wires: a reading at the shown measurement limit gets no verdict", () => {
  const cases = [["1/4-20", "in", "2A"], ["1/4-20", "mm", "2A"], ["M10x1.5", "mm", "6g"], ["M10x1.5", "in", "6g"], ["1/2-13", "in", "2A"], ["M6", "mm", "6g"]];
  for (const [thread, units, cls] of cases) {
    for (const side of ["external", "internal"]) {
      const shown = stat(run("mow", { thread, side }, units), `${side === "external" ? cls : cls.replace("A", "B").replace("g", "H")} measurement limits`).text;
      const [lo, hi] = shown.match(/[\d.]+/g);
      const at = `${thread} ${side} ${units}`;
      assert.deepEqual(run("mow", { thread, side, mode: "e", m: lo }, units).warnings, [], `${at} at shown min ${lo}`);
      assert.deepEqual(run("mow", { thread, side, mode: "e", m: hi }, units).warnings, [], `${at} at shown max ${hi}`);
      const step = units === "mm" ? 0.001 : 0.0001;
      assert.match(run("mow", { thread, side, mode: "e", m: String(Number(lo) - step) }, units).warnings.join(" "), /under the/, `${at} a digit under`);
      assert.match(run("mow", { thread, side, mode: "e", m: String(Number(hi) + step) }, units).warnings.join(" "), /over the/, `${at} a digit over`);
    }
  }
  assert.equal(stat(run("mow", { thread: "1/4-20" }), "2A measurement limits").text, "0.2561 – 0.2597 in");
  assert.equal(stat(run("mow", { thread: "M10x1.5" }, "mm"), "6g measurement limits").text.split(" ")[0], "10.162");
});

// ASME B1.1: 1/4-20 2A PD 0.2127–0.2164. A slipped decimal can't give a confident answer; an out-of-class part gets a verdict.
test("measure over wires: impossible readings are refused, out-of-class ones are called", () => {
  assert.throws(() => run("mow", { thread: "1/4-20", mode: "e", m: "0.025" }), /doesn't fit a 1\/4-20/);
  assert.throws(() => run("mow", { thread: "1/4-20", side: "internal", mode: "e", m: "0.02" }), /doesn't fit/);
  assert.throws(() => run("mow", { thread: "1/4-20", pd: "5" }), /can't be on a 1\/4-20/);
  assert.match(run("mow", { thread: "1/4-20", mode: "e", m: "0.2500" }).warnings.join(" "), /under the 2A minimum 0\.2127/);
  assert.deepEqual(run("mow", { thread: "1/4-20", mode: "e", m: "0.2585" }).warnings, []);
  assert.match(run("mow", { thread: "M10x1.5", mode: "e", m: "10.1" }, "mm").warnings.join(" "), /under the 6g minimum 8\.862 mm/);
});
