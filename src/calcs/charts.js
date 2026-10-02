// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Chart screens: drill chart, tap drill chart, thread tables, G/M-code reference. All free.

import { register } from "../app/registry.js";
import { DRILL_CHART_INCH, DRILL_CHART_MM } from "../data/drills.js";
import { UN_THREAD_TABLE, TAP_DRILL_UN_TABLE } from "../data/threads-un.js";
import { METRIC_THREAD_TABLE, TAP_DRILL_METRIC_TABLE } from "../data/threads-metric.js";
import { G_CODES, M_CODES } from "../data/gcodes.js";
import { basicThreadGeometry } from "../core/thread.js";
import { decimalToFraction } from "../core/format.js";

register({
  id: "drill-chart",
  title: "Drill chart",
  short: "Number, letter, fraction, and metric drills",
  help: "Every drill size — number, letter, fraction, and metric — in order, with decimal inches and mm. Type a size or a name to jump to it.",
  category: "reference",
  keywords: ["drill chart", "drill size", "letter drill", "number drill", "wire gauge", "fraction", "metric drill"],
  view: "chart",
  placeholder: "Filter: #7, F, 0.2, 5/16, 6.5",
  columns: [
    { key: "label", label: "Drill" },
    { key: "size", label: "Inch", align: "right", places: 4 },
    { key: "mm", label: "mm", align: "right", places: 3 },
    { key: "frac", label: "Nearest 64th" },
  ],
  rows() {
    const inch = DRILL_CHART_INCH.map(([size, label]) => ({ label, size, mm: size * 25.4 }));
    const metric = DRILL_CHART_MM.map((mm) => ({ label: `${mm} mm`, size: mm / 25.4, mm }));
    return [...inch, ...metric].sort((a, b) => a.size - b.size).map((r) => ({ ...r, frac: decimalToFraction(r.size, { tolerance: 1 / 128 })?.text ?? "" }));
  },
});

register({
  id: "tap-drill-chart",
  title: "Tap drill chart",
  short: "Stock tap drills, UN and metric",
  help: "The standard tap drill for every common inch and metric thread, at about 75% thread.",
  category: "reference",
  keywords: ["tap drill chart", "tap chart", "unc", "unf", "metric tap"],
  view: "chart",
  placeholder: "Filter: 1/4-20, #10, M8",
  columns: [
    { key: "thread", label: "Thread" },
    { key: "drill", label: "Tap drill" },
    { key: "dec", label: "Decimal", align: "right", places: 4 },
    { key: "pct", label: "%", align: "right", places: 0 },
  ],
  rows() {
    const un = UN_THREAD_TABLE.map(([major, tpi, name]) => {
      const row = TAP_DRILL_UN_TABLE[`${major.toFixed(4)}|${tpi}`];
      return row ? { thread: name, drill: row[1], dec: row[0], pct: row[2], sort: major } : null;
    }).filter(Boolean);
    const metric = METRIC_THREAD_TABLE.map(([major, pitch, name]) => {
      const row = TAP_DRILL_METRIC_TABLE[`${major.toFixed(1)}|${pitch.toFixed(2)}`];
      return row ? { thread: name, drill: row[1], dec: row[0] / 25.4, pct: row[2], sort: major / 25.4 } : null;
    }).filter(Boolean);
    return [...un, ...metric];
  },
});

register({
  id: "thread-chart",
  title: "Thread chart",
  short: "UN and metric sizes with pitch and minor diameters",
  help: "Basic sizes for every standard inch and metric thread: major, pitch, and minor diameters.",
  category: "thread",
  keywords: ["thread chart", "unc", "unf", "unef", "metric", "pitch diameter", "minor"],
  view: "chart",
  placeholder: "Filter: 3/8, UNF, M12",
  columns: [
    { key: "thread", label: "Thread" },
    { key: "major", label: "Major", align: "right", places: 4 },
    { key: "pd", label: "Pitch dia", align: "right", places: 4 },
    { key: "minor", label: "Minor (int)", align: "right", places: 4 },
    { key: "pitch", label: "Pitch", align: "right" },
  ],
  rows() {
    const un = UN_THREAD_TABLE.map(([major, tpi, name]) => { const g = basicThreadGeometry(major, 1 / tpi); return { thread: name, major, pd: g.pitchDiameter, minor: g.internalMinor, pitch: `${tpi} TPI` }; });
    const metric = METRIC_THREAD_TABLE.map(([major, pitch, name]) => { const g = basicThreadGeometry(major, pitch); return { thread: name, major, pd: g.pitchDiameter, minor: g.internalMinor, pitch: `${pitch} mm` }; });
    return [...un, ...metric];
  },
  note: "UN values in inches, metric in mm. Basic (nominal) dimensions.",
});

register({
  id: "gcode-ref",
  title: "G-code & M-code reference",
  short: "Fanuc / Haas codes with plain meanings",
  help: "What each G and M code does, in plain words. Fanuc / Haas style; your control may differ a little.",
  category: "reference",
  keywords: ["g-code", "gcode", "m-code", "g81", "g83", "g43", "g54", "m03", "m30", "canned cycle", "fanuc", "haas", "what does g", "code meaning", "g code list"],
  view: "chart",
  placeholder: "Filter: G8, tap, coolant, offset",
  columns: [{ key: "code", label: "Code" }, { key: "meaning", label: "Meaning", long: true }, { key: "note", label: "Note", long: true }],
  rows() {
    return [
      ...G_CODES.map(([code, meaning, group, note]) => ({ code, meaning, note: [group, note].filter(Boolean).join(" · ") })),
      ...M_CODES.map(([code, meaning, note]) => ({ code, meaning, note })),
    ];
  },
  note: "Fanuc / Haas dialect. Check your controller's manual for differences.",
});
