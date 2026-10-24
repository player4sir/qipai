import React, { useState } from 'react';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { LaoYanCaiPlayMode, LaoYanCaiTierConfig } from '../../games/laoyancai/types';

export const LAOYANCAI_MODES: Array<{
  id: LaoYanCaiPlayMode;
  label: string;
  onlineFactor: number;
}> = [
  {
    id: 'kunming',
    label: '昆明抢庄',
    onlineFactor: 1.3,
  },
  {
    id: 'yuxi',
    label: '玉溪坐庄',
    onlineFactor: 1.05,
  },
  {
    id: 'crazy',
    label: '血战高倍',
    onlineFactor: 1.45,
  },
];

export const LAOYANCAI_TIERS: LaoYanCaiTierConfig[] = [
  {
    id: 'lyc_rookie',
    title: '新手场',
    baseScore: 100,
    minBeans: 1,
    capLabel: '1卡 · 2000初始分',
    onlineBase: 2180,
    emblemIcon: '/assets/ui/icon_1.png',
    theme: {
      bgGradient: 'from-[#28b88a] to-[#0f6b4c]',
      borderColor: 'border-[#7ee8c4]/80',
      glowColor: 'bg-emerald-400/20',
      titleColor: '#ffffff',
      titleStroke: '#0b4f37',
      titleShadow: '#052b1d',
      pillBg: 'bg-black/22',
    },
  },
  {
    id: 'lyc_primary',
    title: '初级场',
    baseScore: 500,
    minBeans: 2,
    capLabel: '2卡 · 1万初始分',
    onlineBase: 3420,
    emblemIcon: '/assets/ui/icon_2.png',
    theme: {
      bgGradient: 'from-[#4292f3] to-[#1d46b0]',
      borderColor: 'border-[#9ec7ff]/80',
      glowColor: 'bg-blue-400/20',
      titleColor: '#ffffff',
      titleStroke: '#163487',
      titleShadow: '#0b1b4a',
      pillBg: 'bg-black/22',
    },
  },
  {
    id: 'lyc_advanced',
    title: '中级场',
    baseScore: 2000,
    minBeans: 4,
    capLabel: '4卡 · 5万初始分',
    onlineBase: 2690,
    emblemIcon: '/assets/ui/icon_3.png',
    theme: {
      bgGradient: 'from-[#a673f5] to-[#632db0]',
      borderColor: 'border-[#e2c7ff]/80',
      glowColor: 'bg-purple-400/20',
      titleColor: '#ffffff',
      titleStroke: '#481d85',
      titleShadow: '#260c4a',
      pillBg: 'bg-black/22',
    },
  },
  {
    id: 'lyc_master',
    title: '大师场',
    baseScore: 10000,
    minBeans: 8,
    capLabel: '8卡 · 20万初始分',
    onlineBase: 1680,
    emblemIcon: '/assets/ui/icon_cs.png',
    theme: {
      bgGradient: 'from-[#f58248] via-[#de4924] to-[#991b1b]',
      borderColor: 'border-[#ffc59e]/80',
      glowColor: 'bg-amber-400/25',
      titleColor: '#ffffff',
      titleStroke: '#7f1d09',
      titleShadow: '#450a03',
      pillBg: 'bg-black/22',
    },
  },
];

export interface LaoYanCaiArenaGridProps {
  myBeans: number;
  myRoomCards?: number;
  isMobileLandscape?: boolean;
  onSelectTier: (baseScore: number, mode: LaoYanCaiPlayMode) => void;
  onQuickStart?: (baseScore?: number, mode?: LaoYanCaiPlayMode) => void;
  onInsufficientBeans: (tier: LaoYanCaiTierConfig) => void;
}

