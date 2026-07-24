/* ============================================================
   Wedding VDO Guest Book — Step 1: thinnest recording slice

   Beauty pipeline is adapted directly from beauty-filter-camera.html
   (masked-blur skin smoothing + glow, FaceLandmarker). Model-loading
   fallback and crash-proof detection loop follow the same pattern in
   both beauty-filter-camera.html and hand-laser-camera.html. Gesture
   geometry follows the recipe in TESTED-LEARNINGS.md ("mini heart" =
   thumb tip #4 / index tip #8 distance + other fingers curled).
   ============================================================ */

import { FaceLandmarker, HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { supabase } from './supabaseClient.js';
import { detectGesture, gesturePlacement, gestureHintText, majorityHandedness, majorityBoolean } from './gesture.js';
import { pickMimeType, buildFilename, sanitizeName, withRetries } from './recording.js';
import { nextHeartState } from './heartAnimation.js';
import { computeWarpStrips } from './faceWarp.js';
import { shouldUseGraphicImage } from './gestureGraphic.js';
import { edgePadding, previewBox, aspectFit } from './previewLayout.js';
import { loadSettings, SETTINGS_DEFAULTS } from './settings.js';
import { preRollRemaining, recordingStatus } from './countdown.js';
import { isInAppWebview } from './webview.js';

// Staff-configured values; refreshed from the DB during init (defaults
// keep everything working if the fetch fails).
let settings = { ...SETTINGS_DEFAULTS };

const PRE_ROLL_SECONDS = 5;

// Known risk (CONTEXT.md / TESTED-LEARNINGS.md): MediaPipe's handedness
// label may be swapped relative to what the guest sees in the mirrored
// selfie view. Confirmed NOT flipped on this Mac's Chrome (unflipped
// labels matched real hands). NOTE: desktop webcams and phone front
// cameras can differ in whether the raw stream is pre-mirrored — re-check
// this on the actual phone during Step 1's real-device test.
const HANDEDNESS_FLIPPED = false;

// Tuning aid for gesture detection — draws the 21 hand landmarks, bone
// connections, and live pinch/curl numbers on screen. Off for real guests;
// the staff preview has its own "detection" toggle for checking the model.
const DEBUG_SKELETON = false;

const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],        // thumb
  [0,5],[5,6],[6,7],[7,8],        // index finger
  [0,9],[9,10],[10,11],[11,12],   // middle finger
  [0,13],[13,14],[14,15],[15,16], // ring finger
  [0,17],[17,18],[18,19],[19,20]  // pinky
];

const video   = document.getElementById('video');
const out     = document.getElementById('outCanvas');
const octx    = out.getContext('2d');
const entry   = document.getElementById('entry');
const nameInput = document.getElementById('nameInput');
const webviewNotice = document.getElementById('webviewNotice');
const preRollEl = document.getElementById('preRoll');
const canvasOverlay = document.getElementById('canvasOverlay');
const gestureHint = document.getElementById('gestureHint');
const timeLimitHint = document.getElementById('timeLimitHint');
const startBtn = document.getElementById('startBtn');
const status  = document.getElementById('status');
const controls = document.getElementById('controls');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const result = document.getElementById('result');
const previewVideo = document.getElementById('previewVideo');
const uploadStatus = document.getElementById('uploadStatus');
const saveBtn = document.getElementById('saveBtn');
const downloadLink = document.getElementById('downloadLink');
const retryBtn = document.getElementById('retryBtn');

/* ---------- offscreen working canvases (video resolution), same
   layering as beauty-filter-camera.html ---------- */
const blurCanvas = document.createElement('canvas');
const maskCanvas = document.createElement('canvas');
const skinCanvas = document.createElement('canvas');
const compCanvas = document.createElement('canvas');
const bctx = blurCanvas.getContext('2d');
const mctx = maskCanvas.getContext('2d');
const sctx = skinCanvas.getContext('2d');
const cctx = compCanvas.getContext('2d');

const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,
  379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,
  103,67,109];
const LEFT_EYE  = [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7];
const RIGHT_EYE = [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249];
const LIPS      = [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146];


/* ---------- load AI models (GPU -> CPU fallback) ----------
   Wrapped in an async function rather than top-level await: top-level
   await requires a newer build target, and guest phones are the one
   environment we can't control. ---------- */
let faceLandmarker, handLandmarker;

