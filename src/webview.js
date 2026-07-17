// Guests scan the QR from inside LINE / Instagram / Facebook chats, whose
// in-app webviews break or degrade getUserMedia. Detect them from the UA
// so the page can show "open in your browser" instructions instead of a
// broken camera prompt. (CONTEXT.md decision — webviews can't be avoided,
// only detected.)

export function isInAppWebview(userAgent) {
  return /\bLine\/|Instagram|FBAN|FBAV|FB_IAB/i.test(userAgent || '');
}
