// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Home search, one table: what people type, the tool that must come first, what it must be filled in with, and
// what must stay away. Every query earlier search tests and fix rounds pinned is here, plus everyday questions a
// hobbyist or a machinist types. A change to the search rules has to pass the whole table, not just the new rows.
//
// Fields: q · top (id, or ids any of which may lead) · pre (params the top hit must carry) · find ({ id: params }
// a hit must carry somewhere in the list; null = that tool must not be listed at all) · noThread (no hit fills in a
// thread) · not (ids kept out of the top 3) · near (ids that must be in the top 3) · src (where the row came from:
// ui = ui-search.test, r4 = app-search-round4.test, e2e = tests/e2e/app.test, f1/f3/f4/f5 = that round's findings,
// rv / rv2 = the round 5 reviews, day = everyday wording). r5: the row failed on the code at 0876d13 and was fixed
// in round 5 (77 of 354 rows, plus the empty-chart and chart-filter tests at the bottom). The rv2 code rows had
// the right top hit at 0876d13 and fail there only because the G-code list wasn't offered filtered to the code.
//
// Sources for the readings: ASME B1.1 (inch thread series; designations are written size-TPI with a hyphen), ISO 261
// (metric "M10 x 1.25"), ASME B1.20.1 (NPT: 1/2-14, 1-1/4-11.5, 2-1/2-8), ASME B18.3 (SHCS clearance, #10 by its
// screw), ASME B94.11M (number and letter drills), Machinery's Handbook tap drill chart (1/4-20 → #7).

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs, getCalc } from "../../src/app/registry.js";
import { searchCalcs } from "../../src/app/search.js";
import { chartCells, chartFilter } from "../../src/app/chart-filter.js";
import { UNIT_LABEL } from "../../src/app/settings.js";

