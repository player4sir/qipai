import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  FastForward,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { CardData, MatchReplayRecord, Rank, Suit } from '../types';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface ReplayViewerModalProps {
  replay: MatchReplayRecord;
  viewerPlayerId?: string;
  myPlayerId?: string;
  onClose: () => void;
}

const SUIT_ASSET_NAME: Record<Exclude<Suit, null>, string> = {
  spade: 'Spade',
  heart: 'Heart',
  club: 'Club',
  diamond: 'Diamond',
};

const getCardAssetPath = (card: CardData): string => {
  if (card.rank === 'big_joker') return '/assets/ddz/cards/Card_Joker_Red_BigKing.png';
  if (card.rank === 'small_joker') return '/assets/ddz/cards/Card_Joker_Black_SmallKing.png';
  const suitPrefix = card.suit ? SUIT_ASSET_NAME[card.suit] : 'Spade';
  return `/assets/ddz/cards/Card_${suitPrefix}_${card.rank}.png`;
};

const DEAL_MODE_LABELS: Record<string, string> = {
  classic: '经典模式',
  no_shuffle: '不洗牌模式',
  laizi: '经典赖子场',
  tiandi_laizi: '天地双赖子',
  swap_three: '换三张玩法',
};

const MiniPokerCard: React.FC<{
  card: CardData;
  wildRanks: Rank[];
  size?: 'sm' | 'md';
  highlight?: boolean;
}> = ({ card, wildRanks, size = 'sm', highlight = false }) => {
  const isWild = Boolean(card.isWild || wildRanks.includes(card.rank));
  const imgSrc = getCardAssetPath(card);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-md select-none shadow-xs transition-transform ${
        size === 'md' ? 'h-12 w-9' : 'h-9 w-7'
      } ${
        isWild
          ? 'ring-2 ring-[#F59E0B] shadow-amber-400/30'
          : highlight
            ? 'ring-1 ring-[#D97706] -translate-y-1'
            : 'border border-slate-200'
      }`}
    >
      <img
        src={imgSrc}
        alt={card.rank}
        className="h-full w-full object-contain pointer-events-none"
        draggable={false}
      />
      {isWild && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-[#F59E0B] px-0.5 text-[8px] leading-tight font-extrabold text-white shadow">
          赖
        </span>
      )}
    </div>
  );
};

export const ReplayViewerModal: React.FC<ReplayViewerModalProps> = ({
  replay,
  viewerPlayerId,
  myPlayerId,
  onClose,
}) => {
  const effectiveViewerId = viewerPlayerId ?? myPlayerId;
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<1 | 2>(1);

  const totalSteps = replay.steps.length;

  useEffect(() => {
    if (!isPlaying) return;
    if (stepIndex >= totalSteps) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => {
        setStepIndex((prev) => Math.min(totalSteps, prev + 1));
      },
      speed === 2 ? 550 : 1100
    );
    return () => clearTimeout(timer);
  }, [isPlaying, stepIndex, totalSteps, speed]);

  // Reconstruct the exact 3-seat open-card board state at `stepIndex`
  const snapshotAtStep = useMemo(() => {
    const hands: Record<number, CardData[]> = {
      0: [...(replay.initialHands[0] ?? [])],
      1: [...(replay.initialHands[1] ?? [])],
      2: [...(replay.initialHands[2] ?? [])],
    };

    const seatActionMap: Record<
      number,
      { label: string; cards?: CardData[]; isHighlight?: boolean }
    > = {};
    let currentMultiplier = 1;
    let activeWildRanks: Rank[] =
      replay.wildRanks.length > 0 ? [replay.wildRanks[0]] : [];
    let landlordRevealed = false;
    let activeStepSeat: number | null = null;
    let activeStepDesc = '开局发牌完毕（三家底牌透视已开启）';

    const sortHandDesc = (arr: CardData[]) =>
      [...arr].sort((a, b) => b.value - a.value || b.id.localeCompare(a.id));

    for (let i = 0; i < stepIndex && i < replay.steps.length; i++) {
      const st = replay.steps[i];
      currentMultiplier = st.multiplierAfter;
      activeWildRanks = st.wildRanksAfter ?? replay.wildRanks;
      activeStepSeat = st.seat;
      const seatInfo = replay.seats.find((s) => s.seatIndex === st.seat);
      const seatName = seatInfo?.nickname ?? `座位${st.seat + 1}`;

      if (st.actionType === 'landlord_reveal') {
        landlordRevealed = true;
        hands[st.seat] = sortHandDesc([
          ...(hands[st.seat] ?? []),
          ...(replay.landlordCards ?? []),
        ]);
        seatActionMap[st.seat] = {
          label: '获得 3 张底牌',
          cards: replay.landlordCards,
          isHighlight: i === stepIndex - 1,
        };
        activeStepDesc = `${seatName} 成为地主，收入 3 张底牌`;
      } else if (st.actionType === 'play' && st.cards && st.cards.length > 0) {
        const playedIds = new Set(st.cards.map((c) => c.id));
        hands[st.seat] = sortHandDesc(
          (hands[st.seat] ?? []).filter((c) => !playedIds.has(c.id))
        );
        seatActionMap[st.seat] = {
          label: st.patternLabel ?? '出牌',
          cards: st.cards,
          isHighlight: i === stepIndex - 1,
        };
        activeStepDesc = `${seatName} 打出【${st.patternLabel ?? '牌组'}】（${st.cards.length}张）`;
      } else {
        const label = st.patternLabel ?? '不出';
        seatActionMap[st.seat] = {
          label,
          cards: [],
          isHighlight: i === stepIndex - 1,
        };
        activeStepDesc = `${seatName} 选择「${label}」`;
      }
    }

    return {
      hands,
      seatActionMap,
      currentMultiplier,
      activeWildRanks,
      landlordRevealed,
      activeStepSeat,
      activeStepDesc,
    };
  }, [replay, stepIndex]);

  const mySeatIdx = useMemo(() => {
    if (effectiveViewerId) {
      const found = replay.seats.find((s) => s.playerId === effectiveViewerId);
      if (found) return found.seatIndex;
    }
    return 0;
  }, [replay.seats, effectiveViewerId]);

  const bottomSeat = mySeatIdx;
  const rightSeat = (mySeatIdx + 1) % 3;
  const leftSeat = (mySeatIdx + 2) % 3;

  const renderSeatPanel = (seatIdx: number, position: 'left' | 'right' | 'bottom') => {
    const info = replay.seats.find((s) => s.seatIndex === seatIdx);
    const cards = snapshotAtStep.hands[seatIdx] ?? [];
    const action = snapshotAtStep.seatActionMap[seatIdx];
    const isActiveStep = snapshotAtStep.activeStepSeat === seatIdx;
    const isLandlord = seatIdx === replay.landlordSeat;
    const delta = info?.scoreDelta ?? 0;

    return (
      <div
        className={`flex flex-col rounded-2xl border p-3 transition-all ${
          isActiveStep
            ? 'border-[#F59E0B] bg-[#FFFBEB] shadow-sm'
            : 'border-[#E8E1D0] bg-white shadow-2xs'
        } ${position === 'bottom' ? 'col-span-2' : ''}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#EFE8D8] pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <AvatarSvg
              avatarId={info?.avatarId ?? 'noble'}
              size={32}
              isLandlord={isLandlord}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="truncate font-display font-black text-[#1E242B]">
                  {info?.nickname ?? `玩家 ${seatIdx + 1}`}
                </span>
                <span className="font-bold text-[#B45309] whitespace-nowrap shrink-0">
                  · {isLandlord ? '地主' : '农民'}
                </span>
              </div>
              <div className="font-mono text-[11px] font-medium text-[#5A6572] tabular-nums">
                余牌 {cards.length} 张 · 结算{' '}
                <span
                  className={`font-black ${
                    delta >= 0 ? 'text-[#D97706]' : 'text-rose-600'
                  }`}
                >
                  {delta >= 0 ? `+${delta}` : delta} 积分
                </span>
              </div>
            </div>
          </div>

          {action && (
            <div className="flex items-center gap-2">
              <span
                className={`rounded-lg border px-2 py-0.5 text-[11px] font-black whitespace-nowrap shrink-0 ${
                  action.isHighlight
                    ? 'border-[#F59E0B] bg-[#F59E0B] text-white'
                    : 'border-[#E2D8C5] bg-[#FAF8F3] text-[#5C4934]'
                }`}
              >
                {action.label}
              </span>
              {action.cards && action.cards.length > 0 && (
                <div className="flex items-center -space-x-2">
                  {action.cards.map((c) => (
                    <MiniPokerCard
                      key={c.id}
                      card={c}
                      wildRanks={snapshotAtStep.activeWildRanks}
                      size="sm"
                      highlight={action.isHighlight}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          {cards.length === 0 ? (
            <span className="text-xs font-black text-[#0D9488]">
              已出完所有手牌（获胜）
            </span>
          ) : (
            cards.map((c) => (
              <MiniPokerCard
                key={c.id}
                card={c}
                wildRanks={snapshotAtStep.activeWildRanks}
                size={position === 'bottom' ? 'md' : 'sm'}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  const modeLabel = DEAL_MODE_LABELS[replay.dealMode] ?? '经典模式';
  const wildDesc =
    replay.wildRanks.length > 0
      ? ` · 赖子 ${replay.wildRanks.map((r, i) => `${i === 0 ? '天赖' : '地赖'}[${r}]`).join(' ')}`
      : '';

  return (
    <CommercialModalShell
      title={`全视角三家明牌复盘 · 房号 ${replay.roomId}`}
      subtitle={`${modeLabel} · 底分 ${replay.baseScore} · 倍数 ×${snapshotAtStep.currentMultiplier}${wildDesc}`}
      icon={<Crown className="h-5 w-5" />}
      size="xl"
      portalMode="stage"
      closeOnBackdrop={false}
      onClose={onClose}
      headerExtra={
        <div className="flex items-center gap-1.5 rounded-xl border border-[#DEC99A] bg-white px-2.5 py-1 shadow-2xs">
          <span className="text-[11px] font-extrabold text-[#6E5A44] whitespace-nowrap">
            三张底牌:
          </span>
          <div className="flex items-center gap-1">
            {replay.landlordCards.map((c) => (
              <MiniPokerCard
                key={c.id}
                card={c}
                wildRanks={snapshotAtStep.activeWildRanks}
                size="sm"
              />
            ))}
          </div>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-extrabold text-[#2C1E10]">
                {snapshotAtStep.activeStepDesc}
              </span>
              <span className="ml-2 font-mono text-xs font-black text-[#B45309] tabular-nums whitespace-nowrap">
                步数 {stepIndex} / {totalSteps}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={totalSteps}
              value={stepIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setStepIndex(Number(e.target.value));
              }}
              className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-[#DFD5C0] accent-[#D97706]"
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex(0);
              }}
              className="flex items-center gap-1 rounded-xl border border-[#D8CEB8] bg-white px-2.5 py-1.5 text-xs font-extrabold text-[#334155] hover:bg-[#FAF8F3] whitespace-nowrap shrink-0 cursor-pointer"
              title="回到开局"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>开局</span>
            </button>

            <button
              type="button"
              disabled={stepIndex <= 0}
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex((s) => Math.max(0, s - 1));
              }}
              className="flex items-center gap-1 rounded-xl border border-[#D8CEB8] bg-white px-2.5 py-1.5 text-xs font-extrabold text-[#334155] hover:bg-[#FAF8F3] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>上一手</span>
            </button>

            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                if (stepIndex >= totalSteps) {
                  setStepIndex(0);
                  setIsPlaying(true);
                } else {
                  setIsPlaying((p) => !p);
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:brightness-105 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              <span>{isPlaying ? '暂停' : stepIndex >= totalSteps ? '重播' : '自动播放'}</span>
            </button>

            <button
              type="button"
              disabled={stepIndex >= totalSteps}
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex((s) => Math.min(totalSteps, s + 1));
              }}
              className="flex items-center gap-1 rounded-xl border border-[#D8CEB8] bg-white px-2.5 py-1.5 text-xs font-extrabold text-[#334155] hover:bg-[#FAF8F3] disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>下一手</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                setSpeed((s) => (s === 1 ? 2 : 1));
              }}
              className="flex items-center gap-1 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-2.5 py-1.5 font-mono text-xs font-black text-[#B45309] hover:bg-[#FEF3C7] whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
              title="切换复盘播放倍速"
            >
              <FastForward className="h-3.5 w-3.5" />
              <span>{speed}x</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {renderSeatPanel(leftSeat, 'left')}
        {renderSeatPanel(rightSeat, 'right')}
        {renderSeatPanel(bottomSeat, 'bottom')}
      </div>
    </CommercialModalShell>
  );
};
