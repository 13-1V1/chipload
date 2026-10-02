// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Capacitor bridge: hardware back button, home-screen shortcut deep links, native share / save,
// status bar color. Does nothing in a plain browser.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Share } from "@capacitor/share";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { getSettings, onSettings } from "./settings.js";
import { closeNumpad, isNumpadOpen } from "./numpad.js";

export const isNative = () => Capacitor.isNativePlatform();

// The app's own plugin (android/.../PrintPlugin.java): hands the page to Android's print dialog,
// where "Save as PDF" lives. A WebView has no window.print of its own.
const Print = registerPlugin("Print");

// The app's own share-a-file plugin (android/.../ShareFilePlugin.java): sends the type the tool declared.
// @capacitor/share takes no type and guesses one from the extension, and Android's table files .nc as
// NetCDF science data (application/x-netcdf), so text editors and G-code viewers drop off the share sheet.
const ShareFile = registerPlugin("ShareFile");
const unimplemented = (e) => e?.code === "UNIMPLEMENTED" || /not implemented/i.test(String(e?.message ?? e));

export function initNative() {
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
  const openUrl = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol !== "chipload:") return;
      const path = (u.host + u.pathname).replace(/^\/+|\/+$/g, "");
      location.hash = `#/${path}${u.search}`;
    } catch { /* ignore junk */ }
  };
  App.addListener("appUrlOpen", ({ url }) => openUrl(url));
  // Cold start from a home-screen shortcut: the event above never fires, the URL is waiting here.
  App.getLaunchUrl().then((launch) => { if (launch?.url) openUrl(launch.url); }).catch(() => { /* no launch URL */ });

  window.chiploadNative = {
    async saveFile(name, text, mime = "text/plain") {
      const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      try { await ShareFile.share({ url: r.uri, type: mime, title: `Save ${name}` }); return; }
      catch (e) { if (!unimplemented(e)) throw e; } // ShareFilePlugin not registered in this APK: fall back to the guess
      await Share.share({ title: name, url: r.uri, dialogTitle: `Save ${name}` });
    },
    async share({ title, text, url }) {
      await Share.share({ title, text, url, dialogTitle: title });
    },
    async print(name) {
      await Print.print({ name: `Chipload - ${name}` });
    },
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
