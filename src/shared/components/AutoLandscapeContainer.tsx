import React, { useEffect, useState } from 'react';
import { RotateCw, Maximize } from 'lucide-react';
import { requestUniversalFullscreen } from '../utils/fullscreenHelper';
import { readSafeAreaInsets, sameInsets, ZERO_INSETS, type SafeAreaInsets } from '../utils/safeArea';

export interface AutoLandscapeContainerProps {
  baseHeight?: number; // Target virtual height (default 720)
  minVirtualWidth?: number; // Minimum virtual width (default 1280)
  maxVirtualWidth?: number; // Maximum virtual width (default 1600)
  children: (props: {
    stageWidth: number;
    stageHeight: number;
    isVirtualLandscape: boolean;
    scale: number;
    virtualWidth: number;
    virtualHeight: number;
    stageScale: number;
    /** CSS rotation applied to the stage container (0 in real landscape). Needed to map pointer coords. */
    rotationDeg: 0 | 90 | 270;
  }) => React.ReactNode;
}

export const AutoLandscapeContainer: React.FC<AutoLandscapeContainerProps> = ({
  baseHeight = 720,
  minVirtualWidth = 1280,
  maxVirtualWidth = 1600,
  children,
}) => {
  const [viewport, setViewport] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const [rotationAngle, setRotationAngle] = useState<90 | 270>(90);
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);

  useEffect(() => {
    // Attempt physical orientation lock where supported (Android, PWA, Chrome)
    const lockOrientation = async () => {
      try {
        const orientationAny = screen.orientation as unknown as {
          lock?: (mode: string) => Promise<void>;
        };
        if (orientationAny?.lock) {
          await orientationAny.lock('landscape').catch(() => {});
        }
      } catch {
        // Ignored on platforms without orientation lock support
      }
    };

    lockOrientation();

    const handleResize = () => {
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      const next = { width: Math.round(w), height: Math.round(h) };
      // resize + visualViewport.resize + fullscreenchange often fire together: skip identical sizes
      setViewport((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
      const safe = readSafeAreaInsets();
      setInsets((prev) => (sameInsets(prev, safe) ? prev : safe));
    };

    // iOS fires `orientationchange` before the new dimensions are applied -> measure again once settled
    let settleTimer: number | null = null;
    const handleOrientationChange = () => {
      handleResize();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(handleResize, 320);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('fullscreenchange', handleResize);
    document.addEventListener('webkitfullscreenchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      document.removeEventListener('fullscreenchange', handleResize);
      document.removeEventListener('webkitfullscreenchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);

      try {
        const orientationAny = screen.orientation as unknown as {
          unlock?: () => void;
        };
        orientationAny?.unlock?.();
      } catch {
        // Ignored
      }
    };
  }, []);

  // Only phone-like / touch screens are virtually rotated. A tall desktop window is NOT rotated:
  // it is simply contain-fitted (uniform scale, letterboxed) so nothing is stretched or turned on its side.
  const isTouchLike =
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const isPortrait = viewport.height > viewport.width && (viewport.width < 768 || isTouchLike);

  // If in portrait, logical landscape width is screen height, logical landscape height is screen width
  // Safe-area insets are only applied in real landscape (in virtual rotation the physical
  // insets map onto different logical edges and the device is expected to be rotated anyway).
  const safe = isPortrait ? ZERO_INSETS : insets;
  const stageWidth = (isPortrait ? viewport.height : viewport.width) - safe.left - safe.right;
  const stageHeight = (isPortrait ? viewport.width : viewport.height) - safe.top - safe.bottom;

  // Commercial virtual coordinate system:
  // Virtual height is fixed at baseHeight (e.g. 720px); virtual width adapts dynamically to screen aspect ratio
  const aspectRatio = stageWidth / Math.max(1, stageHeight);
  const virtualWidth = Math.max(minVirtualWidth, Math.min(maxVirtualWidth, Math.round(baseHeight * aspectRatio)));
  const virtualHeight = baseHeight;
  // Contain-fit on BOTH axes (height-only fit cropped 4:3 screens horizontally)
  const stageScale = Math.min(stageHeight / baseHeight, stageWidth / virtualWidth);

  // Legacy design resolution scale factor
  const scale = Math.min(stageWidth / minVirtualWidth, stageHeight / baseHeight);

  // Rotation geometry styles for 90-degree or 270-degree virtual rotation
  const containerStyle: React.CSSProperties = isPortrait
    ? {
        position: 'absolute',
        width: `${viewport.height}px`,
        height: `${viewport.width}px`,
        left: `${(viewport.width - viewport.height) / 2}px`,
        top: `${(viewport.height - viewport.width) / 2}px`,
        transform: `rotate(${rotationAngle}deg)`,
        transformOrigin: 'center center',
        overflow: 'hidden',
      }
    : {
        // Stay in normal flow (parent positioning unchanged); shrink + offset by the safe-area insets
        // so children (absolute 50% centred stages) are centred inside the safe rectangle.
        position: 'relative',
        width: `calc(100% - ${safe.left + safe.right}px)`,
        height: `calc(100% - ${safe.top + safe.bottom}px)`,
        marginLeft: `${safe.left}px`,
        marginTop: `${safe.top}px`,
        overflow: 'hidden',
      };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black select-none touch-none overscroll-none">
      <div
        style={{
          ...containerStyle,
          touchAction: 'none',
          overscrollBehavior: 'none',
        }}
      >
        {children({
          stageWidth,
          stageHeight,
          isVirtualLandscape: isPortrait,
          scale,
          virtualWidth,
          virtualHeight,
          stageScale,
          rotationDeg: isPortrait ? rotationAngle : 0,
        })}
      </div>

      {/* Floating orientation switch & fullscreen pills when in virtual portrait mode */}
      {isPortrait && (
        <div className="absolute bottom-3 right-3 z-50 flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={async () => {
              await requestUniversalFullscreen();
            }}
            title="沉浸全屏"
            className="flex items-center gap-1 rounded-full border border-emerald-400/50 bg-black/80 px-2.5 py-1 text-[11px] font-bold text-emerald-300 shadow-xl backdrop-blur-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Maximize className="h-3 w-3" />
            <span>全屏</span>
          </button>

          <button
            type="button"
            onClick={() => setRotationAngle((prev) => (prev === 90 ? 270 : 90))}
            title="旋转横屏方向"
            className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-black/80 px-2.5 py-1 text-[11px] font-bold text-amber-300 shadow-xl backdrop-blur-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <RotateCw className="h-3 w-3" />
            <span>转屏{rotationAngle === 90 ? '270°' : '90°'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
