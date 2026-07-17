import { describe, it, expect } from 'vitest';
import { isInAppWebview } from './webview.js';

// Real user-agent strings captured from in-app browsers.
const LINE_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari Line/14.9.0/IAB';
const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E236 Instagram 334.0.4.32.98 (iPhone14,5; iOS 17_4_1; en_US; en; scale=3.00; 1170x2532; 591109350)';
const FACEBOOK_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21D61 [FBAN/FBIOS;FBAV/458.0.0.28.106;FBBV/593403858;FBDV/iPhone13,2]';
const MESSENGER_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.106 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/451.0.0.39.109;]';

const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.113 Mobile Safari/537.36';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('isInAppWebview', () => {
  it('detects the LINE in-app browser', () => {
    expect(isInAppWebview(LINE_IOS)).toBe(true);
  });

  it('detects the Instagram in-app browser', () => {
    expect(isInAppWebview(INSTAGRAM_IOS)).toBe(true);
  });

  it('detects the Facebook in-app browser', () => {
    expect(isInAppWebview(FACEBOOK_IOS)).toBe(true);
  });

  it('detects the Messenger in-app browser', () => {
    expect(isInAppWebview(MESSENGER_ANDROID)).toBe(true);
  });

  it('does NOT flag real Safari, Chrome Android, or desktop Chrome', () => {
    expect(isInAppWebview(SAFARI_IOS)).toBe(false);
    expect(isInAppWebview(CHROME_ANDROID)).toBe(false);
    expect(isInAppWebview(CHROME_MAC)).toBe(false);
  });

  it('handles missing input safely', () => {
    expect(isInAppWebview(undefined)).toBe(false);
    expect(isInAppWebview('')).toBe(false);
  });
});
