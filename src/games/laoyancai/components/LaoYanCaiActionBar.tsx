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
  countdown,
  selfPlayer,
  handResult,
  drawOdds,
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
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={onReady}
          className="rounded-full border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] px-8 py-2.5 font-display text-base font-black tracking-wider text-[#261003] shadow-[0_6px_18px_rgba(245,158,11,0.45)] transition-transform active:scale-95 cursor-pointer hover:brightness-105"
        >
          {selfPlayer.ready ? '已准备 · 等待开局...' : '准备开局'}
        </button>
      </div>
    );
  }

  // 2. CALL_BANKER Phase
  if (phase === 'CALL_BANKER') {
    if (selfPlayer.callMultiplier !== -1) {
      return (
        <div className="rounded-full border border-amber-300/35 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
          已表态（{selfPlayer.callMultiplier === 0 ? '不抢' : `抢${selfPlayer.callMultiplier}倍`}），等待其他玩家抢庄... ({countdown}s)
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-3">
        {[
          { mult: 0, label: '不抢', style: 'from-slate-600 to-slate-800 text-white border-white/30' },
          { mult: 1, label: '抢1倍', style: 'from-emerald-400 to-teal-700 text-white border-emerald-200' },
          { mult: 2, label: '抢2倍', style: 'from-sky-400 to-blue-700 text-white border-sky-200' },
          { mult: 3, label: '抢3倍', style: 'from-[#ffe58f] via-[#f59e0b] to-[#d97706] text-[#240e03] border-amber-100' },
        ].map((btn) => (
          <button
            key={btn.mult}
            type="button"
            onClick={() => onCallBanker(btn.mult)}
            className={`min-w-[84px] rounded-full border-2 bg-gradient-to-b px-5 py-2 font-display text-sm font-black shadow-lg transition-transform active:scale-95 cursor-pointer hover:brightness-108 ${btn.style}`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    );
  }

  // 3. BETTING Phase
  if (phase === 'BETTING') {
    if (selfPlayer.isDealer) {
      return (
        <div className="rounded-full border border-amber-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
          您是本局庄家，请等待闲家选择下注倍数... ({countdown}s)
        </div>
      );
    }

    if (selfPlayer.betMultiplier > 0) {
      return (
        <div className="rounded-full border border-cyan-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-cyan-200 backdrop-blur-xs">
          已下注 {selfPlayer.betMultiplier} 倍，等待发首轮底牌... ({countdown}s)
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center gap-3">
        {[5, 10, 15, 20].map((mult) => (
          <button
            key={mult}
            type="button"
            onClick={() => onBet(mult)}
            className="min-w-[82px] rounded-full border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] px-5 py-2 font-mono text-sm font-black text-[#240e03] shadow-lg transition-transform active:scale-95 cursor-pointer hover:brightness-108"
          >
            {mult}倍
          </button>
        ))}
      </div>
    );
  }

  // 4. BANKER_NATURAL Phase (Banker has initial 8 or 9 points)
  if (phase === 'BANKER_NATURAL') {
    if (!selfPlayer.isDealer) {
      return (
        <div className="rounded-full border border-amber-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
          庄家正在查看底牌（判定是否天牌炸开）... ({countdown}s)
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-full border border-amber-300/60 bg-[#2b1405]/90 px-4 py-1 text-xs font-extrabold text-amber-200 shadow-lg">
          🎉 恭喜庄家抓到天牌【{handResult?.name || '八/九点'}】！选择【炸开】可立即亮牌与全场比大小（闲家不可再捞牌）
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onBankerNatural(true)}
            className="rounded-full border-2 border-yellow-100 bg-gradient-to-r from-[#ffe58f] via-[#f59e0b] to-[#dc2626] px-7 py-2 font-display text-sm font-black text-white shadow-[0_0_20px_rgba(245,158,11,0.75)] transition-transform active:scale-95 cursor-pointer hover:brightness-110"
          >
            🔥 庄家天牌炸开 (全场比牌)
          </button>
          <button
            type="button"
            onClick={() => onBankerNatural(false)}
            className="rounded-full border border-white/30 bg-slate-800/90 px-5 py-2 font-display text-xs font-bold text-slate-200 shadow transition-transform active:scale-95 cursor-pointer hover:bg-slate-700"
          >
            暂不炸开 (继续)
          </button>
        </div>
      </div>
    );
  }

  // 5. PLAYER_DECISION Phase (Idle players choose 炸开 / 捞牌 / 不捞)
  if (phase === 'PLAYER_DECISION') {
    if (selfPlayer.isDealer) {
      return (
        <div className="rounded-full border border-amber-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
          等待各闲家抉择【炸开 / 捞牌 / 不捞】... ({countdown}s)
        </div>
      );
    }

    if (selfPlayer.decision !== 'PENDING') {
      const decLabel =
        selfPlayer.decision === 'ZHAKAI'
          ? '已选择【🔥炸开】'
          : selfPlayer.decision === 'LAO'
          ? '已选择【🥬捞牌】'
          : '已选择【🛡️不捞】';
      return (
        <div className="rounded-full border border-emerald-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-emerald-200 backdrop-blur-xs">
          {decLabel} · 当前牌型：{handResult?.name} ({handResult?.badgeText})，等待其他玩家... ({countdown}s)
        </div>
      );
    }

    const canZhaKai = Boolean(handResult?.canZhaKai || drawOdds?.canZhaKai);

    return (
      <div className="flex flex-col items-center gap-2">
        {/* Real-Time Draw Odds & EV Assist HUD */}
        {drawOdds && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-300/40 bg-[#082219]/92 px-4 py-1 text-[11px] sm:text-xs font-bold text-emerald-100 shadow-lg backdrop-blur-xs">
            <span className="text-amber-300 font-extrabold">
              {drawOdds.adviceText}
            </span>
            <span className="text-white/30">|</span>
            <span className="font-mono text-emerald-300">
              捞牌提升率 {drawOdds.improveProbability}%
            </span>
            <span className="text-white/30">·</span>
            <span className="font-mono text-sky-300">
              大牌率(≥7点) {drawOdds.highHandProbability}%
            </span>
            {drawOdds.specialMultiplierProbability > 0 && (
              <>
                <span className="text-white/30">·</span>
                <span className="font-mono text-pink-300">
                  高倍(≥3x)率 {drawOdds.specialMultiplierProbability}%
                </span>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3.5">
          {canZhaKai && (
            <button
              type="button"
              onClick={() => onPlayerDecision('ZHAKAI')}
              className={`rounded-full border-2 border-yellow-100 bg-gradient-to-r from-[#ffe58f] via-[#f59e0b] to-[#dc2626] px-6 py-2 font-display text-sm font-black text-[#260e03] shadow-[0_0_20px_rgba(245,158,11,0.8)] transition-transform active:scale-95 cursor-pointer hover:brightness-110 ${
                drawOdds?.recommendation === 'ZHAKAI' ? 'ring-2 ring-yellow-300 animate-pulse' : ''
              }`}
            >
              🔥 炸开亮牌 ({handResult?.points}点)
            </button>
          )}

          <button
            type="button"
            onClick={() => onPlayerDecision('LAO')}
            className={`rounded-full border-2 border-emerald-200 bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-700 px-6 py-2 font-display text-sm font-black text-white shadow-[0_6px_18px_rgba(16,185,129,0.45)] transition-transform active:scale-95 cursor-pointer hover:brightness-110 ${
              drawOdds?.recommendation === 'LAO' ? 'ring-2 ring-emerald-200' : ''
            }`}
          >
            🥬 捞腌菜 (摸第3张)
            {drawOdds?.recommendation === 'LAO' && (
              <span className="ml-1.5 rounded bg-black/25 px-1.5 py-0.2 text-[10px] text-amber-200">
                推荐
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onPlayerDecision('BULAO')}
            className={`rounded-full border-2 border-sky-200/80 bg-gradient-to-b from-slate-600 to-slate-800 px-6 py-2 font-display text-sm font-black text-white shadow-lg transition-transform active:scale-95 cursor-pointer hover:brightness-110 ${
              drawOdds?.recommendation === 'BULAO' ? 'ring-2 ring-sky-300' : ''
            }`}
          >
            🛡️ 不捞 (守2张)
            {drawOdds?.recommendation === 'BULAO' && (
              <span className="ml-1.5 rounded bg-sky-400/25 px-1.5 py-0.2 text-[10px] text-sky-200">
                推荐
              </span>
            )}
          </button>
        </div>
      </div>
    );
  }

  // 6. BANKER_DECISION Phase (Banker decides whether to draw 3rd card)
  if (phase === 'BANKER_DECISION') {
    if (!selfPlayer.isDealer) {
      return (
        <div className="rounded-full border border-amber-300/40 bg-black/65 px-5 py-1.5 text-xs font-extrabold text-amber-200 backdrop-blur-xs">
          闲家操作完毕，等待庄家抉择【捞牌 / 不捞】... ({countdown}s)
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-2">
        {drawOdds && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-amber-300/45 bg-[#1b1407]/92 px-4 py-1 text-[11px] sm:text-xs font-bold text-amber-100 shadow-lg backdrop-blur-xs">
            <span className="text-amber-300 font-extrabold">
              庄家决策参考：{drawOdds.adviceText}
            </span>
            <span className="text-white/30">|</span>
            <span className="font-mono text-emerald-300">
              捞牌提升率 {drawOdds.improveProbability}%
            </span>
            <span className="text-white/30">·</span>
            <span className="font-mono text-sky-300">
              捞后期望 {drawOdds.expectedPointsAfterDraw}点
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => onBankerDecision('LAO')}
            className={`rounded-full border-2 border-emerald-200 bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-700 px-7 py-2 font-display text-sm font-black text-white shadow-[0_6px_18px_rgba(16,185,129,0.5)] transition-transform active:scale-95 cursor-pointer hover:brightness-110 ${
              drawOdds?.recommendation === 'LAO' ? 'ring-2 ring-emerald-200' : ''
            }`}
          >
            🥬 庄家捞牌 (抓第3张)
          </button>

          <button
            type="button"
            onClick={() => onBankerDecision('BULAO')}
            className={`rounded-full border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] px-7 py-2 font-display text-sm font-black text-[#261003] shadow-lg transition-transform active:scale-95 cursor-pointer hover:brightness-110 ${
              drawOdds?.recommendation !== 'LAO' ? 'ring-2 ring-amber-200' : ''
            }`}
          >
            🛡️ 庄家不捞 (立即开牌)
          </button>
        </div>
      </div>
    );
  }

  return null;
};
