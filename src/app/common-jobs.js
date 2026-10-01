// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Plain-language entry points for the home screen. Written the way a beginner asks, not the way a catalog lists.

export const COMMON_JOBS = Object.freeze([
  { label: "Set up a whole job", hint: "Tool, material, machine, cut — it figures everything it can and asks for the rest", calc: "job-sheet" },
  { label: "What drill for a tap?", hint: "Hole size before cutting threads", calc: "tap-drill" },
  { label: "How fast to run a drill", hint: "RPM and feed by drill size and material", calc: "feeds-drill" },
  { label: "How fast to run an end mill", hint: "RPM and feed for milling", calc: "feeds-mill" },
  { label: "Band saw blade and speed", hint: "Blade speed and teeth per inch for your stock", calc: "saw-speed" },
  { label: "Clearance hole for a bolt", hint: "Drill size so a screw passes through, counterbores", calc: "shcs" },
  { label: "Look up a thread", hint: "1/4-20, #10-32, M8 — sizes and tap drill", calc: "thread-data" },
  { label: "Fraction, decimal, mm, drill size", hint: "Convert any size", calc: "fraction-converter" },
  { label: "Find an angle or a side", hint: "Right triangle", calc: "right-triangle" },
  { label: "Holes evenly around a circle", hint: "Bolt pattern coordinates", calc: "bolt-circle" },
  { label: "Lathe speed", hint: "RPM for turning", calc: "lathe-feeds" },
  { label: "What does this G-code mean?", hint: "G and M codes in plain words", calc: "gcode-ref" },
  { label: "What do SFM, IPM, TPI mean?", hint: "Shop terms in plain English", calc: "glossary" },
]);
