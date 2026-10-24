import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  HelpCircle,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ViewportMetrics } from '../../App';
import { soundEngine } from '../../shared/audio/SoundEngine';
import {
  gameControlHub,
  useGameControlState,
} from '../../shared/control/GameControlHub';
import { roomCardSessionHub } from '../../shared/control/RoomCardSessionHub';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { effectCoordinator, EffectPriority } from '../../shared/EffectCoordinator';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import { CommercialModalShell } from '../../shared/ui/CommercialModalShell';
import {
  LaoYanCaiCard,
  LaoYanCaiDecision,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandResult,
  LaoYanCaiPhase,
  LaoYanCaiPlayerInfo,
  LaoYanCaiPlayMode,
  LaoYanCaiTableSnapshot,
} from './types';
import {
  analyzeLaoYanCaiDrawOdds,
  compareLaoYanCaiHands,
  createStandardLaoYanCaiDeck,
  evaluateLaoYanCaiHand,
  shuffleLaoYanCaiDeck,
} from './algorithms/LaoYanCaiLogic';
import { LaoYanCaiDebugLogger } from './utils/LaoYanCaiDebugLogger';
import { LaoYanCaiPlayerSeat } from './components/LaoYanCaiPlayerSeat';
import { LaoYanCaiCardView } from './components/LaoYanCaiCardView';
import { LaoYanCaiActionBar } from './components/LaoYanCaiActionBar';
import { LaoYanCaiSettlementModal } from './components/LaoYanCaiSettlementModal';

export interface LaoYanCaiTableViewProps {
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom: () => void;
}

interface SpecialHandCeremonyItem {
  id: string;
  seatIndex: number;
  nickname: string;
  isDealer: boolean;
  category: 'BAOZI' | 'SANGONG' | 'STRAIGHT_FLUSH';
  handName: string;
  badgeText: string;
  multiplier: number;
  cards: LaoYanCaiCard[];
}

const MODE_LABELS: Record<LaoYanCaiPlayMode, string> = {
  kunming: '昆明抢庄捞腌菜',
  yuxi: '玉溪坐庄捞腌菜',
  crazy: '血战高倍捞腌菜',
};

const PHASE_BANNERS: Record<LaoYanCaiPhase, string> = {
  WAITING: '等待开局',
  CALL_BANKER: '请抢庄',
  BETTING: '请闲家下注',
  DEAL_2: '发首轮底牌',
  BANKER_NATURAL: '庄家天牌判定',
  PLAYER_DECISION: '请闲家抉择 (炸开 / 捞牌 / 不捞)',
  BANKER_DECISION: '请庄家抉择 (捞牌 / 不捞)',
  SHOWDOWN: '亮牌比大小',
  ROUND_RESULT: '本局结算',
};

