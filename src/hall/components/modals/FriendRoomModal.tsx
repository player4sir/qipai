import React, { useEffect, useMemo, useState } from 'react';
import { Delete, X } from 'lucide-react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import {
  CUSTOM_STAKES_LIMITS,
  RoomCardPayMode,
  RoomRoundCount,
  validateCustomStakes,
} from '../../../shared/roomcard/RoomCardSystem';

export type SupportedGameType = 'ddz' | 'mahjong' | 'niuniu' | 'zhajinhua' | 'laoyancai';

export interface FriendRoomModalProps {
  onClose: () => void;
  onJoinRoom: (roomId: string) => void;
  onCreateRoom: (
    baseScore: number,
    isPrivate: boolean,
    autoFillBots: boolean,
    mode?: string,
    gameType?: SupportedGameType,
    totalRounds?: number,
    payMode?: 'host' | 'aa' | 'winner',
    roomId?: string,
    initialScore?: number
  ) => void;
  initialGameType?: SupportedGameType;
  initialMode?: string;
  initialBaseScore?: number;
}

interface HostGameConfigSpec {
  id: SupportedGameType;
  label: string;
  modeRowLabel: string;
  modes: Array<{ id: string; label: string }>;
  capRowLabel: string;
  capOptions: string[];
  rounds: Array<{ count: RoomRoundCount; label: string; cards: number }>;
}

const HOST_GAME_SPECS: HostGameConfigSpec[] = [
  {
    id: 'mahjong',
    label: '普洱麻将',
    modeRowLabel: '麻将玩法',
    modes: [
      { id: 'puer', label: '云南普洱' },
      { id: 'hongzhong', label: '红中血流' },
      { id: 'xuezhan', label: '血战到底' },
      { id: 'tuidaohu', label: '推倒胡' },
    ],
    capRowLabel: '番数封顶',
    capOptions: ['32番封顶', '64番封顶', '不设封顶'],
    rounds: [
      { count: 4, label: '4局 (1房卡)', cards: 1 },
      { count: 8, label: '8局 (2房卡)', cards: 2 },
      { count: 16, label: '16局 (4房卡)', cards: 4 },
    ],
  },
  {
    id: 'ddz',
    label: '斗地主',
    modeRowLabel: '叫牌玩法',
    modes: [
      { id: 'classic', label: '经典叫抢' },
      { id: 'tiandi_laizi', label: '天地癞子' },
      { id: 'no_shuffle', label: '畅爽不洗牌' },
    ],
    capRowLabel: '炸弹封顶',
    capOptions: ['3炸封顶', '4炸封顶', '不设封顶'],
    rounds: [
      { count: 4, label: '4局 (1房卡)', cards: 1 },
      { count: 8, label: '8局 (2房卡)', cards: 2 },
      { count: 16, label: '16局 (4房卡)', cards: 4 },
    ],
  },
  {
    id: 'niuniu',
    label: '抢庄斗牛',
    modeRowLabel: '坐庄模式',
    modes: [
      { id: 'qiangzhuang', label: '看牌抢庄' },
      { id: 'crazy', label: '疯狂翻倍' },
      { id: 'tongbi', label: '通比牛牛' },
    ],
    capRowLabel: '翻倍规则',
    capOptions: ['牛牛3倍', '牛牛4倍', '至尊10倍'],
    rounds: [
      { count: 4, label: '4局 (1房卡)', cards: 1 },
      { count: 8, label: '8局 (2房卡)', cards: 2 },
      { count: 16, label: '16局 (4房卡)', cards: 4 },
    ],
  },
  {
    id: 'zhajinhua',
    label: '经典金花',
    modeRowLabel: '金花玩法',
    modes: [
      { id: 'classic', label: '经典金花' },
      { id: 'bloody', label: '血拼15轮' },
      { id: 'quick', label: '极速8轮' },
    ],
    capRowLabel: '必闷规则',
    capOptions: ['不闷牌', '必闷1轮', '必闷3轮'],
    rounds: [
      { count: 4, label: '4局 (1房卡)', cards: 1 },
      { count: 8, label: '8局 (2房卡)', cards: 2 },
      { count: 16, label: '16局 (4房卡)', cards: 4 },
    ],
  },
  {
    id: 'laoyancai',
    label: '捞腌菜',
    modeRowLabel: '地方玩法',
    modes: [
      { id: 'kunming', label: '昆明双腌' },
      { id: 'yuxi', label: '玉溪轮庄' },
      { id: 'crazy', label: '三公豹子' },
    ],
    capRowLabel: '倍数规则',
    capOptions: ['双腌2倍', '三公5倍', '豹子8倍'],
    rounds: [
      { count: 4, label: '4局 (1房卡)', cards: 1 },
      { count: 8, label: '8局 (2房卡)', cards: 2 },
      { count: 16, label: '16局 (4房卡)', cards: 4 },
    ],
  },
];

