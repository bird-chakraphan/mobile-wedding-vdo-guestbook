import { describe, it, expect } from 'vitest';
import { vCurveAt, nCurveAt, computeWarpStrips } from './faceWarp.js';

describe('vCurveAt', () => {
  it('is zero above the cheekbones', () => {
    expect(vCurveAt(200, 300, 500, 536)).toBe(0);
  });

  it('is zero right at the cheekbones and ramps toward the chin', () => {
    expect(vCurveAt(300, 300, 500, 536)).toBe(0);
    const mid = vCurveAt(400, 300, 500, 536);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('peaks at 1 at the chin', () => {
    expect(vCurveAt(500, 300, 500, 536)).toBe(1);
  });

  it('fades out below the chin, reaching 0 at y1', () => {
    const belowChin = vCurveAt(518, 300, 500, 536);
    expect(belowChin).toBeGreaterThan(0);
    expect(belowChin).toBeLessThan(1);
    expect(vCurveAt(536, 300, 500, 536)).toBe(0);
  });
});

describe('nCurveAt', () => {
  it('is zero at the very top (start of feather)', () => {
    expect(nCurveAt(60, 60, 536)).toBe(0);
  });

  it('is zero at the very bottom (end of feather)', () => {
    expect(nCurveAt(536, 60, 536)).toBe(0);
  });

  it('is full strength across the flat middle of the face', () => {
    expect(nCurveAt(298, 60, 536)).toBe(1);
  });

  it('is feathered (between 0 and 1) partway into the top feather zone', () => {
    const total = 536 - 60;
    const y = 60 + total * 0.075; // half of the 15% feather zone
    expect(nCurveAt(y, 60, 536)).toBeCloseTo(0.5, 5);
  });
});

describe('computeWarpStrips', () => {
  // vw=vh=1000: cheeks at y=300 (x=0.3/0.7 -> faceW=400px), chin at
  // y=500 (x=0.5), forehead at y=100 (x=0.5) — chosen so cheekY..chinY
  // is a clean multiple of the 4px strip height.
  function makeLandmarks() {
    const landmarks = new Array(468).fill({ x: 0, y: 0 });
    landmarks[234] = { x: 0.3, y: 0.3 }; // left cheek
    landmarks[454] = { x: 0.7, y: 0.3 }; // right cheek
    landmarks[152] = { x: 0.5, y: 0.5 }; // chin
    landmarks[10] = { x: 0.5, y: 0.1 };  // forehead
    return landmarks;
  }

  it('returns no strips when both strengths are zero', () => {
    expect(computeWarpStrips(makeLandmarks(), 0, 0, 1000, 1000)).toEqual([]);
  });

  it('returns no strips for a degenerate/too-close-together face', () => {
    const landmarks = new Array(468).fill({ x: 0, y: 0 });
    landmarks[234] = { x: 0.5, y: 0.3 };
    landmarks[454] = { x: 0.5009, y: 0.3 }; // faceW = 0.9px, below the 10px floor
    landmarks[152] = { x: 0.5, y: 0.5 };
    landmarks[10] = { x: 0.5, y: 0.1 };
    expect(computeWarpStrips(landmarks, 1, 1, 1000, 1000)).toEqual([]);
  });

  it('omits imperceptible strips near the cheekbones (inset < 0.4px)', () => {
    const strips = computeWarpStrips(makeLandmarks(), 1, 0, 1000, 1000);
    expect(strips.some(s => s.y === 300)).toBe(false); // vCurve=0 at cheekY itself
    for (const s of strips) expect(s.inset).toBeGreaterThanOrEqual(0.4);
  });

  it('V-shape strips start at the cheekbones and squeeze more toward the chin', () => {
    const strips = computeWarpStrips(makeLandmarks(), 1, 0, 1000, 1000);
    expect(strips[0].y).toBeGreaterThanOrEqual(300);
    const atChin = strips.find(s => s.y === 500);
    expect(atChin).toBeDefined();
    expect(atChin.inset).toBeCloseTo(1 * 0.055 * 1 * 400, 0); // vStrength * k * vCurve(1) * faceW
    expect(atChin.inset).toBeGreaterThan(strips[0].inset);
  });

  it('narrow strips start above the cheekbones (feathered from the forehead)', () => {
    const strips = computeWarpStrips(makeLandmarks(), 0, 1, 1000, 1000);
    expect(strips[0].y).toBeLessThan(300);
  });
});
