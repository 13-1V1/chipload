// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Hardness conversion for non-austenitic steels. Every row is a published one; nothing past the tables.
// HV and HB: ASTM E140-07 Table 1 (Rockwell C range, HB = 10 mm carbide ball, 3000 kgf) and Table 2 (Rockwell B range).
// Tensile: ASTM A370 Table 2 (HRC 59–20) and Table 3 (HRB 100–65), "approximate tensile strength". A370 lists none
// at HRC 60 and harder or below HRB 65. HB is blank above HRC 60: E140 only prints those in parentheses, and
// A370 17.4.4 says Brinell isn't recommended over 650 HBW. E140 Table 2 has no HV or HB below HRB 55.

/** Rows: [HRC, HV, HB (3000 kgf), tensile ksi (approx)] */
export const HRC_TABLE = Object.freeze([
  [68, 940, null, null], [67, 900, null, null], [66, 865, null, null], [65, 832, null, null], [64, 800, null, null],
  [63, 772, null, null], [62, 746, null, null], [61, 720, null, null], [60, 697, 654, null], [59, 674, 634, 351],
  [58, 653, 615, 338], [57, 633, 595, 325], [56, 613, 577, 313], [55, 595, 560, 301], [54, 577, 543, 292],
  [53, 560, 525, 283], [52, 544, 512, 273], [51, 528, 496, 264], [50, 513, 481, 255], [49, 498, 469, 246],
  [48, 484, 455, 238], [47, 471, 443, 229], [46, 458, 432, 221], [45, 446, 421, 215], [44, 434, 409, 208],
  [43, 423, 400, 201], [42, 412, 390, 194], [41, 402, 381, 188], [40, 392, 371, 182], [39, 382, 362, 177],
  [38, 372, 353, 171], [37, 363, 344, 166], [36, 354, 336, 161], [35, 345, 327, 156], [34, 336, 319, 152],
  [33, 327, 311, 149], [32, 318, 301, 146], [31, 310, 294, 141], [30, 302, 286, 138], [29, 294, 279, 135],
  [28, 286, 271, 131], [27, 279, 264, 128], [26, 272, 258, 125], [25, 266, 253, 123], [24, 260, 247, 119],
  [23, 254, 243, 117], [22, 248, 237, 115], [21, 243, 231, 112], [20, 238, 226, 110],
]);

/** Rows: [HRB, HV, HB, tensile ksi (approx)] for the softer range. */
export const HRB_TABLE = Object.freeze([
  [100, 240, 240, 116], [99, 234, 234, 114], [98, 228, 228, 109], [97, 222, 222, 104], [96, 216, 216, 102],
  [95, 210, 210, 100], [94, 205, 205, 98], [93, 200, 200, 94], [92, 195, 195, 92], [91, 190, 190, 90],
  [90, 185, 185, 89], [89, 180, 180, 88], [88, 176, 176, 86], [87, 172, 172, 84], [86, 169, 169, 83],
  [85, 165, 165, 82], [84, 162, 162, 81], [83, 159, 159, 80], [82, 156, 156, 77], [81, 153, 153, 73],
  [80, 150, 150, 72], [79, 147, 147, 70], [78, 144, 144, 69], [77, 141, 141, 68], [76, 139, 139, 67],
  [75, 137, 137, 66], [74, 135, 135, 65], [73, 132, 132, 64], [72, 130, 130, 63], [71, 127, 127, 62],
  [70, 125, 125, 61], [69, 123, 123, 60], [68, 121, 121, 59], [67, 119, 119, 58], [66, 117, 117, 57],
  [65, 116, 116, 56], [64, 114, 114, null], [63, 112, 112, null], [62, 110, 110, null], [61, 108, 108, null],
  [60, 107, 107, null], [59, 106, 106, null], [58, 104, 104, null], [57, 103, 103, null], [56, 101, 101, null],
  [55, 100, 100, null],
]);

/** Where each scale sits in a row. Rockwell C and B both sit in column 0 of their own table. */
const COL = { hrc: 0, hrb: 0, hv: 1, hb: 2, tensile: 3 };