export const LaoYanCaiTableView: React.FC<LaoYanCaiTableViewProps> = ({
  isFullscreen,
  onToggleFullscreen,
  onLeaveRoom,
}) => {
  const controlState = useGameControlState();
  const [snapshot, setSnapshot] = useState<LaoYanCaiTableSnapshot | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundEngine.isEnabled()
  );
  const [showRuleModal, setShowRuleModal] = useState<boolean>(false);

  // Special Hand Ceremony Queue State (for 豹子 & 三公 visual banner + synced audio queue)
  const [activeCeremony, setActiveCeremony] =
    useState<SpecialHandCeremonyItem | null>(null);
  const announcedRoundKeyRef = useRef<string>('');
  const selfDrawAnnouncedRef = useRef<boolean>(false);
  const ceremonyTimersRef = useRef<number[]>([]);

  // Offline local simulation state (only used if server snapshot doesn't arrive)
  const [localSnapshot, setLocalSnapshot] = useState<LaoYanCaiTableSnapshot | null>(
    null
  );
  const localDeckRef = useRef<LaoYanCaiCard[]>([]);
  const localFullHandsRef = useRef<LaoYanCaiCard[][]>([]);
  const prevSwitchSeqRef = useRef<number>(controlState.switchTableSeq);

  const clearCeremonyTimers = useCallback(() => {
    for (const t of ceremonyTimersRef.current) {
      window.clearTimeout(t);
    }
    ceremonyTimersRef.current = [];
    effectCoordinator.clearScene('laoyancai');
  }, []);

  useEffect(() => {
    soundEngine.startBgm('table');

    const unsub = socketClient.on(
      's2c_lyc_snapshot',
      (data: LaoYanCaiTableSnapshot) => {
        setSnapshot(data);
      }
    );

    socketClient.emit('c2s_request_snapshot');

    return () => {
      unsub();
      clearCeremonyTimers();
      soundEngine.clearLaoYanCaiAudioQueue();
    };
  }, [clearCeremonyTimers]);

  // Auto-ready if server snapshot arrives in WAITING with self unready
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'WAITING') return;
    const self = snapshot.seats.find((s) => s && !s.isBot);
    if (self && !self.ready) {
      socketClient.emit('c2s_lyc_ready');
    }
  }, [snapshot]);

  // Local fallback round initializer
  const startLocalSimulatedRound = useCallback(
    (existingBeans?: number[]) => {
      clearCeremonyTimers();
      setActiveCeremony(null);
      selfDrawAnnouncedRef.current = false;

      const deck = shuffleLaoYanCaiDeck(createStandardLaoYanCaiDeck());
      const hands: LaoYanCaiCard[][] = [
        [deck.pop()!, deck.pop()!],
        [deck.pop()!, deck.pop()!],
        [deck.pop()!, deck.pop()!],
        [deck.pop()!, deck.pop()!],
        [deck.pop()!, deck.pop()!],
      ];
      localDeckRef.current = deck;
      localFullHandsRef.current = hands;

      const maskHand = (idx: number): LaoYanCaiCard[] => [
        { id: -200 - idx * 10 - 1, suit: 'spade', rank: 0, point: 0 },
        { id: -200 - idx * 10 - 2, suit: 'spade', rank: 0, point: 0 },
      ];

      const selfEval = evaluateLaoYanCaiHand(hands[0], 'kunming', false);
      const selfOdds = analyzeLaoYanCaiDrawOdds(hands[0], 'kunming', deck);

      LaoYanCaiDebugLogger.logInitialDealAndOdds(
        0,
        '滇南牌王',
        false,
        hands[0],
        selfEval,
        selfOdds,
        'kunming'
      );

      const mockSeats: LaoYanCaiPlayerInfo[] = [
        {
          playerId: 'self_player',
          nickname: '滇南牌王',
          avatarId: 'kashen',
          seatIndex: 0,
          beans: existingBeans?.[0] ?? 128000,
          ready: true,
          isBot: false,
          disconnected: false,
          isDealer: false,
          callMultiplier: -1,
          betMultiplier: 0,
          decision: 'PENDING',
          cards: hands[0],
          hasRevealed: false,
          handResult: selfEval,
          drawOdds: selfOdds,
        },
        {
          playerId: 'bot_1',
          nickname: '玉溪·金花',
          avatarId: 'beier',
          seatIndex: 1,
          beans: existingBeans?.[1] ?? 96000,
          ready: true,
          isBot: true,
          disconnected: false,
          isDealer: false,
          callMultiplier: 1,
          betMultiplier: 0,
          decision: 'PENDING',
          cards: maskHand(1),
          hasRevealed: false,
        },
        {
          playerId: 'bot_2',
          nickname: '翠湖·柳先生',
          avatarId: 'scholar',
          seatIndex: 2,
          beans: existingBeans?.[2] ?? 165000,
          ready: true,
          isBot: true,
          disconnected: false,
          isDealer: false,
          callMultiplier: 2,
          betMultiplier: 0,
          decision: 'PENDING',
          cards: maskHand(2),
          hasRevealed: false,
        },
        {
          playerId: 'bot_3',
          nickname: '苍山·金掌柜',
          avatarId: 'noble',
          seatIndex: 3,
          beans: existingBeans?.[3] ?? 240000,
          ready: true,
          isBot: true,
          disconnected: false,
          isDealer: false,
          callMultiplier: 2,
          betMultiplier: 0,
          decision: 'PENDING',
          cards: maskHand(3),
          hasRevealed: false,
        },
        {
          playerId: 'bot_4',
          nickname: '抚仙·剑客',
          avatarId: 'warrior',
          seatIndex: 4,
          beans: existingBeans?.[4] ?? 88000,
          ready: true,
          isBot: true,
          disconnected: false,
          isDealer: false,
          callMultiplier: 0,
          betMultiplier: 0,
          decision: 'PENDING',
          cards: maskHand(4),
          hasRevealed: false,
        },
      ];

      const activeSessionConfig = roomCardSessionHub.getStore().activeSession?.config;
      setLocalSnapshot({
        roomId: activeSessionConfig?.roomId || '100001',
        baseScore: activeSessionConfig?.baseScore || 100,
        playMode: 'kunming',
        phase: 'CALL_BANKER',
        countdown: 6,
        dealerSeatId: 3,
        remainingDeckCount: deck.length,
        bankerZhaKaiAll: false,
        seats: mockSeats,
      });
    },
    [clearCeremonyTimers]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!snapshot) {
        startLocalSimulatedRound();
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [snapshot, startLocalSimulatedRound]);

  const activeSnapshot = snapshot || localSnapshot;

  const selfPlayer = useMemo(() => {
    if (!activeSnapshot) return null;
    return (
      activeSnapshot.seats.find((s) => s && !s.isBot) ??
      activeSnapshot.seats[0] ??
      null
    );
  }, [activeSnapshot]);

  const selfHandResult = useMemo<LaoYanCaiHandResult | undefined>(() => {
    if (!selfPlayer) return undefined;
    if (selfPlayer.handResult) return selfPlayer.handResult;
    const valid = selfPlayer.cards.filter((c) => c.rank > 0);
    if (valid.length < 2) return undefined;
    return evaluateLaoYanCaiHand(
      valid,
      activeSnapshot?.playMode || 'kunming',
      selfPlayer.decision === 'ZHAKAI'
    );
  }, [selfPlayer, activeSnapshot?.playMode]);

  const selfDrawOdds = useMemo<LaoYanCaiDrawOdds | undefined>(() => {
    if (!selfPlayer) return undefined;
    if (selfPlayer.drawOdds) return selfPlayer.drawOdds;
    const valid = selfPlayer.cards.filter((c) => c.rank > 0);
    if (valid.length !== 2) return undefined;
    return analyzeLaoYanCaiDrawOdds(valid, activeSnapshot?.playMode || 'kunming');
  }, [selfPlayer, activeSnapshot?.playMode]);

  // Reset ceremony state when a new round starts
  useEffect(() => {
    if (
      activeSnapshot?.phase === 'CALL_BANKER' ||
      activeSnapshot?.phase === 'BETTING' ||
      activeSnapshot?.phase === 'DEAL_2'
    ) {
      clearCeremonyTimers();
      setActiveCeremony(null);
      selfDrawAnnouncedRef.current = false;
    }
  }, [activeSnapshot?.phase, clearCeremonyTimers]);

  // Immediate ceremony feedback when self player draws a 3rd card and hits 豹子 or 三公
  useEffect(() => {
    if (
      !selfPlayer ||
      !selfHandResult ||
      selfDrawAnnouncedRef.current ||
      activeSnapshot?.phase === 'SHOWDOWN' ||
      activeSnapshot?.phase === 'ROUND_RESULT'
    ) {
      return;
    }
    if (
      selfPlayer.decision === 'LAO' &&
      selfHandResult.cardCount === 3 &&
      (selfHandResult.isBaozi || selfHandResult.isSanGong)
    ) {
      selfDrawAnnouncedRef.current = true;
      const category = selfHandResult.isBaozi ? 'BAOZI' : 'SANGONG';
      setActiveCeremony({
        id: `self_draw_${Date.now()}`,
        seatIndex: selfPlayer.seatIndex,
        nickname: selfPlayer.nickname,
        isDealer: selfPlayer.isDealer,
        category,
        handName: selfHandResult.name,
        badgeText: selfHandResult.badgeText,
        multiplier: selfHandResult.multiplier,
        cards: selfHandResult.cards,
      });

      if (category === 'BAOZI') {
        soundEngine.playLaoYanCaiBaoziSfx(selfPlayer.seatIndex);
        soundEngine.speak(
          `${selfHandResult.name}，${selfHandResult.multiplier}倍暴击！`,
          'epic'
        );
      } else {
        soundEngine.playLaoYanCaiSanGongSfx(selfPlayer.seatIndex);
        soundEngine.speak(
          `三公驾到，${selfHandResult.multiplier}倍翻番！`,
          'epic'
        );
      }

      const hideTimer = window.setTimeout(() => {
        setActiveCeremony(null);
      }, 2200);
      ceremonyTimersRef.current.push(hideTimer);
    }
  }, [selfPlayer, selfHandResult, activeSnapshot?.phase]);

  // Showdown & Settlement Sequential Ceremony Queue (Audio + Visual Highlight Banner)
  useEffect(() => {
    if (!activeSnapshot) return;
    const isShowdownOrResult =
      activeSnapshot.phase === 'SHOWDOWN' ||
      activeSnapshot.phase === 'ROUND_RESULT';
    if (!isShowdownOrResult) return;

    // Build a deterministic signature for this round's showdown
    const roundSig = activeSnapshot.seats
      .map((s) =>
        s
          ? `${s.seatIndex}:${s.cards.map((c) => c.id).join(',')}:${s.decision}`
          : 'empty'
      )
      .join('|');

    if (!roundSig || announcedRoundKeyRef.current === roundSig) return;
    announcedRoundKeyRef.current = roundSig;

    clearCeremonyTimers();

    // Collect all special hands for audio queue and visual ceremony queue
    const audioQueueItems: Array<{
      category: string;
      handName: string;
      multiplier: number;
      nickname?: string;
      isWinner?: boolean;
      seatIndex?: number;
    }> = [];

    const visualCeremonies: SpecialHandCeremonyItem[] = [];

    activeSnapshot.seats.forEach((s) => {
      if (!s) return;
      const res =
        s.handResult ??
        evaluateLaoYanCaiHand(
          s.cards,
          activeSnapshot.playMode,
          s.decision === 'ZHAKAI'
        );
      if (!res || res.cardCount < 2) return;

      if (
        res.isBaozi ||
        res.isSanGong ||
        res.isStraightFlush ||
        res.isZhaKai ||
        res.category === 'SANYAN'
      ) {
        audioQueueItems.push({
          category: res.category,
          handName: res.name,
          multiplier: res.multiplier,
          nickname: s.nickname,
          isWinner: (s.scoreDelta ?? 0) > 0,
          seatIndex: s.seatIndex,
        });
      }

      if (res.isBaozi || res.isSanGong || res.isStraightFlush) {
        visualCeremonies.push({
          id: `${s.seatIndex}_${res.category}`,
          seatIndex: s.seatIndex,
          nickname: s.nickname,
          isDealer: s.isDealer,
          category: res.isBaozi
            ? 'BAOZI'
            : res.isSanGong
            ? 'SANGONG'
            : 'STRAIGHT_FLUSH',
          handName: res.name,
          badgeText: res.badgeText,
          multiplier: res.multiplier,
          cards: res.cards,
        });
      }
    });

    // 1. Trigger prioritized audio & voice queue in SoundEngine
    soundEngine.playLaoYanCaiShowdownQueue(audioQueueItems);

    // 2. Schedule synchronized visual ceremony banners for 豹子 / 三公 / 同花顺
    const priorityMap: Record<string, number> = {
      BAOZI: 100,
      STRAIGHT_FLUSH: 85,
      SANGONG: 75,
    };
    visualCeremonies.sort(
      (a, b) => (priorityMap[b.category] || 0) - (priorityMap[a.category] || 0)
    );

    if (visualCeremonies.length > 0) {
      visualCeremonies.slice(0, 2).forEach((item) => {
        const priority =
          item.category === 'BAOZI'
            ? EffectPriority.ULTIMATE
            : EffectPriority.CRITICAL;
        effectCoordinator.enqueue({
          sceneId: 'laoyancai',
          type: `lyc_${item.category.toLowerCase()}`,
          label: item.handName,
          priority,
          useGlobalMask: false,
          durationMs: 1120,
          preemptLowerPriority: false,
          onStart: () => {
            setActiveCeremony(item);
            return () => {
              setActiveCeremony((prev) => (prev?.id === item.id ? null : prev));
            };
          },
        });
      });
    }
  }, [activeSnapshot, clearCeremonyTimers]);

  // Helper to settle a local simulated round
  const settleLocalSimulatedRound = useCallback(
    (
      prev: LaoYanCaiTableSnapshot,
      hands: LaoYanCaiCard[][],
      decisions: LaoYanCaiDecision[],
      bankerZhaKaiAll: boolean
    ): LaoYanCaiTableSnapshot => {
      const dealerIdx = prev.dealerSeatId;
      const results = prev.seats.map((s, idx) =>
        s
          ? evaluateLaoYanCaiHand(
              hands[idx],
              prev.playMode,
              decisions[idx] === 'ZHAKAI'
            )
          : undefined
      );
      const dealerRes = results[dealerIdx]!;
      const dealerCall = Math.max(
        1,
        prev.seats[dealerIdx]?.callMultiplier || 1
      );
      const deltas = [0, 0, 0, 0, 0];
      let dealerNet = 0;

      prev.seats.forEach((s, idx) => {
        if (!s || idx === dealerIdx || !results[idx]) return;
        const bet = s.betMultiplier || 10;
        const cmp = compareLaoYanCaiHands(results[idx]!, dealerRes);
        if (cmp > 0) {
          const win = prev.baseScore * dealerCall * bet * results[idx]!.multiplier;
          deltas[idx] = win;
          dealerNet -= win;
        } else {
          const loss = prev.baseScore * dealerCall * bet * dealerRes.multiplier;
          deltas[idx] = -loss;
          dealerNet += loss;
        }
      });
      deltas[dealerIdx] = dealerNet;

      const settledSeats = prev.seats.map((s, idx) => {
        if (!s) return null;
        return {
          ...s,
          beans: Math.max(0, s.beans + deltas[idx]),
          decision: decisions[idx],
          cards: hands[idx],
          hasRevealed: true,
          handResult: results[idx],
          scoreDelta: deltas[idx],
        };
      });

      const settlement = {
        baseScore: prev.baseScore,
        playMode: prev.playMode,
        dealerSeatIndex: dealerIdx,
        bankerZhaKaiAll,
        players: settledSeats.filter(Boolean).map((s) => ({
          seatIndex: s!.seatIndex,
          playerId: s!.playerId,
          nickname: s!.nickname,
          avatarId: s!.avatarId,
          isDealer: s!.seatIndex === dealerIdx,
          callMultiplier: s!.callMultiplier,
          betMultiplier: s!.betMultiplier,
          decision: s!.decision,
          cards: s!.cards,
          handName: s!.handResult!.name,
          badgeText: s!.handResult!.badgeText,
          points: s!.handResult!.points,
          multiplier: s!.handResult!.multiplier,
          scoreDelta: s!.scoreDelta || 0,
          balance: s!.beans,
          isWinner: (s!.scoreDelta || 0) > 0,
        })),
      };

      LaoYanCaiDebugLogger.logRoundSettlement(
        prev.roomId,
        prev.playMode,
        dealerIdx,
        settlement
      );

      return {
        ...prev,
        phase: 'ROUND_RESULT',
        countdown: 6,
        bankerZhaKaiAll,
        seats: settledSeats,
        settlement,
      };
    },
    []
  );

  // Client Actions
  const handleCallBanker = useCallback(
    (multiplier: number) => {
      soundEngine.playNiuniuCall();
      hapticEngine.tap();
      socketClient.emit('c2s_lyc_call_banker', { callMultiplier: multiplier });

      if (!snapshot && localSnapshot && selfPlayer) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const newSeats = prev.seats.map((s) => (s ? { ...s } : null));
          newSeats[0]!.callMultiplier = multiplier;
          const chosenDealer = multiplier >= 2 ? 0 : 3;
          newSeats.forEach((s, idx) => {
            if (!s) return;
            s.isDealer = idx === chosenDealer;
            if (s.isBot && idx !== chosenDealer) {
              s.betMultiplier = 10;
            }
          });
          if (chosenDealer === 0) {
            const bEval = evaluateLaoYanCaiHand(
              localFullHandsRef.current[0],
              prev.playMode,
              false
            );
            return {
              ...prev,
              phase: bEval.canZhaKai ? 'BANKER_NATURAL' : 'BANKER_DECISION',
              countdown: 7,
              dealerSeatId: 0,
              seats: newSeats,
            };
          }
          return {
            ...prev,
            phase: 'BETTING',
            countdown: 6,
            dealerSeatId: chosenDealer,
            seats: newSeats,
          };
        });
      }
    },
    [snapshot, localSnapshot, selfPlayer]
  );

  const handleBet = useCallback(
    (multiplier: number) => {
      soundEngine.playNiuniuChip();
      hapticEngine.playCard();
      socketClient.emit('c2s_lyc_bet', { betMultiplier: multiplier });

      if (!snapshot && localSnapshot && selfPlayer) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const newSeats = prev.seats.map((s) => (s ? { ...s } : null));
          newSeats[0]!.betMultiplier = multiplier;
          return {
            ...prev,
            phase: 'PLAYER_DECISION',
            countdown: 8,
            seats: newSeats,
          };
        });
      }
    },
    [snapshot, localSnapshot, selfPlayer]
  );

  const handleBankerNatural = useCallback(
    (zhaKai: boolean) => {
      soundEngine.playCardPlace(true);
      hapticEngine.playCard();
      if (zhaKai) {
        soundEngine.speak('庄家天牌炸开', 'epic');
      }
      socketClient.emit('c2s_lyc_banker_natural', { zhaKai });

      if (!snapshot && localSnapshot) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          if (zhaKai) {
            const decs: LaoYanCaiDecision[] = [
              'ZHAKAI',
              'BULAO',
              'BULAO',
              'BULAO',
              'BULAO',
            ];
            return settleLocalSimulatedRound(
              prev,
              localFullHandsRef.current,
              decs,
              true
            );
          }
          return {
            ...prev,
            phase: 'BANKER_DECISION',
            countdown: 7,
          };
        });
      }
    },
    [snapshot, localSnapshot, settleLocalSimulatedRound]
  );

  const handlePlayerDecision = useCallback(
    (decision: 'ZHAKAI' | 'LAO' | 'BULAO') => {
      soundEngine.playCardPlace(true);
      hapticEngine.playCard();
      if (decision === 'ZHAKAI') {
        soundEngine.speak('炸开', 'epic');
      } else if (decision === 'LAO') {
        soundEngine.speak('捞腌菜', 'high');
      } else {
        soundEngine.speak('不捞', 'normal');
      }

      socketClient.emit('c2s_lyc_player_decision', { decision });

      if (!snapshot && localSnapshot) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const hands = localFullHandsRef.current.map((h) => [...h]);
          const deck = localDeckRef.current;
          const decs: LaoYanCaiDecision[] = [
            decision,
            'LAO',
            'BULAO',
            'BULAO',
            'LAO',
          ];
          if (decision === 'LAO' && deck.length > 0) {
            hands[0].push(deck.pop()!);
          }
          for (let i = 1; i < 5; i++) {
            const e = evaluateLaoYanCaiHand(hands[i], prev.playMode, false);
            if (e.canZhaKai) {
              decs[i] = 'ZHAKAI';
            } else if (e.points <= 4 && deck.length > 0) {
              decs[i] = 'LAO';
              hands[i].push(deck.pop()!);
            } else {
              decs[i] = 'BULAO';
            }
          }
          localFullHandsRef.current = hands;
          return settleLocalSimulatedRound(prev, hands, decs, false);
        });
      }
    },
    [snapshot, localSnapshot, settleLocalSimulatedRound]
  );

  const handleBankerDecision = useCallback(
    (decision: 'LAO' | 'BULAO') => {
      soundEngine.playCardPlace(true);
      hapticEngine.playCard();
      soundEngine.speak(decision === 'LAO' ? '庄家捞牌' : '庄家开牌', 'high');
      socketClient.emit('c2s_lyc_banker_decision', { decision });

      if (!snapshot && localSnapshot) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const hands = localFullHandsRef.current.map((h) => [...h]);
          const deck = localDeckRef.current;
          const decs: LaoYanCaiDecision[] = [
            decision,
            'LAO',
            'BULAO',
            'LAO',
            'BULAO',
          ];
          if (decision === 'LAO' && deck.length > 0) {
            hands[0].push(deck.pop()!);
          }
          for (let i = 1; i < 5; i++) {
            const e = evaluateLaoYanCaiHand(hands[i], prev.playMode, false);
            if (e.points <= 4 && deck.length > 0) {
              decs[i] = 'LAO';
              hands[i].push(deck.pop()!);
            } else {
              decs[i] = 'BULAO';
            }
          }
          localFullHandsRef.current = hands;
          return settleLocalSimulatedRound(prev, hands, decs, false);
        });
      }
    },
    [snapshot, localSnapshot, settleLocalSimulatedRound]
  );

  const handleReady = useCallback(() => {
    soundEngine.playTap(720);
    hapticEngine.tap();
    socketClient.emit('c2s_lyc_ready');

    if (!snapshot && localSnapshot) {
      const beans = localSnapshot.seats.map((s) => s?.beans ?? 100000);
      startLocalSimulatedRound(beans);
    }
  }, [snapshot, localSnapshot, startLocalSimulatedRound]);

  const seats = activeSnapshot?.seats ?? [null, null, null, null, null];
  const phase = activeSnapshot?.phase ?? 'WAITING';
  const playMode: LaoYanCaiPlayMode = activeSnapshot?.playMode ?? 'kunming';
  const countdown = activeSnapshot?.countdown ?? 0;
  const remainingDeckCount = activeSnapshot?.remainingDeckCount ?? 42;

  // React to Quick Switch Table from SharedTableHudOverlay
  useEffect(() => {
    if (controlState.switchTableSeq === prevSwitchSeqRef.current) return;
    prevSwitchSeqRef.current = controlState.switchTableSeq;
    clearCeremonyTimers();
    setActiveCeremony(null);
    if (!snapshot) {
      startLocalSimulatedRound();
    }
  }, [controlState.switchTableSeq, snapshot, clearCeremonyTimers, startLocalSimulatedRound]);

  // Yunnan LaoYanCai Draw-Odds Smart Trusteeship & Auto-Next-Round Engine
  useEffect(() => {
    if (!activeSnapshot || !selfPlayer) return;

    if (
      phase === 'ROUND_RESULT' &&
      (controlState.autoNextRound || controlState.isTrusteeship)
    ) {
      const nextTimer = window.setTimeout(() => {
        handleReady();
      }, gameControlHub.scaleDelay(2500));
      return () => window.clearTimeout(nextTimer);
    }

    if (!controlState.isTrusteeship) return;

    const delayMs = gameControlHub.scaleDelay(680);
    const timer = window.setTimeout(() => {
      const pts = selfHandResult?.points ?? 0;
      const canZha = Boolean(selfHandResult?.canZhaKai);

      if (phase === 'CALL_BANKER' && selfPlayer.callMultiplier < 0) {
        const call = canZha ? 3 : pts >= 7 ? 2 : pts >= 5 ? 1 : 0;
        handleCallBanker(call);
      } else if (
        phase === 'BETTING' &&
        !selfPlayer.isDealer &&
        selfPlayer.betMultiplier <= 0
      ) {
        const bet = canZha ? 20 : pts >= 6 ? 10 : 5;
        handleBet(bet);
      } else if (phase === 'BANKER_NATURAL' && selfPlayer.isDealer) {
        handleBankerNatural(canZha);
      } else if (
        phase === 'PLAYER_DECISION' &&
        !selfPlayer.isDealer &&
        selfPlayer.decision === 'PENDING'
      ) {
        if (canZha) {
          handlePlayerDecision('ZHAKAI');
        } else if (selfDrawOdds?.recommendedAction === 'LAO' || pts <= 4) {
          handlePlayerDecision('LAO');
        } else {
          handlePlayerDecision('BULAO');
        }
      } else if (
        phase === 'BANKER_DECISION' &&
        selfPlayer.isDealer &&
        selfPlayer.decision === 'PENDING'
      ) {
        handleBankerDecision(pts <= 4 ? 'LAO' : 'BULAO');
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    activeSnapshot,
    selfPlayer,
    selfHandResult,
    selfDrawOdds,
    phase,
    controlState.isTrusteeship,
    controlState.autoNextRound,
    controlState.paceSpeed,
    handleCallBanker,
    handleBet,
    handleBankerNatural,
    handlePlayerDecision,
    handleBankerDecision,
    handleReady,
  ]);

  return (
    <AutoLandscapeContainer
      baseHeight={720}
      minVirtualWidth={1280}
      maxVirtualWidth={1600}
    >
      {({ virtualWidth, virtualHeight, stageScale }) => (
        <div className="relative h-full w-full select-none overflow-hidden bg-[#061812]">
          {/* Ambient Vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.75)_95%)]" />

          {/* Virtual Stage Container */}
          <div
            className="absolute overflow-hidden"
            style={{
              width: `${virtualWidth}px`,
              height: `${virtualHeight}px`,
              left: '50%',
              top: '50%',
              transform: `translate3d(-50%, -50%, 0) scale(${stageScale})`,
              transformOrigin: 'center center',
            }}
          >
            {/* ================= Yunnan Jade & Gold Round Table Felt ================= */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="relative rounded-[180px] border-[7px] border-[#d4af63] bg-radial from-[#125e46] via-[#0b3f2f] to-[#052319] shadow-[inset_0_0_85px_rgba(0,0,0,0.82),0_0_50px_rgba(0,0,0,0.9)]"
                style={{
                  width: `${virtualWidth - 84}px`,
                  height: '626px',
                }}
              >
                {/* Inner Gold Hairline Ring */}
                <div className="pointer-events-none absolute inset-4 rounded-[160px] border border-[#e2c278]/25" />
              </div>

              {/* Center Table Watermark, Remaining Deck Stack & Phase Pill */}
              <div className="pointer-events-none absolute flex flex-col items-center justify-center gap-2.5">
                <span className="font-display text-4xl font-black tracking-widest text-[#e2c278]/12">
                  {MODE_LABELS[playMode]}
                </span>

                {/* Center Draw Deck Visual */}
                {phase !== 'WAITING' && (
                  <div className="flex items-center gap-2 rounded-2xl border border-amber-200/30 bg-black/45 px-3.5 py-1.5 shadow-lg backdrop-blur-xs">
                    <div className="relative h-7 w-5 rounded border border-amber-200/60 bg-gradient-to-b from-amber-500 to-amber-800 shadow" />
                    <span className="font-mono text-xs font-extrabold text-emerald-200">
                      牌堆余牌: {remainingDeckCount} 张
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-full border border-amber-300/35 bg-black/55 px-4 py-1 text-xs font-extrabold text-amber-100 shadow-lg backdrop-blur-xs">
                  <span>{PHASE_BANNERS[phase]}</span>
                  {countdown > 0 && phase !== 'WAITING' && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.2 font-mono text-xs font-black text-[#240e03]">
                      {countdown}s
                    </span>
                  )}
                </div>
              </div>

              {/* ================= Special Hand Ceremony Banner (豹子 / 三公) ================= */}
              {activeCeremony && (
                <div className="pointer-events-none absolute inset-0 z-45 flex items-center justify-center animate-in zoom-in-75 fade-in duration-200">
                  <div
                    className={`relative flex flex-col items-center gap-2.5 rounded-3xl border-2 px-8 py-4 shadow-[0_0_55px_rgba(0,0,0,0.88)] backdrop-blur-md ${
                      activeCeremony.category === 'BAOZI'
                        ? 'border-yellow-200 bg-gradient-to-b from-[#5e1206]/95 via-[#380903]/95 to-[#1f0401]/95 ring-4 ring-amber-400/60 shadow-[0_0_50px_rgba(245,158,11,0.85)]'
                        : activeCeremony.category === 'SANGONG'
                        ? 'border-fuchsia-200 bg-gradient-to-b from-[#3d1054]/95 via-[#250836]/95 to-[#13031c]/95 ring-4 ring-fuchsia-400/60 shadow-[0_0_50px_rgba(217,70,239,0.85)]'
                        : 'border-cyan-200 bg-gradient-to-b from-[#0b3b49]/95 to-[#051b24]/95 ring-4 ring-cyan-400/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold text-amber-200">
                        {activeCeremony.isDealer ? '庄家' : '闲家'} ·{' '}
                        {activeCeremony.nickname}
                      </span>
                      <span className="rounded-full border border-yellow-200 bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 font-mono text-xs font-black text-[#240b02]">
                        {activeCeremony.badgeText}
                      </span>
                    </div>

                    <div
                      className={`font-display text-3xl font-black tracking-widest drop-shadow-[0_4px_10px_rgba(0,0,0,0.75)] ${
                        activeCeremony.category === 'BAOZI'
                          ? 'text-yellow-300'
                          : activeCeremony.category === 'SANGONG'
                          ? 'text-fuchsia-200'
                          : 'text-cyan-200'
                      }`}
                    >
                      {activeCeremony.category === 'BAOZI'
                        ? `【${activeCeremony.handName} · 豹子天降】`
                        : activeCeremony.category === 'SANGONG'
                        ? '【三公驾到 · 满堂金甲】'
                        : `【${activeCeremony.handName}】`}
                    </div>

                    <div className="mt-1 flex items-center justify-center gap-2.5">
                      {activeCeremony.cards.map((c, idx) => (
                        <LaoYanCaiCardView
                          key={`${c.id}_${idx}`}
                          card={c}
                          size="md"
                          specialHighlight={activeCeremony.category}
                          isThirdDrawnCard={idx === 2}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ================= Top Navigation Header ================= */}
            <header className="absolute top-3 right-6 left-6 z-30 flex items-center justify-between">
              {/* Left: Exit & Mode Info */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    socketClient.emit('c2s_leave_room');
                    onLeaveRoom();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md active:scale-95 cursor-pointer hover:border-amber-300 hover:bg-black/80"
                  title="返回大厅"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>

                <div className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/60 px-3.5 py-1.5 text-xs font-bold text-amber-100 backdrop-blur-xs">
                  <span className="text-emerald-300">{MODE_LABELS[playMode]}</span>
                  <span className="text-white/30">·</span>
                  <span className="font-mono text-amber-200">
                    底分 {activeSnapshot?.baseScore || 100}
                  </span>
                </div>
              </div>

              {/* Right: Sound, Rules, Fullscreen */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = soundEngine.toggle();
                    setSoundEnabled(next);
                  }}
                  title={soundEnabled ? '静音' : '开启声音'}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md active:scale-95 cursor-pointer hover:bg-black/80"
                >
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-amber-300" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-rose-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowRuleModal(true)}
                  title="云南捞腌菜规则与番型说明"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-amber-200 shadow-md active:scale-95 cursor-pointer hover:bg-black/80"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>

                {onToggleFullscreen && (
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    title={isFullscreen ? '退出全屏' : '全屏'}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/30 bg-black/60 text-white shadow-md active:scale-95 cursor-pointer hover:bg-black/80"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4 text-amber-300" />
                    ) : (
                      <Maximize2 className="h-4 w-4 text-white" />
                    )}
                  </button>
                )}
              </div>
            </header>

            {/* ================= 5-Seat Standard Round Table Ring ================= */}
            <main className="relative z-20 h-full w-full">
              {/* Top Left-Center: Seat 2 */}
              <div
                className="absolute top-[62px]"
                style={{
                  left: `${virtualWidth * 0.31}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <LaoYanCaiPlayerSeat
                  player={seats[2]}
                  seatIndex={2}
                  isSelf={false}
                  phase={phase}
                />
              </div>

              {/* Top Right-Center: Seat 3 */}
              <div
                className="absolute top-[62px]"
                style={{
                  left: `${virtualWidth * 0.69}px`,
                  transform: 'translateX(-50%)',
                }}
              >
                <LaoYanCaiPlayerSeat
                  player={seats[3]}
                  seatIndex={3}
                  isSelf={false}
                  phase={phase}
                />
              </div>

              {/* Left Side: Seat 1 */}
              <div className="absolute top-[305px] left-[66px] -translate-y-1/2">
                <LaoYanCaiPlayerSeat
                  player={seats[1]}
                  seatIndex={1}
                  isSelf={false}
                  phase={phase}
                />
              </div>

              {/* Right Side: Seat 4 */}
              <div className="absolute top-[305px] right-[66px] -translate-y-1/2">
                <LaoYanCaiPlayerSeat
                  player={seats[4]}
                  seatIndex={4}
                  isSelf={false}
                  phase={phase}
                />
              </div>

              {/* Bottom Center: Seat 0 (Main Player) */}
              <div className="absolute bottom-[118px] left-1/2 -translate-x-1/2">
                <LaoYanCaiPlayerSeat
                  player={selfPlayer}
                  seatIndex={selfPlayer?.seatIndex ?? 0}
                  isSelf={true}
                  phase={phase}
                />
              </div>
            </main>

            {/* ================= Bottom Action Bar & Draw Odds HUD ================= */}
            <footer className="pointer-events-auto absolute bottom-[12px] left-1/2 z-30 flex w-full max-w-4xl -translate-x-1/2 justify-center px-4">
              <LaoYanCaiActionBar
                phase={phase}
                playMode={playMode}
                countdown={countdown}
                selfPlayer={selfPlayer}
                handResult={selfHandResult}
                drawOdds={selfDrawOdds}
                onCallBanker={handleCallBanker}
                onBet={handleBet}
                onBankerNatural={handleBankerNatural}
                onPlayerDecision={handlePlayerDecision}
                onBankerDecision={handleBankerDecision}
                onReady={handleReady}
              />
            </footer>

            {/* ================= Settlement Modal ================= */}
            {phase === 'ROUND_RESULT' && activeSnapshot?.settlement && (
              <LaoYanCaiSettlementModal
                settlement={activeSnapshot.settlement}
                countdown={countdown}
                selfPlayerId={selfPlayer?.playerId || ''}
                onReadyNext={handleReady}
                onLeaveRoom={() => {
                  socketClient.emit('c2s_leave_room');
                  onLeaveRoom();
                }}
              />
            )}

            {/* ================= Rule Explanation Modal ================= */}
            {showRuleModal && (
              <CommercialModalShell
                title="云南捞腌菜（玉溪/昆明正宗规则）"
                subtitle="正宗滇南三腌、双腌、炸开与捞牌番型说明"
                icon={<HelpCircle className="h-5 w-5" />}
                size="md"
                portalMode="stage"
                onClose={() => setShowRuleModal(false)}
              >
                <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-[#334155]">
                  <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
                    <strong className="text-[#B45309]">1. 牌库与点数计算：</strong>
                    使用去除大小王的 52 张标准扑克。A=1点，2~9为牌面点数，10/J/Q/K 均为 0点（十点/公牌）。所有手牌点数相加取个位数（0点最小称“瘪十”，9点最大）。
                  </div>
                  <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
                    <strong className="text-[#B45309]">2. 正宗博弈流程（炸开与捞牌）：</strong>
                    定庄与闲家下注后，每人先发 2 张底牌。若庄家首轮 2 张牌为 8点或 9点，庄家可优先选择【炸开】直接全场比大小（无人可再捞第 3 张牌）；若庄家未炸开，闲家依次选择【炸开】（需8或9点）、【捞腌菜】（摸第 3 张牌）或【不捞】（守 2 张牌）；最后庄家决定自己是否捞第 3 张牌并开牌结算。
                  </div>
                  <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
                    <strong className="text-[#B45309]">3. 特殊牌型与翻倍倍率：</strong>
                    <div className="mt-1 space-y-1 text-xs">
                      <div>· <span className="font-bold text-[#1E242B]">豹子（三条）</span>：3 张同点，5倍（血战高倍场 8倍）</div>
                      <div>· <span className="font-bold text-[#1E242B]">同花顺（顺金）</span>：3 张同花且连续，4倍（血战场 6倍）</div>
                      <div>· <span className="font-bold text-[#1E242B]">三公</span>：3 张均为 J/Q/K 人头牌，3倍（血战场 4倍）</div>
                      <div>· <span className="font-bold text-[#1E242B]">三腌（同花3张）</span>：捞牌后 3 张同花色，点数享 3倍</div>
                      <div>· <span className="font-bold text-[#1E242B]">双腌 / 对子（2张）</span>：首轮 2 张同花色或对子，点数享 2倍</div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
                    <strong className="text-[#B45309]">4. 大小排序：</strong>
                    豹子 &gt; 同花顺 &gt; 三公 &gt; 天牌9点炸开 &gt; 天牌8点炸开 &gt; 9点 ~ 0点（同点数下比最大单张 K&gt;Q&gt;J&gt;10...&gt;A 及花色 黑桃&gt;红桃&gt;梅花&gt;方块）。
                  </div>
                </div>
              </CommercialModalShell>
            )}
          </div>
        </div>
      )}
    </AutoLandscapeContainer>
  );
};
