import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, HelpCircle, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import type { ViewportMetrics } from '../../App';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { ZJH_TURN_SECONDS, type ZjhActionPayload, type ZjhSnapshot } from './types';
import { ZjhActionBar } from './components/ZjhActionBar';
import { ZjhSeat, formatZjhBeans } from './components/ZjhSeat';
import { ZjhCardView } from './components/ZjhCardView';
import { AvatarSvg } from '../../shared/ui/AvatarSvg';
import {
  RollingScoreCounter,
  SettlementHeroHeader,
} from '../../shared/ui/RollingScoreCounter';

export interface ZhajinhuaTableViewProps {
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom: () => void;
}

/** Seat anchor per view slot (0 = me at the bottom, then clockwise). Coordinates on the 720-high stage. */
const slotStyle = (slot: number, width: number): React.CSSProperties => {
  switch (slot) {
    case 0:
      return { left: '50%', bottom: 84, transform: 'translateX(-50%)' };
    case 1:
      return { left: 64, top: 312, transform: 'translateY(-50%)' };
    case 2:
      return { left: width * 0.33, top: 70, transform: 'translateX(-50%)' };
    case 3:
      return { left: width * 0.67, top: 70, transform: 'translateX(-50%)' };
    default:
      return { right: 64, top: 312, transform: 'translateY(-50%)' };
  }
};

const RULES: Array<[string, string]> = [
  ['牌型大小', '豹子 > 顺金 > 金花 > 顺子 > 对子 > 单张；A 最大，A-2-3 为最小顺子，花色不比大小。'],
  ['下注', '每人先下底注；闷牌（未看牌）跟注 1 倍，看牌后跟注 2 倍；加注可选 2/5/10 倍档位。'],
  ['比牌', '从第 2 轮起可付双倍跟注费与一名对手比牌，输者出局，点数相同发起方判负；只剩 2 人时随时可比。'],
  ['封顶与全押', `最多 ${10} 轮，封顶后全员开牌；豆子不足跟注时只能全押，直接开牌并按边池结算。`],
  ['超时', `每次操作 ${ZJH_TURN_SECONDS} 秒，超时自动弃牌，连续超时将进入托管。`],
];

