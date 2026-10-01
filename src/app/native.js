// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Capacitor bridge: hardware back button, home-screen shortcut deep links, native share / save,
// status bar color. Does nothing in a plain browser.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { getSettings, onSettings } from "./settings.js";
import { closeNumpad, isNumpadOpen } from "./numpad.js";

export const isNative = () => Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative()) return;

  // Back: close the number pad first, then walk history, then leave the app from Home.
  App.addListener("backButton", () => {
    if (isNumpadOpen()) { closeNumpad(); return; }
    const menu = document.querySelector(".menu, .sheet");
    if (menu) { menu.remove(); return; }
    if (location.hash && location.hash !== "#/" && location.hash !== "#") history.back();
    else App.exitApp();
  });

  // chipload://calc/feeds-mill?diameter=0.5  →  #/calc/feeds-mill?diameter=0.5
  App.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url);
      const path = (u.host + u.pathname).replace(/^\/+|\/+$/g, "");
      location.hash = `#/${path}${u.search}`;
    } catch { /* ignore junk */ }
  });
  const launch = await App.getLaunchUrl().catch(() => null);
  if (launch?.url) App.addListener("appUrlOpen", () => {}); // listener above handles it on first fire

  window.chiploadNative = {
    async saveFile(name, text, mime) {
      const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, url: r.uri, dialogTitle: `Save ${name}` });
    },
    async share({ title, text, url }) {
      await Share.share({ title, text, url, dialogTitle: title });
    },
    print: null, // falls back to window.print(); Android WebView has no print — handled by share of a text report later
  };

  const applyBar = () => {
    const light = getSettings().theme === "light";
    StatusBar.setStyle({ style: light ? Style.Light : Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: light ? "#F4F5F7" : "#121416" }).catch(() => {});
  };
  applyBar();
  onSettings(applyBar);
  SplashScreen.hide().catch(() => {});
}