const CORPUS = [
  // ── tests/core/ui-search.test.mjs ──
  { q: "8.5 mm", top: "fraction-converter", pre: { value: "8.5", units: "mm" }, src: "ui f1 e2e" },
  { q: "8.5mm", top: "fraction-converter", pre: { value: "8.5", units: "mm" }, src: "ui f1" },
  { q: "8.5 millimeters", top: "fraction-converter", pre: { units: "mm" }, src: "ui" },
  { q: "drill 8.5 mm", top: "fraction-converter", pre: { value: "8.5", units: "mm" }, src: "ui" },
  { q: "1 1/4", top: ["fraction-converter", "npt"], find: { "fraction-converter": { value: "1 1/4" }, npt: { size: "1-1/4-11.5" } }, src: "ui f1" },
  { q: "1 1/4 npt", top: "npt", pre: { size: "1-1/4-11.5" }, src: "ui e2e" },
  { q: "1-1/4 npt", top: "npt", pre: { size: "1-1/4-11.5" }, src: "ui f1" },
  { q: "2 1/2 npt", top: "npt", pre: { size: "2-1/2-8" }, src: "ui f1" },
  { q: "tap drill 1 1/8-7", top: "tap-drill", pre: { thread: "1 1/8-7" }, src: "ui f1" },
  { q: "aluminum end mill", top: "feeds-mill", src: "ui f1" },
  { q: "how fast should i run a 1/2 end mill in aluminum", top: "feeds-mill", src: "ui f1" },
  { q: "drill 304 stainless", top: "feeds-drill", src: "ui f1" },
  { q: "how fast drill steel", top: "feeds-drill", src: "ui f1" },
  { q: "#10 screw", top: "shcs", pre: { q: "#10" }, src: "ui f1" },
  { q: "#7 drill", top: "drill-chart", pre: { q: "#7" }, src: "ui r4 f1" },
  { q: "6061", top: "materials", src: "ui" },
  { q: "rpm", top: "feeds-mill", src: "ui e2e" },
  { q: "tap", top: "tap-drill", src: "ui" },
  { q: "1/4-20", top: "tap-drill", pre: { thread: "1/4-20" }, near: ["thread-data"], src: "ui e2e" },
  { q: "drill chart 1/4-20", top: "drill-chart", pre: {}, find: { "tap-drill-chart": { q: "1/4-20" } }, noChartQ: "drill-chart", src: "ui f3" },
  { q: "what drill for 1/4-20", top: "tap-drill", pre: { thread: "1/4-20" }, noChartQ: "drill-chart", src: "ui f3" },
  { q: "tap drill chart 1/4-20", top: "tap-drill-chart", pre: { q: "1/4-20" }, src: "ui" },
  { q: "#10 counterbore", top: "shcs", pre: { q: "#10" }, src: "ui f3 day" },
  { q: "counterbore for #10", top: "shcs", pre: { q: "#10" }, src: "ui f3" },
  { q: "#10 clearance", top: "shcs", pre: { q: "#10" }, src: "ui f3" },
  { q: "#10 cbore", top: "shcs", pre: { q: "#10" }, src: "ui" },
  { q: "#10 spotface", top: "shcs", pre: { q: "#10" }, src: "ui" },
  { q: "#10 drill clearance", top: "shcs", pre: { q: "#10" }, src: "ui" },
  { q: "clearance drill for #10", top: "shcs", pre: { q: "#10" }, src: "ui" },
  { q: "#10 counterbore depth", top: "shcs", pre: { q: "#10" }, src: "f3" },
  { q: "#10", top: "drill-chart", pre: { q: "#10" }, src: "ui" },
  { q: "#10 drill", top: "drill-chart", pre: { q: "#10" }, src: "ui" },
  { q: "M10 1.25", top: "tap-drill", pre: { thread: "M10x1.25" }, src: "ui f3 day" },
  { q: "m8 1", top: "tap-drill", pre: { thread: "M8x1" }, src: "ui f3" },
  { q: "tap drill M8 1", top: "tap-drill", pre: { thread: "M8x1" }, src: "ui f3" },
  { q: "1/4 28", top: "tap-drill", pre: { thread: "1/4-28" }, src: "ui f3" },
  { q: "1/4 20", top: "tap-drill", pre: { thread: "1/4-20" }, src: "ui r4" },
  { q: "what drill for 3/8 24", top: "tap-drill", pre: { thread: "3/8-24" }, src: "ui" },
  { q: "1/2 2 flute end mill", top: "feeds-mill", noThread: true, src: "ui" },
  { q: "#10 32", top: "tap-drill", pre: { thread: "#10-32" }, noChartNumber: true, src: "ui" },
  { q: "#8 32", top: "tap-drill", pre: { thread: "#8-32" }, noChartNumber: true, src: "ui" },
  { q: "#4 40", top: "tap-drill", pre: { thread: "#4-40" }, noChartNumber: true, src: "ui" },
  { q: "#10 24", top: "tap-drill", pre: { thread: "#10-24" }, noChartNumber: true, src: "ui" },
  { q: "tap drill #10 32", top: "tap-drill", pre: { thread: "#10-32" }, noChartNumber: true, src: "ui" },
  { q: "tap drill chart #10 32", top: "tap-drill-chart", pre: { q: "#10-32" }, src: "ui" },
  { q: "1/2 8 flute", noThread: true, top: "feeds-mill", src: "ui r5" },
  { q: "3/4 10 flute end mill", top: "feeds-mill", noThread: true, src: "ui" },
  { q: "1/2 8 flute end mill", top: "feeds-mill", noThread: true, src: "ui" },
  { q: "1/2 8", noThread: true, src: "ui" },
  { q: "3/8 4 fl", top: "feeds-mill", noThread: true, src: "ui r5" },
  { q: "3/4 10", top: "tap-drill", pre: { thread: "3/4-10" }, src: "ui r4" },
  { q: "M10 x 1.25 tap drill", top: "tap-drill", pre: { thread: "M10x1.25" }, oneThread: "M10x1.25", src: "ui" },
  { q: "tap drill M10 x 1.25", top: "tap-drill", pre: { thread: "M10x1.25" }, oneThread: "M10x1.25", src: "ui" },
  { q: "M10 × 1.25", top: "tap-drill", pre: { thread: "M10x1.25" }, oneThread: "M10x1.25", src: "ui" },
  { q: "M10 x1.25", top: "tap-drill", pre: { thread: "M10x1.25" }, oneThread: "M10x1.25", src: "ui" },
  { q: "M10 ×1.25", top: "tap-drill", pre: { thread: "M10x1.25" }, oneThread: "M10x1.25", src: "ui" },
  { q: "M8 x 1", top: "tap-drill", pre: { thread: "M8x1" }, oneThread: "M8x1", src: "ui" },
  { q: "1/4 - 28", top: "tap-drill", pre: { thread: "1/4-28" }, oneThread: "1/4-28", src: "ui" },
  { q: "#10 x 32", top: "tap-drill", pre: { thread: "#10-32" }, oneThread: "#10-32", src: "ui" },
  { q: "1/2 x 2 flute end mill", top: "feeds-mill", noThread: true, src: "ui" },
  // ISO 261: M8 x 20 is an M8 screw 20 mm long; 1/4 x 1 is a 1/4 screw 1 in long
  { q: "M8 x 20", top: "tap-drill", pre: { thread: "M8" }, oneThread: "M8", src: "ui r5" },
  { q: "1/4 x 1", noThread: true, not: ["thermal", "true-position"], src: "ui r5" },
  { q: "M10 3", badThread: "M10x3", src: "ui" },
  { q: "endmill", top: "feeds-mill", src: "ui f3" },
  { q: "end-mill", top: "feeds-mill", src: "ui" },
  { q: "endmills", top: "feeds-mill", src: "ui" },
  { q: "endmill aluminum", top: "feeds-mill", src: "ui r4 f3" },
  { q: "how fast should i run a 1/2 endmill in aluminum", top: "feeds-mill", src: "ui f3" },
  { q: "steel hardness", top: "hardness", src: "ui r4 f3" },
  { q: "brass tap", top: ["tap-drill", "tapping-feed"], src: "ui r4 f3" },
  { q: "tap aluminum", top: ["tap-drill", "tapping-feed"], src: "ui r4" },
  { q: "aluminum", find: { materials: {} }, src: "ui" },
  { q: "aluminum density", top: "materials", src: "ui r4" },
  { q: "steel weight", top: "material-weight", src: "ui r4" },
  { q: '3/8"', top: "fraction-converter", pre: { value: "3/8", units: "in" }, src: "ui f1" },
  { q: "1-1/4", top: "fraction-converter", pre: { value: "1 1/4" }, src: "ui f1" },
  { q: "13/64in", top: "fraction-converter", pre: { value: "13/64", units: "in" }, src: "ui f1" },

  // ── tests/core/app-search-round4.test.mjs ──
  ...["1/2 drill steel", "1/2 drill aluminum", "3/8 drill stainless", "steel 1/2 drill", "1/2 drill in aluminum", "10mm drill steel",
    "drill 1/2 in steel", "what speed for a 1/2 drill in steel"].map((q) => ({ q, top: "feeds-drill", src: "r4 f4" })),
  { q: "#7 drill aluminum", top: "drill-chart", pre: { q: "#7" }, near: ["feeds-drill"], src: "r4 f4" },
  { q: "aluminum #7 drill", top: "drill-chart", pre: { q: "#7" }, near: ["feeds-drill"], src: "r4 f4" },
  { q: "#10 steel", top: "drill-chart", pre: { q: "#10" }, near: ["feeds-drill"], src: "f4" },
  { q: "1/2 drill", top: "fraction-converter", pre: { value: "1/2" }, src: "r4" },
  { q: "stainless surface roughness", top: "surface-finish", src: "r4" },
  { q: "aluminum shop rate", top: "quote", src: "r4" },
  { q: "steel part off", top: "lathe-cycle", src: "r4" },
  { q: "aluminum fit", top: "fits", src: "r4" },
  { q: "aluminum ball end mill", top: "ball-nose", src: "r4" },
  { q: "steel centre drill", top: "center-drill", src: "r4" },
  { q: "steel lathe center", top: "center-drill", src: "r4" },
  { q: "aluminum feed comp", top: "thread-mill", src: "r4" },
  { q: "aluminum turning time", top: "lathe-cycle", src: "r4" },
  { q: "aluminum angle", top: "right-triangle", src: "r4" },
  { q: "aluminum thread mill", top: "thread-mill", src: "r4" },
  { q: "aluminum cycle time", top: "lathe-cycle", src: "r4" },
  { q: "steel tap drill", top: "tap-drill", src: "r4" },
  { q: "1/4 tap aluminum", top: ["tap-drill", "tapping-feed", "tap-drill-chart"], not: ["npt"], src: "r4 f4" },
  { q: "1/4-20 tap aluminum", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "M8 tap steel", top: ["tap-drill", "tapping-feed", "tap-drill-chart"], src: "r4" },
  { q: "1/2 endmill aluminum", top: "feeds-mill", src: "r4" },
  { q: "1/4-20 drill aluminum", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "1/4-20 drill steel", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "drill for 1/4-20 aluminum", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "M8x1.25 drill steel", top: "tap-drill", pre: { thread: "M8x1.25" }, src: "r4" },
  { q: "1/4-20 rpm aluminum", top: "tapping-feed", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "M8x1.25 rpm steel", top: "tapping-feed", pre: { thread: "M8x1.25" }, src: "r4" },
  { q: "1/4-20 feed steel", pre: { thread: "1/4-20" }, src: "r4" },
  // ASME B1.1 lists 3-1/2-6, 2-1/2-8, 1-1/2-6 and 3/4-10, but a hole count or a blade's teeth is not a TPI
  { q: "bolt circle 3.5 6 holes", top: "bolt-circle", noThread: true, src: "r4 f4" },
  { q: "bolt circle 2.5 8 holes", top: "bolt-circle", noThread: true, src: "r4 f4" },
  { q: "1.5 6 holes", top: "bolt-circle", noThread: true, src: "r4 f4" },
  { q: "3/4 10 teeth", top: "saw-speed", noThread: true, src: "r4 f4" },
  { q: "saw 3/4 10 tpi", top: "saw-speed", noThread: true, src: "r4" },
  { q: "bandsaw 14 tpi", top: "saw-speed", noThread: true, src: "r4" },
  { q: "bolt circle M8 1", top: "bolt-circle", find: { "tap-drill": { thread: "M8x1" } }, src: "r4" },
  { q: "M8 1.25 holes", top: "bolt-circle", find: { "tap-drill": { thread: "M8x1.25" } }, src: "r4" },
  { q: "tap drill 1/4 20 holes", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "what drill for a 1/4 20 hole", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "1/4 20 hole", top: "tap-drill", pre: { thread: "1/4-20" }, src: "r4" },
  { q: "1/2 13 hole", top: "tap-drill", pre: { thread: "1/2-13" }, src: "r4" },
  { q: "3/8 16 hole", top: "tap-drill", pre: { thread: "3/8-16" }, src: "r4" },
  { q: "1.5 6 hole pattern", top: "bolt-circle", noThread: true, src: "r4" },
  { q: "bolt circle 1/2 13 tap 6 holes", top: "bolt-circle", find: { "tap-drill": { thread: "1/2-13" }, npt: null }, src: "r4" },
  { q: "0.25 20", top: "tap-drill", find: { "tap-drill": {} }, sameTopAs: ".25 20", src: "r4 f4" },
  { q: ".25 20", top: "tap-drill", src: "r4 f4" },
  { q: ".25 drill", find: { "fraction-converter": { value: ".25" } }, src: "r4" },
  { q: "0.25 drill", find: { "fraction-converter": { value: "0.25" } }, src: "r4" },

  // ── tests/e2e/app.test.mjs ──
  { q: "how fast band saw", top: "saw-speed", src: "e2e day" },
  { q: "bandsaw blade", top: "saw-speed", src: "e2e" },
  { q: "what drill for a 1/4-20 tap", top: "tap-drill", pre: { thread: "1/4-20" }, src: "e2e day" },
  { q: "screw hole", top: "shcs", src: "e2e day" },
  { q: "clearance hole for a 3/8 bolt", top: "shcs", pre: { q: "3/8" }, src: "e2e" },
  { q: "set up a job", top: "job-sheet", src: "e2e" },
  { q: "zzzz", empty: true, src: "e2e" },

  // ── round 5 findings (fix5/search.json) ──
  // h-app#0: a leading-dot decimal reads as its 0-prefixed form (the chart rows are checked below)
  { q: ".5 drill chart", top: "drill-chart", pre: { q: ".5" }, src: "f5" },
  { q: ".25 counterbore", top: "shcs", pre: { q: ".25" }, src: "f5" },
  { q: ".375 drill", top: "fraction-converter", pre: { value: ".375" }, src: "f5" },
  // h-app#1: a fastener named after the size and pitch makes it a thread (ASME B1.1 1/2-13 UNC), never the 1/2 NPT
  { q: "bolt circle 1/2 13 shcs", top: "bolt-circle", find: { shcs: { q: "1/2-13" }, "tap-drill": { thread: "1/2-13" }, npt: null }, src: "f5 r5" },
  { q: "1/2 13 screw bolt circle", top: "bolt-circle", find: { "tap-drill": { thread: "1/2-13" }, npt: null }, src: "f5 r5" },
  { q: "bolt circle 1/4 20 bolts", top: "bolt-circle", find: { "tap-drill": { thread: "1/4-20" }, npt: null }, src: "f5 r5" },
  { q: "bolt circle 3/8 16 cap screws", top: "bolt-circle", find: { "tap-drill": { thread: "3/8-16" }, npt: null }, src: "f5 r5" },
  // a decimal in a bolt-circle question is the circle: six bolts on a 3.5 in circle, not 3-1/2-6 UN
  { q: "bolt circle 3.5 6 bolts", top: "bolt-circle", noThread: true, src: "f5" },
  // h-app#2: W x N in a saw or bolt-circle question is a width (or diameter) and a count; a typed hyphen is a callout
  { q: "bandsaw blade 3/4 x 10", top: "saw-speed", noThread: true, src: "f5 r5" },
  { q: "3/4 x 10 tpi blade", top: "saw-speed", noThread: true, src: "f5 day r5" },
  { q: "3/8 x 16 tpi bandsaw", top: "saw-speed", noThread: true, src: "f5 r5" },
  { q: "bolt circle 3.5 x 6", top: "bolt-circle", noThread: true, src: "f5 r5" },
  { q: "saw 3/4 - 10", top: "saw-speed", find: { "tap-drill": { thread: "3/4-10" } }, src: "f5" },
  { q: "bandsaw 3/4-10", top: "saw-speed", find: { "tap-drill": { thread: "3/4-10" } }, src: "f5" },
  { q: "tap 3/4 x 10", top: "tap-drill", pre: { thread: "3/4-10" }, src: "f5" },
  { q: "bolt circle 1/2 x 13 tap", top: "bolt-circle", find: { "tap-drill": { thread: "1/2-13" } }, src: "f5" },
  // h-app#3: "tooth" is "teeth"
  { q: "3/4 10 tooth", top: "saw-speed", noThread: true, src: "f5 r5" },
  { q: "tooth", top: "saw-speed", src: "f5 r5" },
  { q: "2 tooth", top: "saw-speed", src: "f5 r5" },
  { q: "10 tooth blade", top: "saw-speed", find: { "fraction-converter": null }, src: "f5 r5" },
  { q: "chip load per tooth", top: "chip-thinning", src: "f5" },
  // h-app#4 / open-app-187: a number search read as a count is no catalog word
  { q: "drill pattern 1/4 20", near: ["drill-chart"], not: ["npt"], src: "f5 r5" },
  { q: "saw 1/2 20", top: "saw-speed", find: { thermal: null }, noThread: true, src: "f5 r5" },
  { q: "1/2 20 blade", top: "saw-speed", find: { thermal: null }, noThread: true, src: "f5 r5" },
  { q: "bolt circle 3.5 6", top: "bolt-circle", noThread: true, src: "f5" },
  ...["bhc 3.5 6", "3.5 6 bhc", "bhc 1/4 28", "1/4 28 bhc", "bhc 1.5 6", "pcd 3.5 6", "pcd 1/4 28", "pcd 1.5 6", "hole pattern 3.5 6",
    "bcd 3.5 6", "bcd 2.5 8"].map((q) => ({ q, top: "bolt-circle", noThread: true, not: ["fits"], src: "f5 r5" })),
  ...["hacksaw 3.5 6", "hacksaw 2.5 8", "hacksaw 1/4 28"].map((q) => ({ q, top: "saw-speed", noThread: true, not: ["fits"], src: "f5 r5" })),
  // open-app-100: a typed hyphen is a thread callout whatever follows; "x" reads like a space
  { q: "1/4 - 20 holes", top: "bolt-circle", find: { "tap-drill": { thread: "1/4-20" } }, src: "f5 r5" },
  { q: "1/4 - 20 pcs", top: "tap-drill", pre: { thread: "1/4-20" }, src: "f5 r5" },
  { q: "1/4-20 holes", top: "bolt-circle", find: { "tap-drill": { thread: "1/4-20" } }, src: "f5" },
  { q: "1/4 20 holes", top: "bolt-circle", noThread: true, src: "f5" },
  { q: "1/4 x 20 holes", top: "bolt-circle", noThread: true, find: { thermal: null }, src: "f5 r5" },

  // ── round 5 review: a flute word hints at an end mill but never outvotes the tool named next to it; a control
  // code opens the G-code list filtered to that code, beside whatever the other words find ──
  ...["4 flute tap", "4 fl tap", "fluted tap"].map((q) => ({ q, top: "tap-drill", not: ["feeds-mill", "ball-nose"], src: "rv" })),
  ...["straight flute tap 1/4-20", "tap 1/4-20 spiral flute"].map((q) => ({ q, top: "tap-drill", pre: { thread: "1/4-20" }, not: ["feeds-mill", "ball-nose"], src: "rv" })),
  { q: "spiral flute tap 3/8-16", top: "tap-drill", pre: { thread: "3/8-16" }, not: ["feeds-mill", "ball-nose"], src: "rv" },
  { q: "fluted reamer .250", top: "ream", find: { "feeds-mill": null }, src: "rv" },
  { q: "4 flute reamer", top: "ream", find: { "feeds-mill": null }, src: "rv" },
  ...["chucking reamer 4 flute", "straight flute reamer"].map((q) => ({ q, top: "ream", find: { "feeds-mill": null }, src: "rv r5" })),
  { q: "flute", top: "feeds-mill", src: "rv r5" },
  // a unit on a size reads the way the chart rows write it ("10 mm", 1/2")
  { q: "drill chart 8.5mm", top: "drill-chart", pre: { q: "8.5mm" }, src: "day" },
  { q: "drill chart 1/2 in", top: "drill-chart", pre: { q: "1/2 in" }, src: "day" },
  { q: "g81 1/2 drill", near: ["drill-chart"], find: { "gcode-ref": { q: "g81" }, "drill-chart": { q: "1/2" } }, src: "rv r5" },
  ...["g83 peck 0.25 drill", "g83 peck 1/4 drill"].map((q) => ({ q, top: "gcode-ref", pre: { q: "g83" }, src: "rv r5" })),
  { q: "g84 3/8-16", top: "tapping-feed", pre: { thread: "3/8-16" }, find: { "gcode-ref": { q: "g84" } }, src: "rv r5" },
  ...[["m06 tool change", "m06"], ["m06 t1", "m06"], ["g01 feed", "g01"], ["g00 rapid", "g00"], ["m08 coolant", "m08"], ["g83 drill", "g83"],
    ["g54 work offset", "g54"], ["m03 rpm", "m03"]].map(([q, code]) => ({ q, top: "gcode-ref", pre: { q: code }, noThread: true, src: "rv r5" })),
  // round 5 review 2: a code next to the name of the tool that makes it opens that tool, as at 0876d13 (circle-interp
  // lists G02, lathe-feeds G96, tapping-feed G84); the G-code list stays below it, filtered to the code
  ...[["g02 circle", "circle-interp", "g02"], ["g02 circle interpolation feed", "circle-interp", "g02"], ["g84 tapping feed", "tapping-feed", "g84"],
    ["g84 rigid tap feed", "tapping-feed", "g84"], ["bolt circle g81", "bolt-circle", "g81"], ["g81 bolt circle 6 holes", "bolt-circle", "g81"],
    ["g96 lathe rpm", "lathe-feeds", "g96"], ["g96 sfm", "lathe-feeds", "g96"], ["lathe g96 400 sfm 2 inch", "lathe-feeds", "g96"],
    ["g41 nose radius", "tnr-comp", "g41"], ["g03 fillet", "fillet", "g03"]]
    .map(([q, top, code]) => ({ q, top, noThread: true, find: { "gcode-ref": { q: code } }, src: "rv2 r5" })),
  { q: "g02 arc", top: ["circle-interp", "fillet"], find: { "gcode-ref": { q: "g02" } }, src: "rv2 r5" },
  // a whole number after the value is a count or a length only after a thread or in a counting question; anywhere
  // else it is an angle or a ratio a tool lists (a 135° drill point, a 1 in 12 taper), never the 1/2 or 1 in NPT
  ...["drill 1/2 135", "1/2 135 drill", "1/2 drill 135"].map((q) => ({ q, top: "drill-point", noThread: true, not: ["npt"], src: "rv2" })),
  ...["taper 1 12", "taper 1 20", "1 20 taper", "taper 2 10"].map((q) => ({ q, top: "taper", noThread: true, src: "rv2" })),
  // an inch decimal names no row of the tap drill chart in mm (it lists the #7 drill as 5.105): no filter there
  { q: "tap drill chart 0.201", top: "tap-drill-chart", pre: {}, src: "rv2 r5" },
  ...["0.201 tap drill", "tap drill 0.201"].map((q) => ({ q, top: ["tap-drill", "tap-drill-chart"], src: "rv2" })),
  ...["0.257 drill", "0.3125 drill"].map((q) => ({ q, top: "fraction-converter", find: { "drill-chart": { q: q.split(" ")[0] } }, src: "rv2" })),

  // ── everyday questions ──
  { q: "speeds for 1/2 end mill in aluminum", top: "feeds-mill", src: "day" },
  { q: "1/2 drill in steel", top: "feeds-drill", src: "day" },
  { q: "bolt circle 6 holes 3.5", top: "bolt-circle", noThread: true, find: { "fraction-converter": { value: "3.5" } }, src: "day r5" },
  { q: "6 hole bolt circle", top: "bolt-circle", find: { "fraction-converter": null }, src: "day r5" },
  { q: "bolt circle 4 holes 2.5 inch", top: "bolt-circle", find: { "fraction-converter": { value: "2.5" } }, src: "day r5" },
  { q: "bolt hole circle 8 holes 4 inch", top: "bolt-circle", find: { "fraction-converter": { value: "4" } }, src: "day r5" },
  { q: "pcd 100mm 6 holes", top: "bolt-circle", find: { "fraction-converter": { value: "100", units: "mm" } }, src: "day" },
  { q: "bolt circle calculator", top: "bolt-circle", src: "day" },
  { q: "3 flute 1/2 end mill", top: "feeds-mill", find: { "fraction-converter": { value: "1/2" } }, not: ["npt"], src: "day r5" },
  { q: "1/2 4 flute", top: "feeds-mill", noThread: true, src: "day r5" },
  { q: "1/2 4 flute end mill steel", top: "feeds-mill", src: "day" },
  { q: "rpm for 1/4 end mill", top: "feeds-mill", src: "day" },
  { q: "1/4 end mill aluminum", top: "feeds-mill", src: "day" },
  { q: "6mm end mill aluminum", top: "feeds-mill", src: "day" },
  { q: "25mm end mill", top: "feeds-mill", src: "day" },
  { q: "1 inch end mill", top: "feeds-mill", src: "day" },
  { q: "feed rate end mill", top: "feeds-mill", src: "day" },
  { q: "how fast to drill 1/2 hole in steel", top: "feeds-drill", src: "day" },
  { q: "rpm for 3/8 drill", top: "feeds-drill", src: "day" },
  { q: "feed for 1/2 drill", top: "feeds-drill", src: "day" },
  { q: "drill 1 inch steel", top: "feeds-drill", src: "day" },
  { q: "drill speed", top: "feeds-drill", src: "day" },
  { q: "band saw speed aluminum", top: "saw-speed", src: "day" },
  { q: "saw blade speed steel", top: "saw-speed", src: "day" },
  { q: "hacksaw blade tpi", top: "saw-speed", src: "day" },
  { q: "how many teeth bandsaw", top: "saw-speed", src: "day" },
  { q: "blade tpi for 1/4 wall tube", top: "saw-speed", noThread: true, src: "day" },
  { q: "tap drill for 1/4-20", top: "tap-drill", pre: { thread: "1/4-20" }, src: "day" },
  { q: "what size tap drill for 5/16-18", top: "tap-drill", pre: { thread: "5/16-18" }, src: "day" },
  { q: "tap drill 3/8-24", top: "tap-drill", pre: { thread: "3/8-24" }, src: "day" },
  { q: "tap drill for 1/2-13", top: "tap-drill", pre: { thread: "1/2-13" }, src: "day" },
  { q: "1/4 20 tap", top: "tap-drill", pre: { thread: "1/4-20" }, src: "day" },
  { q: "3/8 24 tap", top: "tap-drill", pre: { thread: "3/8-24" }, src: "day" },
  { q: "1/4 28 tap drill", top: "tap-drill", pre: { thread: "1/4-28" }, src: "day" },
  { q: "how to tap 1/4-20", top: "tap-drill", pre: { thread: "1/4-20" }, src: "day" },
  { q: "3/8-16 tap", top: "tap-drill", pre: { thread: "3/8-16" }, src: "day" },
  { q: "#10-24 tap drill", top: "tap-drill", pre: { thread: "#10-24" }, src: "day" },
  { q: "6-32 tap", top: "tap-drill", pre: { thread: "6-32" }, src: "day" },
  { q: "10-32", top: "tap-drill", pre: { thread: "10-32" }, src: "day" },
  { q: "#8-32", top: "tap-drill", pre: { thread: "#8-32" }, src: "day" },
  { q: "5/8 11", top: "tap-drill", pre: { thread: "5/8-11" }, src: "day" },
  { q: "1/2 13", top: "tap-drill", pre: { thread: "1/2-13" }, src: "day" },
  { q: "M10 1.5", top: "tap-drill", pre: { thread: "M10x1.5" }, src: "day" },
  { q: "m10 x 1.5", top: "tap-drill", pre: { thread: "M10x1.5" }, src: "day" },
  { q: "M12 1.75 tap drill", top: "tap-drill", pre: { thread: "M12x1.75" }, src: "day" },
  { q: "what drill for m8", top: "tap-drill", pre: { thread: "m8" }, src: "day" },
  { q: "metric tap drill m10", top: "tap-drill", pre: { thread: "m10" }, src: "day" },
  { q: "thread pitch m8", top: "thread-data", pre: { thread: "m8" }, src: "day" },
  { q: "1/2-13 thread", top: ["thread-data", "thread-mill"], pre: { thread: "1/2-13" }, src: "day" },
  { q: "1/4 20 screw", top: "tap-drill", pre: { thread: "1/4-20" }, src: "day" },
  { q: "helicoil 1/4-20", top: "sti", pre: { thread: "1/4-20" }, src: "day" },
  { q: "helicoil m6", top: "sti", pre: { thread: "m6" }, src: "day" },
  { q: "measure over wires 1/4-20", top: "mow", pre: { thread: "1/4-20" }, src: "day" },
  { q: "1/2-10 acme", top: "acme", src: "day" },
  { q: "what size drill for 3/8 npt", top: "npt", pre: { size: "3/8-18" }, src: "day" },
  { q: "1/2 npt", top: "npt", pre: { size: "1/2-14" }, src: "day" },
  { q: "pipe tap 1/2", top: "npt", pre: { size: "1/2-14" }, src: "day" },
  { q: "1/4 clearance hole", top: "shcs", pre: { q: "1/4" }, src: "day" },
  { q: "3/8 bolt clearance", top: "shcs", pre: { q: "3/8" }, src: "day" },
  { q: "clearance for 1/2 bolt", top: "shcs", pre: { q: "1/2" }, src: "day" },
  { q: "counterbore 3/8 bolt", top: "shcs", pre: { q: "3/8" }, src: "day" },
  { q: "screw clearance 1/4-20", top: "shcs", pre: { q: "1/4-20" }, src: "day" },
  { q: "1/4 20 bolt clearance", top: "shcs", pre: { q: "1/4-20" }, src: "day" },
  { q: "m6 counterbore", top: "shcs", pre: { q: "m6" }, src: "day" },
  { q: "counterbore for m6", top: "shcs", pre: { q: "m6" }, src: "day" },
  { q: "m8 bolt clearance", top: "shcs", pre: { q: "m8" }, src: "day" },
  { q: "1/4 shcs", top: "shcs", pre: { q: "1/4" }, src: "day" },
  { q: "letter f drill", top: "drill-chart", src: "day" },
  { q: "0.201", top: "fraction-converter", pre: { value: "0.201" }, src: "day" },
  { q: "13/64", top: "fraction-converter", pre: { value: "13/64" }, src: "day" },
  { q: "5/16 drill", top: "fraction-converter", pre: { value: "5/16" }, src: "day" },
  { q: "decimal to fraction 0.3125", top: "fraction-converter", pre: { value: "0.3125" }, src: "day" },
  { q: "convert 25 mm to inch", top: "fraction-converter", pre: { value: "25", units: "mm" }, src: "day" },
  { q: "inch to mm 3/8", top: "fraction-converter", pre: { value: "3/8" }, src: "day" },
  { q: "10mm", top: "fraction-converter", pre: { value: "10", units: "mm" }, src: "day f1" },
  { q: "1/2 in", top: "fraction-converter", pre: { value: "1/2", units: "in" }, src: "day" },
  { q: "fraction to decimal", top: "fraction-converter", src: "day" },
  { q: "mm to inch", top: ["fraction-converter", "unit-converter"], src: "day" },
  { q: "psi to bar", top: "unit-converter", src: "day" },
  { q: "drill chart", top: "drill-chart", src: "day" },
  { q: "tap chart", top: "tap-drill-chart", src: "day" },
  { q: "thread chart", top: "thread-chart", src: "day" },
  { q: "g code", top: "gcode-ref", src: "day" },
  // a G or M word with its leading zero is a control code, never a thread (ISO 261 writes the screw M6)
  { q: "g81", top: "gcode-ref", pre: { q: "g81" }, src: "day r5" },
  { q: "what is g83", top: "gcode-ref", pre: { q: "g83" }, src: "day r5" },
  { q: "m06", top: "gcode-ref", pre: { q: "m06" }, noThread: true, src: "day r5" },
  { q: "m03", top: "gcode-ref", noThread: true, src: "day r5" },
  { q: "g54", top: "gcode-ref", src: "day" },
  { q: "g01", top: "gcode-ref", pre: { q: "g01" }, src: "day r5" },
  { q: "fit h7 g6", top: "fits", find: { "gcode-ref": null }, src: "day" }, // ISO 286 shaft g6, not a G-code
  { q: "1-11.5 npt", top: "npt", pre: { size: "1-11.5" }, src: "day" },
  { q: "M8 x 1.25 x 20", top: "tap-drill", pre: { thread: "M8x1.25" }, oneThread: "M8x1.25", src: "day r5" },
  { q: "1/4-20 x 1 shcs", top: "shcs", pre: { q: "1/4-20" }, src: "day r5" },
  { q: "surface finish", top: "surface-finish", src: "day" },
  { q: "thermal expansion", top: "thermal", src: "day" },
  { q: "rockwell to brinell", top: "hardness", src: "day" },
  { q: "hrc", top: "hardness", src: "day" },
  { q: "weight of steel bar", top: "material-weight", src: "day" },
  { q: '1" aluminum bar weight', top: "material-weight", src: "day" },
  { q: "taper per foot", top: "taper", src: "day" },
  { q: "morse taper", top: "taper", src: "day" },
  { q: "sine bar", top: "sine-bar", src: "day" },
  { q: "true position", top: "true-position", src: "day" },
  { q: "h7 g6", top: "fits", src: "day" },
  { q: "press fit", top: "fits", src: "day" },
  { q: "tolerance stack", top: "tol-stack", src: "day" },
  { q: "countersink depth", top: "chamfer", src: "day" },
  { q: "countersink 82", top: "chamfer", src: "day" },
  { q: "center drill", top: "center-drill", src: "day" },
  { q: "reamer size for 1/4", top: "ream", src: "day" },
  { q: "drill point depth", top: "drill-point", src: "day" },
  { q: "lathe rpm", top: "lathe-feeds", src: "day" },
  { q: "turning speed", top: "lathe-feeds", src: "day" },
  { q: "part off", top: "lathe-cycle", src: "day" },
  { q: "nose radius", top: "tnr-comp", src: "day" },
  { q: "thread mill", top: "thread-mill", src: "day" },
  { q: "circle interpolation", top: "circle-interp", src: "day" },
  { q: "ball nose", top: "ball-nose", src: "day" },
  { q: "quote", top: "quote", src: "day" },
  { q: "right triangle", top: "right-triangle", src: "day" },
  { q: "trig", top: "right-triangle", src: "day" },
  { q: "arc length", top: "arc-segment", src: "day" },

  // ── round 5 final check and review 3 ──
  // A code next to a question a tool answers goes to that tool, even with an extra plain word in it; the G-code
  // list still comes up filtered to the code.
  { q: "g03 arc feed inside bore", top: "circle-interp", find: { "gcode-ref": { q: "g03" } }, src: "rv3" },
  { q: "g02 arc feed correction", top: "circle-interp", src: "rv3" },
  { q: "g03 internal circle feed", top: "circle-interp", src: "rv3" },
  { q: "g02 feed inside diameter", top: "circle-interp", src: "rv3" },
  { q: "g84 tap feed per minute", top: "tapping-feed", find: { "gcode-ref": { q: "g84" } }, src: "rv3" },
  { q: "g84 feed calculation", top: "tapping-feed", src: "rv3" },
  { q: "g42 cutter comp lathe", top: "tnr-comp", src: "rv3" },
  { q: "g41 lathe chamfer program", top: "tnr-comp", src: "rv3" },
  // A size typed with its unit opens the SHCS chart on that screw (checked row by row in the test below).
  { q: "clearance hole for 1/4 inch bolt", top: "shcs", pre: { q: "1/4 inch" }, src: "f5 day" },
  { q: "1/4 inch bolt clearance", top: "shcs", src: "f5" },
  { q: "3/8 inch counterbore", top: "shcs", src: "f5" },
  { q: "5/16 in clearance hole", top: "shcs", src: "f5" },
  { q: "1 inch bolt clearance", top: "shcs", src: "f5" },
  { q: "10mm bolt clearance", top: "shcs", src: "f5" },
  // Bar stock written W x H x L: the dimensions are sizes, not words a tool has to list.
  { q: "1 x 2 x 12 steel weight", top: "material-weight", src: "f5 day" },
  { q: "steel weight 1 x 2 x 12", top: "material-weight", src: "f5" },
  { q: "weight of 1 x 2 x 12 aluminum", top: "material-weight", src: "f5" },
  { q: "aluminum bar 1 x 2 x 12", top: "material-weight", src: "f5" },
  { q: "1/2 x 2 x 12 steel weight", top: "material-weight", src: "f5" },
  { q: "steel plate 12 x 12 x 1", top: "material-weight", src: "f5" },
  { q: "2 x 4 x 6 aluminum weight", top: "material-weight", src: "f5" },
  { q: "weight 4 x 4 x 1 aluminum", top: "material-weight", src: "f5" },
  // A screw called out thread x length (ASME B18.3): the length is no pipe size.
  { q: "1/4-20 x 3/4", top: ["tap-drill", "shcs"], oneThread: "1/4-20", not: ["npt"], src: "f5" },
  { q: "1/4 20 x 3/4", top: ["tap-drill", "shcs"], oneThread: "1/4-20", not: ["npt"], src: "f5" },
  { q: "5/16-18 x 1 1/2", top: ["tap-drill", "shcs"], oneThread: "5/16-18", not: ["npt"], src: "f5" },
  { q: "1/4-20 x .75", top: ["tap-drill", "shcs"], oneThread: "1/4-20", not: ["npt"], src: "f5" },
  { q: "3/8-16 x 1-1/2", top: ["tap-drill", "shcs"], oneThread: "3/8-16", not: ["npt"], src: "f5" },
  { q: "2 flute vs 3 flute aluminum", top: "feeds-mill", src: "f5 day" },
];

