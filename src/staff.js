import { FaceLandmarker, HandLandmarker, FilesetResolver }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { supabase } from './supabaseClient.js';
import { loadSettings } from './settings.js';
import { OUTPUT_PRESETS, presetKeyFor } from './outputPresets.js';
import { buildSettingsPayload } from './staffSettingsForm.js';
import { isMiniHeart, majorityHandedness, majorityBoolean } from './gesture.js';
import { nextHeartState } from './heartAnimation.js';
import { computeWarpStrips } from './faceWarp.js';
import { shouldUseGraphicImage } from './gestureGraphic.js';
import { edgePadding, previewBox, aspectFit } from './previewLayout.js';

const passcodeGate = document.getElementById('passcodeGate');
const passcodeInput = document.getElementById('passcodeInput');
const unlockBtn = document.getElementById('unlockBtn');
const workspace = document.getElementById('workspace');
const form = document.getElementById('settingsForm');
const timeLimitInput = document.getElementById('timeLimitInput');
const smoothInput = document.getElementById('smoothInput');
const smoothVal = document.getElementById('smoothVal');
const glowInput = document.getElementById('glowInput');
const glowVal = document.getElementById('glowVal');
const vshapeInput = document.getElementById('vshapeInput');
const vshapeVal = document.getElementById('vshapeVal');
const narrowInput = document.getElementById('narrowInput');
const narrowVal = document.getElementById('narrowVal');
const presetSelect = document.getElementById('presetSelect');
const status = document.getElementById('status');

// One entry per uploadable asset, tying its file input to a fixed slot
// filename in the 'assets' bucket (upsert on upload, so re-uploads replace
// rather than accumulate — see ADR-0003) and to its current-upload
// thumbnail + Remove button. `slot`/`handLabel` route changes to the live
// preview. `markedForRemoval`/`currentUrl` are mutated as staff edit.
const ASSET_FIELDS = [
  { slot: 'frame', handLabel: null, key: 'frameUrl', filename: 'frame' },
  { slot: 'gesture', handLabel: 'Left', key: 'gestureLeftUrl', filename: 'gesture-left' },
  { slot: 'gesture', handLabel: 'Right', key: 'gestureRightUrl', filename: 'gesture-right' }
].map(f => {
  const id = f.filename.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); // frame, gestureLeft, gestureRight
  return {
    ...f,
    input: document.getElementById(`${id}FileInput`),
    current: document.getElementById(`${id}Current`),
    preview: document.getElementById(`${id}Preview`),
    removeBtn: document.getElementById(`${id}RemoveBtn`),
    markedForRemoval: false,
    currentUrl: null
  };
});

function applyAssetToPreview(field, url) {
  if (field.slot === 'frame') loadFrameImage(url);
  else loadGestureImage(field.handLabel, url);
}

function showCurrent(field, url) {
  field.preview.src = url;
  field.current.style.display = 'flex';
}

function hideCurrent(field) {
  field.current.style.display = 'none';
}

// A fixed-slot URL is stable across re-uploads, so the browser would serve
// the cached old image — bust it for the in-page preview only (the saved DB
// URL stays clean so guests get a stable link).
function bustCache(url) {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

for (const field of ASSET_FIELDS) {
  field.removeBtn.addEventListener('click', () => {
    field.markedForRemoval = true;
    field.input.value = '';
    hideCurrent(field);
  });
  field.input.addEventListener('change', () => {
    const file = field.input.files[0];
    if (!file) return;
    field.markedForRemoval = false;
    showCurrent(field, URL.createObjectURL(file)); // preview the newly picked file
  });
}

/* ============================================================
   Live camera preview (issue #3) — a reduced port of main.js's
   guest render loop: same beauty pipeline, face reshape, and gesture
   graphics, but reading slider values LIVE from the form instead of
   from loadSettings(), and with no recording/countdown/name entry.
   Intentionally a port, not a shared module — the two loops differ
   enough in scope that forcing an abstraction now would be premature.
   ============================================================ */

const previewColumn = document.getElementById('previewColumn');
const previewVideo = document.getElementById('previewVideo');
const previewCanvas = document.getElementById('previewCanvas');
const viewToggle = document.getElementById('viewToggle');
const pctx = previewCanvas.getContext('2d');

// "Show detection" toggle: false = the composited output a guest sees
// (with frame); true = the hand-skeleton overlay for checking the model.
let debugView = false;

const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],        // thumb
  [0,5],[5,6],[6,7],[7,8],        // index finger
  [0,9],[9,10],[10,11],[11,12],   // middle finger
  [0,13],[13,14],[14,15],[15,16], // ring finger
  [0,17],[17,18],[18,19],[19,20]  // pinky
];

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