async function loadModels() {
  const filesets = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  const createFaceLandmarker = (delegate) =>
    FaceLandmarker.createFromOptions(filesets, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate
      },
      runningMode: "VIDEO",
      numFaces: 1
    });
  const createHandLandmarker = (delegate) =>
    HandLandmarker.createFromOptions(filesets, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate
      },
      runningMode: "VIDEO",
      numHands: 2
    });

  try { faceLandmarker = await createFaceLandmarker("GPU"); }
  catch { faceLandmarker = await createFaceLandmarker("CPU"); }
  try { handLandmarker = await createHandLandmarker("GPU"); }
  catch { handLandmarker = await createHandLandmarker("CPU"); }

  modelsReady = true;
  startBtn.textContent = "พร้อมแล้ว กดเลย";
  refreshStartButton();
}

// Start is allowed only once the models are loaded AND the guest has
// entered a (non-blank) name.
let modelsReady = false;

function refreshStartButton() {
  startBtn.disabled = !modelsReady || nameInput.value.trim() === '';
}

nameInput.addEventListener('input', refreshStartButton);

// Enter acts like tapping Start — nameInput isn't inside a <form>, so Enter
// does nothing by default. Respects the same disabled state (models not
// ready yet, or the name is still blank) rather than bypassing it.
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !startBtn.disabled) startBtn.click();
});

// In-app webviews (LINE/IG/FB) break camera access — show the bilingual
// "open in browser" screen and load nothing else.
const inWebview = isInAppWebview(navigator.userAgent);
if (inWebview) {
  webviewNotice.style.display = 'flex';
  entry.style.display = 'none';
} else {
  // Show the default gesture's hint immediately so the line is never blank,
  // then correct it once the staff's actual choice arrives.
  gestureHint.textContent = gestureHintText(settings.gestureType);
  timeLimitHint.textContent = `มีเวลา ${settings.timeLimitSeconds} วิ ในการอัด 1 ครั้ง`;
  loadSettings(supabase).then(loaded => {
    settings = loaded;
    gestureHint.textContent = gestureHintText(settings.gestureType);
    timeLimitHint.textContent = `มีเวลา ${settings.timeLimitSeconds} วิ ในการอัด 1 ครั้ง`;
    loadGestureImage('Left', settings.gestureLeftUrl);
    loadGestureImage('Right', settings.gestureRightUrl);
    loadFrameImage(settings.frameUrl);
  });
  loadModels().catch(err => {
    console.error('model loading failed:', err);
    startBtn.textContent = 'Loading failed — check internet & reload';
  });
}

/* ---------- camera + mic ---------- */
let cameraStream = null;
let micTrack = null;
let guestName = '';

// Gates loop()'s self-perpetuating requestAnimationFrame chain. "Record
// again" now returns to the entry screen instead of restarting the camera
// immediately, so the gap between stopCamera() and the next startCamera()
// can be indefinite (however long the guest takes to re-enter their name)
// rather than the brief flash it used to be — without this, the loop
// would keep running MediaPipe detection against a dead video element the
// whole time, and a later Start click would stack a second parallel chain
// on top of the one that never stopped.
let cameraActive = false;

// Shared by the first camera grant (startBtn) and every retake
// (retryBtn) — recording end always releases the hardware, so a
// retake has to re-request getUserMedia rather than reuse a track.
async function startCamera() {
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: 1280, height: 720 },
    audio: true
  });
  video.srcObject = cameraStream;
  await video.play();
  micTrack = cameraStream.getAudioTracks()[0];
  cameraActive = true;
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  micTrack = null;
  cameraActive = false;
}

startBtn.addEventListener('click', async () => {
  await startCamera();
  guestName = nameInput.value;

  for (const c of [blurCanvas, maskCanvas, skinCanvas, compCanvas]) {
    c.width = video.videoWidth; c.height = video.videoHeight;
  }

  entry.style.display = 'none';
  controls.style.display = 'flex';
  canvasOverlay.style.display = 'flex';
  requestAnimationFrame(loop);
});

/* ---------- helpers reused from beauty-filter-camera.html ---------- */
function tracePath(c, landmarks, indices) {
  const vw = video.videoWidth, vh = video.videoHeight;
  c.beginPath();
  indices.forEach((idx, i) => {
    const x = landmarks[idx].x * vw, y = landmarks[idx].y * vh;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  });
  c.closePath();
}

