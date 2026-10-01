# Chipload — Machinist Calculator

Every machinist calc in one app. No subscription. No ads. Works offline.

Android app (Google Play) plus a web copy at <https://13-1v1.github.io/chipload/>. Imperial by default, metric a tap away. Built for the shop floor: big targets, a glove mode, a custom number pad with fraction keys, and an answer bar you can read from across the room.

## What's in it

**Free:** speeds & feeds (mill, drill), tap drill (cutting and roll-form), thread data, right triangle, bolt circle coordinates, decimal ⇄ fraction ⇄ drill, unit converter, drill / tap-drill / thread charts, G- and M-code reference, history on every tool.

**Pro (one-time unlock):** chip thinning & HSM, ball nose, cut time & MRR, circle interpolation; lathe feeds, surface finish, cycle time, nose-radius comp with G-code; drill point, center drills, tapping feed, countersink depth, pre-ream; UN class limits, ISO metric limits, NPT, ACME, STI inserts, measure over wires; any triangle, arc/chord, fillets, 3-point circle, bolt-circle G81/G83 + CSV/DXF; true position, ISO 286 fits, tolerance stacks, thermal expansion; 196-material library, hardness conversion, material weight, GD&T guide, counterbore chart; machine profiles that clamp every feed, tool library, saved jobs, quote helper, share and print.

Every result has a **"How was this figured?"** drawer with the formula, the plugged-in numbers, and the standard it comes from.

## Layout

```
index.html          app shell (import map → vendor/)
src/core/           pure math, one module per family, JSDoc cites the source
src/data/           tables with source notes (threads, drills, materials, NPT, GD&T…)
src/calcs/          one declarative definition per calculator
src/app/            router, renderer, number pad, settings, store, shop, billing, native bridge
src/styles/app.css  DYKEM theme (dark default, light option, glove mode)
tests/core|calcs    Node tests against published values; tests/e2e Playwright at phone size
tests/sandbox/      load one calculator alone: calc.html?id=tap-drill
scripts/            vendor.mjs (Capacitor ESM → vendor/), build-www.mjs, icons.mjs
android/            Capacitor project
legacy/             the original fork, kept for reference
```

## Develop

```bash
npm install
npm run vendor      # copy Capacitor modules into vendor/ (once)
npm run serve       # http://127.0.0.1:4173
npm test            # math + calculator smoke tests
npm run test:e2e    # Playwright (npx playwright install chromium first)
```

Android: `npm run apk` builds `android/app/build/outputs/apk/debug/app-debug.apk` (needs JDK 17 and the Android SDK; set `android/local.properties`).

## Accuracy

Formulas live in `src/core` as pure functions with a comment naming the source (Machinery's Handbook section, ASME/ISO standard). Tests check published values — 1/4-20 at 75% is a #7 drill, M10 6g pitch diameter is 8.862–8.994, 25 mm H7/g6 is a 7–41 µm clearance fit. Speeds and feeds are conservative starting points and say so.

## License

MIT. Started as a fork of [Marcos's Calculator](https://github.com/ianarsenault-tn/Machinist_calc) (MIT). Fonts: IBM Plex Sans and Mono under the SIL Open Font License.
