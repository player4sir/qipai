export interface FullscreenCapabilities {
  canNativeFullscreen: boolean;
  isCurrentlyFullscreen: boolean;
  isIOSSafari: boolean;
}

export function detectFullscreenCapabilities(): FullscreenCapabilities {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      canNativeFullscreen: false,
      isCurrentlyFullscreen: false,
      isIOSSafari: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const docEl = document.documentElement as any;
  const doc = document as any;

  const canNativeFullscreen = Boolean(
    document.fullscreenEnabled ||
      docEl.webkitRequestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen
  );

  const isCurrentlyFullscreen = Boolean(
    document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
  );

  return {
    canNativeFullscreen,
    isCurrentlyFullscreen,
    isIOSSafari: isIOS && isSafari && !canNativeFullscreen,
  };
}

export async function requestUniversalFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const docEl = document.documentElement as any;
  if (docEl.requestFullscreen) {
    await docEl.requestFullscreen();
  } else if (docEl.webkitRequestFullscreen) {
    await docEl.webkitRequestFullscreen();
  }
  try {
    const scr = window.screen as any;
    if (scr?.orientation?.lock) {
      await scr.orientation.lock('landscape').catch(() => {});
    }
  } catch {
    // Ignore orientation lock errors
  }
}

export async function exitUniversalFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  const doc = document as any;
  if (doc.exitFullscreen && doc.fullscreenElement) {
    await doc.exitFullscreen();
  } else if (doc.webkitExitFullscreen && doc.webkitFullscreenElement) {
    await doc.webkitExitFullscreen();
  }
}
