// Mini-heart gesture geometry (right-hand finger heart): thumb tip (#4)
// crossing index tip (#8), while at least one of the other three fingers
// shows some curl. Recipe from TESTED-LEARNINGS.md's "Gesture detection"
// section. Thresholds loosened twice after real-phone testing: real hands
// don't pinch perfectly or curl the other fingers tightly — a natural,
// relaxed finger-heart barely bends the middle/ring/pinky at all, so the
// pinch (thumb crossing index) carries most of the signal.

export function videoPx(landmark, vw, vh) {
  return { x: landmark.x * vw, y: landmark.y * vh };
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// A finger counts as curled when its tip is no farther from the wrist than
// its MIDDLE joint (PIP), with a small margin. Comparing against the PIP
// rather than the knuckle matters: when a folded finger points at the
// camera, foreshortening leaves the 2D tip level with the PIP (curled ->
// ratio ~1.0), while a straight finger's tip always projects well beyond
// it — this was the main source of missed detections on the test rig.
export function isFingerCurled(landmarks, tipIdx, pipIdx, vw, vh, ratio = 1.15) {
  const wrist = videoPx(landmarks[0], vw, vh);
  const tip = videoPx(landmarks[tipIdx], vw, vh);
  const pip = videoPx(landmarks[pipIdx], vw, vh);
  return dist(tip, wrist) < dist(pip, wrist) * ratio;
}

export function isMiniHeart(landmarks, vw, vh) {
  const wrist = videoPx(landmarks[0], vw, vh);
  const middleMcp = videoPx(landmarks[9], vw, vh);
  const handScale = dist(wrist, middleMcp) || 1;
  const pinch = dist(videoPx(landmarks[4], vw, vh), videoPx(landmarks[8], vw, vh));
  const pinched = pinch < handScale * 0.85;

  const curledCount = [
    isFingerCurled(landmarks, 12, 10, vw, vh),  // middle tip vs middle PIP
    isFingerCurled(landmarks, 16, 14, vw, vh),  // ring
    isFingerCurled(landmarks, 20, 18, vw, vh),  // pinky
  ].filter(Boolean).length;

  return pinched && curledCount >= 1;
}

// MediaPipe's per-frame handedness label can flicker even for the same
// physical hand. Smoothing over a short rolling window of recent labels
// (see main.js) makes the "Right hand only" gate far less flaky than
// trusting a single frame.
export function majorityHandedness(recentLabels) {
  const counts = {};
  for (const label of recentLabels) {
    if (!label) continue;
    counts[label] = (counts[label] || 0) + 1;
  }
  let best = '', bestCount = 0;
  for (const [label, count] of Object.entries(counts)) {
    if (count > bestCount) { best = label; bestCount = count; }
  }
  return best;
}

// Same flicker problem applies to the geometry check itself — a held,
// steady gesture can still flip true/false frame-to-frame from landmark
// jitter. Smoothing it over a rolling window (see main.js) stops the
// heart's fade-out from re-triggering on every single missed frame.
export function majorityBoolean(recentFlags) {
  if (recentFlags.length === 0) return false;
  const trueCount = recentFlags.filter(Boolean).length;
  return trueCount >= Math.ceil(recentFlags.length / 2);
}
