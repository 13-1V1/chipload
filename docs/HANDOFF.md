# Chipload — hand-off checklist

Everything below is a step only you can do (your phone, your Google account, your money). The code is done and tested.

## 0. Back up two files right now
- `android/keystore/upload.jks` and `android/keystore.properties` (password inside). They are git-ignored on purpose.
- Put copies in a password manager or an encrypted drive. If they're lost after the first upload, Play Console can reset the upload key, but it's a support ticket and days of waiting. Don't lose them.

## 1. Try it on your phone (10 minutes)
- `dist/chipload-1.0.0-debug.apk` → copy to the phone (USB, Drive, email to yourself) → open it → allow "install unknown apps" for that source.
- Things to check with gloves on: search → tap drill, type 1/4-20; number pad and the ± / fraction keys; long-press the app icon (four shortcuts); rotate the phone mid-calculation with the number pad open; airplane mode (everything should still work); Settings → Glove mode and Light theme.
- Checked on Brennan's phone (10/01/2026): install, tap drill, number pad, Print and Save as PDF, home-screen shortcut from cold, sideways pad.
- Still to check on the phone: **Save CSV / DXF / G-code**. Turn on Pro for testing (below), open Bolt circle, tap **Save CSV**; the share sheet should offer to save or send the file. Since 10/02/2026 the app hands Android the file's real type (ShareFilePlugin), so a G-code file should now offer text editors and G-code viewers, not just "Files".
- Pro can't be bought in this build (purchases only work in the Play Store version). To try the Pro tools: **Settings → Test build → Pro for testing**, or tap **Turn on Pro for testing** on the Pro screen. Flip the switch off to see what a free user sees. Only test builds have this switch: the Play Store build and the public web copy don't, because the app asks Android itself whether it's a test build.
- Anything broken: tell me the tool name and what you typed. `adb logcat | grep -i chipload` catches crashes if the phone is plugged in with USB debugging.

## 2. Google Play developer account ($25 one time)
- <https://play.google.com/console> → create a personal developer account. Expect identity verification (ID + a few days).
- Personal accounts made after Nov 2023 must run a **closed test with 12+ testers for 14 consecutive days** before production. Start recruiting now (step 5).

## 3. Create the app and upload the bundle
- Console → Create app → name `Chipload: Machinist Calculator`, app, free, English (US).
- Set up the store listing from `docs/store-listing.md` (title, short/full description), icon `assets/brand/play-icon-512.png`, feature graphic `assets/brand/feature-graphic.png`, phone screenshots `assets/brand/screenshots/*.png`.
- Privacy policy URL: `https://13-1v1.github.io/chipload/docs/privacy.html`
- App content: Data safety → **no data collected / shared**; content rating questionnaire → utility, no user content → Everyone; ads → no; target audience → 18+ (or 13+; it's a tool).
- Release → Testing → Closed testing → create a track → upload `dist/chipload-1.0.0-release.aab`. Play App Signing: accept (Google keeps the app signing key; yours is the upload key).

## 4. The Pro product (so billing works)
- Console → Monetize → Products → In-app products → Create: product ID **`pro_unlock`** (must match exactly), name "Chipload Pro", description "Every tool, forever. No subscription.", price $9.99 (set a price template; Google converts other currencies). Activate it.
- Console → Setup → License testing → add your own Gmail and a couple of testers' → they can buy `pro_unlock` for free (test card) to check the flow. Install from the Play testing link, not the sideloaded APK, for purchases to work.
- Then in the app: Settings → Unlock → price shows → buy → "Pro unlocked" within a second or two, without restarting the app, and the screen stays responsive. (Both of those were bugs I fixed against a stand-in for the Play store — this is the first time the real one gets a say. If it hangs or stays locked, tell me.) To test Restore for real: Settings → Apps → Chipload → Storage → Clear data (Android's backup would otherwise bring the saved Pro flag back by itself and hide whether Restore works), open the app, Settings → Restore purchase → Pro comes back.

## 5. Closed testing (the 14-day clock)
- Recruit ~15 people so a dropout doesn't reset you: classmates, shop contacts, r/Machinists, a Facebook machining group. Give them the opt-in link from the closed-test track.
- Nudge them day 1, 7, and 13. Testers must stay opted in; they don't have to open the app daily.
- After 14 days: Console → Dashboard → "Apply for production access" → answer the questionnaire (what you tested, feedback).

## 6. Production
- Promote the closed-test release to production (or upload a new AAB if I shipped fixes in between). Countries: start with US + English-speaking, add the rest after a week.
- Day 1 after launch: reply to every review. The top competitor's reviews complain about no history and subscriptions — that's our pitch, say it back to them.

## Rebuilding after a code change
```bash
cd C:/Users/brenn/Chipload/chipload
npm test && npm run test:e2e
npm run build && npx cap sync android
cd android && JAVA_HOME="$(ls -d ~/.gradle/jdks/*21*/ | head -1)" ANDROID_HOME="C:/Users/brenn/AppData/Local/Android/Sdk" ./gradlew.bat assembleDebug bundleRelease
```
Bump `versionCode` (and `versionName`) in `android/app/build.gradle` before every Play upload — Play rejects a reused versionCode.

## What I'd do next, in order
1. Launch on the closed track and get the 14 days running — nothing else matters until that clock starts.
2. While waiting: ask three testers for their most-used calc and the first thing that confused them. Fix those.
3. After launch: a "Share this setup" link lands on the web copy, which has a Play badge → that's the free marketing loop. Post one short video (search → tap drill → done in 3 taps) to r/Machinists and the Haas/Tormach groups.
