// V-shape / narrow face reshape — "slice and squeeze" strip warp, ported
// from beauty-filter-camera.html's proven `warpJaw`. This module computes
// the pure geometry (which horizontal strips to redraw, and by how much);
// the actual canvas drawImage calls stay in main.js, same split as
// heartAnimation.js (state) vs. drawHearts() (canvas).

const CHEEK_L = 234, CHEEK_R = 454, CHIN = 152, FOREHEAD = 10;
const STRIP_HEIGHT = 4;

function landmarkPoint(landmarks, index, vw, vh) {
  return { x: landmarks[index].x * vw, y: landmarks[index].y * vh };
}

// V-shape profile: 0 above the cheekbones, ramps toward the chin (t^1.4
// for a jaw-forward taper), then fades out below the chin.
export function vCurveAt(y, cheekY, chinY, y1) {
  if (y < cheekY) return 0;
  const t = Math.min((y - cheekY) / (chinY - cheekY), 1);
  return y <= chinY ? Math.pow(t, 1.4) : Math.max(0, 1 - (y - chinY) / (y1 - chinY));
}

// Narrow profile: flat across the whole face, feathered over the first/last
// 15% so the squeeze blends in instead of showing a hard edge.
export function nCurveAt(y, yTop, y1) {
  const total = y1 - yTop;
  const u = (y - yTop) / total;
  return Math.max(0, Math.min(1, Math.min(u / 0.15, 1) * Math.min((1 - u) / 0.15, 1)));
}

// Returns one { y, height, inset, fl, fr, wx0, wx1 } per horizontal strip
// worth redrawing (video-pixel space). Strips whose inset would be
// imperceptible (< 0.4px) are omitted entirely.
export function computeWarpStrips(landmarks, vStrength, nStrength, vw, vh) {
  if (vStrength <= 0 && nStrength <= 0) return [];

  const cheekL = landmarkPoint(landmarks, CHEEK_L, vw, vh);
  const cheekR = landmarkPoint(landmarks, CHEEK_R, vw, vh);
  const chin = landmarkPoint(landmarks, CHIN, vw, vh);
  const top = landmarkPoint(landmarks, FOREHEAD, vw, vh);

  const faceW = cheekR.x - cheekL.x;
  if (faceW < 10) return [];

  const cheekY = Math.min(cheekL.y, cheekR.y);
  const yTop = top.y - (chin.y - top.y) * 0.10;
  const y0 = nStrength > 0 ? yTop : cheekY;
  const y1 = chin.y + (chin.y - cheekY) * 0.18;

  const strips = [];
  for (let y = y0; y < y1; y += STRIP_HEIGHT) {
    const vCurve = vCurveAt(y, cheekY, chin.y, y1);
    const nCurve = nStrength > 0 ? nCurveAt(y, yTop, y1) : 0;
    const inset = (vStrength * 0.055 * vCurve + nStrength * 0.04 * nCurve) * faceW;
    if (inset < 0.4) continue;

    const tJaw = Math.max(0, Math.min((y - cheekY) / (chin.y - cheekY), 1));
    const fl = cheekL.x + (chin.x - faceW * 0.28 - cheekL.x) * tJaw;
    const fr = cheekR.x + (chin.x + faceW * 0.28 - cheekR.x) * tJaw;
    const pad = faceW * 0.4;
    const wx0 = Math.max(0, fl - pad);
    const wx1 = Math.min(vw, fr + pad);

    strips.push({ y, height: STRIP_HEIGHT, inset, fl, fr, wx0, wx1 });
  }
  return strips;
}
