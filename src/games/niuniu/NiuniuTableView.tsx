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
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import {
  NiuniuCard,
  NiuniuHandResult,
  NiuniuPhase,
  NiuniuPlayerInfo,
  NiuniuPlayMode,
  NiuniuTableSnapshot,
} from './types';
import {
  compareHands,
  createStandardNiuniuDeck,
  evaluateBetMultiplier,
  evaluateCallBankerExpected,
  evaluateNiuniuHand,
  shuffleDeck,
  solveOptimalPartition,
} from './algorithms/NiuniuLogic';
import { NiuniuPlayerSeat } from './components/NiuniuPlayerSeat';
import { NiuniuActionBar } from './components/NiuniuActionBar';
import { NiuniuSettlementModal } from './components/NiuniuSettlementModal';

export interface NiuniuTableViewProps {
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom: () => void;
  initialBaseScore?: number;
  initialTableScore?: number;
}

const MODE_LABELS: Record<NiuniuPlayMode, string> = {
  qiangzhuang: '看牌抢庄',
  tongbi: '通比牛牛',
  crazy: '疯狂加倍',
  classic: '经典牛牛',
};

const PHASE_BANNERS: Record<NiuniuPhase, string> = {
  WAITING: '等待开局',
  DEAL_FIRST_4: '发牌中',
  CALL_BANKER: '请抢庄',
  DETERMINE_BANKER: '定庄中',
  BETTING: '请闲家下注',
  DEAL_5TH: '发第5张牌',
  SHOWDOWN: '请亮牌',
  COMPARE_AND_SETTLE: '比牌结算',
  ROUND_RESULT: '本局结束',
};

