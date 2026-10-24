import React from 'react';
import { Coins, Trophy } from 'lucide-react';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { RankMedalSvg } from '../../../shared/ui/ModalVectorIcons';
import type { UserProfile } from '../../HallView';

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
  return (
    <CommercialModalShell
      title="巅峰积分榜"
      subtitle="全服累计对局积分与胜率实时排行"
      icon={<Trophy className="h-5 w-5" />}
      size="md"
      onClose={onClose}
    >
      {leaderboard.length === 0 ? (
        <div className="rounded-2xl border border-[#E8E1D0] bg-white py-12 text-center text-sm font-medium text-[#8C96A4]">
          暂无榜单数据
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((item, idx) => {
            const rank = idx + 1;
            const isMe = myProfile?.playerId === item.playerId;
            const winRate =
              item.gamesPlayed > 0
                ? Math.round((item.gamesWon / item.gamesPlayed) * 100)
                : 0;

            return (
              <div
                key={item.playerId}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-all ${
                  isMe
                    ? 'border-[#F59E0B] bg-[#FFFBEB] shadow-xs'
                    : 'border-[#E8E1D0] bg-white hover:border-[#DEC99A]'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex w-7 shrink-0 items-center justify-center">
                    <RankMedalSvg rank={rank} className="h-7 w-7" />
                  </div>
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#DEC99A] bg-[#F5F1E7]">
                    <AvatarSvg avatarId={item.avatarId} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-black text-[#1E242B]">
                        {item.nickname}
                      </span>
                      {isMe && (
                        <span className="text-xs font-extrabold text-[#D97706] whitespace-nowrap shrink-0">
                          · 我
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] font-medium text-[#5A6572] tabular-nums">
                      对局 {item.gamesPlayed} 场 · 胜率 {winRate}%
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1 text-right font-mono text-sm font-black text-[#B45309] tabular-nums">
                  <span>{item.beans > 0 ? `+${item.beans.toLocaleString()}` : item.beans.toLocaleString()} 积分</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CommercialModalShell>
  );
};
