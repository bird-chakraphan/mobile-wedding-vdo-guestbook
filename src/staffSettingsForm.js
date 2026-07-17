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
    p_beauty_vshape: values.beautyVshape,
    p_beauty_narrow: values.beautyNarrow,
    p_output_width: values.outputWidth,
    p_output_height: values.outputHeight,
    p_gesture_type: values.gestureType,
    p_gesture_scale: values.gestureScale,
    p_frame_url: values.frameUrl,
    p_gesture_left_url: values.gestureLeftUrl,
    p_gesture_right_url: values.gestureRightUrl
  };
}