export const NiuniuTableView: React.FC<NiuniuTableViewProps> = ({
  isFullscreen,
  onToggleFullscreen,
  onLeaveRoom,
  initialBaseScore = 100,
  initialTableScore = 2000,
}) => {
  const [snapshot, setSnapshot] = useState<NiuniuTableSnapshot | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundEngine.isEnabled());
  const [showRuleModal, setShowRuleModal] = useState<boolean>(false);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);

  // Local simulation state if socket server snapshot is not active
  const [localSnapshot, setLocalSnapshot] = useState<NiuniuTableSnapshot | null>(null);
  const fullLocalHandsRef = useRef<NiuniuCard[][]>([]);

  // Initialize socket listener
  useEffect(() => {
    soundEngine.startBgm('table');

    const unsub = socketClient.on('s2c_niuniu_snapshot', (data: NiuniuTableSnapshot) => {
      setSnapshot(data);
    });

    socketClient.emit('c2s_request_snapshot');

    return () => {
      unsub();
    };
  }, []);

  // Auto-ready if server snapshot arrives in WAITING with self unready
  useEffect(() => {
    if (!snapshot || snapshot.phase !== 'WAITING') return;
    const self = snapshot.seats.find((s) => s && !s.isBot);
    if (self && !self.ready) {
      socketClient.emit('c2s_niuniu_ready');
    }
  }, [snapshot]);

  // Helper to start a local simulated round (fallback when offline)
  const startLocalSimulatedRound = useCallback((existingBeans?: number[]) => {
    const deck = shuffleDeck(createStandardNiuniuDeck());
    const hands: NiuniuCard[][] = [
      deck.slice(0, 5),
      deck.slice(5, 10),
      deck.slice(10, 15),
      deck.slice(15, 20),
      deck.slice(20, 25),
    ];
    fullLocalHandsRef.current = hands;

    const botCalls = [
      -1,
      evaluateCallBankerExpected(hands[1].slice(0, 4), 'qiangzhuang'),
      evaluateCallBankerExpected(hands[2].slice(0, 4), 'qiangzhuang'),
      evaluateCallBankerExpected(hands[3].slice(0, 4), 'qiangzhuang'),
      evaluateCallBankerExpected(hands[4].slice(0, 4), 'qiangzhuang'),
    ];

    const maskHand = (cards: NiuniuCard[], isSelf: boolean, idx: number): NiuniuCard[] => {
      if (isSelf) {
        return cards.map((c, i) =>
          i < 4 ? c : { id: -105, suit: 'spade', rank: 0, value: 0 }
        );
      }
      return cards.map((_, i) => ({
        id: -100 - idx * 10 - i,
        suit: 'spade',
        rank: 0,
        value: 0,
      }));
    };

    const startScore = Math.max(200, Number(initialTableScore) || 2000);
    const startBase = Math.max(10, Number(initialBaseScore) || 100);

    const mockSeats: NiuniuPlayerInfo[] = [
      {
        playerId: 'self_player',
        nickname: '长安棋圣',
        avatarId: 'kashen',
        seatIndex: 0,
        beans: existingBeans?.[0] ?? startScore,
        ready: true,
        isBot: false,
        disconnected: false,
        callMultiplier: -1,
        betMultiplier: 0,
        isDealer: false,
        cards: maskHand(hands[0], true, 0),
        hasShownHand: false,
      },
      {
        playerId: 'bot_1',
        nickname: '锦鲤·贝儿',
        avatarId: 'beier',
        seatIndex: 1,
        beans: existingBeans?.[1] ?? startScore,
        ready: true,
        isBot: true,
        disconnected: false,
        callMultiplier: botCalls[1],
        betMultiplier: 0,
        isDealer: false,
        cards: maskHand(hands[1], false, 1),
        hasShownHand: false,
      },
      {
        playerId: 'bot_2',
        nickname: '折扇·柳如风',
        avatarId: 'scholar',
        seatIndex: 2,
        beans: existingBeans?.[2] ?? startScore,
        ready: true,
        isBot: true,
        disconnected: false,
        callMultiplier: botCalls[2],
        betMultiplier: 0,
        isDealer: false,
        cards: maskHand(hands[2], false, 2),
        hasShownHand: false,
      },
      {
        playerId: 'bot_3',
        nickname: '财神·金百万',
        avatarId: 'noble',
        seatIndex: 3,
        beans: existingBeans?.[3] ?? startScore,
        ready: true,
        isBot: true,
        disconnected: false,
        callMultiplier: botCalls[3],
        betMultiplier: 0,
        isDealer: false,
        cards: maskHand(hands[3], false, 3),
        hasShownHand: false,
      },
      {
        playerId: 'bot_4',
        nickname: '凌霄剑仙',
        avatarId: 'warrior',
        seatIndex: 4,
        beans: existingBeans?.[4] ?? startScore,
        ready: true,
        isBot: true,
        disconnected: false,
        callMultiplier: botCalls[4],
        betMultiplier: 0,
        isDealer: false,
        cards: maskHand(hands[4], false, 4),
        hasShownHand: false,
      },
    ];

    setLocalSnapshot({
      roomId: '888666',
      baseScore: startBase,
      playMode: 'qiangzhuang',
      phase: 'CALL_BANKER',
      countdown: 6,
      dealerSeatId: 3,
      seats: mockSeats,
      candidateDealerSeats: [],
    });
  }, [initialBaseScore, initialTableScore]);

  // Offline local simulation fallback initialization
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!snapshot) {
        startLocalSimulatedRound();
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [snapshot, startLocalSimulatedRound]);

  const activeSnapshot = snapshot || localSnapshot;

  // Clear selected cards whenever a new round begins
  useEffect(() => {
    if (
      activeSnapshot?.phase === 'DEAL_FIRST_4' ||
      activeSnapshot?.phase === 'CALL_BANKER' ||
      activeSnapshot?.phase === 'WAITING'
    ) {
      setSelectedCardIds([]);
    }
  }, [activeSnapshot?.phase]);

  const selfPlayer = useMemo(() => {
    if (!activeSnapshot) return null;
    return (
      activeSnapshot.seats.find((s) => s && !s.isBot) ??
      activeSnapshot.seats[0] ??
      null
    );
  }, [activeSnapshot]);

  const selfHandResult = useMemo<NiuniuHandResult | undefined>(() => {
    if (!selfPlayer || !selfPlayer.cards) return undefined;
    if (selfPlayer.handResult) return selfPlayer.handResult;
    const validCards = selfPlayer.cards.filter((c) => c.rank > 0);
    if (validCards.length !== 5) return undefined;
    return evaluateNiuniuHand(validCards, activeSnapshot?.playMode || 'qiangzhuang');
  }, [selfPlayer, activeSnapshot?.playMode]);

  // Client actions
  const handleCallBanker = useCallback(
    (multiplier: number) => {
      soundEngine.playNiuniuCall();
      hapticEngine.tap();
      socketClient.emit('c2s_niuniu_call_banker', { callMultiplier: multiplier });

      if (!snapshot && localSnapshot && selfPlayer) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const newSeats = prev.seats.map((s) => (s ? { ...s } : null));
          newSeats[selfPlayer.seatIndex]!.callMultiplier = multiplier;

          let maxCall = 0;
          newSeats.forEach((s) => {
            if (s && s.callMultiplier > maxCall) maxCall = s.callMultiplier;
          });
          const candidates = newSeats
            .filter((s) => s && s.callMultiplier === maxCall)
            .map((s) => s!.seatIndex);
          const chosenDealer =
            candidates[Math.floor(Math.random() * candidates.length)] ?? 0;

          newSeats.forEach((s, idx) => {
            if (!s) return;
            s.isDealer = idx === chosenDealer;
            if (idx === chosenDealer && s.callMultiplier <= 0) {
              s.callMultiplier = 1;
            }
            if (s.isBot && idx !== chosenDealer) {
              s.betMultiplier = evaluateBetMultiplier(
                fullLocalHandsRef.current[idx]?.slice(0, 4) || [],
                prev.playMode,
                Math.max(1, newSeats[chosenDealer]?.callMultiplier || 1)
              );
            }
          });

          // If self became dealer, reveal 5th card and jump to SHOWDOWN
          if (chosenDealer === selfPlayer.seatIndex) {
            newSeats[0]!.cards = fullLocalHandsRef.current[0] || newSeats[0]!.cards;
            newSeats[0]!.handResult = evaluateNiuniuHand(
              newSeats[0]!.cards,
              prev.playMode
            );
            return {
              ...prev,
              phase: 'SHOWDOWN',
              countdown: 8,
              dealerSeatId: chosenDealer,
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
      socketClient.emit('c2s_niuniu_bet', { betMultiplier: multiplier });

      if (!snapshot && localSnapshot && selfPlayer) {
        setLocalSnapshot((prev) => {
          if (!prev) return null;
          const newSeats = prev.seats.map((s) => (s ? { ...s } : null));
          newSeats[selfPlayer.seatIndex]!.betMultiplier = multiplier;
          // Reveal 5th card for self player in SHOWDOWN
          if (fullLocalHandsRef.current[0]) {
            newSeats[0]!.cards = fullLocalHandsRef.current[0];
            newSeats[0]!.handResult = evaluateNiuniuHand(
              fullLocalHandsRef.current[0],
              prev.playMode
            );
          }
          return {
            ...prev,
            phase: 'SHOWDOWN',
            countdown: 8,
            seats: newSeats,
          };
        });
      }
    },
    [snapshot, localSnapshot, selfPlayer]
  );

  const handleAutoPartition = useCallback(() => {
    if (!selfPlayer || !selfPlayer.cards) return;
    const valid = selfPlayer.cards.filter((c) => c.rank > 0);
    if (valid.length !== 5) return;
    soundEngine.playTap(640);
    hapticEngine.selectCard();
    const partition = solveOptimalPartition(
      valid,
      activeSnapshot?.playMode || 'qiangzhuang'
    );
    if (partition.hasNiu && partition.tenGroup.length === 3) {
      setSelectedCardIds(partition.tenGroup.map((c) => c.id));
    } else {
      setSelectedCardIds([]);
    }
  }, [selfPlayer, activeSnapshot?.playMode]);

  const handleShowHand = useCallback(() => {
    soundEngine.playNiuniuHandReveal(selfHandResult?.level ?? 0);
    hapticEngine.playCard();
    socketClient.emit('c2s_niuniu_show_hand');

    if (!snapshot && localSnapshot && selfPlayer) {
      setLocalSnapshot((prev) => {
        if (!prev) return null;
        const dealerIdx = prev.dealerSeatId;
        const fullHands = fullLocalHandsRef.current;
        const results = prev.seats.map((s, idx) =>
          s && fullHands[idx]
            ? evaluateNiuniuHand(fullHands[idx], prev.playMode)
            : undefined
        );
        const dealerRes = results[dealerIdx]!;
        const dealerCall = Math.max(
          1,
          prev.seats[dealerIdx]?.callMultiplier || 1
        );

        const deltas = [0, 0, 0, 0, 0];
        let dealerTotal = 0;

        prev.seats.forEach((s, idx) => {
          if (!s || idx === dealerIdx || !results[idx]) return;
          const bet = s.betMultiplier || 5;
          const cmp = compareHands(results[idx]!, dealerRes);
          if (cmp > 0) {
            const win = prev.baseScore * dealerCall * bet * results[idx]!.multiplier;
            deltas[idx] = win;
            dealerTotal -= win;
          } else {
            const loss = prev.baseScore * dealerCall * bet * dealerRes.multiplier;
            deltas[idx] = -loss;
            dealerTotal += loss;
          }
        });
        deltas[dealerIdx] = dealerTotal;

        const newSeats = prev.seats.map((s, idx) => {
          if (!s) return null;
          return {
            ...s,
            beans: Math.max(0, s.beans + deltas[idx]),
            cards: fullHands[idx] || s.cards,
            hasShownHand: true,
            handResult: results[idx],
            scoreDelta: deltas[idx],
          };
        });

        return {
          ...prev,
          phase: 'ROUND_RESULT',
          countdown: 6,
          seats: newSeats,
          settlement: {
            baseScore: prev.baseScore,
            playMode: prev.playMode,
            dealerSeatIndex: dealerIdx,
            players: newSeats
              .filter(Boolean)
              .map((s) => ({
                seatIndex: s!.seatIndex,
                playerId: s!.playerId,
                nickname: s!.nickname,
                avatarId: s!.avatarId,
                isDealer: s!.seatIndex === dealerIdx,
                callMultiplier: s!.callMultiplier,
                betMultiplier: s!.betMultiplier,
                handType: s!.handResult!.handType,
                handName: s!.handResult!.name,
                handMultiplier: s!.handResult!.multiplier,
                cards: s!.cards,
                scoreDelta: s!.scoreDelta || 0,
                balance: s!.beans,
                isWinner: (s!.scoreDelta || 0) > 0,
              })),
          },
        };
      });
    }
  }, [snapshot, localSnapshot, selfPlayer, selfHandResult]);

  const handleReady = useCallback(() => {
    soundEngine.playTap(720);
    hapticEngine.tap();
    socketClient.emit('c2s_niuniu_ready');

    if (!snapshot && localSnapshot) {
      const currentBeans = localSnapshot.seats.map((s) => s?.beans ?? 100000);
      startLocalSimulatedRound(currentBeans);
    }
  }, [snapshot, localSnapshot, startLocalSimulatedRound]);

  const handleCardClick = (card: NiuniuCard) => {
    if (card.rank <= 0) return;
    soundEngine.playTap(660);
    setSelectedCardIds((prev) => {
      if (prev.includes(card.id)) {
        return prev.filter((id) => id !== card.id);
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), card.id];
      }
      return [...prev, card.id];
    });
  };

  const seats = activeSnapshot?.seats ?? [null, null, null, null, null];
  const phase = activeSnapshot?.phase ?? 'WAITING';
  const playMode: NiuniuPlayMode = activeSnapshot?.playMode ?? 'qiangzhuang';
  const countdown = activeSnapshot?.countdown ?? 0;
  const candidateSeats = activeSnapshot?.candidateDealerSeats ?? [];

  return (
    <AutoLandscapeContainer baseHeight={720} minVirtualWidth={1280} maxVirtualWidth={1600}>
      {({ virtualWidth, virtualHeight, stageScale }) => (
        <div className="relative h-full w-full select-none overflow-hidden bg-[#071911]">
          {/* Background Ambient Dark Vignette */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.72)_95%)]" />

          {/* Virtual Stage Container: 720p height, dynamic virtualWidth */}
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
            {/* ================= Luxury Bullfight Table Felt ================= */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="relative rounded-[175px] border-[7px] border-[#cda761] bg-radial from-[#19633e] via-[#0e4228] to-[#062415] shadow-[inset_0_0_80px_rgba(0,0,0,0.82),0_0_50px_rgba(0,0,0,0.9)]"
                style={{
                  width: `${virtualWidth - 84}px`,
                  height: '626px',
                }}
              >
                {/* Inner Gold Hairline Ring */}
                <div className="pointer-events-none absolute inset-4 rounded-[155px] border border-[#d8b872]/25" />
              </div>

              {/* Center Table Watermark & Compact Phase Pill */}
              <div className="pointer-events-none absolute flex flex-col items-center justify-center gap-2">
                <span className="font-display text-5xl font-black tracking-widest text-[#d8b872]/10">
                  {MODE_LABELS[playMode]}
                </span>

                <div className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/50 px-4 py-1 text-xs font-extrabold text-amber-100 shadow-lg backdrop-blur-xs">
                  <span>{PHASE_BANNERS[phase]}</span>
                  {countdown > 0 && phase !== 'WAITING' && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.2 font-mono text-xs font-black text-[#240e03]">
                      {countdown}s
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ================= Top Navigation Header (Auto-hidden during settlement) ================= */}
            {!(phase === 'ROUND_RESULT' && activeSnapshot?.settlement) && (
              <header className="absolute top-3 right-6 left-6 z-30 flex items-center justify-between transition-opacity duration-200">
                {/* Left: Exit & Clean Mode Capsule */}
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
                    <span className="text-amber-300">
                      {MODE_LABELS[playMode]}
                    </span>
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
                    title="牌型倍率说明"
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
            )}

            {/* ================= 5-Player Table Arena Ring ================= */}
            <main className="relative z-20 h-full w-full">
              {/* Top Left-Center: Seat 2 */}
              <div
                className="absolute top-[64px]"
                style={{ left: `${virtualWidth * 0.31}px`, transform: 'translateX(-50%)' }}
              >
                <NiuniuPlayerSeat
                  player={seats[2]}
                  seatIndex={2}
                  isSelf={false}
                  phase={phase}
                  isDealerCandidate={
                    phase === 'DETERMINE_BANKER' && candidateSeats.includes(2)
                  }
                />
              </div>

              {/* Top Right-Center: Seat 3 */}
              <div
                className="absolute top-[64px]"
                style={{ left: `${virtualWidth * 0.69}px`, transform: 'translateX(-50%)' }}
              >
                <NiuniuPlayerSeat
                  player={seats[3]}
                  seatIndex={3}
                  isSelf={false}
                  phase={phase}
                  isDealerCandidate={
                    phase === 'DETERMINE_BANKER' && candidateSeats.includes(3)
                  }
                />
              </div>

              {/* Left Side: Seat 1 */}
              <div className="absolute top-[305px] left-[66px] -translate-y-1/2">
                <NiuniuPlayerSeat
                  player={seats[1]}
                  seatIndex={1}
                  isSelf={false}
                  phase={phase}
                  isDealerCandidate={
                    phase === 'DETERMINE_BANKER' && candidateSeats.includes(1)
                  }
                />
              </div>

              {/* Right Side: Seat 4 */}
              <div className="absolute top-[305px] right-[66px] -translate-y-1/2">
                <NiuniuPlayerSeat
                  player={seats[4]}
                  seatIndex={4}
                  isSelf={false}
                  phase={phase}
                  isDealerCandidate={
                    phase === 'DETERMINE_BANKER' && candidateSeats.includes(4)
                  }
                />
              </div>

              {/* Bottom Center: Seat 0 (Main Player) */}
              <div className="absolute bottom-[114px] left-1/2 -translate-x-1/2">
                <NiuniuPlayerSeat
                  player={selfPlayer}
                  seatIndex={selfPlayer?.seatIndex ?? 0}
                  isSelf={true}
                  phase={phase}
                  onCardClick={handleCardClick}
                  selectedCardIds={selectedCardIds}
                  isDealerCandidate={
                    phase === 'DETERMINE_BANKER' &&
                    candidateSeats.includes(selfPlayer?.seatIndex ?? 0)
                  }
                />
              </div>
            </main>

            {/* ================= Action Bar Dock (Auto-hidden during settlement) ================= */}
            {!(phase === 'ROUND_RESULT' && activeSnapshot?.settlement) && (
              <footer className="pointer-events-auto absolute bottom-[14px] left-1/2 z-30 flex w-full max-w-3xl -translate-x-1/2 justify-center px-4">
                <NiuniuActionBar
                  phase={phase}
                  playMode={playMode}
                  countdown={countdown}
                  selfPlayer={selfPlayer}
                  selectedCardIds={selectedCardIds}
                  onCallBanker={handleCallBanker}
                  onBet={handleBet}
                  onAutoPartition={handleAutoPartition}
                  onShowHand={handleShowHand}
                  onReady={handleReady}
                  hasNiuPrompt={selfHandResult ? selfHandResult.level > 0 : false}
                  handResult={selfHandResult}
                />
              </footer>
            )}
          </div>

          {/* ================= Settlement Modal (Outside scaled stage) ================= */}
          {phase === 'ROUND_RESULT' && activeSnapshot?.settlement && (
            <NiuniuSettlementModal
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

          {/* ================= Rule Explanation Modal (Outside scaled stage) ================= */}
          {showRuleModal && (
            <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
              <div
                className="relative flex max-h-[82dvh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
                  <h3 className="text-[15px] font-bold text-[#F3F4F6]">
                    抢庄牛牛 · 规则与倍率
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowRuleModal(false)}
                    aria-label="关闭"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain p-4 sm:p-5 text-xs leading-relaxed text-[#9CA3AF]">
                  <p>
                    <strong className="font-bold text-[#F3F4F6]">1. 看牌抢庄（4明1暗）：</strong>
                    开局先发 4 张明牌与 1 张暗牌，玩家根据前 4 张牌选择抢庄倍数（不抢/1~4倍）；定庄后闲家选注（5/10/15/20倍），随后揭晓第 5 张牌算牛比大小。
                  </p>
                  <p>
                    <strong className="font-bold text-[#F3F4F6]">2. 结算公式：</strong>
                    输赢豆数 = 房间底分 × 庄家抢庄倍数 × 闲家下注倍数 × 胜方牌型倍数（支持以小博大与庄家赔付封顶保护）。
                  </p>
                  <p>
                    <strong className="font-bold text-[#F3F4F6]">3. 经典牌型倍率：</strong>
                    五小牛(10倍) &gt; 炸弹牛(8倍) &gt; 五花牛(6倍) &gt; 四花/葫芦/同花/顺子牛(5倍) &gt; 牛牛(4倍) &gt; 牛九(3倍) &gt; 牛八/牛七(2倍) &gt; 牛六~无牛(1倍)。
                  </p>
                  <p>
                    <strong className="font-bold text-[#F3F4F6]">4. 疯狂加倍倍率：</strong>
                    五小牛(10倍) &gt; 炸弹牛(9倍) &gt; 五花牛(8倍) &gt; 四花/葫芦/同花/顺子牛(7倍) &gt; 牛牛(6倍) &gt; 牛九(5倍) &gt; 牛八(4倍) &gt; 牛七(3倍) &gt; 牛六/牛五(2倍) &gt; 牛四~无牛(1倍)。
                  </p>
                  <p>
                    <strong className="font-bold text-[#F3F4F6]">5. 同牌型比大小：</strong>
                    牌型相同时比单张最大牌点数（K &gt; Q &gt; ... &gt; A），点数相同比花色（黑桃 &gt; 红桃 &gt; 梅花 &gt; 方块），严格全序无平局。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AutoLandscapeContainer>
  );
};
