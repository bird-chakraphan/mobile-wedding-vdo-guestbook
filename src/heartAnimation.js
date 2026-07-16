// Fade-in / hold / fade-out state machine for the floating heart graphic.
// Fades in on gesture start, holds (following the hand) while held, and
// only starts fading out once the gesture is released.
//
// Position and size EASE toward their targets instead of snapping:
// raw landmark positions jitter frame-to-frame, and without easing the
// heart visibly glitches around the hand (seen in real phone testing).

const FADE_IN_STEP = 0.08;
const FADE_OUT_STEP = 0.05;
const FOLLOW = 0.25; // fraction of the remaining distance covered per frame

function ease(current, target) {
  return current + (target - current) * FOLLOW;
}

export function nextHeartState(heart, { active, x, y, size }) {
  if (active) {
    if (!heart) {
      return { x, y, size, alpha: FADE_IN_STEP, state: 'in' };
    }
    const fadingIn = heart.state === 'in' || heart.state === 'out';
    const alpha = fadingIn ? Math.min(1, heart.alpha + FADE_IN_STEP) : 1;
    return {
      x: ease(heart.x, x),
      y: ease(heart.y, y),
      size: ease(heart.size, size),
      alpha,
      state: alpha >= 1 ? 'held' : 'in'
    };
  }

  if (!heart) return null;
  const alpha = Math.max(0, heart.alpha - FADE_OUT_STEP);
  if (alpha <= 0) return null;
  return { ...heart, alpha, state: 'out' };
}
