import React, { useEffect, useState } from 'react';
import type { RoomSummary } from '../../HallView';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import {
  RoomCardGameType,
  RoomCardPayMode,
  RoomCardRoundCap,
  GAME_TYPE_LABELS,
  PAY_MODE_LABELS,
  calculateRoomCardCost,
  roomCardSessionHub,
  useRoomCardSession,
} from '../../../shared/control/RoomCardSessionHub';

export interface CreateRoomCardOptions {
  roomId: string;
  gameType: RoomCardGameType;
  subMode: string;
  subModeLabel: string;
  baseScore: number;
  totalRounds: RoomCardRoundCap;
  payMode: RoomCardPayMode;
  autoFillBots: boolean;
}

interface FriendRoomModalProps {
  open: boolean;
  initialGameType?: RoomCardGameType;
  roomCards: number;
  rooms: RoomSummary[];
  hostId?: string;
  hostName?: string;
  onClose: () => void;
  onCreateRoom: (opts: CreateRoomCardOptions) => void;
  onJoinRoom: (roomId: string, gameType?: RoomCardGameType) => void;
  onOpenRoomCardCenter?: () => void;
}

const GAME_OPTIONS: Array<{
  id: RoomCardGameType;
  label: string;
  subModes: Array<{ id: string; label: string }>;
  baseScores: number[];
}> = [
  {
    id: 'ddz',
    label: '斗地主',
    subModes: [
      { id: 'classic', label: '经典叫抢' },
      { id: 'wild', label: '百变癞子' },
      { id: 'no_shuffle', label: '不洗牌' },
    ],
    baseScores: [100, 300, 800, 2000],
  },
  {
    id: 'mahjong',
    label: '普洱麻将',
    subModes: [
      { id: 'xzdd', label: '血战到底' },
      { id: 'xlch', label: '血流成河' },
      { id: 'classic', label: '推倒胡' },
    ],
    baseScores: [100, 200, 500, 2000],
  },
  {
    id: 'niuniu',
    label: '抢庄牛牛',
    subModes: [
      { id: 'mpqz', label: '看四张抢' },
      { id: 'zyqz', label: '自由抢庄' },
      { id: 'tbnn', label: '通比牛牛' },
    ],
    baseScores: [100, 300, 500, 2000],
  },
  {
    id: 'zhajinhua',
    label: '经典金花',
    subModes: [
      { id: 'classic', label: '经典闷抓' },
      { id: 'passion', label: '短牌大局' },
    ],
    baseScores: [100, 300, 800, 2000],
  },
  {
    id: 'laoyancai',
    label: '云南捞腌菜',
    subModes: [
      { id: 'kunming', label: '双公炸开' },
      { id: 'puer', label: '滇南三腌' },
    ],
    baseScores: [100, 200, 500, 2000],
  },
];

const ROUND_OPTIONS: RoomCardRoundCap[] = [4, 8, 16];

const PAY_OPTIONS: Array<{ mode: RoomCardPayMode; label: string; ruleHint: string }> = [
  { mode: 'host', label: '房主支付', ruleHint: '建房预扣，未开局解散全额退卡' },
  { mode: 'aa', label: 'AA平摊', ruleHint: '全员入座平摊扣卡，未开局退卡' },
  { mode: 'winner', label: '大赢家扣卡', ruleHint: '建房0预扣，终局由最高分大赢家扣卡' },
];

