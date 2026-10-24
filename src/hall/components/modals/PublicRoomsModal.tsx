import React from 'react';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import type { RoomSummary } from '../../HallView';

export interface PublicRoomsModalProps {
  rooms: RoomSummary[];
  onClose: () => void;
  onRefresh: () => void;
  onOpenFriendRoom: () => void;
  onJoinRoom: (roomId: string) => void;
}

export const PublicRoomsModal: React.FC<PublicRoomsModalProps> = ({
  rooms,
  onClose,
  onRefresh,
  onOpenFriendRoom,
  onJoinRoom,
}) => {
  return (
    <CommercialModalShell
      title="公开房间"
      size="md"
      onClose={onClose}
      headerExtra={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRefresh}
            className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFriendRoom();
            }}
            className="h-7 px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-xs font-black text-white active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            创建房间
          </button>
        </div>
      }
    >
      {rooms.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 py-10 text-center text-xs font-medium text-slate-400">
          暂无等待中的公开房间，可点击右上角「创建房间」发起对局
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3.5">
          {rooms.map((r) => (
            <div
              key={r.roomId}
              className="flex items-center justify-between gap-3 py-2.5"
            >
              <div>
                <div className="font-mono text-xs font-black text-slate-900 tabular-nums">
                  房间 #{r.roomId}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                  底分 {r.baseScore} · {r.playerCount}/{r.maxPlayers}人
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onJoinRoom(r.roomId);
                  onClose();
                }}
                className="h-7 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
              >
                加入
              </button>
            </div>
          ))}
        </div>
      )}
    </CommercialModalShell>
  );
};
