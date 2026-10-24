import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, ShieldCheck, X } from 'lucide-react';
import { soundEngine } from '../audio/SoundEngine';
import { hapticEngine } from '../haptics/HapticEngine';
import {
  CUSTOM_STAKES_LIMITS,
  RoomCardPayMode,
  RoomRoundCount,
  validateCustomStakes,
} from './RoomCardSystem';

export type EntryGameType = 'ddz' | 'mahjong' | 'niuniu' | 'zhajinhua' | 'laoyancai';
export type RoomEntryActionType = 'quick_match' | 'create_room' | 'join_room';

export interface RoomEntryRequest {
  actionType: RoomEntryActionType;
  gameType: EntryGameType;
  mode?: string;
  baseScore: number;
  initialScore?: number;
  fillBots?: boolean;
  isPrivate?: boolean;
  totalRounds?: number;
  payMode?: RoomCardPayMode;
  roomId?: string;
}

export interface ConfirmedRoomEntryPayload {
  actionType: RoomEntryActionType;
  gameType: EntryGameType;
  mode: string;
  baseScore: number;
  initialScore: number;
  roomCardCost: number;
  fillBots: boolean;
  isPrivate: boolean;
  totalRounds: RoomRoundCount;
  payMode: RoomCardPayMode;
  roomId?: string;
}

export interface RoomEntryManagerProps {
  pendingRequest: RoomEntryRequest | null;
  availableRoomCards: number;
  frozenRoomCards?: number;
  onCancel: () => void;
  onReplenishRoomCards: () => void;
  onConfirmEntry: (payload: ConfirmedRoomEntryPayload) => void;
}

interface GameEntrySchema {
  title: string;
  modeRowLabel: string;
  modes: Array<{ id: string; label: string }>;
  rounds: Array<{ count: RoomRoundCount; label: string; baseCards: number }>;
  capRowLabel: string;
  capOptions: string[];
}

const GAME_ENTRY_SCHEMAS: Record<EntryGameType, GameEntrySchema> = {
  mahjong: {
    title: '普洱麻将',
    modeRowLabel: '麻将玩法',
    modes: [
      { id: 'puer', label: '云南普洱' },
      { id: 'hongzhong', label: '红中血流' },
      { id: 'xuezhan', label: '血战到底' },
      { id: 'tuidaohu', label: '推倒胡' },
    ],
    rounds: [
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
    ],
    capRowLabel: '番数封顶',
    capOptions: ['32番封顶', '64番封顶', '不设封顶'],
  },
  ddz: {
    title: '斗地主',
    modeRowLabel: '叫牌玩法',
    modes: [
      { id: 'classic', label: '经典叫抢' },
      { id: 'tiandi_laizi', label: '天地癞子' },
      { id: 'no_shuffle', label: '畅爽不洗牌' },
    ],
    rounds: [
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
    ],
    capRowLabel: '炸弹封顶',
    capOptions: ['3炸封顶', '4炸封顶', '不设封顶'],
  },
  niuniu: {
    title: '抢庄斗牛',
    modeRowLabel: '坐庄模式',
    modes: [
      { id: 'qiangzhuang', label: '看牌抢庄' },
      { id: 'crazy', label: '疯狂翻倍' },
      { id: 'tongbi', label: '通比牛牛' },
    ],
    rounds: [
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
    ],
    capRowLabel: '翻倍规则',
    capOptions: ['牛牛3倍', '牛牛4倍', '至尊10倍'],
  },
  zhajinhua: {
    title: '经典金花',
    modeRowLabel: '金花玩法',
    modes: [
      { id: 'classic', label: '经典金花' },
      { id: 'bloody', label: '血拼15轮' },
      { id: 'quick', label: '极速8轮' },
    ],
    rounds: [
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
    ],
    capRowLabel: '必闷规则',
    capOptions: ['不闷牌', '必闷1轮', '必闷3轮'],
  },
  laoyancai: {
    title: '云南捞腌菜',
    modeRowLabel: '地方玩法',
    modes: [
      { id: 'kunming', label: '昆明双腌' },
      { id: 'yuxi', label: '玉溪轮庄' },
      { id: 'crazy', label: '三公豹子' },
    ],
    rounds: [
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
    ],
    capRowLabel: '倍数规则',
    capOptions: ['双腌2倍', '三公5倍', '豹子8倍'],
  },
};

const BASE_SCORE_PRESETS = [100, 500, 2000, 10000];
const INITIAL_SCORE_PRESETS = [2000, 10000, 50000, 200000];
const PAY_MODES: Array<{ id: RoomCardPayMode; label: string }> = [
  { id: 'host', label: '房主支付' },
  { id: 'aa', label: 'AA平摊' },
  { id: 'winner', label: '大赢家支付' },
];

function resolveDefaultInitialScore(baseScore: number, explicitInitial?: number): number {
  if (explicitInitial && explicitInitial > 0) return explicitInitial;
  if (baseScore >= 10000) return 200000;
  if (baseScore >= 2000) return 50000;
  if (baseScore >= 500) return 10000;
  return Math.max(2000, baseScore * 20);
}

