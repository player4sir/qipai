export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Resolve `env(safe-area-inset-*)` to real pixel numbers (notch / home indicator / rounded corners).
 * A hidden probe element is used because env() cannot be read directly from JS.
 * Returns zeros outside the browser or when the viewport has no insets.
 */
export function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof document === 'undefined' || !document.body) return ZERO_INSETS;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
    'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const num = (v: string) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  };
  const insets: SafeAreaInsets = {
    top: num(cs.paddingTop),
    right: num(cs.paddingRight),
    bottom: num(cs.paddingBottom),
    left: num(cs.paddingLeft),
  };
  probe.remove();
  return insets;
}

export function sameInsets(a: SafeAreaInsets, b: SafeAreaInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}