function buildMask(faces) {
  mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  for (const landmarks of faces) {
    mctx.filter = 'blur(12px)';
    mctx.fillStyle = '#fff';
    tracePath(mctx, landmarks, FACE_OVAL);
    mctx.fill();
    mctx.filter = 'none';

    mctx.globalCompositeOperation = 'destination-out';
    mctx.filter = 'blur(4px)';
    for (const loop of [LEFT_EYE, RIGHT_EYE, LIPS]) {
      tracePath(mctx, landmarks, loop);
      mctx.fill();
    }
    mctx.filter = 'none';
    mctx.globalCompositeOperation = 'source-over';
  }
}

/* ---------- object-fit:cover coordinate mapping, from
   hand-laser-camera.html's toScreen() ---------- */
function toScreen(lm, vw, vh, cw, ch) {
  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  return { x: lm.x * vw * scale + offsetX, y: lm.y * vh * scale + offsetY };
}

/* ---------- V-shape/narrow face reshape — draws the strips computed by
   faceWarp.js's computeWarpStrips (pure geometry) onto the screen canvas,
   sampling from compCanvas (already beauty-composited, video resolution)
   the same way beauty-filter-camera.html's warpJaw does. ---------- */
function drawFaceWarp(strips, scale, dx, dy) {
  for (const { y, height, inset, fl, fr, wx0, wx1 } of strips) {
    const sx = x => dx + x * scale;
    const dyy = dy + y * scale;
    const dhh = height * scale + 0.6; // tiny overlap, no seams

    octx.drawImage(compCanvas, wx0, y, fl - wx0, height,
      sx(wx0), dyy, (fl + inset - wx0) * scale, dhh);
    octx.drawImage(compCanvas, fl, y, fr - fl, height,
      sx(fl + inset), dyy, (fr - fl - 2 * inset) * scale, dhh);
    octx.drawImage(compCanvas, fr, y, wx1 - fr, height,
      sx(fr - inset), dyy, (wx1 - fr + inset) * scale, dhh);
  }
}

/* ---------- debug skeleton overlay (tuning aid, DEBUG_SKELETON only) —
   same bones/point drawing as hand-laser-camera.html, colored green when
   the current landmarks satisfy isMiniHeart's geometry ---------- */
function drawHandSkeleton(landmarks, vw, vh, cw, ch, matches) {
  const pts = landmarks.map(lm => toScreen(lm, vw, vh, cw, ch));
  octx.strokeStyle = matches ? 'rgba(0,255,120,0.9)' : 'rgba(0,255,200,0.6)';
  octx.lineWidth = 2;
  for (const [a, b] of HAND_BONES) {
    octx.beginPath();
    octx.moveTo(pts[a].x, pts[a].y);
    octx.lineTo(pts[b].x, pts[b].y);
    octx.stroke();
  }
  pts.forEach((p, i) => {
    const isPinchPoint = i === 4 || i === 8;
    octx.fillStyle = isPinchPoint ? '#ff3d6e' : 'rgba(255,255,255,0.8)';
    octx.beginPath();
    octx.arc(p.x, p.y, isPinchPoint ? 7 : 4, 0, Math.PI * 2);
    octx.fill();
  });
}

/* ---------- one floating heart graphic per hand — fades in on gesture
   start, holds steady (following the hand) while held, fades out on
   release. Per CONTEXT.md's glossary: left-hand mini heart -> pink,
   right-hand -> red. State transitions live in heartAnimation.js
   (tested); this is just the canvas drawing. ---------- */
const HEART_COLORS = { Right: '#ff3355', Left: '#ff9ecb' };
const heartsByHand = { Right: null, Left: null };

// Staff-uploaded gesture graphics (issue #7) — preloaded once settings
// load so a slow/broken image never blocks or glitches the animation.
// shouldUseGraphicImage (tested, gestureGraphic.js) decides per-frame
// whether drawHearts() below draws this image or falls back to the
// built-in heart.
const gestureImages = { Right: null, Left: null };

// Staff assets come from Supabase storage — a different origin. Drawing an
// image fetched WITHOUT crossOrigin taints the canvas, and a tainted canvas
// makes out.captureStream() throw SecurityError, which kills recording
// outright. Supabase serves the CORS headers, so requesting the image in cors
// mode keeps the canvas origin-clean. If CORS ever fails the image just
// errors -> shouldUseGraphicImage() returns false -> no draw, no taint, and
// recording still works.
function loadCorsImage(url, onState) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const state = { url, loaded: false, failed: false, img };
  img.onload = () => { state.loaded = true; };
  img.onerror = () => { state.failed = true; };
  img.src = url;
  onState(state);
}

