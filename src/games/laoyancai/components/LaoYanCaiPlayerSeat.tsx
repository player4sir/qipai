import React from 'react';
import { LaoYanCaiPlayerInfo } from '../types';
import {
  LaoYanCaiCardView,
  LaoYanCaiSpecialHighlight,
} from './LaoYanCaiCardView';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';

export interface LaoYanCaiPlayerSeatProps {
  player: LaoYanCaiPlayerInfo | null;
  seatIndex: number;
  isSelf: boolean;
  phase: string;
  className?: string;
  style?: React.CSSProperties;
}

export const LaoYanCaiPlayerSeat: React.FC<LaoYanCaiPlayerSeatProps> = ({
  player,
  isSelf,
  phase,
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
    decision,
    cards,
    hasRevealed,
    handResult,
    scoreDelta,
  } = player;

  const isShowdownOrResult = phase === 'SHOWDOWN' || phase === 'ROUND_RESULT';
  const showHandBadge =
    (isSelf && cards.length >= 2) || hasRevealed || isShowdownOrResult;

  const specialHighlightType: LaoYanCaiSpecialHighlight = React.useMemo(() => {
    if (!showHandBadge || !handResult) return null;
    if (handResult.isBaozi) return 'BAOZI';
    if (handResult.isSanGong) return 'SANGONG';
    if (handResult.isStraightFlush) return 'STRAIGHT_FLUSH';
    if (handResult.isZhaKai || decision === 'ZHAKAI') return 'ZHAKAI';
    return null;
  }, [showHandBadge, handResult, decision]);

  const isBaozi = specialHighlightType === 'BAOZI';
  const isSanGong = specialHighlightType === 'SANGONG';

  const renderDecisionPill = () => {
    if (decision === 'ZHAKAI') {
      return (
        <span className="rounded-full border border-amber-200 bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 px-2 py-0.5 text-[10px] font-black text-white shadow-[0_0_12px_rgba(245,158,11,0.75)] animate-in zoom-in-75">
          已炸开
        </span>
      );
    }
    if (decision === 'LAO') {
      return (
        <span className="rounded-full border border-emerald-200/80 bg-gradient-to-b from-emerald-500 to-teal-700 px-2 py-0.5 text-[10px] font-black text-white shadow">
          已捞牌
        </span>
      );
    }
    if (decision === 'BULAO') {
      return (
        <span className="rounded-full border border-sky-200/60 bg-slate-800/90 px-2 py-0.5 text-[10px] font-bold text-sky-200 shadow">
          不捞
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className={`relative flex flex-col items-center ${className}`}
      style={style}
    >
      {/* ================= Avatar + Player Status Capsule ================= */}
      <div
        className={`relative z-10 flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 shadow-[0_6px_16px_rgba(0,0,0,0.48)] backdrop-blur-xs transition-all duration-300 ${
          isBaozi
            ? 'border-amber-300 bg-gradient-to-r from-[#3b1106]/95 via-[#5c1c08]/90 to-[#3b1106]/95 ring-2 ring-amber-400/75 shadow-[0_0_24px_rgba(245,158,11,0.65)]'
            : isSanGong
            ? 'border-fuchsia-300 bg-gradient-to-r from-[#2c0e3d]/95 via-[#461663]/90 to-[#2c0e3d]/95 ring-2 ring-fuchsia-400/75 shadow-[0_0_24px_rgba(217,70,239,0.6)]'
            : 'border-amber-200/30 bg-gradient-to-r from-[#13221c]/92 via-[#1a2e26]/88 to-[#13221c]/92'
        }`}
      >
        {/* Framed Avatar */}
        <div
          className={`
            relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full
            transition-transform duration-300
            ${isDealer ? 'ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.65)]' : ''}
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
          <span className="max-w-[88px] truncate text-xs font-extrabold text-white">
            {nickname}
          </span>
          <div className="mt-0.5 flex items-center gap-1">
            <img
              src="/assets/ui/icon_gold.png"
              alt="积分"
              className="h-3 w-3 shrink-0 object-contain"
            />
            <span className="font-mono text-[11px] font-black text-amber-300 tabular-nums">
              {beans >= 100000
                ? `${(beans / 10000).toFixed(1)}万`
                : beans.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Call Banker / Bet Multiplier / Decision Tags */}
        {phase !== 'WAITING' && (
          <div className="flex flex-col items-end gap-0.5">
            {callMultiplier !== -1 && (phase === 'CALL_BANKER' || isDealer) && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black whitespace-nowrap shadow ${
                  callMultiplier > 0
                    ? 'border-amber-200/80 bg-gradient-to-b from-amber-400 to-orange-600 text-[#240e03]'
                    : 'border-white/20 bg-neutral-800/90 text-neutral-300'
                }`}
              >
                {callMultiplier === 0 ? '不抢' : `庄${callMultiplier}倍`}
              </span>
            )}

            {betMultiplier > 0 && !isDealer && phase !== 'CALL_BANKER' && (
              <span className="rounded-full border border-cyan-200/80 bg-gradient-to-b from-cyan-500 to-blue-700 px-2 py-0.5 font-mono text-[10px] font-black text-white whitespace-nowrap shadow">
                下{betMultiplier}倍
              </span>
            )}

            {renderDecisionPill()}
          </div>
        )}
      </div>

      {/* ================= Hand Cards Container (2 or 3 Cards) ================= */}
      {cards && cards.length > 0 && (
        <div
          className={`
            relative z-20 mt-2.5 flex items-center justify-center
            ${isSelf ? 'gap-2 sm:gap-2.5' : 'gap-1'}
          `}
        >
          {/* ================= Radial Shockwave Halo for 豹子 & 三公 ================= */}
          {isBaozi && (
            <>
              <div className="pointer-events-none absolute -inset-4 z-0 animate-pulse rounded-3xl bg-[radial-gradient(circle,rgba(245,158,11,0.55)_0%,rgba(220,38,38,0.28)_55%,transparent_80%)] blur-xs" />
              <div className="pointer-events-none absolute -top-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-yellow-200 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 px-3 py-0.5 text-[10px] font-black tracking-widest text-yellow-100 shadow-[0_0_16px_rgba(245,158,11,0.95)] whitespace-nowrap animate-bounce">
                豹子暴击 · ×{handResult?.multiplier}倍
              </div>
            </>
          )}

          {isSanGong && (
            <>
              <div className="pointer-events-none absolute -inset-4 z-0 animate-pulse rounded-3xl bg-[radial-gradient(circle,rgba(217,70,239,0.5)_0%,rgba(126,34,206,0.28)_55%,transparent_80%)] blur-xs" />
              <div className="pointer-events-none absolute -top-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-fuchsia-200 bg-gradient-to-r from-purple-700 via-fuchsia-500 to-amber-500 px-3 py-0.5 text-[10px] font-black tracking-widest text-white shadow-[0_0_16px_rgba(217,70,239,0.9)] whitespace-nowrap animate-bounce">
                三公驾到 · ×{handResult?.multiplier}倍
              </div>
            </>
          )}

          {cards.map((card, idx) => {
            const isCardFaceDown =
              card.rank <= 0 || (!isSelf && !hasRevealed && !isShowdownOrResult);
            const isThirdCard = idx === 2;

            return (
              <LaoYanCaiCardView
                key={`${card.id}_${idx}`}
                card={card}
                faceDown={isCardFaceDown}
                isThirdDrawnCard={isThirdCard}
                isZhaKaiHighlight={decision === 'ZHAKAI'}
                specialHighlight={isCardFaceDown ? null : specialHighlightType}
                size={isSelf ? 'lg' : 'sm'}
                className={
                  !isSelf && idx > 0
                    ? isThirdCard
                      ? 'ml-1'
                      : '-ml-2.5'
                    : isSelf && isThirdCard
                    ? 'ml-2'
                    : ''
                }
              />
            );
          })}

          {/* ================= Hand Evaluation Stamp Badge ================= */}
          {showHandBadge && handResult && (
            <div className="pointer-events-none absolute -bottom-3.5 left-1/2 z-40 -translate-x-1/2 animate-in zoom-in-75 fade-in duration-200">
              <div
                className={`
                  flex items-center justify-center gap-1.5 rounded-full border-2 px-3 py-0.5 text-center font-display font-black tracking-wider shadow-[0_6px_16px_rgba(0,0,0,0.65)] whitespace-nowrap
                  ${
                    handResult.isBaozi
                      ? 'border-yellow-100 bg-gradient-to-r from-red-600 via-[#f59e0b] to-yellow-400 text-[#220701] text-xs sm:text-sm ring-2 ring-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.9)] scale-105'
                      : handResult.isSanGong
                      ? 'border-fuchsia-200 bg-gradient-to-r from-purple-700 via-fuchsia-500 to-amber-400 text-white text-xs sm:text-sm ring-2 ring-fuchsia-300 shadow-[0_0_18px_rgba(217,70,239,0.85)] scale-105'
                      : handResult.isStraightFlush || handResult.isZhaKai
                      ? 'border-yellow-200 bg-gradient-to-r from-[#ffe58f] via-[#f59e0b] to-[#d97706] text-[#240e03] text-xs sm:text-sm ring-2 ring-amber-300/60'
                      : handResult.multiplier >= 2 || handResult.points >= 8
                      ? 'border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-700 text-white text-xs'
                      : handResult.points >= 5
                      ? 'border-sky-200 bg-gradient-to-r from-sky-500 to-blue-700 text-white text-xs'
                      : 'border-neutral-400/60 bg-neutral-900/95 text-neutral-200 text-[11px]'
                  }
                `}
              >
                <span>{handResult.name}</span>
                <span className="rounded bg-black/25 px-1.5 py-0.2 font-mono text-[10px]">
                  {handResult.badgeText}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= Floating Settlement Score Delta ================= */}
      {scoreDelta !== undefined &&
        scoreDelta !== 0 &&
        (phase === 'SHOWDOWN' || phase === 'ROUND_RESULT') && (
          <div
            className={`
              pointer-events-none absolute -top-8 z-50 rounded-full border px-2.5 py-0.5 font-mono text-xs sm:text-sm font-black shadow-lg animate-in slide-in-from-bottom-2 fade-in duration-300
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
