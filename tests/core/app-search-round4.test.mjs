// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Home search, round 4: a size + tool + material question opens the speeds & feeds tool, and a size followed
// by a count (holes, teeth, a saw's TPI) is never read as a thread nobody typed.

import test from "node:test";
import assert from "node:assert/strict";
import "../../src/calcs/index.js";
import { allCalcs } from "../../src/app/registry.js";
import { searchCalcs } from "../../src/app/search.js";

const hits = (q) => searchCalcs(q, allCalcs());
const first = (q) => hits(q)[0];

// A material word asks how fast to cut it: the drill speeds & feeds tool, not the fraction converter or the
// 1/2 NPT pipe tap (ASME B1.20.1 1/2-14) that also take "1/2".
test("a size, a drill and a material open drill speeds & feeds first", () => {
  for (const q of ["1/2 drill steel", "1/2 drill aluminum", "3/8 drill stainless", "steel 1/2 drill", "1/2 drill in aluminum",
    "10mm drill steel", "drill 1/2 in steel", "what speed for a 1/2 drill in steel"]) {
    assert.equal(first(q)?.def.id, "feeds-drill", `${q} → ${first(q)?.def.id}`);
  }
  // A numbered drill names a chart row: the chart filtered to it, with drill speeds right behind.
  for (const q of ["#7 drill aluminum", "aluminum #7 drill"]) {
    assert.equal(first(q)?.def.id, "drill-chart", `${q} → ${first(q)?.def.id}`);
    assert.equal(first(q).params?.q, "#7");
    assert.ok(hits(q).slice(0, 3).some((h) => h.def.id === "feeds-drill"), `${q}: feeds-drill in the top 3`);
  }
  // no material: the value still opens the tool that takes it
  assert.equal(first("1/2 drill").params?.value, "1/2");
  assert.equal(first("#7 drill").def.id, "drill-chart");
});

// A material word next to another tool's own words is a detail of that job, not a request for speeds & feeds.
test("a material word keeps the tool the user named on top", () => {
  for (const [q, want] of [["stainless surface roughness", "surface-finish"], ["aluminum shop rate", "quote"], ["steel part off", "lathe-cycle"],
    ["aluminum fit", "fits"], ["aluminum ball end mill", "ball-nose"], ["steel centre drill", "center-drill"], ["steel lathe center", "center-drill"],
    ["aluminum feed comp", "thread-mill"], ["aluminum turning time", "lathe-cycle"], ["aluminum angle", "right-triangle"],
    ["aluminum thread mill", "thread-mill"], ["aluminum cycle time", "lathe-cycle"], ["steel tap drill", "tap-drill"]]) {
    assert.equal(first(q)?.def.id, want, `${q} → ${first(q)?.def.id}`);
  }
});

test("a size, a tap and a material open a tap tool, never the NPT pipe tap", () => {
  for (const q of ["1/4 tap aluminum", "1/4-20 tap aluminum", "brass tap", "tap aluminum", "M8 tap steel"]) {
    const top = first(q)?.def.id;
    assert.ok(["tap-drill", "tapping-feed", "tap-drill-chart"].includes(top), `${q} → ${top}`);
  }
  assert.equal(first("1/4-20 tap aluminum").params.thread, "1/4-20", "the thread is still filled in");
  // the material words still find the material tools
  assert.equal(first("steel hardness").def.id, "hardness");
  assert.equal(first("steel weight").def.id, "material-weight");
  assert.ok(hits("aluminum density").slice(0, 2).some((h) => h.def.id === "materials"));
  assert.equal(first("endmill aluminum").def.id, "feeds-mill");
  assert.equal(first("1/2 endmill aluminum").def.id, "feeds-mill");
});