function loadGestureImage(label, url) {
  if (!url) { gestureImages[label] = null; return; }
  loadCorsImage(url, state => { gestureImages[label] = state; });
}

// Staff-uploaded frame overlay (transparent PNG) — the top composition
// layer, drawn to fill the whole output box. Preloaded like the gesture
// graphics; shouldUseGraphicImage gates it the same way.
let frameImage = null;

function loadFrameImage(url) {
  if (!url) { frameImage = null; return; }
  loadCorsImage(url, state => { frameImage = state; });
}

// The output canvas is CSS-mirrored (selfie view); counter-mirror the frame
// as we draw so any text/logo in it still reads correctly on screen.
function drawFrame(ctx, boxW, boxH) {
  if (!frameImage || !shouldUseGraphicImage(frameImage)) return;
  ctx.save();
  ctx.translate(boxW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(frameImage.img, 0, 0, boxW, boxH);
  ctx.restore();
}

function drawHeartPath(ctx, cx, cy, size) {
  const top = cy + size * 0.28;
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.bezierCurveTo(cx, cy, cx - size / 2, cy, cx - size / 2, top);
  ctx.bezierCurveTo(cx - size / 2, cy + size * 0.65, cx, cy + size * 0.65, cx, cy + size);
  ctx.bezierCurveTo(cx, cy + size * 0.65, cx + size / 2, cy + size * 0.65, cx + size / 2, top);
  ctx.bezierCurveTo(cx + size / 2, cy, cx, cy, cx, top);
  ctx.closePath();
}

function drawHearts() {
  for (const label of ['Right', 'Left']) {
    const h = heartsByHand[label];
    if (!h) continue;
    const size = Math.max(1, h.size);
    const graphic = gestureImages[label];

    // (h.x, h.y) is the graphic's bottom centre (gesture.js) — draw upward
    // from it so the staff size setting grows the graphic without closing
    // the gap to the hand.
    octx.save();
    octx.globalAlpha = h.alpha;
    if (graphic && shouldUseGraphicImage(graphic)) {
      const { width, height } = aspectFit(size, graphic.img.naturalWidth, graphic.img.naturalHeight);
      octx.drawImage(graphic.img, h.x - width / 2, h.y - height, width, height);
    } else {
      octx.fillStyle = HEART_COLORS[label];
      drawHeartPath(octx, h.x, h.y - size, size);
      octx.fill();
    }
    octx.restore();
  }
}

/* ---------- crash-proof detection + render loop (same pattern as
   both prototypes: detect only on new camera frames, draw from cached
   results every screen frame, wrap detection in try/catch) ---------- */
let lastVideoTime = -1;
let latestFaces = [];
let latestHands = [];
let latestHandedness = [];

// Rolling label history per hand "slot" (assumes hand ordering is roughly
// stable frame-to-frame — true in practice when one guest hand is
// performing the gesture). Smooths out MediaPipe's per-frame handedness
// flicker; see gesture.js's majorityHandedness.
const HANDEDNESS_WINDOW = 8;
const handednessHistory = [[], []];

// Same smoothing applied to the geometry match itself — a steady, held
// gesture can still flicker true/false frame-to-frame from landmark
// jitter (see gesture.js's majorityBoolean). Shorter window than
// handedness since we want the heart to respond quickly to release.
const GEOMETRY_WINDOW = 5;
const geometryHistory = [[], []];

function loop() {
  if (!cameraActive) return; // stops the rAF chain — see cameraActive's comment
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    try {
      const faceResult = faceLandmarker.detectForVideo(video, performance.now());
      latestFaces = faceResult.faceLandmarks || [];
    } catch (err) { console.warn('face detection skipped:', err); }
    try {
      const handResult = handLandmarker.detectForVideo(video, performance.now());
      latestHands = handResult.landmarks || [];
      latestHandedness = handResult.handednesses || [];
    } catch (err) { console.warn('hand detection skipped:', err); }
  }

  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) { requestAnimationFrame(loop); return; }

  // Issue #8: the canvas BACKING STORE is the staff preset's true pixel size,
  // so captureStream — and therefore every recorded clip — comes out exactly
  // 1080x1920 (or whichever preset) no matter what phone this is. Assigning
  // width/height also clears the canvas, so only do it on a real change; the
  // cover-fit drawImage below repaints every pixel each frame anyway.
  if (out.width !== settings.outputWidth || out.height !== settings.outputHeight) {
    out.width = settings.outputWidth;
    out.height = settings.outputHeight;
  }

  // CSS then displays that fixed-size canvas scaled down into a box of the
  // same ratio, fitted inside the screen with an even edge gap — same
  // composition the guest sees, just at screen size rather than clip size.
  //
  // Measure the <html> box (100dvh, overflow:hidden) rather than
  // window.innerHeight: the two can disagree — on iOS Safari innerHeight
  // moves with the toolbar — and CSS centres this canvas against the former,
  // so reading the same box is what keeps the preview centred where CSS puts it.
  const availW = document.documentElement.clientWidth;
  const availH = document.documentElement.clientHeight;
  const pad = edgePadding();

  // #controls (Record/Stop) is bottom-anchored independently of the canvas
  // box, and its real height varies with font metrics/label length — a
  // fixed guess overlapped the button on some devices. Measuring its live
  // top edge each frame and reserving down to there (plus a breathing gap)
  // means the box always shrinks to leave it clear, never overlaps it.
  const controlsRect = controls.getBoundingClientRect();
  const bottomReserve = (availH - controlsRect.top) + 28;
  const topReserve = 60; // minimum top gap, independent of the 24px side pad

  const box = previewBox(availW, availH,
    settings.outputWidth, settings.outputHeight, pad, bottomReserve, topReserve);
  out.style.width = `${Math.round(box.width)}px`;
  out.style.height = `${Math.round(box.height)}px`;
  out.style.left = `${Math.round(box.x)}px`;
  out.style.top = `${Math.round(box.y)}px`;

  // #canvasOverlay carries the gesture hint + time-limit text and must sit
  // exactly on top of #outCanvas — unlike the canvas it's NOT mirrored, so
  // it needs its own explicit position rather than sharing the CSS transform.
  canvasOverlay.style.left = out.style.left;
  canvasOverlay.style.top = out.style.top;
  canvasOverlay.style.width = out.style.width;
  canvasOverlay.style.height = out.style.height;

  const scale = Math.max(out.width / vw, out.height / vh);
  const dx = (out.width - vw * scale) / 2;
  const dy = (out.height - vh * scale) / 2;

  /* beauty pipeline (fixed strength — no Staff Page sliders yet) */
  bctx.filter = 'blur(7px)';
  bctx.drawImage(video, 0, 0, vw, vh);
  bctx.filter = 'none';

  buildMask(latestFaces);

  sctx.clearRect(0, 0, vw, vh);
  sctx.drawImage(blurCanvas, 0, 0);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(maskCanvas, 0, 0);
  sctx.globalCompositeOperation = 'source-over';

  const glow = settings.beautyGlow / 100;
  const smooth = settings.beautySmooth / 100;
  cctx.filter = `brightness(${1 + glow * 0.12}) saturate(${1 + glow * 0.15}) contrast(${1 - glow * 0.05})`;
  cctx.drawImage(video, 0, 0, vw, vh);
  cctx.filter = 'none';
  cctx.globalAlpha = smooth * 0.85;
  cctx.drawImage(skinCanvas, 0, 0);
  cctx.globalAlpha = 1;

  octx.drawImage(compCanvas, dx, dy, vw * scale, vh * scale);

  const vshape = settings.beautyVshape / 100;
  const narrow = settings.beautyNarrow / 100;
  if (vshape > 0 || narrow > 0) {
    for (const landmarks of latestFaces) {
      drawFaceWarp(computeWarpStrips(landmarks, vshape, narrow, vw, vh), scale, dx, dy);
    }
  }

  /* gesture detection: mini heart on either hand -> one floating heart
     per hand (right = red, left = pink) */
  const tips = { Right: null, Left: null };

  latestHands.forEach((landmarks, i) => {
    let rawLabel = latestHandedness[i]?.[0]?.categoryName || '';
    if (HANDEDNESS_FLIPPED) rawLabel = rawLabel === 'Left' ? 'Right' : 'Left';

    const history = handednessHistory[i] || (handednessHistory[i] = []);
    history.push(rawLabel);
    if (history.length > HANDEDNESS_WINDOW) history.shift();
    const label = majorityHandedness(history);

    const rawMatchesGeometry = detectGesture(settings.gestureType, landmarks, vw, vh);
    const geomHistory = geometryHistory[i] || (geometryHistory[i] = []);
    geomHistory.push(rawMatchesGeometry);
    if (geomHistory.length > GEOMETRY_WINDOW) geomHistory.shift();
    const matchesGeometry = majorityBoolean(geomHistory);

    if ((label === 'Right' || label === 'Left') && matchesGeometry) {
      // Placement is computed in video pixels (gesture.js) and mapped into
      // the output box here via the same cover transform as the frame.
      const p = gesturePlacement(settings.gestureType, landmarks, vw, vh);
      tips[label] = {
        x: dx + p.x * scale,
        y: dy + p.y * scale,
        size: p.size * scale * (settings.gestureScale / 100)
      };
    }

    if (DEBUG_SKELETON) {
      drawHandSkeleton(landmarks, vw, vh, out.width, out.height, matchesGeometry);
    }
  });

  for (const label of ['Right', 'Left']) {
    heartsByHand[label] = nextHeartState(heartsByHand[label], {
      active: tips[label] !== null,
      x: tips[label]?.x, y: tips[label]?.y, size: tips[label]?.size
    });
  }
  drawHearts();
  drawFrame(octx, out.width, out.height);

  requestAnimationFrame(loop);
}

