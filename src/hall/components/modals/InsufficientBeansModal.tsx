import React from 'react';
import { RoomTierConfig } from '../../../games/ddz/types';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface InsufficientBeansModalProps {
  targetTier: RoomTierConfig;
  recommendedTier: RoomTierConfig;
  currentBeans: number;
  onClose: () => void;
  onClaimSupply: () => void;
  onEnterRecommendedTier: () => void;
}

export const InsufficientBeansModal: React.FC<InsufficientBeansModalProps> = ({
  targetTier,
  recommendedTier,
  currentBeans,
  onClose,
  onClaimSupply,
  onEnterRecommendedTier,
}) => {
  const requiredCards = targetTier.roomCardCost ?? targetTier.minBeans;
  const initialScore = targetTier.initialScore ?? targetTier.baseScore * 20;
  const shortfall = Math.max(0, requiredCards - currentBeans);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex w-[320px] sm:w-[348px] flex-col rounded-2xl border border-white/10 bg-[#12171B]/95 p-5 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-center text-sm sm:text-base font-bold text-[#F3F4F6]">
          房卡不足提醒
        </h3>

        <p className="mt-2 text-center text-xs text-[#9CA3AF] leading-relaxed">
          进入 <strong className="text-[#F3F4F6]">{targetTier.name}</strong> 需消耗{' '}
          <strong className="font-mono text-[#FBBF24]">{requiredCards}</strong> 张房卡（初始积分{' '}
          {initialScore.toLocaleString()}）
        </p>

        <div className="mt-3 flex items-center justify-around rounded-xl border border-white/[0.07] bg-white/[0.03] py-2 px-3 text-xs">
          <div>
            <span className="text-[#9CA3AF]">当前：</span>
            <span className="font-mono font-bold text-[#F3F4F6]">
              {currentBeans.toLocaleString()} 张
            </span>
          </div>
          <div className="h-3.5 w-px bg-white/10" />
          <div>
            <span className="text-[#9CA3AF]">差额：</span>
            <span className="font-mono font-bold text-[#F87171]">
              -{shortfall.toLocaleString()} 张
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 px-3 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-[#9CA3AF] hover:text-[#F3F4F6] transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(720);
              hapticEngine.tap();
              onEnterRecommendedTier();
              onClose();
            }}
            className="h-8.5 px-3 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
          >
            前往{recommendedTier.name}
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playPowerChime(2);
              hapticEngine.tap();
              onClaimSupply();
              onClose();
            }}
            className="h-8.5 px-3.5 rounded-lg bg-[#D49B35] hover:bg-[#E0A842] text-xs font-bold text-[#111315] transition-colors active:scale-98 cursor-pointer"
          >
            免费补充 (+5)
          </button>
        </div>
      </div>
    </div>
  );
};
