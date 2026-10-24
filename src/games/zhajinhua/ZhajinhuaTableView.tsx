import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, HelpCircle, Maximize2, Minimize2, Volume2, VolumeX, X } from 'lucide-react';
import type { ViewportMetrics } from '../../App';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import { CommercialModalShell } from '../../shared/ui/CommercialModalShell';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { webAudioQueue } from '../../shared/audio/WebAudioQueueManager';
import {
  gameControlHub,
  useGameControlState,
} from '../../shared/control/GameControlHub';
import { roomCardSessionHub } from '../../shared/control/RoomCardSessionHub';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import {
  ZJH_MAX_ROUNDS,
  ZJH_TURN_SECONDS,
  type ZjhActionPayload,
  type ZjhCard,
  type ZjhDynamicPotOddsSnapshot,
  type ZjhEquityAnalysis,
  type ZjhMode,
  type ZjhSeatSnapshot,
  type ZjhSnapshot,
} from './types';
import {
  analyzeZjhDecisionEquity,
  calculateZjhMultiPotOdds,
  callCost,
  canCompareNow,
  compareCost,
  compareHands,
  createZjhDeck,
  evaluateHand,
  raiseOptions,
  resolveShowdown,
  stakeOf,
} from './algorithms/ZjhLogic';
import { ZjhDebugLogger } from './utils/ZjhDebugLogger';
import { ZjhActionBar } from './components/ZjhActionBar';
import { ZjhSeat, formatZjhBeans } from './components/ZjhSeat';

export interface ZhajinhuaTableViewProps {
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom: () => void;
}

const MODE_LABELS: Record<ZjhMode, string> = {
  classic: '经典闷抓',
  special: '235吃豹子',
  bloody: '血拼百倍',
  quick: '极速竞技',
};

/** Seat anchor per view slot (0 = me at the bottom, then clockwise). Coordinates on the 720-high stage. */
const slotStyle = (slot: number, width: number): React.CSSProperties => {
  switch (slot) {
    case 0:
      return { left: '50%', bottom: 108, transform: 'translateX(-50%)' };
    case 1:
      return { left: 64, top: 308, transform: 'translateY(-50%)' };
    case 2:
      return { left: width * 0.32, top: 66, transform: 'translateX(-50%)' };
    case 3:
      return { left: width * 0.68, top: 66, transform: 'translateX(-50%)' };
    default:
      return { right: 64, top: 308, transform: 'translateY(-50%)' };
  }
};

const RULES: Array<[string, string]> = [
  ['牌型大小', '豹子 > 顺金 > 金花 > 顺子 > 对子 > 单张；A 最大，A-2-3 为最小顺子，花色不参与大小比较；235模式下异色 2-3-5 克制一切豹子。'],
  ['暗注与明注', '开局每人先投底注；闷牌（未看牌）跟注 1 倍，看牌后跟注 2 倍；加注可选 2/5/10 倍档位。'],
  ['闪电比牌', '从第 2 轮起（极速模式首轮起）可付双倍跟注费与一名对手比牌，输者出局，同点时发起方判负；仅剩 2 人时随时可比。'],
  ['封顶与边池全押', '达到封顶轮数后全员开牌；豆数不足跟注时可全押（All-In），直接开牌并按多层边池（Side Pot）精确结算。'],
  ['超时与托管', `每次操作限时 ${ZJH_TURN_SECONDS} 秒，超时自动弃牌，连续超时将进入智能托管。`],
];

