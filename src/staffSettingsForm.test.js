import { describe, it, expect } from 'vitest';
import { buildSettingsPayload } from './staffSettingsForm.js';

describe('buildSettingsPayload', () => {
  it('shapes form values into the update_staff_settings RPC argument names', () => {
    const payload = buildSettingsPayload('changeme', {
      timeLimitSeconds: 45,
      beautySmooth: 70,
      beautyGlow: 20,
      outputWidth: 720,
      outputHeight: 1280
    });
    expect(payload).toEqual({
      p_passcode: 'changeme',
      p_time_limit_seconds: 45,
      p_beauty_smooth: 70,
      p_beauty_glow: 20,
      p_output_width: 720,
      p_output_height: 1280
    });
  });
});
