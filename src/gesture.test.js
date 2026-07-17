import { describe, it, expect } from 'vitest';
import {
  isMiniHeart, isFingerCurled, isFingerExtended, isOpenPalm, isPointingUp, isPeace,
  detectGesture, gesturePlacement, majorityHandedness, majorityBoolean
} from './gesture.js';

// 21-point MediaPipe hand landmark array, all zeroed except the indices
// each test cares about (only those feed our geometry checks).
function landmarks(overrides) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  for (const [idx, point] of Object.entries(overrides)) lm[idx] = point;
  return lm;
}

describe('isMiniHeart', () => {
  it('detects a pinched thumb+index with the other three fingers curled', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },    // wrist
      9: { x: 0.5, y: 0.6 },    // middle MCP (hand-scale reference)
      4: { x: 0.55, y: 0.65 },  // thumb tip
      8: { x: 0.55, y: 0.65 },  // index tip — touching thumb tip
      10: { x: 0.5, y: 0.55 },  // middle PIP
      12: { x: 0.5, y: 0.85 },  // middle tip, curled back near wrist
      14: { x: 0.5, y: 0.55 },  // ring PIP
      16: { x: 0.5, y: 0.85 },  // ring tip, curled
      18: { x: 0.5, y: 0.55 },  // pinky PIP
      20: { x: 0.5, y: 0.85 },  // pinky tip, curled
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });

  it('rejects an open hand (fingers extended, thumb/index apart)', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      9: { x: 0.5, y: 0.6 },
      4: { x: 0.3, y: 0.7 },
      8: { x: 0.7, y: 0.3 },   // far from thumb tip — no pinch
      10: { x: 0.5, y: 0.45 },
      12: { x: 0.5, y: 0.2 },  // middle tip extended far from wrist
      14: { x: 0.52, y: 0.45 },
      16: { x: 0.55, y: 0.25 },
      18: { x: 0.55, y: 0.5 },
      20: { x: 0.6, y: 0.3 },
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(false);
  });

  it('still counts as a mini heart when only two of the three other fingers are curled (real hands rarely curl all three tightly)', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      9: { x: 0.5, y: 0.6 },
      4: { x: 0.55, y: 0.65 },
      8: { x: 0.55, y: 0.65 },
      10: { x: 0.5, y: 0.55 },
      12: { x: 0.5, y: 0.85 },  // middle curled
      14: { x: 0.5, y: 0.55 },
      16: { x: 0.5, y: 0.85 },  // ring curled
      18: { x: 0.5, y: 0.45 },
      20: { x: 0.5, y: 0.2 },   // pinky stays extended
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });

  it('tolerates a looser pinch than a perfect thumb/index touch', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      9: { x: 0.5, y: 0.6 },    // handScale = 0.3
      4: { x: 0.5, y: 0.65 },
      8: { x: 0.68, y: 0.65 },  // pinch = 0.18 (0.6x handScale — not touching)
      10: { x: 0.5, y: 0.55 },
      12: { x: 0.5, y: 0.85 },
      14: { x: 0.5, y: 0.55 },
      16: { x: 0.5, y: 0.85 },
      18: { x: 0.5, y: 0.55 },
      20: { x: 0.5, y: 0.85 },
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });

  it('still counts as a mini heart when only one of the three other fingers shows any curl (a natural hand rarely curls two tightly)', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      9: { x: 0.5, y: 0.6 },
      4: { x: 0.55, y: 0.65 },
      8: { x: 0.55, y: 0.65 },
      10: { x: 0.5, y: 0.55 },
      12: { x: 0.5, y: 0.85 },  // middle curled
      14: { x: 0.5, y: 0.45 },
      16: { x: 0.5, y: 0.2 },   // ring extended
      18: { x: 0.5, y: 0.45 },
      20: { x: 0.5, y: 0.2 },   // pinky extended
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });

  it('tolerates a wider gap between thumb and index than a near-touch (crossing fingers rarely touch exactly)', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      9: { x: 0.5, y: 0.6 },    // handScale = 0.3
      4: { x: 0.5, y: 0.65 },
      8: { x: 0.75, y: 0.65 },  // pinch = 0.25 (0.83x handScale)
      10: { x: 0.5, y: 0.55 },
      12: { x: 0.5, y: 0.85 },
      14: { x: 0.5, y: 0.55 },
      16: { x: 0.5, y: 0.85 },
      18: { x: 0.5, y: 0.55 },
      20: { x: 0.5, y: 0.85 },
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });

  it('detects the folded-finger heart when foreshortening puts the folded fingertips level with their middle joints (fingers pointing at the camera)', () => {
    // Geometry taken from the failing real-camera screenshots: folded
    // middle/ring/pinky point toward the lens, so their 2D tips sit
    // slightly ABOVE the knuckles — a knuckle-based curl check fails here.
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },    // wrist
      9: { x: 0.5, y: 0.6 },    // middle MCP (hand-scale reference)
      4: { x: 0.55, y: 0.62 },  // thumb tip
      8: { x: 0.55, y: 0.62 },  // index tip — pinched
      10: { x: 0.5, y: 0.55 },  // middle PIP
      12: { x: 0.5, y: 0.5 },   // middle tip — level with PIP, above MCP
      13: { x: 0.5, y: 0.6 },   // ring MCP
      14: { x: 0.5, y: 0.55 },  // ring PIP
      16: { x: 0.5, y: 0.5 },   // ring tip
      17: { x: 0.5, y: 0.62 },  // pinky MCP
      18: { x: 0.5, y: 0.55 },  // pinky PIP
      20: { x: 0.5, y: 0.5 },   // pinky tip
    });
    expect(isMiniHeart(lm, 1, 1)).toBe(true);
  });
});

