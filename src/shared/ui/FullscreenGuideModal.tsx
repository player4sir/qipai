import React from 'react';
import { X } from 'lucide-react';
import { requestUniversalFullscreen } from '../utils/fullscreenHelper';

export interface FullscreenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenGuideModal: React.FC<FullscreenGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const handleTryFullscreen = async () => {
    await requestUniversalFullscreen();
    onClose();
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="relative flex w-[90vw] max-w-[380px] max-h-[82dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h2 className="text-sm sm:text-base font-bold text-[#F3F4F6]">全屏显示设置</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="text-xs font-semibold text-[#F3F4F6]">安卓及桌面浏览器</div>
            <p className="mt-1 text-xs text-[#9CA3AF] leading-relaxed">
              点击下方按钮即可开启系统全屏显示。
            </p>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleTryFullscreen}
                className="h-8.5 min-w-[96px] rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] active:scale-98 transition-colors cursor-pointer"
              >
                立即开启全屏
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="text-xs font-semibold text-[#F3F4F6]">iOS Safari 浏览器</div>
            <div className="mt-1.5 space-y-1 text-xs text-[#9CA3AF]">
              <div>1. 点击浏览器底部「分享」按钮</div>
              <div>2. 选择「添加到主屏幕」即可从桌面全屏启动</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 min-w-[80px] rounded-lg border border-white/12 bg-white/[0.06] px-4 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] active:scale-95 transition-colors cursor-pointer"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
