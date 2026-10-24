/**
 * Cross-platform Mobile Browser Fullscreen & Navigation Bar Collapse Helper
 * Supports standard Fullscreen API, WebKit/iOS prefixes, PWA standalone detection,
 * and Safari minimal-ui scroll collapse techniques.
 */

export interface FullscreenCapabilities {
  canNativeFullscreen: boolean;
  isIOSSafari: boolean;
  isStandalone: boolean;
  isCurrentlyFullscreen: boolean;
}

export function detectFullscreenCapabilities(): FullscreenCapabilities {
  if (typeof window === 'undefined') {
    return {
      canNativeFullscreen: false,
      isIOSSafari: false,
      isStandalone: false,
      isCurrentlyFullscreen: false,
    };
  }

  const doc = document as unknown as {
    fullscreenElement?: Element;
    webkitFullscreenElement?: Element;
    mozFullScreenElement?: Element;
    msFullscreenElement?: Element;
  };

  const docEl = document.documentElement as unknown as {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };

  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua);
  const isIOSSafari = isIOS && isSafari;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);

  const canNativeFullscreen = Boolean(
    docEl.requestFullscreen ||
    docEl.webkitRequestFullscreen ||
    docEl.mozRequestFullScreen ||
    docEl.msRequestFullscreen
  );

  const isCurrentlyFullscreen = Boolean(
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    isStandalone
  );

  return {
    canNativeFullscreen,
    isIOSSafari,
    isStandalone,
    isCurrentlyFullscreen,
  };
}

/**
 * Attempt to collapse mobile browser navigation bars and enter true fullscreen.
 * Must be triggered directly inside a user interaction (tap, click, pointerdown).
 */
export async function requestUniversalFullscreen(targetElement?: HTMLElement): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const el = (targetElement || document.documentElement) as unknown as {
    requestFullscreen?: (options?: { navigationUI?: 'auto' | 'show' | 'hide' }) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };

  let entered = false;

  // 1. Attempt Standard & Vendor-Prefixed Fullscreen API with navigationUI: 'hide'
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      entered = true;
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      entered = true;
    } else if (el.mozRequestFullScreen) {
      await el.mozRequestFullScreen();
      entered = true;
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
      entered = true;
    }
  } catch {
    // Handled below via fallback methods
  }

  // 2. Hardware / Browser orientation lock to landscape
  try {
    const orientationAny = screen.orientation as unknown as {
      lock?: (mode: string) => Promise<void>;
    };
    if (orientationAny?.lock) {
      await orientationAny.lock('landscape').catch(() => {});
    }
  } catch {
    // Ignored on unsupported platforms
  }

  // 3. Mobile Safari Address Bar Minimization Scroll-Trick
  // In iOS Safari, scrolling the page by 1px collapses the address bar into compact mode.
  try {
    window.scrollTo(0, 1);
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 80);
  } catch {
    // Ignored
  }

  return entered;
}

/**
 * Exit fullscreen mode
 */
export async function exitUniversalFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;

  const doc = document as unknown as {
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
    fullscreenElement?: Element;
    webkitFullscreenElement?: Element;
  };

  try {
    if (doc.exitFullscreen && doc.fullscreenElement) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen && doc.webkitFullscreenElement) {
      await doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
      await doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
      await doc.msExitFullscreen();
    }
  } catch {
    // Ignored
  }
}
