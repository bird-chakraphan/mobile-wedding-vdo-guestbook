import { describe, it, expect } from 'vitest';
import { preRollRemaining, recordingStatus } from './countdown.js';

describe('preRollRemaining', () => {
  it('starts at the full count', () => {
    expect(preRollRemaining(0, 5)).toBe(5);
  });

  it('counts down one number per second', () => {
    expect(preRollRemaining(1000, 5)).toBe(4);
    expect(preRollRemaining(4200, 5)).toBe(1);
  });

  it('reaches zero exactly when the pre-roll ends', () => {
    expect(preRollRemaining(5000, 5)).toBe(0);
    expect(preRollRemaining(6000, 5)).toBe(0);
  });
});

describe('recordingStatus', () => {
  it('shows full remaining time with no warning at the start', () => {
    const s = recordingStatus(0, 60);
    expect(s.remainingSeconds).toBe(60);
    expect(s.warning).toBe(false);
    expect(s.done).toBe(false);
  });

  it('turns on the warning during the last 10 seconds', () => {
    const s = recordingStatus(50_000, 60);
    expect(s.remainingSeconds).toBe(10);
    expect(s.warning).toBe(true);
    expect(s.done).toBe(false);
  });

  it('is not warning just before the last 10 seconds', () => {
    const s = recordingStatus(49_000, 60);
    expect(s.remainingSeconds).toBe(11);
    expect(s.warning).toBe(false);
  });

  it('reports done at the time limit', () => {
    const s = recordingStatus(60_000, 60);
    expect(s.done).toBe(true);
    expect(s.remainingSeconds).toBe(0);
  });

  it('works for short staff-configured limits where the warning window covers everything', () => {
    const s = recordingStatus(0, 8);
    expect(s.warning).toBe(true); // 8s limit is entirely inside the 10s window
    expect(s.done).toBe(false);
  });
});
