# ADR-0002: Record the composed canvas, not the raw camera

## Status
Accepted (2026-07-16)

## Context
The Clip must contain the beauty filter, gesture Bursts, and the Frame — that magic is the product. MediaRecorder can record either the raw camera stream or a canvas stream (`canvas.captureStream()`).

## Decision
Record the composed canvas (the same processed image the guest sees) combined with the microphone audio track. Everything visible is baked into the Clip permanently.

## Alternatives considered
- **Raw camera recording, effects preview-only**: much lighter on phone CPUs, but the downloaded clip would differ from what the guest saw — disappointing, and the couple would receive plain videos.
- **Server-side compositing**: re-render effects on a server after upload. Far more infrastructure than an MVP justifies, and effects timing (gesture moments) would need to be re-synced.

## Consequences
- The full pipeline (FaceLandmarker + HandLandmarker + beauty compositing + encoding) runs simultaneously on the guest's phone. This is the project's main performance risk — must be tested on mid-range phones before building further features.
- Escape hatches if tests stutter: 720×1280 preset, reduced beauty settings, throttled detection rate (detect at 15–20fps, render at 30).
- Output codec follows the browser: WebM (Chrome/Android) or MP4/H.264 (iOS Safari). Filename extension and preview player must handle both.