/* ============================================================
   Recording (ADR-0002: record the composed canvas + mic, not the
   raw camera) — the one unproven link per TESTED-LEARNINGS.md.
   ============================================================ */
let recording = false;
let mediaRecorder = null;
let chunks = [];
let mimeType = '';
let recordTimeout = null;
let elapsedInterval = null;

let preRolling = false;

recordBtn.addEventListener('click', () => {
  if (!micTrack || recording || preRolling) return;
  runPreRoll();
});

// 5-second on-screen countdown so the guest can get ready — recording
// only starts when it hits zero. The Stop button is shown dimmed/disabled
// throughout (per the reference design) as a preview of what's coming;
// beginRecording() below re-enables it once recording actually starts.
function runPreRoll() {
  preRolling = true;
  document.body.classList.add('recording-active');
  canvasOverlay.style.display = 'none';
  recordBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  stopBtn.disabled = true;
  preRollEl.style.display = 'flex';
  preRollEl.textContent = String(PRE_ROLL_SECONDS);
  const started = performance.now();
  const tick = setInterval(() => {
    const remaining = preRollRemaining(performance.now() - started, PRE_ROLL_SECONDS);
    preRollEl.textContent = remaining > 0 ? String(remaining) : '';
    if (remaining <= 0) {
      clearInterval(tick);
      preRollEl.style.display = 'none';
      preRolling = false;
      beginRecording();
    }
  }, 100);
}

