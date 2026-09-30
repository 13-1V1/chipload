<!--
Created by: Brennan Meyer with use of Claude Code 09/30/2026 Santa Clarita, CA
brennanmmeyer@gmail.com
-->

# CHIPLOAD — Build Brief

**Working name:** CHIPLOAD (swap-able; see §9)
**One line:** The machinist calculator that's fast with gloves on. Every tool the big apps have, but you find it in one tap and read the answer across the shop.
**Platform:** Android phone first, published on Google Play. Tablet layout is a bonus, not a requirement.
**Units:** Imperial by default everywhere (inches, SFM, IPM, IPR, °F, lb). Metric is a toggle, never the default.

---

## 1. Why this app, why now

Research done 09/30/2026. The market is real but stale:

| App | Price model | Strength | Weakness we exploit |
|---|---|---|---|
| CNC Machinist Calculator Pro (Machinist Apps) | Paid, 10K+ installs, 4.7★ | ~35 tools, huge feature list | Dated UI; users complain there's no calculation history; newer "Ultra" version is a subscription and reviewers hate that |
| FSWizard (Zero_Divide) | Free lite + $18.99 Pro | Best-in-class speeds & feeds, chip thinning, HSM | Deep menus, feeds-focused; reference tools secondary |
| Machinist Calc Pro 2 (Calculated Industries) | ~$25 | Mimics their handheld calculator | Calculator-keypad UI; tiny download numbers on Android |

**The gap:** nobody combines the full feature list with a modern, fast, glove-friendly UI and a fair one-time price.

**Our pitch in the store:** "Every machinist calc in one app. No subscription. No ads. Works offline."

---

## 2. Fork, don't build from scratch

**Base:** Marcos's Calculator — `github.com/ianarsenault-tn/Machinist_calc` — **MIT license**.
- Offline PWA, vanilla JS, no build step.
- Pure math already isolated in `calc-core.js` with a Node test suite.
- Already has: thread parse + tap drill (ANSI B94.11M / ISO 2306 tables), measurement over wires, bolt circle with G81/G83 G-code output + CSV/DXF export, right triangle, speeds & feeds with radial chip thinning and machine RPM limits, chamfer depth, 3-point circle, tapping feed, thread-mill comp, ream allowance, sine bar, taper, ball-nose scallop, tolerance stacks, machine/tool/material profiles, history, favorites, shareable links, fraction input.
- **Keep the MIT license file and credit the original author** in the About screen. Also ship the license text for any font (IBM Plex is OFL) or dataset pulled in.

**Reference only, do not copy code:** `github.com/i-machine-things/machinist-calc` — no license file = all rights reserved. Fine to read its list of cited standards (ASME B1.1, B1.2, B1.5, Y14.5, ISO 286-1) to know what to verify against.

**First task for Claude Code:** fork the repo, clone the fork, run its tests, and write a short `FORK_AUDIT.md`: what works, what's missing vs §4, which existing features move behind Pro (several of the fork's tools land in §4b), and what the UI rework will touch. Note: the fork seeds units by locale (en-US → inches, elsewhere → mm); remove that and hard-default to imperial per §11.

---

## 3. Tech stack

- **App code:** the forked vanilla-JS PWA. Keep it framework-free. Split into small modules: each calculator = one module file + one Node test file + one `tests/` sandbox page.
- **Android wrapper:** Capacitor. Produces a real Android App Bundle (.aab) for Play.
- **Payments:** Google Play Billing through a plain Capacitor/Cordova purchase plugin (e.g. `cordova-plugin-purchase`). No RevenueCat or other hosted billing service — that would add a server and break the "no data collected" claim below. A one-time "Pro" non-consumable purchase. The unlock is cached on-device and works offline; the first launch after a reinstall needs to be online once to restore it from Play.
- **Storage:** on-device only. No accounts, no server, no analytics SDKs. This keeps the Play "Data safety" form to "no data collected."
- **Tests:** `tests/` folder, excluded from the shipped bundle. Math tests run with Node. The sandbox page loads one calculator alone so a single tool can be worked on without loading the whole app.

---

## 4. Features

### 4a. Free tier (enough to get 5-star reviews)
- Speeds & feeds: mill, drill (SFM → RPM, chip load → IPM)
- Tap drill lookup + drill chart (fraction / number / letter / decimal)
- Thread data lookup (UN coarse/fine: TPI, major / pitch / minor diameter, tap drill — no class-of-fit limits; those are Pro)
- Right triangle solver
- Bolt circle (coordinates only)
- Decimal ⇄ fraction ⇄ nearest drill converter
- Unit converter
- G-code / M-code reference
- History (last 20 per tool) — reviewers of the top competitor specifically complain it has none

