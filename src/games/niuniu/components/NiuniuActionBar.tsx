import React, { useMemo } from 'react';
import {
  FourCardOddsAnalysis,
  NiuniuDynamicPotOddsSnapshot,
  NiuniuHandResult,
  NiuniuPhase,
  NiuniuPlayerInfo,
  NiuniuPlayMode,
} from '../types';
import {
  RANK_NAMES,
  verifyManualThreeCards,
} from '../algorithms/NiuniuLogic';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface NiuniuActionBarProps {
  phase: NiuniuPhase;
  playMode?: NiuniuPlayMode;
  countdown: number;
  selfPlayer: NiuniuPlayerInfo | null;
  selectedCardIds?: number[];
  fourCardOdds?: FourCardOddsAnalysis;
  dynamicPotOdds?: NiuniuDynamicPotOddsSnapshot;
  onCallBanker: (multiplier: number) => void;
  onBet: (multiplier: number) => void;
  onAutoPartition: () => void;
  onShowHand: () => void;
  onReady: () => void;
  hasNiuPrompt?: boolean;
  handResult?: NiuniuHandResult;
}

export const NiuniuActionBar: React.FC<NiuniuActionBarProps> = ({
  phase,
  selfPlayer,
  selectedCardIds = [],
  onCallBanker,
  onBet,
  onAutoPartition,
  onShowHand,
  onReady,
  handResult,
}) => {
  if (!selfPlayer) return null;

  const isDealer = selfPlayer.isDealer;
  const hasCalled = selfPlayer.callMultiplier !== -1;
  const hasBet = selfPlayer.betMultiplier > 0;
  const hasShown = selfPlayer.hasShownHand;
  const isReady = selfPlayer.ready;

  // Real-time 3-card manual arithmetic calculator for SHOWDOWN
  const manualCalc = useMemo(() => {
    return verifyManualThreeCards(selfPlayer.cards || [], selectedCardIds);
  }, [selfPlayer.cards, selectedCardIds]);

  return (
    <div className="relative z-40 flex flex-col items-center justify-center gap-2">
      {/* Compact 3-Card Sum Bar (During Showdown only) */}
      {phase === 'SHOWDOWN' && !hasShown && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/35 bg-[#1a1009]/90 px-3.5 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-xs">
          <div className="flex items-center gap-1 font-mono tabular-nums">
            {[0, 1, 2].map((slotIdx) => {
              const c = manualCalc.selectedCards[slotIdx];
              return (
                <React.Fragment key={slotIdx}>
                  <div
                    className={`flex h-5.5 min-w-[28px] items-center justify-center rounded border px-1 text-xs font-black ${
                      c
                        ? 'border-amber-300 bg-amber-400/20 text-amber-200'
                        : 'border-white/20 bg-black/50 text-white/40'
                    }`}
                  >
                    {c ? RANK_NAMES[c.rank] : '?'}
                  </div>
                  {slotIdx < 2 && <span className="text-amber-300/70">+</span>}
                </React.Fragment>
              );
            })}
            <span className="text-amber-300/70">=</span>
            <div
              className={`flex h-5.5 min-w-[30px] items-center justify-center rounded border px-1.5 text-xs font-black ${
                manualCalc.isValidTenMultiple
                  ? 'border-emerald-300 bg-emerald-500/25 text-emerald-300'
                  : 'border-white/20 bg-black/50 text-amber-200'
              }`}
            >
              {manualCalc.sum3}
            </div>
          </div>
          {handResult && (
            <>
              <span aria-hidden="true" className="text-white/25">·</span>
              <span className="text-[11px] font-black text-amber-300 whitespace-nowrap">
                {handResult.name} (×{handResult.multiplier}倍)
              </span>
            </>
          )}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        {/* Phase 1: Call Banker */}
        {phase === 'CALL_BANKER' && !hasCalled && (
          <div className="flex items-center gap-2.5 animate-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                hapticEngine.tap();
                onCallBanker(0);
              }}
              className="rounded-xl border border-white/30 bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 py-2 text-xs sm:text-sm font-black text-white shadow-lg active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0"
            >
              不抢
            </button>

            {[1, 2, 3, 4].map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => {
                  hapticEngine.tap();
                  onCallBanker(mult);
                }}
                className="rounded-xl border border-amber-200/80 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] px-5 py-2 text-xs sm:text-sm font-black text-[#240e03] shadow-lg active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0"
              >
                抢{mult}倍
              </button>
            ))}
          </div>
        )}

        {/* Phase 2: Betting (Non-Dealer) */}
        {phase === 'BETTING' && !isDealer && !hasBet && (
          <div className="flex items-center gap-2.5 animate-in zoom-in-95 duration-150">
            {[5, 10, 15, 20].map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => {
                  hapticEngine.tap();
                  onBet(mult);
                }}
                className="rounded-xl border border-cyan-300/75 bg-gradient-to-b from-cyan-500 to-blue-800 px-5 py-2 font-mono text-xs sm:text-sm font-black text-white shadow-lg active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0 tabular-nums"
              >
                下{mult}倍
              </button>
            ))}
          </div>
        )}

        {/* Phase 2: Betting (Dealer Waiting Prompt) */}
        {phase === 'BETTING' && isDealer && (
          <div className="rounded-lg border border-amber-300/35 bg-black/60 px-5 py-1.5 text-xs font-bold text-amber-200 shadow-lg backdrop-blur-xs">
            本局您为庄家 · 等待闲家选注
          </div>
        )}

        {/* Phase 3: Showdown (提示算牛 / 亮牌) */}
        {phase === 'SHOWDOWN' && !hasShown && (
          <div className="flex items-center gap-3 animate-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => {
                soundEngine.playCardPlace(true);
                hapticEngine.selectCard();
                onAutoPartition();
              }}
              className="rounded-xl border border-emerald-300/80 bg-gradient-to-b from-emerald-500 to-teal-700 px-5 py-2 text-xs sm:text-sm font-black text-white shadow-lg active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0"
            >
              提示算牛
            </button>

            <button
              type="button"
              onClick={() => {
                hapticEngine.playCard();
                onShowHand();
              }}
              className="rounded-xl border-2 border-yellow-100 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#c2410c] px-6 py-2 text-xs sm:text-sm font-black text-[#240e03] shadow-xl active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0"
            >
              亮牌摊开
            </button>
          </div>
        )}

        {/* Waiting / Next Round Ready */}
        {phase === 'WAITING' && !isReady && (
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(720);
              hapticEngine.tap();
              onReady();
            }}
            className="rounded-xl border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#c2410c] px-7 py-2 text-sm font-black text-[#240e03] shadow-xl active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap shrink-0"
          >
            准备开局
          </button>
        )}
      </div>
    </div>
  );
};
