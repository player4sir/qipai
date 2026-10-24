import React from 'react';
import { AlertCircle, Gift, Play, X } from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-[#2a170e] via-[#1a0e08] to-[#120804] p-5 text-white shadow-[0_12px_36px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-400/20 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-400" />
            <h3 className="font-display text-lg font-black text-amber-200">
              房卡准入提醒
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 space-y-3.5 text-center">
          <div className="rounded-2xl border border-amber-400/30 bg-[#2e1206]/80 p-3.5 shadow-inner">
            <p className="text-xs text-amber-100/90 leading-relaxed sm:text-sm">
              进入【<span className="font-black text-amber-300">{targetTier.name}</span>】需消耗{' '}
              <span className="font-mono font-black text-amber-300">
                {requiredCards}
              </span>{' '}
              张通用房卡（配发 {initialScore.toLocaleString()} 初始积分）
            </p>
            <div className="mt-2 flex items-center justify-around rounded-xl bg-black/40 py-2 px-3 text-xs">
              <div>
                <span className="text-white/60">当前房卡：</span>
                <span className="font-mono font-black text-white">
                  {currentBeans.toLocaleString()} 张
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <div>
                <span className="text-amber-300/80">准入差额：</span>
                <span className="font-mono font-black text-rose-400">
                  -{shortfall.toLocaleString()} 张
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/70">
            当前通用房卡不足以开启该场次，您可以立即免费领取房卡补给或前往推荐场次开局！
          </p>

          {/* Action buttons */}
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                soundEngine.playPowerChime(2);
                hapticEngine.tap();
                onClaimSupply();
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 py-2.5 font-display text-sm font-black text-[#18181B] shadow-lg hover:brightness-105 active:scale-95 cursor-pointer"
            >
              <Gift className="h-4 w-4 stroke-[2.5]" />
              <span>免费补充房卡 (+5张)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(720);
                hapticEngine.tap();
                onEnterRecommendedTier();
                onClose();
              }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-emerald-400/50 bg-emerald-800/80 py-2.5 font-display text-sm font-bold text-white shadow hover:bg-emerald-700 active:scale-95 cursor-pointer"
            >
              <Play className="h-4 w-4 fill-white" />
              <span>前往{recommendedTier.name}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
