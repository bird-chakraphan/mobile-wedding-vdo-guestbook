# Wedding VDO Guest Book — Context

A camera web app for wedding guests to record video messages ("clips") for the couple, with hand-gesture effects and beauty filters. Guests access via QR code on their own phones. Staff configure the experience beforehand.

## Glossary

| Term | Meaning |
|---|---|
| **Guest** | A wedding attendee who scans the QR and records a clip. Uses their own phone. |
| **Couple** | The bride and groom — the recipients of all clips. |
| **Staff** | The event organizer/designer (Bird or venue staff) who configures effects, frame, and limits before the event via the Staff Page. |
| **Clip** | One recorded video message, WITH effects/frame baked in, named after the guest. |
| **Guest Page** | The public flow: instruction → name entry → countdown → record → result/preview. |
| **Staff Page** | Configuration page: gesture graphics, frame, output size, time limit, beauty settings. |
| **Frame** | A decorative image overlay sitting on top of the camera output, uploaded by staff, sized to the video output. |
| **Gesture Graphic** | Image shown when a guest performs a hand gesture. Left-hand mini heart → graphic A (default: pink heart); right-hand mini heart → graphic B (default: red heart). |
| **Mini heart** | The Korean finger heart (มินิฮาร์ท): one hand, thumb tip and index fingertip crossed, other fingers curled. Detected via landmark #4–#8 distance + curled-finger check. Left hand and right hand trigger different Gesture Graphics (handedness label, verified against mirroring). |
| **Burst** | The gesture-graphic behavior: while a Mini heart is held, copies of the graphic pop from the hand and float upward, spawning continuously. |

## Decisions

- **Clip delivery**: On "Done", the clip auto-uploads to cloud storage so the Couple receives every clip with zero guest effort. The Guest also gets a download button on the result page. (Guest-download-only was rejected: too many clips would never reach the Couple.)
- **Backend**: Supabase for everything — Storage bucket for clips + staff-uploaded images (frame, gesture graphics), one table for staff settings. See ADR-0001.
- **Recording composition**: everything baked in — the Clip is a recording of the composed canvas (beauty filter + gesture Bursts + Frame) plus mic audio, via `canvas.captureStream()` + MediaRecorder. Escape hatch: staff can lower beauty settings / resolution if real-phone tests stutter.
- **Output size**: staff picks from presets — portrait 9:16 (1080×1920 default, 720×1280 fallback) or square 1:1. The Frame image must match the chosen ratio (transparent PNG).
- **Staff Page protection**: simple passcode gate on /staff; settings-writes require the passcode. Threat model is a curious guest, not a hacker.
- **Upload timing**: upload starts immediately when recording ends, in the background, while the Guest watches the preview. "Record again" adds a new Clip; all takes are kept for the Couple.
- **File naming**: `SanitizedGuestName_YYYY-MM-DD_HHMM.webm`; the exact name as typed (Thai/emoji ok) is stored in the settings DB alongside the clip record.
- **Time limit**: staff-configurable, default 60 seconds; countdown warning during the last 10 seconds; 3-second pre-roll countdown before recording starts (clicking Stop during pre-roll cancels back to idle instead of starting).
- **In-app browsers**: guests may scan the QR from LINE/Instagram etc. (cannot be controlled). Detect webviews and show a Thai+English instruction screen ("tap ⋯ → Open in Browser") before the flow starts.
- **Stack**: vanilla JS + Vite static site, supabase-js, MediaPipe tasks-vision; deployed on Vercel. No framework — stays closest to the proven prototypes.

## Build order — day one instruction

**Step 0 — Supabase setup (does not exist yet; agent must handle this).**
No Supabase project has been created. The agent should walk Bird through it, doing everything scriptable itself and giving click-by-click guidance for the rest. Bird is a designer, not a developer — assume no prior Supabase console experience beyond low-code tools.

1. Guide Bird to create a free account/project at supabase.com (agent cannot do this part — needs Bird's login). Ask Bird for the Project URL and anon key once created, and store them in a `.env` file (never hardcode in committed source).
2. Agent writes ALL setup itself: the settings table schema, the storage buckets (`clips` for recordings, `assets` for staff-uploaded frame/gesture graphics), and the access policies (guests: insert-only on clips, no listing/reading others' clips; settings/assets: public read, passcode-gated write per the Staff Page decision). Provide it as SQL for the Supabase SQL Editor and tell Bird exactly where to paste and run it.
3. Verify the setup works with a small test upload before building any UI.

**Step 1 — thinnest recording slice.**
Build the thinnest possible recording slice FIRST: camera → beauty filter + one gesture → canvas recording → Supabase upload. Test it on a real mid-range phone (Android + iPhone) BEFORE building the staff page or polishing anything. That is the only unproven link in the whole chain — everything else in this document is either already proven in the prototypes or low-risk.

## Known risks (accepted for MVP, test early)

- **Phone performance**: HandLandmarker + FaceLandmarker + beauty pipeline + MediaRecorder running together is untested on real phones. Escape hatches: 720×1280 preset, lower beauty settings, `modelComplexity`/resolution tuning. Test on a mid-range Android + an iPhone FIRST, before building more.
- **iOS Safari MediaRecorder codecs**: Safari records MP4/H.264, Chrome records WebM — filename extension and preview handling must adapt to what the browser produces.
- **Storage budget**: free Supabase tier ≈ 1GB ≈ 40–60 one-minute clips. Monitor during event or upgrade beforehand.
- **Handedness mirroring**: left/right labels must be verified against the mirrored selfie view during implementation (known gotcha from prototypes).

## Post-MVP ideas (explicitly out of scope)

- Couple's gallery page to browse all clips
- Face reshape beyond V-shape/narrow; voice commands; multi-event support
