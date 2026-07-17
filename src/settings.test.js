import { describe, it, expect } from 'vitest';
import { loadSettings, SETTINGS_DEFAULTS } from './settings.js';

// Mock only the system boundary: a supabase-like client whose query
// resolves to the given { data, error } response.
function mockClient(response) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(response)
        })
      })
    })
  };
}

describe('loadSettings', () => {
  it('returns the staff-configured values when the DB row loads', async () => {
    const client = mockClient({
      data: {
        time_limit_seconds: 45,
        beauty_smooth: 80,
        beauty_glow: 10,
        beauty_vshape: 40,
        beauty_narrow: 25,
        output_width: 720,
        output_height: 1280,
        frame_url: 'https://example.com/frame.png',
        gesture_left_url: null,
        gesture_right_url: 'https://example.com/right.png'
      },
      error: null
    });
    const settings = await loadSettings(client);
    expect(settings.timeLimitSeconds).toBe(45);
    expect(settings.beautySmooth).toBe(80);
    expect(settings.beautyGlow).toBe(10);
    expect(settings.beautyVshape).toBe(40);
    expect(settings.beautyNarrow).toBe(25);
    expect(settings.outputWidth).toBe(720);
    expect(settings.frameUrl).toBe('https://example.com/frame.png');
    expect(settings.gestureLeftUrl).toBeNull();
    expect(settings.gestureRightUrl).toBe('https://example.com/right.png');
  });

  it('returns defaults when the query errors, so the guest page never breaks offline', async () => {
    const client = mockClient({ data: null, error: { message: 'network down' } });
    const settings = await loadSettings(client);
    expect(settings).toEqual(SETTINGS_DEFAULTS);
  });

  it('returns defaults when the query hangs longer than the timeout', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => new Promise(() => {}) // never resolves
          })
        })
      })
    };
    const settings = await loadSettings(client, { timeoutMs: 20 });
    expect(settings).toEqual(SETTINGS_DEFAULTS);
  });

  it('fills defaults for individual missing columns', async () => {
    const client = mockClient({ data: { time_limit_seconds: 30 }, error: null });
    const settings = await loadSettings(client);
    expect(settings.timeLimitSeconds).toBe(30);
    expect(settings.beautySmooth).toBe(SETTINGS_DEFAULTS.beautySmooth);
    expect(settings.beautyVshape).toBe(SETTINGS_DEFAULTS.beautyVshape);
    expect(settings.beautyNarrow).toBe(SETTINGS_DEFAULTS.beautyNarrow);
  });
});
