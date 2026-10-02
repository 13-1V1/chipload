// Created by: Brennan Meyer with use of Claude Code 10/01/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Who gets the "Pro for testing" switch. Getting this wrong gives Pro away to every customer.

import test from "node:test";
import assert from "node:assert/strict";
import { testBuildFor } from "../../src/app/build.js";

test("inside the Android app, only Android's own debuggable flag counts", () => {
  assert.equal(testBuildFor({ native: true, debuggable: true, host: "localhost" }), true, "sideloaded test build");
  // the Play Store build runs at https://localhost too — the address must not unlock anything
  assert.equal(testBuildFor({ native: true, debuggable: false, host: "localhost" }), false, "Play Store build");
  assert.equal(testBuildFor({ native: true, debuggable: undefined, host: "localhost" }), false, "no answer from Android");
  assert.equal(testBuildFor({ native: true, debuggable: "true", host: "localhost" }), false, "only a real true");
});

test("in a browser, only a local dev server counts", () => {
  assert.equal(testBuildFor({ native: false, host: "13-1v1.github.io" }), false, "public web copy");
  for (const host of ["localhost", "127.0.0.1", "[::1]", "chipload.localhost"]) assert.equal(testBuildFor({ native: false, host }), true, host);
  for (const host of ["evil-localhost.com", "localhost.example.com", ""]) assert.equal(testBuildFor({ native: false, host }), false, host);
});