const HANDEDNESS_FLIPPED = false;
const HANDEDNESS_WINDOW = 8;
const GEOMETRY_WINDOW = 5;
const HEART_HEIGHT_MULTIPLIER = 1.1;
const HEART_SIZE_MULTIPLIER = 0.5;
const HEART_COLORS = { Right: '#ff3355', Left: '#ff9ecb' };

let faceLandmarker, handLandmarker, modelsReady = false;
let previewStream = null;

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
}

// Fails soft: if models can't load, the preview simply never starts —
// the settings form and save flow work regardless.
const modelsPromise = loadModels().catch(err => {
  console.error('staff preview: model loading failed:', err);
  return null;
});

const gestureImages = { Right: null, Left: null };

function loadGestureImage(label, url) {
  if (!url) { gestureImages[label] = null; return; }
  const img = new Image();
  const state = { url, loaded: false, failed: false, img };
  img.onload = () => { state.loaded = true; };
  img.onerror = () => { state.failed = true; };
  img.src = url;
  gestureImages[label] = state;
}

let frameImage = null;

function loadFrameImage(url) {
  if (!url) { frameImage = null; return; }
  const img = new Image();
  const state = { url, loaded: false, failed: false, img };
  img.onload = () => { state.loaded = true; };
  img.onerror = () => { state.failed = true; };
  img.src = url;
  frameImage = state;
}

// Counter-mirror the frame against the canvas's CSS selfie mirror so its
// text/logo reads correctly — matches the guest page (see main.js drawFrame).
function drawFrame(boxW, boxH) {
  if (!frameImage || !shouldUseGraphicImage(frameImage)) return;
  pctx.save();
  pctx.translate(boxW, 0);
  pctx.scale(-1, 1);
  pctx.drawImage(frameImage.img, 0, 0, boxW, boxH);
  pctx.restore();
}

