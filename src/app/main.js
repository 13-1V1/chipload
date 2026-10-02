// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Boot: theme, calculator modules, router → screens.

import { applyTheme, onSettings, getSettings, setSetting } from "./settings.js";
import { onRoute, startRouter, navigate, back, replace, refresh } from "./router.js";
import { getCalc } from "./registry.js";
import { mountCalculator, hideAnswerBar } from "./render.js";
import { mountChart } from "./chart.js";
import { closeNumpad } from "./numpad.js";
import { renderHome, renderCategory, renderSettings, renderPro, renderStatic } from "./views.js";
import { renderShop } from "./shop.js";
import { ICONS, CATEGORIES } from "./icons.js";
import { initNative, isNative } from "./native.js";
import { initBilling } from "./billing.js";
import "../calcs/index.js";

applyTheme();
onSettings(applyTheme);

const mainEl = document.querySelector("main");
// Each screen gets a brand-new container. Views attach listeners to it; replacing the node drops them,
// so handlers from the last screen can never fire on this one.
let main = mainEl;
const title = document.querySelector("#title");
const backBtn = document.querySelector("#back");
const settingsBtn = document.querySelector("#settingsBtn");
const gloveBtn = document.querySelector("#gloveBtn");
const helpBtn = document.querySelector("#helpBtn");
let current = null;

backBtn.addEventListener("click", back);
settingsBtn.addEventListener("click", () => navigate("/settings"));
// Glove mode is one tap from every screen — you shouldn't have to take a glove off to turn it on.
const syncGlove = () => gloveBtn.setAttribute("aria-pressed", String(!!getSettings().glove));
gloveBtn.addEventListener("click", () => setSetting("glove", !getSettings().glove));
onSettings(syncGlove);
syncGlove();
// Pro turning on (a purchase landing while any screen is open) or off redraws the screen you're on:
// locks, PRO tags, Shop and the machine clamp all follow at once. Inputs are saved on every change.
let proWas = !!getSettings().pro;
onSettings((s) => {
  if (!!s.pro === proWas) return;
  proWas = !!s.pro;
  const y = window.scrollY;
  refresh();
  window.scrollTo(0, y);
});
helpBtn.addEventListener("click", () => current?.toggleHelp?.());
// Enter (or Done) on the phone keyboard puts it away: a text field has nowhere else to go.
// Fields with their own Enter (search, job name) act first; this only drops the keyboard after.
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches?.('input[type="text"]:not([data-numpad]), input[type="search"]')) e.target.blur();
});

function screen(name, { showBack = true, answer = false, tool = false } = {}) {
  current?.destroy?.();
  current = null;
  closeNumpad();
  main = document.createElement("div");
  main.className = "view";
  mainEl.replaceChildren(main);
  mainEl.classList.toggle("no-answer", !answer);
  if (!answer) hideAnswerBar();
  title.textContent = name;
  document.title = name === "Chipload" ? "Chipload" : `${name} · Chipload`;
  backBtn.hidden = !showBack;
  helpBtn.hidden = !tool;
  settingsBtn.hidden = tool; // on a tool screen the bar is back · title · ? · glove
  window.scrollTo(0, 0);
}

onRoute(({ segments, params }) => {
  const [head, id] = segments;
  if (!head) { screen("Chipload", { showBack: false }); renderHome(main); return; }
  if (head === "cat") { screen(CATEGORIES.find((c) => c.id === id)?.name || "Category"); renderCategory(main, id); return; }
  if (head === "calc") {
    const def = getCalc(id);
    if (!def) { screen("Not found"); main.innerHTML = `<div class="empty">That tool doesn't exist. <a href="#/">Go home</a>.</div>`; return; }
    if (def.view === "chart") { screen(def.title, { tool: true }); current = mountChart(def, main, { params }); helpBtn.hidden = !current?.hasHelp; return; }
    screen(def.title, { answer: true, tool: true });
    current = mountCalculator(def, main, { params });
    helpBtn.hidden = !current?.hasHelp;
    return;
  }
  if (head === "shop") { screen("Shop"); renderShop(main, id || "machines"); return; }
  if (head === "settings") { screen("Settings"); renderSettings(main); return; }
  if (head === "pro") { screen("Chipload Pro"); current = renderPro(main); return; }
  if (head === "privacy" || head === "licenses") { screen(head === "privacy" ? "Privacy" : "Licenses"); renderStatic(main, head); return; }
  replace("/"); // in place of the bad link, so Back still leaves it
});

startRouter();
initNative();
initBilling();

// Web version only: keep a copy of the app so it opens with no signal. The Android app ships its files.
// The worker starts after this page has already loaded its ~100 modules, so the page tells it what it
// loaded and the worker fetches its own copies — one online visit is enough to work offline.
if (!isNative() && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  // the worker answers when its copy is complete
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "precached" && event.data.complete) document.documentElement.dataset.offline = "ready";
  });
  navigator.serviceWorker.register("sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      const urls = performance.getEntriesByType("resource").map((entry) => entry.name).filter((url) => url.startsWith(location.origin));
      registration.active?.postMessage({ type: "precache", urls });
    })
    .catch(() => { /* no offline copy; the app still works online */ });
}