function interp(table, colIn, valIn, colOut) {
  if (!Number.isFinite(valIn)) return null;
  const rows = table.filter((r) => r[colIn] != null && r[colOut] != null).sort((a, b) => a[colIn] - b[colIn]);
  if (!rows.length) return null;
  if (valIn <= rows[0][colIn]) return valIn < rows[0][colIn] - 1e-9 ? null : rows[0][colOut];
  if (valIn >= rows[rows.length - 1][colIn]) return valIn > rows[rows.length - 1][colIn] + 1e-9 ? null : rows[rows.length - 1][colOut];
  for (let i = 1; i < rows.length; i++) {
    if (valIn <= rows[i][colIn]) {
      const [x0, x1] = [rows[i - 1][colIn], rows[i][colIn]];
      const [y0, y1] = [rows[i - 1][colOut], rows[i][colOut]];
      return y0 + (y1 - y0) * (valIn - x0) / (x1 - x0);
    }
  }
  return null;
}

const look = (table, from, value, to) => interp(table, COL[from], value, COL[to]);

// E140's two tables meet badly: Table 2 ends at HRB 100 = HV 240 = HB 240 (116 ksi), while Table 1 starts at
// HRC 20 = HV 238 = HB 226 (110 ksi) and only passes HB 240 at HRC 23 (HV 254, HB 243, 117 ksi). For a Vickers or
// Brinell reading, HV, HB and tensile run up Table 2 to its top row, then straight on to the first Table 1 row that
// is harder in every column, so a harder reading never shows a lower number. The Table 1 rows skipped (HRC 20–22)
// still answer an HRC reading, and the Rockwell C number for any reading still comes from Table 1 itself.
const B_TOP = HRB_TABLE[0];
const CHAIN = Object.freeze([...HRB_TABLE, ...HRC_TABLE.filter((r) => r[1] > B_TOP[1] && (r[2] == null || r[2] > B_TOP[2]))]);

/** Vickers range where the tables disagree (HRB 97.7 = HB 226 = HRC 20's Brinell, up to HRC 23 = HV 254). */
export const SEAM_HV = Object.freeze([226, 254]);

/**
 * Convert from one scale to all others. scale: "hrc" | "hrb" | "hv" | "hb".
 * Returns { hrc, hrb, hv, hb, tensile, seam } with nulls where the tables give no value, or null if the
 * reading is outside both tables. seam is true where E140's B and C tables disagree (SEAM_HV): the
 * caller should say the conversion is rougher there.
 * An HRC reading reads Table 1, an HRB reading Table 2, row for row. HV and HB readings run up the chain
 * above, which never steps backward; their Rockwell C and B numbers come straight from Tables 1 and 2.
 */
export function convertHardness(scale, value) {
  if (!(scale in COL) || scale === "tensile" || !Number.isFinite(value)) return null;
  const home = scale === "hrc" ? HRC_TABLE : scale === "hrb" ? HRB_TABLE : CHAIN;
  const r = { hv: null, hrc: null, hrb: null, hb: null, tensile: null, [scale]: value, seam: false };
  for (const k of ["hv", "hb", "tensile"]) if (k !== scale) r[k] = look(home, scale, value, k);
  // A Rockwell reading off its own table converts to nothing
  if ((scale === "hrc" || scale === "hrb") && r.hv == null) return null;
  // Rockwell C and B always come from their own table: from the reading itself, or from its Vickers number
  if (scale !== "hrc") r.hrc = scale === "hrb" ? look(HRC_TABLE, "hv", r.hv, "hrc") : look(HRC_TABLE, scale, value, "hrc");
  if (scale !== "hrb") r.hrb = scale === "hrc" ? look(HRB_TABLE, "hv", r.hv, "hrb") : look(HRB_TABLE, scale, value, "hrb");
  // A Vickers or Brinell number below or above both tables converts to nothing — say so, don't answer "off scale" everywhere.
  if (r.hrc == null && r.hrb == null) return null;
  r.seam = r.hv >= SEAM_HV[0] && r.hv <= SEAM_HV[1];
  return r;
}
