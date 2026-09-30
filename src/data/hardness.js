// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Hardness conversion for steels. Source: ASTM E140 Table 1 (non-austenitic steels), rounded.
// Rows: [HRC, HV, HB (3000 kgf), tensile ksi (approx)] — HB blank where the indenter would be off-scale.

export const HRC_TABLE = Object.freeze([
  [68, 940, null, null], [66, 865, null, null], [65, 832, null, null], [64, 800, null, null], [62, 746, null, null],
  [60, 697, 654, null], [58, 653, 615, null], [56, 613, 577, null], [55, 595, 560, null], [54, 577, 543, null],
  [52, 544, 512, 262], [50, 513, 481, 251], [48, 484, 455, 231], [46, 458, 432, 221], [45, 446, 421, 212],
  [44, 434, 409, 205], [42, 412, 390, 191], [40, 392, 371, 182], [38, 372, 353, 171], [36, 354, 336, 165],
  [35, 345, 327, 159], [34, 336, 319, 155], [32, 318, 301, 146], [30, 302, 286, 138], [28, 286, 271, 131],
  [26, 272, 258, 125], [25, 266, 253, 121], [24, 260, 247, 119], [22, 248, 237, 113], [20, 238, 226, 110],
]);

/** Rows: [HRB, HV, HB, tensile ksi] for the softer range. */
export const HRB_TABLE = Object.freeze([
  [100, 240, 240, 116], [99, 234, 234, 112], [98, 228, 228, 109], [97, 222, 222, 106], [96, 216, 216, 103],
  [95, 210, 210, 100], [94, 205, 205, 98], [93, 200, 200, 95], [92, 195, 195, 93], [91, 190, 190, 91],
  [90, 185, 185, 89], [89, 180, 180, 87], [88, 176, 176, 85], [87, 172, 172, 83], [86, 169, 169, 82],
  [85, 165, 165, 80], [84, 162, 162, 78], [83, 159, 159, 77], [82, 156, 156, 75], [81, 153, 153, 74],
  [80, 150, 150, 72], [78, 144, 144, 69], [76, 139, 139, 67], [74, 135, 135, 64], [72, 130, 130, 62],
  [70, 125, 125, 60], [68, 121, 121, 58], [66, 117, 117, 56], [64, 114, 114, 54], [62, 110, 110, 52],
  [60, 107, 107, 51], [55, 100, 100, 48], [50, 93, 93, 45],
]);

function interp(table, colIn, valIn, colOut) {
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

/**
 * Convert from one scale to all others. scale: "hrc" | "hrb" | "hv" | "hb".
 * Returns { hrc, hrb, hv, hb, tensile } with nulls where off-scale.
 */
export function convertHardness(scale, value) {
  // Pivot on HV.
  let hv;
  if (scale === "hv") hv = value;
  else if (scale === "hrc") hv = interp(HRC_TABLE, 0, value, 1);
  else if (scale === "hrb") hv = interp(HRB_TABLE, 0, value, 1);
  else if (scale === "hb") hv = interp(HRC_TABLE, 2, value, 1) ?? interp(HRB_TABLE, 2, value, 1);
  if (hv == null) return null;
  const hrc = hv >= 238 ? interp(HRC_TABLE, 1, hv, 0) : null;
  const hrb = hv <= 240 ? interp(HRB_TABLE, 1, hv, 0) : null;
  const hb = hv >= 238 ? interp(HRC_TABLE, 1, hv, 2) : interp(HRB_TABLE, 1, hv, 2);
  const tensile = hv >= 238 ? interp(HRC_TABLE, 1, hv, 3) : interp(HRB_TABLE, 1, hv, 3);
  return { hv, hrc, hrb, hb, tensile };
}