### 4b. Pro — one-time unlock
**Mill**
- Chip thinning (radial + axial), HSM mode, ball-nose effective diameter, cusp/scallop height
- Metal removal rate, cut time, circle interpolation feed comp (ID/OD)
- Thread milling feed comp
- Face mill / high-feed chip thinning

**Lathe**
- SFM ⇄ RPM by material, IPR ⇄ IPM
- Surface finish from nose radius + feed (Ra / RMS)
- Taper / included angle, cycle time (rough, groove, cutoff)
- Tool-nose radius comp; G-code output for chamfers, tapers, radii

**Drill & Tap**
- Drill point length, countersink / chamfer depth, center drill dims
- Tap drill by % thread (cut + roll form), synchronized tapping feed
- Pre-ream size

**Threads**
- Full UN/UNJ, metric, ACME, NPT, STI, each with its own fit/tolerance system (UN classes 1A–3A / 1B–3B, metric 6g/6H etc., ACME G/C classes; NPT has none)
- 3-wire measurement (best wire, min/max over wires)

**Geometry**
- Oblique triangle, 3-point circle, arc / chord / segment, fillet tangent points
- Bolt circle + partial bolt circle + G81/G83 G-code output, DXF/CSV export
- Sine bar stack

**Inspect**
- True position (with bonus tolerance)
- Tolerance stack (worst case + RSS)
- Fits & limits (ISO 286 / ANSI)
- Thermal expansion (°F)

**Reference**
- GD&T symbol guide with plain-English meanings
- Hardness conversion (Rockwell / Brinell / Vickers)
- Material weight (bar, plate, tube, hex; lb)
- Material machinability library (target 150+ materials)
- SHCS counterbore/clearance hole chart

**Shop**
- Machine profiles (max RPM, max IPM, controller type)
- Tool library (diameter, flutes, material, coating)
- Saved jobs (snapshot of every input)
- Quote helper: cycle time × shop rate = price per part
- Favorites, share a setup as a link, print/PDF a result

### 4c. Things nobody else does well (our edge)
1. **Search-first home.** Type "tap", "1/4-20", or "rpm" and jump straight to the tool with the value filled in.
2. **Answer bar.** The result sits in a big, pinned bar at the bottom, readable at arm's length.
3. **Show the math.** Every result has a "How was this figured?" drawer: the formula, the numbers plugged in, and the standard it comes from. Great for students and apprentices.
4. **Machine limits.** If the calculated RPM is over your machine's max, it shows both and clamps the feed to match.
5. **Glove mode.** Extra-large keys and buttons, one toggle.
6. **Custom number pad** with fraction keys (/, space for mixed numbers) and a ± key, so users never fight the phone keyboard.
7. **Home-screen shortcuts** (long-press icon → Speeds & Feeds, Tap Drill, Bolt Circle, Triangle).

---

## 5. UX rules (design for the machinist, not for the code)

