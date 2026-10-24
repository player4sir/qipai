import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Coins, Film, History, RefreshCw, X } from 'lucide-react';
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
  REALTIME_TRANSFER: '牌局实时刮风下雨/积分结算',
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2.5 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#232838] to-[#171a24] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + 3-in-1 Segmented Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-amber-300" />
            <h3 className="font-display text-base font-extrabold text-amber-200 sm:text-lg whitespace-nowrap">
              战绩中心与房卡积分账本
            </h3>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-black/40 p-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setActiveTab('matches');
              }}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'matches'
                  ? 'bg-amber-500 text-[#18181B]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              <span>对局战绩</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(760);
                setActiveTab('ledger');
                void fetchLedger();
              }}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-amber-500 text-[#18181B]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>账本流水</span>
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(780);
                setActiveTab('stats');
              }}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-amber-500 text-[#18181B]'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>生涯统计</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* TAB 1: MATCH RECORDS WITH GAME FILTER */}
        {activeTab === 'matches' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Game Filter Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/8 bg-black/20 px-4 py-2">
              {(
                [
                  { id: 'all', label: '全部游戏' },
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
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    gameFilter === f.id
                      ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50'
                      : 'bg-white/5 text-white/60 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
              {filteredMatches.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/60 sm:text-sm">
                  暂无该分类下的对局记录，完成任意一局牌局后即可在此处查看明细与斗地主三家明牌复盘！
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 bg-[#12151f] px-3.5 py-2.5 transition-colors hover:border-white/15"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-white/85">
                            <span className="font-bold text-amber-300">
                              {modeShortLabel(m.gameType, m.dealMode)}
                            </span>
                            <span aria-hidden="true" className="text-white/30">
                              ·
                            </span>
                            <span className="font-mono tabular-nums text-white/75">
                              底分 {m.baseScore} · ×{m.multiplier}
                            </span>
                            {myEntry?.role && (
                              <>
                                <span aria-hidden="true" className="text-white/30">
                                  ·
                                </span>
                                <span className="text-white/65">{myEntry.role}</span>
                              </>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] text-white/45 tabular-nums">
                            房号 {m.roomId} · {new Date(m.timestamp).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`font-mono text-xs font-extrabold tabular-nums sm:text-sm ${
                              delta >= 0 ? 'text-amber-300' : 'text-rose-400'
                            }`}
                          >
                            {delta >= 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()} 分
                          </span>
                          {isDdz && (
                            <button
                              type="button"
                              onClick={() => onOpenReplay(m)}
                              disabled={loadingReplayId === m.id}
                              className="flex items-center gap-1 rounded-xl border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-200 hover:bg-amber-500/30 active:scale-95 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                            >
                              <Film className="h-3 w-3" />
                              <span>{loadingReplayId === m.id ? '加载中' : '明牌复盘'}</span>
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

        {/* TAB 2: BEAN & ROOM CARD AUDIT LEDGER */}
        {activeTab === 'ledger' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 bg-black/20 px-4 py-2 text-xs text-white/65">
              <span>实时记录房卡与对局积分增减流水（服务端原子落盘审计）</span>
              <button
                type="button"
                onClick={() => void fetchLedger()}
                className="flex items-center gap-1 rounded-lg bg-white/8 px-2 py-1 text-[11px] font-bold text-amber-200 hover:bg-white/15 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${loadingLedger ? 'animate-spin' : ''}`} />
                <span>刷新流水</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 sm:p-4">
              {ledger.length === 0 ? (
                <p className="py-10 text-center text-xs text-white/60 sm:text-sm">
                  暂无账本流水记录
                </p>
              ) : (
                <div className="space-y-2">
                  {ledger.map((item) => {
                    const gameLabel = item.gameType ? GAME_NAME_MAP[item.gameType] : undefined;
                    const reasonText = LEDGER_REASON_MAP[item.reason] || item.reason;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/8 bg-[#12151f] px-3.5 py-2"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-bold text-amber-200">{reasonText}</span>
                            {gameLabel && (
                              <>
                                <span aria-hidden="true" className="text-white/30">
                                  ·
                                </span>
                                <span className="text-white/75">{gameLabel}</span>
                              </>
                            )}
                            {item.roomId && (
                              <>
                                <span aria-hidden="true" className="text-white/30">
                                  ·
                                </span>
                                <span className="font-mono text-white/55 tabular-nums">
                                  房号 {item.roomId}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] text-white/45 tabular-nums">
                            {new Date(item.timestamp).toLocaleString()}
                          </p>
                        </div>

                        <div className="flex flex-col items-end font-mono tabular-nums">
                          <div className="flex items-center gap-2 text-xs font-extrabold">
                            {item.deltaBeans !== 0 && (
                              <span
                                className={
                                  item.deltaBeans > 0 ? 'text-emerald-400' : 'text-rose-400'
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
                                  item.deltaRoomCards > 0 ? 'text-amber-300' : 'text-sky-300'
                                }
                              >
                                {item.deltaRoomCards > 0
                                  ? `+${item.deltaRoomCards}`
                                  : item.deltaRoomCards}{' '}
                                房卡
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-white/50">
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

        {/* TAB 3: PER-GAME CAREER ANALYTICS */}
        {activeTab === 'stats' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Top Summary Strip */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#12151f] p-3">
                <div className="text-[11px] text-white/55">累计对局场次</div>
                <div className="mt-1 font-mono text-lg font-black text-white tabular-nums">
                  {careerStats.totalPlayed} 局
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#12151f] p-3">
                <div className="text-[11px] text-white/55">综合胜率</div>
                <div className="mt-1 font-mono text-lg font-black text-emerald-400 tabular-nums">
                  {careerStats.overallWinRate}%
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#12151f] p-3">
                <div className="text-[11px] text-white/55">近期净赢总积分</div>
                <div
                  className={`mt-1 font-mono text-lg font-black tabular-nums ${
                    careerStats.totalNetBeans >= 0 ? 'text-amber-300' : 'text-rose-400'
                  }`}
                >
                  {careerStats.totalNetBeans >= 0
                    ? `+${careerStats.totalNetBeans.toLocaleString()}`
                    : careerStats.totalNetBeans.toLocaleString()}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#12151f] p-3">
                <div className="text-[11px] text-white/55">单局最高得分</div>
                <div className="mt-1 font-mono text-lg font-black text-amber-300 tabular-nums">
                  +{careerStats.bestSingleWin.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Per-Game Breakdown Table */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#12151f]">
              <div className="grid grid-cols-5 border-b border-white/10 bg-white/5 px-3.5 py-2 text-[11px] font-bold text-white/65">
                <span>游戏品类</span>
                <span className="text-right">对局数</span>
                <span className="text-right">胜场</span>
                <span className="text-right">胜率</span>
                <span className="text-right">净盈亏分</span>
              </div>
              <div className="divide-y divide-white/6">
                {careerStats.gamesList.map((g) => {
                  const winRate = g.played > 0 ? Math.round((g.won / g.played) * 100) : 0;
                  return (
                    <div
                      key={g.gameType}
                      className="grid grid-cols-5 items-center px-3.5 py-2.5 text-xs"
                    >
                      <span className="font-bold text-amber-200">{g.label}</span>
                      <span className="text-right font-mono text-white/85 tabular-nums">
                        {g.played}
                      </span>
                      <span className="text-right font-mono text-white/85 tabular-nums">
                        {g.won}
                      </span>
                      <span className="text-right font-mono text-emerald-400 tabular-nums">
                        {winRate}%
                      </span>
                      <span
                        className={`text-right font-mono font-bold tabular-nums ${
                          g.netBeans >= 0 ? 'text-amber-300' : 'text-rose-400'
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
