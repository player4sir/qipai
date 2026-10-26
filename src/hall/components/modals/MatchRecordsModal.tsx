import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { MatchRecord } from '../../HallView';
import { soundEngine } from '../../../shared/audio/SoundEngine';

export interface BeanLedgerItem {
  id: string;
  playerId: string;
  roomId?: string;
  gameType?: string;
  deltaBeans: number;
  balanceAfter: number;
  deltaRoomCards?: number;
  roomCardsAfter?: number;
  reason: string;
  timestamp: number;
}

export interface MatchRecordsModalProps {
  matches: MatchRecord[];
  myPlayerId?: string;
  loadingReplayId: string | null;
  onClose: () => void;
  onOpenReplay: (match: MatchRecord) => void;
}

type ModalTab = 'matches' | 'ledger' | 'stats';
type GameFilter = 'all' | 'ddz' | 'mahjong' | 'niuniu' | 'zhajinhua' | 'laoyancai';

const GAME_NAME_MAP: Record<string, string> = {
  ddz: '斗地主',
  mahjong: '国粹麻将',
  niuniu: '抢庄牛牛',
  zhajinhua: '诈金花',
  laoyancai: '云南捞腌菜',
};

const LEDGER_REASON_MAP: Record<string, string> = {
  INITIAL_GRANT: '新号初始赠礼',
  BANKRUPTCY_RELIEF: '低保救济补助',
  FREE_SUPPLY: '大厅免费补给',
  ROOM_CREATE: '创建好友房间',
  ROUND_SETTLEMENT: '牌局终局结算',
  REALTIME_TRANSFER: '牌局实时积分结算',
};

const modeShortLabel = (gameType?: string, mode?: string) => {
  if (gameType === 'mahjong') return '麻将对局';
  if (gameType === 'niuniu') return '抢庄牛牛';
  if (gameType === 'zhajinhua') return '诈金花';
  if (gameType === 'laoyancai') return '云南捞腌菜';
  if (mode === 'tiandi_laizi') return '天地癞子';
  if (mode === 'laizi') return '经典癞子';
  if (mode === 'no_shuffle') return '不洗牌';
  return '经典斗地主';
};