function tracePath(c, landmarks, indices) {
  const vw = previewVideo.videoWidth, vh = previewVideo.videoHeight;
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

function toScreen(lm, vw, vh, cw, ch) {
  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;
  return { x: lm.x * vw * scale + offsetX, y: lm.y * vh * scale + offsetY };
}

function drawFaceWarp(strips, scale, dx, dy) {
  for (const { y, height, inset, fl, fr, wx0, wx1 } of strips) {
    const sx = x => dx + x * scale;
    const dyy = dy + y * scale;
    const dhh = height * scale + 0.6;
    pctx.drawImage(compCanvas, wx0, y, fl - wx0, height,
      sx(wx0), dyy, (fl + inset - wx0) * scale, dhh);
    pctx.drawImage(compCanvas, fl, y, fr - fl, height,
      sx(fl + inset), dyy, (fr - fl - 2 * inset) * scale, dhh);
    pctx.drawImage(compCanvas, fr, y, wx1 - fr, height,
      sx(fr - inset), dyy, (wx1 - fr + inset) * scale, dhh);
  }
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

const heartsByHand = { Right: null, Left: null };

function drawHearts() {
  for (const label of ['Right', 'Left']) {
    const h = heartsByHand[label];
    if (!h) continue;
    const size = Math.max(1, h.size);
    const graphic = gestureImages[label];
    pctx.save();
    pctx.globalAlpha = h.alpha;
    if (graphic && shouldUseGraphicImage(graphic)) {
      const { width, height } = aspectFit(size, graphic.img.naturalWidth, graphic.img.naturalHeight);
      pctx.drawImage(graphic.img, h.x - width / 2, h.y - height / 2, width, height);
    } else {
      pctx.fillStyle = HEART_COLORS[label];
      drawHeartPath(pctx, h.x, h.y, size);
      pctx.fill();
    }
    pctx.restore();
  }
}

// Detection-view overlay: hand landmarks + bones, green when the current
// geometry satisfies the mini-heart check (mirrors main.js's tuning aid).
function drawHandSkeleton(landmarks, vw, vh, matches) {
  const pts = landmarks.map(lm => toScreen(lm, vw, vh, previewCanvas.width, previewCanvas.height));
  pctx.strokeStyle = matches ? 'rgba(0,255,120,0.9)' : 'rgba(0,255,200,0.6)';
  pctx.lineWidth = 2;
  for (const [a, b] of HAND_BONES) {
    pctx.beginPath();
    pctx.moveTo(pts[a].x, pts[a].y);
    pctx.lineTo(pts[b].x, pts[b].y);
    pctx.stroke();
  }
  pts.forEach((p, i) => {
    const isPinchPoint = i === 4 || i === 8;
    pctx.fillStyle = isPinchPoint ? '#ff3d6e' : 'rgba(255,255,255,0.8)';
    pctx.beginPath();
    pctx.arc(p.x, p.y, isPinchPoint ? 7 : 4, 0, Math.PI * 2);
    pctx.fill();
  });
}

let lastVideoTime = -1;
let latestFaces = [];
let latestHands = [];
let latestHandedness = [];
const handednessHistory = [[], []];
const geometryHistory = [[], []];

function previewLoop() {
  if (previewVideo.currentTime !== lastVideoTime) {
    lastVideoTime = previewVideo.currentTime;
    try {
      const faceResult = faceLandmarker.detectForVideo(previewVideo, performance.now());
      latestFaces = faceResult.faceLandmarks || [];
    } catch (err) { console.warn('staff preview: face detection skipped:', err); }
    try {
      const handResult = handLandmarker.detectForVideo(previewVideo, performance.now());
      latestHands = handResult.landmarks || [];
      latestHandedness = handResult.handednesses || [];
    } catch (err) { console.warn('staff preview: hand detection skipped:', err); }
  }

  const vw = previewVideo.videoWidth, vh = previewVideo.videoHeight;
  if (!vw) { requestAnimationFrame(previewLoop); return; }

  // Preview box follows the CURRENTLY SELECTED output ratio (live, not the
  // saved value) so changing the preset reshapes the preview immediately.
  const preset = OUTPUT_PRESETS[presetSelect.value] || { width: 1080, height: 1920 };
  const pad = edgePadding(window.innerWidth);
  const box = previewBox(previewColumn.clientWidth, previewColumn.clientHeight,
    preset.width, preset.height, pad);
  previewCanvas.width = Math.round(box.width);
  previewCanvas.height = Math.round(box.height);
  const scale = Math.max(previewCanvas.width / vw, previewCanvas.height / vh);
  const dx = (previewCanvas.width - vw * scale) / 2;
  const dy = (previewCanvas.height - vh * scale) / 2;

  bctx.filter = 'blur(7px)';
  bctx.drawImage(previewVideo, 0, 0, vw, vh);
  bctx.filter = 'none';

  buildMask(latestFaces);

  sctx.clearRect(0, 0, vw, vh);
  sctx.drawImage(blurCanvas, 0, 0);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(maskCanvas, 0, 0);
  sctx.globalCompositeOperation = 'source-over';

  const glow = glowInput.value / 100;
  const smooth = smoothInput.value / 100;
  cctx.filter = `brightness(${1 + glow * 0.12}) saturate(${1 + glow * 0.15}) contrast(${1 - glow * 0.05})`;
  cctx.drawImage(previewVideo, 0, 0, vw, vh);
  cctx.filter = 'none';
  cctx.globalAlpha = smooth * 0.85;
  cctx.drawImage(skinCanvas, 0, 0);
  cctx.globalAlpha = 1;

  pctx.drawImage(compCanvas, dx, dy, vw * scale, vh * scale);

  const vshape = vshapeInput.value / 100;
  const narrow = narrowInput.value / 100;
  if (vshape > 0 || narrow > 0) {
    for (const landmarks of latestFaces) {
      drawFaceWarp(computeWarpStrips(landmarks, vshape, narrow, vw, vh), scale, dx, dy);
    }
  }

  const tips = { Right: null, Left: null };
  latestHands.forEach((landmarks, i) => {
    let rawLabel = latestHandedness[i]?.[0]?.categoryName || '';
    if (HANDEDNESS_FLIPPED) rawLabel = rawLabel === 'Left' ? 'Right' : 'Left';

    const history = handednessHistory[i] || (handednessHistory[i] = []);
    history.push(rawLabel);
    if (history.length > HANDEDNESS_WINDOW) history.shift();
    const label = majorityHandedness(history);

    const rawMatchesGeometry = isMiniHeart(landmarks, vw, vh);
    const geomHistory = geometryHistory[i] || (geometryHistory[i] = []);
    geomHistory.push(rawMatchesGeometry);
    if (geomHistory.length > GEOMETRY_WINDOW) geomHistory.shift();
    const matchesGeometry = majorityBoolean(geomHistory);

    if ((label === 'Right' || label === 'Left') && matchesGeometry) {
      const thumbTip = toScreen(landmarks[4], vw, vh, previewCanvas.width, previewCanvas.height);
      const indexTip = toScreen(landmarks[8], vw, vh, previewCanvas.width, previewCanvas.height);
      const anchor = thumbTip.y < indexTip.y ? thumbTip : indexTip;
      const wristPt = toScreen(landmarks[0], vw, vh, previewCanvas.width, previewCanvas.height);
      const middleMcpPt = toScreen(landmarks[9], vw, vh, previewCanvas.width, previewCanvas.height);
      const handSpan = Math.hypot(wristPt.x - middleMcpPt.x, wristPt.y - middleMcpPt.y) || 1;
      tips[label] = {
        x: anchor.x,
        y: anchor.y - handSpan * HEART_HEIGHT_MULTIPLIER,
        size: handSpan * HEART_SIZE_MULTIPLIER
      };
    }

    if (debugView) drawHandSkeleton(landmarks, vw, vh, matchesGeometry);
  });

  for (const label of ['Right', 'Left']) {
    heartsByHand[label] = nextHeartState(heartsByHand[label], {
      active: tips[label] !== null,
      x: tips[label]?.x, y: tips[label]?.y, size: tips[label]?.size
    });
  }
  drawHearts();

  // Frame overlay only in the "actual" view — the detection view keeps the
  // skeleton unobstructed.
  if (!debugView) drawFrame(previewCanvas.width, previewCanvas.height);

  requestAnimationFrame(previewLoop);
}

async function startPreviewCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    previewStream = stream;
    previewVideo.srcObject = stream;
    await previewVideo.play();
    for (const c of [blurCanvas, maskCanvas, skinCanvas, compCanvas]) {
      c.width = previewVideo.videoWidth; c.height = previewVideo.videoHeight;
    }
    previewCanvas.style.display = 'block';
    requestAnimationFrame(previewLoop);
  } catch (err) {
    console.error('staff preview: camera failed:', err);
  }
}

