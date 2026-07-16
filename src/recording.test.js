import { describe, it, expect } from 'vitest';
import { pickMimeType, buildFilename, withRetries, MIME_CANDIDATES } from './recording.js';

describe('pickMimeType', () => {
  it('prefers mp4 (H.264) over webm whenever the device can record it — mp4 is the only format phone photo galleries accept', () => {
    const isSupported = (type) => type.startsWith('video/mp4') || type.startsWith('video/webm');
    expect(pickMimeType(isSupported, MIME_CANDIDATES)).toMatch(/^video\/mp4/);
  });

  it('falls back to webm when the browser cannot record mp4', () => {
    const isSupported = (type) => type.startsWith('video/webm');
    expect(pickMimeType(isSupported, MIME_CANDIDATES)).toMatch(/^video\/webm/);
  });

  it('returns empty string when nothing in the list is supported', () => {
    expect(pickMimeType(() => false, MIME_CANDIDATES)).toBe('');
  });
});

describe('buildFilename', () => {
  it('uses a .webm extension for webm mime types', () => {
    const name = buildFilename('video/webm;codecs=vp9,opus', new Date('2026-07-16T10:00:00Z'));
    expect(name).toMatch(/^Guest_.*\.webm$/);
  });

  it('uses a .mp4 extension for iOS Safari mp4 recordings', () => {
    const name = buildFilename('video/mp4', new Date('2026-07-16T10:00:00Z'));
    expect(name).toMatch(/^Guest_.*\.mp4$/);
  });
});

describe('withRetries', () => {
  const noSleep = () => Promise.resolve();

  it('returns the result immediately when the first attempt succeeds', async () => {
    let calls = 0;
    const result = await withRetries(async () => { calls++; return { data: 'ok', error: null }; }, { sleep: noSleep });
    expect(result.error).toBeNull();
    expect(result.data).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries after a failure and succeeds on a later attempt', async () => {
    let calls = 0;
    const result = await withRetries(async () => {
      calls++;
      return calls < 3 ? { data: null, error: { message: 'network flake' } } : { data: 'ok', error: null };
    }, { attempts: 3, sleep: noSleep });
    expect(result.error).toBeNull();
    expect(result.data).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the configured attempts and returns the last error', async () => {
    let calls = 0;
    const result = await withRetries(async () => {
      calls++;
      return { data: null, error: { message: 'still down' } };
    }, { attempts: 3, sleep: noSleep });
    expect(result.error.message).toBe('still down');
    expect(calls).toBe(3);
  });
});
