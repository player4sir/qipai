import React, { useEffect, useState } from 'react';
import type { ZjhDynamicPotOddsSnapshot, ZjhEquityAnalysis, ZjhSnapshot } from '../types';
import { formatZjhBeans } from './ZjhSeat';

export interface ZjhActionBarProps {
  snapshot: ZjhSnapshot;
  comparing: boolean;
  equityAnalysis?: ZjhEquityAnalysis;
  dynamicPotOdds?: ZjhDynamicPotOddsSnapshot;
  onLook: () => void;
  onFold: () => void;
  onCall: () => void;
  onRaise: (level: number) => void;
  onToggleCompare: () => void;
  onAllIn: () => void;
  onNextRound?: () => void;
}

const Btn: React.FC<{
  label: string;
  sub?: string;
  tone: 'neutral' | 'danger' | 'primary' | 'gold' | 'violet';
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}> = ({ label, sub, tone, disabled, active, onClick }) => {
  const tones: Record<string, string> = {
    neutral: 'from-slate-600 to-slate-800 border-slate-300/40 text-white',
    danger: 'from-red-600 to-red-900 border-red-300/50 text-white',
    primary: 'from-emerald-500 to-emerald-800 border-emerald-200/60 text-white',
    gold: 'from-amber-400 to-amber-700 border-amber-100/70 text-black',
    violet: 'from-fuchsia-600 to-purple-900 border-fuchsia-200/50 text-white',
  };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'relative flex h-[52px] min-w-[100px] flex-col items-center justify-center rounded-xl border bg-gradient-to-b px-4 whitespace-nowrap shrink-0',
        'font-black leading-tight shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition active:scale-95',
        tones[tone],
        active ? 'ring-2 ring-white' : '',
        disabled ? 'cursor-not-allowed opacity-40 grayscale' : 'cursor-pointer hover:brightness-110',
      ].join(' ')}
    >
      <span className="text-[15px]">{label}</span>
      {sub && <span className="font-mono text-[11px] font-bold opacity-85 tabular-nums">{sub}</span>}
    </button>
  );
};

export const ZjhActionBar: React.FC<ZjhActionBarProps> = ({
  snapshot,
  comparing,
  onLook,
  onFold,
  onCall,
  onRaise,
  onToggleCompare,
  onAllIn,
  onNextRound,
}) => {
  const [raiseOpen, setRaiseOpen] = useState(false);
  const { my, phase, mySeat } = snapshot;
  const me = mySeat >= 0 ? snapshot.seats[mySeat] : null;

  useEffect(() => {
    if (!my.canAct) setRaiseOpen(false);
  }, [my.canAct]);

  const wrap = 'flex min-h-[52px] items-center justify-center gap-3';

  if (phase === 'WAITING') {
    return (
      <div className={wrap}>
        <span className="rounded-lg border border-amber-300/25 bg-black/65 px-5 py-2 text-sm font-bold text-amber-200">
          {snapshot.countdown > 0 ? `牌局即将开始 ${snapshot.countdown}s` : '等待开局'}
        </span>
      </div>
    );
  }
  if (phase === 'SHOWDOWN') {
    return (
      <div className={wrap}>
        <span className="rounded-lg border border-fuchsia-300/35 bg-black/65 px-5 py-2 text-sm font-bold text-fuchsia-200">
          全员开牌 · 边池比牌结算中
        </span>
      </div>
    );
  }
  if (phase === 'RESULT') {
    return (
      <div className={wrap}>
        {onNextRound ? (
          <button
            type="button"
            onClick={onNextRound}
            className="rounded-xl border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#c2410c] px-7 py-2 text-sm font-black text-[#240e03] shadow-xl active:scale-95 cursor-pointer hover:brightness-110 whitespace-nowrap"
          >
            再来一局 {snapshot.countdown > 0 ? `(${snapshot.countdown}s)` : ''}
          </button>
        ) : (
          <span className="rounded-lg border border-amber-300/25 bg-black/65 px-5 py-2 text-sm font-bold text-amber-200">
            下一局即将开始 {snapshot.countdown > 0 ? `${snapshot.countdown}s` : ''}
          </span>
        )}
      </div>
    );
  }

  if (!me || me.status === 'folded' || me.status === 'lost' || me.status === 'waiting') {
    return (
      <div className={wrap}>
        <span className="rounded-lg border border-white/15 bg-black/65 px-5 py-2 text-sm font-bold text-neutral-300">
          {me?.status === 'lost' ? '比牌落败 · 观战中' : me?.status === 'folded' ? '已弃牌 · 观战中' : '本局观战中'}
        </span>
      </div>
    );
  }

  const turnName =
    snapshot.currentTurnSeat >= 0 ? (snapshot.seats[snapshot.currentTurnSeat]?.nickname ?? '') : '';

  return (
    <div className="relative flex flex-col items-center gap-2">
      {raiseOpen && my.raiseOptions.length > 0 && (
        <div className="absolute -top-[68px] left-1/2 z-50 flex -translate-x-1/2 gap-2 rounded-2xl border border-amber-300/50 bg-black/90 p-2 shadow-xl">
          {my.raiseOptions.map((o) => (
            <button
              key={o.level}
              type="button"
              onClick={() => {
                setRaiseOpen(false);
                onRaise(o.level);
              }}
              className="flex min-w-[82px] cursor-pointer flex-col items-center rounded-xl border border-amber-200/60 bg-gradient-to-b from-amber-400 to-amber-700 px-3 py-1.5 font-black text-black transition active:scale-95 hover:brightness-110 whitespace-nowrap"
            >
              <span className="text-[13px]">加到 {formatZjhBeans(o.stake)}</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">付 {formatZjhBeans(o.cost)}</span>
            </button>
          ))}
        </div>
      )}

      <div className={wrap}>
        {my.canLook && <Btn label="看牌" tone="neutral" onClick={onLook} />}

        {my.canAct ? (
          <>
            <Btn label="弃牌" tone="danger" onClick={onFold} />
            {my.mustAllIn ? (
              <Btn
                label="全押"
                sub={`${formatZjhBeans(me.beans)}`}
                tone="violet"
                onClick={onAllIn}
              />
            ) : (
              <>
                <Btn
                  label={me.seen ? '跟注' : '闷牌'}
                  sub={formatZjhBeans(my.callCost)}
                  tone="primary"
                  onClick={onCall}
                />
                <Btn
                  label="加注"
                  tone="gold"
                  disabled={my.raiseOptions.length === 0}
                  active={raiseOpen}
                  onClick={() => setRaiseOpen((v) => !v)}
                />
              </>
            )}
            <Btn
              label={comparing ? '取消比牌' : '比牌'}
              sub={comparing ? '点选对手' : formatZjhBeans(my.compareCost)}
              tone="violet"
              disabled={!my.canCompare}
              active={comparing}
              onClick={onToggleCompare}
            />
          </>
        ) : (
          <span className="rounded-lg border border-white/15 bg-black/65 px-5 py-2 text-sm font-bold text-neutral-200">
            {turnName ? `等待 ${turnName} 决策` : '发牌准备中'}
          </span>
        )}
      </div>
    </div>
  );
};
