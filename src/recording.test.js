import { describe, it, expect } from 'vitest';
import { pickMimeType, buildFilename, withRetries, MIME_CANDIDATES } from './recording.js';

describe('pickMimeType', () => {
  it('prefers vp9 when the browser supports it', () => {
    const isSupported = (type) => type === 'video/webm;codecs=vp9,opus';
    expect(pickMimeType(isSupported, MIME_CANDIDATES)).toBe('video/webm;codecs=vp9,opus');
  });

  it('falls back to mp4 for iOS Safari, which only supports mp4', () => {
    const isSupported = (type) => type === 'video/mp4';
    expect(pickMimeType(isSupported, MIME_CANDIDATES)).toBe('video/mp4');
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
