import React from 'react';
import { X } from 'lucide-react';
import { RoomSummary } from '../../HallView';
import { getRoomTierByBaseScore } from '../../../games/ddz/types';

export interface PublicRoomsModalProps {
  rooms: RoomSummary[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenFriendRoom: () => void;
  onJoinRoom: (roomId: string) => void;
}

const modeShortLabel = (mode?: string) => {
  if (mode === 'tiandi_laizi') return '癞子玩法';
  if (mode === 'laizi') return '经典癞子';
  if (mode === 'no_shuffle') return '不洗牌';
  if (mode === 'swap_three') return '换三张';
  return '经典模式';
};

export const PublicRoomsModal: React.FC<PublicRoomsModalProps> = ({
  rooms,
  onClose,
  onRefresh,
  onOpenFriendRoom,
  onJoinRoom,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex max-h-[84dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">
            在线房间 ({rooms.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFriendRoom();
              }}
              className="h-7 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
            >
              房号/建房
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="h-7 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭面板"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
          {rooms.length === 0 ? (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] py-10 text-center">
              <p className="text-xs text-[#9CA3AF]">当前暂无等待中的公开房间</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {rooms.map((rm) => {
                const tierInfo = getRoomTierByBaseScore(rm.baseScore);
                return (
                  <div
                    key={rm.roomId}
                    className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5 transition-colors hover:border-[#D4AF37]/35"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs sm:text-sm font-bold text-[#F3F4F6]">
                          房号 {rm.roomId}
                        </span>
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-[#9CA3AF]">
                          {modeShortLabel(rm.mode)}
                        </span>
                        <span className="rounded border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#FBBF24]">
                          {tierInfo.name}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#9CA3AF] tabular-nums">
                        底分 {rm.baseScore} · 封顶 ×{tierInfo.maxMultiplier} · 在座{' '}
                        {rm.playerCount}/{rm.maxPlayers}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onJoinRoom(rm.roomId);
                      }}
                      className="h-8 rounded-lg bg-[#D49B35] hover:bg-[#E0A842] px-3.5 text-xs font-bold text-[#111315] transition-colors active:scale-98 cursor-pointer"
                    >
                      加入
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
