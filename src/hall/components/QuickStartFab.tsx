import React from 'react';
import { Sparkles } from 'lucide-react';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';

export interface QuickStartFabProps {
  onQuickStart: () => void;
  recommendedScore?: number;
}

export const QuickStartFab: React.FC<QuickStartFabProps> = ({
  onQuickStart,
  recommendedScore = 300,
}) => {
  const handleClick = () => {
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    onQuickStart();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group relative flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
      title="快速开局（智能匹配最适场次）"
    >
      {/* Outer Golden Glow */}
      <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-amber-300 opacity-70 blur-md transition-opacity duration-300 group-hover:opacity-100 animate-pulse" />

      {/* Button Body with official extracted texture */}
      <div className="relative flex h-11 items-center gap-2 rounded-full border-2 border-amber-200 bg-gradient-to-r from-[#ffe082] via-[#f59e0b] to-[#ea580c] px-4.5 py-1.5 shadow-[0_6px_20px_rgba(245,158,11,0.5),inset_0_2px_4px_rgba(255,255,255,0.7)] sm:h-12 sm:px-6">
        <Sparkles className="h-5 w-5 shrink-0 fill-amber-100 text-[#78350f] animate-spin" style={{ animationDuration: '6s' }} />
        <span className="font-display text-sm font-black tracking-wider text-[#3d1a04] drop-shadow-xs sm:text-base whitespace-nowrap">
          快速开局
        </span>
        <span className="rounded-full bg-[#78350f]/25 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#3d1a04] sm:text-xs">
          底分 {recommendedScore}
        </span>
      </div>
    </button>
  );
};
