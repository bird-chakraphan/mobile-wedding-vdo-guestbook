// Timing arithmetic for the recording flow, kept pure (time injected as
// elapsed milliseconds) so the pre-roll countdown, remaining-time display,
// last-10s warning, and auto-stop are all testable without a clock.

export function preRollRemaining(elapsedMs, totalSeconds = 5) {
  return Math.max(0, Math.ceil(totalSeconds - elapsedMs / 1000));
}

export function recordingStatus(elapsedMs, limitSeconds, warningWindowSeconds = 10) {
  const remainingSeconds = Math.max(0, Math.ceil(limitSeconds - elapsedMs / 1000));
  return {
    remainingSeconds,
    warning: remainingSeconds <= warningWindowSeconds,
    done: elapsedMs >= limitSeconds * 1000
  };
}
