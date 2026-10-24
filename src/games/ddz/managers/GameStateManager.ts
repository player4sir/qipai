import { soundEngine } from '../../../shared/audio/SoundEngine';
import { SocketClient } from '../../../shared/network/SocketClient';
import { GameScene } from '../scenes/GameScene';
import { DdzDebugLogger } from '../utils/DdzDebugLogger';
import {
  CardData,
  ChatBubbleInfo,
  DdzPhase,
  DealMode,
  GameSnapshotPayload,
  PropType,
  Rank,
  SeatPlayerInfo,
  SettlementData,
  SwapDirection,
} from '../types';

export interface DdzViewState {
  roomId: string;
  dealMode: DealMode;
  wildRanks: Rank[];
  baseScore: number;
  maxMultiplier: number;
  isPrivate: boolean;
  hostId: string;
  phase: DdzPhase;
  multiplier: number;
  mySeat: number;
  currentSeat: number;
  timeoutAt: number;
  isFreeLead: boolean;
  landlordSeat: number | null;
  landlordId: string | null;
  players: Array<SeatPlayerInfo | null>;
  cardRecorder: Record<Rank, number>;
  chatBubbles: Record<number, ChatBubbleInfo | null>;
  settlement: SettlementData | null;
  errorToast: string | null;
  swapDirection?: SwapDirection;
  swappedInCardIds?: string[];
  swapSubmittedSeats?: number[];
}

const DEFAULT_RECORDER: Record<Rank, number> = {
  big_joker: 1,
  small_joker: 1,
  '2': 4,
  A: 4,
  K: 4,
  Q: 4,
  J: 4,
  '10': 4,
  '9': 4,
  '8': 4,
  '7': 4,
  '6': 4,
  '5': 4,
  '4': 4,
  '3': 4,
};

/**
 * GameStateManager 3.0.
 * Bridges authoritative server WebSocket events (`s2c_*`) with PixiJS `GameScene`,
 * Web Audio synthesis, Doubling phase, Clock Skew Compensation, and DealMode support.
 */
export class GameStateManager {
  private socketClient: SocketClient;
  private scene: GameScene | null = null;
  private onStateUpdate: (state: DdzViewState) => void;
  private unsubscribers: Array<() => void> = [];
  private cachedMyCards: CardData[] = [];
  private cachedOthersCount: Record<string, number> = {};
  private cachedLandlordCards: CardData[] = [];
  private cachedBottomTag: string | null = null;
  private clockOffsetMs: number = 0;

  private state: DdzViewState = {
    roomId: '',
    dealMode: 'classic',
    wildRanks: [],
    baseScore: 100,
    maxMultiplier: 32,
    isPrivate: false,
    hostId: '',
    phase: 'WAITING',
    multiplier: 1,
    mySeat: 0,
    currentSeat: 0,
    timeoutAt: 0,
    isFreeLead: false,
    landlordSeat: null,
    landlordId: null,
    players: [null, null, null],
    cardRecorder: { ...DEFAULT_RECORDER },
    chatBubbles: { 0: null, 1: null, 2: null },
    settlement: null,
    errorToast: null,
    swapDirection: 'clockwise',
    swappedInCardIds: [],
    swapSubmittedSeats: [],
  };

  constructor(socketClient: SocketClient, onStateUpdate: (state: DdzViewState) => void) {
    this.socketClient = socketClient;
    this.onStateUpdate = onStateUpdate;
    this.bindSocketEvents();
    this.socketClient.emit('c2s_request_snapshot');
  }

  attachScene(scene: GameScene): void {
    this.scene = scene;
    this.applyBufferedStateToScene();
    this.socketClient.emit('c2s_request_snapshot');
  }

  detachScene(): void {
    this.scene = null;
  }

  getState(): DdzViewState {
    return this.state;
  }

