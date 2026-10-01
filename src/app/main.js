// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Boot: theme, calculator modules, router → screens.

import { applyTheme, onSettings } from "./settings.js";
import { onRoute, startRouter, navigate, back } from "./router.js";
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

const main = document.querySelector("main");
const title = document.querySelector("#title");
const backBtn = document.querySelector("#back");
const settingsBtn = document.querySelector("#settingsBtn");
let current = null;

backBtn.addEventListener("click", back);
settingsBtn.addEventListener("click", () => navigate("/settings"));

function screen(name, { showBack = true, answer = false } = {}) {
  current?.destroy?.();
  current = null;
  closeNumpad();
  main.innerHTML = "";
  main.classList.toggle("no-answer", !answer);
  if (!answer) hideAnswerBar();
  title.textContent = name;
  document.title = name === "Chipload" ? "Chipload" : `${name} · Chipload`;
  backBtn.hidden = !showBack;
  window.scrollTo(0, 0);
}

onRoute(({ segments, params }) => {
  const [head, id] = segments;
  if (!head) { screen("Chipload", { showBack: false }); renderHome(main); return; }
  if (head === "cat") { screen(CATEGORIES.find((c) => c.id === id)?.name || "Category"); renderCategory(main, id); return; }
  if (head === "calc") {
    const def = getCalc(id);
    if (!def) { screen("Not found"); main.innerHTML = `<div class="empty">That tool doesn't exist. <a href="#/">Go home</a>.</div>`; return; }
    if (def.view === "chart") { screen(def.title); current = mountChart(def, main, { params }); return; }
    screen(def.title, { answer: true });
    current = mountCalculator(def, main, { params });
    return;
  }
  if (head === "shop") { screen("Shop"); renderShop(main, id || "machines"); return; }
  if (head === "settings") { screen("Settings"); renderSettings(main); return; }
  if (head === "pro") { screen("Chipload Pro"); renderPro(main); return; }
  if (head === "privacy" || head === "licenses") { screen(""); title.textContent = renderStatic(main, head); return; }
  navigate("/");
});

startRouter();
initNative();
initBilling();

// Web version only: cache the shell so it works offline as a PWA. The Android app ships its files.
if (!isNative() && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
