import React from 'react';
import { Film, History } from 'lucide-react';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import type { MatchRecord } from '../../HallView';

export interface MatchRecordsModalProps {
  matches: MatchRecord[];
  myPlayerId?: string;
  loadingReplayId: string | null;
  onClose: () => void;
  onOpenReplay: (match: MatchRecord) => void;
}

export const MatchRecordsModal: React.FC<MatchRecordsModalProps> = ({
  matches,
  loadingReplayId,
  onClose,
  onOpenReplay,
}) => {
  return (
    <CommercialModalShell
      title="历史战绩与牌谱回放"
      subtitle="支持斗地主全视角三家明牌复盘回看"
      icon={<History className="h-5 w-5" />}
      size="md"
      onClose={onClose}
    >
      {matches.length === 0 ? (
        <div className="rounded-2xl border border-[#E8E1D0] bg-white py-12 text-center text-sm font-medium text-[#8C96A4]">
          暂无近期战绩记录
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[#E8E1D0] bg-white px-4 py-3 shadow-2xs transition-colors hover:border-[#DEC99A]"
            >
              <div className="min-w-0">
                <div className="font-mono text-xs sm:text-sm font-black text-[#1E242B] tabular-nums">
                  房间 #{m.roomId} · 底分 {m.baseScore} · 倍数 ×{m.multiplier}
                </div>
                <div className="mt-0.5 font-mono text-[11px] font-medium text-[#5A6572] tabular-nums">
                  {new Date(m.timestamp).toLocaleString()}
                </div>
              </div>
              {m.gameType === 'ddz' && (
                <button
                  type="button"
                  onClick={() => onOpenReplay(m)}
                  disabled={loadingReplayId === m.id}
                  className="flex items-center gap-1.5 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-3.5 py-1.5 text-xs font-black text-[#B45309] hover:bg-[#FEF3C7] active:scale-95 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>{loadingReplayId === m.id ? '加载中...' : '明牌回放'}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </CommercialModalShell>
  );
};
