import React, { useEffect } from 'react';
import { LogOut, RotateCcw, Trophy } from 'lucide-react';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { roomCardSessionHub } from '../../../shared/control/RoomCardSessionHub';
import { LaoYanCaiSettlement } from '../types';
import { LaoYanCaiCardView } from './LaoYanCaiCardView';

export interface LaoYanCaiSettlementModalProps {
  settlement: LaoYanCaiSettlement;
  countdown: number;
  selfPlayerId: string;
  onReadyNext: () => void;
  onLeaveRoom: () => void;
}

export const LaoYanCaiSettlementModal: React.FC<LaoYanCaiSettlementModalProps> = ({
  settlement,
  countdown,
  selfPlayerId,
  onReadyNext,
  onLeaveRoom,
}) => {
  useEffect(() => {
    if (!settlement) return;
    const me =
      settlement.players.find((p) => p.playerId === selfPlayerId) ??
      settlement.players[0];
    const peers = settlement.players
      .filter((p) => p !== me)
      .map((p) => ({ name: p.nickname, delta: p.scoreDelta }));
    roomCardSessionHub.recordRoundSettlement({
      heroDelta: me?.scoreDelta ?? 0,
      heroName: me?.nickname,
      summaryText: `云南捞腌菜 (${me?.handName || '本局完赛'})`,
      peerDeltas: peers,
    });
  }, [settlement, selfPlayerId]);

  const modeLabel =
    settlement.playMode === 'yuxi'
      ? '玉溪坐庄'
      : settlement.playMode === 'crazy'
        ? '血战高倍'
        : '昆明抢庄';

  return (
    <CommercialModalShell
      title={
        settlement.bankerZhaKaiAll
          ? '庄家天牌炸开 · 全场通比结算'
          : '云南捞腌菜 · 本局结算'
      }
      subtitle={`底分 ${settlement.baseScore} · 模式 ${modeLabel}`}
      icon={<Trophy className="h-5 w-5" />}
      size="lg"
      portalMode="stage"
      closeOnBackdrop={false}
      onClose={onLeaveRoom}
      footer={
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="flex h-10 min-w-[132px] items-center justify-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-5 text-xs sm:text-sm font-extrabold text-[#5A6572] shadow-2xs hover:bg-[#FAF8F3] hover:text-[#1E242B] active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>返回大厅</span>
          </button>

          <button
            type="button"
            onClick={onReadyNext}
            className="flex h-10 min-w-[168px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-6 text-xs sm:text-sm font-black text-white shadow-sm hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="font-mono tabular-nums">
              继续下一局 ({countdown}s)
            </span>
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {settlement.players.map((p) => {
          const isMe = p.playerId === selfPlayerId;
          const roleText = p.isDealer
            ? `庄 ×${Math.max(1, p.callMultiplier)}`
            : `闲 ×${p.betMultiplier || 5}`;
          const decisionText =
            p.decision === 'ZHAKAI'
              ? '炸开'
              : p.decision === 'LAO'
                ? '已捞第3张'
                : '不捞';

          return (
            <div
              key={p.playerId}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                isMe
                  ? 'border-[#F59E0B] bg-[#FFFBEB] shadow-xs'
                  : 'border-[#E8E1D0] bg-white'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0">
                  <AvatarSvg
                    avatarId={p.avatarId}
                    size={36}
                    isLandlord={p.isDealer}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs sm:text-sm font-black text-[#1E242B]">
                    <span className="truncate">{p.nickname}</span>
                    <span className="font-mono text-xs font-extrabold text-[#B45309] whitespace-nowrap shrink-0 tabular-nums">
                      · {roleText}
                    </span>
                    <span className="text-xs font-bold text-[#0D9488] whitespace-nowrap shrink-0">
                      · {decisionText}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-[#5A6572]">
                    {p.handName} ({p.badgeText})
                  </div>
                </div>
              </div>

              {/* Cards */}
              <div className="flex shrink-0 items-center gap-1">
                {p.cards.map((c, idx) => (
                  <LaoYanCaiCardView
                    key={`${c.id}_${idx}`}
                    card={c}
                    size="sm"
                    isThirdDrawnCard={idx === 2}
                  />
                ))}
              </div>

              {/* Score Delta */}
              <div className="shrink-0 text-right font-mono tabular-nums">
                <div
                  className={`text-sm sm:text-base font-black ${
                    p.scoreDelta >= 0 ? 'text-[#D97706]' : 'text-rose-600'
                  }`}
                >
                  {p.scoreDelta >= 0
                    ? `+${p.scoreDelta.toLocaleString()}`
                    : p.scoreDelta.toLocaleString()}
                </div>
                <div className="text-[11px] font-medium text-[#5A6572]">
                  累计积分 {p.balance.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </CommercialModalShell>
  );
};