- **Two taps to any answer** from app open: search or favorite → calculator.
- **Live calculate** as you type; no hunting for a Calculate button.
- **Touch targets ≥ 56 dp** (bigger than Android's 48 dp minimum); 72 dp in glove mode.
- **One calculator per screen.** Inputs on top, answer bar on the bottom, details collapsed.
- **Remember everything.** Last inputs, last units, last material, per calculator.
- **Never lose work.** Rotating the phone, leaving the app, or an incoming call does not clear a form.
- **Plain labels.** "Tool diameter (in)", not "D_c".
- **Every result is copyable** with one tap.
- **Offline always.** Nothing requires signal. Shops are dead zones.
- **Safety note** on speeds & feeds and G-code output: "Starting point. Verify with your tooling maker and dry run."

---

## 6. UI look — direction "DYKEM"

Named after the blue layout fluid machinists paint on parts to scribe lines. Dark theme by default.

- **Background:** graphite near-black `#121416`, cards `#1B1F23`
- **Accent:** layout blue `#2F6FEB` (buttons, active tab, links)
- **Answer highlight:** bright scribe-line cyan `#5CE1E6` on the answer bar numbers
- **Warning:** safety orange `#FF7A1A` (machine-limit hit, bad input)
- **Text:** `#E8EAED` primary, `#9AA0A6` secondary
- **Type:** IBM Plex Sans for labels (already in the fork), **IBM Plex Mono** for every number so digits line up in tables
- **Detail touches:** thin 1 px "scribed" divider lines; a subtle ruler tick pattern along the top of the answer bar; category icons drawn as simple line tools (end mill, drill, tap, caliper, triangle, book)
- **Light theme:** available for bright shops/outdoors; same blue accent on off-white `#F4F5F7`

**Screens**
1. **Home:** search bar at top → Favorites row → category grid (Mill, Lathe, Drill & Tap, Threads, Geometry, Inspect, Reference, Shop)
2. **Calculator:** title + "?" → inputs → pinned answer bar (big number, unit, copy, favorite)
3. **Charts:** scrollable tables with sticky headers and search-as-you-type (drill chart, tap drill chart, thread tables)
4. **Shop:** machines, tools, saved jobs
5. **Settings:** units, glove mode, theme, restore purchase, about/licenses

Store icon: a stylized end mill tip on layout blue.

---

## 7. Accuracy (the thing that makes or breaks reviews)

- Every formula lives in pure functions with a JSDoc comment citing its source (Machinery's Handbook section, ASME/ANSI/ISO standard).
- Every calculator gets unit tests against **known published values** (e.g., tap drill for 1/4-20 at 75% = #7 / .201").
- Charts (drill sizes, thread data) are data files, not hard-coded, each with a source note.
- Speeds & feeds defaults are labeled as conservative starting points.

---

## 8. Build plan (check each phase before the next)

| Phase | Work | Done when |
|---|---|---|
| 0 | Clone fork, run tests, write `FORK_AUDIT.md` | Tests pass; gap list vs §4 exists |
| 1 | Restructure into one module per calculator + `tests/` sandbox pages | All original tests still pass |
| 2 | New UI shell: DYKEM dark + light theme, home/search, answer bar, custom number pad, glove mode, Settings screen | Works on a phone-size viewport with one calculator |
| 3 | Port existing calculators into the new shell; add "How was this figured?" drawer and machine-limit clamping to each | Every original calculator works + tests pass |
| 4 | Add missing free-tier features | Free tier matches §4a |
| 5 | Add Pro features in batches (Mill → Lathe → Drill & Tap → Threads → Geometry → Inspect → Reference → Shop) | Each batch has tests with published reference values |
| 6 | Capacitor Android wrapper, back button, rotation, shortcuts | Installs and runs on a real Android phone offline |
| 7 | Play Billing: Pro unlock + restore | Test purchase unlocks; survives reinstall and airplane mode |
| 8 | Accuracy pass + critical UX review | No failing tests; review notes fixed |
| 9 | Play Store prep (§10) | Closed test live |

Run `/init` after phases 0, 3, 6, and 9 to keep CLAUDE.md current.

---

## 9. Name

Working name **CHIPLOAD**: a word every machinist knows, says what the app is about, and no Play app currently uses it as its name (quick search 09/30/2026 — confirm in Play Console before committing).

Backups: **SWARF** (metal chips), **DATUM**, **HALF-THOU**, **TOOLPOST**. Avoid **TENTHS** — already two Play apps with that name.

Store title (30 characters max): `Chipload: Machinist Calculator`

---

## 10. Google Play launch checklist

- [ ] Google Play developer account (one-time registration fee)
- [ ] **Closed test: at least 12 testers opted in for 14 days in a row.** Required for personal accounts made after 11/13/2023. Recruit ~15 (classmates, shop contacts) so one dropout doesn't reset the clock. Internal testing does not count.
- [ ] Apply for production access after the 14 days
- [ ] Privacy policy page (simple: "no data collected, everything stays on your device")
- [ ] Data safety form: no data collected / shared
- [ ] Target the Android API level Play currently requires
- [ ] Store listing: icon 512 × 512, feature graphic 1024 × 500, 6–8 phone screenshots with captions, short description (80 char), full description with keywords (machinist calculator, speeds and feeds, tap drill chart, bolt circle, thread calculator, CNC)
- [ ] Content rating questionnaire
- [ ] In-app product "pro_unlock" set up in Play Console

**Price to test:** Free + $9.99 Pro one-time. Undercuts FSWizard Pro ($18.99) while still feeling like a real tool. Can raise later.

---

## 11. Standing rules for Claude Code

- Every source file starts with the two-line header in that file's comment syntax, with the real date:
  `Created by: Brennan Meyer with use of Claude Code MM/DD/YYYY Santa Clarita, CA`
  `brennanmmeyer@gmail.com`
- Small modules, one job each.
- Imperial by default in all UI text, charts, G-code output (G20).
- Work on one calculator in its `tests/` sandbox page; integrate and check in the full app once.
- Search for an existing free, licensed source before building any chart or dataset from scratch.
- Dark theme by default.
