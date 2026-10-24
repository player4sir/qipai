import React, { useEffect, useMemo, useState } from 'react';

export interface ActionGlowEffectProps {
  action: 'chi' | 'peng' | 'gang' | 'hu' | 'zimo';
  relativeSeat?: number;
  subType?: 'guafeng' | 'xiayu';
  fanNames?: string[];
  onComplete?: () => void;
}

interface ActionFlipbookSpec {
  frames: string[];
  finalEmblem: string;
  primaryGlow: string;
  dragonGlow: string;
  text: string;
}

const ACTION_SPECS: Record<ActionGlowEffectProps['action'], ActionFlipbookSpec> = {
  chi: {
    frames: [
      '/assets/mahjong/effects/Chi1.png',
      '/assets/mahjong/effects/Chi2.png',
      '/assets/mahjong/effects/Chi3.png',
      '/assets/mahjong/effects/Chi4.png',
      '/assets/mahjong/effects/Chi5.png',
      '/assets/mahjong/effects/Chi6.png',
    ],
    finalEmblem: '/assets/mahjong/effects/Chi.png',
    primaryGlow: '/assets/mahjong/actions/peng_fangshe.png',
    dragonGlow: '/assets/mahjong/actions/playingdlc_shuanglong_effect_playing_group_assets_all_chi_fangshe.png',
    text: '吃',
  },
  peng: {
    frames: [
      '/assets/mahjong/effects/Peng1.png',
      '/assets/mahjong/effects/Peng2.png',
      '/assets/mahjong/effects/Peng3.png',
      '/assets/mahjong/effects/Peng4.png',
    ],
    finalEmblem: '/assets/mahjong/effects/Peng.png',
    primaryGlow: '/assets/mahjong/actions/peng_fangshe.png',
    dragonGlow: '/assets/mahjong/actions/playingdlc_shuanglong_effect_playing_group_assets_all_peng_fangshe.png',
    text: '碰',
  },
  gang: {
    frames: [
      '/assets/mahjong/effects/Gang1.png',
      '/assets/mahjong/effects/Gang2.png',
      '/assets/mahjong/effects/Gang3.png',
      '/assets/mahjong/effects/Gang4.png',
    ],
    finalEmblem: '/assets/mahjong/effects/Gang.png',
    primaryGlow: '/assets/mahjong/actions/gang_fangshe.png',
    dragonGlow: '/assets/mahjong/actions/playingdlc_shuanglong_effect_playing_group_assets_all_gang_fangshe.png',
    text: '杠',
  },
  hu: {
    frames: [
      '/assets/mahjong/effects/Hu1.png',
      '/assets/mahjong/effects/Hu2.png',
      '/assets/mahjong/effects/Hu3.png',
      '/assets/mahjong/effects/Hu4.png',
    ],
    finalEmblem: '/assets/mahjong/effects/Hu.png',
    primaryGlow: '/assets/mahjong/actions/hu_fangshe.png',
    dragonGlow: '/assets/mahjong/actions/playingdlc_shuanglong_effect_playing_group_assets_all_hu_fangshe.png',
    text: '胡',
  },
  zimo: {
    frames: [
      '/assets/mahjong/effects/Zm1.png',
      '/assets/mahjong/effects/Zm2.png',
      '/assets/mahjong/effects/Zm3.png',
      '/assets/mahjong/effects/Zm4.png',
      '/assets/mahjong/effects/Zm5.png',
      '/assets/mahjong/effects/Zm6.png',
      '/assets/mahjong/effects/Zm7.png',
      '/assets/mahjong/effects/Zm8.png',
    ],
    finalEmblem: '/assets/mahjong/effects/Zm.png',
    primaryGlow: '/assets/mahjong/actions/zimo_fangshe.png',
    dragonGlow: '/assets/mahjong/actions/playingdlc_shuanglong_effect_playing_group_assets_all_zimo_fangshe.png',
    text: '自摸',
  },
};

function resolvePatternBannerLabel(
  action: ActionGlowEffectProps['action'],
  fanNames?: string[]
): string | null {
  if (action !== 'hu' && action !== 'zimo') return null;
  const joined = (fanNames || []).join(' ');
  if (joined.includes('天胡')) return '天胡 · 极品番型';
  if (joined.includes('地胡')) return '地胡 · 奇牌番型';
  if (joined.includes('清一色')) return '清一色 · 高番大胡';
  if (joined.includes('一条龙')) return '一条龙 · 满贯大胡';
  if (joined.includes('七对') || joined.includes('四红中')) return '精巧大牌 · 翻倍大胡';
  if (joined.includes('大对子') || joined.includes('碰碰胡')) return '大对子 · 强力番型';
  if (action === 'zimo') return '自摸 · 三家付分';
  return '胡牌 · 旗开得胜';
}

