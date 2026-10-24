import React from 'react';
import { LaoYanCaiCard } from '../types';

export type LaoYanCaiSpecialHighlight =
  | 'BAOZI'
  | 'SANGONG'
  | 'STRAIGHT_FLUSH'
  | 'ZHAKAI'
  | null;

export interface LaoYanCaiCardViewProps {
  card?: LaoYanCaiCard;
  faceDown?: boolean;
  isThirdDrawnCard?: boolean;
  isZhaKaiHighlight?: boolean;
  specialHighlight?: LaoYanCaiSpecialHighlight;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

const SUIT_ASSET_PREFIX: Record<string, string> = {
  spade: 'Card_Spade_',
  heart: 'Card_Heart_',
  club: 'Card_Club_',
  diamond: 'Card_Diamond_',
};

const RANK_STRINGS: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export const LaoYanCaiCardView: React.FC<LaoYanCaiCardViewProps> = ({
  card,
  faceDown = false,
  isThirdDrawnCard = false,
  isZhaKaiHighlight = false,
  specialHighlight = null,
  size = 'md',
  className = '',
  style = {},
}) => {
  const isBack = faceDown || !card || card.rank <= 0;

  const cardSrc = React.useMemo(() => {
    if (isBack) {
      return '/assets/ddz/cards/Card_Back_Default.png';
    }
    const suitKey = card.suit ? String(card.suit).toLowerCase() : 'spade';
    const prefix = SUIT_ASSET_PREFIX[suitKey] || 'Card_Spade_';
    const rankStr = RANK_STRINGS[card.rank] || String(card.rank);
    return `/assets/ddz/cards/${prefix}${rankStr}.png`;
  }, [isBack, card]);

  const sizeClasses = React.useMemo(() => {
    switch (size) {
      case 'xs':
        return 'w-[30px] h-[42px] sm:w-[34px] sm:h-[48px]';
      case 'sm':
        return 'w-[44px] h-[62px] sm:w-[50px] sm:h-[70px]';
      case 'lg':
        return 'w-[72px] h-[100px] sm:w-[82px] sm:h-[114px] md:w-[90px] md:h-[126px]';
      case 'md':
      default:
        return 'w-[54px] h-[76px] sm:w-[62px] sm:h-[86px]';
    }
  }, [size]);

  const activeSpecial = !isBack
    ? specialHighlight || (isZhaKaiHighlight ? 'ZHAKAI' : null)
    : null;

  const specialRingClasses = React.useMemo(() => {
    if (activeSpecial === 'BAOZI') {
      return 'ring-2 ring-amber-300 -translate-y-2 scale-[1.04] shadow-[0_0_24px_rgba(245,158,11,0.95),0_0_44px_rgba(220,38,38,0.65)]';
    }
    if (activeSpecial === 'SANGONG') {
      return 'ring-2 ring-fuchsia-300 -translate-y-1.5 scale-[1.03] shadow-[0_0_22px_rgba(217,70,239,0.9),0_0_38px_rgba(251,191,36,0.55)]';
    }
    if (activeSpecial === 'STRAIGHT_FLUSH') {
      return 'ring-2 ring-cyan-300 -translate-y-1.5 scale-[1.03] shadow-[0_0_22px_rgba(34,211,238,0.85)]';
    }
    if (activeSpecial === 'ZHAKAI') {
      return 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.65)]';
    }
    if (isThirdDrawnCard) {
      return 'ring-2 ring-emerald-400/90 -translate-y-1.5 shadow-[0_6px_14px_rgba(16,185,129,0.45)]';
    }
    return '';
  }, [activeSpecial, isThirdDrawnCard]);

  return (
    <div
      className={`
        relative select-none rounded-[8px] sm:rounded-[10px] transition-all duration-300
        ${sizeClasses}
        ${specialRingClasses}
        ${className}
      `}
      style={style}
    >
      {/* Animated Aura Pulse Layer for 豹子 & 三公 */}
      {(activeSpecial === 'BAOZI' || activeSpecial === 'SANGONG') && (
        <div
          className={`pointer-events-none absolute -inset-1 z-0 animate-pulse rounded-[10px] opacity-80 blur-[3px] ${
            activeSpecial === 'BAOZI'
              ? 'bg-gradient-to-tr from-red-600 via-amber-400 to-yellow-200'
              : 'bg-gradient-to-tr from-purple-700 via-fuchsia-400 to-amber-300'
          }`}
        />
      )}

      <img
        src={cardSrc}
        alt={isBack ? '背面' : `${card?.suit} ${card?.rank}`}
        className="relative z-10 h-full w-full rounded-[8px] sm:rounded-[10px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] pointer-events-none"
        loading="lazy"
        draggable={false}
      />

      {/* Specular Metallic Shimmer Overlay for 豹子 & 三公 */}
      {(activeSpecial === 'BAOZI' || activeSpecial === 'SANGONG') && (
        <div
          className={`pointer-events-none absolute inset-0 z-15 rounded-[8px] sm:rounded-[10px] mix-blend-screen ${
            activeSpecial === 'BAOZI'
              ? 'bg-[linear-gradient(135deg,rgba(255,235,150,0.35)_0%,transparent_45%,rgba(251,191,36,0.28)_100%)]'
              : 'bg-[linear-gradient(135deg,rgba(244,114,182,0.32)_0%,transparent_45%,rgba(251,191,36,0.25)_100%)]'
          }`}
        />
      )}

      {/* Top-Left Special Hand Crest Badge (豹 / 公 / 顺) */}
      {activeSpecial === 'BAOZI' && size !== 'xs' && (
        <div className="pointer-events-none absolute -top-2 -left-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-yellow-100 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#dc2626] text-[10px] font-black text-[#260902] shadow-[0_0_10px_rgba(245,158,11,0.9)] animate-in zoom-in-75">
          豹
        </div>
      )}

      {activeSpecial === 'SANGONG' && size !== 'xs' && (
        <div className="pointer-events-none absolute -top-2 -left-1.5 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-fuchsia-100 bg-gradient-to-b from-fuchsia-300 via-purple-600 to-indigo-900 text-[10px] font-black text-amber-200 shadow-[0_0_10px_rgba(217,70,239,0.9)] animate-in zoom-in-75">
          公
        </div>
      )}

      {/* Subtle "捞" corner badge on the 3rd drawn card */}
      {isThirdDrawnCard && !isBack && (
        <div className="pointer-events-none absolute -top-1.5 -right-1.5 z-30 rounded-full border border-emerald-200 bg-gradient-to-b from-emerald-400 to-teal-700 px-1.5 py-0.2 text-[9px] font-black text-white shadow">
          捞
        </div>
      )}
    </div>
  );
};
