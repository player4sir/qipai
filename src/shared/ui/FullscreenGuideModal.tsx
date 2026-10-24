import React from 'react';
import { X, Maximize, Share, Smartphone, CheckCircle } from 'lucide-react';
import {
  detectFullscreenCapabilities,
  requestUniversalFullscreen,
} from '../utils/fullscreenHelper';

export interface FullscreenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenGuideModal: React.FC<FullscreenGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const caps = detectFullscreenCapabilities();

  const handleTryFullscreen = async () => {
    await requestUniversalFullscreen();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-md rounded-3xl border border-amber-400/40 bg-gradient-to-b from-[#182e23] via-[#0c1f17] to-[#06120d] p-6 text-white shadow-2xl">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/10 text-amber-300">
            <Maximize className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-black text-amber-200">
              收起导航栏与全屏沉浸指南
            </h2>
            <p className="text-xs text-white/60">
              消除浏览器地址栏与底部工具栏，享受原生画质
            </p>
          </div>
        </div>

        {/* Method 1: Android & Mainstream Mobile Browsers */}
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display text-xs font-bold text-amber-300">
                <Smartphone className="h-4 w-4 text-amber-400" />
                方案一：安卓 / 微信 / UC / Chrome
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                一键生效
              </span>
            </div>
            <p className="mt-1 text-xs text-white/75 leading-relaxed">
              点击下方按钮即可唤起系统原生沉浸全屏，自动收起顶部网址栏与底部导航按键。
            </p>
            <button
              type="button"
              onClick={handleTryFullscreen}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500 via-amber-600 to-orange-500 py-2 text-xs font-black text-black shadow-lg active:scale-98"
            >
              <Maximize className="h-4 w-4" />
              <span>立即一键全屏沉浸</span>
            </button>
          </div>

          {/* Method 2: iOS Safari Add to Home Screen (PWA) */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-display text-xs font-bold text-amber-300">
                <Share className="h-4 w-4 text-sky-400" />
                方案二：苹果 iOS Safari 完美全屏
              </span>
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                终极体验
              </span>
            </div>
            <p className="mt-1 text-xs text-white/75 leading-relaxed">
              因苹果系统限制，在普通网页中会固定显示底栏。只需两步即可彻底隐藏：
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-white/80">
              <div className="flex items-start gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">
                  1
                </span>
                <span>
                  点击 Safari 底部居中的<strong>「分享」</strong>图标（带向上箭头的方框）。
                </span>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-amber-300">
                  2
                </span>
                <span>
                  在弹出菜单中下滑选择<strong>「添加到主屏幕」</strong>。
                </span>
              </div>
            </div>
            <div className="mt-2.5 rounded-lg border border-emerald-400/20 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] text-emerald-300/90 flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
              <span>从桌面启动即为 100% 纯净无边框 App 级视效！</span>
            </div>
          </div>
        </div>

        {/* Footer Confirmation */}
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-bold text-white/80 hover:bg-white/20 active:scale-95"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
