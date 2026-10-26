import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import {
  CUSTOM_STAKES_LIMITS,
  RoomCardPayMode,
  validateCustomStakes,
} from '../../../shared/roomcard/RoomCardSystem';
import { SupportedGameType } from './FriendRoomModal';

export interface CommercialEntryDraft {
  gameType: SupportedGameType;
  mode: string;
  baseScore: number;
  initialScore: number;
  tierTitle?: string;
  targetRoomId?: string;
}

export interface CommercialEntryConfirmModalProps {
  draft: CommercialEntryDraft;
  myRoomCards: number;
  onClose: () => void;
  onClaimRoomCards: () => void;
  onConfirmEnter: (confirmed: {
    gameType: SupportedGameType;
    mode: string;
    baseScore: number;
    initialScore: number;
    roomCardCost: number;
    totalRounds?: number;
    payMode?: RoomCardPayMode;
    targetRoomId?: string;
  }) => void;
}

interface GameHostPanelSchema {
  title: string;
  modeRowLabel: string;
  modes: Array<{ id: string; label: string }>;
  rounds: Array<{ count: number; label: string; baseCards: number }>;
  capRowLabel: string;
  capOptions: string[];
}

const GAME_HOST_SCHEMAS: Record<SupportedGameType, GameHostPanelSchema> = {
  mahjong: {
    title: '普洱麻将 · 房间设置',
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
    title: '斗地主 · 房间设置',
    modeRowLabel: '叫牌玩法',
    modes: [
      { id: 'classic', label: '经典叫抢' },
      { id: 'tiandi_laizi', label: '天地癞子' },
      { id: 'no_shuffle', label: '畅爽不洗牌' },
    ],
    rounds: [
      { count: 6, label: '6局 (1卡)', baseCards: 1 },
      { count: 12, label: '12局 (2卡)', baseCards: 2 },
      { count: 24, label: '24局 (4卡)', baseCards: 4 },
    ],
    capRowLabel: '炸弹封顶',
    capOptions: ['3炸封顶', '4炸封顶', '不设封顶'],
  },
  niuniu: {
    title: '抢庄斗牛 · 房间设置',
    modeRowLabel: '坐庄模式',
    modes: [
      { id: 'qiangzhuang', label: '看牌抢庄' },
      { id: 'crazy', label: '疯狂翻倍' },
      { id: 'tongbi', label: '通比牛牛' },
    ],
    rounds: [
      { count: 10, label: '10局 (1卡)', baseCards: 1 },
      { count: 20, label: '20局 (2卡)', baseCards: 2 },
      { count: 30, label: '30局 (4卡)', baseCards: 4 },
    ],
    capRowLabel: '翻倍规则',
    capOptions: ['牛牛3倍', '牛牛4倍', '至尊10倍'],
  },
  zhajinhua: {
    title: '经典金花 · 房间设置',
    modeRowLabel: '金花玩法',
    modes: [
      { id: 'classic', label: '经典金花' },
      { id: 'bloody', label: '血拼15轮' },
      { id: 'quick', label: '极速8轮' },
    ],
    rounds: [
      { count: 8, label: '8局 (1卡)', baseCards: 1 },
      { count: 16, label: '16局 (2卡)', baseCards: 2 },
      { count: 24, label: '24局 (4卡)', baseCards: 4 },
    ],
    capRowLabel: '必闷规则',
    capOptions: ['不闷牌', '必闷1轮', '必闷3轮'],
  },
  laoyancai: {
    title: '云南捞腌菜 · 房间设置',
    modeRowLabel: '地方玩法',
    modes: [
      { id: 'kunming', label: '昆明双腌' },
      { id: 'yuxi', label: '玉溪轮庄' },
      { id: 'crazy', label: '三公豹子' },
    ],
    rounds: [
      { count: 8, label: '8局 (1卡)', baseCards: 1 },
      { count: 16, label: '16局 (2卡)', baseCards: 2 },
      { count: 24, label: '24局 (4卡)', baseCards: 4 },
    ],
    capRowLabel: '倍数规则',
    capOptions: ['双腌2倍', '三公5倍', '豹子8倍'],
  },
};

const BASE_SCORE_PRESETS = [100, 500, 2000, 10000];
const INITIAL_SCORE_PRESETS = [2000, 10000, 50000, 200000];

