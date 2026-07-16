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
import { isMiniHeart, majorityHandedness, majorityBoolean } from './gesture.js';
import { pickMimeType, buildFilename, withRetries } from './recording.js';
import { nextHeartState } from './heartAnimation.js';

const RECORD_LIMIT_SECONDS = 15;

// Known risk (CONTEXT.md / TESTED-LEARNINGS.md): MediaPipe's handedness
// label may be swapped relative to what the guest sees in the mirrored
// selfie view. Confirmed NOT flipped on this Mac's Chrome (unflipped
// labels matched real hands). NOTE: desktop webcams and phone front
// cameras can differ in whether the raw stream is pre-mirrored — re-check
// this on the actual phone during Step 1's real-device test.
const HANDEDNESS_FLIPPED = false;

// Tuning aid for gesture detection — draws the 21 hand landmarks, bone
// connections, and live pinch/curl numbers on screen. Flip to false once
// the gesture feels reliable; not meant to ship to real guests.
const DEBUG_SKELETON = true;

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

// hardcoded defaults from the prototype's sliders — no Staff Page yet
const SMOOTH = 0.60;
const GLOW = 0.30;

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

  startBtn.disabled = false;
  startBtn.textContent = "Start camera";
}

loadModels().catch(err => {
  console.error('model loading failed:', err);
  startBtn.textContent = 'Loading failed — check internet & reload';
});

/* ---------- camera + mic ---------- */
let micTrack = null;

startBtn.addEventListener('click', async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: 1280, height: 720 },
    audio: true
  });
  video.srcObject = stream;
  await video.play();
  micTrack = stream.getAudioTracks()[0];

  for (const c of [blurCanvas, maskCanvas, skinCanvas, compCanvas]) {
    c.width = video.videoWidth; c.height = video.videoHeight;
  }

  startBtn.remove();
  controls.style.display = 'flex';
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
    octx.save();
    octx.globalAlpha = h.alpha;
    octx.fillStyle = HEART_COLORS[label];
    drawHeartPath(octx, h.x, h.y, Math.max(1, h.size));
    octx.fill();
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

// Heart placement/sizing, as multiples of the hand's own on-screen size
// (wrist-to-middle-knuckle span) — scales correctly whether the hand is
// close to the camera or far, on any screen size.
const HEART_HEIGHT_MULTIPLIER = 1.1;
const HEART_SIZE_MULTIPLIER = 0.5;