function shuffleCards(deck: ZjhCard[]): ZjhCard[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const ZhajinhuaTableView: React.FC<ZhajinhuaTableViewProps> = ({
  isFullscreen,
  onToggleFullscreen,
  onLeaveRoom,
}) => {
  const controlState = useGameControlState();
  const [snapshot, setSnapshot] = useState<ZjhSnapshot | null>(null);
  const [localSnapshot, setLocalSnapshot] = useState<ZjhSnapshot | null>(null);
  const localHandsRef = useRef<ZjhCard[][]>([]);
  const prevSwitchSeqRef = useRef<number>(controlState.switchTableSeq);

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
    webAudioQueue.preloadGameAssets('zjh');
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
      webAudioQueue.clearAllQueues();
    };
  }, []);

  // Offline local simulation fallback
  const startLocalZjhRound = useCallback((existingBeans?: number[]) => {
    const deck = shuffleCards(createZjhDeck());
    const hands: ZjhCard[][] = [
      deck.slice(0, 3),
      deck.slice(3, 6),
      deck.slice(6, 9),
      deck.slice(9, 12),
      deck.slice(12, 15),
    ];
    localHandsRef.current = hands;

    const baseScore = 100;
    const profiles = [
      { id: 'self', name: '长安棋圣', avatar: 'kashen', isBot: false },
      { id: 'bot_1', name: '锦鲤·贝儿AI', avatar: 'beier', isBot: true },
      { id: 'bot_2', name: '折扇·柳如风AI', avatar: 'scholar', isBot: true },
      { id: 'bot_3', name: '财神·金百万AI', avatar: 'noble', isBot: true },
      { id: 'bot_4', name: '凌霄剑仙AI', avatar: 'warrior', isBot: true },
    ];

    const seats: ZjhSeatSnapshot[] = profiles.map((p, idx) => ({
      playerId: p.id,
      nickname: p.name,
      avatarId: p.avatar,
      seatIndex: idx,
      beans: (existingBeans?.[idx] ?? 120000) - baseScore,
      isBot: p.isBot,
      disconnected: false,
      status: 'active',
      seen: false,
      totalBet: baseScore,
      lastAction: '底注',
      cards: null,
      handLabel: '',
      isWinner: false,
      delta: 0,
    }));

    webAudioQueue.enqueueDealCascade(5, 55, undefined, 0);

    const activeSessionConfig = roomCardSessionHub.getStore().activeSession?.config;
    setLocalSnapshot({
      roomId: activeSessionConfig?.roomId || '100001',
      phase: 'BETTING',
      mode: 'classic',
      baseScore,
      round: 1,
      maxRounds: ZJH_MAX_ROUNDS,
      pot: baseScore * 5,
      stake: baseScore,
      stakeLevel: 0,
      dealerSeat: 4,
      currentTurnSeat: 0,
      turnSecondsLeft: ZJH_TURN_SECONDS,
      countdown: 0,
      mySeat: 0,
      myTrusteeship: false,
      seats,
      my: {
        canAct: true,
        canLook: true,
        callCost: baseScore,
        raiseOptions: raiseOptions({ baseScore, stakeLevel: 0, seen: false }),
        compareCost: baseScore * 2,
        canCompare: false,
        compareTargets: [1, 2, 3, 4],
        canAllIn: false,
        mustAllIn: false,
      },
      lastCompare: null,
      message: '底注 100 · 请操作',
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!snapshot) {
        startLocalZjhRound();
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [snapshot, startLocalZjhRound]);

  const activeSnapshot = snapshot || localSnapshot;

  const prevZjhSeatStateRef = useRef<
    Record<number, { seen: boolean; totalBet: number; status: string }>
  >({});
  const lastAnnouncedResultPotRef = useRef<number>(0);

  // Sound / haptics / compare lightning banner reacting to state & opponent actions via WebAudioQueueManager
  useEffect(() => {
    if (!activeSnapshot) return;
    const selfSeat = Math.max(0, activeSnapshot.mySeat);

    if (activeSnapshot.phase === 'WAITING') {
      prevZjhSeatStateRef.current = {};
      lastAnnouncedResultPotRef.current = 0;
    }

    // Track per-seat opponent actions (peek, blind/call/raise chip collision, all-in, fold)
    if (activeSnapshot.phase === 'BETTING') {
      activeSnapshot.seats.forEach((seat, idx) => {
        if (!seat) return;
        const prev = prevZjhSeatStateRef.current[idx];
        if (prev && idx !== selfSeat) {
          if (seat.seen && !prev.seen) {
            webAudioQueue.enqueueZjhAction({
              action: 'look',
              seatIndex: idx,
              selfSeatIndex: selfSeat,
              isSelf: false,
            });
          }
          if (seat.status === 'folded' && prev.status !== 'folded') {
            webAudioQueue.enqueueZjhAction({
              action: 'fold',
              seatIndex: idx,
              selfSeatIndex: selfSeat,
              isSelf: false,
            });
          } else if (seat.status === 'allin' && prev.status !== 'allin') {
            webAudioQueue.enqueueZjhAction({
              action: 'allin',
              seatIndex: idx,
              selfSeatIndex: selfSeat,
              isSelf: false,
            });
          } else if (seat.totalBet > prev.totalBet) {
            const isRaise = seat.lastAction.includes('加');
            webAudioQueue.enqueueZjhAction({
              action: isRaise ? 'raise' : seat.seen ? 'call' : 'blind',
              seatIndex: idx,
              selfSeatIndex: selfSeat,
              isSelf: false,
            });
          }
        }
        prevZjhSeatStateRef.current[idx] = {
          seen: seat.seen,
          totalBet: seat.totalBet,
          status: seat.status,
        };
      });
    }

    if (activeSnapshot.pot > lastPot.current && activeSnapshot.phase === 'BETTING') {
      hapticEngine.tap();
    }
    lastPot.current =
      activeSnapshot.phase === 'BETTING' || activeSnapshot.phase === 'SHOWDOWN'
        ? activeSnapshot.pot
        : 0;

    if (
      activeSnapshot.currentTurnSeat === activeSnapshot.mySeat &&
      activeSnapshot.mySeat >= 0 &&
      lastTurn.current !== activeSnapshot.mySeat
    ) {
      soundEngine.playTap(660);
      hapticEngine.tap();
    }
    lastTurn.current = activeSnapshot.currentTurnSeat;

    const cmp = activeSnapshot.lastCompare;
    if (cmp && cmp.id !== lastCompareId.current) {
      lastCompareId.current = cmp.id;
      const from = activeSnapshot.seats[cmp.fromSeat]?.nickname ?? '';
      const to = activeSnapshot.seats[cmp.toSeat]?.nickname ?? '';
      const loser = activeSnapshot.seats[cmp.loserSeat]?.nickname ?? '';
      setVsBanner({ id: cmp.id, text: `${from}  VS  ${to} · ${loser} 比牌落败` });
      webAudioQueue.enqueueCompareLightning({
        fromSeat: cmp.fromSeat,
        toSeat: cmp.toSeat,
        selfSeatIndex: selfSeat,
        announceVoice: cmp.fromSeat !== selfSeat,
      });
      if (vsTimer.current) window.clearTimeout(vsTimer.current);
      vsTimer.current = window.setTimeout(() => {
        setVsBanner(null);
        vsTimer.current = null;
      }, 2200);
    }

    // Announce winning hand category on Showdown Result
    if (
      activeSnapshot.phase === 'RESULT' &&
      activeSnapshot.pot > 0 &&
      lastAnnouncedResultPotRef.current !== activeSnapshot.pot
    ) {
      lastAnnouncedResultPotRef.current = activeSnapshot.pot;
      const winner = activeSnapshot.seats.find((s) => s && s.isWinner && s.handLabel);
      if (winner && winner.handLabel) {
        webAudioQueue.enqueueVoice({
          text: `${winner.handLabel}赢池`,
          priority: 22,
          replaceLower: false,
        });
      }
    }
  }, [activeSnapshot]);

  useEffect(
    () => () => {
      if (vsTimer.current) window.clearTimeout(vsTimer.current);
    },
    [],
  );

  // Leaving compare mode when it is no longer my turn.
  useEffect(() => {
    if (activeSnapshot && !activeSnapshot.my.canCompare) setComparing(false);
  }, [activeSnapshot]);

  // Compute self equity & Pot Odds analysis when player has looked at their 3 cards
  const selfEquityAnalysis = useMemo<ZjhEquityAnalysis | undefined>(() => {
    if (!activeSnapshot || activeSnapshot.mySeat < 0) return undefined;
    const me = activeSnapshot.seats[activeSnapshot.mySeat];
    if (!me || !me.cards || me.cards.length !== 3) return undefined;
    const activeCount = activeSnapshot.seats.filter(
      (s) => s && (s.status === 'active' || s.status === 'allin'),
    ).length;

    return analyzeZjhDecisionEquity({
      cards: me.cards,
      mode: activeSnapshot.mode,
      activeCount: Math.max(2, activeCount),
      pot: activeSnapshot.pot,
      callCost: activeSnapshot.my.callCost || activeSnapshot.stake,
      compareCost: activeSnapshot.my.compareCost || activeSnapshot.stake * 2,
      canCompare: activeSnapshot.my.canCompare,
      round: activeSnapshot.round,
      stakeLevel: activeSnapshot.stakeLevel,
    });
  }, [activeSnapshot]);

  const prevZjhWinRateRef = useRef<number | undefined>(undefined);
  const lastPotOddsLogRef = useRef<string>('');

  // Multi-player dynamic Pot Odds & Bayesian win-rate shift snapshot
  const selfDynamicPotOdds = useMemo<ZjhDynamicPotOddsSnapshot | undefined>(() => {
    if (!activeSnapshot || activeSnapshot.mySeat < 0) return undefined;
    const me = activeSnapshot.seats[activeSnapshot.mySeat];
    const fallbackCards =
      me?.cards && me.cards.length === 3
        ? me.cards
        : !snapshot && localHandsRef.current[activeSnapshot.mySeat]?.length === 3
        ? localHandsRef.current[activeSnapshot.mySeat]
        : null;
    if (!me || !fallbackCards || fallbackCards.length !== 3) return undefined;

    return calculateZjhMultiPotOdds({
      snapshot: activeSnapshot,
      cards: fallbackCards,
      previousWinRate: prevZjhWinRateRef.current,
    });
  }, [activeSnapshot, snapshot]);

  const lastEquityLogRef = useRef<string>('');
  useEffect(() => {
    if (!activeSnapshot || activeSnapshot.mySeat < 0) return;
    if (activeSnapshot.phase === 'WAITING' || activeSnapshot.round <= 1) {
      if (activeSnapshot.round <= 1 && selfDynamicPotOdds && prevZjhWinRateRef.current === undefined) {
        prevZjhWinRateRef.current = selfDynamicPotOdds.dynamicWinRate;
      }
    }

    const me = activeSnapshot.seats[activeSnapshot.mySeat];
    if (!me) return;

    // Log dynamic pot odds & win-rate shift on every betting round / pot / seat status change
    if (selfDynamicPotOdds && activeSnapshot.phase === 'BETTING') {
      const seatSig = activeSnapshot.seats
        .map((s) => (s ? `${s.status}:${s.seen ? 1 : 0}:${s.totalBet}` : '-'))
        .join(',');
      const potOddsKey = `${activeSnapshot.roomId}_r${activeSnapshot.round}_p${activeSnapshot.pot}_${seatSig}`;
      if (lastPotOddsLogRef.current !== potOddsKey) {
        lastPotOddsLogRef.current = potOddsKey;
        const logCards =
          me.cards && me.cards.length === 3
            ? me.cards
            : localHandsRef.current[activeSnapshot.mySeat] || [];
        ZjhDebugLogger.logDynamicPotOddsShift(
          me.seatIndex,
          me.nickname,
          logCards,
          selfDynamicPotOdds
        );
        prevZjhWinRateRef.current = selfDynamicPotOdds.dynamicWinRate;
      }
    }

    if (!selfEquityAnalysis || !me.cards) return;
    const logKey = `${activeSnapshot.roomId}_${activeSnapshot.round}_${activeSnapshot.pot}_${me.seen}`;
    if (lastEquityLogRef.current === logKey) return;
    lastEquityLogRef.current = logKey;

    const activeCount = activeSnapshot.seats.filter(
      (s) => s && (s.status === 'active' || s.status === 'allin'),
    ).length;

    ZjhDebugLogger.logHandEquity(
      me.seatIndex,
      me.nickname,
      me.cards,
      selfEquityAnalysis,
      {
        round: activeSnapshot.round,
        pot: activeSnapshot.pot,
        callCost: activeSnapshot.my.callCost || activeSnapshot.stake,
        activeCount: Math.max(2, activeCount),
        mode: activeSnapshot.mode,
      },
    );
  }, [activeSnapshot, selfEquityAnalysis, selfDynamicPotOdds]);

  // Helper to simulate AI turns & showdown in offline local fallback
  const advanceLocalSimulation = useCallback((updated: ZjhSnapshot) => {
    const seats = updated.seats.map((s) => (s ? { ...s } : null));
    const hands = localHandsRef.current;
    let pot = updated.pot;
    let stakeLevel = updated.stakeLevel;
    let round = updated.round;

    // Simulate 1 round of bot actions
    for (let idx = 1; idx < 5; idx++) {
      const bot = seats[idx];
      if (!bot || bot.status !== 'active') continue;
      const liveCount = seats.filter((s) => s && s.status === 'active').length;
      if (liveCount <= 1) break;

      const botCards = hands[idx];
      if (!bot.seen && Math.random() < 0.35 + round * 0.15) {
        bot.seen = true;
      }
      const cCost = callCost({ baseScore: updated.baseScore, stakeLevel, seen: bot.seen });
      const eq = analyzeZjhDecisionEquity({
        cards: botCards,
        mode: updated.mode,
        activeCount: liveCount,
        pot,
        callCost: cCost,
        compareCost: cCost * 2,
        canCompare: canCompareNow(round, liveCount, updated.mode),
        round,
        stakeLevel,
      });

      if (eq.recommendedAction === 'fold' && liveCount > 2 && Math.random() < 0.65) {
        bot.status = 'folded';
        bot.lastAction = '弃牌';
      } else {
        bot.beans = Math.max(0, bot.beans - cCost);
        bot.totalBet += cCost;
        pot += cCost;
        bot.lastAction = bot.seen ? `跟注 ${cCost}` : `闷 ${cCost}`;
      }
    }

    round += 1;
    const liveSeats = seats.filter((s) => s && s.status === 'active').map((s) => s!.seatIndex);

    // If only 1 player remains or round >= 4 in local sim, settle showdown
    if (liveSeats.length <= 1 || round >= 5 || seats[0]?.status !== 'active') {
      const contenders = seats.map((s, idx) => ({
        seat: idx,
        contribution: s?.totalBet ?? 0,
        folded: !s || s.status === 'folded' || s.status === 'lost',
        allIn: s?.status === 'allin',
        cards: hands[idx] || [],
      }));
      const potRes = resolveShowdown(contenders, updated.mode);
      ZjhDebugLogger.logShowdownResult(updated.roomId, updated.mode, contenders, potRes);

      seats.forEach((s, idx) => {
        if (!s) return;
        const winAmount = potRes.payouts.get(idx) ?? 0;
        s.delta = winAmount - s.totalBet;
        s.beans += winAmount;
        s.isWinner = potRes.winners.includes(idx);
        s.cards = hands[idx];
        s.handLabel = evaluateHand(hands[idx]).label;
      });

      const winSeat = potRes.winners[0] ?? 0;
      return {
        ...updated,
        phase: 'RESULT' as const,
        round,
        pot,
        stakeLevel,
        currentTurnSeat: -1,
        countdown: 6,
        seats,
        message: `${seats[winSeat]?.nickname ?? ''} 赢得底池`,
      };
    }

    const me = seats[0]!;
    const myCtx = { baseScore: updated.baseScore, stakeLevel, seen: me.seen };
    const myCall = callCost(myCtx);
    const myCompare = compareCost(myCtx);
    const targets = liveSeats.filter((i) => i !== 0);

    return {
      ...updated,
      round,
      pot,
      stake: stakeOf(updated.baseScore, stakeLevel),
      stakeLevel,
      currentTurnSeat: 0,
      seats,
      my: {
        canAct: true,
        canLook: !me.seen,
        callCost: myCall,
        raiseOptions: raiseOptions(myCtx),
        compareCost: myCompare,
        canCompare: canCompareNow(round, liveSeats.length, updated.mode) && targets.length > 0,
        compareTargets: targets,
        canAllIn: me.beans < myCall,
        mustAllIn: me.beans < myCall,
      },
    };
  }, []);

  const send = useCallback(
    (payload: ZjhActionPayload) => {
      const selfSeatIdx = activeSnapshot ? Math.max(0, activeSnapshot.mySeat) : 0;

      // Play dedicated spatial audio & voice feedback via WebAudioQueueManager
      if (payload.action === 'look') {
        const myCards =
          localHandsRef.current[0] ||
          (activeSnapshot && activeSnapshot.mySeat >= 0
            ? activeSnapshot.seats[activeSnapshot.mySeat]?.cards
            : null);
        const label = myCards && myCards.length === 3 ? evaluateHand(myCards).label : undefined;
        webAudioQueue.enqueueZjhAction({
          action: 'look',
          seatIndex: selfSeatIdx,
          selfSeatIndex: selfSeatIdx,
          handLabel: label,
          isSelf: true,
        });
      } else if (payload.action === 'call') {
        const isSeen =
          activeSnapshot && activeSnapshot.mySeat >= 0
            ? Boolean(activeSnapshot.seats[activeSnapshot.mySeat]?.seen)
            : false;
        webAudioQueue.enqueueZjhAction({
          action: isSeen ? 'call' : 'blind',
          seatIndex: selfSeatIdx,
          selfSeatIndex: selfSeatIdx,
          isSelf: true,
        });
      } else if (payload.action === 'raise') {
        webAudioQueue.enqueueZjhAction({
          action: 'raise',
          seatIndex: selfSeatIdx,
          selfSeatIndex: selfSeatIdx,
          isSelf: true,
        });
      } else if (payload.action === 'compare') {
        webAudioQueue.enqueueCompareLightning({
          fromSeat: selfSeatIdx,
          toSeat: payload.targetSeat ?? 1,
          selfSeatIndex: selfSeatIdx,
          announceVoice: true,
        });
      } else if (payload.action === 'allin') {
        webAudioQueue.enqueueZjhAction({
          action: 'allin',
          seatIndex: selfSeatIdx,
          selfSeatIndex: selfSeatIdx,
          isSelf: true,
        });
      } else if (payload.action === 'fold') {
        webAudioQueue.enqueueZjhAction({
          action: 'fold',
          seatIndex: selfSeatIdx,
          selfSeatIndex: selfSeatIdx,
          isSelf: true,
        });
      }

      socketClient.emit('c2s_zjh_action', payload);

      // Local fallback state update
      if (!snapshot && localSnapshot) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const seats = prev.seats.map((s) => (s ? { ...s } : null));
          const me = seats[0];
          if (!me) return prev;
          const myCards = localHandsRef.current[0] || [];

          if (payload.action === 'look') {
            me.seen = true;
            me.cards = myCards;
            me.handLabel = evaluateHand(myCards).label;
            me.lastAction = '看牌';
            const myCtx = { baseScore: prev.baseScore, stakeLevel: prev.stakeLevel, seen: true };
            return {
              ...prev,
              seats,
              my: {
                ...prev.my,
                canLook: false,
                callCost: callCost(myCtx),
                raiseOptions: raiseOptions(myCtx),
                compareCost: compareCost(myCtx),
              },
            };
          }

          if (payload.action === 'fold') {
            me.status = 'folded';
            me.lastAction = '弃牌';
            return advanceLocalSimulation({ ...prev, seats });
          }

          if (payload.action === 'call') {
            const cost = prev.my.callCost;
            me.beans = Math.max(0, me.beans - cost);
            me.totalBet += cost;
            me.lastAction = me.seen ? `跟注 ${cost}` : `闷 ${cost}`;
            return advanceLocalSimulation({ ...prev, pot: prev.pot + cost, seats });
          }

          if (payload.action === 'raise' && payload.level !== undefined) {
            const opt = prev.my.raiseOptions.find((o) => o.level === payload.level);
            if (!opt) return prev;
            me.beans = Math.max(0, me.beans - opt.cost);
            me.totalBet += opt.cost;
            me.lastAction = `加注 ${opt.cost}`;
            return advanceLocalSimulation({
              ...prev,
              pot: prev.pot + opt.cost,
              stakeLevel: opt.level,
              seats,
            });
          }

          if (payload.action === 'compare' && payload.targetSeat !== undefined) {
            const targetIdx = payload.targetSeat;
            const target = seats[targetIdx];
            if (!target) return prev;
            const cost = prev.my.compareCost;
            me.beans = Math.max(0, me.beans - cost);
            me.totalBet += cost;
            const cmp = compareHands(
              myCards,
              localHandsRef.current[targetIdx] || [],
              prev.mode,
            );
            const loserIdx = cmp === 1 ? targetIdx : 0;
            seats[loserIdx]!.status = 'lost';
            seats[loserIdx]!.lastAction = '比牌输';
            ZjhDebugLogger.logCompareDuel(
              0,
              me.nickname,
              myCards,
              targetIdx,
              target.nickname,
              localHandsRef.current[targetIdx] || [],
              loserIdx,
              prev.mode,
            );
            return advanceLocalSimulation({
              ...prev,
              pot: prev.pot + cost,
              seats,
              lastCompare: {
                id: Date.now(),
                fromSeat: 0,
                toSeat: targetIdx,
                loserSeat: loserIdx,
                tie: cmp === 0,
              },
            });
          }

          if (payload.action === 'allin') {
            const all = me.beans;
            me.beans = 0;
            me.totalBet += all;
            me.status = 'allin';
            me.lastAction = `全押 ${all}`;
            return advanceLocalSimulation({ ...prev, pot: prev.pot + all, seats, round: 99 });
          }

          return prev;
        });
      }
    },
    [snapshot, localSnapshot, activeSnapshot, advanceLocalSimulation],
  );

  const handleToggleCompare = useCallback(() => {
    if (!activeSnapshot) return;
    const targets = activeSnapshot.my.compareTargets;
    if (targets.length === 1) {
      send({ action: 'compare', targetSeat: targets[0] });
      return;
    }
    setComparing((v) => !v);
  }, [activeSnapshot, send]);

  const toggleSound = () => {
    soundEngine.toggle();
    setSoundOn(soundEngine.isEnabled());
  };

  const mySeat = activeSnapshot ? Math.max(0, activeSnapshot.mySeat) : 0;
  const slots = useMemo(() => {
    if (!activeSnapshot) return [];
    return activeSnapshot.seats.map((seat, index) => ({
      seat,
      index,
      slot: (index - mySeat + activeSnapshot.seats.length) % activeSnapshot.seats.length,
    }));
  }, [activeSnapshot, mySeat]);

  const modeLabel = activeSnapshot ? MODE_LABELS[activeSnapshot.mode] || '经典闷抓' : '经典闷抓';

  // React to Quick Switch Table from SharedTableHudOverlay
  useEffect(() => {
    if (controlState.switchTableSeq === prevSwitchSeqRef.current) return;
    prevSwitchSeqRef.current = controlState.switchTableSeq;
    setComparing(false);
    if (!snapshot) {
      startLocalZjhRound();
    }
  }, [controlState.switchTableSeq, snapshot, startLocalZjhRound]);

  // Synchronize server-side timeout trusteeship with GameControlHub
  useEffect(() => {
    if (!activeSnapshot) return;
    if (activeSnapshot.myTrusteeship && !controlState.isTrusteeship) {
      gameControlHub.setTrusteeship(true, { silent: true });
    }
  }, [activeSnapshot, controlState.isTrusteeship]);

  // Pot-Odds & Equity Smart Trusteeship + Auto-Next-Round Engine
  useEffect(() => {
    if (!activeSnapshot) return;

    if (
      activeSnapshot.phase === 'RESULT' &&
      (controlState.autoNextRound || controlState.isTrusteeship)
    ) {
      const nextTimer = window.setTimeout(() => {
        socketClient.emit('c2s_zjh_ready', {});
        if (!snapshot && localSnapshot) {
          const currentBeans = localSnapshot.seats.map((s) => s?.beans ?? 100000);
          startLocalZjhRound(currentBeans);
        }
      }, gameControlHub.scaleDelay(2500));
      return () => window.clearTimeout(nextTimer);
    }

    if (!controlState.isTrusteeship) return;
    if (
      activeSnapshot.phase !== 'BETTING' ||
      activeSnapshot.currentTurnSeat !== activeSnapshot.mySeat ||
      !activeSnapshot.my.canAct
    ) {
      return;
    }

    const delayMs = gameControlHub.scaleDelay(680);
    const timer = window.setTimeout(() => {
      const me = activeSnapshot.seats[activeSnapshot.mySeat];
      if (!me) return;

      if (!me.seen && activeSnapshot.round >= 2 && activeSnapshot.my.canLook) {
        send({ action: 'look' });
        return;
      }

      const rec = selfEquityAnalysis?.recommendedAction;
      if (rec === 'fold' && activeSnapshot.round >= 2) {
        send({ action: 'fold' });
      } else if (
        rec === 'compare' &&
        activeSnapshot.my.canCompare &&
        activeSnapshot.my.compareTargets.length > 0
      ) {
        send({ action: 'compare', targetSeat: activeSnapshot.my.compareTargets[0] });
      } else if (activeSnapshot.my.mustAllIn) {
        send({ action: 'allin' });
      } else {
        send({ action: 'call' });
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    activeSnapshot,
    snapshot,
    localSnapshot,
    controlState.isTrusteeship,
    controlState.autoNextRound,
    controlState.paceSpeed,
    selfEquityAnalysis,
    send,
    startLocalZjhRound,
  ]);

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
            {/* Luxury Emerald Felt Table (No Ghost Watermark) */}
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

            {/* Header */}
            <div className="absolute left-6 right-6 top-3 z-30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    socketClient.emit('c2s_leave_room');
                    onLeaveRoom();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md hover:border-amber-300 hover:bg-black/80 active:scale-95 cursor-pointer"
                  aria-label="退出房间"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex items-center gap-2 rounded-lg border border-amber-300/30 bg-black/60 px-3.5 py-1.5 text-xs font-bold text-amber-100 backdrop-blur-xs">
                  <span className="text-amber-300">{modeLabel}</span>
                  <span aria-hidden="true" className="text-white/30">·</span>
                  <span className="font-mono text-amber-200 tabular-nums">
                    底注 {activeSnapshot ? formatZjhBeans(activeSnapshot.baseScore) : '-'}
                  </span>
                  {activeSnapshot?.phase === 'BETTING' && (
                    <>
                      <span aria-hidden="true" className="text-white/30">·</span>
                      <span className="font-mono text-white/85 tabular-nums">
                        第 {activeSnapshot.round}/{activeSnapshot.maxRounds} 轮
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

            {!activeSnapshot && (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-sm font-bold text-white/70">
                正在入座准备牌局
              </div>
            )}

            {/* Center Pot & Single Stake Plaque */}
            {activeSnapshot && (
              <div className="absolute left-1/2 top-[265px] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5">
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-300/45 bg-[#0c2618]/90 px-5 py-1.5 shadow-[0_0_24px_rgba(251,191,36,0.2)]">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-amber-100 bg-gradient-to-b from-amber-300 to-amber-600" />
                  <span className="text-xs font-bold text-amber-200/90">总底池</span>
                  <span className="font-mono text-xl font-black text-amber-300 tabular-nums">
                    {formatZjhBeans(activeSnapshot.pot)}
                  </span>
                </div>
                {activeSnapshot.phase === 'BETTING' && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-100/85">
                    <span>当前暗注基准 <b className="font-mono text-amber-300 tabular-nums">{formatZjhBeans(activeSnapshot.stake)}</b></span>
                    {activeSnapshot.message && (
                      <>
                        <span aria-hidden="true" className="text-white/30">·</span>
                        <span className="text-white/80">{activeSnapshot.message}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Seats */}
            {activeSnapshot &&
              slots.map(({ seat, index, slot }) => {
                const isSelf = activeSnapshot.mySeat === index;
                const selectable = comparing && activeSnapshot.my.compareTargets.includes(index);
                return (
                  <div key={index} className="absolute z-20" style={slotStyle(slot, virtualWidth)}>
                    <ZjhSeat
                      seat={seat}
                      isSelf={isSelf}
                      isDealer={activeSnapshot.dealerSeat === index}
                      isTurn={activeSnapshot.currentTurnSeat === index}
                      turnSecondsLeft={activeSnapshot.turnSecondsLeft}
                      turnSecondsTotal={ZJH_TURN_SECONDS}
                      selectable={selectable}
                      onSelect={() => {
                        setComparing(false);
                        send({ action: 'compare', targetSeat: index });
                      }}
                      showDelta={activeSnapshot.phase === 'RESULT'}
                    />
                  </div>
                );
              })}

            {/* Lightning Compare Duel Banner */}
            {vsBanner && (
              <div className="pointer-events-none absolute left-1/2 top-[326px] z-40 -translate-x-1/2 whitespace-nowrap rounded-2xl border-2 border-fuchsia-300/75 bg-gradient-to-r from-[#2e0836]/95 via-[#4a0e4e]/95 to-[#2e0836]/95 px-7 py-2.5 text-base sm:text-lg font-black text-fuchsia-100 shadow-[0_0_32px_rgba(217,70,239,0.65)] animate-in zoom-in-90 duration-150">
                {vsBanner.text}
              </div>
            )}

            {/* Toast */}
            {toast && (
              <div className="pointer-events-none absolute left-1/2 top-[110px] z-50 -translate-x-1/2 rounded-lg bg-red-700/90 px-5 py-1.5 text-sm font-bold shadow-lg">
                {toast}
              </div>
            )}

            {/* Trusteeship: the server is playing for you */}
            {activeSnapshot?.myTrusteeship && (
              <div className="absolute inset-x-0 bottom-0 z-40 flex h-[150px] items-end justify-center bg-gradient-to-t from-black/85 to-transparent pb-5">
                <button
                  type="button"
                  onClick={() => {
                    gameControlHub.setTrusteeship(false);
                    socketClient.emit('c2s_zjh_ready', {});
                  }}
                  className="rounded-xl border border-amber-200/70 bg-gradient-to-b from-amber-400 to-amber-700 px-10 py-3 text-base font-black text-black shadow-xl transition active:scale-95 hover:brightness-110 cursor-pointer"
                >
                  托管中 · 点击取消托管
                </button>
              </div>
            )}

            {/* Footer Action Dock */}
            {activeSnapshot && !activeSnapshot.myTrusteeship && (
              <div className="absolute bottom-[12px] left-1/2 z-30 -translate-x-1/2">
                <ZjhActionBar
                  snapshot={activeSnapshot}
                  comparing={comparing}
                  equityAnalysis={selfEquityAnalysis}
                  dynamicPotOdds={selfDynamicPotOdds}
                  onLook={() => send({ action: 'look' })}
                  onFold={() => send({ action: 'fold' })}
                  onCall={() => send({ action: 'call' })}
                  onRaise={(level) => send({ action: 'raise', level })}
                  onToggleCompare={handleToggleCompare}
                  onAllIn={() => send({ action: 'allin' })}
                  onNextRound={
                    !snapshot && localSnapshot
                      ? () => {
                          const currentBeans = localSnapshot.seats.map((s) => s?.beans ?? 100000);
                          startLocalZjhRound(currentBeans);
                        }
                      : undefined
                  }
                />
              </div>
            )}

            {/* Rules Modal */}
            {showRules && (
              <CommercialModalShell
                title="炸金花 · 规则与底池结算说明"
                subtitle="闷牌暗注与看牌明注双倍比牌博弈规则"
                icon={<HelpCircle className="h-5 w-5" />}
                size="md"
                portalMode="stage"
                onClose={() => setShowRules(false)}
              >
                <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-[#334155]">
                  {RULES.map(([title, body]) => (
                    <div
                      key={title}
                      className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs"
                    >
                      <strong className="text-[#B45309]">{title}：</strong>
                      <span>{body}</span>
                    </div>
                  ))}
                </div>
              </CommercialModalShell>
            )}
          </div>
        </div>
      )}
    </AutoLandscapeContainer>
  );
};

export default ZhajinhuaTableView;
