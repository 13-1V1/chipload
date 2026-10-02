// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Reaming helper. (Synchronized tapping feed = RPM × lead lives in the Tapping feed tool, where the Shop
// machine fit — fitToMachine in src/calcs/_machine.js — owns the spindle and feed.)

/** Pre-ream hole size from a per-side stock allowance. */
export function reamerAllowance({ targetDiameter, allowancePerSide }) {
  const totalAllowance = allowancePerSide * 2;
  return { preReamDiameter: targetDiameter - totalAllowance, totalAllowance };
}
