// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// The Shop machine profile, applied the same way in every tool: which machine counts for this kind of
// work, and how a cut is fitted inside its top spindle speed and top feed.

import { fmt } from "../core/format.js";

/**
 * The active machine if it applies to this kind of work, else null. A lathe profile never limits an
 * end mill and a mill profile never limits a lathe tool; drilling and tapping run on either ("any").
 * (render.js only hands over a machine while Pro is on — Shop is Pro.)
 * @param {object} c       calculator context
 * @param {"mill"|"lathe"|"any"} work
 */
export function machineFor(c, work) {
  const m = c?.machine;
  if (!m) return null;
  if (work !== "any" && (m.type || "mill") !== work) return null;
  return m;
}

/** Top spindle speed, or Infinity when the profile has none. */
export const maxRpmOf = (m) => (m?.maxRpm > 0 ? m.maxRpm : Infinity);

/** Top feed in inches per minute, whatever units the machine was saved in; Infinity when it has none. */
export const maxFeedIpmOf = (m) => (m?.maxFeed > 0 ? (m.units === "mm" ? m.maxFeed / 25.4 : m.maxFeed) : Infinity);

// Float noise from an inch ⇄ mm round trip is not "over the limit".
const OVER = 1 + 1e-9;

/**
 * Fit a cut inside the machine. The spindle is capped at max RPM; if the feed at that speed is still more
 * than the machine can move, the spindle slows (to a whole RPM) until it isn't. Feed per rev never changes,
 * so the chip load holds — full RPM with a capped feed would rub a thin chip and dull the tool.
 * With no machine (m = null) the cut comes back as asked.
 *
 * When one turn of the spindle already moves more than the machine's top feed per minute (a feed per rev
 * typed in the feed field, say), no whole RPM can run the cut. Then rpm and feedIpm are 0, `cantRun` is
 * true and `problem` says why in the user's units. Callers show that message instead of numbers:
 * `if (fit.cantRun) throw new Error(fit.problem);` — a 0 RPM answer turns into Infinity times and F0 blocks.
 * @param {object|null} m   machine profile from machineFor()
 * @param {number} wantedRpm  spindle speed the surface speed asks for
 * @param {number} iprIn      feed per revolution in inches (flutes × chip load for a mill, lead for a tap)
 * @param {object} c          calculator context (units and labels for the warning text)
 * @returns {{ rpm: number, feedIpm: number, wantedRpm: number, wantedFeedIpm: number, rpmCapped: boolean, feedCapped: boolean, cantRun: boolean, problem: string|null, warnings: string[] }}
 */
export function fitToMachine(m, wantedRpm, iprIn, c) {
  const maxRpm = maxRpmOf(m);
  const maxFeed = maxFeedIpmOf(m);
  const wantedFeedIpm = wantedRpm * iprIn;
  const rpmCapped = wantedRpm > maxRpm * OVER;
  let rpm = rpmCapped ? maxRpm : wantedRpm;
  const feedAtRpm = rpm * iprIn;
  const feedCapped = feedAtRpm > maxFeed * OVER;
  // OVER again: 30 IPM ÷ 0.015 IPR may land a hair under 2000 and must still give 2000 RPM.
  if (feedCapped) rpm = Math.floor((maxFeed / iprIn) * OVER);
  const cantRun = feedCapped && rpm < 1;
  if (cantRun) rpm = 0;
  const feedIpm = rpm * iprIn;
  const inch = c.units === "in";
  const feedText = (ipm) => `${fmt(inch ? ipm : ipm * 25.4, 1)} ${c.L.feed}`;
  const problem = cantRun
    ? `${m.name} max feed is ${feedText(maxFeed)}, less than one turn at ${fmt(inch ? iprIn : iprIn * 25.4, inch ? 4 : 3)} ${c.L.feedRev}. Check the feed per rev, or the max feed in Shop.`
    : null;
  const warnings = [];
  // With both caps hit, the feed line says where the spindle lands; this one only says the machine's top.
  if (rpmCapped) warnings.push(`${m.name} tops out at ${fmt(maxRpm, 0)} RPM. Wanted ${fmt(wantedRpm, 0)}.${feedCapped || !(iprIn > 0) ? "" : ` Feed is figured at ${fmt(maxRpm, 0)} RPM so the chip load holds.`}`);
  if (cantRun) warnings.push(problem);
  else if (feedCapped) warnings.push(`${m.name} max feed is ${feedText(maxFeed)}. This cut needs ${feedText(feedAtRpm)}, so the spindle drops to ${fmt(rpm, 0)} RPM to keep the chip load.`);
  return { rpm, feedIpm, wantedRpm, wantedFeedIpm, rpmCapped, feedCapped, cantRun, problem, warnings };
}

/**
 * The fastest whole RPM a machine can run at this feed per rev without passing its top feed (Infinity when
 * nothing limits it); 0 when even one RPM is too fast — fitToMachine then reports `cantRun`.
 */
export function maxRpmAtFeed(m, iprIn) {
  const byFeed = iprIn > 0 ? Math.floor((maxFeedIpmOf(m) / iprIn) * OVER) : Infinity;
  return Math.min(maxRpmOf(m), byFeed);
}

/**
 * No machine set and the spindle number is beyond what most machines of this kind turn: say so instead of
 * handing over a confident RPM nobody can run.
 * @param {"mill"|"lathe"|"any"} work
 */
export function spindleSanity(rpm, m, work, c) {
  const limit = work === "lathe" ? 6000 : 20000;
  if (m || !(rpm > limit)) return [];
  const kind = work === "lathe" ? "lathes" : "spindles";
  const fix = c?.settings?.pro ? "Add your machine in Shop and the numbers get figured at its top speed." : "Run it at your machine's top speed and the feed per rev still holds.";
  return [`${fmt(rpm, 0)} RPM is more than most ${kind} turn. ${fix}`];
}