const list = (q) => searchCalcs(q, allCalcs());
const sub = (have, want) => Object.entries(want).every(([k, v]) => have?.[k] === v);

/** Every way row `e` can fail, as sentences (empty when it passes). */
function problems(e) {
  const hits = list(e.q);
  const ids = hits.map((h) => h.def.id);
  const out = [];
  const tops = e.top == null ? null : [].concat(e.top);
  if (e.empty && hits.length) out.push(`expected no hits, got ${ids.slice(0, 3)}`);
  if (tops && !tops.includes(ids[0])) out.push(`top ${ids[0]}, want ${tops.join(" or ")}`);
  if (e.pre && Object.keys(e.pre).length && !sub(hits[0]?.params, e.pre)) out.push(`top params ${JSON.stringify(hits[0]?.params)}, want ${JSON.stringify(e.pre)}`);
  if (e.pre && !Object.keys(e.pre).length && hits[0]?.params) out.push(`top params ${JSON.stringify(hits[0].params)}, want none`);
  for (const [id, want] of Object.entries(e.find || {})) {
    const h = hits.find((x) => x.def.id === id);
    if (want === null) { if (h) out.push(`${id} listed ${JSON.stringify(h.params ?? {})}`); }
    else if (!h || !sub(h.params, want)) out.push(`${id} ${h ? JSON.stringify(h.params) : "missing"}, want ${JSON.stringify(want)}`);
  }
  const thread = hits.find((h) => h.params?.thread);
  if (e.noThread && thread) out.push(`${thread.def.id} filled in thread ${thread.params.thread}`);
  if (e.oneThread) for (const h of hits) if (h.params?.thread && h.params.thread !== e.oneThread) out.push(`${h.def.id} thread ${h.params.thread}`);
  if (e.badThread && hits.some((h) => h.params?.thread === e.badThread)) out.push(`reads ${e.badThread}`);
  if (e.noChartQ && hits.find((h) => h.def.id === e.noChartQ)?.params?.q) out.push(`${e.noChartQ} filtered to ${hits.find((h) => h.def.id === e.noChartQ).params.q}`);
  if (e.noChartNumber && hits.some((h) => h.def.view === "chart" && /^\d+$/.test(h.params?.q ?? ""))) out.push("a chart filtered to the TPI alone");
  for (const id of e.not || []) if (ids.slice(0, 3).includes(id)) out.push(`${id} in the top 3 (${ids.slice(0, 3)})`);
  for (const id of e.near || []) if (!ids.slice(0, 3).includes(id)) out.push(`${id} not in the top 3 (${ids.slice(0, 3)})`);
  if (e.sameTopAs && list(e.sameTopAs)[0]?.def.id !== ids[0]) out.push(`top differs from "${e.sameTopAs}"`);
  return out;
}

