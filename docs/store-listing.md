# Chipload — Google Play listing

## App details
- **Title (30):** `Chipload: Machinist Calculator` (29)
- **Short description (80):** `Speeds & feeds, tap drills, threads, bolt circles. No subscription. Offline.` (78)
- **Category:** Tools · **Content rating:** Everyone · **Price:** Free, one in-app product `pro_unlock` ($9.99, non-consumable)
- **Package:** `com.brennanmeyer.chipload` · **Privacy policy:** https://13-1v1.github.io/chipload/docs/privacy.html
- **Data safety:** No data collected, no data shared. (Only Google Play Billing, which Google handles.)

## Full description (4000 max)

**Every machinist calculator in one app — fast enough to use with gloves on.**

Chipload is built for the shop floor, not the office. Big buttons, a custom number pad with fraction keys (type 1 1/4 or 3/8 directly), a glove mode, and an answer bar you can read from across the shop. Imperial by default; metric is one tap away.

**New to machining?** Start with Common jobs — "What drill for a tap?", "Band saw blade and speed", "Clearance hole for a bolt" — written in plain English, with a short what-this-does card on every tool and a shop-terms glossary. Advanced settings stay folded away until you want them.

**Search first.** Type "tap", "1/4-20", "how fast band saw" or "0.201" on the home screen and land in the right tool with the value already filled in.

**Job sheet.** Plug in what you know — tool, material, machine, the cut — and Chipload figures everything it can, then tells you which one more number unlocks cut time, job time, or price.

**Show the math.** Every result has a "How was this figured?" drawer: the formula, your numbers plugged in, and the standard it comes from (Machinery's Handbook, ASME B1.1, ISO 286, ASTM E140…). Great for apprentices and students.

**Respect the machine.** Save your mill or lathe once. If the math asks for more RPM than your spindle has, Chipload shows both numbers and figures the feed at the RPM you actually have.

**FREE**
• Job sheet: speed, feed, removal rate, cut time and job time from whatever you know
• Speeds & feeds for end mills and drills (SFM → RPM, chip load → IPM)
• Band saw blade speed and teeth per inch
• Clearance hole and counterbore chart
• Tap drill by % thread — cutting and roll-form taps
• Thread data: UN coarse/fine and metric
• Right triangle solver
• Bolt circle coordinates
• Decimal ⇄ fraction ⇄ nearest drill
• Unit converter (length, SFM/m/min, feed, °F/°C, torque, pressure, weight)
• Drill chart, tap drill chart, thread chart, G-code & M-code reference, shop-terms glossary
• History on every tool, favorites, works 100% offline

**PRO — one-time unlock, no subscription, no ads**
• Mill: chip thinning & HSM, ball nose scallop and effective diameter, cut time & MRR, circle interpolation feed, thread milling
• Lathe: speeds & feeds with G96, surface finish (Ra) from feed and nose radius, cycle time (turn, face, groove, cutoff), tool-nose-radius comp with G-code snippets, tapers
• Drill & tap: drill point and hole depth, center drills, tapping feed, countersink depth, pre-ream drill
• Threads: UN class limits (2A/2B/3A/3B), ISO metric 6g/6H limits, NPT pipe threads, ACME, STI inserts, measure over wires
• Geometry: any triangle, arc/chord/segment, fillet tangent points, circle from 3 points, bolt circles with G81/G83 programs, CSV and DXF export, partial circles
• Inspect: true position with MMC bonus, ISO 286 fits & limits, tolerance stack (worst case + RSS), thermal expansion
• Reference: 196-material machinability library, hardness conversion (HRC/HRB/HB/HV), material weight & cost, GD&T symbol guide
• Shop: machine profiles, tool library, saved jobs, quote helper, share a setup as a link, print/PDF

Chipload keeps everything on your phone. No account, no server, no analytics. Results are starting points — verify with your tooling maker and dry run.

Built on the MIT-licensed Marcos's Calculator. Chipload is not affiliated with any tooling maker or standards body.

## Keywords worked into the copy
machinist calculator, speeds and feeds, tap drill chart, bolt circle, thread calculator, CNC, lathe, G-code, chip load, SFM, RPM, GD&T, fits and limits

## Screenshots (assets/brand/screenshots, 1080×2340)
1. Home — "Ask in plain English. Or just type the number."
2. Speeds & feeds with machine clamp — "Speeds & feeds that respect your machine."
3. Tap drill 3/8-16 — "Type a thread. Get the drill."
4. Number pad + glove mode — "Fraction keys. Glove mode. No phone keyboard."
5. Explain drawer — "Every answer shows its math and its source."
6. Bolt circle G-code — "Bolt circles with G81/G83, CSV and DXF."
7. Metric limits — "UN, metric, NPT, ACME — with class limits."
8. Job sheet — "Plug in what you know. It figures the rest."

Feature graphic 1024×500: `assets/brand/feature-graphic.png` (icon + "Every machinist calc. No subscription.").

## Closed testing plan (personal developer account rule)
- 12+ testers opted in for 14 consecutive days before production access can be requested. Recruit ~15: classmates, shop contacts, r/Machinists volunteers.
- Create the closed test track, add the tester email list (or a Google Group), share the opt-in link, and remind testers on day 1, 7, and 13.
- License testers (Play Console → Setup → License testing) get the `pro_unlock` purchase free for testing Billing.
