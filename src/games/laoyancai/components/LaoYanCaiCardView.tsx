import React from 'react';
import { PokerSuitSvg } from '../../../shared/ui/ModalVectorIcons';
import { LaoYanCaiCard } from '../types';

export interface LaoYanCaiCardViewProps {
  card: LaoYanCaiCard;
  size?: 'sm' | 'md' | 'lg';
  isThirdDrawnCard?: boolean;
  specialHighlight?: 'BAOZI' | 'SANGONG' | 'STRAIGHT_FLUSH' | null;
}

const RANK_LABELS: Record<number, string> = {
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
  size = 'md',
  isThirdDrawnCard = false,
  specialHighlight = null,
}) => {
  const isFaceDown = !card || card.rank <= 0;
  const isRed = card?.suit === 'heart' || card?.suit === 'diamond';

  const sizeClasses =
    size === 'lg'
      ? 'h-[86px] w-[62px] rounded-xl text-base'
      : size === 'sm'
        ? 'h-[54px] w-[39px] rounded-lg text-xs'
        : 'h-[70px] w-[50px] rounded-xl text-sm';

  const highlightBorder =
    specialHighlight === 'BAOZI'
      ? 'border-2 border-amber-300 ring-2 ring-amber-400/70 shadow-[0_0_16px_rgba(245,158,11,0.75)]'
      : specialHighlight === 'SANGONG'
        ? 'border-2 border-fuchsia-300 ring-2 ring-fuchsia-400/70 shadow-[0_0_16px_rgba(217,70,239,0.75)]'
        : specialHighlight === 'STRAIGHT_FLUSH'
          ? 'border-2 border-cyan-300 ring-2 ring-cyan-400/70 shadow-[0_0_16px_rgba(34,211,238,0.75)]'
          : isThirdDrawnCard
            ? 'border-2 border-emerald-400 ring-1 ring-emerald-300/60 shadow-[0_4px_12px_rgba(16,185,129,0.45)]'
            : 'border border-amber-900/25 shadow-[0_4px_10px_rgba(0,0,0,0.45)]';

  if (isFaceDown) {
    return (
      <div
        className={`relative flex flex-col items-center justify-center overflow-hidden border border-amber-300/55 bg-gradient-to-br from-[#7c1d12] via-[#511109] to-[#2e0703] shadow-[0_4px_10px_rgba(0,0,0,0.55)] select-none ${sizeClasses}`}
      >
        <div className="pointer-events-none absolute inset-1 rounded-md border border-amber-300/30 bg-[radial-gradient(circle_at_50%_50%,rgba(251,191,36,0.18),transparent_70%)]" />
        <span className="font-display text-[10px] font-black tracking-widest text-amber-200/75">
          滇南
        </span>
      </div>
    );
  }

  const rankLabel = RANK_LABELS[card.rank] || String(card.rank);
  const centerIconSize =
    size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div
      className={`relative flex flex-col justify-between bg-gradient-to-b from-[#fffdf9] to-[#f4ece0] p-1.5 select-none ${sizeClasses} ${highlightBorder}`}
    >
      {/* Top-Left Rank & Vector Suit */}
      <div
        className={`flex flex-col items-start leading-none ${
          isRed ? 'text-rose-600' : 'text-slate-900'
        }`}
      >
        <span className="font-mono font-black tracking-tighter tabular-nums">
          {rankLabel}
        </span>
        <PokerSuitSvg suit={card.suit} className="mt-0.5 h-2.5 w-2.5" />
      </div>

      {/* Center Vector Suit Watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-85">
        <PokerSuitSvg suit={card.suit} className={centerIconSize} />
      </div>

      {/* Bottom-Right Point Tag or 3rd Card Badge */}
      <div className="relative z-10 flex items-center justify-end">
        {isThirdDrawnCard ? (
          <span className="rounded bg-emerald-600 px-1 py-0.2 text-[9px] font-black leading-none text-white">
            捞
          </span>
        ) : (
          <span className="font-mono text-[9px] font-bold leading-none text-amber-900/60 tabular-nums">
            {card.point}点
          </span>
        )}
      </div>
    </div>
  );
};