function beginRecording() {
  mimeType = pickMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));

  // The pre-roll has already hidden the controls, so anything thrown here
  // used to leave the guest staring at a live camera with no buttons at all
  // (what a tainted canvas did). Always hand them a way back instead.
  let combined;
  try {
    const canvasStream = out.captureStream(30);
    combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      micTrack
    ]);
  } catch (err) {
    console.error('could not capture the canvas:', err);
    document.body.classList.remove('recording-active');
    status.textContent = 'Could not start recording — please reload the page.';
    status.classList.add('warning');
    controls.style.display = 'flex';
    recordBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
    stopBtn.disabled = false;
    canvasOverlay.style.display = 'flex';
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = onRecordingStop;
  mediaRecorder.start();

  recording = true;
  controls.style.display = 'flex';
  recordBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  stopBtn.disabled = false;

  const startTime = performance.now();
  elapsedInterval = setInterval(() => {
    const rec = recordingStatus(performance.now() - startTime, settings.timeLimitSeconds);
    status.textContent = `เหลือเวลาอีก... ${rec.remainingSeconds} วิ ในการอัด`;
    status.classList.toggle('warning', rec.warning);
  }, 250);

  recordTimeout = setTimeout(stopRecording, settings.timeLimitSeconds * 1000);
}

stopBtn.addEventListener('click', stopRecording);

function stopRecording() {
  if (!recording) return;
  clearTimeout(recordTimeout);
  clearInterval(elapsedInterval);
  status.classList.remove('warning');
  recording = false;
  mediaRecorder.stop();
}

