// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Conservative speeds & feeds starting points. Source: generic HSS/carbide ranges from
// Machinery's Handbook "Speeds and Feeds" tables, taken at the low end. Chip load is
// per tooth for a 3/8" end mill; feeds.js scales it by diameter.
// These are starting points only — labeled as such in the UI.

export const SF_DEFAULTS = Object.freeze({
  aluminum:   { hss: { sfm: 250, chipIn: 0.003 },  carbide: { sfm: 800, chipIn: 0.004 },  coated: { sfm: 1000, chipIn: 0.005 } },
  brass:      { hss: { sfm: 200, chipIn: 0.003 },  carbide: { sfm: 500, chipIn: 0.003 },  coated: { sfm: 600,  chipIn: 0.003 } },
  mildSteel:  { hss: { sfm: 90,  chipIn: 0.002 },  carbide: { sfm: 350, chipIn: 0.003 },  coated: { sfm: 450,  chipIn: 0.003 } },
  alloySteel: { hss: { sfm: 70,  chipIn: 0.0015 }, carbide: { sfm: 280, chipIn: 0.0025 }, coated: { sfm: 380,  chipIn: 0.003 } },
  stainless:  { hss: { sfm: 50,  chipIn: 0.0015 }, carbide: { sfm: 180, chipIn: 0.002 },  coated: { sfm: 250,  chipIn: 0.0025 } },
  toolSteel:  { hss: { sfm: 40,  chipIn: 0.001 },  carbide: { sfm: 150, chipIn: 0.0015 }, coated: { sfm: 220,  chipIn: 0.002 } },
  castIron:   { hss: { sfm: 80,  chipIn: 0.002 },  carbide: { sfm: 300, chipIn: 0.003 },  coated: { sfm: 380,  chipIn: 0.003 } },
  titanium:   { hss: { sfm: 40,  chipIn: 0.0015 }, carbide: { sfm: 150, chipIn: 0.002 },  coated: { sfm: 220,  chipIn: 0.0025 } },
  plastic:    { hss: { sfm: 300, chipIn: 0.004 },  carbide: { sfm: 600, chipIn: 0.005 },  coated: { sfm: 700,  chipIn: 0.005 } },
});

export const MATERIAL_LABELS = Object.freeze({
  aluminum: "Aluminum (6061)", brass: "Brass / Bronze", mildSteel: "Mild steel (1018)",
  alloySteel: "Alloy steel (4140)", stainless: "Stainless (304/316)", toolSteel: "Tool steel (hardened)",
  castIron: "Cast iron", titanium: "Titanium", plastic: "Plastic", custom: "Custom",
});

export const TOOL_LABELS = Object.freeze({ hss: "HSS", carbide: "Carbide", coated: "Coated carbide" });
