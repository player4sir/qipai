import React, { useState } from 'react';
import { X } from 'lucide-react';
import { UserProfile } from '../../HallView';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface LeaderboardModalProps {
  leaderboard: UserProfile[];
  myProfile: UserProfile | null;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  leaderboard,
  myProfile,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'wealth' | 'wins'>('wealth');

  const myRankIdx = leaderboard.findIndex((u) => u.playerId === myProfile?.playerId);
  const myRankText = myRankIdx >= 0 ? `#${myRankIdx + 1}` : '榜外';

  const sortedList = [...leaderboard].sort((a, b) => {
    if (activeTab === 'wealth') return b.beans - a.beans;
    return b.gamesWon - a.gamesWon;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex max-h-[84dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">排行榜</h3>

          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/35 p-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(700);
                hapticEngine.tap();
                setActiveTab('wealth');
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'wealth'
                  ? 'bg-[#D49B35] text-[#111315]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              积分榜
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(700);
                hapticEngine.tap();
                setActiveTab('wins');
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'wins'
                  ? 'bg-[#D49B35] text-[#111315]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              胜场榜
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto overscroll-contain p-4">
          {sortedList.map((u, idx) => {
            const isMe = u.playerId === myProfile?.playerId;
            const winRate =
              u.gamesPlayed > 0 ? Math.round((u.gamesWon / u.gamesPlayed) * 100) : 0;

            return (
              <div
                key={u.playerId}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 transition-colors ${
                  isMe
                    ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08]'
                    : 'border-white/[0.07] bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-7 text-center font-mono text-xs sm:text-sm font-bold shrink-0 ${
                      idx === 0
                        ? 'text-[#FBBF24]'
                        : idx === 1
                        ? 'text-[#CBD5E1]'
                        : idx === 2
                        ? 'text-[#D97706]'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <div className="shrink-0">
                    <AvatarSvg avatarId={u.avatarId} size={34} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-[#F3F4F6] truncate">
                      {u.nickname}{' '}
                      {isMe && <span className="text-xs font-medium text-[#FBBF24]">· 我</span>}
                    </div>
                    <div className="text-[11px] text-[#9CA3AF] tabular-nums">
                      胜局 {u.gamesWon} 场 · 胜率 {winRate}%
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {activeTab === 'wealth' ? (
                    <span className="font-mono text-xs sm:text-sm font-bold text-[#FBBF24] tabular-nums">
                      {u.beans.toLocaleString()} 分
                    </span>
                  ) : (
                    <span className="font-mono text-xs sm:text-sm font-bold text-[#F3F4F6] tabular-nums">
                      {u.gamesWon} 胜
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky Bottom: My Rank */}
        {myProfile && (
          <div className="flex shrink-0 items-center justify-between border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5 text-xs">
            <span className="font-medium text-[#9CA3AF]">
              我的当前排名：<strong className="font-mono text-[#F3F4F6]">{myRankText}</strong>
            </span>
            <span className="font-mono font-bold text-[#FBBF24] tabular-nums">
              {myProfile.beans.toLocaleString()} 分
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
