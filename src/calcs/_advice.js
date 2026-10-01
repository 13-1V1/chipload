// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The cautions an experienced machinist would say out loud. Shared by the speeds & feeds tools and the job sheet.

import { fmt } from "../core/format.js";

/**
 * Drill feed per rev scales with how well the material cuts. Machinability rating is vs. B1112 = 100%.
 * 1018 (78%) → 0.89×, 304 (45%) → 0.73×, Inconel 718 (10%) → 0.55×, 12L14 (160%) → 1.25×.
 */
export function drillFeedFactor(rating) {
  return Math.max(0.5, Math.min(1.25, 0.5 + (Number(rating) || 0) / 200));
}

/** End-mill cautions. All lengths in inches. */
export function millAdvice({ dIn, wocIn, docIn, requestedRpm, machine }) {
  const out = [];
  if (!machine && requestedRpm > 20000) out.push(`${fmt(requestedRpm, 0)} RPM is more than most spindles turn. Add your machine in Shop and the feed gets figured at its top speed instead.`);
  if (wocIn >= dIn * 0.95) out.push("Full-width slot: the chips have nowhere to go. Cut the feed 20–50%, and use a 2- or 3-flute in aluminum.");
  if (docIn > dIn * 2) out.push("Depth of cut is over 2× the tool diameter. Step down in passes or the tool will deflect and chatter.");
  return out;
}

/** Drilling cautions by depth-to-diameter ratio. */
export function drillAdvice({ dIn, depthIn }) {
  if (!(depthIn > 0) || !(dIn > 0)) return [];
  const ratio = depthIn / dIn;
  if (ratio > 8) return [`${fmt(ratio, 1)}× diameter deep: peck (G83), drop speed and feed about 30%, and use a parabolic-flute drill or through-coolant if you have it.`];
  if (ratio > 5) return [`${fmt(ratio, 1)}× diameter deep: peck (G83) and drop speed and feed about 20% so the chips clear.`];
  if (ratio > 3) return [`${fmt(ratio, 1)}× diameter deep: peck (G83) to clear the chips.`];
  return [];
}