// Courtesy cleanup — staff sessions are short-lived so there's no
// explicit stop button, but release the camera hardware on tab close
// the same way the guest page does at true end-of-recording.
window.addEventListener('beforeunload', () => {
  if (previewStream) previewStream.getTracks().forEach(t => t.stop());
});

for (const [key, preset] of Object.entries(OUTPUT_PRESETS)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = preset.label;
  presetSelect.appendChild(option);
}

let passcode = '';

async function populateForm() {
  const settings = await loadSettings(supabase);
  timeLimitInput.value = settings.timeLimitSeconds;
  smoothInput.value = settings.beautySmooth;
  smoothVal.textContent = settings.beautySmooth;
  glowInput.value = settings.beautyGlow;
  glowVal.textContent = settings.beautyGlow;
  vshapeInput.value = settings.beautyVshape;
  vshapeVal.textContent = settings.beautyVshape;
  narrowInput.value = settings.beautyNarrow;
  narrowVal.textContent = settings.beautyNarrow;
  presetSelect.value = presetKeyFor(settings.outputWidth, settings.outputHeight);

  // Drive the live preview and show each asset's current upload (with its
  // Remove button) or hide the row when nothing is set yet.
  for (const field of ASSET_FIELDS) {
    field.currentUrl = settings[field.key] || null;
    field.markedForRemoval = false;
    field.input.value = '';
    applyAssetToPreview(field, field.currentUrl);
    if (field.currentUrl) showCurrent(field, field.currentUrl);
    else hideCurrent(field);
  }
}

