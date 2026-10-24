import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
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
      { count: 4, label: '4局 (1房卡)', baseCards: 1 },
      { count: 8, label: '8局 (2房卡)', baseCards: 2 },
      { count: 16, label: '16局 (4房卡)', baseCards: 4 },
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
      { count: 6, label: '6局 (1房卡)', baseCards: 1 },
      { count: 12, label: '12局 (2房卡)', baseCards: 2 },
      { count: 24, label: '24局 (4房卡)', baseCards: 4 },
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
      { count: 10, label: '10局 (1房卡)', baseCards: 1 },
      { count: 20, label: '20局 (2房卡)', baseCards: 2 },
      { count: 30, label: '30局 (4房卡)', baseCards: 4 },
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
      { count: 8, label: '8局 (1房卡)', baseCards: 1 },
      { count: 16, label: '16局 (2房卡)', baseCards: 2 },
      { count: 24, label: '24局 (4房卡)', baseCards: 4 },
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
      { count: 8, label: '8局 (1房卡)', baseCards: 1 },
      { count: 16, label: '16局 (2房卡)', baseCards: 2 },
      { count: 24, label: '24局 (4房卡)', baseCards: 4 },
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-xs animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-amber-200/35 bg-gradient-to-b from-[#2a180d] to-[#1a0f08] text-amber-50 shadow-[0_20px_48px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-200/15 bg-black/25 px-5 py-3">
          <h3 className="font-display text-base font-black tracking-wide text-amber-100">
            {schema.title}
          </h3>

          <div className="flex items-center gap-2.5">
            <div className="flex h-7 items-center rounded-full border border-amber-200/30 bg-black/40 pr-1 pl-2.5">
              <img
                src="/assets/ui/zjm_icon_jinka.png"
                alt="房卡"
                className="h-3.5 w-3.5 object-contain"
              />
              <span className="px-1.5 font-mono text-xs font-black text-amber-200 tabular-nums">
                {myRoomCards}
              </span>
              <button
                type="button"
                onClick={onClaimRoomCards}
                title="补充房卡"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-[#ffe58f] to-[#d97706] text-[#261105] hover:brightness-110 active:scale-90 cursor-pointer"
              >
                <Plus className="h-3 w-3 stroke-[3]" />
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
        </div>

        {/* Body: Strictly Aligned Commercial Grid */}
        <div className="space-y-3 px-5 py-4">
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

          {/* Row 3: Cap / Multiplier Rule */}
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

          {/* Row 4: Symmetrical 2-Column Stakes Configuration (Base Score & Initial Score) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Left Column: Base Score */}
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

            {/* Right Column: Initial Score */}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-amber-200/15 bg-black/30 px-5 py-3">
          {!validation.valid ? (
            <div className="flex items-center gap-2 text-xs text-rose-300">
              <span>{validation.errorMessage}</span>
              <button
                type="button"
                onClick={handleAutoFixRatio}
                className="font-bold text-amber-300 underline hover:text-amber-200 cursor-pointer whitespace-nowrap"
              >
                自动配平
              </button>
            </div>
          ) : !canAfford ? (
            <div className="flex items-center gap-2 text-xs text-rose-300">
              <span>房卡不足（需 {roomCardCost} 张）</span>
              <button
                type="button"
                onClick={onClaimRoomCards}
                className="font-bold text-amber-300 underline hover:text-amber-200 cursor-pointer whitespace-nowrap"
              >
                补充房卡
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-100/80">
              <span>
                消耗房卡 <strong className="font-mono text-amber-300">{roomCardCost}</strong> 张
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
            disabled={!validation.valid || !canAfford}
            onClick={handleConfirm}
            className={`shrink-0 rounded-xl px-6 py-2 font-display text-sm font-black transition-all whitespace-nowrap ${
              validation.valid && canAfford
                ? 'bg-gradient-to-b from-[#ffe28a] via-[#f59e0b] to-[#d97706] text-[#241104] shadow-md hover:brightness-105 active:scale-95 cursor-pointer'
                : 'bg-white/10 text-white/35 cursor-not-allowed'
            }`}
          >
            进入游戏
          </button>
        </div>
      </div>
    </div>
  );
};
