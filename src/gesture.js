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
// Staff Page dropdown, hintName for the guest's on-screen hint). First entry
// is the default. hintName carries its own article so gestureHintText below
// reads naturally for both "a" and "an" gestures.
//
// hintText is an optional literal override — Bird's real Thai copy from the
// reference design, currently supplied for point-up and peace. The rest
// fall back to the generic English template below until Thai wording is
// supplied for them too — same "don't invent Thai" rule as everywhere
// else in this file.
export const GESTURE_OPTIONS = [
  { value: 'mini-heart', label: 'Mini heart 🫰', hintName: 'a mini heart 🫰' },
  { value: 'open-palm', label: 'Open palm ✋', hintName: 'an open palm ✋' },
  {
    value: 'point-up', label: 'Point up ☝️', hintName: 'a pointing finger ☝️',
    hintText: 'ลองชี้นิ้วขึ้นกลางอากาศดู\n☝มือซ้ายทีมอิท · มือขวาทีมโบ👆'
  },
  {
    value: 'peace', label: 'Peace ✌️', hintName: 'a peace sign ✌️',
    hintText: 'ชู 2 นิ้ว ✌ มือซ้ายทีมอิท · มือขวาทีมโบ'
  },
];

// The guest's record-screen hint. The gesture is staff-configurable, so the
// hint has to name whichever one is selected rather than hard-coding the
// finger heart. Unknown/absent types fall back to the default gesture, the
// same way detectGesture does — the hint must never contradict what is
// actually being detected.
export function gestureHintText(type) {
  const option = GESTURE_OPTIONS.find(o => o.value === type) || GESTURE_OPTIONS[0];
  if (option.hintText) return option.hintText;
  return `Make ${option.hintName} while recording to pop a graphic.`;
}

export function detectGesture(type, landmarks, vw, vh) {
  switch (type) {
    case 'open-palm': return isOpenPalm(landmarks, vw, vh);
    case 'point-up': return isPointingUp(landmarks, vw, vh);
    case 'peace': return isPeace(landmarks, vw, vh);
    case 'mini-heart':
    default: return isMiniHeart(landmarks, vw, vh);
  }
}

// X — the one unit every gesture's graphic is measured in: the index
// fingertip segment, from the tip (#8) to the first knuckle below it
// (DIP, #7). It shrinks and grows with distance to the camera, so the
// graphic tracks the hand automatically.
export function fingertipUnit(landmarks, vw, vh) {
  return dist(videoPx(landmarks[8], vw, vh), videoPx(landmarks[7], vw, vh)) || 1;
}

// At 100%, the graphic fits a 3X by 3X box (aspect preserved by the caller).
const GRAPHIC_BOX_UNITS = 3;

// Where the graphic sits, per gesture — all in VIDEO pixels, so the caller
// maps to screen with its own cover transform (see main.js).
//
// Returns the graphic's BOTTOM-CENTRE anchor rather than its centre: the
// size setting then grows the graphic upward while the annotated gap to the
// hand stays put. Geometry per the reference annotations:
//   point-up   — bottom sits one X of clear air above the index fingertip.
//   peace      — take the two raised fingertips: the bottom sits half their
//                gap above whichever one is higher, centred between them.
//   mini-heart — same construction, over thumb + index instead.
//   open-palm  — anchored on the palm centre (not covered by the reference
//                annotations).
export function gesturePlacement(type, landmarks, vw, vh) {
  const unit = fingertipUnit(landmarks, vw, vh);
  const size = unit * GRAPHIC_BOX_UNITS;

  if (type === 'open-palm') {
    const ids = [0, 5, 9, 13, 17]; // wrist + the four MCP knuckles = palm
    const cx = ids.reduce((s, i) => s + landmarks[i].x * vw, 0) / ids.length;
    const cy = ids.reduce((s, i) => s + landmarks[i].y * vh, 0) / ids.length;
    return { x: cx, y: cy, size };
  }

  if (type === 'point-up') {
    const tip = videoPx(landmarks[8], vw, vh);
    return { x: tip.x, y: tip.y - unit, size };
  }

  // peace and mini-heart share one construction over two raised fingertips —
  // index + middle for peace, index + thumb for the finger heart.
  const indexTip = videoPx(landmarks[8], vw, vh);
  const otherTip = videoPx(landmarks[type === 'peace' ? 12 : 4], vw, vh);
  const gap = dist(indexTip, otherTip);
  return {
    x: (indexTip.x + otherTip.x) / 2,
    y: Math.min(indexTip.y, otherTip.y) - gap / 2,
    size,
  };
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
