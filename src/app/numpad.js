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
let holdTimer = null; // backspace held down
const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };
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
    if (k === "pm") b.setAttribute("aria-label", "change sign");
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); press(k); });
    if (k === "bksp") {
      // hold backspace to clear the whole field — one gesture instead of ten taps with a glove on
      b.addEventListener("pointerdown", () => {
        cancelHold();
        const field = active; // only ever the field the hold began on
        holdTimer = setTimeout(() => { if (field && active === field) { field.value = ""; onChange?.(field); } }, 550);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, cancelHold);
      b.setAttribute("aria-label", "backspace (hold to clear)");
    }
    el.append(b);
  }
  el.inert = true;
  document.body.append(el);
}

function press(k) {
  if (k !== "bksp") cancelHold(); // another key means the backspace was let go
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

// Phone on its side: the pad is a full-height column on the right instead of a sheet at the bottom.
// Must match the landscape media query in app.css.
const SIDE_PAD = window.matchMedia("(orientation: landscape) and (max-height: 500px)");

/**
 * Tell the page where the pad is. As a bottom sheet the answer bar rides on top of it and the content
 * gets room to scroll; as a side column the stylesheet moves the page left of it (html.pad-open).
 */
function setPadHeight() {
  const open = el.classList.contains("open");
  const root = document.documentElement;
  root.classList.toggle("pad-open", open);
  el.inert = !open; // a hidden pad's keys stay out of reach of Tab and screen readers
  const h = open && !SIDE_PAD.matches ? el.offsetHeight : 0;
  root.style.setProperty("--pad-h", `${h}px`);
  document.querySelector(".answer")?.classList.toggle("up", h > 0);
  const main = document.querySelector("main");
  if (h > 0) main?.style.setProperty("padding-bottom", `calc(var(--answer-space) + var(--gutter) + ${h}px)`);
  else main?.style.removeProperty("padding-bottom"); // back to the stylesheet, which knows whether this screen has an answer bar
}

/** Keep the field being typed in between the top bar and whatever covers the screen below it. */
function keepVisible(behavior = "smooth") {
  if (!active) return;
  const r = active.getBoundingClientRect();
  let bottom = window.innerHeight;
  const answer = document.querySelector(".answer");
  if (answer && !answer.hidden) {
    const a = answer.getBoundingClientRect();
    if (a.left < r.right && a.right > r.left) bottom = Math.min(bottom, a.top);
  }
  // where the pad comes to rest, not how far its slide-in has got; a side column covers nothing below the field
  if (isNumpadOpen() && !SIDE_PAD.matches) bottom = Math.min(bottom, window.innerHeight - el.offsetHeight);
  const bar = document.querySelector(".topbar");
  const top = bar && getComputedStyle(bar).position === "sticky" ? bar.getBoundingClientRect().bottom : 0;
  if (r.bottom > bottom - 12) window.scrollBy({ top: r.bottom - bottom + 12, behavior });
  else if (r.top < top + 12) window.scrollBy({ top: r.top - top - 12, behavior });
}

export function openNumpad(input, { change, next } = {}) {
  if (!el) build();
  if (active && active !== input) active.removeAttribute("data-active");
  active = input;
  onChange = change;
  onNext = next;
  input.dataset.active = "true";
  el.classList.add("open");
  setPadHeight(); // the page makes room in the same frame the pad starts to slide in
  requestAnimationFrame(() => keepVisible());
}

export function closeNumpad() {
  cancelHold();
  if (!el) return;
  el.classList.remove("open");
  if (active) active.removeAttribute("data-active");
  active = null;
  setPadHeight();
}

export function isNumpadOpen() { return !!el?.classList.contains("open"); }

/**
 * On screen right now. A closed "More options" drawer doesn't remove its fields from the page —
 * Chrome hides them with content-visibility, so they still have boxes — and a field in there can't
 * take focus. Ask the browser itself (checkVisibility), and treat a closed drawer as hidden either way.
 */
export const isShown = (field) => !field.closest("details:not([open])") &&
  (typeof field.checkVisibility === "function" ? field.checkVisibility() : field.getClientRects().length > 0);

/** The pad's Next: the following number field on screen in `scope`, or put the pad away after the last one. */
export function nextField(field, scope) {
  const list = [...(scope || document).querySelectorAll("[data-numpad]")].filter((x) => x === field || isShown(x));
  const following = list[list.indexOf(field) + 1];
  if (following) following.focus();
  else { field.blur(); closeNumpad(); }
}

/** Wire a numeric input to the pad. With no `next` handler, Next steps to the following pad field in `scope`, or closes the pad. */
export function attachNumpad(input, handlers = {}, scope = null) {
  input.inputMode = "none";
  input.autocomplete = "off";
  const next = handlers.next || ((field) => nextField(field, scope));
  const wired = { change: handlers.change, next };
  input.addEventListener("focus", () => openNumpad(input, wired));
  // A field that already has focus (pad was dismissed) must reopen on the next tap.
  input.addEventListener("click", () => openNumpad(input, wired));
  // Hardware keyboards still work.
  input.addEventListener("input", () => wired.change?.(input));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); next(input); } });
}

// Tap outside any pad field or the pad → close. Acts on click (not pointerdown) so the layout doesn't
// shift mid-tap, but judges the tap by where the press began: with a mouse, the pad slides up under
// the pointer and the click itself lands on whatever is there by then.
// A label only counts if it belongs to a pad field: tapping a text field, or its label, hands over
// to the phone's keyboard.
let pressedOn = null;
document.addEventListener("pointerdown", (e) => { pressedOn = e.target; }, true);
document.addEventListener("click", (e) => {
  const target = pressedOn?.isConnected ? pressedOn : e.target;
  pressedOn = null; // a keyboard "click" has no press before it
  if (!el || !el.classList.contains("open")) return;
  if (el.contains(target) || target.closest("[data-numpad]")) return;
  const label = target.closest("label[for]");
  if (label && document.getElementById(label.htmlFor)?.dataset.numpad) return;
  closeNumpad();
});

// Rotating the phone moves the pad (bottom sheet ⇄ side column) and sends several resize events while the
// system bars settle. Re-place the pad on each one, but scroll only once the size stops changing,
// and jump rather than glide so a half-finished scroll can't strand the field.
let settle = null;
window.addEventListener("resize", () => {
  if (!isNumpadOpen()) return;
  setPadHeight();
  clearTimeout(settle);
  settle = setTimeout(() => { if (isNumpadOpen()) { setPadHeight(); keepVisible("auto"); } }, 150);
});
