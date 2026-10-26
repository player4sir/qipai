import React from 'react';
import { NiuniuSettlement } from '../types';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { NiuniuCardView } from './NiuniuCardView';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import {
  RollingScoreCounter,
  SettlementHeroHeader,
} from '../../../shared/ui/RollingScoreCounter';

export interface NiuniuSettlementModalProps {
  settlement?: NiuniuSettlement;
  countdown: number;
  selfPlayerId: string;
  onReadyNext: () => void;
  onLeaveRoom: () => void;
}

export const NiuniuSettlementModal: React.FC<NiuniuSettlementModalProps> = ({
  settlement,
  countdown,
  selfPlayerId,
  onReadyNext,
  onLeaveRoom,
}) => {
  if (!settlement) return null;

  const selfRecord =
    settlement.players.find((p) => p.playerId === selfPlayerId) ??
    settlement.players[0];
  const selfDelta = selfRecord?.scoreDelta ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="relative flex w-full max-w-[480px] max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <SettlementHeroHeader
          selfScoreDelta={selfDelta}
          titleWin="本局胜利"
          titleLose="本局结算"
          subtitle={`抢庄斗牛 · 底分 ${settlement.baseScore.toLocaleString()}`}
          onClose={onReadyNext}
        />

        {/* Player Cards */}
        <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
          {settlement.players.map((p) => {
            const isSelf = p.playerId === selfPlayerId;
            const roleText = p.isDealer
              ? `庄家${p.callMultiplier && p.callMultiplier > 0 ? ` · 抢${p.callMultiplier}倍` : ''}`
              : `闲家${p.betMultiplier && p.betMultiplier > 0 ? ` · 下${p.betMultiplier}倍` : ''}`;

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
                    <AvatarSvg avatarId={p.avatarId || p.playerId} size={32} />
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
                      <span>积分 {p.balance.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <div className="hidden sm:flex items-center -space-x-2">
                    {(p.cards || []).map((c, idx) => (
                      <NiuniuCardView
                        key={`${c.id}_${idx}`}
                        card={c}
                        size="xs"
                      />
                    ))}
                  </div>
                  <span className="w-18 text-right text-xs font-semibold text-[#E5B85B] tabular-nums whitespace-nowrap">
                    {p.handName}
                    {p.handMultiplier ? ` ×${p.handMultiplier}` : ''}
                  </span>
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
            onClick={() => {
              soundEngine.playTap(640);
              onLeaveRoom();
            }}
            className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
          >
            返回大厅
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(760);
              hapticEngine.tap();
              onReadyNext();
            }}
            className="flex h-8.5 min-w-[108px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] transition-colors hover:bg-[#E0A842] active:scale-98 whitespace-nowrap tabular-nums shrink-0 cursor-pointer"
          >
            再来一局 ({countdown}s)
          </button>
        </div>
      </div>
    </div>
  );
};
