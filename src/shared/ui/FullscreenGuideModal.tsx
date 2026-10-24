import React from 'react';
import { Check, Maximize2 } from 'lucide-react';
import { CommercialModalShell } from './CommercialModalShell';

export interface FullscreenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenGuideModal: React.FC<FullscreenGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <CommercialModalShell
      title="全屏横屏体验指南"
      subtitle="开启沉浸式无边框棋牌视效"
      icon={<Maximize2 className="h-4.5 w-4.5" />}
      size="sm"
      portalMode="stage"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-6 py-2 text-xs sm:text-sm font-black text-white shadow-sm hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>我知道了</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-xs sm:text-sm leading-relaxed text-[#334155]">
        <div className="rounded-xl border border-[#E8E1D0] bg-white p-3.5 shadow-2xs">
          <div className="font-extrabold text-[#1E242B]">1. 添加至主屏幕（推荐）</div>
          <p className="mt-1 text-xs text-[#5A6572]">
            在 iOS Safari 浏览器下，请点击底部工具栏的「分享」按钮，选择「添加到主屏幕」即可获得完整全屏沉浸牌桌体验。
          </p>
        </div>

        <div className="rounded-xl border border-[#E8E1D0] bg-white p-3.5 shadow-2xs">
          <div className="font-extrabold text-[#1E242B]">2. 隐藏浏览器顶部地址栏</div>
          <p className="mt-1 text-xs text-[#5A6572]">
            也可点击浏览器地址栏左侧的「大小 / 隐藏工具栏」选项收起顶部导航栏，释放更大牌面视野。
          </p>
        </div>
      </div>
    </CommercialModalShell>
  );
};