  private applyBufferedStateToScene(): void {
    if (!this.scene) return;
    this.scene.updateScoreAndMultiplier(this.state.baseScore, this.state.multiplier);

    if (this.state.phase === 'WAITING') {
      this.scene.handManager.clearHand();
      this.scene.clearAllPlayedAreas();
      this.scene.resetBottomThreeCards();
      this.scene.updateOpponentCardCounts(0, 0);
      this.scene.updateTurnState('WAITING', null, 0, false);
      return;
    }

    if (this.cachedMyCards.length > 0) {
      const isMeLandlord = this.state.landlordSeat === this.state.mySeat;
      this.scene.handManager.setWildRanks(this.state.wildRanks);
      this.scene.handManager.setHand(this.cachedMyCards, isMeLandlord, false);
    }

    if (this.state.landlordSeat !== null && this.cachedLandlordCards.length === 3) {
      this.scene.revealBottomThreeCards(
        this.cachedLandlordCards,
        false,
        this.cachedBottomTag
      );
    } else {
      this.scene.resetBottomThreeCards();
    }

    this.syncOpponentCountsFromMap(this.cachedOthersCount);

    const turnRel = this.getRelativePos(this.state.currentSeat);
    this.scene.updateTurnState(
      this.state.phase,
      turnRel,
      this.state.timeoutAt,
      this.state.isFreeLead
    );
  }

  // Client -> Server actions
  callLandlord(call: boolean): void {
    this.socketClient.emit('c2s_call_landlord', { call });
  }

  grabLandlord(grab: boolean): void {
    this.socketClient.emit('c2s_grab_landlord', { grab });
  }

  doubleScore(factor: 1 | 2 | 4): void {
    this.socketClient.emit('c2s_double_score', { factor });
  }

  playSelectedCards(): void {
    const selected = this.scene?.handManager.getSelectedCardData() ?? [];
    this.playCards(selected);
  }

  playCards(cards: CardData[]): void {
    if (cards.length === 0) {
      this.showToast('请先点选或滑动选择要打出的扑克牌（滑选5张以上自动提顺子）');
      return;
    }
    this.socketClient.emit('c2s_play_cards', { cards });
  }

  clearSelection(): void {
    this.scene?.handManager.clearSelection();
  }

  toggleHandSortMode(): 'rank' | 'count' {
    if (!this.scene) return 'rank';
    return this.scene.handManager.toggleSortMode();
  }

  passTurn(): void {
    this.scene?.handManager.clearSelection();
    this.socketClient.emit('c2s_play_cards', { cards: [] });
  }

  requestHint(): void {
    this.socketClient.emit('c2s_request_hint');
  }

  autoCompleteWings(): void {
    if (!this.scene) return;
    const res = this.scene.handManager.autoCompleteWings();
    if (!res.ok) {
      this.showToast(res.message);
    }
  }

  autoSelectSwapThree(): void {
    if (!this.scene) return;
    this.scene.handManager.selectOptimalSwapThree();
  }

  submitSwapThree(): void {
    if (!this.scene) return;
    let selected = this.scene.handManager.getSelectedCardData();
    if (selected.length !== 3) {
      selected = this.scene.handManager.selectOptimalSwapThree();
    }
    this.socketClient.emit('c2s_swap_three', { cards: selected });
  }

  sendChat(text: string, emoji?: string): void {
    this.socketClient.emit('c2s_send_chat', { text, emoji });
  }

  throwProp(targetSeat: number, propType: PropType): void {
    this.socketClient.emit('c2s_throw_prop', { targetSeat, propType });
  }

  toggleTrusteeship(): void {
    this.socketClient.emit('c2s_toggle_trusteeship');
  }

  addBot(): void {
    this.socketClient.emit('c2s_add_bot');
  }

  readyForNextRound(): void {
    this.state = { ...this.state, settlement: null };
    this.emitState();
    this.scene?.clearAllPlayedAreas();
    this.scene?.resetBottomThreeCards();
    this.socketClient.emit('c2s_toggle_ready', { ready: true });
  }

