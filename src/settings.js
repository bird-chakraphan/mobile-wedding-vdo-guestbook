// Staff settings, read by every guest phone on page load. One deep
// interface: loadSettings() always resolves to a complete settings
// object — DB values when reachable, these defaults otherwise — so the
// guest page never blocks or breaks on network problems.
//
// The passcode column is intentionally NOT selected here, and the DB
// grants anon column-level SELECT that excludes it (see setup.sql).

export const SETTINGS_DEFAULTS = {
  timeLimitSeconds: 60,
  beautySmooth: 60,
  beautyGlow: 30,
  outputWidth: 1080,
  outputHeight: 1920,
  frameUrl: null,
  gestureLeftUrl: null,
  gestureRightUrl: null
};

const COLUMNS =
  'time_limit_seconds,beauty_smooth,beauty_glow,output_width,output_height,frame_url,gesture_left_url,gesture_right_url';

export async function loadSettings(client, { timeoutMs = 4000 } = {}) {
  try {
    const query = client.from('staff_settings').select(COLUMNS).eq('id', 1).single();
    const timeout = new Promise(resolve =>
      setTimeout(() => resolve({ data: null, error: { message: 'settings load timed out' } }), timeoutMs)
    );
    const { data, error } = await Promise.race([Promise.resolve(query), timeout]);
    if (error || !data) return { ...SETTINGS_DEFAULTS };
    return {
      timeLimitSeconds: data.time_limit_seconds ?? SETTINGS_DEFAULTS.timeLimitSeconds,
      beautySmooth: data.beauty_smooth ?? SETTINGS_DEFAULTS.beautySmooth,
      beautyGlow: data.beauty_glow ?? SETTINGS_DEFAULTS.beautyGlow,
      outputWidth: data.output_width ?? SETTINGS_DEFAULTS.outputWidth,
      outputHeight: data.output_height ?? SETTINGS_DEFAULTS.outputHeight,
      frameUrl: data.frame_url ?? SETTINGS_DEFAULTS.frameUrl,
      gestureLeftUrl: data.gesture_left_url ?? SETTINGS_DEFAULTS.gestureLeftUrl,
      gestureRightUrl: data.gesture_right_url ?? SETTINGS_DEFAULTS.gestureRightUrl
    };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}
