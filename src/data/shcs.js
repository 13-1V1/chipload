// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Socket head cap screw counterbore and clearance chart.
// Source: ASME B18.3 (head dimensions), ASME B18.2.8 (clearance holes: close / normal / loose),
// ISO 4762 (metric heads), ISO 273 (metric clearance, fine / medium). Standard counterbore = head + clearance.

/** Inch: size, head dia, head height, counterbore dia (label, in), clearance close/normal/loose (label, in) */
export const SHCS_INCH = Object.freeze([
  { size: "#0", head: 0.096, height: 0.060, cbore: ['1/8"', 0.125], close: ["#51", 0.067], normal: ["#48", 0.076], loose: ["#44", 0.086] },
  { size: "#1", head: 0.118, height: 0.073, cbore: ['5/32"', 0.15625], close: ["#46", 0.081], normal: ["#43", 0.089], loose: ["#38", 0.101] },
  { size: "#2", head: 0.140, height: 0.086, cbore: ['3/16"', 0.1875], close: ["#42", 0.0935], normal: ["#38", 0.1015], loose: ["#32", 0.116] },
  { size: "#3", head: 0.161, height: 0.099, cbore: ['7/32"', 0.21875], close: ["#36", 0.1065], normal: ["#32", 0.116], loose: ["#30", 0.1285] },
  { size: "#4", head: 0.183, height: 0.112, cbore: ['7/32"', 0.21875], close: ["#31", 0.120], normal: ["#30", 0.1285], loose: ["#27", 0.144] },
  { size: "#5", head: 0.205, height: 0.125, cbore: ['1/4"', 0.25], close: ["#29", 0.136], normal: ["#25", 0.1495], loose: ["#22", 0.157] },
  { size: "#6", head: 0.226, height: 0.138, cbore: ['9/32"', 0.28125], close: ["#26", 0.147], normal: ["#20", 0.161], loose: ["#17", 0.173] },
  { size: "#8", head: 0.270, height: 0.164, cbore: ['5/16"', 0.3125], close: ["#17", 0.173], normal: ["#13", 0.185], loose: ["#8", 0.199] },
  { size: "#10", head: 0.312, height: 0.190, cbore: ['3/8"', 0.375], close: ["#9", 0.196], normal: ["#7", 0.201], loose: ["#2", 0.221] },
  { size: "1/4", head: 0.375, height: 0.250, cbore: ['7/16"', 0.4375], close: ["F", 0.257], normal: ['9/32"', 0.28125], loose: ['19/64"', 0.296875] },
  { size: "5/16", head: 0.469, height: 0.3125, cbore: ['17/32"', 0.53125], close: ["P", 0.323], normal: ['11/32"', 0.34375], loose: ['23/64"', 0.359375] },
  { size: "3/8", head: 0.562, height: 0.375, cbore: ['5/8"', 0.625], close: ["W", 0.386], normal: ['13/32"', 0.40625], loose: ['27/64"', 0.421875] },
  { size: "7/16", head: 0.656, height: 0.4375, cbore: ['23/32"', 0.71875], close: ['29/64"', 0.453125], normal: ['15/32"', 0.46875], loose: ['31/64"', 0.484375] },
  { size: "1/2", head: 0.750, height: 0.500, cbore: ['13/16"', 0.8125], close: ['33/64"', 0.515625], normal: ['17/32"', 0.53125], loose: ['9/16"', 0.5625] },
  { size: "5/8", head: 0.938, height: 0.625, cbore: ['1"', 1.0], close: ['41/64"', 0.640625], normal: ['21/32"', 0.65625], loose: ['11/16"', 0.6875] },
  { size: "3/4", head: 1.125, height: 0.750, cbore: ['1-3/16"', 1.1875], close: ['49/64"', 0.765625], normal: ['13/16"', 0.8125], loose: ['27/32"', 0.84375] },
  { size: "7/8", head: 1.312, height: 0.875, cbore: ['1-3/8"', 1.375], close: ['57/64"', 0.890625], normal: ['15/16"', 0.9375], loose: ['31/32"', 0.96875] },
  { size: "1", head: 1.500, height: 1.000, cbore: ['1-5/8"', 1.625], close: ['1-1/64"', 1.015625], normal: ['1-3/32"', 1.09375], loose: ['1-5/32"', 1.15625] },
]);

/** Metric (mm): size, head dia, head height, counterbore dia, clearance fine/medium/coarse */
export const SHCS_METRIC = Object.freeze([
  { size: "M2", head: 3.8, height: 2.0, cbore: 4.5, fine: 2.2, medium: 2.4, coarse: 2.6 },
  { size: "M2.5", head: 4.5, height: 2.5, cbore: 5.5, fine: 2.7, medium: 2.9, coarse: 3.1 },
  { size: "M3", head: 5.5, height: 3.0, cbore: 6.5, fine: 3.2, medium: 3.4, coarse: 3.6 },
  { size: "M4", head: 7.0, height: 4.0, cbore: 8.0, fine: 4.3, medium: 4.5, coarse: 4.8 },
  { size: "M5", head: 8.5, height: 5.0, cbore: 10.0, fine: 5.3, medium: 5.5, coarse: 5.8 },
  { size: "M6", head: 10.0, height: 6.0, cbore: 11.0, fine: 6.4, medium: 6.6, coarse: 7.0 },
  { size: "M8", head: 13.0, height: 8.0, cbore: 15.0, fine: 8.4, medium: 9.0, coarse: 10.0 },
  { size: "M10", head: 16.0, height: 10.0, cbore: 18.0, fine: 10.5, medium: 11.0, coarse: 12.0 },
  { size: "M12", head: 18.0, height: 12.0, cbore: 20.0, fine: 13.0, medium: 13.5, coarse: 14.5 },
  { size: "M14", head: 21.0, height: 14.0, cbore: 24.0, fine: 15.0, medium: 15.5, coarse: 16.5 },
  { size: "M16", head: 24.0, height: 16.0, cbore: 26.0, fine: 17.0, medium: 17.5, coarse: 18.5 },
  { size: "M20", head: 30.0, height: 20.0, cbore: 33.0, fine: 21.0, medium: 22.0, coarse: 24.0 },
  { size: "M24", head: 36.0, height: 24.0, cbore: 40.0, fine: 25.0, medium: 26.0, coarse: 28.0 },
]);
