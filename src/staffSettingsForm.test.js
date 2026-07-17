import { describe, it, expect } from 'vitest';
import { buildSettingsPayload } from './staffSettingsForm.js';

describe('buildSettingsPayload', () => {
  it('shapes form values into the update_staff_settings RPC argument names', () => {
    const payload = buildSettingsPayload('changeme', {
      timeLimitSeconds: 45,
      beautySmooth: 70,
      beautyGlow: 20,
      beautyVshape: 35,
      beautyNarrow: 15,
      outputWidth: 720,
      outputHeight: 1280,
      gestureType: 'open-palm',
      gestureScale: 120,
      frameUrl: 'https://example.com/frame.png',
      gestureLeftUrl: 'https://example.com/left.png',
      gestureRightUrl: 'https://example.com/right.png'
    });
    expect(payload).toEqual({
      p_passcode: 'changeme',
      p_time_limit_seconds: 45,
      p_beauty_smooth: 70,
      p_beauty_glow: 20,
      p_beauty_vshape: 35,
      p_beauty_narrow: 15,
      p_output_width: 720,
      p_output_height: 1280,
      p_gesture_type: 'open-palm',
      p_gesture_scale: 120,
      p_frame_url: 'https://example.com/frame.png',
      p_gesture_left_url: 'https://example.com/left.png',
      p_gesture_right_url: 'https://example.com/right.png'
    });
  });

  it('leaves the asset URL params undefined when no new asset was uploaded, so the RPC keeps the existing value', () => {
    const payload = buildSettingsPayload('changeme', {
      timeLimitSeconds: 45,
      beautySmooth: 70,
      beautyGlow: 20,
      beautyVshape: 35,
      beautyNarrow: 15,
      outputWidth: 720,
      outputHeight: 1280
    });
    expect(payload.p_frame_url).toBeUndefined();
    expect(payload.p_gesture_left_url).toBeUndefined();
    expect(payload.p_gesture_right_url).toBeUndefined();
  });

  it('passes an empty-string asset URL straight through as the RPC clear sentinel', () => {
    const payload = buildSettingsPayload('changeme', {
      timeLimitSeconds: 45,
      beautySmooth: 70,
      beautyGlow: 20,
      beautyVshape: 35,
      beautyNarrow: 15,
      outputWidth: 720,
      outputHeight: 1280,
      frameUrl: ''
    });
    expect(payload.p_frame_url).toBe('');
  });
});
