import React from 'react';
import { RoomTierConfig } from '../../games/ddz/types';

export interface CommercialTierCardSpec {
  tierKey: string;
  title: string;
  subtitle: string;
  puzzleLevelIdx: number;
  onlineCount: number;
  bgGradient: string;
  borderClass: string;
}

export const TIER_CARD_SPECS: CommercialTierCardSpec[] = [
  {
    tierKey: 'rookie',
    title: '新手场',
    subtitle: '轻松上手',
    puzzleLevelIdx: 0,
    onlineCount: 3420,
    bgGradient: 'from-[#238a5d] to-[#115035]',
    borderClass: 'border-emerald-300/60',
  },
  {
    tierKey: 'primary',
    title: '初级场',
    subtitle: '牌技切磋',
    puzzleLevelIdx: 1,
    onlineCount: 2890,
    bgGradient: 'from-[#2878b5] to-[#13426b]',
    borderClass: 'border-sky-300/60',
  },
  {
    tierKey: 'middle',
    title: '中级场',
    subtitle: '高手云集',
    puzzleLevelIdx: 2,
    onlineCount: 1960,
    bgGradient: 'from-[#9d4edd] to-[#4a1875]',
    borderClass: 'border-purple-300/60',
  },
  {
    tierKey: 'high',
    title: '高级场',
    subtitle: '巅峰博弈',
    puzzleLevelIdx: 3,
    onlineCount: 1280,
    bgGradient: 'from-[#e06d2b] to-[#7c2d12]',
    borderClass: 'border-amber-300/70',
  },
];

export interface TierCardProps {
  tierCfg: RoomTierConfig;
  spec: CommercialTierCardSpec;
  isRecommended?: boolean;
  onClick: () => void;
}

export const TierCard: React.FC<TierCardProps> = ({
  tierCfg,
  spec,
  isRecommended,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-[138px] sm:h-[156px] w-full flex-col justify-between overflow-hidden rounded-2xl border-2 ${spec.borderClass} bg-gradient-to-b ${spec.bgGradient} p-3.5 text-left text-white shadow-xl transition-transform duration-150 hover:brightness-105 active:scale-95 cursor-pointer`}
    >
      {isRecommended && (
        <span className="absolute top-2.5 right-2.5 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black text-[#18181B] shadow">
          推荐
        </span>
      )}
      <div>
        <div className="font-display text-base sm:text-lg font-black tracking-wide text-white drop-shadow">
          {tierCfg.name || spec.title}
        </div>
        <div className="mt-0.5 text-xs text-white/80 truncate">
          {spec.subtitle} · 封顶 {tierCfg.maxMultiplier} 倍
        </div>
      </div>

      <div className="border-t border-white/15 pt-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-white/75">底分</span>
          <span className="font-mono text-sm sm:text-base font-black text-amber-300 tabular-nums">
            {tierCfg.baseScore.toLocaleString()}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-white/75">
          <span>计分</span>
          <span className="font-mono tabular-nums">积分零和结算</span>
        </div>
      </div>
    </button>
  );
};
