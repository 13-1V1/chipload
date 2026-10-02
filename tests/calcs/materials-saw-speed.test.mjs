// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Band saw tool: metric shows m/min and mm everywhere, the RPM field explains itself, wood runs at wood speed.

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import "../../src/calcs/saw-speed.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctxFor = (units) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine: null, fmt });
const saw = () => allCalcs().find((d) => d.id === "saw-speed");
const run = (raw, units = "in") => {
  const def = saw();
  const ctx = ctxFor(units);
  return def.compute(buildValues(def, defaultRaw(def, raw), ctx).values, ctx);
};
const allText = (out) => JSON.stringify([out.primary, out.stats, out.warnings, out.explain, out.notes]);

// 1 ft/min = 0.3048 m/min. 1018 at 25 mm (0.984 in): LENOX 270 FPM × 1.111 size adjustment ≈ 300 FPM ≈ 91 m/min.
test("metric: blade speed in m/min, sizes in mm, no FPM or inches anywhere", () => {
  const out = run({ material: "s1018", thickness: "25", wheel: "355", rpm: "800" }, "mm");
  assert.equal(out.primary.unit, "m/min");
  near(out.primary.value, 300 * 0.3048, 1);
  const text = allText(out);
  assert.doesNotMatch(text, /FPM|\d in\b|in wheel|in thick|4 in annealed/);
  assert.match(text, /25 mm/);
  assert.match(text, /355 mm wheel/);
  const yours = out.stats.find((s) => s.label === "Your blade speed");
  assert.equal(yours.unit, "m/min");
  near(yours.value, (Math.PI * 355 * 800) / 1000, 0.5); // π × D(mm) × RPM ÷ 1000
});

test("inch: blade speed in FPM", () => {
  const out = run({ material: "s1018", thickness: "1" });
  assert.equal(out.primary.unit, "FPM");
  near(out.primary.value, 300, 1);
  assert.match(out.stats[1].text, /5\/8 TPI/); // USA Band Saw Blades tooth chart: 1 in round → 5/8
});

test("metric wood and aluminum: no FPM in any line", () => {
  for (const material of ["oHardwood", "al6061"]) assert.doesNotMatch(allText(run({ material, thickness: "25" }, "mm")), /FPM/, material);
});

test("wheel RPM without a wheel size says what is missing", () => {
  const out = run({ material: "s1018", thickness: "1", rpm: "60" });
  assert.ok(out.warnings.some((w) => /wheel diameter/.test(w)), out.warnings.join(" | "));
});

// Wood saws run about 3,000 FPM (the tool's own note; Highland Woodworking).
test("hardwood: wood speed, and a 3,000 FPM saw is not called too fast", () => {
  const out = run({ material: "oHardwood", thickness: "1", wheel: "14", rpm: "820" });
  assert.equal(out.primary.value, 3000);
  assert.ok(!out.warnings.some((w) => /too fast/.test(w)), out.warnings.join(" | "));
});

// LENOX: Al bronze 865 150 FPM at 4 in; a bronze saw at 1,000 FPM is far too fast.
test("bronze: chart speed, and 1,000 FPM is too fast", () => {
  const out = run({ material: "c954", thickness: "4", wheel: "14", rpm: "273" });
  assert.equal(out.primary.value, 150);
  assert.ok(out.warnings.some((w) => /too fast/.test(w)));
});

test("hardened tool steel: told a bi-metal blade is the wrong blade", () => {
  const out = run({ material: "tHard55", thickness: "1" });
  assert.ok(out.warnings.some((w) => /carbide-tipped blade|abrasive/.test(w)));
});

// The How-was-this-figured line names the blade makers' charts, not the generic speeds & feeds note.
test("source is the band saw entry", () => {
  assert.equal(run({}).source, "saw");
  assert.equal(run({}, "mm").source, "saw");
});

// USA Band Saw Blades tooth chart: 1/4 in tube wall → 5/8 (a solid-bar rule gave 32 TPI).
test("tube uses the wall chart", () => {
  const out = run({ material: "s1018", shape: "tube", thickness: "0.25" });
  assert.match(out.stats[1].text, /^5\/8 TPI/);
});

