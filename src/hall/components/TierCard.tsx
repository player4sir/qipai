import React from 'react';
import { RoomTier, RoomTierConfig } from '../../games/ddz/types';

export interface CommercialTierCardSpec {
  tierId: RoomTier;
  title: string;
  capLabel: string;
  beanRangeText: string;
  puzzleStageTitle: string;
  puzzleLevelIdx: number;
  puzzleReward: number;
  baseOnline: number;
  cardGradient: string;
  borderColor: string;
  ribbonBg: string;
  pillBg: string;
  bottomPillBg: string;
  titleStroke: string;
  titleShadow: string;
  emblemType: 'rookie' | 'primary' | 'middle' | 'high';
}

export const COMMERCIAL_TIER_SPECS: CommercialTierCardSpec[] = [
  {
    tierId: 'rookie',
    title: '新手场',
    capLabel: '32倍封顶',
    beanRangeText: '1卡 · 2000初始分',
    puzzleStageTitle: '第一关 · 引蛇出洞',
    puzzleLevelIdx: 0,
    puzzleReward: 5,
    baseOnline: 2180,
    cardGradient: 'from-[#34c395] to-[#167a57]',
    borderColor: 'border-[#7ce8c3]/80',
    ribbonBg: 'from-[#0d9488] to-[#059669]',
    pillBg: 'bg-black/22',
    bottomPillBg: 'bg-black/20 border-white/15',
    titleStroke: '#105c40',
    titleShadow: '#073624',
    emblemType: 'rookie',
  },
  {
    tierId: 'primary',
    title: '初级场',
    capLabel: '64倍封顶',
    beanRangeText: '2卡 · 1万初始分',
    puzzleStageTitle: '第三关 · 拆对制胜',
    puzzleLevelIdx: 2,
    puzzleReward: 5,
    baseOnline: 3460,
    cardGradient: 'from-[#4f86f7] to-[#2347b8]',
    borderColor: 'border-[#9ec0ff]/80',
    ribbonBg: 'from-[#2563eb] to-[#1d4ed8]',
    pillBg: 'bg-black/22',
    bottomPillBg: 'bg-black/20 border-white/15',
    titleStroke: '#1b358f',
    titleShadow: '#0e1d54',
    emblemType: 'primary',
  },
  {
    tierId: 'middle',
    title: '中级场',
    capLabel: '128倍封顶',
    beanRangeText: '4卡 · 5万初始分',
    puzzleStageTitle: '第四关 · 顺子牵制',
    puzzleLevelIdx: 3,
    puzzleReward: 5,
    baseOnline: 2690,
    cardGradient: 'from-[#9b6bf2] to-[#5e2ca5]',
    borderColor: 'border-[#dec4ff]/80',
    ribbonBg: 'from-[#7c3aed] to-[#6d28d9]',
    pillBg: 'bg-black/22',
    bottomPillBg: 'bg-black/20 border-white/15',
    titleStroke: '#481d85',
    titleShadow: '#280d4f',
    emblemType: 'middle',
  },
  {
    tierId: 'high',
    title: '至尊场',
    capLabel: '256倍封顶',
    beanRangeText: '8卡 · 20万初始分',
    puzzleStageTitle: '第六关 · 绝境逢生',
    puzzleLevelIdx: 5,
    puzzleReward: 5,
    baseOnline: 1540,
    cardGradient: 'from-[#f47b4b] via-[#dc4726] to-[#991b1b]',
    borderColor: 'border-[#ffc299]/80',
    ribbonBg: 'from-[#dc2626] to-[#ea580c]',
    pillBg: 'bg-black/22',
    bottomPillBg: 'bg-black/20 border-white/15',
    titleStroke: '#7f1d09',
    titleShadow: '#450a03',
    emblemType: 'high',
  },
];

