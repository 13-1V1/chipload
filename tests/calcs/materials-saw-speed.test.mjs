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

// USA Band Saw Blades tooth chart: 1/4 in tube wall → 5/8 (a solid-bar rule gave 32 TPI).
test("tube uses the wall chart", () => {
  const out = run({ material: "s1018", shape: "tube", thickness: "0.25" });
  assert.match(out.stats[1].text, /^5\/8 TPI/);
});
