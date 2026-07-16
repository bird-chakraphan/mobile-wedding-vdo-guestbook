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

## Techniques understood (reusable recipes)

- **Gesture detection** = geometry over landmarks (distances/angles between the 21 points). E.g. "mini heart" (Korean finger heart = thumb tip #4 crossing index tip #8) is a distance check between landmarks 4 and 8 plus other fingers curled.
- **Handedness**: `result.handedness[i][0].categoryName` + score → different effect per hand.
- **Beauty pipeline**: sharp base → blurred copy → AI face-oval mask (feathered, eyes/lips holes) → composite at slider strength → brightness/saturate filter for glow.
- **Face reshape**: horizontal strip-squeeze toward face centerline; profile curve along face height decides the effect (V-shape = ramp to chin; narrow = flat with feathered ends). Curves are additive in one warp pass.
- **Everything is free**: MediaPipe is Apache-2.0, runs on-device, no API costs. Hosting static = free tier (Vercel/Netlify/GitHub Pages).

## Not yet tested (risks for the MVP)

- **Mobile browsers** (the actual guest device via QR!): iOS Safari camera + MediaRecorder support/codecs, portrait orientation, front camera selection, performance of FaceLandmarker + HandLandmarker running TOGETHER.
- **MediaRecorder recording** of a composed canvas (`canvas.captureStream()` + mic audio track) — concept known, not yet built.
- **Two models at once** (hands + face beauty filter simultaneously) — each costs frame time.
- **File saving/upload** — requirement says "file to be saved": download-to-device is trivial; saving to a server/cloud for the couple needs a backend decision.
- 3–4+ hands, sound classification, on-device speech.
