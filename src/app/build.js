// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Is this a test build? Test builds get a switch that turns Pro on without a purchase, so the Pro tools
// can be tried before the app is on Google Play. The Play Store version and the public web copy never do.

import { Capacitor, registerPlugin } from "@capacitor/core";

const BuildInfo = registerPlugin("BuildInfo"); // android/.../BuildInfoPlugin.java

/**
 * Inside the Android app only Android's own answer counts: the page address there is always
 * https://localhost, so trusting the address would hand Pro to every customer.
 * In a browser, only a local dev server counts.
 */
export function testBuildFor({ native, debuggable, host }) {
  if (native) return debuggable === true;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || String(host).endsWith(".localhost");
}

let testBuild = false;
const native = Capacitor.isNativePlatform();

/** Resolves once the answer is known; screens that show the switch wait on it. */
export const buildKnown = (native ? BuildInfo.get().catch(() => ({ debuggable: false })) : Promise.resolve({}))
  .then((info) => { testBuild = testBuildFor({ native, debuggable: info?.debuggable, host: globalThis.location?.hostname ?? "" }); });

export const isTestBuild = () => testBuild;
