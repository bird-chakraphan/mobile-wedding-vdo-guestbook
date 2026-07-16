import { describe, it, expect } from 'vitest';
import { nextHeartState } from './heartAnimation.js';

describe('nextHeartState', () => {
  it('creates a new heart fading in at the hand, at hand-proportional size, when the gesture starts', () => {
    const heart = nextHeartState(null, { active: true, x: 10, y: 20, size: 40 });
    expect(heart.state).toBe('in');
    expect(heart.alpha).toBeGreaterThan(0);
    expect(heart.alpha).toBeLessThan(1);
    expect(heart.x).toBe(10);
    expect(heart.y).toBe(20);
    expect(heart.size).toBe(40);
  });

  it('keeps fading in on successive active frames until it reaches full opacity, then holds', () => {
    let heart = null;
    for (let i = 0; i < 100 && (!heart || heart.state === 'in'); i++) {
      heart = nextHeartState(heart, { active: true, x: 1, y: 2, size: 40 });
    }
    expect(heart.state).toBe('held');
    expect(heart.alpha).toBe(1);

    // one more active frame while held should stay at full opacity
    heart = nextHeartState(heart, { active: true, x: 1, y: 2, size: 40 });
    expect(heart.state).toBe('held');
    expect(heart.alpha).toBe(1);
  });

  it('follows a moving hand smoothly instead of teleporting to each new position', () => {
    let heart = { x: 0, y: 0, size: 40, alpha: 1, state: 'held' };
    heart = nextHeartState(heart, { active: true, x: 100, y: 100, size: 40 });

    // one frame: moved toward the target but nowhere near all the way
    expect(heart.x).toBeGreaterThan(0);
    expect(heart.x).toBeLessThan(80);
    expect(heart.y).toBeGreaterThan(0);
    expect(heart.y).toBeLessThan(80);

    // many frames at the same target: converges onto it
    for (let i = 0; i < 60; i++) {
      heart = nextHeartState(heart, { active: true, x: 100, y: 100, size: 40 });
    }
    expect(heart.x).toBeCloseTo(100, 0);
    expect(heart.y).toBeCloseTo(100, 0);
  });

  it('eases its size toward the hand size, so moving closer to the camera grows the heart smoothly', () => {
    let heart = { x: 0, y: 0, size: 40, alpha: 1, state: 'held' };
    heart = nextHeartState(heart, { active: true, x: 0, y: 0, size: 80 });
    expect(heart.size).toBeGreaterThan(40);
    expect(heart.size).toBeLessThan(80);

    for (let i = 0; i < 60; i++) {
      heart = nextHeartState(heart, { active: true, x: 0, y: 0, size: 80 });
    }
    expect(heart.size).toBeCloseTo(80, 0);
  });

  it('starts fading out once the gesture is released, and disappears when fully faded', () => {
    let heart = { x: 1, y: 2, size: 40, alpha: 1, state: 'held' };

    heart = nextHeartState(heart, { active: false });
    expect(heart.state).toBe('out');
    expect(heart.alpha).toBeLessThan(1);

    for (let i = 0; i < 100 && heart; i++) {
      heart = nextHeartState(heart, { active: false });
    }
    expect(heart).toBeNull();
  });

  it('revives back into fading-in if the gesture resumes mid fade-out, instead of resetting to invisible', () => {
    const fadingOut = { x: 1, y: 2, size: 40, alpha: 0.4, state: 'out' };
    const revived = nextHeartState(fadingOut, { active: true, x: 9, y: 9, size: 40 });
    expect(revived.state).toBe('in');
    expect(revived.alpha).toBeGreaterThan(0.4);
    // position eases toward the new hand position rather than jumping
    expect(revived.x).toBeGreaterThan(1);
    expect(revived.x).toBeLessThan(9);
  });
});
