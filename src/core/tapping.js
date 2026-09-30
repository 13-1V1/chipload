// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tapping and reaming feed helpers.

/** Synchronized tapping feed = RPM × lead. Inch: lead = 1/TPI; metric: lead = pitch. */
export function tappingFeed({ units = "in", rpm, tpi, pitch }) {
  const lead = units === "in" ? 1 / tpi : pitch;
  return { lead, feed: rpm * lead };
}

/** Pre-ream hole size from a per-side stock allowance. */
export function reamerAllowance({ targetDiameter, allowancePerSide }) {
  const totalAllowance = allowancePerSide * 2;
  return { preReamDiameter: targetDiameter - totalAllowance, totalAllowance };
}
