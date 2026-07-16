// The two pure decisions in the recording flow: which codec to record
// with, and what to name the file. MP4 (H.264) is preferred everywhere
// it's recordable: it's the only format phone photo galleries accept
// (iOS can record WebM on newer Safari but cannot PLAY it outside the
// browser — found in real iPhone testing). WebM stays as the fallback
// for browsers that can't record mp4.

export const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
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
