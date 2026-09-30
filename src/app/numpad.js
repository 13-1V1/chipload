// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Custom number pad: digits, ".", "/" and space for mixed fractions, ± and backspace.
// Attaches to inputs with data-numpad; never lets the phone keyboard open (inputmode=none).

import { ICONS } from "./icons.js";

const KEYS = [
  "7", "8", "9", "bksp",
  "4", "5", "6", "/",
  "1", "2", "3", "sp",
  "pm", "0", ".", "next",
];
const LABEL = { bksp: ICONS.backspace, sp: "␣", pm: "±", next: "Next", "/": "/" };

let el = null;
let active = null;
let onChange = null;
let onNext = null;

function build() {
  el = document.createElement("div");
  el.className = "numpad";
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "Number pad");
  for (const k of KEYS) {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.key = k;
    b.innerHTML = LABEL[k] || k;
    if (k === "bksp" || k === "sp" || k === "pm" || k === "/") b.className = "fn";
    if (k === "next") b.className = "go";
    if (k === "sp") b.setAttribute("aria-label", "space for mixed numbers like 1 1/4");
    if (k === "bksp") b.setAttribute("aria-label", "backspace");
    if (k === "pm") b.setAttribute("aria-label", "change sign");
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(k); });
    el.append(b);
  }
  document.body.append(el);
}

function press(k) {
  if (!active) return;
  let v = active.value;
  if (k === "bksp") v = v.slice(0, -1);
  else if (k === "sp") { if (v && !v.endsWith(" ") && !v.includes("/")) v += " "; }
  else if (k === "pm") v = v.startsWith("-") ? v.slice(1) : "-" + v;
  else if (k === "next") { onNext?.(active); return; }
  else if (k === ".") { if (!v.split(/[\s/]/).pop().includes(".")) v += "."; }
  else if (k === "/") { if (v && !v.includes("/") && !v.endsWith(" ")) v += "/"; }
  else v += k;
  active.value = v;
  onChange?.(active);
}

function setPadHeight() {
  const h = el.classList.contains("open") ? el.offsetHeight : 0;
  document.documentElement.style.setProperty("--pad-h", `${h}px`);
  document.querySelector(".answer")?.classList.toggle("up", h > 0);
  document.querySelector("main")?.style.setProperty("padding-bottom", `calc(var(--answer-h) + var(--gutter) + ${h}px)`);
}

export function openNumpad(input, { change, next } = {}) {
  if (!el) build();
  if (active && active !== input) active.removeAttribute("data-active");
  active = input;
  onChange = change;
  onNext = next;
  input.dataset.active = "true";
  el.classList.add("open");
  requestAnimationFrame(() => {
    setPadHeight();
    input.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

export function closeNumpad() {
  if (!el) return;
  el.classList.remove("open");
  if (active) active.removeAttribute("data-active");
  active = null;
  setPadHeight();
}

export function isNumpadOpen() { return !!el?.classList.contains("open"); }

/** Wire a numeric input to the pad. */
export function attachNumpad(input, handlers) {
  input.inputMode = "none";
  input.autocomplete = "off";
  input.addEventListener("focus", () => openNumpad(input, handlers));
  // A field that already has focus (pad was dismissed) must reopen on the next tap.
  input.addEventListener("click", () => openNumpad(input, handlers));
  // Hardware keyboards still work.
  input.addEventListener("input", () => handlers?.change?.(input));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); handlers?.next?.(input); } });
}

// Tap outside any field or the pad → close. Listens on click (not pointerdown) so the
// tap's target is settled before the layout shifts.
document.addEventListener("click", (e) => {
  if (!el || !el.classList.contains("open")) return;
  if (el.contains(e.target)) return;
  if (e.target.closest("[data-numpad], label[for]")) return;
  closeNumpad();
});