const EMBLEM_ICON_MAP: Record<CommercialTierCardSpec['emblemType'], string> = {
  rookie: '/assets/ui/icon_1.png',
  primary: '/assets/ui/icon_2.png',
  middle: '/assets/ui/icon_3.png',
  high: '/assets/ui/icon_cs.png',
};

export interface TierCardProps {
  tierCfg: RoomTierConfig;
  spec: CommercialTierCardSpec;
  isRecommended?: boolean;
  dynamicOnline: number;
  isPuzzleMode: boolean;
  canAfford?: boolean;
  onClick: () => void;
}

export const TierCard: React.FC<TierCardProps> = ({
  tierCfg,
  spec,
  isRecommended = false,
  dynamicOnline,
  isPuzzleMode,
  canAfford = true,
  onClick,
}) => {
  const cardCost = tierCfg.roomCardCost ?? tierCfg.minBeans;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        group relative mx-auto flex h-full max-h-[250px] min-h-0 w-full max-w-[205px] aspect-[3/3.85]
        landscape:max-h-[225px] landscape:max-w-[166px] landscape:aspect-[3/3.8]
        cursor-pointer flex-col items-center justify-between
        overflow-hidden rounded-[20px] sm:rounded-[24px] border-2 ${spec.borderColor}
        bg-gradient-to-b ${spec.cardGradient}
        px-3 pt-2.5 pb-2.5 text-center
        shadow-[0_10px_22px_rgba(25,12,4,0.32),inset_0_1.5px_1px_rgba(255,255,255,0.45)]
        transition-all duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:brightness-105
        ${isRecommended && !isPuzzleMode ? 'ring-2 ring-amber-300/90' : ''}
        ${canAfford ? '' : 'opacity-85'}
      `}
    >
      {/* Top Soft Radial Specular Light */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.22),transparent_70%)]" />

      {/* Top Row: Optional Recommended Tag + Compact Online Counter */}
      <div className="relative z-20 flex w-full shrink-0 items-center justify-between">
        {isRecommended && !isPuzzleMode ? (
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
          <span className="font-mono tabular-nums">{dynamicOnline.toLocaleString()}</span>
        </div>
      </div>

      {/* Center Stage: Single Clean 3D Emblem + 3D Title + Clean Unboxed Base Score */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center gap-1.5 py-0.5">
        <div className="relative flex h-13 w-16 sm:h-16 sm:w-20 landscape:h-12 landscape:w-16 items-center justify-center transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-106 pointer-events-none">
          <img
            src={EMBLEM_ICON_MAP[spec.emblemType]}
            alt=""
            className="h-full w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.35)]"
            draggable={false}
          />
        </div>

        {/* 3D Outlined Title */}
        <h3
          className="font-display text-[clamp(1.25rem,4vw,1.75rem)] leading-none font-black tracking-wider text-white whitespace-nowrap landscape:text-[clamp(1.15rem,2.6vw,1.5rem)]"
          style={{
            textShadow: `0 1.5px 0 ${spec.titleStroke}, 0 -1px 0 ${spec.titleStroke}, 1.5px 0 0 ${spec.titleStroke}, -1.5px 0 0 ${spec.titleStroke}, 0 3px 0 ${spec.titleShadow}, 0 4px 8px rgba(0,0,0,0.4)`,
          }}
        >
          {spec.title}
        </h3>

        {/* Clean Unboxed Base Score */}
        <div className="font-mono text-xs sm:text-sm font-extrabold text-white/95 drop-shadow-xs tabular-nums whitespace-nowrap">
          {isPuzzleMode ? spec.puzzleStageTitle : `底分 ${tierCfg.baseScore.toLocaleString()}`}
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
            isPuzzleMode
              ? 'text-amber-100'
              : canAfford
              ? 'text-amber-200'
              : 'text-rose-200'
          }`}
        >
          {isPuzzleMode
            ? `通关奖 +${spec.puzzleReward} 房卡`
            : canAfford
            ? spec.beanRangeText
            : `需 ${cardCost} 张房卡`}
        </span>
      </div>
    </button>
  );
};