export const CommercialEntryConfirmModal: React.FC<CommercialEntryConfirmModalProps> = ({
  draft,
  myRoomCards,
  onClose,
  onClaimRoomCards,
  onConfirmEnter,
}) => {
  const schema = GAME_HOST_SCHEMAS[draft.gameType] ?? GAME_HOST_SCHEMAS.ddz;

  const [selectedMode, setSelectedMode] = useState<string>(() => {
    const valid = schema.modes.some((m) => m.id === draft.mode);
    return valid ? draft.mode : schema.modes[0].id;
  });
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [capIdx, setCapIdx] = useState<number>(1);

  const [baseScoreInput, setBaseScoreInput] = useState<string>(String(draft.baseScore || 100));
  const [initialScoreInput, setInitialScoreInput] = useState<string>(
    String(draft.initialScore || Math.max(2000, (draft.baseScore || 100) * 20))
  );

  useEffect(() => {
    const nextSchema = GAME_HOST_SCHEMAS[draft.gameType] ?? GAME_HOST_SCHEMAS.ddz;
    const valid = nextSchema.modes.some((m) => m.id === draft.mode);
    setSelectedMode(valid ? draft.mode : nextSchema.modes[0].id);
    setCapIdx(1);
    setBaseScoreInput(String(draft.baseScore || 100));
    setInitialScoreInput(
      String(draft.initialScore || Math.max(2000, (draft.baseScore || 100) * 20))
    );
  }, [draft]);

  const rawBase = Number(baseScoreInput) || 0;
  const rawInitial = Number(initialScoreInput) || 0;
  const validation = validateCustomStakes(rawBase, rawInitial);
  const activeRoundSpec = schema.rounds[roundIdx] ?? schema.rounds[0];

  const roomCardCost = useMemo(() => {
    return Math.max(activeRoundSpec.baseCards, validation.roomCardCost);
  }, [validation.roomCardCost, activeRoundSpec.baseCards]);

  const canAfford = myRoomCards >= roomCardCost;

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

  const handleAutoFixRatio = () => {
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
    onConfirmEnter({
      gameType: draft.gameType,
      mode: selectedMode,
      baseScore: validation.normalizedBaseScore,
      initialScore: validation.normalizedInitialScore,
      roomCardCost,
      totalRounds: activeRoundSpec.count,
      payMode: 'host',
      targetRoomId: draft.targetRoomId,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex w-full max-w-[450px] max-h-[84dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
          <h3 className="text-sm sm:text-base font-bold tracking-wide text-[#F3F4F6] truncate">
            {schema.title}
          </h3>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 items-center rounded-lg border border-white/10 bg-black/35 px-2 text-xs">
              <span className="text-[#9CA3AF]">房卡</span>
              <span className="mx-1.5 font-mono font-bold text-[#FBBF24] tabular-nums">
                {myRoomCards}
              </span>
              <button
                type="button"
                onClick={onClaimRoomCards}
                className="rounded bg-[#D49B35] hover:bg-[#E0A842] px-1.5 py-0.5 text-[11px] font-bold text-[#111315] active:scale-95 cursor-pointer"
              >
                补充
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
                    className={`h-7 rounded-md text-xs font-semibold transition-colors cursor-pointer truncate px-1 ${
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

          {/* Row 2: Round Count */}
          <div className="grid grid-cols-[60px_1fr] items-center gap-2.5">
            <span className="text-xs font-medium text-[#9CA3AF]">牌局局数</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/35 border border-white/[0.08] p-1">
              {schema.rounds.map((r, idx) => {
                const active = roundIdx === idx;
                return (
                  <button
                    key={r.count}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(740);
                      setRoundIdx(idx);
                    }}
                    className={`h-7 rounded-md text-xs font-semibold transition-colors cursor-pointer truncate px-1 ${
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

          {/* Row 3: Cap / Multiplier Rule */}
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
                    className={`h-7 rounded-md text-xs font-semibold transition-colors cursor-pointer truncate px-1 ${
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

          {/* Row 4: Stakes Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
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
                          : 'border border-white/[0.08] bg-white/[0.04] text-[#9CA3AF] hover:text-[#F3F4F6]'
                      }`}
                    >
                      {preset >= 10000 ? '1万' : preset}
                    </button>
                  );
                })}
              </div>
            </div>

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
                          : 'border border-white/[0.08] bg-white/[0.04] text-[#9CA3AF] hover:text-[#F3F4F6]'
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
          {!validation.valid ? (
            <div className="flex items-center gap-2 text-xs text-[#F87171]">
              <span>{validation.errorMessage}</span>
              <button
                type="button"
                onClick={handleAutoFixRatio}
                className="font-semibold text-[#FBBF24] underline hover:text-[#FDE68A] cursor-pointer whitespace-nowrap"
              >
                自动配平
              </button>
            </div>
          ) : !canAfford ? (
            <div className="flex items-center gap-2 text-xs text-[#F87171]">
              <span>房卡不足（需 {roomCardCost} 张）</span>
              <button
                type="button"
                onClick={onClaimRoomCards}
                className="font-semibold text-[#FBBF24] underline hover:text-[#FDE68A] cursor-pointer whitespace-nowrap"
              >
                补充房卡
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-[#9CA3AF] tabular-nums">
              <span>
                消耗房卡 <strong className="font-mono text-[#FBBF24]">{roomCardCost}</strong> 张
              </span>
              <span className="text-white/20">·</span>
              <span>
                底分 <strong className="font-mono text-[#F3F4F6]">{validation.normalizedBaseScore.toLocaleString()}</strong>
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!validation.valid || !canAfford}
            onClick={handleConfirm}
            className={`h-8.5 min-w-[96px] shrink-0 rounded-lg px-5 text-xs font-bold transition-colors whitespace-nowrap ${
              validation.valid && canAfford
                ? 'bg-[#D49B35] hover:bg-[#E0A842] text-[#111315] active:scale-98 cursor-pointer'
                : 'bg-white/[0.06] text-[#6B7280] cursor-not-allowed'
            }`}
          >
            进入游戏
          </button>
        </div>
      </div>
    </div>
  );
};
