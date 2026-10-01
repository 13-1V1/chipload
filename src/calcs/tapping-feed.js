// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Tapping feed. Pro. Rigid/synchronized tapping: feed = RPM × lead, with machine feed clamp.

import { register } from "../app/registry.js";
import { tappingFeed } from "../core/tapping.js";
import { fmt } from "../core/format.js";
import { threadFromSpec, threadPrefill, toIn, fromIn } from "./_util.js";

export default register({
  id: "tapping-feed",
  title: "Tapping feed",
  short: "Feed for rigid tapping at an RPM",
  category: "drill",
  keywords: ["tap", "tapping", "rigid tap", "g84", "feed", "lead", "pitch"],
  pro: true,
  safety: "Rigid tapping needs a synchronized spindle. Check the control mode (M29 / G84) before running.",
  prefillRank: 12,
  prefill: (q) => threadPrefill(q),
  inputs: [
    { id: "thread", label: "Thread", kind: "text", default: "1/4-20", placeholder: "1/4-20, M6" },
    { id: "rpm", label: "Spindle", kind: "int", default: "500", unit: "RPM", min: 1 },
  ],
  compute(v, c) {
    const t = threadFromSpec(v.thread);
    const leadIn = t.pitchIn;
    const feedIpm = v.rpm * leadIn;
    const maxFeedIpm = c.machine?.maxFeed > 0 ? toIn(c.machine.maxFeed, c.machine.units || "in") : Infinity;
    const warnings = [];
    let rpm = v.rpm;
    if (feedIpm > maxFeedIpm) {
      rpm = Math.floor(maxFeedIpm / leadIn);
      warnings.push(`${c.machine.name} max feed is ${fmt(fromIn(maxFeedIpm, c.units), 1)} ${c.L.feed}. Tapping at ${v.rpm} RPM needs ${fmt(fromIn(feedIpm, c.units), 1)}. Drop to ${rpm} RPM.`);
    }
    const feedOut = rpm * leadIn;
    return {
      primary: { label: `Feed at ${rpm} RPM`, value: fromIn(feedOut, c.units), unit: c.L.feed, places: 2, clamped: rpm !== v.rpm },
      stats: [
        { label: "Lead (per rev)", value: fromIn(leadIn, c.units), unit: c.L.feedRev, places: 4 },
        { label: "G84 F word (per rev, G95)", value: fromIn(leadIn, c.units), unit: c.L.feedRev, places: 4 },
        { label: "Thread", text: `${t.label} · ${t.pitchLabel}` },
        { label: "Time for 1 in of thread", value: 60 / (feedOut / 1), unit: "sec", places: 1 },
      ],
      warnings,
      source: "advanced",
      explain: [{ title: "Synchronized tapping", formula: "feed = RPM × lead   (lead = 1 ÷ TPI, or pitch for metric)", plugged: `= ${rpm} × ${fmt(leadIn, 4)} = ${fmt(feedOut, 2)} IPM` }],
      historyLabel: `${t.label} · ${v.rpm} RPM`,
    };
  },
});
