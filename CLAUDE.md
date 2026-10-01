# Chipload — project notes for Claude Code

Android machinist calculator (Capacitor + vanilla JS, no bundler). Brief: `CHIPLOAD_BUILD_BRIEF.md`. Status and next steps live in Claude's memory (`chipload-progress`).

## Commands
- `npm test` — Node tests (core math vs published values, every calculator in inch + mm)
- `npm run test:e2e` — Playwright Chromium at phone size (`npx playwright install chromium` once)
- `npm run serve` — static server on 4173 (also `.claude/launch.json` → `chipload-dev`)
- `npm run vendor` — copy Capacitor ESM into `vendor/` (import map in `index.html`)
- `npm run build` — assemble `www/` · `npm run android` — build + `cap sync`
- APK/AAB: run Gradle from **Git Bash**, not the PowerShell tool (it can't see `AppData\Local\Android`):
  `cd android && JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot" ANDROID_HOME="C:/Users/brenn/AppData/Local/Android/Sdk" ./gradlew.bat assembleDebug bundleRelease`
  Gradle provisions JDK 21 itself (foojay resolver in `android/settings.gradle`).

## Layout
`src/core` pure math (JSDoc cites the standard) · `src/data` tables with source notes · `src/calcs` one declarative definition per tool (`register({...})`, order in `src/calcs/index.js` = order in the category) · `src/app` shell (router, render, numpad, settings, store, shop, billing, native) · `tests/sandbox/calc.html?id=<calc>` loads one tool alone · `legacy/` = original fork, reference only.

## Rules that matter here
- Imperial by default everywhere; metric is the toggle. Dark theme default.
- Every source file starts with the two-line header (see global CLAUDE.md). Date = the day the file is written.
- Add a calculator: new file in `src/calcs`, register it, import in `src/calcs/index.js`; the smoke test picks it up automatically. Put any new formula in `src/core` with a test against a published value.
- Pro gating: `pro: true` on a definition, or `pro: true` on a table/code/download item inside a free tool. Pro flag lives in settings (`chipload.settings.v1`); Play Billing sets it (`src/app/billing.js`, product `pro_unlock`).
- Secrets never committed: `android/keystore.properties`, `android/keystore/upload.jks` (back these up — losing them means a new app listing).
- Web copy deploys from `main` via `.github/workflows/pages.yml` to https://13-1v1.github.io/chipload/ (shared links and the privacy policy point there).
