import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { soundEngine } from '../../shared/audio/SoundEngine';

export interface NiuniuTierSpec {
  id: string;
  title: string;
  subtitle: string;
  baseScore: number;
  minBeans: number;
  bgGradient: string;
  borderClass: string;
}

export interface NiuniuArenaGridProps {
  myBeans: number;
  isMobileLandscape?: boolean;
  onSelectTier: (baseScore: number, mode: string) => void;
  onQuickStart: (baseScore: number, mode: string) => void;
  onInsufficientBeans: (tier: NiuniuTierSpec) => void;
}

const NIUNIU_MODES = [
  { id: 'qiangzhuang', label: '看牌抢庄', capDesc: '4明1暗 · 最高10倍' },
  { id: 'tongbi', label: '通比牛牛', capDesc: '全员亮牌 · 极速通杀' },
  { id: 'crazy', label: '疯狂加倍', capDesc: '牛五起翻 · 顺金12倍' },
  { id: 'classic', label: '经典算牛', capDesc: '3+2凑十 · 稳健竞技' },
];

const NIUNIU_TIERS: NiuniuTierSpec[] = [
  {
    id: 'n1',
    title: '新手牛牛场',
    subtitle: '轻松算牛 · 零压力',
    baseScore: 100,
    minBeans: 1000,
    bgGradient: 'from-[#1f8a65] to-[#0f4d36]',
    borderClass: 'border-emerald-300/60',
  },
  {
    id: 'n2',
    title: '初级抢庄场',
    subtitle: '4明1暗 · 智取庄位',
    baseScore: 300,
    minBeans: 3000,
    bgGradient: 'from-[#2574a9] to-[#123d5e]',
    borderClass: 'border-sky-300/60',
  },
  {
    id: 'n3',
    title: '中级看牌场',
    subtitle: '高倍博弈 · 炸弹五花',
    baseScore: 800,
    minBeans: 8000,
    bgGradient: 'from-[#8e44ad] to-[#4a1c60]',
    borderClass: 'border-purple-300/60',
  },
  {
    id: 'n4',
    title: '至尊同花顺场',
    subtitle: '五小同花顺 · 巅峰对决',
    baseScore: 2000,
    minBeans: 20000,
    bgGradient: 'from-[#d35400] to-[#6e2c00]',
    borderClass: 'border-amber-300/70',
  },
];

export const NiuniuArenaGrid: React.FC<NiuniuArenaGridProps> = ({
  myBeans,
  onSelectTier,
  onQuickStart,
  onInsufficientBeans,
}) => {
  const [selectedMode, setSelectedMode] = useState<string>('qiangzhuang');
  const activeModeObj = NIUNIU_MODES.find((m) => m.id === selectedMode) || NIUNIU_MODES[0];

  const recommendedTier =
    [...NIUNIU_TIERS].reverse().find((t) => myBeans >= t.minBeans * 2) || NIUNIU_TIERS[0];

  return (
    <div className="my-auto mx-auto flex w-full max-w-[760px] flex-col items-center justify-center gap-4 py-2 sm:gap-5">
      {/* Top 4-Mode Segmented Bar */}
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-4 gap-2">
        {NIUNIU_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              soundEngine.playTap(720);
              setSelectedMode(m.id);
            }}
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

      {/* 4 Commercial Tier Cards */}
      <div className="grid w-full max-w-[740px] grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
        {NIUNIU_TIERS.map((tier, idx) => {
          const isRec = idx === 1;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => {
                soundEngine.playTap(760);
                onSelectTier(tier.baseScore, selectedMode);
              }}
              className={`relative flex h-[138px] sm:h-[156px] w-full flex-col justify-between rounded-2xl border-2 ${tier.borderClass} bg-gradient-to-b ${tier.bgGradient} p-3.5 text-left text-white shadow-xl transition-transform duration-150 hover:brightness-105 active:scale-95 cursor-pointer`}
            >
              {isRec && (
                <span className="absolute top-2.5 right-2.5 rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black text-[#18181B] shadow">
                  推荐
                </span>
              )}
              <div>
                <div className="font-display text-base sm:text-lg font-black">{tier.title}</div>
                <div className="mt-0.5 text-[11px] sm:text-xs text-white/80 truncate">
                  {tier.subtitle}
                </div>
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
          );
        })}
      </div>

      {/* Bottom Quick Start CTA */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(820);
            onQuickStart(recommendedTier.baseScore, selectedMode);
          }}
          className="flex h-11 min-w-[180px] items-center justify-center gap-2 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 px-8 font-display text-sm font-black text-[#261300] shadow-xl hover:brightness-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Play className="h-4 w-4 fill-current" />
          <span>快速开始 · {activeModeObj.label}</span>
        </button>
      </div>
    </div>
  );
};
