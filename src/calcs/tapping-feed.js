// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tapping feed. Pro. Rigid/synchronized tapping: feed = RPM × lead, with machine feed clamp.

import { register } from "../app/registry.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, fromIn, COMMON_THREADS } from "./_util.js";
import { machineFor, fitToMachine, spindleSanity } from "./_machine.js";

export default register({
  id: "tapping-feed",
  title: "Tapping feed",
  short: "Feed for rigid tapping at an RPM",
  help: "Rigid tapping feed: the spindle and feed have to match the thread pitch exactly.",
  category: "drill",
  keywords: ["tap", "tapping", "rigid tap", "g84", "feed", "lead", "pitch"],
  pro: true,
  safety: "Rigid tapping needs a synchronized spindle. Check the control mode (M29 / G84) before running.",
  prefillRank: 12,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", suggest: COMMON_THREADS, label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20, M6" },
    { id: "rpm", label: "Spindle", kind: "int", default: "500", unit: "RPM", min: 1 },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const leadIn = t.pitchIn;
    // The machine caps the spindle; if the feed is still over its max, the spindle slows so feed = RPM × lead holds.
    const m = machineFor(c, "any");
    // A tap has no chip load: what the slower spindle keeps is feed per rev = the lead.
    const fit = fitToMachine(m, v.rpm, leadIn, c, { keep: "feed per rev equal to the thread lead", check: "the thread" });
    const rpm = fit.rpm;
    if (fit.cantRun) throw new Error(fit.problem);
    const feedOut = fit.feedIpm;
    const metric = c.units === "mm";
    const timeLen = metric ? 25 / 25.4 : 1; // a round length in the user's units: 25 mm or 1 in
    return {
      primary: { label: `Feed at ${rpm} RPM`, value: fromIn(feedOut, c.units), unit: c.L.feed, places: 2, clamped: rpm !== v.rpm },
      stats: [
        ...(rpm !== v.rpm ? [{ label: "Spindle (machine limit)", value: rpm, unit: "RPM", places: 0, clamped: true }, { label: "Wanted RPM", value: v.rpm, unit: "RPM", places: 0 }] : []),
        { label: "Lead (per rev)", value: fromIn(leadIn, c.units), unit: c.L.feedRev, places: 4 },
        { label: "G84 F word (per rev, G95)", value: fromIn(leadIn, c.units), unit: c.L.feedRev, places: 4 },
        { label: "Thread", text: `${t.label} · ${t.pitchLabel}` },
        { label: metric ? "Time for 25 mm of thread" : "Time for 1 in of thread", value: 60 * timeLen / feedOut, unit: "sec", places: 1 },
      ],
      warnings: [...(t.caution ? [t.caution] : []), ...fit.warnings, ...spindleSanity(rpm, m, "any", c)],
      source: "advanced",
      explain: [{ title: "Synchronized tapping", formula: "feed = RPM × lead   (lead = 1 ÷ TPI, or pitch for metric)",
        plugged: `= ${rpm} × ${fmt(fromIn(leadIn, c.units), 4)} ${c.L.length} = ${fmt(fromIn(feedOut, c.units), 2)} ${c.L.feed}` }],
      historyLabel: `${t.label} · ${v.rpm} RPM`,
    };
  },
});
