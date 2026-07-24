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
  beautyVshape: 0,
  beautyNarrow: 0,
  outputWidth: 1080,
  outputHeight: 1920,
  gestureType: 'mini-heart',
  gestureScale: 100,
  frameUrl: null,
  gestureLeftUrl: null,
  gestureRightUrl: null,
  // Unlike frame/gesture graphics (optional — null means "no overlay"), the
  // entry screen always needs SOME photo. Default is the bundled static
  // file, so an unset/cleared hero_url falls back to it rather than to
  // nothing.
  heroUrl: '/entry-hero.png'
};

// Columns present since the first release. Newer columns are appended in
// COLUMNS but kept out of BASE_COLUMNS so a deploy that runs before its DB
// migration falls back to reading the real settings (minus the new fields,
// which default) instead of erroring into all-defaults.
const BASE_COLUMNS =
  'time_limit_seconds,beauty_smooth,beauty_glow,beauty_vshape,beauty_narrow,output_width,output_height,frame_url,gesture_left_url,gesture_right_url';
const COLUMNS = `${BASE_COLUMNS},gesture_type,gesture_scale,hero_url`;

function queryRow(client, columns, timeoutMs) {
  const query = client.from('staff_settings').select(columns).eq('id', 1).single();
  const timeout = new Promise(resolve =>
    setTimeout(() => resolve({ data: null, error: { message: 'settings load timed out' } }), timeoutMs)
  );
  return Promise.race([Promise.resolve(query), timeout]);
}

export async function loadSettings(client, { timeoutMs = 4000 } = {}) {
  try {
    let { data, error } = await queryRow(client, COLUMNS, timeoutMs);
    // A missing newer column (migration not yet applied) errors the whole
    // select — retry with only the always-present columns so the guest page
    // still gets frame/gesture/beauty settings, not all-defaults.
    if (error) ({ data, error } = await queryRow(client, BASE_COLUMNS, timeoutMs));
    if (error || !data) return { ...SETTINGS_DEFAULTS };
    return {
      timeLimitSeconds: data.time_limit_seconds ?? SETTINGS_DEFAULTS.timeLimitSeconds,
      beautySmooth: data.beauty_smooth ?? SETTINGS_DEFAULTS.beautySmooth,
      beautyGlow: data.beauty_glow ?? SETTINGS_DEFAULTS.beautyGlow,
      beautyVshape: data.beauty_vshape ?? SETTINGS_DEFAULTS.beautyVshape,
      beautyNarrow: data.beauty_narrow ?? SETTINGS_DEFAULTS.beautyNarrow,
      outputWidth: data.output_width ?? SETTINGS_DEFAULTS.outputWidth,
      outputHeight: data.output_height ?? SETTINGS_DEFAULTS.outputHeight,
      gestureType: data.gesture_type ?? SETTINGS_DEFAULTS.gestureType,
      gestureScale: data.gesture_scale ?? SETTINGS_DEFAULTS.gestureScale,
      frameUrl: data.frame_url ?? SETTINGS_DEFAULTS.frameUrl,
      gestureLeftUrl: data.gesture_left_url ?? SETTINGS_DEFAULTS.gestureLeftUrl,
      gestureRightUrl: data.gesture_right_url ?? SETTINGS_DEFAULTS.gestureRightUrl,
      heroUrl: data.hero_url ?? SETTINGS_DEFAULTS.heroUrl
    };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}
