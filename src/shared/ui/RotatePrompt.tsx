import React, { useEffect, useState } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px] select-none">
      <div className="flex w-[300px] sm:w-[320px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#12171B]/95 p-5 text-center text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md">
        <h2 className="text-sm sm:text-[15px] font-bold text-[#F3F4F6]">
          横屏显示提示
        </h2>
        <p className="mt-1.5 text-xs text-[#9CA3AF] leading-relaxed">
          建议将设备旋转至横屏以获得完整牌桌视野。
        </p>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="h-8.5 min-w-[96px] rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] whitespace-nowrap cursor-pointer"
          >
            继续体验
          </button>
        </div>
      </div>
    </div>
  );
};
