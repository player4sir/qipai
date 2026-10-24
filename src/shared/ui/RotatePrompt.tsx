import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

/**
 * Landscape Orientation Prompt (Section 4.1 of Development Doc).
 * Automatically detects portrait viewport (`window.innerHeight > window.innerWidth`)
 * and displays a non-CSS-forced rotation prompt overlay, with an optional bypass button for desktop testing.
 */
export const RotatePrompt: React.FC = () => {
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    function checkOrientation() {
      if (window.innerHeight > window.innerWidth && window.innerWidth < 768) {
        setIsPortrait(true);
      } else {
        setIsPortrait(false);
      }
    }

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (!isPortrait || dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#072B1E]/95 px-6 text-center backdrop-blur-md">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-400/30 bg-[#0D4A34] text-amber-400 shadow-lg">
        <Smartphone className="h-10 w-10 rotate-90 transition-transform duration-500" />
      </div>
      <h2 className="font-display text-2xl font-bold text-[#FAF8F5]">
        请将手机旋转至横屏体验
      </h2>
      <p className="mt-2 max-w-xs text-sm text-emerald-100/80">
        本游戏采用 1334×750 商业级宽屏牌桌设计，横屏握持可获得最佳选牌与出牌视野。
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-900/60 px-5 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-800/80 whitespace-nowrap shrink-0"
      >
        当前窗口继续体验
      </button>
    </div>
  );
};
