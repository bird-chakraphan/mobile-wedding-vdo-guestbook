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

// A finger counts as extended when its tip reaches well beyond its PIP joint
// (measured from the wrist, so it's orientation-independent like the curl
// check). Higher ratio than isFingerCurled's so a half-bent finger doesn't
// read as extended.
export function isFingerExtended(landmarks, tipIdx, pipIdx, vw, vh, ratio = 1.3) {
  const wrist = videoPx(landmarks[0], vw, vh);
  const tip = videoPx(landmarks[tipIdx], vw, vh);
  const pip = videoPx(landmarks[pipIdx], vw, vh);
  return dist(tip, wrist) > dist(pip, wrist) * ratio;
}

// Simpler alternatives to the mini heart, added because the finger heart is
// fiddly to hold steadily on a phone (see the Staff Page gesture picker).
// Each is a plain extended/curled pattern over the four fingers.

// Open palm: all four fingers extended (thumb ignored — its extension is
// unreliable from landmarks).
export function isOpenPalm(landmarks, vw, vh) {
  const extended = [
    isFingerExtended(landmarks, 8, 6, vw, vh),
    isFingerExtended(landmarks, 12, 10, vw, vh),
    isFingerExtended(landmarks, 16, 14, vw, vh),
    isFingerExtended(landmarks, 20, 18, vw, vh),
  ].filter(Boolean).length;
  return extended >= 4;
}

// Pointing up: index extended, the other three curled (allow one loose one).
export function isPointingUp(landmarks, vw, vh) {
  const indexExtended = isFingerExtended(landmarks, 8, 6, vw, vh);
  const curled = [
    isFingerCurled(landmarks, 12, 10, vw, vh),
    isFingerCurled(landmarks, 16, 14, vw, vh),
    isFingerCurled(landmarks, 20, 18, vw, vh),
  ].filter(Boolean).length;
  return indexExtended && curled >= 2;
}

// Peace / V sign: index + middle extended, ring + pinky curled.
export function isPeace(landmarks, vw, vh) {
  return isFingerExtended(landmarks, 8, 6, vw, vh)
    && isFingerExtended(landmarks, 12, 10, vw, vh)
    && isFingerCurled(landmarks, 16, 14, vw, vh)
    && isFingerCurled(landmarks, 20, 18, vw, vh);
}

// Staff-selectable gesture set (value = DB gesture_type, label for the
// Staff Page dropdown). First entry is the default.
export const GESTURE_OPTIONS = [
  { value: 'mini-heart', label: 'Mini heart 🫰' },
  { value: 'open-palm', label: 'Open palm ✋' },
  { value: 'point-up', label: 'Point up ☝️' },
  { value: 'peace', label: 'Peace ✌️' },
];

export function detectGesture(type, landmarks, vw, vh) {
  switch (type) {
    case 'open-palm': return isOpenPalm(landmarks, vw, vh);
    case 'point-up': return isPointingUp(landmarks, vw, vh);
    case 'peace': return isPeace(landmarks, vw, vh);
    case 'mini-heart':
    default: return isMiniHeart(landmarks, vw, vh);
  }
}

// Where the graphic anchors and its base size, per gesture — all in VIDEO
// pixels, so the caller maps to screen with its own cover transform (see
// main.js). Anchor/size chosen to match the reference framing: the box sits
// over the palm for an open hand, and floats just above the raised
// fingertip(s) for the pointed gestures. Base size scales with the hand's
// own wrist->middle-knuckle span, so it tracks distance to the camera; the
// staff "graphic size" setting multiplies it further.
export function gesturePlacement(type, landmarks, vw, vh) {
  const wrist = videoPx(landmarks[0], vw, vh);
  const middleMcp = videoPx(landmarks[9], vw, vh);
  const handSpan = dist(wrist, middleMcp) || 1;

  if (type === 'open-palm') {
    const ids = [0, 5, 9, 13, 17]; // wrist + the four MCP knuckles = palm
    const cx = ids.reduce((s, i) => s + landmarks[i].x * vw, 0) / ids.length;
    const cy = ids.reduce((s, i) => s + landmarks[i].y * vh, 0) / ids.length;
    return { x: cx, y: cy, size: handSpan * 1.7 };
  }

  if (type === 'point-up') {
    const tip = videoPx(landmarks[8], vw, vh);
    return { x: tip.x, y: tip.y - handSpan * 1.1, size: handSpan * 0.7 };
  }

  if (type === 'peace') {
    const indexTip = videoPx(landmarks[8], vw, vh);
    const middleTip = videoPx(landmarks[12], vw, vh);
    return {
      x: (indexTip.x + middleTip.x) / 2,
      y: (indexTip.y + middleTip.y) / 2 - handSpan * 1.1,
      size: handSpan * 0.7,
    };
  }

  // mini-heart: anchor at whichever pinched fingertip sits higher.
  const thumbTip = videoPx(landmarks[4], vw, vh);
  const indexTip = videoPx(landmarks[8], vw, vh);
  const anchor = thumbTip.y < indexTip.y ? thumbTip : indexTip;
  return { x: anchor.x, y: anchor.y - handSpan * 1.1, size: handSpan * 0.5 };
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