smoothInput.addEventListener('input', () => { smoothVal.textContent = smoothInput.value; });
glowInput.addEventListener('input', () => { glowVal.textContent = glowInput.value; });
vshapeInput.addEventListener('input', () => { vshapeVal.textContent = vshapeInput.value; });
narrowInput.addEventListener('input', () => { narrowVal.textContent = narrowInput.value; });

viewToggle.addEventListener('click', () => {
  debugView = !debugView;
  viewToggle.textContent = debugView ? 'Show actual' : 'Show detection';
});

unlockBtn.addEventListener('click', async () => {
  passcode = passcodeInput.value;
  if (!passcode) return;
  passcodeGate.style.display = 'none';
  workspace.style.display = 'flex';
  status.textContent = '';
  await populateForm();
  await modelsPromise;
  if (modelsReady) startPreviewCamera();
});

// Resolves the asset-URL changes for a save: uploads any newly-picked files
// (minting one passcode token to gate the writes) and marks removed assets
// with '' (the RPC's clear sentinel). Assets left untouched are omitted, so
// the RPC keeps their current value. Returns { frameUrl?, gestureLeftUrl?,
// gestureRightUrl? }.
async function resolveAssetChanges() {
  const uploads = ASSET_FIELDS.filter(f => f.input.files[0]);
  const removals = ASSET_FIELDS.filter(f => !f.input.files[0] && f.markedForRemoval);

  const changes = {};

  if (uploads.length) {
    const { error: tokenError } = await supabase.rpc('mint_upload_token', { p_passcode: passcode });
    if (tokenError) throw new Error(`invalid passcode (${tokenError.message})`);
    for (const field of uploads) {
      const file = field.input.files[0];
      const { error } = await supabase.storage.from('assets').upload(field.filename, file, {
        upsert: true,
        contentType: file.type
      });
      if (error) throw new Error(`${field.filename} upload failed (${error.message})`);
      changes[field.key] = supabase.storage.from('assets').getPublicUrl(field.filename).data.publicUrl;
    }
  }

  for (const field of removals) changes[field.key] = '';

  return changes;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const preset = OUTPUT_PRESETS[presetSelect.value];

  status.textContent = 'Saving…';
  let assetChanges;
  try {
    assetChanges = await resolveAssetChanges();
  } catch (err) {
    status.textContent = `Save failed: ${err.message}`;
    return;
  }

  const payload = buildSettingsPayload(passcode, {
    timeLimitSeconds: Number(timeLimitInput.value),
    beautySmooth: Number(smoothInput.value),
    beautyGlow: Number(glowInput.value),
    beautyVshape: Number(vshapeInput.value),
    beautyNarrow: Number(narrowInput.value),
    outputWidth: preset.width,
    outputHeight: preset.height,
    ...assetChanges
  });

  const { error } = await supabase.rpc('update_staff_settings', payload);
  if (error) {
    status.textContent = `Save failed: ${error.message}`;
    return;
  }

  // Reflect uploads and removals in the live preview + the current-upload
  // thumbnail immediately, so the page matches what a guest will now load.
  for (const field of ASSET_FIELDS) {
    if (field.input.files[0]) {
      const busted = bustCache(assetChanges[field.key]);
      field.currentUrl = busted;
      field.markedForRemoval = false;
      field.input.value = '';
      applyAssetToPreview(field, busted);
      showCurrent(field, busted);
    } else if (field.markedForRemoval) {
      field.currentUrl = null;
      field.markedForRemoval = false;
      applyAssetToPreview(field, null);
      hideCurrent(field);
    }
  }

  status.textContent = 'Saved ✓ — guest phones will use these settings on next load.';
});