export const ActionGlowEffect: React.FC<ActionGlowEffectProps> = ({
  action,
  relativeSeat,
  subType,
  fanNames,
  onComplete,
}) => {
  const [visible, setVisible] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const spec = ACTION_SPECS[action] || ACTION_SPECS.hu;

  const sequence = useMemo(() => [...spec.frames, spec.finalEmblem], [spec]);
  const patternBannerLabel = useMemo(
    () => resolvePatternBannerLabel(action, fanNames),
    [action, fanNames]
  );

  // Preload flipbook frames & step through sequence at 55ms/frame
  useEffect(() => {
    sequence.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
    setFrameIndex(0);

    const frameInterval = window.setInterval(() => {
      setFrameIndex((prev) => (prev < sequence.length - 1 ? prev + 1 : prev));
    }, 55);

    const finishTimer = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 1550);

    return () => {
      window.clearInterval(frameInterval);
      window.clearTimeout(finishTimer);
    };
  }, [sequence, onComplete]);

  if (!visible) return null;

  const seatOffsetClass =
    relativeSeat === 1
      ? 'translate-x-24 sm:translate-x-36'
      : relativeSeat === 2
      ? '-translate-y-20 sm:-translate-y-28'
      : relativeSeat === 3
      ? '-translate-x-24 sm:-translate-x-36'
      : 'translate-y-8';

  const currentFrameSrc = sequence[Math.min(frameIndex, sequence.length - 1)];

  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center animate-in fade-in duration-150">
      <div className={`relative flex items-center justify-center ${seatOffsetClass}`}>
        {/* 1. Outer Shuanglong Dragon Radial Burst */}
        <img
          src={spec.dragonGlow}
          alt=""
          className="h-80 w-80 sm:h-104 sm:w-104 object-contain animate-[spin_9s_linear_infinite] opacity-85 drop-shadow-[0_0_40px_rgba(251,191,36,0.75)]"
        />

        {/* 2. Inner Counter-Rotating Golden Ray Burst */}
        <img
          src={spec.primaryGlow}
          alt=""
          className="absolute h-64 w-64 sm:h-84 sm:w-84 object-contain animate-[spin_5s_linear_infinite_reverse] opacity-90"
        />

        {/* 3. Concentric Golden Halo */}
        <div className="absolute h-44 w-44 sm:h-60 sm:w-60 rounded-full bg-amber-400/30 blur-2xl animate-pulse" />

        {/* 4. Wind (刮风) / Rain (下雨) Vector Overlay for Kong (杠) */}
        {action === 'gang' && (
          <svg
            viewBox="0 0 240 240"
            className="pointer-events-none absolute h-64 w-64 sm:h-80 sm:w-80 overflow-visible"
          >
            {subType === 'xiayu' ? (
              <g stroke="rgba(125,211,252,0.85)" strokeWidth="2.5" strokeLinecap="round">
                <line x1="55" y1="25" x2="40" y2="85" className="animate-pulse" />
                <line x1="95" y1="15" x2="80" y2="75" />
                <line x1="145" y1="20" x2="130" y2="80" className="animate-pulse" />
                <line x1="185" y1="30" x2="170" y2="90" />
                <line x1="75" y1="140" x2="60" y2="200" />
                <line x1="165" y1="145" x2="150" y2="205" className="animate-pulse" />
              </g>
            ) : (
              <g
                fill="none"
                stroke="rgba(253,230,138,0.85)"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <path d="M 30 95 Q 115 45 205 85" />
                <path d="M 20 135 Q 120 185 215 130" />
              </g>
            )}
          </svg>
        )}

        {/* 5. Multi-Frame Flipbook Action Emblem */}
        <div className="absolute flex flex-col items-center justify-center">
          <img
            src={currentFrameSrc}
            alt={spec.text}
            className="h-28 sm:h-38 w-auto object-contain drop-shadow-[0_14px_30px_rgba(0,0,0,0.9)] transition-transform duration-75 scale-110"
          />

          {/* 6. Clean Pattern Callout Plaque for Hu / Zimo */}
          {patternBannerLabel && (
            <span className="-mt-1 rounded-full border border-[#FFD700]/80 bg-gradient-to-r from-[#2e1705]/95 via-[#4d2809]/95 to-[#2e1705]/95 px-4 py-1 font-display text-xs sm:text-sm font-black tracking-widest text-[#FFD700] shadow-[0_6px_20px_rgba(0,0,0,0.85)] animate-in zoom-in-75 duration-200">
              {patternBannerLabel}
            </span>
          )}

          {/* 7. Sub-type Callout Tag for Guafeng / Xiayu */}
          {action === 'gang' && subType && (
            <span className="-mt-1 rounded-full border border-amber-300/80 bg-[#1a0f07]/90 px-3 py-0.5 font-display text-xs font-black tracking-widest text-amber-200 shadow-lg">
              {subType === 'xiayu' ? '下雨 · 暗杠收三家' : '刮风 · 明杠'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