export const FriendRoomModal: React.FC<FriendRoomModalProps> = ({
  open,
  initialGameType = 'ddz',
  rooms,
  hostId = 'local_host',
  hostName = '本家牌手',
  onClose,
  onCreateRoom,
  onJoinRoom,
  onOpenRoomCardCenter,
}) => {
  const { store, balance } = useRoomCardSession();
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');

  // Join state
  const [roomCode, setRoomCode] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Create state
  const [selectedGame, setSelectedGame] = useState<RoomCardGameType>(initialGameType);
  const currentGameMeta =
    GAME_OPTIONS.find((g) => g.id === selectedGame) || GAME_OPTIONS[0];
  const [selectedSubMode, setSelectedSubMode] = useState<string>(
    currentGameMeta.subModes[0].id
  );
  const [baseScore, setBaseScore] = useState<number>(currentGameMeta.baseScores[0]);
  const [totalRounds, setTotalRounds] = useState<RoomCardRoundCap>(8);
  const [payMode, setPayMode] = useState<RoomCardPayMode>('host');
  const [autoFillBots, setAutoFillBots] = useState<boolean>(true);

  useEffect(() => {
    if (open && initialGameType) {
      setSelectedGame(initialGameType);
      const found = GAME_OPTIONS.find((g) => g.id === initialGameType) || GAME_OPTIONS[0];
      setSelectedSubMode(found.subModes[0].id);
      setBaseScore(found.baseScores[0]);
      setFeedbackError(null);
    }
  }, [open, initialGameType]);

  useEffect(() => {
    if (!open || activeTab !== 'join') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setFeedbackError(null);
        setRoomCode((prev) => (prev.length < 6 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setFeedbackError(null);
        setRoomCode((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, activeTab]);

  const handleSelectGame = (gameId: RoomCardGameType) => {
    soundEngine.playTap(740);
    setSelectedGame(gameId);
    const meta = GAME_OPTIONS.find((g) => g.id === gameId) || GAME_OPTIONS[0];
    setSelectedSubMode(meta.subModes[0].id);
    setBaseScore(meta.baseScores[0]);
    setFeedbackError(null);
  };

  const handleDigitPress = (digit: string) => {
    soundEngine.playTap(740);
    setFeedbackError(null);
    setRoomCode((prev) => (prev.length < 6 ? prev + digit : prev));
  };

  const handleBackspace = () => {
    soundEngine.playTap(740);
    setFeedbackError(null);
    setRoomCode((prev) => prev.slice(0, -1));
  };

  const handleClearCode = () => {
    soundEngine.playTap(740);
    setFeedbackError(null);
    setRoomCode('');
  };

  const handlePasteCode = async () => {
    soundEngine.playTap(740);
    try {
      const text = await navigator.clipboard.readText();
      const digits = text.replace(/\D/g, '').slice(0, 6);
      if (digits.length > 0) {
        setRoomCode(digits);
        setFeedbackError(null);
      } else {
        setFeedbackError('剪贴板中未检测到 6 位数字房号');
      }
    } catch {
      if (store.recentRooms[0]?.roomId) {
        setRoomCode(store.recentRooms[0].roomId);
        setFeedbackError(null);
      } else {
        setFeedbackError('无法读取剪贴板，请使用数字键盘输入房号');
      }
    }
  };

  const handleConfirmJoin = (targetCode?: string, targetGame?: RoomCardGameType) => {
    const code = (targetCode ?? roomCode).trim();
    if (!/^\d{6}$/.test(code)) {
      setFeedbackError('请输入完整的 6 位数字房号');
      return;
    }

    const res = roomCardSessionHub.joinSessionByCode({
      roomId: code,
      playerId: hostId,
      playerName: hostName,
      fallbackGameType: targetGame ?? selectedGame,
    });

    if (!res.ok || !res.session) {
      setFeedbackError(res.message);
      return;
    }

    soundEngine.playTap(740);
    onJoinRoom(code, res.session.config.gameType);
  };

  const handleConfirmCreate = () => {
    const subModeObj =
      currentGameMeta.subModes.find((m) => m.id === selectedSubMode) ||
      currentGameMeta.subModes[0];

    const res = roomCardSessionHub.createSession({
      gameType: selectedGame,
      subMode: subModeObj.id,
      subModeLabel: subModeObj.label,
      baseScore,
      totalRounds,
      payMode,
      fillBots: autoFillBots,
      hostId,
      hostName,
    });

    if (!res.ok || !res.session) {
      setFeedbackError(res.message);
      return;
    }

    soundEngine.playTap(740);
    onCreateRoom({
      roomId: res.session.config.roomId,
      gameType: selectedGame,
      subMode: subModeObj.id,
      subModeLabel: subModeObj.label,
      baseScore,
      totalRounds,
      payMode,
      autoFillBots,
    });
  };

  const cardCost = calculateRoomCardCost(totalRounds, payMode);

  return (
    <CommercialModalShell
      open={open}
      onClose={onClose}
      title="好友约局"
      size="lg"
      headerActions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(740);
              if (onOpenRoomCardCenter) {
                onOpenRoomCardCenter();
              } else {
                roomCardSessionHub.claimDailyRoomCards();
              }
            }}
            className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            房卡 <span className="font-mono tabular-nums font-black text-slate-900">{balance}</span>
          </button>

          <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setFeedbackError(null);
                setActiveTab('join');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              加入房间
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setFeedbackError(null);
                setActiveTab('create');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              创建房间
            </button>
          </div>
        </div>
      }
    >
      {feedbackError && (
        <div className="mb-2.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-between">
          <span className="truncate">{feedbackError}</span>
          <button
            type="button"
            onClick={() => setFeedbackError(null)}
            className="text-[11px] underline shrink-0 ml-3 cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      {activeTab === 'join' ? (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
          {/* Left 7 Cols: 6-Slot Code Display + 3x4 Keypad */}
          <div className="sm:col-span-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700">
                  输入 6 位房间号
                </span>
                <button
                  type="button"
                  onClick={handlePasteCode}
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  粘贴房号
                </button>
              </div>

              <div className="grid grid-cols-6 gap-1.5 mb-2.5">
                {Array.from({ length: 6 }).map((_, idx) => {
                  const char = roomCode[idx] || '';
                  const isActiveSlot = idx === roomCode.length;
                  return (
                    <div
                      key={idx}
                      className={`h-10 rounded-lg border flex items-center justify-center font-mono tabular-nums text-base font-black transition-colors ${
                        char
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : isActiveSlot
                          ? 'bg-white border-slate-900 text-slate-400'
                          : 'bg-slate-50 border-slate-200 text-slate-300'
                      }`}
                    >
                      {char || (isActiveSlot ? '-' : '')}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  className="h-9 rounded-lg bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 text-slate-900 font-mono tabular-nums text-sm font-black transition-all cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClearCode}
                className="h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => handleDigitPress('0')}
                className="h-9 rounded-lg bg-slate-50 hover:bg-slate-100 active:scale-[0.98] border border-slate-200 text-slate-900 font-mono tabular-nums text-sm font-black transition-all cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="h-9 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                退格
              </button>
            </div>

            <button
              type="button"
              disabled={roomCode.length < 6}
              onClick={() => handleConfirmJoin()}
              className="mt-2.5 w-full h-9 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black text-xs transition-colors cursor-pointer"
            >
              进入房间
            </button>
          </div>

          {/* Right 5 Cols: Active Rooms List */}
          <div className="sm:col-span-5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">可加入房间</span>
              <span className="text-[11px] text-slate-400">点击直达</span>
            </div>

            <div className="divide-y divide-slate-200/70 max-h-56 overflow-y-auto pr-0.5 flex-1">
              {rooms.length === 0 && store.recentRooms.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  暂无活跃房间，可切换至「创建房间」发起对局
                </div>
              ) : (
                <>
                  {rooms.slice(0, 4).map((r) => (
                    <div
                      key={r.roomId}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 font-mono tabular-nums truncate">
                          #{r.roomId} · {GAME_TYPE_LABELS[(r.gameType as RoomCardGameType) || 'ddz'] || '斗地主'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                          底分 {r.baseScore} · {r.playerCount}/{r.maxPlayers}人
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfirmJoin(
                            r.roomId,
                            (r.gameType as RoomCardGameType) || 'ddz'
                          )
                        }
                        className="h-7 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer"
                      >
                        加入
                      </button>
                    </div>
                  ))}

                  {store.recentRooms
                    .filter((item) => !rooms.some((r) => r.roomId === item.roomId))
                    .map((item) => (
                      <div
                        key={item.roomId}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 truncate">
                            <span className="font-mono tabular-nums">#{item.roomId}</span>
                            <span> · {GAME_TYPE_LABELS[item.gameType]}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {item.subModeLabel} · {item.totalRounds}局 ·{' '}
                            {PAY_MODE_LABELS[item.payMode]}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleConfirmJoin(item.roomId, item.gameType)}
                          className="h-7 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer"
                        >
                          加入
                        </button>
                      </div>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Tab 2: Flat Dynamic Adaptive Grid Layout for Room Creation */
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[56px_1fr] items-center gap-x-3 gap-y-2.5">
            {/* 1. Game Type */}
            <span className="text-xs font-bold text-slate-500">游戏</span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {GAME_OPTIONS.map((game) => {
                const active = selectedGame === game.id;
                return (
                  <button
                    key={game.id}
                    type="button"
                    onClick={() => handleSelectGame(game.id)}
                    className={`h-8 rounded-lg border text-xs font-bold whitespace-nowrap px-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {game.label}
                  </button>
                );
              })}
            </div>

            {/* 2. Sub-Mode */}
            <span className="text-xs font-bold text-slate-500">模式</span>
            <div className="grid grid-cols-3 gap-1.5">
              {currentGameMeta.subModes.map((sm) => {
                const active = selectedSubMode === sm.id;
                return (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(740);
                      setSelectedSubMode(sm.id);
                    }}
                    className={`h-8 rounded-lg border text-xs font-bold whitespace-nowrap px-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {sm.label}
                  </button>
                );
              })}
            </div>

            {/* 3. Base Score */}
            <span className="text-xs font-bold text-slate-500">底分</span>
            <div className="grid grid-cols-4 gap-1.5">
              {currentGameMeta.baseScores.map((score) => {
                const active = baseScore === score;
                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(740);
                      setBaseScore(score);
                    }}
                    className={`h-8 rounded-lg border font-mono tabular-nums text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {score} 分
                  </button>
                );
              })}
            </div>

            {/* 4. Total Rounds */}
            <span className="text-xs font-bold text-slate-500">局数</span>
            <div className="grid grid-cols-3 gap-1.5">
              {ROUND_OPTIONS.map((r) => {
                const active = totalRounds === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(740);
                      setTotalRounds(r);
                    }}
                    className={`h-8 rounded-lg border font-mono tabular-nums text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {r} 局
                  </button>
                );
              })}
            </div>

            {/* 5. Pay Mode */}
            <span className="text-xs font-bold text-slate-500">房费</span>
            <div className="grid grid-cols-3 gap-1.5">
              {PAY_OPTIONS.map((po) => {
                const active = payMode === po.mode;
                return (
                  <button
                    key={po.mode}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(740);
                      setPayMode(po.mode);
                    }}
                    className={`h-8 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {po.label}
                  </button>
                );
              })}
            </div>

            {/* 6. Bot Fill */}
            <span className="text-xs font-bold text-slate-500">补位</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap(740);
                  setAutoFillBots(true);
                }}
                className={`h-8 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  autoFillBots
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                缺人自动补位
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap(740);
                  setAutoFillBots(false);
                }}
                className={`h-8 rounded-lg border text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  !autoFillBots
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                仅限好友入座
              </button>
            </div>
          </div>

          {/* Flat Action Footer Row */}
          <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500 truncate">
              <span>
                需消耗 <strong className="font-mono tabular-nums text-slate-900">{cardCost}</strong> 张房卡（余{' '}
                <strong className="font-mono tabular-nums text-slate-900">{balance}</strong> 张）
              </span>
              <span className="hidden sm:inline text-slate-400">
                {' '}· {PAY_OPTIONS.find((p) => p.mode === payMode)?.ruleHint}
              </span>
            </div>
            <button
              type="button"
              onClick={handleConfirmCreate}
              className="h-9 px-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs whitespace-nowrap transition-colors cursor-pointer shrink-0"
            >
              创建房间
            </button>
          </div>
        </div>
      )}
    </CommercialModalShell>
  );
};
