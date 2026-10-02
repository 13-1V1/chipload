# Chipload — project notes for Claude Code

Android machinist calculator (Capacitor + vanilla JS, no bundler). Brief: `CHIPLOAD_BUILD_BRIEF.md`. Status and next steps live in Claude's memory (`chipload-progress`).

## Commands
- `npm test` — Node tests: core math vs published values, every calculator in inch + mm, plus the two critic gates (input fuzzer, machinist checklist)
- `npm run test:e2e` — Playwright Chromium at phone size (`npx playwright install chromium` once)
- `npm run test:walk` — uses every calculator like a person, tap by tap: Next through every mode, pad typing, every button, dropdown and chip, help, Reset, history, Enter; then scrolls every screen (all 65) to the bottom on four phone setups (gesture bar, glove, sideways, pad open) and fails if a last line can't clear the answer bar (~15 min). Part of `npm run test:all`; run it before every build you hand over
- `node tests/critic/ui-stress.mjs` — browser stress report (overflow, unit switch, corrupt storage, XSS, touch targets, contrast, leaks); JSON on stdout, exit 0 only if every verdict passes. Takes about 6 minutes
- `npm run serve` — static server on 4173 (also `.claude/launch.json` → `chipload-dev`)
- `npm run vendor` — copy Capacitor ESM into `vendor/` (import map in `index.html`)
- `npm run build` — assemble `www/` · `npm run android` — build + `cap sync`
- APK/AAB: run Gradle from **Git Bash**, not the PowerShell tool (it can't see `AppData\Local\Android`):
  `cd android && JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot" ANDROID_HOME="C:/Users/brenn/AppData/Local/Android/Sdk" ./gradlew.bat assembleDebug bundleRelease`
  Gradle provisions JDK 21 itself (foojay resolver in `android/settings.gradle`).

## Layout
`src/core` pure math (JSDoc cites the standard) · `src/data` tables with source notes · `src/calcs` one declarative definition per tool (`register({...})`, order in `src/calcs/index.js` = order in the category) · `src/app` shell (router, render, values, numpad, settings, store, shop, billing, native) · `tests/sandbox/calc.html?id=<calc>` loads one tool alone · `tests/critic/` stress harnesses · `legacy/` = original fork, reference only.

## Calculator inputs (`src/app/values.js` is the contract)
- `default` is always written in **inches / °F / SFM**. In mm a field starts on `defaultMm` if it has one (a round metric size), otherwise the default converted.
- Switching units converts every typed number so it stays the same cut (length, feed, feed/rev ×25.4; SFM ⇄ m/min; °F ⇄ °C). A field that needs its own rule gives `convert(text, from, to)` (tolerance stack lines, $/lb ⇄ $/kg).
- A field whose meaning follows a mode (a side or an angle) gives `label(raw)` and `as(raw)`; `as` returns the measure ("length", "angle") that drives the unit label, parsing, and conversion.
- `buildValues` puts every unusable field in `invalid`; `invalidReason` writes the sentence the answer bar shows. Name the field — it may be folded under "More options".

## Rules that matter here
- Imperial by default everywhere; metric is the toggle. Dark theme default.
- Every source file starts with the two-line header (see global CLAUDE.md). Date = the day the file is written.
- Add a calculator: new file in `src/calcs`, register it, import in `src/calcs/index.js`; the smoke test picks it up automatically. Put any new formula in `src/core` with a test against a published value.
- Published tables beat formulas: ISO 286 fits are table lookups (`src/data/iso286.js`); UN class limits use the ASME B1.1 formulas with the tables' rounding. Tests hold both to the published numbers.
- G-code is Fanuc-style only (Fanuc, Haas, Mazak EIA, LinuxCNC). Order is the safety: safety line → tool call → work offset + XY → spindle → `G43 H Z<safe>` → cycle. A machine set to Siemens, Heidenhain or Okuma gets bare X Y positions. Every coordinate word carries a decimal point (`gcodeNumber`).
- Pro gating: `pro: true` on a definition, or `pro: true` on a table/code/download item inside a free tool. Pro flag lives in settings (`chipload.settings.v1`); Play Billing sets it (`src/app/billing.js`, product `pro_unlock`). With no receipt server, `store.owned()` is the only truth — never read `receipt.collection`. The stored flag is ignored on the public web copy (honored inside the app and on localhost). Test builds get a "Pro for testing" switch (Settings → Test build); `src/app/build.js` decides who is a test build — inside the app only Android's debuggable flag (`BuildInfoPlugin.java`) counts, never the address, which is always https://localhost there.
- Saved jobs and share links carry every field, blank ones too — a blank means "use the table value" and must not pick up leftovers.
- Number pad: a bottom sheet upright; on a phone turned sideways (`(orientation: landscape) and (max-height: 500px)`, the same query as `SIDE_PAD` in `numpad.js`) it's a full-height column on the right and `html.pad-open` moves the page left of it. Stacked under the answer bar it left 3–77 px for the field on real phones.
- Bottom of the page: never reserve a fixed guess for the answer bar. `render.js` measures the real bar (border-box: Android's gesture bar is padding) into `--answer-space`; `--inset-bottom` (= env(safe-area-inset-bottom)) is the one place the gesture bar enters the CSS, so tests can stand in for it. A fixed 88 px left the last line of every tool under the bar on Brennan's phone.
- Tables: `.table-wrap` must stay `overflow: clip`, never `hidden` — hidden turns the box into its own scroller and the pinned header row drops 57 px over row 1. A table too wide for the screen stacks into cards (`src/app/tables.js`); mark sentence columns `long: true` so they wrap under their label.
- Android-only code lives in `android/app/src/main/java/com/brennanmeyer/chipload/`: `PrintPlugin` (system print dialog; a WebView has no `window.print`) is registered in `MainActivity`.
- Web copy deploys from `main` via `.github/workflows/pages.yml` to https://13-1v1.github.io/chipload/ (shared links and the privacy policy point there). `sw.js` caches the whole app on the first visit; anything loaded late (fonts) goes in its `SHELL` list.
- `scripts/build-www.mjs` ships only `src`, `vendor`, `assets/fonts`, `assets/icons` — store artwork in `assets/brand` stays out of the APK.
- Secrets never committed: `android/keystore.properties`, `android/keystore/upload.jks` (back these up — losing them means a new app listing).

## Tooling gotchas
- Long Bash heredocs fail on this machine, and `\\` collapses to `\` inside them. For a patch of any size, write the script to the scratchpad with the Write tool and run the file.
- Never edit `src/` while `ui-stress.mjs` or the e2e suite is running — they serve the files live.
