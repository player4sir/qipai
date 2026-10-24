import React, { useState } from 'react';
import { Play } from 'lucide-react';

export interface MahjongTierSpec {
  id: string;
  title: string;
  baseScore: number;
  minBeans: number;
  subtitle: string;
  bgGradient: string;
  borderClass: string;
}

export interface MahjongArenaGridProps {
  myBeans: number;
  isMobileLandscape?: boolean;
  onSelectTier: (baseScore: number, mode: string) => void;
  onQuickStart: (baseScore: number, mode: string) => void;
  onInsufficientBeans: (tier: MahjongTierSpec) => void;
}

const MAHJONG_MODES = [
  { id: 'puer', label: '普洱麻将' },
  { id: 'hongzhong', label: '红中赖子' },
  { id: 'xuezhan', label: '血战到底' },
  { id: 'guobiao', label: '大众国标' },
];

const MAHJONG_TIERS: MahjongTierSpec[] = [
  {
    id: 'novice',
    title: '茶马新手场',
    baseScore: 100,
    minBeans: 1000,
    subtitle: '轻松算番 · 零压力',
    bgGradient: 'from-[#1f8a65] to-[#0f4d36]',
    borderClass: 'border-emerald-300/60',
  },
  {
    id: 'primary',
    title: '思茅初级场',
    baseScore: 300,
    minBeans: 3000,
    subtitle: '茶山根翻倍 · 爽快自摸',
    bgGradient: 'from-[#2574a9] to-[#123d5e]',
    borderClass: 'border-sky-300/60',
  },
  {
    id: 'middle',
    title: '景迈中级场',
    baseScore: 800,
    minBeans: 8000,
    subtitle: '清一色龙七对 · 高番博弈',
    bgGradient: 'from-[#8e44ad] to-[#4a1c60]',
    borderClass: 'border-purple-300/60',
  },
  {
    id: 'high',
    title: '雀圣巅峰场',
    baseScore: 2000,
    minBeans: 20000,
    subtitle: '高手过招 · 满番封顶',
    bgGradient: 'from-[#d35400] to-[#6e2c00]',
    borderClass: 'border-amber-300/70',
  },
];

export const MahjongArenaGrid: React.FC<MahjongArenaGridProps> = ({
  myBeans,
  onSelectTier,
  onQuickStart,
  onInsufficientBeans,
}) => {
  const [selectedMode, setSelectedMode] = useState<string>('puer');

  return (
    <div className="my-auto mx-auto flex w-full max-w-[760px] flex-col items-center justify-center gap-4 py-2 sm:gap-5">
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-4 gap-2">
        {MAHJONG_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedMode(m.id)}
            className={`flex h-9 sm:h-10 items-center justify-center rounded-xl px-2 text-xs sm:text-sm font-black transition-all cursor-pointer whitespace-nowrap truncate ${
              selectedMode === m.id
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#1e0d04] shadow-lg'
                : 'border border-amber-200/25 bg-black/50 text-amber-100 hover:bg-black/70'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid w-full max-w-[740px] grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
        {MAHJONG_TIERS.map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => onSelectTier(tier.baseScore, selectedMode)}
            className={`flex h-[138px] sm:h-[156px] w-full flex-col justify-between rounded-2xl border-2 ${tier.borderClass} bg-gradient-to-b ${tier.bgGradient} p-3.5 text-left text-white shadow-xl transition-transform duration-150 hover:brightness-105 active:scale-95 cursor-pointer`}
          >
            <div>
              <div className="font-display text-base sm:text-lg font-black">{tier.title}</div>
              <div className="mt-0.5 text-[11px] sm:text-xs text-white/80 truncate">{tier.subtitle}</div>
            </div>
            <div className="border-t border-white/15 pt-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-white/75">底分</span>
                <span className="font-mono text-sm sm:text-base font-black text-amber-300 tabular-nums">
                  {tier.baseScore}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between text-[11px] text-white/75">
                <span>计分</span>
                <span className="font-mono tabular-nums">积分零和结算</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => onQuickStart(100, selectedMode)}
          className="flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 px-8 font-display text-sm font-black text-[#261300] shadow-xl hover:brightness-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>快速开始</span>
        </button>
      </div>
    </div>
  );
};
