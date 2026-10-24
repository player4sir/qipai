import React from 'react';
import { LaoYanCaiSettlement } from '../types';
import {
  LaoYanCaiCardView,
  LaoYanCaiSpecialHighlight,
} from './LaoYanCaiCardView';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import {
  RollingScoreCounter,
  SettlementHeroHeader,
} from '../../../shared/ui/RollingScoreCounter';

export interface LaoYanCaiSettlementModalProps {
  settlement: LaoYanCaiSettlement;
  countdown: number;
  selfPlayerId: string;
  onReadyNext: () => void;
  onLeaveRoom: () => void;
}

const MODE_NAMES: Record<string, string> = {
  kunming: '昆明抢庄捞腌菜',
  yuxi: '玉溪坐庄捞腌菜',
  crazy: '血战高倍捞腌菜',
};

export const LaoYanCaiSettlementModal: React.FC<LaoYanCaiSettlementModalProps> = ({
  settlement,
  countdown,
  selfPlayerId,
  onReadyNext,
  onLeaveRoom,
}) => {
  const selfRow =
    settlement.players.find((p) => p.playerId === selfPlayerId) ??
    settlement.players[0];
  const selfDelta = selfRow?.scoreDelta ?? 0;

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-amber-300/75 bg-gradient-to-b from-[#0d2b20] via-[#091d15] to-[#05110c] text-white shadow-[0_28px_68px_rgba(0,0,0,0.92)]">
        {/* Commercial Hero Header with Flipbook Sparkle & Rolling Score */}
        <SettlementHeroHeader
          selfScoreDelta={selfDelta}
          titleWin="本局胜利 · 捞腌菜结算"
          titleLose="本局惜败 · 捞腌菜结算"
          subtitle={`${MODE_NAMES[settlement.playMode] || '云南捞腌菜'} · 底分 ${settlement.baseScore.toLocaleString()}${settlement.bankerZhaKaiAll ? ' · 庄家天牌炸开局' : ''}`}
          suffix=" 分"
        />

        {/* Players Settlement List */}
        <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto p-3.5 sm:p-4">
          {settlement.players.map((p) => {
            const isSelf = p.playerId === selfPlayerId;
            const isBaozi = p.handName.includes('豹子');
            const isSanGong = p.handName.includes('三公');
            const isStraightFlush = p.handName.includes('同花顺');
            const specialHighlight: LaoYanCaiSpecialHighlight = isBaozi
              ? 'BAOZI'
              : isSanGong
              ? 'SANGONG'
              : isStraightFlush
              ? 'STRAIGHT_FLUSH'
              : p.decision === 'ZHAKAI'
              ? 'ZHAKAI'
              : null;

            const decisionTag =
              p.decision === 'ZHAKAI'
                ? '炸开'
                : p.decision === 'LAO'
                ? '捞牌(3张)'
                : '不捞(2张)';

            return (
              <div
                key={p.playerId}
                className={`flex items-center justify-between rounded-2xl border px-3.5 py-2 transition-all ${
                  isBaozi
                    ? 'border-amber-300 bg-gradient-to-r from-red-950/55 via-amber-900/35 to-red-950/55 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                    : isSanGong
                    ? 'border-fuchsia-300/80 bg-gradient-to-r from-purple-950/55 via-fuchsia-900/35 to-purple-950/55 shadow-[0_0_18px_rgba(217,70,239,0.28)]'
                    : isSelf
                    ? 'border-amber-300/65 bg-amber-400/12'
                    : 'border-white/10 bg-white/[0.04]'
                }`}
              >
                {/* Left: Seat Avatar & Role */}
                <div className="flex min-w-[165px] items-center gap-2.5">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber-200/40 bg-[#182620]">
                    <AvatarSvg avatarId={p.avatarId} size={38} />
                    {p.isDealer && (
                      <span className="absolute top-0 left-0 rounded-br bg-amber-400 px-1 text-[9px] font-black text-[#240e03]">
                        庄
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[100px] truncate text-xs sm:text-sm font-extrabold text-white">
                        {p.nickname}
                      </span>
                      <span className="rounded bg-white/10 px-1.5 py-0.2 text-[10px] font-bold text-amber-200">
                        {p.isDealer
                          ? `庄${Math.max(1, p.callMultiplier)}倍`
                          : `下${p.betMultiplier}倍`}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-300/90">
                      {decisionTag}
                    </span>
                  </div>
                </div>

                {/* Center: Hand Cards & Hand Name */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {p.cards.map((c, idx) => (
                      <LaoYanCaiCardView
                        key={`${c.id}_${idx}`}
                        card={c}
                        size="xs"
                        isThirdDrawnCard={idx === 2}
                        isZhaKaiHighlight={p.decision === 'ZHAKAI'}
                        specialHighlight={specialHighlight}
                      />
                    ))}
                  </div>
                  <div className="flex min-w-[115px] flex-col items-start">
                    <span
                      className={`font-display text-xs sm:text-sm font-black ${
                        isBaozi
                          ? 'text-yellow-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                          : isSanGong
                          ? 'text-fuchsia-200 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]'
                          : 'text-amber-200'
                      }`}
                    >
                      {p.handName}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-bold ${
                        isBaozi
                          ? 'bg-amber-500/30 text-yellow-200 border border-amber-300/50'
                          : isSanGong
                          ? 'bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-300/50'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {p.badgeText}
                    </span>
                  </div>
                </div>

                {/* Right: Rolling Score Delta (Winner Gold #FFD700 / Loser Amber #D97706) */}
                <div className="flex min-w-[110px] flex-col items-end">
                  <RollingScoreCounter
                    value={p.scoreDelta}
                    suffix=" 分"
                    size="md"
                    durationMs={950}
                    playTickSound={isSelf}
                  />
                  <span className="font-mono text-[10px] text-white/50">
                    当前积分 {p.balance.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/45 px-5 py-3">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="rounded-full border border-white/25 bg-white/10 px-6 py-1.5 text-xs sm:text-sm font-bold text-white/90 hover:bg-white/20 active:scale-95 cursor-pointer"
          >
            返回大厅
          </button>
          <button
            type="button"
            onClick={onReadyNext}
            className="rounded-full border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] px-8 py-1.5 font-display text-sm sm:text-base font-black text-[#261003] shadow-[0_6px_18px_rgba(245,158,11,0.45)] hover:brightness-108 active:scale-95 cursor-pointer"
          >
            再来一局 ({countdown}s)
          </button>
        </div>
      </div>
    </div>
  );
};
