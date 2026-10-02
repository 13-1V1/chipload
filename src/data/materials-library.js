// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Machinability library. Sources: Machinery's Handbook "Speeds and Feeds" (low end of the HSS and
// carbide milling ranges), machinability ratings (see ratingScale below), and tool-maker starting charts.
// Every number here is a conservative STARTING POINT, labeled that way in the UI.
//
// Row: [id, name, group, rating %, SFM HSS, SFM uncoated carbide, chip load per tooth (in, 3/8" end mill), density lb/in³]
// Coated carbide is taken as 1.25 × uncoated. Drilling SFM = 0.8 × milling SFM; turning SFM = 1.2 × milling
// SFM, except where a hard row gives its own carbide drill and turning speeds (HARD below).
// The rating is NOT one scale for every group: steels, stainless, titanium, nickel and cast iron are on the
// AISI scale (B1112 = 100%); copper alloys are on the Copper Development Association scale (C36000 brass = 100);
// aluminum, magnesium, zinc, plastics and "Other" are ranked within their own family only.
// hrc: typical hardness (Rockwell C) of a row that is sold heat-treated or hard; the band saw derates by it.

const R = (id, name, group, rating, hss, carbide, chip, density) => ({ id, name, group, rating, sfmHss: hss, sfmCarbide: carbide, chipIn: chip, density });
const HRC = (row, hrc) => ({ ...row, hrc });
// Carbide drill and turning SFM for a row whose milling speed only holds for light hard-milling cuts.
const HARD = (row, { drill, turn }) => ({ ...row, drillCarbide: drill, turnCarbide: turn });

const B1112_GROUPS = ["Carbon steel", "Alloy steel", "Tool steel", "Stainless", "Cast iron", "Titanium", "Nickel & superalloys"];

/** What a material's rating is measured against, in words for the Reference table. */
export function ratingScale(group) {
  if (B1112_GROUPS.includes(group)) return "vs. B1112 steel = 100%";
  if (group === "Copper alloys") return "vs. C360 brass = 100 (copper scale)";
  return "ranked within its own family only";
}

export const MATERIAL_GROUPS = Object.freeze(["Aluminum", "Copper alloys", "Carbon steel", "Alloy steel", "Tool steel", "Stainless", "Cast iron", "Titanium", "Nickel & superalloys", "Magnesium & zinc", "Plastics & composites", "Other"]);

