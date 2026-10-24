import React from 'react';
import {
  LaoYanCaiDrawOdds,
  LaoYanCaiHandResult,
  LaoYanCaiPhase,
  LaoYanCaiPlayerInfo,
  LaoYanCaiPlayMode,
} from '../types';

export interface LaoYanCaiActionBarProps {
  phase: LaoYanCaiPhase;
  playMode: LaoYanCaiPlayMode;
  countdown: number;
  selfPlayer: LaoYanCaiPlayerInfo | null;
  handResult?: LaoYanCaiHandResult;
  drawOdds?: LaoYanCaiDrawOdds;
  onCallBanker: (multiplier: number) => void;
  onBet: (multiplier: number) => void;
  onBankerNatural: (zhaKai: boolean) => void;
  onPlayerDecision: (decision: 'ZHAKAI' | 'LAO' | 'BULAO') => void;
  onBankerDecision: (decision: 'LAO' | 'BULAO') => void;
  onReady: () => void;
}

export const LaoYanCaiActionBar: React.FC<LaoYanCaiActionBarProps> = ({
  phase,
  selfPlayer,
  handResult,
  onCallBanker,
  onBet,
  onBankerNatural,
  onPlayerDecision,
  onBankerDecision,
  onReady,
}) => {
  if (!selfPlayer) return null;

  // 1. WAITING Phase
  if (phase === 'WAITING') {
    return (
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onReady}
          className="rounded-full border-t border-amber-100 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 px-8 py-2.5 font-display text-sm font-black text-[#240e03] shadow-lg active:scale-95 cursor-pointer"
        >
          准备开局
        </button>
      </div>
    );
  }

  // 2. CALL_BANKER Phase
  if (phase === 'CALL_BANKER' && selfPlayer.callMultiplier === -1) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-amber-300/35 bg-black/65 px-5 py-2 shadow-2xl backdrop-blur-md">
        <span className="text-xs font-extrabold text-amber-200 mr-1">
          请选择抢庄倍数:
        </span>
        {[
          { label: '不抢', mult: 0, style: 'from-slate-600 to-slate-800 text-white' },
          { label: '1倍抢庄', mult: 1, style: 'from-emerald-500 to-emerald-700 text-white' },
          { label: '2倍抢庄', mult: 2, style: 'from-amber-400 to-amber-600 text-[#240b02]' },
          { label: '3倍抢庄', mult: 3, style: 'from-rose-500 to-red-700 text-white' },
        ].map((item) => (
          <button
            key={item.mult}
            type="button"
            onClick={() => onCallBanker(item.mult)}
            className={`rounded-full bg-gradient-to-b ${item.style} px-5 py-1.5 font-mono text-xs font-black tabular-nums shadow-md active:scale-95 cursor-pointer`}
          >
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  // 3. BETTING Phase (Idle players only)
  if (
    phase === 'BETTING' &&
    !selfPlayer.isDealer &&
    selfPlayer.betMultiplier === 0
  ) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-amber-300/35 bg-black/65 px-5 py-2 shadow-2xl backdrop-blur-md">
        <span className="text-xs font-extrabold text-emerald-200 mr-1">
          闲家下注倍数:
        </span>
        {[5, 10, 15, 20].map((mult) => (
          <button
            key={mult}
            type="button"
            onClick={() => onBet(mult)}
            className="rounded-full border border-amber-200/60 bg-gradient-to-b from-amber-400 to-amber-600 px-5 py-1.5 font-mono text-xs font-black text-[#240b02] tabular-nums shadow-md active:scale-95 cursor-pointer hover:brightness-105"
          >
            下 {mult} 倍
          </button>
        ))}
      </div>
    );
  }

  // 4. BANKER_NATURAL Phase (Banker has 8 or 9 points on initial 2 cards)
  if (phase === 'BANKER_NATURAL' && selfPlayer.isDealer) {
    return (
      <div className="flex items-center gap-4 rounded-full border border-yellow-300/60 bg-black/75 px-6 py-2 shadow-2xl backdrop-blur-md">
        <span className="text-xs font-black text-amber-300">
          庄家首轮天牌 ({handResult?.name || '8/9点'})，是否直接【炸开】通比？
        </span>
        <button
          type="button"
          onClick={() => onBankerNatural(true)}
          className="rounded-full border border-yellow-200 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 px-6 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 cursor-pointer"
        >
          天牌炸开
        </button>
        <button
          type="button"
          onClick={() => onBankerNatural(false)}
          className="rounded-full border border-slate-400/50 bg-slate-700 px-5 py-1.5 text-xs font-bold text-slate-200 active:scale-95 cursor-pointer"
        >
          暂不炸开
        </button>
      </div>
    );
  }

  // 5. PLAYER_DECISION Phase (Idle players choose ZHAKAI / LAO / BULAO)
  if (
    phase === 'PLAYER_DECISION' &&
    !selfPlayer.isDealer &&
    selfPlayer.decision === 'PENDING'
  ) {
    const canZhaKai = Boolean(handResult?.canZhaKai);
    return (
      <div className="flex items-center gap-4 rounded-full border border-amber-300/40 bg-black/70 px-6 py-2 shadow-2xl backdrop-blur-md">
        {canZhaKai && (
          <button
            type="button"
            onClick={() => onPlayerDecision('ZHAKAI')}
            className="rounded-full border border-yellow-200 bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 px-6 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 cursor-pointer"
          >
            天牌炸开 ({handResult?.points}点亮牌)
          </button>
        )}

        <button
          type="button"
          onClick={() => onPlayerDecision('LAO')}
          className="rounded-full border border-emerald-200/80 bg-gradient-to-b from-emerald-500 to-emerald-700 px-6 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 cursor-pointer"
        >
          捞腌菜 (补第3张)
        </button>

        <button
          type="button"
          onClick={() => onPlayerDecision('BULAO')}
          className="rounded-full border border-amber-200/70 bg-gradient-to-b from-amber-400 to-amber-600 px-6 py-1.5 text-xs font-black text-[#240b02] shadow-lg active:scale-95 cursor-pointer"
        >
          不捞 (守{handResult?.points ?? 0}点)
        </button>
      </div>
    );
  }

  // 6. BANKER_DECISION Phase (Banker chooses LAO / BULAO)
  if (
    phase === 'BANKER_DECISION' &&
    selfPlayer.isDealer &&
    selfPlayer.decision === 'PENDING'
  ) {
    return (
      <div className="flex items-center gap-4 rounded-full border border-amber-300/45 bg-black/75 px-6 py-2 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => onBankerDecision('LAO')}
          className="rounded-full border border-emerald-200/80 bg-gradient-to-b from-emerald-500 to-emerald-700 px-7 py-1.5 text-xs font-black text-white shadow-lg active:scale-95 cursor-pointer"
        >
          庄家捞牌 (补第3张)
        </button>

        <button
          type="button"
          onClick={() => onBankerDecision('BULAO')}
          className="rounded-full border border-amber-200/80 bg-gradient-to-b from-amber-400 to-amber-600 px-7 py-1.5 text-xs font-black text-[#240b02] shadow-lg active:scale-95 cursor-pointer"
        >
          不捞·开牌 ({handResult?.points ?? 0}点)
        </button>
      </div>
    );
  }

  return null;
};