export const MatchRecordsModal: React.FC<MatchRecordsModalProps> = ({
  matches,
  myPlayerId,
  loadingReplayId,
  onClose,
  onOpenReplay,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('matches');
  const [gameFilter, setGameFilter] = useState<GameFilter>('all');
  const [ledger, setLedger] = useState<BeanLedgerItem[]>([]);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);

  const fetchLedger = async () => {
    if (!myPlayerId) return;
    setLoadingLedger(true);
    try {
      const resp = await fetch(`/api/ledger/${encodeURIComponent(myPlayerId)}?limit=40`);
      if (resp.ok) {
        const data = (await resp.json()) as { ledger?: BeanLedgerItem[] };
        if (Array.isArray(data.ledger)) {
          setLedger(data.ledger);
        }
      }
    } catch {
      // Ignore network fetch error
    } finally {
      setLoadingLedger(false);
    }
  };

  useEffect(() => {
    void fetchLedger();
  }, [myPlayerId]);

  const filteredMatches = useMemo(() => {
    if (gameFilter === 'all') return matches;
    return matches.filter((m) => (m.gameType || 'ddz') === gameFilter);
  }, [matches, gameFilter]);

  const careerStats = useMemo(() => {
    const byGame: Record<
      string,
      { gameType: string; label: string; played: number; won: number; netBeans: number; maxWin: number }
    > = {
      ddz: { gameType: 'ddz', label: '斗地主', played: 0, won: 0, netBeans: 0, maxWin: 0 },
      mahjong: { gameType: 'mahjong', label: '国粹麻将', played: 0, won: 0, netBeans: 0, maxWin: 0 },
      niuniu: { gameType: 'niuniu', label: '抢庄牛牛', played: 0, won: 0, netBeans: 0, maxWin: 0 },
      zhajinhua: { gameType: 'zhajinhua', label: '诈金花', played: 0, won: 0, netBeans: 0, maxWin: 0 },
      laoyancai: { gameType: 'laoyancai', label: '云南捞腌菜', played: 0, won: 0, netBeans: 0, maxWin: 0 },
    };

    let totalPlayed = 0;
    let totalWon = 0;
    let totalNetBeans = 0;
    let bestSingleWin = 0;

    for (const m of matches) {
      const myEntry = m.players.find((p) => p.playerId === myPlayerId);
      if (!myEntry) continue;
      const gKey = m.gameType && byGame[m.gameType] ? m.gameType : 'ddz';
      const bucket = byGame[gKey];
      const delta = myEntry.scoreDelta ?? 0;
      const won = Boolean(myEntry.isWinner || delta > 0);

      bucket.played += 1;
      if (won) bucket.won += 1;
      bucket.netBeans += delta;
      if (delta > bucket.maxWin) bucket.maxWin = delta;

      totalPlayed += 1;
      if (won) totalWon += 1;
      totalNetBeans += delta;
      if (delta > bestSingleWin) bestSingleWin = delta;
    }

    const overallWinRate = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0;
    return {
      totalPlayed,
      totalWon,
      overallWinRate,
      totalNetBeans,
      bestSingleWin,
      gamesList: Object.values(byGame),
    };
  }, [matches, myPlayerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex max-h-[84dvh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + Pure Text Tabs */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6] whitespace-nowrap">
            战绩与账本
          </h3>

          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-black/35 p-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setActiveTab('matches');
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'matches'
                  ? 'bg-[#D49B35] text-[#111315]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              对局战绩
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(760);
                setActiveTab('ledger');
                void fetchLedger();
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-[#D49B35] text-[#111315]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              账本流水
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(780);
                setActiveTab('stats');
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-[#D49B35] text-[#111315]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              生涯统计
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

        {/* TAB 1: MATCH RECORDS */}
        {activeTab === 'matches' && (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            {/* Game Filter Strip */}
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.06] bg-black/25 px-4 py-2">
              {(
                [
                  { id: 'all', label: '全部' },
                  { id: 'ddz', label: '斗地主' },
                  { id: 'mahjong', label: '麻将' },
                  { id: 'niuniu', label: '抢庄牛牛' },
                  { id: 'zhajinhua', label: '诈金花' },
                  { id: 'laoyancai', label: '云南捞腌菜' },
                ] as Array<{ id: GameFilter; label: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playTap(720);
                    setGameFilter(f.id);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    gameFilter === f.id
                      ? 'bg-[#D49B35] text-[#111315] font-bold'
                      : 'border border-white/[0.08] bg-white/[0.04] text-[#9CA3AF] hover:text-[#F3F4F6]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
              {filteredMatches.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#9CA3AF]">
                  暂无对局记录
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredMatches.map((m) => {
                    const myEntry = m.players.find(
                      (p: { playerId: string; scoreDelta: number; role: string }) =>
                        p.playerId === myPlayerId
                    );
                    const delta = myEntry?.scoreDelta ?? 0;
                    const isDdz = !m.gameType || m.gameType === 'ddz';

                    return (
                      <div
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#F3F4F6]">
                            <span className="font-bold text-[#FBBF24]">
                              {modeShortLabel(m.gameType, m.dealMode)}
                            </span>
                            <span aria-hidden="true" className="text-white/20">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-[#D1D5DB]">
                              底分 {m.baseScore} · ×{m.multiplier}
                            </span>
                            {myEntry?.role && (
                              <>
                                <span aria-hidden="true" className="text-white/20">
                                  ·
                                </span>
                                <span className="text-[#9CA3AF]">{myEntry.role}</span>
                              </>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] text-[#6B7280] tabular-nums">
                            房号 {m.roomId} · {new Date(m.timestamp).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`font-mono text-xs font-bold tabular-nums sm:text-sm ${
                              delta > 0
                                ? 'text-[#FBBF24]'
                                : delta < 0
                                ? 'text-[#F87171]'
                                : 'text-[#9CA3AF]'
                            }`}
                          >
                            {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} 分
                          </span>
                          {isDdz && (
                            <button
                              type="button"
                              onClick={() => onOpenReplay(m)}
                              disabled={loadingReplayId === m.id}
                              className="h-7 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-2.5 text-xs font-semibold text-[#E5E7EB] active:scale-98 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                            >
                              {loadingReplayId === m.id ? '加载中' : '明牌复盘'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LEDGER */}
        {activeTab === 'ledger' && (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-end border-b border-white/[0.06] bg-black/25 px-4 py-2">
              <button
                type="button"
                onClick={() => void fetchLedger()}
                disabled={loadingLedger}
                className="h-7 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] whitespace-nowrap cursor-pointer"
              >
                {loadingLedger ? '刷新中...' : '刷新流水'}
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
              {ledger.length === 0 ? (
                <p className="py-10 text-center text-xs text-[#9CA3AF]">
                  暂无流水记录
                </p>
              ) : (
                <div className="space-y-2">
                  {ledger.map((item) => {
                    const gameLabel = item.gameType ? GAME_NAME_MAP[item.gameType] : undefined;
                    const reasonText = LEDGER_REASON_MAP[item.reason] || item.reason;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-[#F3F4F6]">{reasonText}</span>
                            {gameLabel && (
                              <>
                                <span aria-hidden="true" className="text-white/20">
                                  ·
                                </span>
                                <span className="text-[#D1D5DB]">{gameLabel}</span>
                              </>
                            )}
                            {item.roomId && (
                              <>
                                <span aria-hidden="true" className="text-white/20">
                                  ·
                                </span>
                                <span className="font-mono text-[#9CA3AF] tabular-nums">
                                  房号 {item.roomId}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[11px] text-[#6B7280] tabular-nums">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-col items-end font-mono tabular-nums">
                          <div className="flex items-center gap-2 text-xs font-bold">
                            {item.deltaBeans !== 0 && (
                              <span
                                className={
                                  item.deltaBeans > 0 ? 'text-[#FBBF24]' : 'text-[#F87171]'
                                }
                              >
                                {item.deltaBeans > 0
                                  ? `+${item.deltaBeans.toLocaleString()}`
                                  : item.deltaBeans.toLocaleString()}{' '}
                                分
                              </span>
                            )}
                            {item.deltaRoomCards !== undefined && item.deltaRoomCards !== 0 && (
                              <span
                                className={
                                  item.deltaRoomCards > 0 ? 'text-[#FBBF24]' : 'text-[#9CA3AF]'
                                }
                              >
                                {item.deltaRoomCards > 0
                                  ? `+${item.deltaRoomCards}`
                                  : item.deltaRoomCards}{' '}
                                房卡
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#9CA3AF]">
                            结余 {item.balanceAfter.toLocaleString()} 分
                            {item.roomCardsAfter !== undefined
                              ? ` · ${item.roomCardsAfter} 房卡`
                              : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CAREER STATS */}
        {activeTab === 'stats' && (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3.5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium text-[#9CA3AF]">累计对局</div>
                <div className="mt-1 font-mono text-base font-bold text-[#F3F4F6] tabular-nums">
                  {careerStats.totalPlayed} 局
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium text-[#9CA3AF]">综合胜率</div>
                <div className="mt-1 font-mono text-base font-bold text-[#F3F4F6] tabular-nums">
                  {careerStats.overallWinRate}%
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium text-[#9CA3AF]">净赢总积分</div>
                <div
                  className={`mt-1 font-mono text-base font-bold tabular-nums ${
                    careerStats.totalNetBeans >= 0 ? 'text-[#FBBF24]' : 'text-[#F87171]'
                  }`}
                >
                  {careerStats.totalNetBeans >= 0
                    ? `+${careerStats.totalNetBeans.toLocaleString()}`
                    : careerStats.totalNetBeans.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <div className="text-[11px] font-medium text-[#9CA3AF]">单局最高分</div>
                <div className="mt-1 font-mono text-base font-bold text-[#FBBF24] tabular-nums">
                  +{careerStats.bestSingleWin.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03]">
              <div className="grid grid-cols-5 border-b border-white/[0.07] bg-white/[0.02] px-3.5 py-2 text-[11px] font-semibold text-[#9CA3AF]">
                <span>游戏品类</span>
                <span className="text-right">对局数</span>
                <span className="text-right">胜场</span>
                <span className="text-right">胜率</span>
                <span className="text-right">净盈亏分</span>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {careerStats.gamesList.map((g) => {
                  const winRate = g.played > 0 ? Math.round((g.won / g.played) * 100) : 0;
                  return (
                    <div
                      key={g.gameType}
                      className="grid grid-cols-5 items-center px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-semibold text-[#F3F4F6]">{g.label}</span>
                      <span className="text-right font-mono text-[#9CA3AF] tabular-nums">
                        {g.played}
                      </span>
                      <span className="text-right font-mono text-[#9CA3AF] tabular-nums">
                        {g.won}
                      </span>
                      <span className="text-right font-mono text-[#F3F4F6] tabular-nums">
                        {winRate}%
                      </span>
                      <span
                        className={`text-right font-mono font-bold tabular-nums ${
                          g.netBeans >= 0 ? 'text-[#FBBF24]' : 'text-[#F87171]'
                        }`}
                      >
                        {g.netBeans >= 0
                          ? `+${g.netBeans.toLocaleString()}`
                          : g.netBeans.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
