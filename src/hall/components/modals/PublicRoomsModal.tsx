import React from 'react';
import { KeyRound, RefreshCw, X } from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#232838] to-[#171a24] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-display text-base font-extrabold text-white sm:text-lg">
              实时公开牌桌（{rooms.length} 桌在线）
            </h3>
            <p className="text-xs text-white/60">
              支持一键加入公开房或点击「好友房」输入房号直达
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFriendRoom();
              }}
              className="flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30 active:scale-95"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>房号/建房</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>刷新</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
          {rooms.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#12151f] py-10 text-center">
              <p className="text-xs text-white/65 sm:text-sm">
                当前暂无等待中的公开房间，可前往斗地主专场直接选场匹配开局！
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {rooms.map((rm) => {
                const tierInfo = getRoomTierByBaseScore(rm.baseScore);
                return (
                  <div
                    key={rm.roomId}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#12151f] p-3.5 transition-colors hover:border-amber-400/30"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-amber-300 sm:text-sm">
                          房号 {rm.roomId}
                        </span>
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                          {modeShortLabel(rm.mode)}
                        </span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80">
                          {tierInfo.name}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/60 tabular-nums">
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
                      className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-[#18181B] hover:bg-amber-400 active:scale-95"
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