function loop() {
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

  out.width = window.innerWidth;
  out.height = window.innerHeight;
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

  cctx.filter = `brightness(${1 + GLOW * 0.12}) saturate(${1 + GLOW * 0.15}) contrast(${1 - GLOW * 0.05})`;
  cctx.drawImage(video, 0, 0, vw, vh);
  cctx.filter = 'none';
  cctx.globalAlpha = SMOOTH * 0.85;
  cctx.drawImage(skinCanvas, 0, 0);
  cctx.globalAlpha = 1;

  octx.drawImage(compCanvas, dx, dy, vw * scale, vh * scale);

  /* gesture detection: mini heart on either hand -> one floating heart
     per hand (right = red, left = pink) */
  let rightHandSeen = false, leftHandSeen = false;
  let debugLine = '';
  const tips = { Right: null, Left: null };

  latestHands.forEach((landmarks, i) => {
    let rawLabel = latestHandedness[i]?.[0]?.categoryName || '';
    if (HANDEDNESS_FLIPPED) rawLabel = rawLabel === 'Left' ? 'Right' : 'Left';

    const history = handednessHistory[i] || (handednessHistory[i] = []);
    history.push(rawLabel);
    if (history.length > HANDEDNESS_WINDOW) history.shift();
    const label = majorityHandedness(history);

    if (label === 'Right') rightHandSeen = true;
    if (label === 'Left') leftHandSeen = true;

    const rawMatchesGeometry = isMiniHeart(landmarks, vw, vh);
    const geomHistory = geometryHistory[i] || (geometryHistory[i] = []);
    geomHistory.push(rawMatchesGeometry);
    if (geomHistory.length > GEOMETRY_WINDOW) geomHistory.shift();
    const matchesGeometry = majorityBoolean(geomHistory);

    if ((label === 'Right' || label === 'Left') && matchesGeometry) {
      const thumbTip = toScreen(landmarks[4], vw, vh, out.width, out.height);
      const indexTip = toScreen(landmarks[8], vw, vh, out.width, out.height);
      const anchor = thumbTip.y < indexTip.y ? thumbTip : indexTip; // whichever finger is higher
      const wristPt = toScreen(landmarks[0], vw, vh, out.width, out.height);
      const middleMcpPt = toScreen(landmarks[9], vw, vh, out.width, out.height);
      const handSpan = Math.hypot(wristPt.x - middleMcpPt.x, wristPt.y - middleMcpPt.y) || 1;
      tips[label] = {
        x: anchor.x,
        y: anchor.y - handSpan * HEART_HEIGHT_MULTIPLIER,
        size: handSpan * HEART_SIZE_MULTIPLIER
      };
    }

    if (DEBUG_SKELETON) {
      drawHandSkeleton(landmarks, vw, vh, out.width, out.height, matchesGeometry);
      debugLine += ` [${label || '?'} geom:${matchesGeometry ? 'Y' : 'n'}]`;
    }
  });

  for (const label of ['Right', 'Left']) {
    heartsByHand[label] = nextHeartState(heartsByHand[label], {
      active: tips[label] !== null,
      x: tips[label]?.x, y: tips[label]?.y, size: tips[label]?.size
    });
  }
  drawHearts();

  const gestureActive = tips.Right !== null || tips.Left !== null;
  if (!recording) {
    let msg = 'Show a finger heart 🫰 with either hand';
    if (rightHandSeen || leftHandSeen) {
      msg += ` — hands seen: ${[rightHandSeen && 'Right', leftHandSeen && 'Left'].filter(Boolean).join(', ')}`;
    }
    if (gestureActive) msg = '💖 Gesture detected!';
    if (DEBUG_SKELETON) msg += debugLine;
    status.textContent = msg;
  }

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

recordBtn.addEventListener('click', () => {
  if (!micTrack) return;

  mimeType = pickMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
  const canvasStream = out.captureStream(30);
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    micTrack
  ]);

  chunks = [];
  mediaRecorder = new MediaRecorder(combined, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = onRecordingStop;
  mediaRecorder.start();

  recording = true;
  recordBtn.style.display = 'none';
  stopBtn.style.display = 'inline-block';

  const startTime = performance.now();
  elapsedInterval = setInterval(() => {
    const elapsed = Math.floor((performance.now() - startTime) / 1000);
    status.textContent = `Recording… ${elapsed}s / ${RECORD_LIMIT_SECONDS}s`;
  }, 250);

  recordTimeout = setTimeout(stopRecording, RECORD_LIMIT_SECONDS * 1000);
});

stopBtn.addEventListener('click', stopRecording);

function stopRecording() {
  if (!recording) return;
  clearTimeout(recordTimeout);
  clearInterval(elapsedInterval);
  recording = false;
  mediaRecorder.stop();
}

function onRecordingStop() {
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  const filename = buildFilename(mimeType);
  const url = URL.createObjectURL(blob);

  previewVideo.src = url;
  downloadLink.href = url;
  downloadLink.download = filename;
  uploadStatus.textContent = 'Uploading to the couple’s gallery…';
  result.style.display = 'flex';

  setupSaveToPhotos(blob, filename);

  controls.style.display = 'none';
  recordBtn.style.display = 'inline-block';
  stopBtn.style.display = 'none';

  uploadClip(blob, filename);
}

// "Save to Photos" via the Web Share API: the native share sheet has
// "Save Video" (iOS) / gallery targets (Android). Only mp4 clips are
// accepted by photo galleries — with webm, the button stays hidden and
// the plain download link remains the only option.
function setupSaveToPhotos(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  saveBtn.style.display = canShare ? 'inline-block' : 'none';
  if (!canShare) return;
  saveBtn.onclick = async () => {
    try {
      await navigator.share({ files: [file] });
    } catch (err) {
      // guest closing the share sheet is normal — only log real failures
      if (err.name !== 'AbortError') console.error('share failed:', err);
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
      ? `Upload failed after 3 tries (${error.message}) — your download still works, please save it.`
      : 'Uploaded ✓ — the couple will get this clip.';
    if (error) console.error('upload failed:', error.message);
  } catch (err) {
    uploadStatus.textContent = `Upload failed (${err.message}) — your download still works, please save it.`;
    console.error('upload failed:', err);
  }
}

retryBtn.addEventListener('click', () => {
  result.style.display = 'none';
  controls.style.display = 'flex';
});