export const MATERIALS = Object.freeze([
  // ── Aluminum ──
  R("al1100", "1100-O aluminum", "Aluminum", 90, 300, 900, 0.003, 0.098),
  R("al2011", "2011-T3 aluminum (free machining)", "Aluminum", 120, 400, 1200, 0.004, 0.102),
  R("al2014", "2014-T6 aluminum", "Aluminum", 90, 300, 1000, 0.004, 0.101),
  R("al2017", "2017-T4 aluminum", "Aluminum", 90, 300, 1000, 0.004, 0.101),
  R("al2024", "2024-T4 aluminum", "Aluminum", 90, 300, 1000, 0.004, 0.100),
  R("al3003", "3003-H14 aluminum", "Aluminum", 60, 250, 800, 0.003, 0.099),
  R("al5052", "5052-H32 aluminum", "Aluminum", 60, 250, 800, 0.003, 0.097),
  R("al5083", "5083-H116 aluminum", "Aluminum", 60, 250, 800, 0.003, 0.096),
  R("al5086", "5086-H32 aluminum", "Aluminum", 60, 250, 800, 0.003, 0.096),
  R("al6061", "6061-T6 aluminum", "Aluminum", 90, 300, 1000, 0.004, 0.098),
  R("al6063", "6063-T5 aluminum", "Aluminum", 70, 250, 900, 0.003, 0.097),
  R("al6082", "6082-T6 aluminum", "Aluminum", 90, 300, 1000, 0.004, 0.098),
  R("al7050", "7050-T7451 aluminum", "Aluminum", 100, 350, 1100, 0.004, 0.102),
  R("al7075", "7075-T6 aluminum", "Aluminum", 110, 350, 1200, 0.004, 0.102),
  R("al7475", "7475-T7351 aluminum", "Aluminum", 100, 350, 1100, 0.004, 0.102),
  R("alMic6", "MIC-6 cast tooling plate", "Aluminum", 90, 300, 1000, 0.004, 0.101),
  R("alA356", "A356-T6 cast aluminum", "Aluminum", 80, 300, 900, 0.003, 0.097),
  R("al319", "319 cast aluminum", "Aluminum", 70, 250, 800, 0.003, 0.101),
  R("al380", "380 die-cast aluminum", "Aluminum", 70, 250, 800, 0.003, 0.099),
  R("al390", "390 die-cast aluminum (high Si)", "Aluminum", 30, 150, 500, 0.002, 0.098),
  // ── Copper alloys ──
  R("c110", "C110 ETP copper", "Copper alloys", 20, 100, 350, 0.002, 0.323),
  R("c145", "C145 tellurium copper", "Copper alloys", 85, 200, 600, 0.003, 0.323),
  R("c172", "C172 beryllium copper", "Copper alloys", 20, 80, 250, 0.002, 0.298),
  R("c17510", "C17510 beryllium copper (high cond.)", "Copper alloys", 30, 90, 300, 0.002, 0.319),
  R("c260", "C260 cartridge brass", "Copper alloys", 30, 150, 400, 0.002, 0.308),
  R("c280", "C280 Muntz metal", "Copper alloys", 40, 150, 450, 0.002, 0.303),
  R("c353", "C353 high-lead brass", "Copper alloys", 90, 280, 750, 0.003, 0.306),
  R("c360", "C360 free-cutting brass", "Copper alloys", 100, 300, 800, 0.003, 0.307),
  R("c385", "C385 architectural bronze", "Copper alloys", 90, 280, 750, 0.003, 0.306),
  R("c464", "C464 naval brass", "Copper alloys", 30, 150, 400, 0.002, 0.304),
  R("c510", "C510 phosphor bronze", "Copper alloys", 20, 100, 300, 0.002, 0.320),
  R("c544", "C544 free-cutting phosphor bronze", "Copper alloys", 80, 200, 600, 0.003, 0.321),
  R("c630", "C630 nickel-aluminum bronze", "Copper alloys", 20, 70, 250, 0.002, 0.274),
  // C642 density 0.278 lb/in³ (7.69 g/cm³), CDA via Concast C64200 data sheet.
  R("c642", "C642 silicon-aluminum bronze", "Copper alloys", 60, 150, 450, 0.002, 0.278),
  R("c655", "C655 silicon bronze", "Copper alloys", 30, 120, 350, 0.002, 0.308),
  R("c863", "C863 manganese bronze", "Copper alloys", 8, 40, 150, 0.0015, 0.283),
  R("c932", "C932 bearing bronze (SAE 660)", "Copper alloys", 70, 200, 600, 0.003, 0.322),
  R("c954", "C954 aluminum bronze", "Copper alloys", 60, 100, 300, 0.002, 0.269),
  R("c706", "C706 90/10 copper-nickel", "Copper alloys", 20, 80, 250, 0.002, 0.323),
  // ── Carbon steel ──
  R("s1008", "1008 / 1010 low carbon", "Carbon steel", 55, 100, 400, 0.002, 0.284),
  R("s1018", "1018 mild steel", "Carbon steel", 78, 100, 400, 0.002, 0.284),
  R("s1020", "1020 steel", "Carbon steel", 72, 100, 400, 0.002, 0.284),
  R("s1026", "1026 steel", "Carbon steel", 70, 95, 380, 0.002, 0.284),
  R("s1030", "1030 steel", "Carbon steel", 70, 95, 380, 0.002, 0.284),
  R("s1035", "1035 steel", "Carbon steel", 65, 90, 360, 0.002, 0.284),
  R("s1040", "1040 steel", "Carbon steel", 60, 90, 350, 0.002, 0.284),
  R("s1045", "1045 steel", "Carbon steel", 57, 90, 350, 0.002, 0.284),
  R("s1050", "1050 steel", "Carbon steel", 54, 85, 330, 0.002, 0.284),
  R("s1060", "1060 steel", "Carbon steel", 51, 80, 300, 0.0015, 0.284),
  R("s1080", "1080 steel", "Carbon steel", 45, 70, 280, 0.0015, 0.284),
  R("s1095", "1095 steel", "Carbon steel", 42, 70, 280, 0.0015, 0.284),
  R("s1117", "1117 free machining", "Carbon steel", 91, 110, 450, 0.0025, 0.284),
  R("s1141", "1141 free machining", "Carbon steel", 70, 100, 400, 0.002, 0.284),
  R("s1144", "1144 / Stressproof", "Carbon steel", 76, 100, 400, 0.002, 0.284),
  R("s1212", "1212 free machining", "Carbon steel", 100, 130, 500, 0.003, 0.284),
  R("s1213", "1213 free machining", "Carbon steel", 136, 140, 550, 0.003, 0.284),
  R("s1215", "1215 free machining", "Carbon steel", 136, 140, 550, 0.003, 0.284),
  R("s12l14", "12L14 leaded free machining", "Carbon steel", 160, 150, 600, 0.003, 0.284),
  R("sA36", "A36 structural / hot rolled", "Carbon steel", 70, 100, 400, 0.002, 0.284),
  HRC(R("sA514", "A514 / T1 plate (100 ksi)", "Carbon steel", 45, 65, 260, 0.0015, 0.284), 26),
  HRC(R("sAR400", "AR400 wear plate", "Carbon steel", 25, 40, 180, 0.001, 0.284), 43),
  // ── Alloy steel ──
  R("s4130", "4130 chromoly, annealed", "Alloy steel", 70, 90, 350, 0.002, 0.284),
  R("s4140", "4140, annealed", "Alloy steel", 66, 85, 350, 0.002, 0.284),
  HRC(R("s4140ph", "4140 pre-hard (28–32 HRC)", "Alloy steel", 55, 70, 280, 0.0015, 0.284), 30),
  R("s4142", "4142, annealed", "Alloy steel", 66, 85, 350, 0.002, 0.284),
  R("s4150", "4150, annealed", "Alloy steel", 60, 80, 320, 0.002, 0.284),
  R("s4340", "4340, annealed", "Alloy steel", 50, 70, 280, 0.0015, 0.284),
  HRC(R("s4340h", "4340, hardened (32–38 HRC)", "Alloy steel", 40, 50, 200, 0.0012, 0.284), 35),
  R("s4615", "4615 / 4620 carburizing", "Alloy steel", 60, 85, 340, 0.002, 0.284),
  R("s5140", "5140 steel", "Alloy steel", 60, 80, 320, 0.002, 0.284),
  R("s6150", "6150 spring steel", "Alloy steel", 50, 70, 280, 0.0015, 0.284),
  R("s8620", "8620 carburizing", "Alloy steel", 66, 90, 350, 0.002, 0.284),
  R("s8640", "8640 steel", "Alloy steel", 60, 80, 320, 0.002, 0.284),
  R("s9310", "9310 gear steel", "Alloy steel", 55, 75, 300, 0.0015, 0.284),
  R("s52100", "52100 bearing steel, annealed", "Alloy steel", 40, 60, 220, 0.0015, 0.284),
  R("s300m", "300M / 4340M", "Alloy steel", 40, 55, 220, 0.0012, 0.284),
  R("sHY80", "HY-80 / HY-100", "Alloy steel", 45, 65, 260, 0.0015, 0.284),
  R("s9260", "9260 spring steel", "Alloy steel", 45, 65, 260, 0.0015, 0.284),
  R("sEtd150", "ETD 150 / Fatigue-Proof", "Alloy steel", 50, 70, 280, 0.0015, 0.284),
  // ── Tool steel ──
  R("tA2", "A2, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.284),
  R("tA6", "A6, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.284),
  R("tD2", "D2, annealed", "Tool steel", 27, 40, 180, 0.001, 0.278),
  R("tD3", "D3, annealed", "Tool steel", 25, 40, 170, 0.001, 0.278),
  R("tH11", "H11, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.281),
  R("tH13", "H13, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.281),
  R("tL6", "L6, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.284),
  R("tM2", "M2 high speed, annealed", "Tool steel", 40, 55, 220, 0.0012, 0.295),
  R("tM4", "M4 high speed, annealed", "Tool steel", 30, 45, 190, 0.001, 0.291),
  R("tM42", "M42 high speed, annealed", "Tool steel", 40, 50, 200, 0.0012, 0.283),
  R("tO1", "O1, annealed", "Tool steel", 42, 60, 250, 0.0015, 0.283),
  R("tO6", "O6, annealed", "Tool steel", 55, 70, 280, 0.0015, 0.283),
  HRC(R("tP20", "P20 mold steel (28–32 HRC)", "Tool steel", 45, 60, 240, 0.0015, 0.284), 30),
  R("tS5", "S5, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.283),
  R("tS7", "S7, annealed", "Tool steel", 45, 60, 250, 0.0015, 0.283),
  R("tT15", "T15 high speed, annealed", "Tool steel", 25, 40, 170, 0.001, 0.294),
  R("tW1", "W1 water hardening, annealed", "Tool steel", 55, 70, 280, 0.0015, 0.282),
  HRC(R("tHard45", "Tool steel, hardened 45–50 HRC", "Tool steel", 15, 25, 120, 0.0008, 0.284), 47),
  // 55–60 HRC: Lakeshore Carbide HARDMILL chart (catalog p.29), 3/8–1/2 in: 300–500 SFM coated at light radial
  // cuts (WOC ≤ 0.025D); programmed .003–.004/tooth ≈ .001 real chip at that WOC. Coated 300 = 1.25 × 240.
  // That speed is for light-radial-cut MILLING only, so drilling and turning get their own numbers:
  // drill 98 SFM = Haas Tooling "Carbide Drills, General Purpose (TSC)" chart, ISO H38 hardened steel
  // 55 HRC, 1/8–3/4 in; turning 132 SFM uncoated / 165 coated (≈ 50 m/min, the low end of the 40–70 m/min
  // published for coated-carbide hard turning; CBN runs faster).
  HARD(HRC(R("tHard55", "Tool steel, hardened 55–60 HRC", "Tool steel", 8, 15, 240, 0.001, 0.284), 58), { drill: 98, turn: 132 }),
  // ── Stainless ──
  R("ss201", "201 stainless", "Stainless", 40, 55, 220, 0.0015, 0.283),
  R("ss301", "301 stainless", "Stainless", 40, 55, 220, 0.0015, 0.290),
  R("ss303", "303 stainless (free machining)", "Stainless", 78, 90, 350, 0.002, 0.289),
  R("ss304", "304 / 304L stainless", "Stainless", 45, 60, 250, 0.0015, 0.289),
  R("ss309", "309 stainless", "Stainless", 35, 50, 200, 0.0015, 0.289),
  R("ss310", "310 stainless", "Stainless", 30, 45, 180, 0.0015, 0.289),
  R("ss316", "316 / 316L stainless", "Stainless", 36, 55, 220, 0.0015, 0.289),
  R("ss321", "321 stainless", "Stainless", 36, 55, 220, 0.0015, 0.289),
  R("ss347", "347 stainless", "Stainless", 36, 55, 220, 0.0015, 0.289),
  R("ss410", "410 stainless", "Stainless", 54, 80, 300, 0.002, 0.280),
  R("ss416", "416 stainless (free machining)", "Stainless", 110, 110, 400, 0.0025, 0.280),
  R("ss420", "420 stainless", "Stainless", 45, 65, 250, 0.0015, 0.280),
  R("ss430", "430 stainless", "Stainless", 54, 80, 300, 0.002, 0.278),
  R("ss440c", "440C stainless, annealed", "Stainless", 40, 55, 200, 0.0015, 0.277),
  R("ss174a", "17-4 PH, condition A", "Stainless", 40, 65, 250, 0.0015, 0.282),
  HRC(R("ss174h", "17-4 PH, H900 (44 HRC)", "Stainless", 30, 50, 200, 0.0012, 0.282), 44),
  R("ss155", "15-5 PH", "Stainless", 40, 65, 250, 0.0015, 0.283),
  R("ss138", "13-8 Mo PH", "Stainless", 30, 50, 200, 0.0012, 0.279),
  R("ss177", "17-7 PH", "Stainless", 35, 55, 220, 0.0015, 0.276),
  R("ss455", "Custom 455 / 465", "Stainless", 30, 50, 200, 0.0012, 0.282),
  R("ssNit50", "Nitronic 50", "Stainless", 20, 40, 150, 0.001, 0.285),
  R("ssNit60", "Nitronic 60", "Stainless", 25, 45, 170, 0.001, 0.278),
  R("ss2205", "2205 duplex", "Stainless", 25, 45, 180, 0.0012, 0.283),
  R("ss2507", "2507 super duplex", "Stainless", 20, 40, 150, 0.001, 0.283),
  R("ss254", "254 SMO / AL-6XN", "Stainless", 20, 40, 150, 0.001, 0.290),
  R("ss904l", "904L stainless", "Stainless", 25, 45, 170, 0.001, 0.289),
  // ── Cast iron ── ratings on the B1112 scale: Enerpac "Metal Machinability Ratings" and Doppler Gear
  // machinability tables (class 20 73%, class 30/40 48%, 60-40-18 61%, 80-55-06 39%, 100-70-03 30%);
  // 65-45-12 is interpolated between 60-40-18 and 80-55-06.
  R("ciG20", "Gray iron, class 20", "Cast iron", 73, 100, 400, 0.003, 0.250),
  R("ciG30", "Gray iron, class 30", "Cast iron", 48, 90, 350, 0.003, 0.256),
  R("ciG40", "Gray iron, class 40", "Cast iron", 48, 80, 300, 0.0025, 0.260),
  R("ciD6040", "Ductile 60-40-18", "Cast iron", 61, 80, 300, 0.0025, 0.256),
  R("ciD6545", "Ductile 65-45-12", "Cast iron", 55, 75, 280, 0.0025, 0.256),
  R("ciD8055", "Ductile 80-55-06", "Cast iron", 39, 60, 240, 0.002, 0.256),
  R("ciD10070", "Ductile 100-70-03", "Cast iron", 30, 50, 200, 0.002, 0.256),
  R("ciMall", "Malleable iron 32510", "Cast iron", 90, 90, 350, 0.003, 0.264),
  R("ciCgi", "Compacted graphite iron (CGI)", "Cast iron", 60, 60, 250, 0.002, 0.256),
  R("ciNiRes", "Ni-Resist", "Cast iron", 40, 40, 150, 0.0015, 0.264),
  HRC(R("ciWhite", "White / chilled iron", "Cast iron", 20, 20, 80, 0.001, 0.277), 50),
  // ── Titanium ──
  R("tiCP2", "Titanium CP grade 2", "Titanium", 40, 50, 200, 0.0015, 0.163),
  R("tiCP4", "Titanium CP grade 4", "Titanium", 30, 40, 160, 0.0015, 0.163),
  R("ti64", "Ti-6Al-4V (grade 5)", "Titanium", 22, 40, 150, 0.0015, 0.160),
  R("ti64eli", "Ti-6Al-4V ELI (grade 23)", "Titanium", 22, 40, 150, 0.0015, 0.160),
  R("ti6242", "Ti-6Al-2Sn-4Zr-2Mo", "Titanium", 15, 30, 120, 0.001, 0.164),
  R("ti662", "Ti-6Al-6V-2Sn", "Titanium", 15, 30, 120, 0.001, 0.164),
  R("ti5553", "Ti-5553 (beta)", "Titanium", 12, 25, 100, 0.001, 0.168),
  R("ti1023", "Ti-10V-2Fe-3Al", "Titanium", 12, 25, 100, 0.001, 0.168),
  // ── Nickel & superalloys ──
  R("ni625", "Inconel 625", "Nickel & superalloys", 12, 20, 90, 0.001, 0.305),
  HRC(R("ni718", "Inconel 718, aged", "Nickel & superalloys", 10, 15, 80, 0.001, 0.297), 40),
  R("ni718a", "Inconel 718, solution annealed", "Nickel & superalloys", 12, 20, 90, 0.001, 0.297),
  R("niX750", "Inconel X-750", "Nickel & superalloys", 12, 18, 85, 0.001, 0.298),
  R("ni600", "Inconel 600", "Nickel & superalloys", 15, 25, 100, 0.001, 0.304),
  R("niMonel400", "Monel 400", "Nickel & superalloys", 30, 40, 150, 0.0012, 0.319),
  R("niMonelK", "Monel K-500", "Nickel & superalloys", 20, 30, 120, 0.001, 0.306),
  R("niC276", "Hastelloy C-276", "Nickel & superalloys", 10, 15, 80, 0.001, 0.321),
  R("niC22", "Hastelloy C-22", "Nickel & superalloys", 10, 15, 80, 0.001, 0.314),
  R("niHX", "Hastelloy X", "Nickel & superalloys", 12, 18, 85, 0.001, 0.297),
  R("niWasp", "Waspaloy", "Nickel & superalloys", 8, 12, 70, 0.0008, 0.296),
  R("niRene41", "René 41", "Nickel & superalloys", 8, 12, 70, 0.0008, 0.298),
  R("ni800", "Incoloy 800 / 800H", "Nickel & superalloys", 15, 25, 100, 0.001, 0.287),
  R("ni825", "Incoloy 825", "Nickel & superalloys", 15, 25, 100, 0.001, 0.294),
  R("ni200", "Nickel 200 / 201", "Nickel & superalloys", 30, 40, 150, 0.0012, 0.321),
  R("niInvar", "Invar 36", "Nickel & superalloys", 20, 35, 130, 0.001, 0.291),
  R("niKovar", "Kovar", "Nickel & superalloys", 25, 40, 150, 0.001, 0.302),
  R("niAlloy20", "Alloy 20", "Nickel & superalloys", 15, 25, 100, 0.001, 0.292),
  // Densities: Haynes International data sheets — 230 is 0.324 lb/in³ (8.97 g/cm³), 282 is 0.299 (8.27 g/cm³).
  R("niHay230", "Haynes 230", "Nickel & superalloys", 8, 12, 70, 0.0008, 0.324),
  R("niHay282", "Haynes 282", "Nickel & superalloys", 8, 12, 70, 0.0008, 0.299),
  HRC(R("niStellite", "Stellite 6 (cobalt)", "Nickel & superalloys", 8, 10, 60, 0.0006, 0.303), 40),
  R("niNitinol", "Nitinol", "Nickel & superalloys", 5, 10, 50, 0.0005, 0.234),
  // ── Magnesium & zinc ──
  R("mgAZ31", "AZ31B magnesium", "Magnesium & zinc", 500, 600, 1500, 0.004, 0.064),
  R("mgAZ91", "AZ91D cast magnesium", "Magnesium & zinc", 500, 600, 1500, 0.004, 0.066),
  R("znZamak3", "Zamak 3 / 5 zinc die cast", "Magnesium & zinc", 200, 300, 900, 0.003, 0.240),
  R("znZA27", "ZA-27 zinc", "Magnesium & zinc", 150, 250, 800, 0.003, 0.181),
  // ── Plastics & composites ──
  R("pAcetal", "Acetal / Delrin (POM)", "Plastics & composites", 300, 300, 800, 0.004, 0.051),
  R("pNylon66", "Nylon 6/6", "Plastics & composites", 300, 300, 800, 0.004, 0.041),
  R("pNylonMC", "Nylon 6 cast (MC)", "Plastics & composites", 300, 300, 800, 0.004, 0.042),
  R("pPC", "Polycarbonate", "Plastics & composites", 250, 250, 700, 0.003, 0.043),
  R("pAcrylic", "Acrylic (PMMA)", "Plastics & composites", 300, 300, 800, 0.003, 0.043),
  R("pPEEK", "PEEK", "Plastics & composites", 300, 300, 800, 0.003, 0.047),
  R("pPTFE", "PTFE (Teflon)", "Plastics & composites", 300, 300, 900, 0.004, 0.078),
  R("pUHMW", "UHMW polyethylene", "Plastics & composites", 300, 300, 900, 0.004, 0.034),
  R("pHDPE", "HDPE", "Plastics & composites", 400, 400, 1000, 0.004, 0.035),
  R("pPP", "Polypropylene", "Plastics & composites", 400, 400, 1000, 0.004, 0.033),
  R("pPVC", "PVC", "Plastics & composites", 300, 300, 800, 0.003, 0.050),
  R("pABS", "ABS", "Plastics & composites", 300, 300, 800, 0.003, 0.038),
  R("pUltem", "Ultem (PEI)", "Plastics & composites", 250, 250, 700, 0.003, 0.046),
  R("pPPS", "PPS (Ryton)", "Plastics & composites", 250, 250, 700, 0.003, 0.049),
  R("pPET", "PET (Ertalyte)", "Plastics & composites", 300, 300, 800, 0.003, 0.050),
  R("pPhenolic", "Phenolic (Garolite XX / canvas)", "Plastics & composites", 250, 250, 600, 0.003, 0.049),
  R("pG10", "G10 / FR4 (carbide only)", "Plastics & composites", 200, 200, 600, 0.002, 0.065),
  R("pCF", "Carbon fiber laminate (carbide/diamond)", "Plastics & composites", 200, 200, 600, 0.002, 0.056),
  R("pPU", "Polyurethane (hard)", "Plastics & composites", 250, 250, 700, 0.003, 0.043),
  R("pWax", "Machinable wax", "Plastics & composites", 500, 800, 1500, 0.006, 0.034),
  // ── Other ──
  R("oGraphite", "Graphite (EDM electrode)", "Other", 300, 500, 1000, 0.004, 0.065),
  R("oTungsten", "Tungsten", "Other", 10, 30, 100, 0.001, 0.697),
  R("oMoly", "Molybdenum", "Other", 15, 40, 150, 0.001, 0.369),
  R("oLead", "Lead", "Other", 200, 200, 600, 0.004, 0.410),
  R("oSilver", "Sterling silver", "Other", 60, 150, 500, 0.002, 0.373),
  R("oMacor", "Macor machinable ceramic", "Other", 50, 50, 100, 0.001, 0.091),
  R("oHardwood", "Hardwood (maple, oak)", "Other", 500, 800, 1500, 0.006, 0.026),
  // MDF 0.027 lb/in³ (≈ 750 kg/m³). Plywood runs 540 kg/m³ softwood (Engineering ToolBox) to ≈ 680 birch;
  // 0.021 lb/in³ (580 kg/m³) sits in the middle.
  R("oMDF", "MDF", "Other", 500, 800, 1500, 0.006, 0.027),
  R("oPlywood", "Plywood", "Other", 500, 800, 1500, 0.006, 0.021),
]);

export const materialById = (id) => MATERIALS.find((m) => m.id === id) || null;

/** Options for a grouped select, in library order. */
export function materialOptions() {
  return MATERIALS.map((m) => ({ value: m.id, label: m.name, group: m.group }));
}

/**
 * A warning when this tool type shouldn't be cutting this material at all (for example HSS on hardened
 * steel), else null. Every speeds & feeds tool shows it. units "in" or "mm" writes the numbers in that
 * system only; left out, each number is written in both (inch first).
 */
export function toolCaution(id, toolType = "carbide", units) {
  const m = materialById(id);
  if (!m) return null;
  if (toolType === "hss") {
    // HSS itself is about 62–67 HRC (M2/M42); hard-milling data (Lakeshore HARDMILL) lists carbide/CBN only.
    if (NO_HSS[m.id]) return `HSS won't cut ${m.name}: ${NO_HSS[m.id]}`;
    if (m.hrc >= 42) return `${m.name} is about ${m.hrc} HRC — HSS barely cuts it. Use cobalt HSS at the slow end and a light feed, or better, carbide.`;
    return null;
  }
  if (m.hrc >= 55) {
    // Every speeds & feeds screen (mill, drill, lathe, job sheet) shows this, so the lead names the coated tool for each.
    const lead = toolType === "coated" ? "" : "Uncoated carbide wears out fast this hard; use coated (AlTiN) carbide: a hard-milling end mill, a coated insert, or a carbide drill made for hardened steel. ";
    // Turning at these speeds: coated carbide hard turning runs up to about 50 m/min (Tungaloy "Hard
    // Turning", AH8000 grades) at 0.05–0.15 mm/rev. Stated here because a lathe screen that still scales
    // the milling SFM would show far more.
    const sfm = Math.round(materialSpeeds(id, toolType).turnSfm / 5) * 5;
    const speed = both(units, `${sfm} SFM`, `${Math.round(sfm * 0.3048)} m/min`);
    const feed = both(units, "0.002–0.004 IPR", "0.05–0.10 mm/rev");
    return `${lead}Milling at these speeds needs light cuts: side step 2.5% of the tool diameter or less, slots no deeper than 5% of it, dry with an air blast. Turning: start a carbide insert near ${speed} at ${feed}; if Surface speed or Feed per revolution shows more, type these in (CBN runs faster). Drilling: a carbide drill made for hardened steel, at the slower drill speed shown.`;
  }
  return null;
}

/** One number in the user's unit system, or both when the caller didn't say which. */
const both = (units, inch, mm) => (units === "in" ? inch : units === "mm" ? mm : `${inch} (${mm})`);

const NO_HSS = Object.freeze({
  tHard55: "at 55–60 HRC the part is nearly as hard as the cutter. Use coated carbide (a hard-milling end mill, a coated insert, or a carbide drill made for hardened steel) or CBN.",
  ciWhite: "white / chilled iron is about as hard as the cutter. Use carbide, ceramic or CBN, or grind it.",
  niStellite: "Stellite wears HSS out in a few inches. Use carbide.",
  pG10: "the glass fiber dulls HSS almost at once. Use carbide.",
  pCF: "carbon fiber dulls HSS almost at once. Use carbide or diamond-coated tools.",
});

/**
 * Starting SFM and chip load for a material and tool type. sfm is the milling speed; drillSfm and turnSfm
 * are the drilling and turning speeds (lathe tools should read turnSfm, not scale sfm).
 */
export function materialSpeeds(id, toolType = "carbide") {
  const m = materialById(id) || materialById("al6061");
  const sfm = toolType === "hss" ? m.sfmHss : toolType === "coated" ? m.sfmCarbide * 1.25 : m.sfmCarbide;
  const chipIn = toolType === "hss" ? m.chipIn * 0.75 : m.chipIn;
  const carbide = toolType !== "hss";
  // Haas lists one carbide drill speed per material; a coated drill is not taken faster than that.
  const drillSfm = carbide && m.drillCarbide ? m.drillCarbide : Math.round(sfm * 0.8);
  // Default turnSfm = the rounded milling SFM × 1.2, the same number the lathe tools figured before.
  const turnSfm = carbide && m.turnCarbide ? Math.round(m.turnCarbide * (toolType === "coated" ? 1.25 : 1)) : Math.round(sfm) * 1.2;
  return { sfm: Math.round(sfm), chipIn, drillSfm, turnSfm, material: m };
}
