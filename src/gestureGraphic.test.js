import { describe, it, expect } from 'vitest';
import { shouldUseGraphicImage } from './gestureGraphic.js';

describe('shouldUseGraphicImage', () => {
  it('falls back to the built-in heart when no URL is configured', () => {
    expect(shouldUseGraphicImage({ url: null, loaded: false, failed: false })).toBe(false);
  });

  it('falls back while a configured image is still loading, never a half-loaded frame', () => {
    expect(shouldUseGraphicImage({ url: 'https://x/y.png', loaded: false, failed: false })).toBe(false);
  });

  it('uses the image once it has finished loading successfully', () => {
    expect(shouldUseGraphicImage({ url: 'https://x/y.png', loaded: true, failed: false })).toBe(true);
  });

  it('falls back when the configured image failed to load, never a broken image', () => {
    expect(shouldUseGraphicImage({ url: 'https://x/y.png', loaded: false, failed: true })).toBe(false);
  });

  it('falls back if failed is somehow set alongside loaded (failed always wins)', () => {
    expect(shouldUseGraphicImage({ url: 'https://x/y.png', loaded: true, failed: true })).toBe(false);
  });

  it('falls back on an empty/missing state object', () => {
    expect(shouldUseGraphicImage({})).toBe(false);
    expect(shouldUseGraphicImage()).toBe(false);
  });
});