export const ZhajinhuaTableView: React.FC<ZhajinhuaTableViewProps> = ({
  isFullscreen,
  onToggleFullscreen,
  onLeaveRoom,
}) => {
  const [snapshot, setSnapshot] = useState<ZjhSnapshot | null>(null);
  const [comparing, setComparing] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [soundOn, setSoundOn] = useState(() => soundEngine.isEnabled());
  const [toast, setToast] = useState('');
  const [vsBanner, setVsBanner] = useState<{ id: number; text: string } | null>(null);
  const lastCompareId = useRef(0);
  const vsTimer = useRef<number | null>(null);
  const lastPot = useRef(0);
  const lastTurn = useRef(-1);

  useEffect(() => {
    soundEngine.startBgm('table');
    const offSnapshot = socketClient.on('s2c_zjh_snapshot', (data: ZjhSnapshot) => setSnapshot(data));
    const offError = socketClient.on('s2c_zjh_error', (data: { message: string }) => {
      setToast(data.message);
      window.setTimeout(() => setToast(''), 1800);
    });
    socketClient.emit('c2s_request_snapshot', {});
    return () => {
      offSnapshot?.();
      offError?.();
    };
  }, []);

  // Sound / haptics / compare banner reacting to state changes.
  useEffect(() => {
    if (!snapshot) return;

    if (snapshot.pot > lastPot.current && snapshot.phase === 'BETTING') {
      soundEngine.playNiuniuChip();
      hapticEngine.tap();
    }
    lastPot.current = snapshot.phase === 'BETTING' || snapshot.phase === 'SHOWDOWN' ? snapshot.pot : 0;

    if (snapshot.currentTurnSeat === snapshot.mySeat && snapshot.mySeat >= 0 && lastTurn.current !== snapshot.mySeat) {
      soundEngine.playTap(660);
      hapticEngine.tap();
    }
    lastTurn.current = snapshot.currentTurnSeat;

    const cmp = snapshot.lastCompare;
    if (cmp && cmp.id !== lastCompareId.current) {
      lastCompareId.current = cmp.id;
      const from = snapshot.seats[cmp.fromSeat]?.nickname ?? '';
      const to = snapshot.seats[cmp.toSeat]?.nickname ?? '';
      const loser = snapshot.seats[cmp.loserSeat]?.nickname ?? '';
      setVsBanner({ id: cmp.id, text: `${from}  VS  ${to}｜${loser} 出局` });
      soundEngine.playNiuniuHandReveal(2);
      // Timer lives in a ref: the snapshot effect re-runs on every update and must not cancel it.
      if (vsTimer.current) window.clearTimeout(vsTimer.current);
      vsTimer.current = window.setTimeout(() => {
        setVsBanner(null);
        vsTimer.current = null;
      }, 2200);
    }
  }, [snapshot]);

  useEffect(
    () => () => {
      if (vsTimer.current) window.clearTimeout(vsTimer.current);
    },
    [],
  );

  // Leaving compare mode when it is no longer my turn.
  useEffect(() => {
    if (snapshot && !snapshot.my.canCompare) setComparing(false);
  }, [snapshot]);

  const send = useCallback((payload: ZjhActionPayload) => {
    socketClient.emit('c2s_zjh_action', payload);
  }, []);

  const handleToggleCompare = useCallback(() => {
    if (!snapshot) return;
    const targets = snapshot.my.compareTargets;
    if (targets.length === 1) {
      // Heads-up: no need to choose.
      send({ action: 'compare', targetSeat: targets[0] });
      return;
    }
    setComparing((v) => !v);
  }, [snapshot, send]);

  const toggleSound = () => {
    soundEngine.toggle();
    setSoundOn(soundEngine.isEnabled());
  };

  const mySeat = snapshot ? Math.max(0, snapshot.mySeat) : 0;
  const slots = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.seats.map((seat, index) => ({
      seat,
      index,
      slot: (index - mySeat + snapshot.seats.length) % snapshot.seats.length,
    }));
  }, [snapshot, mySeat]);

  const modeLabel = snapshot?.mode === 'special' ? '235 玩法' : '经典玩法';

  return (
    <AutoLandscapeContainer baseHeight={720} minVirtualWidth={1280} maxVirtualWidth={1600}>
      {({ virtualWidth, virtualHeight, stageScale }) => (
        <div className="relative h-full w-full select-none overflow-hidden bg-[#071911] text-white">
          <div
            className="absolute overflow-hidden"
            style={{
              width: virtualWidth,
              height: virtualHeight,
              left: '50%',
              top: '50%',
              transform: `translate3d(-50%,-50%,0) scale(${stageScale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Felt */}
            <div
              className="absolute left-1/2 top-[40px] -translate-x-1/2 rounded-[170px] border-[7px] border-[#cda761] shadow-[inset_0_0_80px_rgba(0,0,0,0.75),0_20px_60px_rgba(0,0,0,0.7)]"
              style={{
                width: virtualWidth - 80,
                height: 616,
                background: 'radial-gradient(ellipse at center, #19633e 0%, #0e4228 55%, #062415 100%)',
              }}
            >
              <div className="pointer-events-none absolute inset-4 rounded-[152px] border border-[#d8b872]/25" />
            </div>
            <div className="pointer-events-none absolute left-1/2 top-[300px] -translate-x-1/2 -translate-y-1/2 font-display text-5xl font-black tracking-widest text-[#d8b872]/10">
              {modeLabel}
            </div>

            {/* Header (Auto-hidden during settlement RESULT phase) */}
            {snapshot?.phase !== 'RESULT' && (
              <div className="absolute left-6 right-6 top-3 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md hover:border-amber-300 hover:bg-black/80 active:scale-95 cursor-pointer"
                    aria-label="退出房间"
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/60 px-3.5 py-1.5 text-xs font-bold text-amber-100 backdrop-blur-xs">
                    <span className="text-amber-300">{modeLabel}</span>
                    <span className="text-white/30">·</span>
                    <span className="font-mono text-amber-200">
                      底注 {snapshot ? formatZjhBeans(snapshot.baseScore) : '-'}
                    </span>
                    {snapshot?.phase === 'BETTING' && (
                      <>
                        <span className="text-white/30">·</span>
                        <span className="font-mono text-white/85">
                          第 {snapshot.round}/{snapshot.maxRounds} 轮
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSound}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md hover:bg-black/80 active:scale-95 cursor-pointer"
                    aria-label="声音"
                  >
                    {soundOn ? <Volume2 size={16} className="text-amber-300" /> : <VolumeX size={16} className="text-rose-400" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRules(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-amber-200 shadow-md hover:bg-black/80 active:scale-95 cursor-pointer"
                    aria-label="规则"
                  >
                    <HelpCircle size={16} />
                  </button>
                  {onToggleFullscreen && (
                    <button
                      type="button"
                      onClick={onToggleFullscreen}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md hover:bg-black/80 active:scale-95 cursor-pointer"
                      aria-label="全屏"
                    >
                      {isFullscreen ? <Minimize2 size={16} className="text-amber-300" /> : <Maximize2 size={16} />}
                    </button>
                  )}
                </div>
              </div>
            )}

            {!snapshot && (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-sm font-bold text-white/70">
                正在入座…
              </div>
            )}

            {/* Pot */}
            {snapshot && (
              <div className="absolute left-1/2 top-[256px] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
                <div className="flex items-center gap-2 rounded-full border border-amber-300/45 bg-black/60 px-5 py-1.5 shadow-[0_0_20px_rgba(251,191,36,0.2)]">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-100 bg-gradient-to-b from-amber-300 to-amber-600" />
                  <span className="text-xs font-bold text-amber-200/85">底池</span>
                  <span className="font-mono text-xl font-black text-amber-300">{formatZjhBeans(snapshot.pot)}</span>
                </div>
                {snapshot.phase === 'BETTING' && (
                  <div className="rounded-full bg-black/50 px-3 py-0.5 font-mono text-[11px] font-bold text-amber-100/85">
                    单注 {formatZjhBeans(snapshot.stake)}
                  </div>
                )}
              </div>
            )}

            {/* Seats */}
            {snapshot &&
              slots.map(({ seat, index, slot }) => {
                const isSelf = snapshot.mySeat === index;
                const selectable = comparing && snapshot.my.compareTargets.includes(index);
                return (
                  <div key={index} className="absolute z-20" style={slotStyle(slot, virtualWidth)}>
                    <ZjhSeat
                      seat={seat}
                      isSelf={isSelf}
                      isDealer={snapshot.dealerSeat === index}
                      isTurn={snapshot.currentTurnSeat === index}
                      turnSecondsLeft={snapshot.turnSecondsLeft}
                      turnSecondsTotal={ZJH_TURN_SECONDS}
                      selectable={selectable}
                      onSelect={() => {
                        setComparing(false);
                        send({ action: 'compare', targetSeat: index });
                      }}
                      showDelta={snapshot.phase === 'RESULT'}
                    />
                  </div>
                );
              })}

            {/* Compare banner */}
            {vsBanner && (
              <div className="pointer-events-none absolute left-1/2 top-[322px] z-40 -translate-x-1/2 whitespace-nowrap rounded-2xl border border-fuchsia-300/60 bg-black/85 px-6 py-2 text-lg font-black text-fuchsia-100 shadow-[0_0_30px_rgba(217,70,239,0.55)]">
                {vsBanner.text}
              </div>
            )}

            {/* Toast */}
            {toast && (
              <div className="pointer-events-none absolute left-1/2 top-[110px] z-50 -translate-x-1/2 rounded-full bg-red-700/90 px-5 py-1.5 text-sm font-bold">
                {toast}
              </div>
            )}

            {/* Trusteeship: the server is playing for you (Auto-hidden during RESULT settlement) */}
            {snapshot?.myTrusteeship && snapshot.phase !== 'RESULT' && (
              <div className="absolute inset-x-0 bottom-0 z-40 flex h-[150px] items-end justify-center bg-gradient-to-t from-black/85 to-transparent pb-5">
                <button
                  type="button"
                  onClick={() => socketClient.emit('c2s_zjh_ready', {})}
                  className="rounded-full border border-amber-200/70 bg-gradient-to-b from-amber-400 to-amber-700 px-10 py-3 text-base font-black text-black shadow-xl transition active:scale-95 hover:brightness-110"
                >
                  托管中 · 点击取消托管
                </button>
              </div>
            )}

            {/* Footer (Auto-hidden during RESULT settlement) */}
            {snapshot && !snapshot.myTrusteeship && snapshot.phase !== 'RESULT' && (
              <div className="absolute bottom-[14px] left-1/2 z-30 -translate-x-1/2">
                <ZjhActionBar
                  snapshot={snapshot}
                  comparing={comparing}
                  onLook={() => send({ action: 'look' })}
                  onFold={() => send({ action: 'fold' })}
                  onCall={() => send({ action: 'call' })}
                  onRaise={(level) => send({ action: 'raise', level })}
                  onToggleCompare={handleToggleCompare}
                  onAllIn={() => send({ action: 'allin' })}
                />
              </div>
            )}

            {/* Focused Settlement Modal (RESULT phase) */}
            {snapshot?.phase === 'RESULT' && (
              <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
                <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-2 border-amber-300/75 bg-gradient-to-b from-[#24140a] via-[#170d06] to-[#0f0804] text-white shadow-[0_28px_72px_rgba(0,0,0,0.92)]">
                  <SettlementHeroHeader
                    selfScoreDelta={snapshot.seats[mySeat]?.delta ?? 0}
                    titleWin="金花大捷 · 本局结算"
                    titleLose="再接再厉 · 本局结算"
                    subtitle={`${modeLabel} · 底注 ${snapshot.baseScore.toLocaleString()} · 底池 ${snapshot.pot.toLocaleString()}`}
                  />

                  <div className="flex max-h-[54vh] flex-col gap-2 overflow-y-auto p-3.5 sm:p-4">
                    {snapshot.seats.filter(Boolean).map((s) => {
                      const seat = s!;
                      const isSelf = seat.seatIndex === mySeat;
                      return (
                        <div
                          key={seat.playerId}
                          className={`flex items-center justify-between gap-2 rounded-2xl border px-3.5 py-2 ${
                            isSelf
                              ? 'border-amber-300/70 bg-amber-500/15 shadow-[0_0_16px_rgba(245,158,11,0.18)]'
                              : 'border-white/10 bg-white/5'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2.5">
                            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-amber-200/40 bg-black">
                              <AvatarSvg avatarId={seat.avatarId} size={36} />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="max-w-[100px] truncate text-xs sm:text-sm font-extrabold text-white">
                                  {seat.nickname}
                                </span>
                                {seat.isWinner && (
                                  <span className="rounded bg-amber-400 px-1.5 py-0.2 text-[10px] font-black text-[#240e03]">
                                    赢家
                                  </span>
                                )}
                                {seat.status === 'folded' && (
                                  <span className="rounded bg-neutral-700 px-1.5 py-0.2 text-[10px] font-bold text-neutral-300">
                                    弃牌
                                  </span>
                                )}
                                {seat.status === 'lost' && (
                                  <span className="rounded bg-rose-900/80 px-1.5 py-0.2 text-[10px] font-bold text-rose-200">
                                    比牌惜败
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-amber-100/60">
                                当前积分: {seat.beans.toLocaleString()} · 下注 {seat.totalBet.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {seat.cards && seat.cards.length === 3 && (
                              <div className="hidden sm:flex items-center -space-x-2">
                                {seat.cards.map((c, idx) => (
                                  <ZjhCardView key={`${c.id}_${idx}`} card={c} size="sm" />
                                ))}
                              </div>
                            )}
                            {seat.handLabel && (
                              <span className="rounded-full border border-amber-300/45 bg-black/50 px-2.5 py-0.5 text-xs font-black text-amber-200 whitespace-nowrap">
                                {seat.handLabel}
                              </span>
                            )}
                          </div>

                          <div className="flex w-28 shrink-0 flex-col items-end">
                            <RollingScoreCounter
                              value={seat.delta}
                              size="md"
                              durationMs={950}
                              playTickSound={isSelf}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/10 bg-black/45 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playTap(640);
                        onLeaveRoom();
                      }}
                      className="rounded-full border border-white/25 bg-white/10 px-6 py-1.5 text-xs sm:text-sm font-bold text-white/90 hover:bg-white/20 active:scale-95 cursor-pointer"
                    >
                      返回大厅
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playTap(760);
                        hapticEngine.tap();
                        socketClient.emit('c2s_zjh_ready', {});
                      }}
                      className="rounded-full border-2 border-amber-200 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#c2410c] px-7 py-1.5 text-xs sm:text-sm font-black text-[#240e03] shadow-lg hover:brightness-110 active:scale-95 cursor-pointer"
                    >
                      再来一局 {snapshot.countdown > 0 ? `(${snapshot.countdown}s)` : ''}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Rules */}
            {showRules && (
              <div
                className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80"
                onClick={() => setShowRules(false)}
              >
                <div
                  className="w-[560px] rounded-2xl border border-amber-400/50 bg-[#0b1c14] p-6 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="mb-3 text-center text-lg font-black text-amber-300">炸金花 · 玩法说明</h3>
                  <div className="space-y-2.5 text-[13px] leading-relaxed text-white/85">
                    {RULES.map(([title, body]) => (
                      <p key={title}>
                        <b className="text-amber-200">{title}：</b>
                        {body}
                      </p>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRules(false)}
                    className="mx-auto mt-4 block rounded-full bg-amber-500 px-8 py-1.5 text-sm font-black text-black hover:brightness-110"
                  >
                    知道了
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AutoLandscapeContainer>
  );
};

export default ZhajinhuaTableView;
