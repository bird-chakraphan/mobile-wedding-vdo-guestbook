import { describe, it, expect } from 'vitest';
import { edgePadding, containBox, previewBox, aspectFit } from './previewLayout.js';

describe('edgePadding', () => {
  it('uses 12px on small screens (<= 600px)', () => {
    expect(edgePadding(375)).toBe(12);
    expect(edgePadding(600)).toBe(12);
  });
  it('uses 24px on larger screens', () => {
    expect(edgePadding(601)).toBe(24);
    expect(edgePadding(1280)).toBe(24);
  });
});

describe('containBox', () => {
  it('is height-constrained for a portrait ratio in a square area', () => {
    expect(containBox(1000, 1000, 9, 16)).toEqual({ width: 562.5, height: 1000 });
  });
  it('is width-constrained for a landscape ratio in a square area', () => {
    expect(containBox(1000, 1000, 16, 9)).toEqual({ width: 1000, height: 562.5 });
  });
  it('fills a square ratio exactly', () => {
    expect(containBox(1000, 1000, 1, 1)).toEqual({ width: 1000, height: 1000 });
  });
  it('returns a zero box for a non-positive area', () => {
    expect(containBox(0, 500, 9, 16)).toEqual({ width: 0, height: 0 });
  });
});

describe('previewBox', () => {
  it('insets by the padding and centres the box', () => {
    // 400x800 area, portrait 9:16, 12px pad -> inner 376x776, width-limited
    const box = previewBox(400, 800, 9, 16, 12);
    expect(box.width).toBeCloseTo(376, 5);
    expect(box.height).toBeCloseTo(376 / (9 / 16), 5);
    expect(box.x).toBeCloseTo(12, 5); // touches the padding on the limiting axis
    expect(box.y).toBeCloseTo((800 - box.height) / 2, 5);
  });

  it('leaves at least the padding on every side', () => {
    const box = previewBox(1000, 500, 1, 1, 24);
    expect(box.width).toBeCloseTo(452, 5); // 500 - 48 = 452 (height-limited square)
    expect(box.x).toBeGreaterThanOrEqual(24);
    expect(box.y).toBeCloseTo(24, 5);
  });
});

describe('aspectFit', () => {
  it('preserves a wide image aspect within the size box', () => {
    expect(aspectFit(100, 200, 100)).toEqual({ width: 100, height: 50 });
  });
  it('preserves a tall image aspect within the size box', () => {
    expect(aspectFit(100, 100, 200)).toEqual({ width: 50, height: 100 });
  });
  it('falls back to a square when natural dimensions are unknown', () => {
    expect(aspectFit(100, 0, 0)).toEqual({ width: 100, height: 100 });
  });
});
