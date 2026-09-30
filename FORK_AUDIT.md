# FORK_AUDIT — Phase 0

Audited 09/30/2026. Fork: `github.com/13-1V1/chipload` (from `ianarsenault-tn/Machinist_calc`, "Marcos's Calculator" v3.3.0, 28 commits).

## 1. Status

- **Tests:** `npm test` → 27/27 pass on Node 24.18. Suites: core math, setup-context, GitHub Pages paths, service worker. A separate Playwright browser suite (`browser.test.mjs`) exists but was not run (needs `npx playwright install`).
- **License:** README §License says MIT, but the repo has **no LICENSE file** and GitHub detects no license. Added `LICENSE` (MIT) crediting the original author; the original author's own MIT grant is the README statement. Fonts: IBM Plex Sans (OFL) and Roboto Slab (OFL) already ship with license texts in `assets/fonts/`.
- **Stack:** vanilla JS, no build step, PWA with service worker + precache manifest. Matches the brief's §3 plan.

## 2. Code shape (what the restructure in Phase 1 has to deal with)

| File | Lines | Role |
|---|---|---|
| `app.js` | 3481 | Everything: DOM wiring, **all data tables**, G-code/CSV/DXF builders, history, favorites, share links, persistence, locale unit seeding |
| `index.html` | 1070 | One page, 8 tool cards + workspace tabs (machines / tools / materials / job / status) |
| `app.css` | 1506 | Single stylesheet, light theme with dark via `prefers-color-scheme` |
| `calc-core.js` | 295 | Pure math (24 exported functions), `CALCULATION_SOURCES` provenance block |
| `units.js`, `ui-state.js`, `persistence.js`, `mobile-ui.js`, `setup-context.js`, `pwa.js`, `sw.js` | 38–176 each | Already small and single-purpose |

**Key problem:** `calc-core.js` is clean, but the reference data the brief wants as data files lives inside `app.js`:
- `UN_THREAD_TABLE` (line 777), `METRIC_THREAD_TABLE` (797)
- `TAP_DRILL_UN_TABLE` (819), `TAP_DRILL_METRIC_TABLE` (872) — decimal, drill name, % thread
- `THREAD_REFERENCE` (1289), `SF_DEFAULTS` + `MATERIAL_LABELS` (2362) — only 9 materials
- G81/G83 builder (1986), CSV (2007), DXF (2016)

These move to `data/*.js` with source notes (brief §7).

**Locale unit seeding** — `app.js:2991–3010` (`detectDefaultUnit`) sniffs `navigator.language` and defaults non-US to mm. **Remove** and hard-default to inches per brief §11.

## 3. What the fork already has, mapped to the brief

### Free tier (§4a)

| Brief item | Fork status |
|---|---|
| Speeds & feeds mill/drill | ✅ `calculateSpeedsFeeds` — SFM→RPM, chip load→IPM, radial chip thinning, machine RPM/IPM clamp |
| Tap drill lookup | ✅ table lookup (UN + metric) and by-% formula |
| Drill chart (fraction/number/letter/decimal) | ❌ missing — no standalone chart; tap drill table has names but no full drill-size list |
| Thread data lookup (UN coarse/fine) | ✅ `parseThreadSpec` + tables. Also estimates class limits (flagged "estimate" in sources) |
| Right triangle | ✅ `solveRightTriangle` |
| Bolt circle coords | ✅ `boltCircleCoordinates` with offset + direction |
| Decimal ⇄ fraction ⇄ nearest drill | ⚠️ `parseFraction` input exists; no converter tool |
| Unit converter | ❌ missing (`units.js` only does in/mm) |
| G/M-code reference | ❌ missing |
| History (last 20 per tool) | ✅ per-tool history with timers; entry cap needs checking |

### Already built and moving behind Pro (§4b)

- Chip thinning (radial only), ball-nose scallop/stepover
- Thread milling feed comp, tapping feed
- Bolt circle G81/G83 output + CSV/DXF export
- 3-point circle, chamfer depth, sine bar (height & angle), taper geometry
- Tolerance stack (worst case + RSS)
- Measurement over wires (external + internal)
- Machine profiles, tool library, material overrides, saved job snapshot (workspace tabs)
- Favorites, share-as-link

### Missing entirely (Pro)

**Mill:** axial chip thinning, HSM mode, ball-nose effective dia, MRR, cut time, circle interpolation comp, face mill / high-feed.
**Lathe:** all of it (SFM/RPM/IPR/IPM lathe form, surface finish Ra/RMS, cycle time, TNR comp, G-code out).
**Drill & Tap:** drill point length, countersink depth, center drill dims, roll-form tap drill, pre-ream sizing beyond the simple allowance.
**Threads:** UNJ, ACME, NPT, STI; real class-of-fit limits (fork only estimates); best-wire / min-max over wires.
**Geometry:** oblique triangle, arc/chord/segment, fillet tangents, partial bolt circle.
**Inspect:** true position, fits & limits (ISO 286), thermal expansion.
**Reference:** GD&T guide, hardness conversion, material weight, 150+ material library (fork has 9), SHCS counterbore chart.
**Shop:** quote helper, print/PDF.

## 4. What the UI rework (Phase 2–3) touches

Everything user-facing is replaced; only `calc-core.js` and the extracted data survive as-is.

- `index.html` — single long page with all cards open. Brief wants **one calculator per screen** with search-first home. Full rewrite.
- `app.css` — light-first with dark fallback. Brief wants DYKEM dark default, IBM Plex **Mono** for numbers (not shipped yet; Roboto Slab gets dropped). Full rewrite.
- `app.js` — DOM wiring is per-card by hardcoded element IDs (`results` map, line 74). Not reusable per-module. Rewrite as a small renderer that mounts one calculator module.
- `mobile-ui.js` — already has a bottom "dock" with answer text + Calculate button. Closest thing to the brief's answer bar; concept carries over, code doesn't (brief wants live calc, no Calculate button).
- `ui-state.js` / `persistence.js` — form-state persistence keyed by form ID. Reusable idea; needs per-module keys.
- `sw.js` + `pages.test.mjs` — precache list and GitHub Pages path tests are tied to `/Machinist_calc/`. Rewrite for Capacitor (served from local assets, no Pages base path).
- Custom number pad, glove mode, "How was this figured?" drawer, machine-limit display, Settings screen — all new. `CALCULATION_SOURCES` is a good seed for the drawer's "standard it comes from" line.

## 5. Recommended Phase 1 cut

1. `core/` — split `calc-core.js` per calculator (thread, tapdrill, mow, bolt, triangle, feeds, chamfer, circle3, tapping, threadmill, ream, sinebar, taper, ballnose, tolstack), one file + one test each. Existing 27 tests keep passing.
2. `data/` — thread tables, tap drill tables, materials, G-code templates, each with a source header.
3. `tests/` — move `*.test.mjs` here plus one sandbox HTML per calculator; exclude from the shipped bundle.
4. Delete locale unit sniff; `units.js` becomes the single imperial-default unit setting.
5. Keep `README.md` original-author history section; add ours on top.