// Wood gets wood advice only: hook tooth 3–4 TPI for thick stock (woodworking blade guides), never the metal
// variable-pitch chart, in the stat, the explain lines and the history label alike.
test("wood: one blade answer, a wood blade, in both units", () => {
  for (const material of ["oHardwood", "oMDF", "oPlywood"]) {
    for (const [units, thickness] of [["in", "1"], ["mm", "30"]]) {
      const out = run({ material, thickness }, units);
      const blades = out.stats.filter((s) => /blade/i.test(s.label));
      assert.deepEqual(blades.map((s) => s.label), ["Blade to use"], `${material} ${units}`);
      assert.equal(blades[0].text, "Hook tooth, about 3–4 TPI");
      assert.doesNotMatch(allText(out), /variable pitch|tooth chart: round bar|5\/8 TPI/);
      assert.doesNotMatch(out.historyLabel, /5\/8/);
      if (units === "mm") assert.doesNotMatch(allText(out), /\d in\b|\/4 in\b|FPM/);
    }
  }
  // the hook-tooth line is the one the explain line states: 19 mm stock gets the hook tooth, 18 mm the regular tooth
  // (Olson Saw: 4 TPI from 3/4 in), and 3–4 TPI only from 1 in = 25.4 mm (Olson: 3 TPI from 1 in), where 3 TPI keeps
  // 3 teeth too. A 25 mm board stays on 4 TPI: 3 TPI × 0.984 in = 2.95 teeth
  for (const [thickness, tooth] of [["25.4", /^Hook tooth, about 3–4 TPI$/], ["25", /^Hook tooth, about 4 TPI$/], ["24", /^Hook tooth, about 4 TPI$/], ["19", /^Hook tooth, about 4 TPI$/], ["18", /^Regular tooth/]]) {
    const out = run({ material: "oHardwood", thickness }, "mm");
    assert.match(out.stats.find((s) => s.label === "Blade to use").text, tooth, `${thickness} mm`);
    assert.match(out.explain.find((e) => e.title === "Tooth pitch").formula, /from 19 mm up: 4 TPI, or 3–4 TPI from 25\.4 mm up/);
  }
  for (const [thickness, text] of [["0.75", "Hook tooth, about 4 TPI"], ["0.9", "Hook tooth, about 4 TPI"], ["0.99", "Hook tooth, about 4 TPI"], ["0.9843", "Hook tooth, about 4 TPI"], ["1", "Hook tooth, about 3–4 TPI"]]) {
    const out = run({ material: "oPlywood", thickness });
    assert.equal(out.stats.find((s) => s.label === "Blade to use").text, text, thickness);
    assert.match(out.explain.find((e) => e.title === "Tooth pitch").formula, /from 3\/4 in up: 4 TPI, or 3–4 TPI from 1 in up/);
  }
  // the notes never give a pitch of their own: 3/4 in plywood once read "4 TPI" in the stat and "3–4 TPI" in a note
  for (const [units, thickness] of [["in", "0.75"], ["in", "0.9"], ["in", "1"], ["in", "0.5"], ["in", "0.1"], ["mm", "19"], ["mm", "24"], ["mm", "25"], ["mm", "3"]]) {
    const out = run({ material: "oPlywood", thickness }, units);
    const tpi = out.stats.find((s) => s.label === "Blade to use").text.match(/about ([\d–]+) TPI/)[1];
    for (const note of out.notes) {
      assert.doesNotMatch(note, /TPI/, `${thickness} ${units}: ${note}`);
      if (tpi === "4") assert.doesNotMatch(note, /3–4/, `${thickness} ${units}: ${note}`);
    }
    // "keeps at least 3 teeth" only when it does; thin stock gets the warning instead
    const thinWarn = out.warnings.some((w) => /^Thin stock/.test(w));
    assert.equal(out.notes.some((n) => /keeps at least 3 teeth/.test(n)), !thinWarn, `${thickness} ${units}`);
  }
  // thin wood: a finer regular-tooth blade with 3 teeth in the cut; under 3/32 in the warning names that same blade
  assert.match(run({ material: "oPlywood", thickness: "0.5" }).stats[1].text, /^Regular tooth, about 6 TPI/);
  const thin = run({ material: "oPlywood", thickness: "0.06" });
  assert.match(thin.stats[1].text, /24 TPI/);
  assert.ok(thin.warnings.some((w) => /24 TPI/.test(w) && !/14\/18/.test(w)), thin.warnings.join(" | "));
  // under 1/8 in (3 mm too) even 24 TPI leaves under 3 teeth, so the warning fires; from 1/8 in it doesn't
  for (const [units, thickness] of [["in", "0.1"], ["in", "0.124"], ["mm", "3"]]) {
    const out = run({ material: "oPlywood", thickness }, units);
    assert.ok(out.warnings.some((w) => /^Thin stock/.test(w) && /24 TPI/.test(w)), `${thickness} ${units}: ${out.warnings.join(" | ")}`);
  }
  assert.ok(!run({ material: "oPlywood", thickness: "0.125" }).warnings.some((w) => /^Thin stock/.test(w)));
});

// Under 3/32 in the warning and the stats name the same blades: the chart's pitch and 24 TPI one-pitch.
// "Finest" only ever names the chart's finest pitch, 14/18: tube wall from 1/16 in sits on the 10/14 row
// (USA Band Saw Blades Tooth Selection Guide p.23), so there the warning points past it to 14/18.
test("thin stock: the warning names the blades the stats show", () => {
  for (const [shape, thickness, units] of [["round", "0.05"], ["flat", "0.05"], ["tube", "0.05"], ["tube", "0.07"], ["tube", "0.09"], ["tube", "2", "mm"]]) {
    const out = run({ material: "s1018", shape, thickness }, units);
    const pitch = out.stats.find((s) => s.label === "Blade to use").text.match(/^([\d./]+) TPI/)[1];
    const one = out.stats.find((s) => s.label === "One-pitch blade instead").text;
    assert.equal(one, "24 TPI", `${shape} ${thickness}`);
    const warn = out.warnings.find((w) => /^Thin stock/.test(w));
    assert.ok(warn, `${shape} ${thickness}`);
    if (pitch === "14/18") assert.ok(warn.includes(`finest blade you have (${pitch}, or a 24 TPI one-pitch blade)`), warn);
    else {
      assert.equal(pitch, "10/14", `${shape} ${thickness}`);
      assert.ok(warn.includes(`the chart's ${pitch} TPI leaves under 3 teeth`) && warn.includes("(14/18, or a 24 TPI one-pitch blade)"), warn);
    }
    assert.doesNotMatch(warn, /finest blade you have \((?!14\/18)/, warn);
  }
  assert.ok(!run({ material: "s1018", thickness: "0.1" }).warnings.some((w) => /^Thin stock/.test(w)));
});
