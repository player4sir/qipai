import React, { useEffect, useState } from 'react';
import { MahjongSuit } from '../types';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface DingQueOverlayProps {
  recommendedSuit: MahjongSuit;
  onSelectSuit: (suit: MahjongSuit) => void;
}

export const DingQueOverlay: React.FC<DingQueOverlayProps> = ({
  recommendedSuit,
  onSelectSuit,
}) => {
  const [countdown, setCountdown] = useState<number>(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onSelectSuit(recommendedSuit);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [recommendedSuit, onSelectSuit]);

  const suits: Array<{ id: MahjongSuit; name: string; icon: string }> = [
    { id: 0, name: '定缺 · 万', icon: '/assets/mahjong/ui/dk_mjp_2.png' },
    { id: 1, name: '定缺 · 条', icon: '/assets/mahjong/ui/dk_mjp_1.png' },
    { id: 2, name: '定缺 · 筒', icon: '/assets/mahjong/ui/dk_mjp_3.png' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex w-[320px] sm:w-[350px] flex-col items-center rounded-2xl border border-white/10 bg-[#12171B]/95 p-5 text-center text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-bold text-[#F3F4F6]">
          请选择定缺门类 ({countdown}s)
        </h3>

        <div className="mt-4 grid grid-cols-3 gap-2.5 w-full">
          {suits.map((s) => {
            const isRec = s.id === recommendedSuit;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  soundEngine.playTap(760);
                  hapticEngine.tap();
                  onSelectSuit(s.id);
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl border p-3 transition-transform active:scale-95 cursor-pointer ${
                  isRec
                    ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 ring-1 ring-[#D4AF37]/40'
                    : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08]'
                }`}
              >
                {isRec && (
                  <span className="absolute -top-2 rounded bg-[#D49B35] px-1.5 py-0.5 text-[9px] font-bold text-[#111315]">
                    推荐
                  </span>
                )}
                <img
                  src={s.icon}
                  alt={s.name}
                  className="h-10 w-10 object-contain"
                />
                <span className="mt-1.5 text-xs font-bold text-[#F3F4F6]">
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
