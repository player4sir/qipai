import React, { useEffect } from 'react';
import { LogOut, RotateCcw, Trophy } from 'lucide-react';
import { NiuniuSettlement } from '../types';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { NiuniuCardView } from './NiuniuCardView';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { roomCardSessionHub } from '../../../shared/control/RoomCardSessionHub';

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
      summaryText: `抢庄牛牛 (${me?.handName || '本局完赛'})`,
      peerDeltas: peers,
    });
  }, [settlement, selfPlayerId]);

  if (!settlement) return null;

  const selfRecord =
    settlement.players.find((p) => p.playerId === selfPlayerId) ??
    settlement.players[0];
  const isSelfWin = (selfRecord?.scoreDelta ?? 0) >= 0;

  return (
    <CommercialModalShell
      title={isSelfWin ? '本局结算 · 旗开得胜' : '本局结算 · 再接再厉'}
      subtitle={`房间底分 ${settlement.baseScore} 积分`}
      icon={<Trophy className="h-4.5 w-4.5" />}
      size="lg"
      portalMode="stage"
      onClose={onLeaveRoom}
      footer={
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(640);
              onLeaveRoom();
            }}
            className="flex h-9 min-w-[120px] items-center justify-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-5 text-xs font-extrabold text-[#5A6572] shadow-2xs hover:bg-[#FAF8F3] hover:text-[#1E242B] active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>返回大厅</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(760);
              hapticEngine.tap();
              onReadyNext();
            }}
            className="flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-6 text-xs font-black text-white shadow-xs hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="font-mono tabular-nums">
              再来一局 ({countdown}s)
            </span>
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {settlement.players.map((p) => {
          const isSelf = p.playerId === selfPlayerId;
          const roleText = p.isDealer
            ? `庄家${p.callMultiplier && p.callMultiplier > 0 ? ` ×${p.callMultiplier}` : ''}`
            : `闲家${p.betMultiplier && p.betMultiplier > 0 ? ` ×${p.betMultiplier}` : ''}`;

          return (
            <div
              key={p.playerId}
              className={`flex items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition-colors ${
                isSelf
                  ? 'border-[#F59E0B] bg-[#FFFBEB] shadow-2xs'
                  : 'border-[#E8E1D0] bg-white'
              }`}
            >
              {/* Left: Avatar + Nickname + Role */}
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-[#DEC99A] bg-[#F5F1E7]">
                  <AvatarSvg avatarId={p.avatarId || p.playerId} size={32} />
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="max-w-[90px] truncate font-black text-[#1E242B]">
                      {p.nickname}
                    </span>
                    <span className="font-mono text-[11px] font-extrabold text-[#B45309] whitespace-nowrap shrink-0 tabular-nums">
                      · {roleText}
                    </span>
                    {isSelf && (
                      <span className="text-[11px] font-extrabold text-[#0D9488] whitespace-nowrap shrink-0">
                        · 我
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] font-medium text-[#5A6572] tabular-nums">
                    累计积分 {p.balance.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Center: 5 Miniature Cards + Hand Stamp */}
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center -space-x-2">
                  {(p.cards || []).map((c, idx) => (
                    <NiuniuCardView
                      key={`${c.id}_${idx}`}
                      card={c}
                      size="xs"
                    />
                  ))}
                </div>
                <span className="rounded-lg border border-[#DEC99A] bg-[#FAF8F3] px-2 py-0.5 text-[11px] font-black text-[#2C1E10] whitespace-nowrap shrink-0">
                  {p.handName}
                  {p.handMultiplier ? ` ×${p.handMultiplier}` : ''}
                </span>
              </div>

              {/* Right: Score Delta */}
              <div className="flex w-20 shrink-0 flex-col items-end">
                <span
                  className={`font-mono text-sm font-black tabular-nums ${
                    p.scoreDelta > 0
                      ? 'text-[#D97706]'
                      : p.scoreDelta < 0
                        ? 'text-rose-600'
                        : 'text-[#5A6572]'
                  }`}
                >
                  {p.scoreDelta > 0
                    ? `+${p.scoreDelta.toLocaleString()}`
                    : p.scoreDelta.toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </CommercialModalShell>
  );
};