const BASE_SCORE_PRESETS = [100, 500, 2000, 10000];
const INITIAL_SCORE_PRESETS = [2000, 10000, 50000, 200000];
const PAY_MODES: Array<{ id: RoomCardPayMode; label: string }> = [
  { id: 'host', label: '房主支付' },
  { id: 'aa', label: 'AA平摊' },
  { id: 'winner', label: '大赢家支付' },
];

export const FriendRoomModal: React.FC<FriendRoomModalProps> = ({
  onClose,
  onJoinRoom,
  onCreateRoom,
  initialGameType = 'ddz',
  initialMode,
  initialBaseScore = 100,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState<string>('');

  const [selectedGameType, setSelectedGameType] = useState<SupportedGameType>(initialGameType);
  const currentSpec = useMemo(
    () => HOST_GAME_SPECS.find((g) => g.id === selectedGameType) ?? HOST_GAME_SPECS[0],
    [selectedGameType]
  );

  const [selectedMode, setSelectedMode] = useState<string>(
    initialMode || currentSpec.modes[0].id
  );
  const [totalRounds, setTotalRounds] = useState<RoomRoundCount>(8);
  const [capIdx, setCapIdx] = useState<number>(1);
  const [payMode, setPayMode] = useState<RoomCardPayMode>('host');

  const [baseScoreInput, setBaseScoreInput] = useState<string>(String(initialBaseScore || 100));
  const [initialScoreInput, setInitialScoreInput] = useState<string>(
    String(Math.max(2000, (initialBaseScore || 100) * 20))
  );

  useEffect(() => {
    if (!currentSpec.modes.some((m) => m.id === selectedMode)) {
      setSelectedMode(currentSpec.modes[0].id);
    }
    setCapIdx(1);
  }, [currentSpec, selectedMode]);

  const rawBase = Number(baseScoreInput) || 0;
  const rawInitial = Number(initialScoreInput) || 0;
  const validation = validateCustomStakes(rawBase, rawInitial);

  const estimatedCardCost = useMemo(() => {
    const roundBase = totalRounds === 4 ? 1 : totalRounds === 8 ? 2 : 4;
    const total = Math.max(roundBase, validation.roomCardCost);
    return payMode === 'aa' ? Math.max(1, Math.ceil(total / 3)) : total;
  }, [totalRounds, validation.roomCardCost, payMode]);

  const handleKeyPress = (num: string) => {
    soundEngine.playTap(750);
    hapticEngine.tap();
    if (roomCode.length < 6) {
      setRoomCode((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    soundEngine.playTap(600);
    hapticEngine.tap();
    setRoomCode((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    soundEngine.playTap(520);
    hapticEngine.tap();
    setRoomCode('');
  };

  const handleJoin = () => {
    if (roomCode.trim()) {
      soundEngine.playTap(820);
      hapticEngine.tap();
      onClose();
      onJoinRoom(roomCode.trim());
    }
  };

  const handleCreate = () => {
    if (!validation.valid) {
      soundEngine.playTap(520);
      return;
    }
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    onClose();
    onCreateRoom(
      validation.normalizedBaseScore,
      false,
      true,
      selectedMode,
      selectedGameType,
      totalRounds,
      payMode,
      undefined,
      validation.normalizedInitialScore
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-amber-200/35 bg-gradient-to-b from-[#2a180d] to-[#1a0f08] text-amber-50 shadow-[0_20px_48px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Segmented Tabs */}
        <div className="flex items-center justify-between border-b border-amber-200/15 bg-black/25 px-5 py-2.5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/35 p-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setActiveTab('create');
              }}
              className={`rounded-lg px-4 py-1 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'create'
                  ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                  : 'text-amber-100/75 hover:text-white'
              }`}
            >
              开设房间
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setActiveTab('join');
              }}
              className={`rounded-lg px-4 py-1 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'join'
                  ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                  : 'text-amber-100/75 hover:text-white'
              }`}
            >
              加入房间
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-amber-100/70 hover:bg-white/15 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {activeTab === 'create' ? (
          <>
            <div className="space-y-3 px-5 py-4">
              {/* Row 0: Select Game */}
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <span className="text-xs font-bold text-amber-100/80">选择游戏</span>
                <div className="grid grid-cols-5 gap-1 rounded-xl bg-black/35 p-1">
                  {HOST_GAME_SPECS.map((g) => {
                    const active = selectedGameType === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playTap(740);
                          setSelectedGameType(g.id);
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                            : 'text-amber-100/75 hover:text-white'
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 1: Game Mode */}
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <span className="text-xs font-bold text-amber-100/80">{currentSpec.modeRowLabel}</span>
                <div
                  className={`grid gap-1 rounded-xl bg-black/35 p-1 ${
                    currentSpec.modes.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
                  }`}
                >
                  {currentSpec.modes.map((m) => {
                    const active = selectedMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playTap(750);
                          setSelectedMode(m.id);
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                            : 'text-amber-100/75 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 2: Round Count */}
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <span className="text-xs font-bold text-amber-100/80">牌局局数</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1">
                  {currentSpec.rounds.map((r) => {
                    const active = totalRounds === r.count;
                    return (
                      <button
                        key={r.count}
                        type="button"
                        onClick={() => {
                          soundEngine.playTap(740);
                          setTotalRounds(r.count);
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                            : 'text-amber-100/75 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Cap Rule */}
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <span className="text-xs font-bold text-amber-100/80">{currentSpec.capRowLabel}</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1">
                  {currentSpec.capOptions.map((opt, idx) => {
                    const active = capIdx === idx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          soundEngine.playTap(740);
                          setCapIdx(idx);
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                            : 'text-amber-100/75 hover:text-white'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Pay Mode */}
              <div className="grid grid-cols-[68px_1fr] items-center gap-3">
                <span className="text-xs font-bold text-amber-100/80">房费支付</span>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1">
                  {PAY_MODES.map((p) => {
                    const active = payMode === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playTap(740);
                          setPayMode(p.id);
                        }}
                        className={`h-8 rounded-lg text-xs font-bold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-gradient-to-b from-[#ffe28a] to-[#f59e0b] text-[#241104] font-black shadow-xs'
                            : 'text-amber-100/75 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 5: Symmetrical 2-Column Stakes */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="rounded-xl border border-amber-200/15 bg-black/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-100/85">房间底分</span>
                    <input
                      type="number"
                      min={CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE}
                      max={CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE}
                      step={10}
                      value={baseScoreInput}
                      onChange={(e) => setBaseScoreInput(e.target.value)}
                      className="h-7 w-22 rounded-lg border border-amber-200/25 bg-black/50 px-2 text-right font-mono text-xs font-black text-amber-300 tabular-nums focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {BASE_SCORE_PRESETS.map((preset) => {
                      const active = rawBase === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            soundEngine.playTap(750);
                            setBaseScoreInput(String(preset));
                            setInitialScoreInput(String(preset * 20));
                          }}
                          className={`h-6.5 rounded-md font-mono text-[11px] font-bold tabular-nums transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-400 text-[#241104] font-black'
                              : 'bg-white/6 text-amber-100/70 hover:bg-white/12'
                          }`}
                        >
                          {preset >= 10000 ? '1万' : preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-amber-200/15 bg-black/30 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-amber-100/85">初始积分</span>
                    <input
                      type="number"
                      min={CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE}
                      max={CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE}
                      step={100}
                      value={initialScoreInput}
                      onChange={(e) => setInitialScoreInput(e.target.value)}
                      className="h-7 w-22 rounded-lg border border-amber-200/25 bg-black/50 px-2 text-right font-mono text-xs font-black text-emerald-300 tabular-nums focus:border-amber-300 focus:outline-none"
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {INITIAL_SCORE_PRESETS.map((preset) => {
                      const active = rawInitial === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            soundEngine.playTap(750);
                            setInitialScoreInput(String(preset));
                          }}
                          className={`h-6.5 rounded-md font-mono text-[11px] font-bold tabular-nums transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-400 text-[#241104] font-black'
                              : 'bg-white/6 text-amber-100/70 hover:bg-white/12'
                          }`}
                        >
                          {preset >= 10000 ? `${preset / 10000}万` : preset}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-amber-200/15 bg-black/30 px-5 py-3">
              {!validation.valid ? (
                <span className="text-xs text-rose-300">{validation.errorMessage}</span>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-100/80">
                  <span>
                    消耗房卡 <strong className="font-mono text-amber-300">{estimatedCardCost}</strong> 张
                  </span>
                  <span className="text-white/25">·</span>
                  <span>
                    底分 <strong className="font-mono text-white">{validation.normalizedBaseScore.toLocaleString()}</strong>
                  </span>
                  <span className="text-white/25">·</span>
                  <span>
                    初始积分 <strong className="font-mono text-emerald-300">{validation.normalizedInitialScore.toLocaleString()}</strong>
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={!validation.valid}
                onClick={handleCreate}
                className={`shrink-0 rounded-xl px-6 py-2 font-display text-sm font-black transition-all whitespace-nowrap ${
                  validation.valid
                    ? 'bg-gradient-to-b from-[#ffe28a] via-[#f59e0b] to-[#d97706] text-[#241104] shadow-md hover:brightness-105 active:scale-95 cursor-pointer'
                    : 'bg-white/10 text-white/35 cursor-not-allowed'
                }`}
              >
                创建房间
              </button>
            </div>
          </>
        ) : (
          /* Tab 2: Clean 6-Digit Room ID Keypad */
          <div className="flex flex-col items-center p-5">
            <div className="mb-3 flex h-12 w-full max-w-xs items-center justify-center rounded-xl border border-amber-200/30 bg-black/45 px-4 font-mono text-2xl font-black tracking-[0.35em] text-amber-300 tabular-nums">
              {roomCode || (
                <span className="font-sans text-xs font-normal tracking-normal text-white/35">
                  请输入 6 位房间号
                </span>
              )}
            </div>

            <div className="grid w-full max-w-xs grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleKeyPress(digit)}
                  className="flex h-11 items-center justify-center rounded-xl bg-black/35 font-mono text-base font-black text-amber-50 hover:bg-amber-400/25 active:scale-95 tabular-nums cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                className="flex h-11 items-center justify-center rounded-xl bg-rose-950/60 text-xs font-bold text-rose-300 hover:bg-rose-900 active:scale-95 cursor-pointer"
              >
                清空
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="flex h-11 items-center justify-center rounded-xl bg-black/35 font-mono text-base font-black text-amber-50 hover:bg-amber-400/25 active:scale-95 tabular-nums cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                className="flex h-11 items-center justify-center rounded-xl bg-amber-950/60 text-amber-300 hover:bg-amber-900 active:scale-95 cursor-pointer"
              >
                <Delete className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!roomCode.trim()}
              onClick={handleJoin}
              className={`mt-4 w-full max-w-xs rounded-xl py-2.5 font-display text-sm font-black transition-all ${
                roomCode.trim()
                  ? 'bg-gradient-to-b from-[#ffe28a] via-[#f59e0b] to-[#d97706] text-[#241104] shadow-md hover:brightness-105 active:scale-95 cursor-pointer'
                  : 'bg-white/10 text-white/35 cursor-not-allowed'
              }`}
            >
              加入房间
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
