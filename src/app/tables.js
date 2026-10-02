// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// A table wider than the screen would have its right-hand columns cut off — on a phone that hid the
// clearance-drill columns of the bolt chart. Instead it stacks: each row becomes a card, first column as
// its title and the others as label + value. Decided per table, and again when the phone turns.

/** One cell's attributes: its column label (shown in a card) and how it lines up. */
export function cellAttrs(column) {
  const cls = [column.align === "right" ? "r" : "", column.long ? "long" : ""].filter(Boolean).join(" ");
  return `${cls ? ` class="${cls}"` : ""} data-label="${String(column.label ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}"`;
}

/**
 * Stack `wrap`'s table when it can't fit. With `keepStacked` a stacked table stays stacked, so a chart
 * being filtered doesn't jump between layouts as rows come and go.
 */
export function fitTable(wrap, { keepStacked = false } = {}) {
  const table = wrap?.querySelector("table");
  if (!table) return;
  if (keepStacked && wrap.classList.contains("stack")) return;
  wrap.classList.remove("stack");
  if (table.scrollWidth > wrap.clientWidth + 1) wrap.classList.add("stack");
}

let settle = null;
window.addEventListener("resize", () => {
  clearTimeout(settle);
  settle = setTimeout(() => document.querySelectorAll(".table-wrap").forEach((wrap) => fitTable(wrap)), 150);
});