export const LaoYanCaiArenaGrid: React.FC<LaoYanCaiArenaGridProps> = ({
  myRoomCards = 28,
  onSelectTier,
  onInsufficientBeans,
}) => {
  const [activeMode, setActiveMode] = useState<LaoYanCaiPlayMode>('kunming');
  const activeModeMeta =
    LAOYANCAI_MODES.find((m) => m.id === activeMode) ?? LAOYANCAI_MODES[0];

  const handleCardClick = (tier: LaoYanCaiTierConfig) => {
    soundEngine.playTap(760);
    hapticEngine.tap();
    if (myRoomCards < tier.minBeans) {
      onInsufficientBeans(tier);
      return;
    }
    onSelectTier(tier.baseScore, activeMode);
  };

  const recommendedTierId =
    ([...LAOYANCAI_TIERS].reverse().find((t) => myRoomCards >= t.minBeans) ??
      LAOYANCAI_TIERS[0]).id;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-between overflow-hidden select-none px-1 py-1 sm:py-2">
      {/* 1. CLEAN COMMERCIAL 3-MODE SWITCHER BAR */}
      <div className="mx-auto grid w-full max-w-[min(430px,calc((100dvh-132px)*0.8))] sm:max-w-[460px] shrink-0 grid-cols-3 gap-1.5 rounded-2xl border border-amber-200/25 bg-[#1e120a]/80 p-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.45),0_4px_12px_rgba(0,0,0,0.25)] backdrop-blur-md sm:gap-2 sm:p-1.5 landscape:max-w-[560px]">
        {LAOYANCAI_MODES.map((m) => {
          const active = activeMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                soundEngine.playTap(780);
                hapticEngine.selectCard();
                setActiveMode(m.id);
              }}
              className={`relative flex h-8.5 items-center justify-center rounded-xl px-2 transition-all duration-150 active:scale-[0.98] sm:h-9.5 cursor-pointer ${
                active
                  ? 'border border-amber-200 bg-gradient-to-b from-[#ffe48a] via-[#f59e0b] to-[#d97706] text-[#1f0c04] shadow-[0_2px_10px_rgba(245,158,11,0.4)]'
                  : 'border border-transparent bg-white/[0.06] text-amber-100/85 hover:bg-white/[0.12] hover:text-white'
              }`}
            >
              <span className="font-display text-xs font-black tracking-wide whitespace-nowrap sm:text-sm">
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. 4 CLEAN COMMERCIAL ARENA CARDS */}
      <div
        className="
          mx-auto my-auto grid min-h-0 w-full place-items-center
          max-w-[min(430px,calc((100dvh-132px)*0.8))] sm:max-w-[460px]
          max-h-[min(100%,540px)]
          grid-cols-2 grid-rows-2
          gap-2.5 sm:gap-3.5
          landscape:max-w-[min(700px,calc((100dvh-116px)*2.85))] landscape:max-h-[240px] landscape:grid-cols-4 landscape:grid-rows-1 landscape:gap-3
        "
      >
        {LAOYANCAI_TIERS.map((tier) => {
          const canAfford = myRoomCards >= tier.minBeans;
          const isRecommended = tier.id === recommendedTierId;
          const dynamicOnline = Math.round(
            tier.onlineBase * activeModeMeta.onlineFactor
          );

          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleCardClick(tier)}
              className={`
                group relative mx-auto flex h-full max-h-[250px] min-h-0 w-full max-w-[205px] aspect-[3/3.85]
                landscape:max-h-[225px] landscape:max-w-[166px] landscape:aspect-[3/3.8]
                cursor-pointer flex-col items-center justify-between
                overflow-hidden rounded-[20px] sm:rounded-[24px] border-2 ${tier.theme.borderColor}
                bg-gradient-to-b ${tier.theme.bgGradient}
                px-3 pt-2.5 pb-2.5 text-center
                shadow-[0_10px_22px_rgba(25,12,4,0.32),inset_0_1.5px_1px_rgba(255,255,255,0.45)]
                transition-all duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:brightness-105
                ${isRecommended ? 'ring-2 ring-amber-300/90' : ''}
                ${canAfford ? '' : 'opacity-85'}
              `}
            >
              {/* Soft Top Specular Highlight */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.22),transparent_70%)]" />

              {/* Top Row: Recommended Tag + Compact Online Counter */}
              <div className="relative z-20 flex w-full shrink-0 items-center justify-between">
                {isRecommended ? (
                  <span className="rounded-md bg-amber-300/95 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-[#2b1405] shadow-xs">
                    推荐
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-1 rounded-full bg-black/22 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-white/95 backdrop-blur-xs">
                  <img
                    src="/assets/ui/icon_online.png"
                    alt="在线"
                    className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 object-contain brightness-0 invert opacity-95"
                  />
                  <span className="font-mono tabular-nums">
                    {dynamicOnline.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Center Stage: Single Clean 3D Emblem + 3D Title + Base Score */}
              <div className="relative z-10 my-auto flex flex-col items-center justify-center gap-1.5 py-0.5">
                <div className="relative flex h-13 w-16 sm:h-16 sm:w-20 landscape:h-12 landscape:w-16 items-center justify-center transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-106 pointer-events-none">
                  <img
                    src={tier.emblemIcon}
                    alt=""
                    className="h-full w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
                    draggable={false}
                  />
                </div>

                <h3
                  className="font-display text-[clamp(1.25rem,4vw,1.75rem)] leading-none font-black tracking-wider text-white whitespace-nowrap landscape:text-[clamp(1.15rem,2.6vw,1.5rem)]"
                  style={{
                    textShadow: `0 1.5px 0 ${tier.theme.titleStroke}, 0 -1px 0 ${tier.theme.titleStroke}, 1.5px 0 0 ${tier.theme.titleStroke}, -1.5px 0 0 ${tier.theme.titleStroke}, 0 3px 0 ${tier.theme.titleShadow}, 0 4px 8px rgba(0,0,0,0.4)`,
                  }}
                >
                  {tier.title}
                </h3>

                <div className="font-mono text-xs sm:text-sm font-extrabold text-white/95 drop-shadow-xs tabular-nums whitespace-nowrap">
                  底分 {tier.baseScore.toLocaleString()}
                </div>
              </div>

              {/* Bottom Clean Unboxed Room Card & Initial Score Line */}
              <div className="relative z-20 flex w-full shrink-0 items-center justify-center gap-1 border-t border-white/20 pt-2 font-mono text-[11px] sm:text-xs font-extrabold">
                <img
                  src="/assets/ui/zjm_icon_jinka.png"
                  alt="房卡"
                  className="h-3.5 w-3.5 shrink-0 object-contain drop-shadow"
                />
                <span
                  className={`tabular-nums whitespace-nowrap ${
                    canAfford ? 'text-amber-200' : 'text-rose-200'
                  }`}
                >
                  {canAfford
                    ? tier.capLabel
                    : `需 ${tier.minBeans} 张房卡`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
