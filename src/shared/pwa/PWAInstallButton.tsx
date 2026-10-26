import React, { useState } from 'react';
import { usePWA } from './usePWA';
import { hapticEngine } from '../haptics/HapticEngine';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isIOS, isStandalone, isOffline, promptInstall } = usePWA();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleInstallClick = () => {
    hapticEngine.tap();
    if (isInstallable) {
      promptInstall();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {isOffline && (
        <div className="flex items-center rounded-lg border border-rose-500/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-[#F87171] whitespace-nowrap shrink-0">
          <span>离线模式</span>
        </div>
      )}

      {!isStandalone && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex h-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>{isInstallable ? '安装桌面版' : '添加到主屏幕'}</span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px]">
          <div
            className="flex w-[310px] sm:w-[340px] flex-col rounded-2xl border border-white/10 bg-[#12171B]/95 p-5 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-sm sm:text-base font-bold text-[#F3F4F6]">
              添加到主屏幕
            </h3>

            <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-xs leading-relaxed text-[#D1D5DB]">
              {isIOS ? (
                <div className="space-y-1.5">
                  <div className="font-semibold text-[#F3F4F6]">iOS Safari 操作步骤</div>
                  <div>1. 点击浏览器底部的「分享」按钮</div>
                  <div>2. 选择「添加到主屏幕」即可完成</div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="font-semibold text-[#F3F4F6]">浏览器操作步骤</div>
                  <p>打开浏览器右上角菜单，选择「添加到主屏幕」或「安装应用」。</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="h-8.5 min-w-[84px] rounded-lg bg-[#D49B35] hover:bg-[#E0A842] px-4 text-xs font-bold text-[#111315] transition-colors cursor-pointer"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
