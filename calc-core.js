// Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
// brennanmmeyer@gmail.com

// Compatibility shim for the legacy app shell. New code imports from src/core/index.js.
export * from "./src/core/index.js";
// Legacy shell pins its cache to this version; the new core reports its own.
export const CORE_VERSION = "3.3.0";
