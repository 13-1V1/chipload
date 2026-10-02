// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Drilling 55–60 HRC tool steel must use the published carbide drill speed, not the hard-milling speed.

import test from "node:test";
import { near } from "../helpers.mjs";
import "../../src/calcs/feeds-drill.js";
import { allCalcs } from "../../src/app/registry.js";
import { buildValues, defaultRaw } from "../../src/app/values.js";
import { fmt } from "../../src/core/format.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const ctxFor = (units) => ({ units, L: UNIT_LABEL[units], settings: { units, pro: true }, machine: null, fmt });

// Haas Tooling "Carbide Drills, General Purpose (TSC)" speeds & feeds chart, ISO H38 hardened steel
// 550 HB / 55 HRC: 98 SFM for 1/8–3/4 in drills. 1/4 in drill: RPM = 98 × 12 ÷ (π × 0.25) ≈ 1497.
test("carbide drill in 55–60 HRC tool steel runs at Haas's 98 SFM", () => {
  const def = allCalcs().find((d) => d.id === "feeds-drill");
  const ctx = ctxFor("in");
  const { values } = buildValues(def, defaultRaw(def, { material: "tHard55", toolType: "carbide", diameter: "0.25" }), ctx);
  near(values.sfm, 98, 0.5);
  const out = def.compute(values, ctx);
  const rpm = (98 * 12) / (Math.PI * 0.25);
  const shown = out.primary.unit === "RPM" ? out.primary.value : out.stats.find((s) => /RPM|Spindle/i.test(`${s.label} ${s.unit}`)).value;
  near(shown, rpm, 2);
});
