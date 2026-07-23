# Camera-Interactive Effects — Tested Learnings
_Prototyping sessions, July 2026 (Cowork with Claude). Feeds the Wedding VDO Guestbook build._

## What was tested and proven working

| Demo file | Technique | Status |
|---|---|---|
| `particle-swarm-camera.html` | Motion detection via frame-diff on tiny canvas (64×48); particles flee motion | ✅ Works |
| `hand-laser-camera.html` | MediaPipe tasks-vision HandLandmarker, 21 landmarks/hand, 2 hands, laser from index fingertip (#8) | ✅ Works after bugfix |
| `face-tracking-camera.html` | MediaPipe FaceLandmarker, 478 landmarks + 52 blendshapes (jawOpen, eyeBlink L/R, smile, etc.), 2 faces, per-face emoji | ✅ Works |
| `voice-command-effects.html` | Web Speech API, EN + TH trigger words, interim/final transcript | ✅ Works (Chrome only, needs internet) |
| `beauty-filter-camera.html` | Skin smooth (masked blur, eyes/lips punched out), glow, V-shape + narrow-face (strip-squeeze warp) | ✅ Works |

## Hard-won bugs & fixes (carry into the real build)

1. **Legacy `@mediapipe/hands` is unstable — use `@mediapipe/tasks-vision`** with our own rAF loop (one new video frame in → one detect out, gated by `video.currentTime`).
2. **Negative canvas arc radius kills the whole animation loop silently.** A particle's `life` went slightly negative → `IndexSizeError` → frozen screen. Guard all sizes with `Math.max(0, …)` and check `life <= 0` AFTER decrementing. Found via browser console — always check console first when a loop "freezes".
3. **`object-fit: cover` coordinate mapping.** Landmarks are in video coords; screen crops the video. Overlays must redo the cover math (`scale = max(cw/vw, ch/vh)` + centering offsets) or they drift off the face/hand.
4. **Draw from cached results every screen frame.** Screen may be 120fps, camera 30fps — clearing every frame but drawing only on new camera frames causes flicker/vanish.
5. **GPU delegate can fail on some machines** — always wrap `createFromOptions` with GPU→CPU fallback.
6. **Mirrored selfie view gotchas:** text/emoji drawn on a CSS-mirrored canvas comes out backwards (un-mirror locally with `ctx.scale(-1,1)`); MediaPipe handedness labels ("Left"/"Right") may be swapped relative to what the user sees — verify empirically.
7. **Web Speech API:** Chrome stops after silence — restart in `onend`; use per-trigger cooldown (~2s) because trigger words appear in both interim and final text.
8. **A cross-origin image drawn on the canvas silently kills `captureStream()`.** Staff assets (frame, gesture graphics) load from Supabase storage — another origin. An `Image()` fetched without `img.crossOrigin = 'anonymous'` *taints* the canvas, and `canvas.captureStream()` then throws `SecurityError: Canvas is not origin-clean`. The image itself loads and draws fine, so the only symptom is that recording dies — and only once an asset is set, which reads like an unrelated feature bug. Set `crossOrigin` on every image that will touch a captured canvas. Bonus: if CORS fails, `onerror` fires → skip the draw → no taint, recording survives.
9. **`viewport-fit=cover` + `height: 100%` hides bottom-anchored controls on iOS Safari.** With `cover`, the initial containing block extends *behind* the browser toolbar, so `bottom: 24px` anchors underneath it and the buttons are simply gone. Desktop devtools cannot reproduce this — there, `innerHeight`, `100dvh`, and body height are all equal. Use `height: 100dvh` (tracks the visible viewport) plus `env(safe-area-inset-*)` for the notch/home indicator. Related: `window.innerHeight` drifts with the toolbar while CSS centres against the ICB — measure `documentElement.clientHeight` when JS layout math must agree with CSS.
10. **Recording setup that throws after the UI is torn down strands the user.** `captureStream()` ran before the line restoring the controls the countdown had hidden, so bug 8 left a live camera with no buttons at all. Wrap fallible start-up in try/catch and always restore a way back.

## Techniques understood (reusable recipes)

- **Gesture detection** = geometry over landmarks (distances/angles between the 21 points). E.g. "mini heart" (Korean finger heart = thumb tip #4 crossing index tip #8) is a distance check between landmarks 4 and 8 plus other fingers curled.
- **Handedness**: `result.handedness[i][0].categoryName` + score → different effect per hand.
- **Beauty pipeline**: sharp base → blurred copy → AI face-oval mask (feathered, eyes/lips holes) → composite at slider strength → brightness/saturate filter for glow.
- **Face reshape**: horizontal strip-squeeze toward face centerline; profile curve along face height decides the effect (V-shape = ramp to chin; narrow = flat with feathered ends). Curves are additive in one warp pass.
- **Everything is free**: MediaPipe is Apache-2.0, runs on-device, no API costs. Hosting static = free tier (Vercel/Netlify/GitHub Pages).

## Real-device pass (issue #10)

- **iPhone (Safari) — confirmed 2026-07-23**: full guest flow works (countdown → record → stop → preview → upload), including with a staff frame/gesture asset set. Downloaded clip measured exactly 1080×1920 (the staff preset) in Photos. FaceLandmarker + HandLandmarker + beauty compositing + MediaRecorder running together stayed smooth even after the output canvas backing store grew from screen-sized (~219k px) to the full preset (~2.07M px, ~9.5×). Device model not yet recorded — ask Bird next time.
- **Android (Chrome) — backlogged, not started.** Bird has no Android device to hand right now; resume when they do. Still needed: the real-device pass itself (watch for stutter — 720×1280 preset is the first escape hatch if so), handedness check (confirm left/right gesture graphics land on the correct hand — `HANDEDNESS_FLIPPED` in `src/main.js` exists for this), and a codec/upload check (clip plays back and lands in the Supabase `clips` bucket with the right filename — likely webm on Android vs iPhone's mp4/webm). Tracked in [issue #10](https://github.com/bird-chakraphan/mobile-wedding-vdo-guestbook/issues/10).
- **Handedness on iPhone** — not explicitly re-confirmed yet either (yesterday's test covered size + smoothness, not left/right correctness). Worth a quick check whenever convenient, doesn't need to wait for Android.

## Not yet tested (risks for the MVP)

- **File saving/upload** — requirement says "file to be saved": download-to-device is trivial; saving to a server/cloud for the couple needs a backend decision.
- 3–4+ hands, sound classification, on-device speech.
