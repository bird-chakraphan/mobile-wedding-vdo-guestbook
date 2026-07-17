// Maps the staff page's form values to update_staff_settings' exact RPC
// argument names (see supabase/setup.sql) — kept as one small pure
// function so a typo in a param name fails a test, not a silent no-op
// write in production.

export function buildSettingsPayload(passcode, values) {
  return {
    p_passcode: passcode,
    p_time_limit_seconds: values.timeLimitSeconds,
    p_beauty_smooth: values.beautySmooth,
    p_beauty_glow: values.beautyGlow,
    p_output_width: values.outputWidth,
    p_output_height: values.outputHeight
  };
}