test("search corpus: every row lands where it should", () => {
  const failed = CORPUS.map((e) => [e, problems(e)]).filter(([, p]) => p.length);
  assert.equal(failed.length, 0, `${failed.length} of ${CORPUS.length} rows fail:\n${failed.map(([e, p]) => `  "${e.q}" [${e.src}]: ${p.join("; ")}`).join("\n")}`);
});

// A chart opened from search with a filter that finds nothing is an empty screen ("g81 1/2 drill" once sent the
// G-code list a "1/2"), in either unit mode ("tap drill chart 0.201" once opened the mm tap drill chart empty).
test("search corpus: every chart a search opens filtered shows rows, in inch and in mm", () => {
  const empty = [];
  for (const e of CORPUS) {
    for (const h of list(e.q)) {
      if (h.def.view !== "chart" || !h.params?.q) continue;
      for (const units of ["in", "mm"]) {
        if (!chartRows(h.def.id, h.params.q, units).length) empty.push(`"${e.q}": ${h.def.id} (${units}) filtered to ${h.params.q}`);
      }
    }
  }
  assert.deepEqual(empty, []);
});

test("search corpus: at least 60 everyday questions, no query listed twice", () => {
  assert.ok(CORPUS.filter((e) => /\bday\b/.test(e.src)).length >= 60);
  const seen = new Set();
  for (const e of CORPUS) { assert.ok(!seen.has(e.q), `"${e.q}" twice`); seen.add(e.q); }
});

