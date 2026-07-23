import { describe, it, expect } from 'vitest';
import {
  isMiniHeart, isFingerCurled, isFingerExtended, isOpenPalm, isPointingUp, isPeace,
  detectGesture, gesturePlacement, fingertipUnit, majorityHandedness, majorityBoolean,
  gestureHintText, GESTURE_OPTIONS
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
// Landmark 7 (index DIP) is set in each: tip #8 -> #7 is X, the unit every
// graphic is sized from. At vw=vh=100 each fixture below gives X = 10.
const OPEN_PALM = {
  0: { x: 0.5, y: 0.9 },   // wrist
  9: { x: 0.5, y: 0.6 },   // middle MCP
  5: { x: 0.4, y: 0.6 }, 13: { x: 0.6, y: 0.6 }, 17: { x: 0.65, y: 0.62 }, // MCPs
  6: { x: 0.45, y: 0.55 }, 7: { x: 0.45, y: 0.3 }, 8: { x: 0.45, y: 0.2 }, // index PIP/DIP/tip
  10: { x: 0.5, y: 0.55 }, 12: { x: 0.5, y: 0.15 },  // middle
  14: { x: 0.55, y: 0.55 }, 16: { x: 0.55, y: 0.2 }, // ring
  18: { x: 0.6, y: 0.55 }, 20: { x: 0.6, y: 0.25 },  // pinky
};
// Index up, the other three folded back toward the wrist.
const POINT_UP = {
  0: { x: 0.5, y: 0.9 }, 9: { x: 0.5, y: 0.6 },
  6: { x: 0.5, y: 0.55 }, 7: { x: 0.5, y: 0.25 }, 8: { x: 0.5, y: 0.15 }, // index extended
  10: { x: 0.5, y: 0.55 }, 12: { x: 0.5, y: 0.8 },   // middle curled
  14: { x: 0.5, y: 0.55 }, 16: { x: 0.5, y: 0.8 },   // ring curled
  18: { x: 0.5, y: 0.55 }, 20: { x: 0.5, y: 0.8 },   // pinky curled
};
// Index + middle up, ring + pinky folded.
const PEACE = {
  0: { x: 0.5, y: 0.9 }, 9: { x: 0.5, y: 0.6 },
  6: { x: 0.45, y: 0.55 }, 7: { x: 0.42, y: 0.25 }, 8: { x: 0.42, y: 0.15 }, // index extended
  10: { x: 0.55, y: 0.55 }, 12: { x: 0.58, y: 0.15 },// middle extended
  14: { x: 0.5, y: 0.55 }, 16: { x: 0.5, y: 0.8 },   // ring curled
  18: { x: 0.5, y: 0.55 }, 20: { x: 0.5, y: 0.8 },   // pinky curled
};
// Thumb tip crossing index tip — only the points placement needs.
const MINI_HEART = {
  0: { x: 0.5, y: 0.9 }, 9: { x: 0.5, y: 0.6 },
  4: { x: 0.6, y: 0.36 },  // thumb tip
  7: { x: 0.5, y: 0.4 }, 8: { x: 0.5, y: 0.3 },  // index DIP/tip
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

describe('fingertipUnit', () => {
  it('measures X from the index tip to its first knuckle', () => {
    // tip (50,15) -> DIP (50,25) at vw=vh=100
    expect(fingertipUnit(landmarks(POINT_UP), 100, 100)).toBeCloseTo(10, 5);
  });
});

describe('gesturePlacement', () => {
  it('sizes every gesture to a 3X box, whatever the gesture', () => {
    for (const [type, fixture] of [
      ['point-up', POINT_UP], ['peace', PEACE], ['mini-heart', MINI_HEART], ['open-palm', OPEN_PALM]
    ]) {
      expect(gesturePlacement(type, landmarks(fixture), 100, 100).size).toBeCloseTo(30, 5);
    }
  });

  it('scales the box with the hand: X doubles -> box doubles', () => {
    const closer = { ...POINT_UP, 7: { x: 0.5, y: 0.35 } }; // tip->DIP now 20
    expect(gesturePlacement('point-up', landmarks(closer), 100, 100).size).toBeCloseTo(60, 5);
  });

  it('puts the point-up graphic bottom one X above the index fingertip', () => {
    const p = gesturePlacement('point-up', landmarks(POINT_UP), 100, 100);
    expect(p.x).toBeCloseTo(50, 5);        // centred on the fingertip
    expect(p.y).toBeCloseTo(15 - 10, 5);   // one X of clear air above the tip
  });

  it('puts the peace graphic bottom half the fingertip gap above the higher finger, centred between them', () => {
    // tips (42,15) and (58,15): gap 16 -> half is 8; midpoint x 50
    const p = gesturePlacement('peace', landmarks(PEACE), 100, 100);
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(15 - 8, 5);
  });

  it('lifts the peace graphic off whichever finger is higher, not their average', () => {
    // middle tip dropped to y=25; index (42,15) stays the higher one
    const uneven = { ...PEACE, 12: { x: 0.58, y: 0.25 } };
    const gap = Math.hypot(58 - 42, 25 - 15);
    const p = gesturePlacement('peace', landmarks(uneven), 100, 100);
    expect(p.y).toBeCloseTo(15 - gap / 2, 5);
  });

  it('applies the same two-finger construction to the mini heart, over thumb + index', () => {
    // index tip (50,30), thumb tip (60,36): gap sqrt(136), midpoint x 55, higher y 30
    const gap = Math.hypot(60 - 50, 36 - 30);
    const p = gesturePlacement('mini-heart', landmarks(MINI_HEART), 100, 100);
    expect(p.x).toBeCloseTo(55, 5);
    expect(p.y).toBeCloseTo(30 - gap / 2, 5);
  });

  it('anchors the open-palm graphic on the palm centre', () => {
    // centroid of wrist + MCPs (5,9,13,17): xs .5,.4,.5,.6,.65 -> .53; ys .9,.6,.6,.6,.62 -> .664
    const p = gesturePlacement('open-palm', landmarks(OPEN_PALM), 100, 100);
    expect(p.x).toBeCloseTo(53, 0);
    expect(p.y).toBeCloseTo(66.4, 0);
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

describe('gestureHintText', () => {
  it('names the staff-selected gesture so the guest hint matches what pops the graphic', () => {
    expect(gestureHintText('peace')).toBe('Make a peace sign ✌️ while recording to pop a graphic.');
    expect(gestureHintText('open-palm')).toBe('Make an open palm ✋ while recording to pop a graphic.');
    expect(gestureHintText('mini-heart')).toBe('Make a mini heart 🫰 while recording to pop a graphic.');
  });

  // point-up has a literal hintText override (Bird's real Thai copy from
  // the reference design) rather than the generic English template.
  it('uses the literal Thai hint for point-up', () => {
    expect(gestureHintText('point-up')).toBe('ลองชี้นิ้วขึ้นกลางอากาศดู\n☝มือซ้ายทีมอิท · มือขวาทีมโบ👆');
  });

  // Matches detectGesture's default: an unknown/absent gesture_type behaves
  // as mini-heart, so the hint must not disagree with what is detected.
  it('falls back to the default gesture for an unknown type', () => {
    expect(gestureHintText('nonsense')).toBe(gestureHintText(GESTURE_OPTIONS[0].value));
    expect(gestureHintText(undefined)).toBe(gestureHintText(GESTURE_OPTIONS[0].value));
  });

  it('has non-empty hint wording for every staff-selectable gesture', () => {
    for (const option of GESTURE_OPTIONS) {
      expect(gestureHintText(option.value).length).toBeGreaterThan(0);
    }
  });

  it('every option without a literal hintText override still follows the English template', () => {
    for (const option of GESTURE_OPTIONS) {
      if (option.hintText) continue;
      expect(gestureHintText(option.value)).toMatch(/^Make .+ while recording to pop a graphic\.$/);
    }
  });
});