describe('isFingerCurled', () => {
  it('is true when the fingertip sits closer to the wrist than its own middle joint', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },   // wrist
      10: { x: 0.5, y: 0.55 }, // middle joint (PIP)
      12: { x: 0.5, y: 0.85 }, // tip curled back toward the wrist
    });
    expect(isFingerCurled(lm, 12, 10, 1, 1)).toBe(true);
  });

  it('is false when the fingertip extends well past its middle joint', () => {
    const lm = landmarks({
      0: { x: 0.5, y: 0.9 },
      10: { x: 0.5, y: 0.5 },
      12: { x: 0.5, y: 0.1 }, // tip far beyond the PIP — extended finger
    });
    expect(isFingerCurled(lm, 12, 10, 1, 1)).toBe(false);
  });
});

// Fingers extended straight up (tips far above their PIPs), wrist at bottom.
const OPEN_PALM = {
  0: { x: 0.5, y: 0.9 },   // wrist
  9: { x: 0.5, y: 0.6 },   // middle MCP (hand span)
  5: { x: 0.4, y: 0.6 }, 13: { x: 0.6, y: 0.6 }, 17: { x: 0.65, y: 0.62 }, // MCPs
  6: { x: 0.45, y: 0.55 }, 8: { x: 0.45, y: 0.2 },   // index PIP/tip
  10: { x: 0.5, y: 0.55 }, 12: { x: 0.5, y: 0.15 },  // middle
  14: { x: 0.55, y: 0.55 }, 16: { x: 0.55, y: 0.2 }, // ring
  18: { x: 0.6, y: 0.55 }, 20: { x: 0.6, y: 0.25 },  // pinky
};
// Index up, the other three folded back toward the wrist.
const POINT_UP = {
  0: { x: 0.5, y: 0.9 }, 9: { x: 0.5, y: 0.6 },
  6: { x: 0.5, y: 0.55 }, 8: { x: 0.5, y: 0.15 },    // index extended
  10: { x: 0.5, y: 0.55 }, 12: { x: 0.5, y: 0.8 },   // middle curled
  14: { x: 0.5, y: 0.55 }, 16: { x: 0.5, y: 0.8 },   // ring curled
  18: { x: 0.5, y: 0.55 }, 20: { x: 0.5, y: 0.8 },   // pinky curled
};
// Index + middle up, ring + pinky folded.
const PEACE = {
  0: { x: 0.5, y: 0.9 }, 9: { x: 0.5, y: 0.6 },
  6: { x: 0.45, y: 0.55 }, 8: { x: 0.42, y: 0.15 },  // index extended
  10: { x: 0.55, y: 0.55 }, 12: { x: 0.58, y: 0.15 },// middle extended
  14: { x: 0.5, y: 0.55 }, 16: { x: 0.5, y: 0.8 },   // ring curled
  18: { x: 0.5, y: 0.55 }, 20: { x: 0.5, y: 0.8 },   // pinky curled
};

