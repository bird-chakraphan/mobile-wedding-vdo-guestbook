// Layout geometry for the ratio-locked camera preview box, shared by the
// guest page and the staff preview. The visible box matches the staff-chosen
// output ratio (9:16 portrait, 1:1 square, …) fitted inside the available
// space with an even edge gap — pure math so it's testable without a DOM.

// Edge gap between the preview box and the screen — a flat 24px minimum on
// every device, phones included (a tighter 12px tier used to apply to
// small screens; removed per Bird's explicit "minimum 24px on all sides").
export function edgePadding() {
  return 24;
}

// Largest ratioW:ratioH box that fits inside availW x availH (contain fit).
export function containBox(availW, availH, ratioW, ratioH) {
  if (availW <= 0 || availH <= 0) return { width: 0, height: 0 };
  const ratio = ratioW / ratioH;
  let width = availW;
  let height = width / ratio;
  if (height > availH) {
    height = availH;
    width = height * ratio;
  }
  return { width, height };
}

// The preview box for a given available area: fit the output ratio inside
// that area minus `pad` on every side, then centre it. `bottomPad` lets a
// caller reserve extra room below the box — e.g. for a control bar whose
// real height varies with font/content — without changing the top/side
// pad; it defaults to `pad` so the box stays symmetric (centred) when
// omitted. When it's explicitly larger than `pad`, the box is bottom-
// anchored instead of centred: its bottom edge sits exactly `bottomPad`
// above the reserved edge, giving an exact, predictable gap regardless of
// whether the box ends up width- or height-constrained (centring within
// the reduced band would otherwise split the slack and shrink the gap).
// Returns the box size plus its top-left offset within the area.
export function previewBox(availW, availH, ratioW, ratioH, pad, bottomPad = pad) {
  const box = containBox(availW - pad * 2, availH - pad - bottomPad, ratioW, ratioH);
  const y = bottomPad === pad
    ? (availH - box.height) / 2
    : Math.max(pad, availH - bottomPad - box.height);
  return {
    width: box.width,
    height: box.height,
    x: (availW - box.width) / 2,
    y
  };
}

// Fit an image of natural size natW x natH inside a boxSize x boxSize square
// while preserving its aspect ratio (contain) — keeps staff-uploaded gesture
// graphics from stretching to a square.
export function aspectFit(boxSize, natW, natH) {
  if (!natW || !natH) return { width: boxSize, height: boxSize };
  const scale = boxSize / Math.max(natW, natH);
  return { width: natW * scale, height: natH * scale };
}
