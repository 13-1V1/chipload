// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Number formatting and shop-style input parsing (fractions, mixed numbers, unit suffixes).

/** Fixed-place format that drops trailing zeros. Non-finite → "—". A value that rounds to zero prints "0", never "-0". */
export function fmt(value, places = 3) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.max(0, Math.min(12, Number(places) || 0));
  const fixed = Number(value).toFixed(digits);
  const out = digits === 0 ? fixed : fixed.replace(/\.?0+$/, "");
  return out === "-0" ? "0" : out;
}

/** Decimal places that show `sig` significant figures of `value` (0 for zero or whole-number magnitudes, at most 12). */
export function sigPlaces(value, sig = 4) {
  const v = Math.abs(Number(value));
  if (!Number.isFinite(v) || v === 0) return 0;
  return Math.max(0, Math.min(12, sig - 1 - Math.floor(Math.log10(v))));
}

/** Format to `sig` significant figures, never fewer than `minPlaces` decimals: 0.0000254 stays 0.0000254, not "0". */
export function fmtSig(value, sig = 4, minPlaces = 0) {
  return fmt(value, Math.max(minPlaces, sigPlaces(value, sig)));
}

// Plain decimal text only: "0x10", "0b11" and "Infinity" are not shop numbers, even though Number() reads them.
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Parse "3/8", "1 1/4", "1-1/4", "-0,5", "0.375", "1,200" → number. NaN on failure. */
export function parseFraction(value) {
  // a typographic minus (U+2212, as printed in labels) is the same sign as "-"
  let text = String(value ?? "").trim().replace(/−/g, "-");
  // "1,200" and "12,500.5" are thousands groups, the way they are written in a US shop.
  // Any other single comma is a decimal comma: "0,5", "1,25", "0,125".
  if (/^[+-]?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, "");
  else text = text.replace(/^([+-]?\d+),(\d+)$/, "$1.$2");
  if (!text) return NaN;
  // A mixed number is written "1 1/4" or, on prints and drill charts, "1-1/4".
  const match = text.match(/^([+-])?(?:(\d+)(?:\s+|-))?(\d+)\s*\/\s*(\d+)$/);
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const whole = Number(match[2] || 0);
    const numerator = Number(match[3]);
    const denominator = Number(match[4]);
    if (!denominator) return NaN;
    return sign * (whole + numerator / denominator);
  }
  if (!DECIMAL.test(text)) return NaN;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : NaN;
}

// A length may carry its own unit, with or without a space: 10mm, 10 mm, 1/2", 0.5in, 2 inches.
const UNIT_SUFFIX = /^(.*?)\s*(millimeters?|millimetres?|mm|inches|inch|in|["″”])?$/i;

/**
 * Split a typed size into its number text and the unit typed with it: "8.5 mm" → { number: "8.5", unit: "mm" },
 * '3/8"' → { number: "3/8", unit: "in" }, "0.201" → { number: "0.201", unit: null }. Null when nothing is left for the number.
 */
export function splitUnit(value) {
  const m = String(value ?? "").trim().match(UNIT_SUFFIX);
  if (!m || !m[1]) return null;
  return { number: m[1], unit: m[2] ? (/^m/i.test(m[2]) ? "mm" : "in") : null };
}

/** Parse a length; an explicit mm / in / " suffix converts to `expectedUnit`. NaN on failure. */
export function parseDimension(value, expectedUnit = "in") {
  const s = splitUnit(value);
  if (!s) return NaN;
  const parsed = parseFraction(s.number);
  if (!Number.isFinite(parsed) || !s.unit) return parsed;
  if (expectedUnit === "in" && s.unit === "mm") return parsed / 25.4;
  if (expectedUnit === "mm" && s.unit === "in") return parsed * 25.4;
  return parsed;
}

export function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

/**
 * Nearest shop fraction (to 1/64) for a decimal inch value.
 * Returns { numerator, denominator, whole, text, error } or null when nothing is within `tolerance`.
 */
export function decimalToFraction(inches, { maxDenominator = 64, tolerance = 0.0005 } = {}) {
  if (!Number.isFinite(inches) || inches < 0) return null;
  for (let d = 1; d <= maxDenominator; d *= 2) {
    const n = Math.round(inches * d);
    if (Math.abs(n / d - inches) < tolerance) {
      const g = gcd(n, d) || 1;
      const sn = n / g, sd = d / g;
      const whole = Math.floor(sn / sd);
      const rem = sn - whole * sd;
      const text = sd === 1 ? `${sn}` : whole > 0 ? `${whole}-${rem}/${sd}` : `${rem}/${sd}`;
      return { numerator: sn, denominator: sd, whole, remainder: rem, text, error: n / d - inches };
    }
  }
  return null;
}

/**
 * A number for a G-code word. Always carries a decimal point: on many Fanuc-style controls
 * "X1" means 0.0001 in (or 0.001 mm), not 1.0. Trailing zeros trimmed, one digit kept: 1 → "1.0", -0.5 → "-0.5".
 */
export function gcodeNumber(value, places = 4) {
  let s = Number(value).toFixed(places);
  if (s.includes(".")) s = s.replace(/0+$/, "");
  if (s.endsWith(".")) s += "0";
  if (!s.includes(".")) s += ".0";
  return /^-0\.0$/.test(s) ? "0.0" : s;
}

export const degToRad = (d) => d * Math.PI / 180;
export const radToDeg = (r) => r * 180 / Math.PI;