/**
 * RoomEntryManager (/src/shared/roomcard/RoomEntryManager.tsx)
 * Top-level commercial gatekeeper mounted in App.tsx.
 * Intercepts all QuickMatch, CreateRoom, and JoinRoom requests and forces secondary confirmation
 * of room card pre-freeze consumption, baseScore, and initialScore before entering any match.
 */
export const RoomEntryManager: React.FC<RoomEntryManagerProps> = ({
  pendingRequest,
  availableRoomCards,
  onCancel,
  onReplenishRoomCards,
  onConfirmEntry,
}) => {
  const activeGameType: EntryGameType = pendingRequest?.gameType ?? 'ddz';
  const schema = GAME_ENTRY_SCHEMAS[activeGameType] ?? GAME_ENTRY_SCHEMAS.ddz;

  const [selectedMode, setSelectedMode] = useState<string>(schema.modes[0].id);
  const [totalRounds, setTotalRounds] = useState<RoomRoundCount>(4);
  const [capIdx, setCapIdx] = useState<number>(1);
  const [payMode, setPayMode] = useState<RoomCardPayMode>('host');
  const [baseScoreInput, setBaseScoreInput] = useState<string>('100');
  const [initialScoreInput, setInitialScoreInput] = useState<string>('2000');

  useEffect(() => {
    if (!pendingRequest) return;
    const nextSchema = GAME_ENTRY_SCHEMAS[pendingRequest.gameType] ?? GAME_ENTRY_SCHEMAS.ddz;
    const modeExists = nextSchema.modes.some((m) => m.id === pendingRequest.mode);
    setSelectedMode(modeExists && pendingRequest.mode ? pendingRequest.mode : nextSchema.modes[0].id);

    const initRounds: RoomRoundCount =
      pendingRequest.totalRounds === 8 || pendingRequest.totalRounds === 16
        ? pendingRequest.totalRounds
        : 4;
    setTotalRounds(initRounds);
    setCapIdx(1);
    setPayMode(pendingRequest.payMode ?? 'host');

    const safeBase = Math.max(10, Number(pendingRequest.baseScore) || 100);
    const safeInit = resolveDefaultInitialScore(safeBase, pendingRequest.initialScore);
    setBaseScoreInput(String(safeBase));
    setInitialScoreInput(String(safeInit));
  }, [pendingRequest]);

  const rawBase = Number(baseScoreInput) || 0;
  const rawInitial = Number(initialScoreInput) || 0;
  const validation = useMemo(
    () => validateCustomStakes(rawBase, rawInitial),
    [rawBase, rawInitial]
  );

  const activeRoundSpec =
    schema.rounds.find((r) => r.count === totalRounds) ?? schema.rounds[0];

  const preFreezeCardCost = useMemo(() => {
    const baseCost = Math.max(activeRoundSpec.baseCards, validation.roomCardCost);
    if (payMode === 'aa') {
      return Math.max(1, Math.ceil(baseCost / 3));
    }
    return baseCost;
  }, [activeRoundSpec.baseCards, validation.roomCardCost, payMode]);

  const canAfford = availableRoomCards >= preFreezeCardCost;
  const remainingAfterFreeze = Math.max(0, availableRoomCards - preFreezeCardCost);

  if (!pendingRequest) return null;

  const handleSelectBaseScorePreset = (base: number) => {
    soundEngine.playTap(750);
    hapticEngine.tap();
    setBaseScoreInput(String(base));
    setInitialScoreInput(String(base * 20));
  };

  const handleSelectInitialScorePreset = (initScore: number) => {
    soundEngine.playTap(750);
    hapticEngine.tap();
    setInitialScoreInput(String(initScore));
  };

  const handleAutoBalanceRatio = () => {
    soundEngine.playTap(780);
    hapticEngine.tap();
    const safeBase = Math.max(
      CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE,
      Math.min(CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE, Math.round(rawBase || 100))
    );
    const safeInit = Math.max(
      CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE,
      Math.min(CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE, safeBase * 20)
    );
    setBaseScoreInput(String(safeBase));
    setInitialScoreInput(String(safeInit));
  };

  const handleConfirm = () => {
    if (!validation.valid || !canAfford) {
      soundEngine.playTap(520);
      return;
    }
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    onConfirmEntry({
      actionType: pendingRequest.actionType,
      gameType: pendingRequest.gameType,
      mode: selectedMode,
      baseScore: validation.normalizedBaseScore,
      initialScore: validation.normalizedInitialScore,
      roomCardCost: preFreezeCardCost,
      fillBots: pendingRequest.fillBots ?? true,
      isPrivate: pendingRequest.isPrivate ?? false,
      totalRounds,
      payMode,
      roomId: pendingRequest.roomId,
    });
  };

  const actionHeaderLabel =
    pendingRequest.actionType === 'create_room'
      ? '房主开设房间'
      : pendingRequest.actionType === 'join_room'
      ? `加入房间 (${pendingRequest.roomId || ''})`
      : '入场设置与房卡核定';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onCancel}
    >
      <div
        className="flex w-full max-w-[490px] flex-col overflow-hidden rounded-2xl border border-amber-200/35 bg-gradient-to-b from-[#2a180d] to-[#1a0f08] text-amber-50 shadow-[0_20px_50px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200/15 bg-black/25 px-5 py-3">
          <h3 className="font-display text-base font-black tracking-wide text-amber-100">
            {schema.title} · {actionHeaderLabel}
          </h3>

          <div className="flex items-center gap-2.5">
            <div className="flex h-7 items-center rounded-full border border-amber-200/30 bg-black/40 pr-1 pl-2.5">
              <img
                src="/assets/ui/zjm_icon_jinka.png"
                alt="房卡"
                className="h-3.5 w-3.5 object-contain"
              />
              <span className="px-1.5 font-mono text-xs font-black text-amber-200 tabular-nums">
                {availableRoomCards}
              </span>
              <button
                type="button"
                onClick={onReplenishRoomCards}
                title="补充房卡"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe58f] to-[#d97706] text-[#261105] hover:brightness-110 active:scale-90 cursor-pointer"
              >
                <Plus className="h-3 w-3 stroke-[3]" />
              </button>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-amber-100/70 hover:bg-white/15 hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body: Strictly Aligned Commercial Grid */}
        <div className="space-y-2.5 px-5 py-3.5">
          {/* Row 1: Play Mode */}
          <div className="grid grid-cols-[68px_1fr] items-center gap-3">
            <span className="text-xs font-bold text-amber-100/80">{schema.modeRowLabel}</span>
            <div
              className={`grid gap-1 rounded-xl bg-black/35 p-1 ${
                schema.modes.length === 4 ? 'grid-cols-4' : 'grid-cols-3'
              }`}
            >
              {schema.modes.map((m) => {
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
              {schema.rounds.map((r) => {
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
            <span className="text-xs font-bold text-amber-100/80">{schema.capRowLabel}</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1">
              {schema.capOptions.map((opt, idx) => {
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
            <span className="text-xs font-bold text-amber-100/80">扣卡方式</span>
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

          {/* Row 5: Symmetrical 2-Column Custom Base Score & Initial Score Configuration */}
          <div className="grid grid-cols-2 gap-3 pt-0.5">
            {/* Base Score Column */}
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
                      onClick={() => handleSelectBaseScorePreset(preset)}
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

            {/* Initial Score Column */}
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
                      onClick={() => handleSelectInitialScorePreset(preset)}
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

          {/* Row 6: Clean Pre-Freeze Escrow Summary Strip */}
          <div className="flex items-center justify-between rounded-xl border border-amber-200/15 bg-black/35 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-100/85">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              <span>
                预冻结房卡 <strong className="font-mono text-amber-300">{preFreezeCardCost}</strong> 张（首局发牌扣除，未开局退房退还）
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px] text-amber-100/70 tabular-nums">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>剩余 {remainingAfterFreeze} 张</span>
            </div>
          </div>
        </div>

        {/* Footer: Secondary Confirmation Gate */}
        <div className="flex items-center justify-between gap-3 border-t border-amber-200/15 bg-black/30 px-5 py-3">
          {!validation.valid ? (
            <div className="flex items-center gap-2 text-xs text-rose-300">
              <span>{validation.errorMessage}</span>
              <button
                type="button"
                onClick={handleAutoBalanceRatio}
                className="font-bold text-amber-300 underline hover:text-amber-200 cursor-pointer whitespace-nowrap"
              >
                自动配平
              </button>
            </div>
          ) : !canAfford ? (
            <div className="flex items-center gap-2 text-xs text-rose-300">
              <span>房卡不足（需预冻 {preFreezeCardCost} 张）</span>
              <button
                type="button"
                onClick={onReplenishRoomCards}
                className="font-bold text-amber-300 underline hover:text-amber-200 cursor-pointer whitespace-nowrap"
              >
                免费补充房卡
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-100/80">
              <span>
                底分 <strong className="font-mono text-white">{validation.normalizedBaseScore.toLocaleString()}</strong>
              </span>
              <span className="text-white/25">·</span>
              <span>
                初始积分 <strong className="font-mono text-emerald-300">{validation.normalizedInitialScore.toLocaleString()}</strong>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-amber-100/75 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!validation.valid || !canAfford}
              onClick={handleConfirm}
              className={`shrink-0 rounded-xl px-5 py-2 font-display text-sm font-black transition-all whitespace-nowrap ${
                validation.valid && canAfford
                  ? 'bg-gradient-to-b from-[#ffe28a] via-[#f59e0b] to-[#d97706] text-[#241104] shadow-md hover:brightness-105 active:scale-95 cursor-pointer'
                  : 'bg-white/10 text-white/35 cursor-not-allowed'
              }`}
            >
              确认预冻并入局
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
