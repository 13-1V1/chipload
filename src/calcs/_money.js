// Created by: Brennan Meyer with use of Claude Code 10/02/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Dollars the way a quote or an invoice reads them: always cents, thousands grouped ($1,024.00, $3.80).

/** "$1,024.00". Non-finite → "—". */
export function money(value) {
  if (!Number.isFinite(value)) return "—";
  const cents = Math.round(Math.abs(value) * 100) / 100;
  const text = cents.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 && cents > 0 ? `-$${text}` : `$${text}`;
}
