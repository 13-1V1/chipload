// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The cautions an experienced machinist would say out loud. Shared by the speeds & feeds tools and the job sheet.

import { fmt } from "../core/format.js";
import { spindleSanity } from "./_machine.js";
import { ratingScale, materialById } from "../data/materials-library.js";

// Families the library ranks within themselves, and every one of them cuts far easier than B1112 steel
// (aluminum, magnesium and zinc, plastics): their drill feed takes the top factor whatever the in-family rank.
const FREE_CUTTING_FAMILIES = ["Aluminum", "Magnesium & zinc", "Plastics & composites"];
const B1112 = ratingScale("Carbon steel");
// Float noise from an inch ⇄ mm round trip (30 mm deep ÷ 10 mm = 3.0000000000000004) is not past a line.
const EPS = 1e-9;

/**
 * Drill feed per rev scales with how well the material cuts, on the AISI scale (B1112 = 100%):
 * 1018 (78%) → 0.89×, 304 (45%) → 0.73×, Inconel 718 (10%) → 0.55×, 12L14 (160%) → 1.25×.
 * Pass the material (a library row, as materialSpeeds(...).material gives) so a rating on a family scale is
 * read on its own scale: aluminum, magnesium, zinc and plastics take 1.25×; a copper alloy rated 80 or more
 * on the copper scale (C360 brass = 100) is free-cutting and takes 1.25× too; a lower copper rating (gummy
 * pure copper, bronzes) is read as-is, which keeps it conservative. A bare number is read as B1112 %.
 * @param {number|{rating:number, group:string}} material
 */
export function drillFeedFactor(material) {
  const row = typeof material === "string" ? materialById(material) : material;
  const rating = Number(row && typeof row === "object" ? row.rating : material) || 0;
  if (row && typeof row === "object" && ratingScale(row.group) !== B1112) {
    if (FREE_CUTTING_FAMILIES.includes(row.group)) return 1.25;
    if (row.group === "Copper alloys" && rating >= 80) return 1.25;
  }
  return Math.max(0.5, Math.min(1.25, 0.5 + rating / 200));
}

// Turning feed per rev starting points (inches per rev). Roughing 0.012 in/rev: Machinery's Handbook bases its
// turning speed tables on 0.012 in/rev at 0.125 in depth. Finishing 0.004 in/rev.
export const LATHE_ROUGH_IPR = 0.012;
export const LATHE_FINISH_IPR = 0.004;
// Hard turning (45 HRC and up): coated carbide / CBN at 0.05–0.15 mm/rev (Tungaloy "Hard Turning", AH8000
// grades — the same source as the library's hard-material caution). 0.004 in/rev = 0.10 mm/rev rough,
// 0.002 in/rev = 0.05 mm/rev finish: inside that range, toward the light end for a starting point.
export const HARD_TURN_HRC = 45;
export const HARD_ROUGH_IPR = 0.004;
export const HARD_FINISH_IPR = 0.002;

/**
 * Starting feed per rev for turning this material, in inches: the hard-turning feeds for a material sold at
 * 45 HRC or harder, the general roughing / finishing feeds otherwise. Shared by Speeds & feeds — lathe and
 * the job sheet so the two never disagree.
 * @param {string} materialId  library id
 * @param {"rough"|"finish"} cut
 */
export function latheFeedIpr(materialId, cut = "rough") {
  const hard = materialById(materialId)?.hrc >= HARD_TURN_HRC;
  if (cut === "finish") return hard ? HARD_FINISH_IPR : LATHE_FINISH_IPR;
  return hard ? HARD_ROUGH_IPR : LATHE_ROUGH_IPR;
}

/**
 * End-mill cautions. All lengths in inches. `machine` is the mill that applies (machineFor(c, "mill"));
 * `c` is the calculator context, so the spindle wording matches every other tool. `rpm` is the spindle the
 * screen shows (after the machine fit), so the too-fast line never flags a speed the max feed already slowed.
 */
export function millAdvice({ dIn, wocIn, docIn, rpm, machine, c }) {
  const out = [...spindleSanity(rpm, machine, "mill", c)];
  if (wocIn >= dIn * 0.95 * (1 - EPS)) out.push("Full-width slot: the chips have nowhere to go. Cut the feed 20–50%, and use a 2- or 3-flute in aluminum.");
  if (docIn > dIn * 2 * (1 + EPS)) out.push("Depth of cut is over 2× the tool diameter. Step down in passes or the tool will deflect and chatter.");
  return out;
}

/** Drilling cautions by depth-to-diameter ratio. */
export function drillAdvice({ dIn, depthIn }) {
  if (!(depthIn > 0) || !(dIn > 0)) return [];
  const ratio = depthIn / dIn;
  const past = (k) => ratio > k * (1 + EPS);
  if (past(8)) return [`${fmt(ratio, 1)}× diameter deep: peck (G83), drop speed and feed about 30%, and use a parabolic-flute drill or through-coolant if you have it.`];
  if (past(5)) return [`${fmt(ratio, 1)}× diameter deep: peck (G83) and drop speed and feed about 20% so the chips clear.`];
  if (past(3)) return [`${fmt(ratio, 1)}× diameter deep: peck (G83) to clear the chips.`];
  return [];
}
