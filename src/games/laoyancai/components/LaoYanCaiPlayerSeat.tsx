import React from 'react';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { LaoYanCaiPhase, LaoYanCaiPlayerInfo } from '../types';
import { LaoYanCaiCardView } from './LaoYanCaiCardView';

export interface LaoYanCaiPlayerSeatProps {
  player: LaoYanCaiPlayerInfo | null;
  seatIndex: number;
  isSelf: boolean;
  phase: LaoYanCaiPhase;
}

export const LaoYanCaiPlayerSeat: React.FC<LaoYanCaiPlayerSeatProps> = ({
  player,
  isSelf,
  phase,
}) => {
  if (!player) {
    return (
      <div className="flex h-20 w-36 items-center justify-center rounded-2xl border border-dashed border-amber-200/20 bg-black/25 text-xs font-bold text-amber-100/35">
        空位待入座
      </div>
    );
  }

  const decisionBadge = () => {
    if (player.decision === 'ZHAKAI') {
      return (
        <span className="rounded-full border border-yellow-200 bg-gradient-to-r from-red-600 to-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white shadow">
          天牌炸开
        </span>
      );
    }
    if (player.decision === 'LAO') {
      return (
        <span className="rounded-full border border-emerald-300/70 bg-emerald-600/90 px-2.5 py-0.5 text-[11px] font-black text-white shadow">
          已捞腌菜
        </span>
      );
    }
    if (player.decision === 'BULAO') {
      return (
        <span className="rounded-full border border-slate-300/40 bg-slate-700/85 px-2.5 py-0.5 text-[11px] font-bold text-slate-200 shadow">
          不捞守牌
        </span>
      );
    }
    return null;
  };

  const specialCategory = player.handResult?.isBaozi
    ? 'BAOZI'
    : player.handResult?.isSanGong
    ? 'SANGONG'
    : player.handResult?.isStraightFlush
    ? 'STRAIGHT_FLUSH'
    : null;

  return (
    <div
      className={`relative flex ${
        isSelf ? 'flex-row items-center gap-4' : 'flex-col items-center gap-1.5'
      } select-none`}
    >
      {/* Player Avatar & Info Pill */}
      <div
        className={`relative flex items-center gap-2.5 rounded-2xl border px-3 py-1.5 shadow-xl backdrop-blur-md transition-all ${
          player.isDealer
            ? 'border-amber-300 bg-gradient-to-b from-[#3d2108]/95 to-[#1f1003]/95 shadow-[0_0_20px_rgba(245,158,11,0.35)]'
            : 'border-emerald-300/30 bg-[#07261c]/92'
        }`}
      >
        <div className="relative">
          <AvatarSvg
            avatarId={player.avatarId}
            size={isSelf ? 44 : 38}
            isLandlord={player.isDealer}
          />
          {player.isDealer && (
            <span className="absolute -top-1.5 -left-1.5 rounded-md border border-yellow-100 bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-0.2 text-[10px] font-black text-[#240b02] shadow">
              庄
            </span>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="max-w-[92px] truncate text-xs font-extrabold text-[#FAF8F5]">
              {player.nickname}
            </span>
            {decisionBadge()}
          </div>

          <div className="mt-0.5 flex items-center gap-2 text-[11px]">
            <span className="font-mono font-bold text-amber-300 tabular-nums">
              {player.beans.toLocaleString()}
            </span>

            {phase === 'CALL_BANKER' && player.callMultiplier >= 0 && (
              <span className="rounded bg-amber-400/20 px-1.5 py-0.2 font-mono text-[10px] font-bold text-amber-200 tabular-nums">
                {player.callMultiplier === 0
                  ? '不抢'
                  : `抢×${player.callMultiplier}`}
              </span>
            )}

            {!player.isDealer && player.betMultiplier > 0 && (
              <span className="rounded bg-emerald-500/25 px-1.5 py-0.2 font-mono text-[10px] font-bold text-emerald-200 tabular-nums">
                注×{player.betMultiplier}
              </span>
            )}

            {player.isDealer && player.callMultiplier > 0 && (
              <span className="rounded bg-amber-500/25 px-1.5 py-0.2 font-mono text-[10px] font-bold text-amber-200 tabular-nums">
                庄×{player.callMultiplier}
              </span>
            )}
          </div>
        </div>

        {/* Score Delta Floating Pill on Showdown/Result */}
        {(phase === 'SHOWDOWN' || phase === 'ROUND_RESULT') &&
          typeof player.scoreDelta === 'number' &&
          player.scoreDelta !== 0 && (
            <div
              className={`absolute -top-3.5 right-2 rounded-full border px-2 py-0.5 font-mono text-xs font-black tabular-nums shadow-lg ${
                player.scoreDelta > 0
                  ? 'border-yellow-200 bg-amber-400 text-[#240b02]'
                  : 'border-rose-300/60 bg-rose-900/95 text-rose-100'
              }`}
            >
              {player.scoreDelta > 0
                ? `+${player.scoreDelta.toLocaleString()}`
                : player.scoreDelta.toLocaleString()}
            </div>
          )}
      </div>

      {/* Player Hand Cards & Hand Result Badge */}
      {player.cards && player.cards.length > 0 && (
        <div className="relative flex flex-col items-center">
          <div className="flex items-center justify-center gap-1.5">
            {player.cards.map((card, idx) => (
              <LaoYanCaiCardView
                key={`${card.id}_${idx}`}
                card={card}
                size={isSelf ? 'lg' : 'sm'}
                isThirdDrawnCard={idx === 2}
                specialHighlight={specialCategory}
              />
            ))}
          </div>

          {player.handResult && (
            <div
              className={`mt-1 flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-black shadow-md ${
                player.handResult.isBaozi ||
                player.handResult.isStraightFlush ||
                player.handResult.isSanGong ||
                player.handResult.isZhaKai
                  ? 'border-yellow-200 bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 text-white'
                  : player.handResult.multiplier >= 2
                  ? 'border-emerald-300 bg-emerald-800/95 text-emerald-100'
                  : 'border-amber-300/40 bg-black/75 text-amber-200'
              }`}
            >
              <span>{player.handResult.name}</span>
              <span className="font-mono text-[10px] opacity-90 tabular-nums">
                ({player.handResult.badgeText})
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
