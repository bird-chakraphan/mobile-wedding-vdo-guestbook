import { describe, it, expect } from 'vitest';
import { OUTPUT_PRESETS, presetKeyFor } from './outputPresets.js';

describe('OUTPUT_PRESETS', () => {
  it('includes the three sizes CONTEXT.md specifies', () => {
    expect(OUTPUT_PRESETS['portrait-1080']).toEqual({ label: expect.any(String), width: 1080, height: 1920 });
    expect(OUTPUT_PRESETS['portrait-720']).toEqual({ label: expect.any(String), width: 720, height: 1280 });
    expect(OUTPUT_PRESETS['square']).toEqual({ label: expect.any(String), width: 1080, height: 1080 });
  });
});

describe('presetKeyFor', () => {
  it('finds the matching preset key for known dimensions', () => {
    expect(presetKeyFor(1080, 1920)).toBe('portrait-1080');
    expect(presetKeyFor(720, 1280)).toBe('portrait-720');
    expect(presetKeyFor(1080, 1080)).toBe('square');
  });

  it('falls back to the default preset for unrecognized dimensions', () => {
    expect(presetKeyFor(999, 999)).toBe('portrait-1080');
  });
});
