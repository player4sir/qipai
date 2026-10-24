import React, { useState } from 'react';
import { Download, Share, PlusSquare, WifiOff, X, Smartphone } from 'lucide-react';
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
        <div className="flex items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-950/90 px-2.5 py-1 text-[11px] font-semibold text-rose-200 whitespace-nowrap shrink-0">
          <WifiOff className="h-3.5 w-3.5 text-rose-400" />
          <span>离线缓存模式 · 网络恢复后自动重连</span>
        </div>
      )}

      {!isStandalone && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
          title="安装独立全屏桌面版（免浏览器地址栏干扰）"
        >
          <Download className="h-3.5 w-3.5 text-amber-300" />
          <span>{isInstallable ? '一键安装App' : '安装桌面版'}</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-amber-400/50 bg-[#072B1E] p-5 text-[#FAF8F5] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-emerald-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-amber-400" />
                <h3 className="font-display text-base font-bold text-amber-300">
                  安装《欢乐斗地主》全屏横屏桌面版
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-lg p-1 text-emerald-300 hover:bg-emerald-900/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3.5 space-y-3 text-xs leading-relaxed text-emerald-100/90">
              <p>
                将本游戏添加到手机主屏幕或电脑桌面后，即可享受<strong>无浏览器地址栏遮挡</strong>的原生 120Hz 全屏横屏体验与静态资源离线秒开：
              </p>

              {isIOS ? (
                <div className="rounded-xl border border-emerald-700/80 bg-[#051F16] p-3.5 space-y-2.5">
                  <div className="font-bold text-amber-300">iOS / Safari 安装步骤：</div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[11px] font-bold text-amber-300">
                      1
                    </span>
                    <span>
                      点击 Safari 底部或顶部的 <Share className="inline h-3.5 w-3.5 text-amber-300 mx-0.5" /> <strong>「分享」</strong> 按钮
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[11px] font-bold text-amber-300">
                      2
                    </span>
                    <span>
                      向下滑动菜单，选择 <PlusSquare className="inline h-3.5 w-3.5 text-amber-300 mx-0.5" /> <strong>「添加到主屏幕」</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-700/80 bg-[#051F16] p-3.5 space-y-2">
                  <div className="font-bold text-amber-300">Android / Chrome / Edge 安装步骤：</div>
                  <p>
                    点击浏览器地址栏右侧的<strong>「安装应用」</strong>图标，或打开浏览器右上角菜单（⋮）选择<strong>「添加到主屏幕 / 安装应用」</strong>即可直接生成独立桌面图标。
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-[#18181B] hover:bg-amber-400 transition-colors"
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
