// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

import test from "node:test";
import assert from "node:assert/strict";
import { near } from "../helpers.mjs";
import { radialChipThinningFactor, radialChipThinningRaw, chipLoadScale, rpmFromSfm, sfmFromRpm } from "../../src/core/feeds.js";

// Machinery's Handbook: 1/2" tool at 100 SFM → 764 RPM
test("RPM from SFM matches handbook", () => {
  near(rpmFromSfm(100, 0.5), 763.94, 0.01);
  near(sfmFromRpm(rpmFromSfm(100, 0.5), 0.5), 100, 1e-9);
});

// Library chip loads are for a 3/8 in tool and scale with diameter, all the way down to micro end mills.
// Harvey Tool speeds & feeds chart SF_74000 (miniature 2-flute end mills, series 740xx/741xx), slotting IPT:
//   wrought aluminum     0.015 → .00019, 0.031 → .00039, 0.062 → .00068, 0.375 → .00413
//   low-carbon steel     0.015 → .00007, 0.031 → .00013, 0.062 → .00023, 0.375 → .00142
// Their ratio to the 3/8 in value is the scale a micro tool should get. The app may sit a little under
// (safe: a lighter chip), never more than 5% over. The old 0.25× floor gave 3–6× these at 0.015–0.031 in.
test("chip load scales with diameter down to micro end mills (Harvey Tool SF_74000)", () => {
  const harvey = {
    aluminum: { 0.015: 0.00019, 0.031: 0.00039, 0.062: 0.00068, 0.375: 0.00413 },
    lowCarbonSteel: { 0.015: 0.00007, 0.031: 0.00013, 0.062: 0.00023, 0.375: 0.00142 },
  };
  for (const [material, row] of Object.entries(harvey)) {
    for (const d of [0.015, 0.031, 0.062]) {
      const published = row[d] / row[0.375];
      const scale = chipLoadScale(d);
      assert.ok(scale <= published * 1.05 && scale >= published * 0.8, `${material} ${d} in: scale ${scale.toFixed(4)} vs Harvey ${published.toFixed(4)}`);
    }
  }
  near(chipLoadScale(0.375), 1);
  near(chipLoadScale(0.125), 1 / 3, 1e-12);
  near(chipLoadScale(2), 1.5);
});

// Sandvik Coromant milling formulas: hex = fz × √(1 − (1 − 2ae/D)²) for ae < D/2, so the factor is
// D ÷ (2 √(ae (D − ae))). It grows without limit as ae → 0; the app holds it at a cap.
test("radial chip thinning factor", () => {
  near(radialChipThinningFactor(0.5, 0.25), 1);
  near(radialChipThinningFactor(0.5, 0.05), 5 / 3, 1e-12);
  near(radialChipThinningFactor(12.7, 1.27), 5 / 3, 1e-12);
  near(radialChipThinningRaw(0.5, 0.005), 5.0252, 0.0001);
  near(radialChipThinningFactor(0.5, 0.005), 2.5);
  near(radialChipThinningFactor(0.5, 0.005, 5), 5);
  near(radialChipThinningRaw(0.5, 0.3), 1);
  near(radialChipThinningFactor(0.5, NaN), 1, 0, "no width given");
});
