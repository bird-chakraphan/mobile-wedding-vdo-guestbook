// The two pure decisions in the recording flow: which codec to record
// with, and what to name the file. iOS Safari only supports mp4;
// Chrome/Android support webm — checked in priority order.

export const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4'
];

export function pickMimeType(isSupported, candidates = MIME_CANDIDATES) {
  return candidates.find(isSupported) || '';
}

// No guest-name entry yet in this slice, so filenames are timestamp-only —
// the sanitized-guest-name convention (ADR/CONTEXT.md) lands with that step.
export function buildFilename(mimeType, now = new Date()) {
  const ext = (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
  return `Guest_${now.toISOString().replace(/[:.]/g, '-')}.${ext}`;
}

// Wedding-venue Wi-Fi and phone networks flake; a clip that fails to
// upload once is usually fine seconds later. fn must resolve to a
// supabase-style { data, error } — thrown exceptions are not handled here
// on purpose (supabase-js reports failures via `error`, not throws).
export async function withRetries(fn, { attempts = 3, delayMs = 2000, sleep } = {}) {
  const wait = sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const { data, error } = await fn();
    if (!error) return { data, error: null };
    lastError = error;
    if (attempt < attempts) await wait(delayMs * attempt);
  }
  return { data: null, error: lastError };
}
