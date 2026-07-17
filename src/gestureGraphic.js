// Decides whether a hand's floating graphic should render as the
// staff-uploaded image or fall back to the built-in canvas heart.
// Pure selection logic (no Image()/canvas here) so the "configured vs
// fallback" cases — including a still-loading or failed image never
// producing a broken frame — are testable without a DOM (issue #7).

export function shouldUseGraphicImage({ url, loaded, failed } = {}) {
  return Boolean(url) && loaded === true && failed !== true;
}