function onRecordingStop() {
  stopCamera();
  document.body.classList.remove('recording-active');

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  const filename = buildFilename(mimeType, new Date(), sanitizeName(guestName));
  const url = URL.createObjectURL(blob);

  previewVideo.src = url;
  // The `muted`/`loop` HTML attributes alone are unreliable when src is set
  // dynamically on an already-existing element (vs. a fresh page load) —
  // calling play() explicitly is the reliable trigger. Muted is required
  // for any browser to allow this without a user gesture. No `controls`
  // attribute deliberately: this plays as a continuous silent loop, and
  // Safari's native controls chrome (a dark overlay with big play/pause +
  // skip-10s buttons) doesn't fit that — it showed on autoplay-start even
  // without a tap. Swallow rejection (e.g. a very locked-down browser) —
  // the guest just sees the first frame instead of a moving preview.
  previewVideo.play().catch(() => {});
  downloadLink.href = url;
  downloadLink.download = filename;
  uploadStatus.textContent = 'กำลังส่งคลิป...';
  result.style.display = 'flex';

  setupSaveToPhotos(blob, filename);

  controls.style.display = 'none';
  recordBtn.style.display = 'inline-flex';
  stopBtn.style.display = 'none';
  stopBtn.disabled = false;

  uploadClip(blob, filename);
}

// "Save to Photos" via the Web Share API: the native share sheet has
// "Save Video" (iOS) / gallery targets (Android). Only mp4 clips are
// accepted by photo galleries — with webm, the share button stays hidden
// and the plain download link is the only option. The reference design
// shows a single "โหลดคลิป" pill either way — one visible action button,
// not both at once — so the two elements are mutually exclusive here.
function setupSaveToPhotos(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  saveBtn.style.display = canShare ? 'inline-flex' : 'none';
  downloadLink.style.display = canShare ? 'none' : 'inline-flex';
  if (!canShare) return;
  saveBtn.onclick = async () => {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      // guest closing the share sheet is normal — only log real failures
      if (err.name === 'AbortError') return;
      // Mac Safari (confirmed): canShare() can report true and share()
      // still rejects for this file — a known WebKit desktop quirk, not
      // something we can detect ahead of time. The old 3-button layout
      // always kept Download visible as a backup for exactly this kind of
      // failure; the merged single-button design needs to fall back to it
      // explicitly instead of leaving the guest with a button that does
      // nothing. .click() is best-effort (Safari can be picky about a
      // click fired after an await) — either way the button is now the
      // working download link if they tap it themselves.
      console.error('share failed, falling back to download:', err);
      saveBtn.style.display = 'none';
      downloadLink.style.display = 'inline-flex';
      downloadLink.click();
    }
  };
}

// iOS Safari can fail fetch() uploads whose body is a Blob fresh from
// MediaRecorder ("Load failed") — converting to an ArrayBuffer first is
// the reliable workaround. Retries cover flaky venue Wi-Fi on top.
async function uploadClip(blob, filename) {
  try {
    const buffer = await blob.arrayBuffer();
    const { error } = await withRetries(
      () => supabase.storage.from('clips').upload(filename, buffer, {
        contentType: mimeType || 'video/webm'
      }),
      { attempts: 3 }
    );
    uploadStatus.textContent = error
      ? 'ไม่สามารถส่งคลิปได้ กรุณาลองใหม่'
      : 'ส่งคลิปถึงบ่าวสาวเรียบร้อย 🎉';
    if (error) console.error('upload failed:', error.message);

    if (!error) {
      // record the guest's name EXACTLY as typed (Thai/emoji intact) —
      // the storage filename above had to be sanitized to ASCII
      const { error: dbError } = await supabase.from('clips').insert({
        guest_name: guestName.trim() || 'Guest',
        storage_path: filename
      });
      if (dbError) console.error('clip record insert failed:', dbError.message);
    }
  } catch (err) {
    uploadStatus.textContent = 'ไม่สามารถส่งคลิปได้ กรุณาลองใหม่';
    console.error('upload failed:', err);
  }
}

// "Record again" now returns all the way to the entry screen so the guest
// re-enters their name, rather than restarting the camera straight into
// the recording view with the previous name still attached — the camera
// only starts again once they hit Start, same as the very first time.
retryBtn.addEventListener('click', () => {
  result.style.display = 'none';
  nameInput.value = '';
  refreshStartButton();
  entry.style.display = 'flex';
});