  leaveRoom(): void {
    this.socketClient.emit('c2s_leave_room');
  }

  private getRelativePos(targetSeat: number): 'bottom' | 'left' | 'right' {
    const diff = (targetSeat - this.state.mySeat + 3) % 3;
    if (diff === 0) return 'bottom';
    if (diff === 1) return 'right';
    return 'left';
  }

  private bindSocketEvents(): void {
    // 0. Active reconnection state resynchronization
    this.unsubscribers.push(
      this.socketClient.on('socket_connected', () => {
        this.socketClient.emit('c2s_request_snapshot');
      })
    );

    // 1. Full Game Snapshot
    this.unsubscribers.push(
      this.socketClient.on<GameSnapshotPayload>('s2c_game_snapshot', (snap) => {
        this.cachedMyCards = snap.myCards ?? [];
        this.cachedOthersCount = snap.othersCount ?? {};
        this.cachedLandlordCards = snap.landlordCards ?? [];
        this.cachedBottomTag = snap.bottomCardsTag ?? null;

        if (typeof snap.serverTime === 'number' && snap.serverTime > 0) {
          this.clockOffsetMs = snap.serverTime - Date.now();
        }
        const adjustedTimeoutAt =
          snap.timeoutAt > 0 ? snap.timeoutAt - this.clockOffsetMs : 0;

        const validModes: DealMode[] = [
          'classic',
          'no_shuffle',
          'laizi',
          'tiandi_laizi',
          'swap_three',
        ];
        const nextMode: DealMode = validModes.includes(snap.dealMode as DealMode)
          ? (snap.dealMode as DealMode)
          : 'classic';

        this.state = {
          ...this.state,
          roomId: snap.roomId,
          dealMode: nextMode,
          wildRanks: snap.wildRanks ?? [],
          baseScore: snap.baseScore,
          maxMultiplier:
            snap.maxMultiplier ??
            (snap.baseScore >= 2000
              ? 256
              : snap.baseScore >= 800
                ? 128
                : snap.baseScore >= 300
                  ? 64
                  : 32),
          isPrivate: snap.isPrivate,
          hostId: snap.hostId,
          phase: snap.phase,
          players: snap.players,
          mySeat: snap.mySeat,
          currentSeat: snap.currentSeat,
          timeoutAt: adjustedTimeoutAt,
          isFreeLead: snap.isFreeLead,
          landlordId: snap.landlordId,
          landlordSeat: snap.landlordSeat,
          multiplier: snap.multiplier,
          cardRecorder: snap.cardRecorder ?? { ...DEFAULT_RECORDER },
          settlement: snap.phase === 'SETTLEMENT' ? this.state.settlement : null,
          swapDirection: snap.swapDirection ?? this.state.swapDirection,
          swappedInCardIds: snap.swappedInCardIds ?? this.state.swappedInCardIds,
          swapSubmittedSeats: snap.swapSubmittedSeats ?? [],
        };
        this.emitState();

        DdzDebugLogger.logDealSnapshot({
          eventTag: `牌局快照/${snap.phase}`,
          roomId: snap.roomId,
          dealMode: nextMode,
          mySeat: snap.mySeat,
          landlordSeat: snap.landlordSeat,
          wildRanks: snap.wildRanks ?? [],
          myCards: this.cachedMyCards,
          landlordCards: this.cachedLandlordCards,
          othersCount: this.cachedOthersCount,
          cardRecorder: this.state.cardRecorder,
        });

        if (!this.scene) return;
        this.applyBufferedStateToScene();

        this.scene.clearAllPlayedAreas();
        for (const act of snap.seatLastActions ?? []) {
          const rel = this.getRelativePos(act.seat);
          this.scene.showSeatAction(rel, {
            type: act.type,
            cards: act.cards,
            patternLabel: act.patternLabel,
            isLandlord: act.seat === snap.landlordSeat,
          });
        }
      })
    );

    // 2. Room State updates
    this.unsubscribers.push(
      this.socketClient.on('s2c_room_state', (data) => {
        const myId = this.socketClient.getPlayerId();
        const foundMySeat = (data.players as Array<SeatPlayerInfo | null>).findIndex(
          (p) => p?.playerId === myId
        );
        const validModes: DealMode[] = [
          'classic',
          'no_shuffle',
          'laizi',
          'tiandi_laizi',
          'swap_three',
        ];
        const nextMode: DealMode = validModes.includes(data.dealMode as DealMode)
          ? (data.dealMode as DealMode)
          : 'classic';
        this.state = {
          ...this.state,
          roomId: data.roomId,
          dealMode: nextMode,
          wildRanks: Array.isArray(data.wildRanks)
            ? (data.wildRanks as Rank[])
            : this.state.wildRanks,
          baseScore: data.baseScore,
          maxMultiplier:
            Number(data.maxMultiplier) ||
            (data.baseScore >= 2000
              ? 256
              : data.baseScore >= 800
                ? 128
                : data.baseScore >= 300
                  ? 64
                  : 32),
          isPrivate: Boolean(data.isPrivate),
          hostId: data.hostId,
          phase: data.status as DdzPhase,
          multiplier: data.multiplier,
          mySeat: foundMySeat !== -1 ? foundMySeat : this.state.mySeat,
          landlordId: data.landlordId,
          landlordSeat: data.landlordSeat,
          players: data.players,
        };
        this.scene?.updateScoreAndMultiplier(data.baseScore, data.multiplier);
        this.emitState();
      })
    );

    // 3. Cards Dealt (`s2c_cards_dealt`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_cards_dealt', (data) => {
        this.cachedMyCards = data.myCards ?? [];
        this.cachedOthersCount = data.othersCount ?? {};
        this.cachedLandlordCards = [];
        this.cachedBottomTag = null;
        const wildRanks = Array.isArray(data.wildRanks) ? (data.wildRanks as Rank[]) : [];
        const initialPhase: DdzPhase =
          this.state.dealMode === 'swap_three' ? 'SWAPPING' : 'BIDDING';

        this.state = {
          ...this.state,
          phase: initialPhase,
          wildRanks,
          multiplier: data.multiplier ?? 1,
          landlordSeat: null,
          landlordId: null,
          settlement: null,
          cardRecorder: data.cardRecorder ?? { ...DEFAULT_RECORDER },
          swapDirection: data.swapDirection ?? 'clockwise',
          swappedInCardIds: [],
          swapSubmittedSeats: [],
        };
        this.emitState();

        DdzDebugLogger.logDealSnapshot({
          eventTag: '发牌完成',
          roomId: this.state.roomId,
          dealMode: this.state.dealMode,
          mySeat: this.state.mySeat,
          landlordSeat: null,
          wildRanks,
          myCards: this.cachedMyCards,
          landlordCards: [],
          othersCount: this.cachedOthersCount,
          cardRecorder: this.state.cardRecorder,
        });

        soundEngine.playRiffleShuffle();
        if (!this.scene) return;
        this.scene.clearAllPlayedAreas();
        this.scene.resetBottomThreeCards();
        this.scene.handManager.setWildRanks(wildRanks);
        this.scene.handManager.setHand(data.myCards, false, true);
        if (initialPhase === 'SWAPPING') {
          setTimeout(() => {
            this.scene?.handManager.selectOptimalSwapThree();
          }, 420);
        }
        if (wildRanks.length > 0) {
          this.scene.playLaiziRevealEffect(wildRanks);
        }
        this.syncOpponentCountsFromMap(data.othersCount);
      })
    );

    // 3b. Swap Three Result (`s2c_swap_three_result`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_swap_three_result', (data) => {
        this.cachedMyCards = data.myCards ?? [];
        const inCards: CardData[] = Array.isArray(data.swappedInCards) ? data.swappedInCards : [];
        const inIds = inCards.map((c) => c.id);
        const dirLabel = data.swapDirection === 'counter_clockwise' ? '逆时针' : '顺时针';

        this.state = {
          ...this.state,
          phase: 'BIDDING',
          cardRecorder: data.cardRecorder ?? this.state.cardRecorder,
          swappedInCardIds: inIds,
          swapSubmittedSeats: [0, 1, 2],
        };
        this.emitState();

        soundEngine.playGlissando();
        this.showToast(
          `${dirLabel}换三张完成！换入：${inCards.map((c) => c.rank).join(' · ')}`
        );

        if (!this.scene) return;
        this.scene.handManager.setHand(this.cachedMyCards, false, false);
        this.scene.handManager.selectByIds(inIds);
      })
    );

    // 4. Call / Grab Landlord Result (`s2c_call_result`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_call_result', (data) => {
        this.state = {
          ...this.state,
          multiplier: data.multiplier,
        };
        this.emitState();
        this.scene?.updateScoreAndMultiplier(this.state.baseScore, data.multiplier);

        const rel = this.getRelativePos(data.seatIndex);
        if (data.actionType === 'call') {
          this.scene?.showSeatAction(rel, {
            type: data.call ? 'call' : 'no_call',
          });
          if (data.call) {
            soundEngine.playPowerChime(2);
          } else {
            soundEngine.playTap(480);
          }
        } else {
          this.scene?.showSeatAction(rel, {
            type: data.call ? 'grab' : 'no_grab',
          });
          if (data.call) {
            soundEngine.playPowerChime(3);
          } else {
            soundEngine.playTap(480);
          }
        }

        if (data.nextPhase === 'redeal') {
          this.showToast('三位玩家均未叫地主，正在重新发牌...');
        }
      })
    );

    // 5. Landlord Confirmed -> Enters DOUBLING Phase (`s2c_landlord_confirmed`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_landlord_confirmed', (data) => {
        this.cachedMyCards = data.myCards ?? [];
        this.cachedOthersCount = data.othersCount ?? {};
        this.cachedLandlordCards = data.landlordCards ?? [];
        this.cachedBottomTag = data.bottomCardsTag ?? null;

        const prevWildLen = this.state.wildRanks.length;
        const wildRanks = Array.isArray(data.wildRanks)
          ? (data.wildRanks as Rank[])
          : this.state.wildRanks;

        this.state = {
          ...this.state,
          phase: 'DOUBLING',
          wildRanks,
          landlordId: data.landlordId,
          landlordSeat: data.landlordSeat,
          multiplier: data.multiplier,
          cardRecorder: data.cardRecorder ?? this.state.cardRecorder,
        };
        this.emitState();

        DdzDebugLogger.logDealSnapshot({
          eventTag: `地主确认(Seat#${data.landlordSeat})`,
          roomId: this.state.roomId,
          dealMode: this.state.dealMode,
          mySeat: this.state.mySeat,
          landlordSeat: data.landlordSeat,
          wildRanks,
          myCards: this.cachedMyCards,
          landlordCards: this.cachedLandlordCards,
          othersCount: this.cachedOthersCount,
          cardRecorder: this.state.cardRecorder,
        });

        soundEngine.playDdzSfx('landlord');
        if (!this.scene) return;

        this.scene.clearAllPlayedAreas();
        this.scene.updateScoreAndMultiplier(this.state.baseScore, data.multiplier);
        this.scene.revealBottomThreeCards(
          data.landlordCards,
          true,
          data.bottomCardsTag ?? null
        );

        const isMeLandlord = data.landlordSeat === this.state.mySeat;
        this.scene.handManager.setWildRanks(wildRanks);
        this.scene.handManager.setHand(data.myCards, isMeLandlord, false);
        if (wildRanks.length > prevWildLen) {
          this.scene.playLaiziRevealEffect(wildRanks);
        }
        this.syncOpponentCountsFromMap(data.othersCount);
      })
    );

    // 6. Doubling Result (`s2c_double_result`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_double_result', (data) => {
        this.state = {
          ...this.state,
          multiplier: data.multiplier,
        };
        this.emitState();
        this.scene?.updateScoreAndMultiplier(this.state.baseScore, data.multiplier);

        const rel = this.getRelativePos(data.seatIndex);
        const factor: 1 | 2 | 4 = data.factor;
        this.scene?.showSeatAction(rel, {
          type: factor === 4 ? 'double_4' : factor === 2 ? 'double_2' : 'double_1',
        });

        if (factor === 4) {
          soundEngine.playPowerChime(4);
          soundEngine.playDdzActionVoice('chaojijiabei', data.seatIndex, this.state.mySeat);
        } else if (factor === 2) {
          soundEngine.playPowerChime(2);
          soundEngine.playDdzActionVoice('jiabei', data.seatIndex, this.state.mySeat);
        } else {
          soundEngine.playTap(480);
          soundEngine.playDdzActionVoice('bujiabei', data.seatIndex, this.state.mySeat);
        }
      })
    );

    // 7. Turn Change (`s2c_turn_change`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_turn_change', (data) => {
        if (typeof data.serverTime === 'number' && data.serverTime > 0) {
          this.clockOffsetMs = data.serverTime - Date.now();
        }
        const adjustedTimeoutAt =
          Number(data.timeoutAt) > 0 ? Number(data.timeoutAt) - this.clockOffsetMs : 0;

        this.state = {
          ...this.state,
          phase: data.phase,
          currentSeat: data.currentSeat,
          timeoutAt: adjustedTimeoutAt,
          isFreeLead: Boolean(data.isFreeLead),
        };
        this.emitState();

        const rel = this.getRelativePos(data.currentSeat);
        this.scene?.updateTurnState(data.phase, rel, adjustedTimeoutAt, Boolean(data.isFreeLead));
      })
    );

    // 8. Cards Played (`s2c_cards_played`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_cards_played', (data) => {
        this.cachedMyCards = data.myCards ?? this.cachedMyCards;
        this.cachedOthersCount = data.othersCount ?? this.cachedOthersCount;

        this.state = {
          ...this.state,
          multiplier: data.multiplier,
          cardRecorder: data.cardRecorder ?? this.state.cardRecorder,
        };
        this.emitState();

        if (!this.scene) return;
        this.scene.updateScoreAndMultiplier(this.state.baseScore, data.multiplier);

        if (data.isNewTrick) {
          this.scene.clearAllPlayedAreas();
        }

        const rel = this.getRelativePos(data.seatIndex);
        const isActorLandlord = data.seatIndex === this.state.landlordSeat;
        if (data.pattern === 'PASS') {
          DdzDebugLogger.logPlayAction({
            seatIndex: data.seatIndex,
            mySeat: this.state.mySeat,
            isLandlord: isActorLandlord,
            patternType: 'PASS',
            patternLabel: '不出',
            serverMainValue: 0,
            resolvedMainValue: 0,
            playedCards: [],
            orderedCards: [],
            myRemainingCards: this.cachedMyCards,
            othersCount: this.cachedOthersCount,
            cardRecorder: this.state.cardRecorder,
            wildRanks: this.state.wildRanks,
          });
          this.scene.showSeatAction(rel, { type: 'pass' });
          soundEngine.playDdzActionVoice('pass', data.seatIndex, this.state.mySeat);
        } else {
          const rawCards = (data.cards as CardData[]) || [];
          const patternType = String(data.pattern);
          const serverMainVal = Number(data.mainValue) || 0;

          // Resolve authoritative mainValue via server payload + Priority Queue verification
          let mainVal = serverMainVal;
          if (!Number.isFinite(mainVal) || mainVal < 3) {
            const candidates = DdzDebugLogger.evaluatePriorityCandidates(
              rawCards,
              this.state.wildRanks
            );
            const matched =
              candidates.find((c) => c.patternType === patternType) ?? candidates[0];
            if (matched) {
              mainVal = matched.mainValue;
            } else {
              const wildSet = new Set<Rank>(this.state.wildRanks);
              const nonWildCards = rawCards.filter((c) => !c.isWild && !wildSet.has(c.rank));
              const sourceCards = nonWildCards.length > 0 ? nonWildCards : rawCards;
              mainVal = sourceCards[0]?.value ?? 3;
              if (sourceCards.length > 0) {
                const counts = new Map<number, number>();
                for (const c of sourceCards) {
                  counts.set(c.value, (counts.get(c.value) ?? 0) + 1);
                }
                let maxCount = 0;
                for (const [v, cnt] of counts.entries()) {
                  if (cnt > maxCount || (cnt === maxCount && v > mainVal)) {
                    maxCount = cnt;
                    mainVal = v;
                  }
                }
              }
            }
          }

          const orderedCards = DdzDebugLogger.orderCardsForDisplay(
            rawCards,
            patternType,
            mainVal,
            this.state.wildRanks
          );

          DdzDebugLogger.logPlayAction({
            seatIndex: data.seatIndex,
            mySeat: this.state.mySeat,
            isLandlord: isActorLandlord,
            patternType,
            patternLabel: data.patternLabel,
            serverMainValue: serverMainVal,
            resolvedMainValue: mainVal,
            playedCards: rawCards,
            orderedCards,
            myRemainingCards: this.cachedMyCards,
            othersCount: this.cachedOthersCount,
            cardRecorder: this.state.cardRecorder,
            wildRanks: this.state.wildRanks,
          });

          if (rel === 'bottom') {
            const playedIds = rawCards.map((c) => c.id);
            this.scene.handManager.removeCardsByIds(playedIds);
          }

          this.scene.showSeatAction(rel, {
            type: 'play',
            cards: orderedCards,
            patternLabel: data.patternLabel,
            isLandlord: isActorLandlord,
          });

          this.scene.playPatternEffect(data.pattern, data.patternLabel);

          const isHeavySpecial = [
            'BOMB',
            'ROCKET',
            'AIRPLANE',
            'AIRPLANE_SINGLE_WINGS',
            'AIRPLANE_PAIR_WINGS',
          ].includes(patternType);

          if (!isHeavySpecial) {
            soundEngine.playDdzSfx('discard', data.seatIndex, this.state.mySeat);
          }

          // Play card voice first so any subsequent low-card alert (baojing1/2) queues cleanly behind it
          soundEngine.playDdzCardVoice(patternType, mainVal, data.seatIndex, this.state.mySeat);

          if (rel !== 'bottom') {
            this.syncOpponentCountsFromMap(data.othersCount);
          }
        }
      })
    );

    // 9. Smart Hint Result (`s2c_hint_result`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_hint_result', (data) => {
        if (data.noPlayableMove) {
          console.log('%c[DDZ-DEBUG][智能提示] 当前无大过上家的合法牌组 -> 自动选择不出', 'color:#f87171;font-weight:bold;');
          this.showToast('没有大过上家的牌，已为您选择不出');
          this.passTurn();
          return;
        }
        const hintCards = (data.cards as CardData[]) || [];
        const cands = DdzDebugLogger.evaluatePriorityCandidates(hintCards, this.state.wildRanks);
        console.log(
          `%c[DDZ-DEBUG][智能提示] 推荐提牌: ${DdzDebugLogger.formatCards(hintCards)} | 判定牌型: ${cands[0]?.label ?? '组合'}`,
          'color:#38bdf8;font-weight:bold;'
        );
        const ids = hintCards.map((c) => c.id);
        this.scene?.handManager.selectByIds(ids);
      })
    );

    // 10. Quick Chat Bubble (`s2c_chat_message`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_chat_message', (data) => {
        const seatIdx = Number(data.seatIndex);
        const bubbleId = `chat_${Date.now()}_${Math.random()}`;
        const bubble: ChatBubbleInfo = {
          id: bubbleId,
          seatIndex: seatIdx,
          text: data.text ?? '',
          emoji: data.emoji,
        };

        this.state = {
          ...this.state,
          chatBubbles: {
            ...this.state.chatBubbles,
            [seatIdx]: bubble,
          },
        };
        this.emitState();

        soundEngine.playTap(860);
        if (data.text) {
          soundEngine.speak(data.text);
        }

        setTimeout(() => {
          if (this.state.chatBubbles[seatIdx]?.id === bubbleId) {
            this.state = {
              ...this.state,
              chatBubbles: {
                ...this.state.chatBubbles,
                [seatIdx]: null,
              },
            };
            this.emitState();
          }
        }, 3400);
      })
    );

    // 11. Interactive Prop Thrown (`s2c_prop_thrown`)
    this.unsubscribers.push(
      this.socketClient.on('s2c_prop_thrown', (data) => {
        const fromRel = this.getRelativePos(Number(data.fromSeat));
        const toRel = this.getRelativePos(Number(data.toSeat));
        const propType = (data.propType as PropType) || 'flower';
        soundEngine.playPropWhoosh();
        this.scene?.playPropThrowEffect(fromRel, toRel, propType);
        setTimeout(() => {
          soundEngine.playPropImpact(propType === 'bomb_cup');
        }, 620);
      })
    );

    // 12. Game Settlement (`s2c_game_settlement`)
    this.unsubscribers.push(
      this.socketClient.on<SettlementData>('s2c_game_settlement', (settlement) => {
        this.state = {
          ...this.state,
          phase: 'SETTLEMENT',
          multiplier: settlement.totalMultiplier,
          settlement,
        };
        this.emitState();

        this.scene?.updateTurnState('SETTLEMENT', null, 0, false);
        this.scene?.updateScoreAndMultiplier(this.state.baseScore, settlement.totalMultiplier);

        if (settlement.isSpring) {
          this.scene?.playPatternEffect('SPRING', '春天 ×2');
          soundEngine.playDdzSfx('spring');
        } else if (settlement.isAntiSpring) {
          this.scene?.playPatternEffect('SPRING', '反春 ×2');
          soundEngine.playDdzSfx('spring');
        }

        const myId = this.socketClient.getPlayerId();
        const myDelta = settlement.scoreChanges[myId] ?? 0;
        if (myDelta >= 0) {
          soundEngine.playVictoryFanfare();
        } else {
          soundEngine.playDefeatTone();
        }
      })
    );

    // 13. Action Error Toast
    this.unsubscribers.push(
      this.socketClient.on('s2c_action_error', (data) => {
        this.showToast(data?.message || '出牌不符合规则');
      })
    );
  }

  private syncOpponentCountsFromMap(othersCount: Record<string, number>): void {
    if (!this.scene) return;
    const rightSeat = (this.state.mySeat + 1) % 3;
    const leftSeat = (this.state.mySeat + 2) % 3;

    const rightPlayer = this.state.players[rightSeat];
    const leftPlayer = this.state.players[leftSeat];

    const rightCount = rightPlayer ? (othersCount[rightPlayer.playerId] ?? 0) : 0;
    const leftCount = leftPlayer ? (othersCount[leftPlayer.playerId] ?? 0) : 0;

    this.scene.updateOpponentCardCounts(leftCount, rightCount);
  }

  private showToast(msg: string): void {
    this.state = { ...this.state, errorToast: msg };
    this.emitState();
    setTimeout(() => {
      if (this.state.errorToast === msg) {
        this.state = { ...this.state, errorToast: null };
        this.emitState();
      }
    }, 2600);
  }

  private emitState(): void {
    this.onStateUpdate({ ...this.state });
  }

  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}