// A typed thread only fills in thread tools, so a material word never hands it to drill or mill speeds with no
// size: the drill for a 1/4-20 is the #7 tap drill and for M8x1.25 the 6.8 mm (Machinery's Handbook; ISO 2306).
test("a thread, a material and a drill or speed word keep the thread tool on top, filled in", () => {
  for (const [q, want, thread] of [["1/4-20 drill aluminum", "tap-drill", "1/4-20"], ["1/4-20 drill steel", "tap-drill", "1/4-20"],
    ["drill for 1/4-20 aluminum", "tap-drill", "1/4-20"], ["M8x1.25 drill steel", "tap-drill", "M8x1.25"],
    ["1/4-20 rpm aluminum", "tapping-feed", "1/4-20"], ["M8x1.25 rpm steel", "tapping-feed", "M8x1.25"]]) {
    assert.equal(first(q)?.def.id, want, `${q} → ${first(q)?.def.id}`);
    assert.equal(first(q).params?.thread, thread, `${q}: thread filled in`);
  }
  assert.equal(first("1/4-20 feed steel").params?.thread, "1/4-20");
  // a bare size is no thread: the material still asks for speeds
  assert.equal(first("1/2 drill steel").def.id, "feeds-drill");
});

// ASME B1.1 lists 3-1/2-6, 2-1/2-8, 1-1/2-6 and 3/4-10, but a hole count or a saw blade's teeth is not a TPI.
test("a size and a count in a bolt-circle or saw question stay a size and a count", () => {
  for (const [q, want] of [["bolt circle 3.5 6 holes", "bolt-circle"], ["bolt circle 2.5 8 holes", "bolt-circle"], ["1.5 6 holes", "bolt-circle"],
    ["3/4 10 teeth", "saw-speed"], ["saw 3/4 10 tpi", "saw-speed"], ["bandsaw 14 tpi", "saw-speed"]]) {
    const list = hits(q);
    assert.equal(list[0]?.def.id, want, `${q} → ${list[0]?.def.id}`);
    assert.equal(list.find((h) => h.params?.thread), undefined, `${q} → thread ${list.find((h) => h.params?.thread)?.params.thread}`);
  }
  // a metric or numbered thread is a thread anywhere, and holes to tap are threaded holes
  assert.equal(hits("bolt circle M8 1").find((h) => h.params?.thread)?.params.thread, "M8x1");
  assert.equal(hits("M8 1.25 holes").find((h) => h.params?.thread)?.params.thread, "M8x1.25");
  assert.equal(hits("tap drill 1/4 20 holes").find((h) => h.def.id === "tap-drill")?.params?.thread, "1/4-20");
  // "a 1/4 20 hole" is one tapped hole, not 20 holes: the tap drill, filled in
  for (const [q, thread] of [["what drill for a 1/4 20 hole", "1/4-20"], ["1/4 20 hole", "1/4-20"], ["1/2 13 hole", "1/2-13"], ["3/8 16 hole", "3/8-16"]]) {
    assert.equal(first(q)?.def.id, "tap-drill", `${q} → ${first(q)?.def.id}`);
    assert.equal(first(q).params?.thread, thread);
  }
  // a hole pattern is a count, and a tap word on a bolt circle is the thread for its holes (1/2-13, not the 1/2 NPT)
  assert.equal(hits("1.5 6 hole pattern").find((h) => h.params?.thread), undefined);
  const bc = hits("bolt circle 1/2 13 tap 6 holes");
  assert.equal(bc[0].def.id, "bolt-circle");
  assert.equal(bc.find((h) => h.def.id === "tap-drill")?.params?.thread, "1/2-13");
  assert.equal(bc.find((h) => h.def.id === "npt"), undefined, "no 1/2 NPT pipe tap");
  // the earlier readings hold
  assert.equal(hits("3/4 10").find((h) => h.def.id === "tap-drill")?.params?.thread, "3/4-10");
  assert.equal(hits("1/4 20").find((h) => h.def.id === "tap-drill")?.params?.thread, "1/4-20");
});

test("a decimal with no leading zero reads the same as one with it", () => {
  const thread = (q) => hits(q).find((h) => h.def.id === "tap-drill")?.params?.thread;
  assert.ok(thread("0.25 20"), "0.25 20 is the 1/4-20 thread");
  assert.ok(thread(".25 20"), ".25 20 is the same thread");
  assert.equal(first(".25 20").def.id, first("0.25 20").def.id);
  // ".25 drill" gets the value filled in, as "0.25 drill" does
  const conv = (q) => hits(q).find((h) => h.def.id === "fraction-converter")?.params?.value;
  assert.equal(conv(".25 drill"), ".25");
  assert.equal(conv("0.25 drill"), "0.25");
});
