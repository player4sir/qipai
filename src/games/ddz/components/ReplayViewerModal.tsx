import React, { useEffect, useMemo, useState } from 'react';
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
      className={`relative flex items-center justify-center overflow-hidden rounded-md select-none shadow-2xs transition-transform ${
        size === 'md' ? 'h-12 w-9' : 'h-9 w-7'
      } ${
        isWild
          ? 'ring-2 ring-[#F59E0B]'
          : highlight
          ? 'ring-1 ring-[#D97706] -translate-y-1'
          : 'border border-[#E5DAC3]'
      }`}
    >
      <img
        src={imgSrc}
        alt={card.rank}
        className="h-full w-full object-contain pointer-events-none"
        draggable={false}
      />
      {isWild && (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-[#F59E0B] px-0.5 text-[8px] leading-tight font-extrabold text-white shadow-2xs">
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
    let activeStepDesc = '开局发牌完毕';

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
        activeStepDesc = `${seatName} 打出 ${st.patternLabel ?? '牌组'}（${st.cards.length}张）`;
      } else {
        const label = st.patternLabel ?? '不出';
        seatActionMap[st.seat] = {
          label,
          cards: [],
          isHighlight: i === stepIndex - 1,
        };
        activeStepDesc = `${seatName} 选择 ${label}`;
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
        className={`flex flex-col rounded-xl border p-3.5 transition-all ${
          isActiveStep
            ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08]'
            : 'border-white/[0.07] bg-white/[0.03]'
        } ${position === 'bottom' ? 'col-span-2' : ''}`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/12 bg-black/40">
              <AvatarSvg
                avatarId={info?.avatarId ?? 'noble'}
                size={32}
                isLandlord={isLandlord}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                <span className="truncate font-bold text-[#F3F4F6]">
                  {info?.nickname ?? `玩家 ${seatIdx + 1}`}
                </span>
                <span className="text-xs font-medium text-[#E5B85B] whitespace-nowrap shrink-0">
                  · {isLandlord ? '地主' : '农民'}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-[#9CA3AF] tabular-nums">
                余牌 {cards.length} 张 · 结算{' '}
                <span
                  className={`font-bold ${
                    delta > 0 ? 'text-[#E5B85B]' : delta < 0 ? 'text-[#94A3B8]' : 'text-[#9CA3AF]'
                  }`}
                >
                  {delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {action && (
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-bold whitespace-nowrap shrink-0 ${
                  action.isHighlight
                    ? 'border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#E5B85B]'
                    : 'border-white/10 bg-white/[0.04] text-[#9CA3AF]'
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

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {cards.length === 0 ? (
            <span className="text-xs font-bold text-[#E5B85B]">
              已出完所有手牌（本局获胜）
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
      title={`明牌复盘 · 房号 ${replay.roomId}`}
      subtitle={`${modeLabel} · 底分 ${replay.baseScore} · 倍数 ×${snapshotAtStep.currentMultiplier}${wildDesc}`}
      size="xl"
      portalMode="stage"
      closeOnBackdrop={false}
      onClose={onClose}
      headerExtra={
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1">
          <span className="text-xs font-medium text-[#9CA3AF] whitespace-nowrap">底牌</span>
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate font-medium text-[#F3F4F6]">
                {snapshotAtStep.activeStepDesc}
              </span>
              <span className="ml-3 text-xs font-bold text-[#E5B85B] tabular-nums whitespace-nowrap">
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
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-[#D49B35]"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex(0);
              }}
              className="flex h-8.5 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] whitespace-nowrap shrink-0 cursor-pointer"
            >
              开局
            </button>

            <button
              type="button"
              disabled={stepIndex <= 0}
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex((s) => Math.max(0, s - 1));
              }}
              className="flex h-8.5 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              上一手
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
              className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? '暂停' : stepIndex >= totalSteps ? '重播' : '自动播放'}
            </button>

            <button
              type="button"
              disabled={stepIndex >= totalSteps}
              onClick={() => {
                hapticEngine.tap();
                setIsPlaying(false);
                setStepIndex((s) => Math.min(totalSteps, s + 1));
              }}
              className="flex h-8.5 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              下一手
            </button>

            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                setSpeed((s) => (s === 1 ? 2 : 1));
              }}
              className="flex h-8.5 items-center justify-center rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/[0.08] px-3 text-xs font-bold text-[#E5B85B] hover:bg-[#D4AF37]/15 whitespace-nowrap shrink-0 tabular-nums cursor-pointer"
            >
              {speed}x倍速
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {renderSeatPanel(leftSeat, 'left')}
        {renderSeatPanel(rightSeat, 'right')}
        {renderSeatPanel(bottomSeat, 'bottom')}
      </div>
    </CommercialModalShell>
  );
};
