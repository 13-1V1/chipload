// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds and feeds for milling and drilling.
// Source: Machinery's Handbook "Speeds and Feeds" — RPM = (SFM × 12) / (π × D),
// IPM = RPM × flutes × chip load. Radial chip thinning per Sandvik / Harvey Tool
// application notes: factor = D / (2 √(ae (D − ae))) when ae < D/2.

/**
 * Library chip loads are listed for a 3/8 in tool. Smaller tools take less, bigger ones more:
 * scale by diameter ÷ 0.375, straight down to micro end mills, held at 1.5× on the big end.
 * Published miniature charts stay proportional to diameter down to 0.015 in (Harvey Tool SF_74000:
 * 6061 slotting 0.00413 IPT at 3/8, 0.00039 at 1/32, 0.00019 at 0.015), so there is no floor.
 */
export function chipLoadScale(diameterIn) {
  return Math.max(0, Math.min(1.5, diameterIn / 0.375));
}

/** Radial thinning before any cap: D ÷ (2 √(ae (D − ae))) under half-diameter engagement, else 1. */
export function radialChipThinningRaw(diameter, radialEngagement) {
  if (!(diameter > 0) || !(radialEngagement > 0) || radialEngagement >= diameter / 2) return 1;
  return diameter / (2 * Math.sqrt(radialEngagement * (diameter - radialEngagement)));
}

/**
 * Dimensionless chip-thinning multiplier, capped at `maxFactor`; 1 at or beyond half-diameter engagement.
 * No width given (blank / NaN) also gives 1 — a typed 0 is not a cut, so calculators reject it.
 */
export function radialChipThinningFactor(diameter, radialEngagement, maxFactor = 2.5) {
  return Math.min(radialChipThinningRaw(diameter, radialEngagement), maxFactor);
}

/** RPM from surface speed. `diameterIn` in inches. */
export function rpmFromSfm(sfm, diameterIn) { return (sfm * 12) / (Math.PI * diameterIn); }
export function sfmFromRpm(rpm, diameterIn) { return (rpm * Math.PI * diameterIn) / 12; }