/** The chart's rows filtered by `q`: [first-column text, highlighted?], the way the chart screen draws them. */
function chartRows(id, q, units = "in") {
  const def = getCalc(id);
  const { cells } = chartCells(def, { units, L: UNIT_LABEL[units], settings: { units, pro: true } });
  return chartFilter(cells, { threadToSize: !!def.threadToSize })(q).map(({ i, hit }) => [cells[i][0], hit]);
}

// h-app#0: ".25" is 0.25 in a chart's filter, whether typed there or handed over by search.
// ASME B18.3: the 1/4 SHCS; ASME B94.11M: 1/2" = 0.5000.
test("chart filter: a leading-dot decimal reads as its 0-prefixed form", () => {
  assert.deepEqual(chartRows("shcs", ".25")[0], chartRows("shcs", "0.25")[0]);
  assert.deepEqual(chartRows("shcs", ".25")[0], ["1/4 SHCS", true]);
  assert.ok(chartRows("drill-chart", ".5").slice(0, 2).some(([n]) => /^1\/2"/.test(n)), JSON.stringify(chartRows("drill-chart", ".5").slice(0, 3)));
  assert.deepEqual(chartRows("drill-chart", ".375")[0], chartRows("drill-chart", "0.375")[0]);
  assert.match(chartRows("drill-chart", ".375")[0][0], /^3\/8"/);
  // a unit typed on the size, glued or spaced, finds the row written with it
  assert.deepEqual(chartRows("drill-chart", "10mm")[0], ["10 mm", true]);
  assert.deepEqual(chartRows("drill-chart", "1/2 in")[0], chartRows("drill-chart", '1/2"')[0]);
  assert.match(chartRows("drill-chart", "1/2in")[0][0], /^1\/2"/);
  // ...unless only the words as typed find rows: rows that spell the unit out (Fanuc G20 = inch units)
  for (const units of ["in", "mm"]) {
    assert.deepEqual(chartRows("gcode-ref", "g20 inch", units)[0], ["G20", true]);
    assert.equal(chartRows("gcode-ref", "G90 in", units)[0]?.[0], "G90");
    assert.match(chartRows("glossary", "1/4 inch", units)[0]?.[0] ?? "", /^TPI\b/);
    assert.match(chartRows("glossary", "10 inches", units)[0]?.[0] ?? "", /^Sine bar\b/);
    assert.match(chartRows("glossary", "0.001 inch.", units)[0]?.[0] ?? "", /^Thou\b/);
  }
  // a size typed with its unit lands on the screw of that size, never on a smaller screw whose counterbore happens to
  // be that size (ASME B18.3: the #5 counterbore is 1/4"); a metric size with mm is the M screw (ISO 4762)
  for (const units of ["in", "mm"]) {
    for (const q of ["1/4 inch", "1/4 in", "1/4in", '1/4"']) assert.deepEqual(chartRows("shcs", q, units)[0], ["1/4 SHCS", true], `${q} (${units})`);
    assert.deepEqual(chartRows("shcs", "3/8 inch", units)[0], ["3/8 SHCS", true]);
    assert.deepEqual(chartRows("shcs", "5/16 in", units)[0], ["5/16 SHCS", true]);
    assert.deepEqual(chartRows("shcs", "1 in", units)[0], ["1 SHCS", true]);
    assert.deepEqual(chartRows("shcs", "10mm", units)[0], ["M10 SHCS", true]);
    assert.deepEqual(chartRows("shcs", "1/4", units)[0], ["1/4 SHCS", true]);
  }
  // and search hands the chart exactly that
  for (const q of ["clearance hole for 1/4 inch bolt", "1/4 inch bolt clearance"]) {
    const hit = list(q)[0];
    for (const units of ["in", "mm"]) assert.deepEqual(chartRows("shcs", hit.params.q, units)[0], ["1/4 SHCS", true], `${q} (${units})`);
  }
  assert.deepEqual(chartRows("shcs", list("10mm bolt clearance")[0].params.q)[0], ["M10 SHCS", true]);
  // a thread or a code with a dot inside stays as typed
  assert.match(chartRows("gcode-ref", "G54.1")[0]?.[0], /^G54\.1\b/);
  assert.equal(chartRows("tap-drill-chart", "M10x1.25")[0]?.[0], chartRows("tap-drill-chart", "m10 1.25")[0]?.[0]);
});
