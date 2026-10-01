// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Speeds and feeds for milling and drilling.
// Source: Machinery's Handbook "Speeds and Feeds" — RPM = (SFM × 12) / (π × D),
// IPM = RPM × flutes × chip load. Radial chip thinning per Sandvik / Harvey Tool
// application notes: factor = D / (2 √(ae (D − ae))) when ae < D/2.

/**
 * Library chip loads are listed for a 3/8 in tool. Smaller tools take less, bigger ones more:
 * scale by diameter ÷ 0.375, held between 0.25× and 1.5×.
 */
export function chipLoadScale(diameterIn) {
  return Math.max(0.25, Math.min(1.5, diameterIn / 0.375));
}

/** Dimensionless chip-thinning multiplier; 1 when at or beyond half-diameter engagement. */
export function radialChipThinningFactor(diameter, radialEngagement, maxFactor = 2.5) {
  if (!(diameter > 0) || !(radialEngagement > 0) || radialEngagement >= diameter / 2) return 1;
  const denominator = 2 * Math.sqrt(radialEngagement * (diameter - radialEngagement));
  if (!(denominator > 0)) return 1;
  return Math.max(1, Math.min(diameter / denominator, maxFactor));
}

/**
 * @param {object} p
 * @param {"in"|"mm"} p.units   unit of diameter / widthOfCut / depthOfCut / maxFeed
 * @param {number} p.diameter
 * @param {number} p.flutes
 * @param {number} p.sfm         surface speed in ft/min (always)
 * @param {number} p.chipLoadIn  chip load per tooth in inches, referenced to a 3/8" tool
 * @param {number} [p.widthOfCut] radial engagement (enables chip thinning + MRR)
 * @param {number} [p.depthOfCut] axial depth (enables MRR)
 * @param {number} [p.maxRpm]     machine spindle cap
 * @param {number} [p.maxFeed]    machine feed cap, in `units`/min
 */
export function calculateSpeedsFeeds({
  units = "in", diameter, flutes, sfm, chipLoadIn,
  widthOfCut = NaN, depthOfCut = NaN, maxRpm = Infinity, maxFeed = Infinity,
}) {
  const diameterIn = units === "in" ? diameter : diameter / 25.4;
  const chipScale = chipLoadScale(diameterIn);
  const thinningFactor = radialChipThinningFactor(diameter, widthOfCut);
  const programmedChipIn = chipLoadIn * chipScale * thinningFactor;
  const requestedRpm = (sfm * 12) / (Math.PI * diameterIn);
  const rpm = Math.min(requestedRpm, Number.isFinite(maxRpm) && maxRpm > 0 ? maxRpm : Infinity);
  const requestedFeedIPM = rpm * flutes * programmedChipIn;
  const requestedFeed = units === "in" ? requestedFeedIPM : requestedFeedIPM * 25.4;
  const feed = Math.min(requestedFeed, Number.isFinite(maxFeed) && maxFeed > 0 ? maxFeed : Infinity);
  const mrr = widthOfCut > 0 && depthOfCut > 0 ? widthOfCut * depthOfCut * feed : null;
  return {
    requestedRpm, rpm, requestedFeed, feed, chipScale, thinningFactor, programmedChipIn, mrr,
    limitedByRpm: rpm < requestedRpm,
    limitedByFeed: feed < requestedFeed,
  };
}

/** RPM from surface speed. `diameterIn` in inches. */
export function rpmFromSfm(sfm, diameterIn) { return (sfm * 12) / (Math.PI * diameterIn); }
export function sfmFromRpm(rpm, diameterIn) { return (rpm * Math.PI * diameterIn) / 12; }