describe('isFingerExtended', () => {
  it('is true when the tip reaches well past its PIP joint', () => {
    const lm = landmarks({ 0: { x: 0.5, y: 0.9 }, 6: { x: 0.5, y: 0.55 }, 8: { x: 0.5, y: 0.15 } });
    expect(isFingerExtended(lm, 8, 6, 1, 1)).toBe(true);
  });
  it('is false for a folded finger whose tip sits near the PIP', () => {
    const lm = landmarks({ 0: { x: 0.5, y: 0.9 }, 6: { x: 0.5, y: 0.55 }, 8: { x: 0.5, y: 0.6 } });
    expect(isFingerExtended(lm, 8, 6, 1, 1)).toBe(false);
  });
});

describe('isOpenPalm', () => {
  it('detects all four fingers extended', () => {
    expect(isOpenPalm(landmarks(OPEN_PALM), 1, 1)).toBe(true);
  });
  it('rejects a pointing hand (only one finger up)', () => {
    expect(isOpenPalm(landmarks(POINT_UP), 1, 1)).toBe(false);
  });
});

describe('isPointingUp', () => {
  it('detects one finger up with the rest curled', () => {
    expect(isPointingUp(landmarks(POINT_UP), 1, 1)).toBe(true);
  });
  it('rejects an open palm', () => {
    expect(isPointingUp(landmarks(OPEN_PALM), 1, 1)).toBe(false);
  });
});

describe('isPeace', () => {
  it('detects two fingers up with ring and pinky curled', () => {
    expect(isPeace(landmarks(PEACE), 1, 1)).toBe(true);
  });
  it('rejects a single pointing finger', () => {
    expect(isPeace(landmarks(POINT_UP), 1, 1)).toBe(false);
  });
  it('rejects an open palm (ring/pinky not curled)', () => {
    expect(isPeace(landmarks(OPEN_PALM), 1, 1)).toBe(false);
  });
});

describe('detectGesture', () => {
  it('dispatches to the selected gesture detector', () => {
    expect(detectGesture('open-palm', landmarks(OPEN_PALM), 1, 1)).toBe(true);
    expect(detectGesture('point-up', landmarks(POINT_UP), 1, 1)).toBe(true);
    expect(detectGesture('peace', landmarks(PEACE), 1, 1)).toBe(true);
  });
  it('falls back to the mini heart for an unknown type', () => {
    expect(detectGesture('nonsense', landmarks(OPEN_PALM), 1, 1)).toBe(false);
  });
});

describe('gesturePlacement', () => {
  it('anchors the pointing graphic above the index fingertip', () => {
    // vw=vh=100: wrist (50,90), middleMcp (50,60) -> handSpan 30.
    const p = gesturePlacement('point-up', landmarks(POINT_UP), 100, 100);
    expect(p.x).toBeCloseTo(50, 5);       // index tip x
    expect(p.y).toBeCloseTo(15 - 33, 5);  // tip y (15) lifted by handSpan*1.1
    expect(p.size).toBeCloseTo(30 * 0.7, 5);
  });

  it('centres the open-palm graphic on the palm and sizes it to the hand', () => {
    const p = gesturePlacement('open-palm', landmarks(OPEN_PALM), 100, 100);
    // centroid of wrist + 4 MCPs (5,9,13,17): xs .5,.4,.5,.6,.65 -> .53; ys .9,.6,.6,.6,.62 -> .664
    expect(p.x).toBeCloseTo(53, 0);
    expect(p.y).toBeCloseTo(66.4, 0);
    expect(p.size).toBeCloseTo(30 * 1.7, 5);
  });

  it('places the peace graphic above the midpoint of the two raised fingers', () => {
    const p = gesturePlacement('peace', landmarks(PEACE), 100, 100);
    expect(p.x).toBeCloseTo((42 + 58) / 2, 5); // midpoint of index/middle tips
  });
});

describe('majorityHandedness', () => {
  it('picks the label that appears most often in the recent window', () => {
    expect(majorityHandedness(['Right', 'Left', 'Right', 'Right', 'Left'])).toBe('Right');
  });

  it('ignores empty entries from frames with no detection', () => {
    expect(majorityHandedness(['', 'Right', '', 'Right', 'Left'])).toBe('Right');
  });
});

describe('majorityBoolean', () => {
  it('is true when more than half of the recent frames matched (rejects single-frame flicker)', () => {
    expect(majorityBoolean([true, false, true, true, false])).toBe(true);
  });

  it('is false when most recent frames did not match', () => {
    expect(majorityBoolean([false, true, false, false, true])).toBe(false);
  });
});
