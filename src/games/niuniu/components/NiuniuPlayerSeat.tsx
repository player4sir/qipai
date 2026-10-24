import React from 'react';
import { NiuniuCard, NiuniuPlayerInfo } from '../types';
import { NiuniuCardView } from './NiuniuCardView';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';

export interface NiuniuPlayerSeatProps {
  player: NiuniuPlayerInfo | null;
  seatIndex: number;
  isSelf: boolean;
  isDealerCandidate?: boolean;
  phase: string;
  onCardClick?: (card: NiuniuCard, index: number) => void;
  selectedCardIds?: number[];
  className?: string;
  style?: React.CSSProperties;
}

export const NiuniuPlayerSeat: React.FC<NiuniuPlayerSeatProps> = ({
  player,
  isSelf,
  isDealerCandidate = false,
  phase,
  onCardClick,
  selectedCardIds = [],
  className = '',
  style = {},
}) => {
  if (!player) {
    return (
      <div
        className={`flex flex-col items-center justify-center opacity-35 ${className}`}
        style={style}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-white/30 bg-black/30">
          <span className="text-[10px] text-white/50">空位</span>
        </div>
      </div>
    );
  }

  const {
    nickname,
    avatarId,
    beans,
    isDealer,
    callMultiplier,
    betMultiplier,
    cards,
    hasShownHand,
    handResult,
    scoreDelta,
  } = player;

  // Determine whether cards should be partitioned into 3 + 2 (凑十组 + 牛数组)
  const isSettledOrShown =
    hasShownHand || phase === 'COMPARE_AND_SETTLE' || phase === 'ROUND_RESULT';
  const showPartition =
    isSettledOrShown &&
    handResult &&
    handResult.level > 0 &&
    handResult.tenGroup.length === 3;

  // Order cards into [3 ten-group cards, 2 bull-group cards] when partitioned
  const orderedCards = React.useMemo(() => {
    if (!showPartition || !handResult) return cards;
    const tenCardIds = new Set(handResult.tenGroup.map((c) => c.id));
    const tens = cards.filter((c) => tenCardIds.has(c.id));
    const bulls = cards.filter((c) => !tenCardIds.has(c.id));
    if (tens.length === 3 && bulls.length === 2) {
      return [...tens, ...bulls];
    }
    return cards;
  }, [showPartition, handResult, cards]);

  const isFourCardPeekPhase =
    phase === 'DEAL_FIRST_4' ||
    phase === 'CALL_BANKER' ||
    phase === 'DETERMINE_BANKER' ||
    phase === 'BETTING';

  return (
    <div
      className={`relative flex flex-col items-center ${className}`}
      style={style}
    >
      {/* ================= Candidate Dealer Roulette Ring ================= */}
      {isDealerCandidate && (
        <div className="pointer-events-none absolute -inset-3 z-0 animate-ping rounded-full border-2 border-amber-300 bg-amber-400/25" />
      )}

      {/* ================= Avatar + Player Status Plate ================= */}
      <div className="relative z-10 flex items-center gap-2 rounded-full border border-amber-200/30 bg-gradient-to-r from-[#18100a]/90 via-[#24170e]/85 to-[#18100a]/90 py-1 pr-3 pl-1 shadow-[0_6px_16px_rgba(0,0,0,0.45)] backdrop-blur-xs">
        {/* Framed Avatar */}
        <div
          className={`
            relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full
            transition-transform duration-300
            ${isDealer ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.65)]' : ''}
            ${isDealerCandidate ? 'scale-110 ring-4 ring-yellow-300' : ''}
          `}
        >
          <div className="h-9.5 w-9.5 overflow-hidden rounded-full bg-[#1e2636]">
            <AvatarSvg avatarId={avatarId} size={38} />
          </div>
          <img
            src="/assets/ui/head_frame.png"
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />

          {/* Golden Banker Crown Badge */}
          {isDealer && (
            <div className="absolute -top-1.5 -left-1.5 z-20 flex h-5.5 w-5.5 items-center justify-center rounded-full border border-yellow-100 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#b45309] text-[11px] font-black text-[#261003] shadow-md animate-in zoom-in-75">
              庄
            </div>
          )}
        </div>

        {/* Nickname & Score Column */}
        <div className="flex min-w-[68px] flex-col justify-center">
          <span className="max-w-[86px] truncate text-xs font-extrabold text-white">
            {nickname}
          </span>
          <div className="mt-0.5 flex items-center gap-1">
            <span className="text-[10px] font-bold text-white/65">积分</span>
            <span className="font-mono text-[11px] font-black text-amber-300 tabular-nums">
              {beans >= 100000
                ? `${(beans / 10000).toFixed(1)}万`
                : beans.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Call Banker / Bet Multiplier Tag */}
        {phase !== 'WAITING' && (
          <div className="flex flex-col items-end gap-0.5">
            {callMultiplier !== -1 &&
              (phase === 'CALL_BANKER' ||
                phase === 'DETERMINE_BANKER' ||
                isDealer) && (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black whitespace-nowrap shadow ${
                    callMultiplier > 0
                      ? 'border-amber-200/80 bg-gradient-to-b from-amber-400 to-orange-600 text-[#240e03]'
                      : 'border-white/20 bg-neutral-800/90 text-neutral-300'
                  }`}
                >
                  {callMultiplier === 0 ? '不抢' : `抢${callMultiplier}倍`}
                </span>
              )}

            {betMultiplier > 0 && !isDealer && phase !== 'CALL_BANKER' && (
              <span className="rounded-full border border-cyan-200/80 bg-gradient-to-b from-cyan-500 to-blue-700 px-2 py-0.5 font-mono text-[10px] font-black text-white whitespace-nowrap shadow">
                下{betMultiplier}倍
              </span>
            )}
          </div>
        )}
      </div>

      {/* ================= Hand Cards Container (Supports 3+2 Split) ================= */}
      {cards && cards.length > 0 && (
        <div
          className={`
            relative z-20 mt-2 flex items-center justify-center
            ${isSelf ? 'gap-1.5 sm:gap-2' : ''}
          `}
        >
          {orderedCards.map((card, idx) => {
            const isSelected = selectedCardIds.includes(card.id);
            const isBull = Boolean(showPartition && idx >= 3);
            const isCardFaceDown =
              card.rank <= 0 ||
              (!isSelf &&
                !hasShownHand &&
                phase !== 'COMPARE_AND_SETTLE' &&
                phase !== 'ROUND_RESULT');

            // Add visual 3+2 gap before the 4th card (idx === 3) when partitioned
            const partitionGapClass = showPartition && idx === 3
              ? isSelf
                ? 'ml-3 sm:ml-4'
                : 'ml-2 sm:ml-2.5'
              : !isSelf && idx > 0
              ? '-ml-3.5 sm:-ml-4'
              : '';

            return (
              <NiuniuCardView
                key={`${card.id}_${idx}`}
                card={card}
                faceDown={isCardFaceDown}
                mysteryFifthCard={isSelf && idx === 4 && isFourCardPeekPhase && isCardFaceDown}
                selected={isSelected}
                isBullPart={isBull}
                size={isSelf ? 'lg' : 'sm'}
                onClick={
                  isSelf && onCardClick && !isCardFaceDown
                    ? () => onCardClick(card, idx)
                    : undefined
                }
                className={`${partitionGapClass} ${isBull ? 'z-30' : 'z-20'}`}
              />
            );
          })}

          {/* ================= Commercial Hand Type Stamp Badge ================= */}
          {isSettledOrShown && handResult && (
            <div className="pointer-events-none absolute -bottom-2.5 left-1/2 z-40 -translate-x-1/2 animate-in zoom-in-75 fade-in duration-200">
              <div
                className={`
                  flex items-center justify-center gap-1 rounded-full border-2 px-3 py-0.5 text-center font-display font-black tracking-wider shadow-[0_6px_16px_rgba(0,0,0,0.65)] whitespace-nowrap
                  ${
                    handResult.level >= 10
                      ? 'border-yellow-200 bg-gradient-to-r from-[#ffe58f] via-[#f59e0b] to-[#d97706] text-[#240e03] text-xs sm:text-sm ring-2 ring-amber-300/60'
                      : handResult.level >= 7
                      ? 'border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-700 text-white text-xs'
                      : handResult.level > 0
                      ? 'border-sky-200 bg-gradient-to-r from-sky-500 to-blue-700 text-white text-xs'
                      : 'border-neutral-400/60 bg-neutral-900/95 text-neutral-300 text-[11px]'
                  }
                `}
              >
                <span>{handResult.name}</span>
                <span className="font-mono text-[10px] opacity-90">
                  ×{handResult.multiplier}倍
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= Floating Settlement Score Delta ================= */}
      {scoreDelta !== undefined &&
        scoreDelta !== 0 &&
        (phase === 'COMPARE_AND_SETTLE' || phase === 'ROUND_RESULT') && (
          <div
            className={`
              pointer-events-none absolute -top-7 z-50 rounded-full border px-2.5 py-0.5 font-mono text-xs sm:text-sm font-black shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300
              ${
                scoreDelta > 0
                  ? 'border-amber-200 bg-gradient-to-r from-amber-400 to-orange-500 text-[#240e03]'
                  : 'border-rose-400/50 bg-rose-950/90 text-rose-200'
              }
            `}
          >
            {scoreDelta > 0
              ? `+${scoreDelta.toLocaleString()}`
              : scoreDelta.toLocaleString()}
          </div>
        )}
    </div>
  );
};
