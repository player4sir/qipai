import React, { useEffect, useRef, useState } from 'react';

export interface AutoLandscapeMetrics {
  stageWidth: number;
  stageHeight: number;
  isVirtualLandscape: boolean;
  scale: number;
  virtualWidth: number;
  virtualHeight: number;
  stageScale: number;
  rotationDeg: 0 | 90;
}

export interface AutoLandscapeContainerProps {
  children: React.ReactNode | ((metrics: AutoLandscapeMetrics) => React.ReactNode);
  virtualHeight?: number;
  baseHeight?: number;
  minVirtualWidth?: number;
  maxVirtualWidth?: number;
}

export const AutoLandscapeContainer: React.FC<AutoLandscapeContainerProps> = ({
  children,
  virtualHeight = 720,
  baseHeight,
  minVirtualWidth = 1280,
  maxVirtualWidth = 1660,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [winSize, setWinSize] = useState(() => {
    if (typeof window === 'undefined') {
      return { w: 1334, h: 750 };
    }
    const vv = window.visualViewport;
    return {
      w: Math.round(vv ? vv.width : window.innerWidth),
      h: Math.round(vv ? vv.height : window.innerHeight),
    };
  });

  useEffect(() => {
    let settleTimer: number | null = null;

    const updateSize = () => {
      const el = hostRef.current;
      const vv = window.visualViewport;
      const w = Math.round(el && el.clientWidth > 0 ? el.clientWidth : vv ? vv.width : window.innerWidth);
      const h = Math.round(el && el.clientHeight > 0 ? el.clientHeight : vv ? vv.height : window.innerHeight);
      if (w > 0 && h > 0) {
        setWinSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };

    const handleOrientation = () => {
      updateSize();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(updateSize, 320);
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', handleOrientation);
    window.visualViewport?.addEventListener('resize', updateSize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && hostRef.current) {
      observer = new ResizeObserver(updateSize);
      observer.observe(hostRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', handleOrientation);
      window.visualViewport?.removeEventListener('resize', updateSize);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      observer?.disconnect();
    };
  }, []);

  const targetHeight = baseHeight ?? virtualHeight ?? 720;
  const isPortrait = winSize.h > winSize.w;
  const stageWidth = isPortrait ? winSize.h : winSize.w;
  const stageHeight = isPortrait ? winSize.w : winSize.h;

  // Compute virtual landscape width clamped between [minVirtualWidth, maxVirtualWidth]
  // so 4:3 tablets and narrow windows scale down uniformly instead of squishing horizontal layout
  const aspect = stageWidth / Math.max(1, stageHeight);
  const computedVirtualWidth = Math.max(
    minVirtualWidth,
    Math.min(maxVirtualWidth, Math.round(targetHeight * aspect))
  );

  // Uniform contain-fit scale factor
  const stageScale = Math.min(stageWidth / computedVirtualWidth, stageHeight / targetHeight);

  const metrics: AutoLandscapeMetrics = {
    stageWidth,
    stageHeight,
    isVirtualLandscape: isPortrait,
    scale: stageScale,
    virtualWidth: computedVirtualWidth,
    virtualHeight: targetHeight,
    stageScale,
    rotationDeg: isPortrait ? 90 : 0,
  };

  const content = typeof children === 'function' ? children(metrics) : children;

  return (
    <div ref={hostRef} className="relative h-full w-full overflow-hidden bg-black select-none">
      {isPortrait ? (
        <div
          className="absolute overflow-hidden"
          style={{
            width: `${stageWidth}px`,
            height: `${stageHeight}px`,
            left: '50%',
            top: '50%',
            transform: 'translate3d(-50%, -50%, 0) rotate(90deg)',
            transformOrigin: 'center center',
          }}
        >
          {content}
        </div>
      ) : (
        <div className="relative h-full w-full overflow-hidden">{content}</div>
      )}
    </div>
  );
};
