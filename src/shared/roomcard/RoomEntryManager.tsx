import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '../audio/SoundEngine';
import { hapticEngine } from '../haptics/HapticEngine';
import {
  CUSTOM_STAKES_LIMITS,
  RoomCardPayMode,
  RoomRoundCount,
  calculateRoomCardCost,
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
      { count: 4, label: '4局 (1卡)', baseCards: 1 },
      { count: 8, label: '8局 (2卡)', baseCards: 2 },
      { count: 16, label: '16局 (4卡)', baseCards: 4 },
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
      { count: 4, label: '4局 (1卡)', baseCards: 1 },
      { count: 8, label: '8局 (2卡)', baseCards: 2 },
      { count: 16, label: '16局 (4卡)', baseCards: 4 },
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
      { count: 4, label: '4局 (1卡)', baseCards: 1 },
      { count: 8, label: '8局 (2卡)', baseCards: 2 },
      { count: 16, label: '16局 (4卡)', baseCards: 4 },
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
      { count: 4, label: '4局 (1卡)', baseCards: 1 },
      { count: 8, label: '8局 (2卡)', baseCards: 2 },
      { count: 16, label: '16局 (4卡)', baseCards: 4 },
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
      { count: 4, label: '4局 (1卡)', baseCards: 1 },
      { count: 8, label: '8局 (2卡)', baseCards: 2 },
      { count: 16, label: '16局 (4卡)', baseCards: 4 },
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
 * Unified dark-frosted commercial entry configuration panel.
 * - Quick Match (`quick_match`): lightweight stake-tier deduction (1/2/4/8 cards).
 * - Friend Room (`create_room` / `join_room`): fixed round-based pricing (4局=1卡, 8局=2卡, 16局=4卡; AA: 1/1/2卡) independent of stake tier or player count.
 */
export const RoomEntryManager: React.FC<RoomEntryManagerProps> = ({
  pendingRequest,
  availableRoomCards,
  onCancel,
  onReplenishRoomCards,
  onConfirmEntry,
}) => {
  const activeGameType: EntryGameType = pendingRequest?.gameType ?? 'ddz';
  const actionType: RoomEntryActionType = pendingRequest?.actionType ?? 'quick_match';
  const isQuickMatch = actionType === 'quick_match';
  const schema = GAME_ENTRY_SCHEMAS[activeGameType] ?? GAME_ENTRY_SCHEMAS.ddz;

  const [selectedMode, setSelectedMode] = useState<string>(schema.modes[0].id);
  const [totalRounds, setTotalRounds] = useState<RoomRoundCount>(8);
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
        : pendingRequest.totalRounds === 4
        ? 4
        : 8;
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

  const costEval = useMemo(
    () =>
      calculateRoomCardCost(
        totalRounds,
        payMode,
        3,
        validation.normalizedBaseScore,
        validation.normalizedInitialScore,
        actionType
      ),
    [totalRounds, payMode, validation.normalizedBaseScore, validation.normalizedInitialScore, actionType]
  );

  const entryRequiredCards = costEval.perPlayerCost;
  const canAfford = availableRoomCards >= entryRequiredCards;
  const remainingAfterEntry =
    !isQuickMatch && payMode === 'winner'
      ? availableRoomCards
      : Math.max(0, availableRoomCards - entryRequiredCards);

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
      roomCardCost: entryRequiredCards,
      fillBots: pendingRequest.fillBots ?? true,
      isPrivate: pendingRequest.isPrivate ?? false,
      totalRounds: isQuickMatch ? 4 : totalRounds,
      payMode: isQuickMatch ? 'host' : payMode,
      roomId: pendingRequest.roomId,
    });
  };

  const actionHeaderLabel =
    pendingRequest.actionType === 'create_room'
      ? '开设包间'
      : pendingRequest.actionType === 'join_room'
      ? `加入包间 ${pendingRequest.roomId || ''}`
      : '快速场准入';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex w-full max-w-[440px] max-h-[86dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
          <h3 className="text-[15px] font-bold tracking-wide text-[#F3F4F6] truncate">
            {schema.title} · {actionHeaderLabel}
          </h3>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 items-center rounded-lg border border-white/10 bg-black/35 px-2 text-xs">
              <span className="text-[#9CA3AF]">房卡</span>
              <span className="mx-1.5 font-mono font-bold text-[#E5B85B] tabular-nums">
                {availableRoomCards}
              </span>
              <button
                type="button"
                onClick={onReplenishRoomCards}
                className="rounded bg-[#D49B35] px-1.5 py-0.5 text-[11px] font-bold text-[#111315] hover:bg-[#E0A842] active:scale-95 cursor-pointer"
              >
                补充
              </button>
            </div>

            <button
              type="button"
              onClick={onCancel}
              aria-label="关闭面板"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-2.5 px-4 sm:px-5 py-3.5">
          {/* Row 1: Play Mode */}
          <div className="grid grid-cols-[60px_1fr] items-center gap-2.5">
            <span className="text-xs font-medium text-[#9CA3AF]">{schema.modeRowLabel}</span>
            <div
              className={`grid gap-1 rounded-lg bg-black/35 border border-white/[0.08] p-1 ${
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
                    className={`h-7.5 rounded-md text-xs font-semibold transition-all cursor-pointer truncate px-1 ${
                      active
                        ? 'bg-[#D49B35] text-[#111315] font-bold'
                        : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Friend Room Only: Round Count & Pay Mode */}
          {!isQuickMatch && (
            <>
              <div className="grid grid-cols-[60px_1fr] items-center gap-2.5">
                <span className="text-xs font-medium text-[#9CA3AF]">牌局局数</span>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/35 border border-white/[0.08] p-1">
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
                        className={`h-7.5 rounded-md text-xs font-semibold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-[#D49B35] text-[#111315] font-bold'
                            : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-[60px_1fr] items-center gap-2.5">
                <span className="text-xs font-medium text-[#9CA3AF]">扣卡方式</span>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/35 border border-white/[0.08] p-1">
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
                        className={`h-7.5 rounded-md text-xs font-semibold transition-all cursor-pointer truncate px-1 ${
                          active
                            ? 'bg-[#D49B35] text-[#111315] font-bold'
                            : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Row 3: Cap Rule */}
          <div className="grid grid-cols-[60px_1fr] items-center gap-2.5">
            <span className="text-xs font-medium text-[#9CA3AF]">{schema.capRowLabel}</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/35 border border-white/[0.08] p-1">
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
                    className={`h-7.5 rounded-md text-xs font-semibold transition-all cursor-pointer truncate px-1 ${
                      active
                        ? 'bg-[#D49B35] text-[#111315] font-bold'
                        : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 5: Symmetrical 2-Column Custom Base Score & Initial Score */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
            {/* Base Score Column */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#9CA3AF]">房间底分</span>
                <input
                  type="number"
                  min={CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE}
                  max={CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE}
                  step={10}
                  value={baseScoreInput}
                  onChange={(e) => setBaseScoreInput(e.target.value)}
                  className="h-7 w-22 rounded-lg border border-white/12 bg-black/40 px-2 text-right font-mono text-xs font-bold text-[#F3F4F6] tabular-nums focus:border-[#D49B35] focus:outline-none"
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
                      className={`h-6.5 rounded-md font-mono text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#D49B35] text-[#111315] font-bold'
                          : 'bg-black/35 border border-white/[0.08] text-[#9CA3AF] hover:text-[#F3F4F6]'
                      }`}
                    >
                      {preset >= 10000 ? '1万' : preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Initial Score Column */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#9CA3AF]">初始积分</span>
                <input
                  type="number"
                  min={CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE}
                  max={CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE}
                  step={100}
                  value={initialScoreInput}
                  onChange={(e) => setInitialScoreInput(e.target.value)}
                  className="h-7 w-22 rounded-lg border border-white/12 bg-black/40 px-2 text-right font-mono text-xs font-bold text-[#F3F4F6] tabular-nums focus:border-[#D49B35] focus:outline-none"
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
                      className={`h-6.5 rounded-md font-mono text-[11px] font-semibold tabular-nums transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#D49B35] text-[#111315] font-bold'
                          : 'bg-black/35 border border-white/[0.08] text-[#9CA3AF] hover:text-[#F3F4F6]'
                      }`}
                    >
                      {preset >= 10000 ? `${preset / 10000}万` : preset}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 6: Concise Deduction Rule & Balance Summary */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-[#9CA3AF]">
            <span className="truncate">{costEval.description}</span>
            <span className="ml-2 shrink-0 font-mono text-[11px] text-[#9CA3AF] tabular-nums">
              结余 <strong className="text-[#E5B85B]">{remainingAfterEntry}</strong> 张
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-2.5">
          {!validation.valid ? (
            <div className="flex items-center gap-2 text-xs text-rose-400">
              <span>{validation.errorMessage}</span>
              <button
                type="button"
                onClick={handleAutoBalanceRatio}
                className="font-bold text-[#E5B85B] underline hover:text-[#D49B35] cursor-pointer whitespace-nowrap"
              >
                自动配平
              </button>
            </div>
          ) : !canAfford ? (
            <div className="flex items-center gap-2 text-xs text-rose-400">
              <span>房卡不足（需 {entryRequiredCards} 张）</span>
              <button
                type="button"
                onClick={onReplenishRoomCards}
                className="font-bold text-[#E5B85B] underline hover:text-[#D49B35] cursor-pointer whitespace-nowrap"
              >
                免费补充
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF] tabular-nums">
              <span>
                底分 <strong className="font-mono text-[#F3F4F6]">{validation.normalizedBaseScore.toLocaleString()}</strong>
              </span>
              <span className="text-white/20">·</span>
              <span>
                初始分 <strong className="font-mono text-[#E5B85B]">{validation.normalizedInitialScore.toLocaleString()}</strong>
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="h-8.5 min-w-[76px] rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!validation.valid || !canAfford}
              onClick={handleConfirm}
              className={`h-8.5 min-w-[92px] shrink-0 rounded-lg px-4 text-xs font-bold transition-all whitespace-nowrap ${
                validation.valid && canAfford
                  ? 'bg-[#D49B35] text-[#111315] hover:bg-[#E0A842] active:scale-98 cursor-pointer'
                  : 'bg-white/[0.06] text-white/30 cursor-not-allowed'
              }`}
            >
              确认入局
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
