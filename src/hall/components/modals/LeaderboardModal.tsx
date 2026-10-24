import React, { useState } from 'react';
import { Flame, Trophy, X } from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#232838] to-[#171a24] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" />
            <h3 className="font-display text-base font-extrabold text-amber-200 sm:text-lg">
              全服巅峰荣誉榜
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-white/10 bg-black/20 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(700);
              hapticEngine.tap();
              setActiveTab('wealth');
            }}
            className={`flex items-center gap-1.5 border-b-2 py-2 px-3 text-xs font-black transition-colors ${
              activeTab === 'wealth'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Trophy className="h-3.5 w-3.5" />
            <span>总积分巅峰榜</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(700);
              hapticEngine.tap();
              setActiveTab('wins');
            }}
            className={`flex items-center gap-1.5 border-b-2 py-2 px-3 text-xs font-black transition-colors ${
              activeTab === 'wins'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-white/60 hover:text-white'
            }`}
          >
            <Flame className="h-3.5 w-3.5" />
            <span>胜场王者榜</span>
          </button>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3.5 sm:p-4">
          {sortedList.map((u, idx) => {
            const isMe = u.playerId === myProfile?.playerId;
            const winRate =
              u.gamesPlayed > 0 ? Math.round((u.gamesWon / u.gamesPlayed) * 100) : 0;

            return (
              <div
                key={u.playerId}
                className={`flex items-center justify-between rounded-2xl border px-3.5 py-2.5 transition-colors ${
                  isMe
                    ? 'border-amber-400/50 bg-amber-500/15'
                    : 'border-white/8 bg-[#12151f]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 text-center font-mono text-sm font-black ${
                      idx === 0
                        ? 'text-amber-300 text-base'
                        : idx === 1
                        ? 'text-slate-300 text-base'
                        : idx === 2
                        ? 'text-amber-600 text-base'
                        : 'text-white/60'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <AvatarSvg avatarId={u.avatarId} size={32} />
                  <div>
                    <div className="text-xs font-bold text-white sm:text-sm">
                      {u.nickname} {isMe && <span className="text-[10px] text-amber-300">(我)</span>}
                    </div>
                    <div className="text-[10px] text-white/55 tabular-nums">
                      总胜局 {u.gamesWon} 场 · 胜率 {winRate}%
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  {activeTab === 'wealth' ? (
                    <div className="flex items-center gap-1 font-mono text-xs font-extrabold text-amber-300 tabular-nums sm:text-sm">
                      <img
                        src="/assets/ui/icon_gold.png"
                        alt="积分"
                        className="h-4 w-4 object-contain"
                      />
                      <span>{u.beans.toLocaleString()} 分</span>
                    </div>
                  ) : (
                    <div className="font-mono text-xs font-extrabold text-emerald-400 tabular-nums sm:text-sm">
                      胜 {u.gamesWon} 局
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sticky Bottom: My Rank */}
        {myProfile && (
          <div className="flex items-center justify-between border-t border-white/10 bg-[#0e111a] px-4 py-2.5 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400">
                我的当前排名：{myRankText}
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-xs font-extrabold text-amber-300">
              <img
                src="/assets/ui/icon_gold.png"
                alt="积分"
                className="h-4 w-4 object-contain"
              />
              <span>{myProfile.beans.toLocaleString()} 分</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
