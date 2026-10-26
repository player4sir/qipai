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
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="relative flex w-full max-w-[480px] max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <SettlementHeroHeader
          selfScoreDelta={selfDelta}
          titleWin="本局胜利"
          titleLose="本局结算"
          subtitle={`${MODE_NAMES[settlement.playMode] || '云南捞腌菜'} · 底分 ${settlement.baseScore.toLocaleString()}${settlement.bankerZhaKaiAll ? ' · 庄家炸开' : ''}`}
          onClose={onReadyNext}
        />

        {/* Player Cards */}
        <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
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
                ? '捞牌'
                : '不捞';

            const roleText = p.isDealer
              ? `庄家 · ${Math.max(1, p.callMultiplier)}倍`
              : `闲家 · 下${p.betMultiplier}倍`;

            return (
              <div
                key={p.playerId}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                  isSelf
                    ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.03]'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/12 bg-black/40">
                    <AvatarSvg avatarId={p.avatarId} size={32} />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#F3F4F6]">
                      <span className="max-w-[100px] truncate">{p.nickname}</span>
                      {isSelf && (
                        <span className="text-[11px] font-semibold text-[#E5B85B]">· 我</span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#9CA3AF] tabular-nums">
                      <span>{roleText}</span>
                      <span aria-hidden="true">·</span>
                      <span>{decisionTag}</span>
                      <span aria-hidden="true">·</span>
                      <span>积分 {p.balance.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
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
                  <div className="flex w-18 flex-col items-end text-right">
                    <span className="text-xs font-bold text-[#F3F4F6] whitespace-nowrap">
                      {p.handName}
                    </span>
                    <span className="text-[10px] text-[#E5B85B] tabular-nums whitespace-nowrap">
                      {p.badgeText}
                    </span>
                  </div>
                </div>

                <div className="flex w-22 shrink-0 flex-col items-end">
                  <RollingScoreCounter
                    value={p.scoreDelta}
                    size="md"
                    durationMs={900}
                    playTickSound={isSelf}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Compact Right-Aligned Action Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
          >
            返回大厅
          </button>
          <button
            type="button"
            onClick={onReadyNext}
            className="flex h-8.5 min-w-[108px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] transition-colors hover:bg-[#E0A842] active:scale-98 whitespace-nowrap tabular-nums shrink-0 cursor-pointer"
          >
            再来一局 ({countdown}s)
          </button>
        </div>
      </div>
    </div>
  );
};
