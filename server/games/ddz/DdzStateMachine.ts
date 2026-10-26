import {
  CardData,
  ClassifiedPattern,
  DdzRules,
  DealMode,
  PatternType,
  Rank,
} from './DdzRules.js';

export type DdzPhase =
  | 'WAITING'
  | 'DEALING'
  | 'SWAPPING'
  | 'BIDDING'
  | 'GRABBING'
  | 'LANDLORD_REVEAL'
  | 'DOUBLING'
  | 'PLAYING'
  | 'SETTLEMENT';

export type SwapDirection = 'clockwise' | 'counter_clockwise';

export interface SeatActionRecord {
  seat: number;
  type:
    | 'call'
    | 'no_call'
    | 'grab'
    | 'no_grab'
    | 'swap_three'
    | 'double_1'
    | 'double_2'
    | 'double_4'
    | 'open_hand'
    | 'play'
    | 'pass';
  cards?: CardData[];
  patternLabel?: string;
}

export interface ReplayStep {
  stepIndex: number;
  seat: number;
  actionType:
    | 'call'
    | 'no_call'
    | 'grab'
    | 'no_grab'
    | 'landlord_reveal'
    | 'swap_three'
    | 'double_1'
    | 'double_2'
    | 'double_4'
    | 'open_hand'
    | 'play'
    | 'pass';
  cards?: CardData[];
  patternLabel?: string;
  multiplierAfter: number;
  wildRanksAfter: Rank[];
}

export interface MatchReplayRecord {
  matchId: string;
  roomId: string;
  dealMode: DealMode;
  wildRanks: Rank[];
  baseScore: number;
  finalMultiplier: number;
  landlordSeat: number;
  winnerSeat: number;
  isSpring: boolean;
  isAntiSpring: boolean;
  timestamp: number;
  seats: Array<{
    seatIndex: number;
    playerId: string;
    nickname: string;
    avatarId: string;
    role: 'landlord' | 'peasant';
    scoreDelta: number;
    isWinner: boolean;
  }>;
  initialHands: Record<number, CardData[]>;
  landlordCards: CardData[];
  steps: ReplayStep[];
}

export interface SettlementSummary {
  matchId?: string;
  winnerId: string;
  winnerSeat: number;
  isLandlordWin: boolean;
  baseScore: number;
  grabMultiplier: number;
  doubleMultiplier: number;
  bombMultiplier: number;
  springMultiplier: number;
  bottomCardMultiplier?: number;
  bottomCardsTag?: string | null;
  openHandMultiplier?: number;
  totalMultiplier: number;
  maxMultiplier?: number;
  effectiveMultiplier?: number;
  isCapped?: boolean;
  bankruptProtectedIds?: string[];
  isSpring: boolean;
  isAntiSpring: boolean;
  scoreChanges: Record<string, number>;
  remainingHands: Record<string, CardData[]>;
  wildRanks?: Rank[];
  replay?: MatchReplayRecord;
}

/**
 * Pure authoritative state machine for Tencent Happy Dou Dizhu Classic, No-Shuffle & Heaven/Earth Laizi Modes.
 */
export class DdzStateMachine {
  phase: DdzPhase = 'WAITING';
  dealMode: DealMode = 'classic';
  wildRanks: Rank[] = [];
  hands: Map<number, CardData[]> = new Map();
  initialHands: Record<number, CardData[]> = { 0: [], 1: [], 2: [] };
  landlordCards: CardData[] = [];
  landlordSeat: number | null = null;
  currentTurnSeat: number = 0;
  turnTimeoutAt: number = 0;
  turnSeq: number = 0;

  // Swap 3 cards state (Whitepaper v2.0 Section 1.3)
  swapDirection: SwapDirection = 'clockwise';
  swapSelections: Map<number, CardData[]> = new Map();
  swappedInCards: Map<number, CardData[]> = new Map();

  // Bidding / Grabbing state
  firstBidderSeat: number = 0;
  biddingStep: number = 0;
  callerSeat: number | null = null;
  passedBiddingSeats: Set<number> = new Set();
  grabQueue: number[] = [];
  hasAnyoneGrabbed: boolean = false;
  lastGrabberSeat: number | null = null;
  redealCount: number = 0;

  // Doubling & Open-Hand state
  doublingStep: number = 0;
  seatDoubleFactors: Map<number, 1 | 2 | 4> = new Map();
  openHandSeats: Map<number, 3 | 5> = new Map();

  // Multipliers & counters
  grabMultiplier: number = 1;
  doubleMultiplier: number = 1;
  bombMultiplier: number = 1;
  springMultiplier: number = 1;
  bottomCardMultiplier: number = 1;
  openHandMultiplier: number = 1;

  // Playing trick state
  lastPlayed: {
    seat: number;
    playerId: string;
    cards: CardData[];
    pattern: ClassifiedPattern;
  } | null = null;
  passCountInTrick: number = 0;
  seatLastAction: Map<number, SeatActionRecord> = new Map();

  // Replay steps recorded chronologically
  replaySteps: ReplayStep[] = [];

  // Spring / Anti-spring tracking
  landlordPlayCount: number = 0;
  peasantPlayCount: number = 0;

  get totalMultiplier(): number {
    return (
      this.grabMultiplier *
      this.doubleMultiplier *
      this.bombMultiplier *
      this.springMultiplier *
      this.bottomCardMultiplier *
      this.openHandMultiplier
    );
  }

  resetForNewRound(preserveRedealCount = false): void {
    this.phase = 'WAITING';
    this.wildRanks = [];
    this.hands.clear();
    this.initialHands = { 0: [], 1: [], 2: [] };
    this.landlordCards = [];
    this.landlordSeat = null;
    this.swapSelections.clear();
    this.swappedInCards.clear();
    this.callerSeat = null;
    this.passedBiddingSeats.clear();
    this.grabQueue = [];
    this.hasAnyoneGrabbed = false;
    this.lastGrabberSeat = null;
    if (!preserveRedealCount) {
      this.redealCount = 0;
    }
    this.doublingStep = 0;
    this.seatDoubleFactors.clear();
    this.openHandSeats.clear();
    this.grabMultiplier = 1;
    this.doubleMultiplier = 1;
    this.bombMultiplier = 1;
    this.springMultiplier = 1;
    this.bottomCardMultiplier = 1;
    this.openHandMultiplier = 1;
    this.lastPlayed = null;
    this.passCountInTrick = 0;
    this.seatLastAction.clear();
    this.replaySteps = [];
    this.landlordPlayCount = 0;
    this.peasantPlayCount = 0;
    this.turnSeq += 1;
  }

  startDealing(dealMode: DealMode = 'classic'): void {
    this.resetForNewRound(true);
    this.dealMode = dealMode;
    this.phase = 'DEALING';

    // Determine initial Heaven Laizi (天赖子) if in laizi or tiandi_laizi mode
    if (dealMode === 'laizi' || dealMode === 'tiandi_laizi') {
      const heavenWild = DdzRules.pickRandomWildRank();
      this.wildRanks = [heavenWild];
    } else {
      this.wildRanks = [];
    }

    const dealt = DdzRules.dealHands(dealMode);
    const s0 = DdzRules.markWildCards(dealt.seat0, this.wildRanks);
    const s1 = DdzRules.markWildCards(dealt.seat1, this.wildRanks);
    const s2 = DdzRules.markWildCards(dealt.seat2, this.wildRanks);
    const bottom = DdzRules.markWildCards(dealt.bottomCards, this.wildRanks);

    this.hands.set(0, s0);
    this.hands.set(1, s1);
    this.hands.set(2, s2);
    this.landlordCards = bottom;

    this.initialHands = {
      0: s0.map((c) => ({ ...c })),
      1: s1.map((c) => ({ ...c })),
      2: s2.map((c) => ({ ...c })),
    };

    this.firstBidderSeat = Math.floor(Math.random() * 3);
    this.currentTurnSeat = this.firstBidderSeat;
    this.biddingStep = 0;

    if (dealMode === 'swap_three') {
      this.swapDirection = Math.random() < 0.5 ? 'clockwise' : 'counter_clockwise';
      this.phase = 'SWAPPING';
    } else {
      this.phase = 'BIDDING';
    }
    this.turnSeq += 1;
  }

  /**
   * Whitepaper v2.0 Section 1.3: Submit 3 cards for Swap Three (`SWAPPING` phase).
   * Once all 3 seats submit, performs clockwise/counter-clockwise 3-card exchange and transitions to `BIDDING`.
   */
  handleSubmitSwapThree(
    seat: number,
    selectedCards?: CardData[]
  ): {
    valid: boolean;
    error?: string;
    allSwapped: boolean;
    swapDirection: SwapDirection;
  } {
    if (this.phase !== 'SWAPPING') {
      return {
        valid: false,
        error: '当前不在换三张阶段',
        allSwapped: false,
        swapDirection: this.swapDirection,
      };
    }

    if (this.swapSelections.has(seat)) {
      return {
        valid: true,
        allSwapped: this.swapSelections.size >= 3,
        swapDirection: this.swapDirection,
      };
    }

    const myHand = this.hands.get(seat) ?? [];
    const handMap = new Map(myHand.map((c) => [c.id, c]));
    let chosenThree: CardData[] = [];

    if (selectedCards && selectedCards.length === 3) {
      for (const c of selectedCards) {
        const real = handMap.get(c.id);
        if (real) {
          chosenThree.push(real);
          handMap.delete(c.id);
        }
      }
    }

    if (chosenThree.length !== 3) {
      chosenThree = DdzRules.selectOptimalSwapThree(myHand);
    }

    this.swapSelections.set(seat, chosenThree);
    this.seatLastAction.set(seat, {
      seat,
      type: 'swap_three',
      patternLabel: '已选三张',
    });

    if (this.swapSelections.size < 3) {
      return {
        valid: true,
        allSwapped: false,
        swapDirection: this.swapDirection,
      };
    }

    // All 3 seats have submitted -> Execute rotation
    for (let s = 0; s < 3; s++) {
      const fromSeat =
        this.swapDirection === 'clockwise' ? (s + 2) % 3 : (s + 1) % 3;
      const outIds = new Set((this.swapSelections.get(s) ?? []).map((c) => c.id));
      const inCards = (this.swapSelections.get(fromSeat) ?? []).map((c) => ({ ...c }));
      const currentHand = this.hands.get(s) ?? [];
      const kept = currentHand.filter((c) => !outIds.has(c.id));
      const merged = DdzRules.sortCardsDesc(
        DdzRules.markWildCards([...kept, ...inCards], this.wildRanks)
      );
      this.hands.set(s, merged);
      this.swappedInCards.set(s, inCards);
      this.initialHands[s] = merged.map((c) => ({ ...c }));
      this.recordStep(
        s,
        'swap_three',
        inCards,
        this.swapDirection === 'clockwise' ? '顺时针换入' : '逆时针换入'
      );
    }

    this.seatLastAction.clear();
    this.phase = 'BIDDING';
    this.currentTurnSeat = this.firstBidderSeat;
    this.turnSeq += 1;

    return {
      valid: true,
      allSwapped: true,
      swapDirection: this.swapDirection,
    };
  }

  private recordStep(
    seat: number,
    actionType: ReplayStep['actionType'],
    cards?: CardData[],
    patternLabel?: string
  ): void {
    this.replaySteps.push({
      stepIndex: this.replaySteps.length,
      seat,
      actionType,
      cards: cards ? cards.map((c) => ({ ...c })) : undefined,
      patternLabel,
      multiplierAfter: this.totalMultiplier,
      wildRanksAfter: [...this.wildRanks],
    });
  }

  /**
   * Analyze the 3 hole cards for special high-stakes multiplier bonus ("双王底牌 ×4", "同花底牌 ×3", "顺子底牌 ×3", etc.)
   */
  getBottomCardsBonus(): { type: string; label: string; multiplier: number } | null {
    if (this.landlordCards.length !== 3) return null;
    const vals = this.landlordCards.map((c) => c.value).sort((a, b) => a - b);
    const suits = this.landlordCards.map((c) => c.suit);

    if (vals.includes(16) && vals.includes(17)) {
      return { type: 'DUAL_JOKER', label: '双王底牌 ×4', multiplier: 4 };
    }
    if (vals[0] === vals[1] && vals[1] === vals[2]) {
      return { type: 'TRIPLE', label: '豹子底牌 ×4', multiplier: 4 };
    }

    const isFlush = suits[0] !== null && suits[0] === suits[1] && suits[1] === suits[2];
    const isStraight = vals[2] <= 14 && vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1;
    if (isFlush && isStraight) {
      return { type: 'STRAIGHT_FLUSH', label: '同花顺底 ×4', multiplier: 4 };
    }
    if (isStraight) {
      return { type: 'STRAIGHT', label: '顺子底牌 ×3', multiplier: 3 };
    }
    if (isFlush) {
      return { type: 'FLUSH', label: '同花底牌 ×3', multiplier: 3 };
    }
    if (vals.includes(17)) {
      return { type: 'BIG_JOKER', label: '大王底牌 ×2', multiplier: 2 };
    }
    if (vals.includes(16)) {
      return { type: 'SMALL_JOKER', label: '小王底牌 ×2', multiplier: 2 };
    }
    if (vals.filter((v) => v === 15).length >= 2) {
      return { type: 'DOUBLE_TWO', label: '双2底牌 ×2', multiplier: 2 };
    }
    if (vals[0] === vals[1] || vals[1] === vals[2]) {
      return { type: 'PAIR', label: '对子底牌 ×2', multiplier: 2 };
    }
    return null;
  }

  getBottomCardsTag(): string | null {
    return this.getBottomCardsBonus()?.label ?? null;
  }

  /**
   * Declare Open-Hand (明牌 ×3 / ×5) during BIDDING, GRABBING, DOUBLING, or before playing first card.
   */
  handleDeclareOpenHand(
    seat: number,
    requestedFactor: 3 | 5 = 3
  ): {
    valid: boolean;
    error?: string;
    factor: 3 | 5;
  } {
    if (
      this.phase !== 'BIDDING' &&
      this.phase !== 'GRABBING' &&
      this.phase !== 'DOUBLING' &&
      this.phase !== 'PLAYING'
    ) {
      return { valid: false, error: '当前阶段不可明牌', factor: 3 };
    }
    if (this.openHandSeats.has(seat)) {
      return { valid: false, error: '您已声明过明牌', factor: this.openHandSeats.get(seat)! };
    }
    if (this.phase === 'PLAYING' && (this.landlordPlayCount > 0 || this.peasantPlayCount > 0)) {
      return { valid: false, error: '出牌后不可再声明明牌', factor: 3 };
    }

    const factor: 3 | 5 =
      this.phase === 'BIDDING' && requestedFactor === 5 ? 5 : 3;
    this.openHandSeats.set(seat, factor);
    this.openHandMultiplier = Math.max(this.openHandMultiplier, factor);

    this.recordStep(seat, 'open_hand', this.hands.get(seat), `明牌 ×${factor}`);
    return { valid: true, factor };
  }

  /**
   * Returns a map of seatIndex -> remaining CardData[] for all seats that declared Open-Hand (明牌)
   * or all 3 seats when in SETTLEMENT showdown.
   */
  getOpenHandsMap(): Record<number, CardData[]> {
    const res: Record<number, CardData[]> = {};
    if (this.phase === 'SETTLEMENT') {
      for (const [s, cards] of this.hands.entries()) {
        res[s] = cards;
      }
      return res;
    }
    for (const [s] of this.openHandSeats.entries()) {
      res[s] = this.hands.get(s) ?? [];
    }
    return res;
  }

  /**
   * Handle "叫地主" / "不叫" in BIDDING phase.
   */
  handleCallLandlord(
    seat: number,
    call: boolean
  ): {
    valid: boolean;
    error?: string;
    nextPhase: 'bidding' | 'grabbing' | 'landlord_confirmed' | 'redeal';
  } {
    if (this.phase !== 'BIDDING' || seat !== this.currentTurnSeat) {
      return { valid: false, error: '当前未轮到您叫地主', nextPhase: 'bidding' };
    }

    this.seatLastAction.set(seat, {
      seat,
      type: call ? 'call' : 'no_call',
    });
    this.recordStep(seat, call ? 'call' : 'no_call', undefined, call ? '叫地主' : '不叫');

    if (call) {
      this.callerSeat = seat;
      this.lastGrabberSeat = seat;

      const queue: number[] = [];
      for (let offset = 1; offset <= 2; offset++) {
        const candidateSeat = (seat + offset) % 3;
        if (!this.passedBiddingSeats.has(candidateSeat)) {
          queue.push(candidateSeat);
        }
      }

      if (queue.length === 0) {
        this.confirmLandlord(seat);
        return { valid: true, nextPhase: 'landlord_confirmed' };
      }

      this.grabQueue = queue;
      this.phase = 'GRABBING';
      this.currentTurnSeat = this.grabQueue.shift()!;
      return { valid: true, nextPhase: 'grabbing' };
    } else {
      this.passedBiddingSeats.add(seat);
      this.biddingStep += 1;

      if (this.biddingStep >= 3) {
        if (this.redealCount < 2) {
          this.redealCount += 1;
          // Leave BIDDING immediately: duplicate / late messages during the redeal delay
          // are rejected by the phase guard and pending turn timers are invalidated.
          this.phase = 'DEALING';
          this.turnSeq += 1;
          return { valid: true, nextPhase: 'redeal' };
        } else {
          this.confirmLandlord(this.firstBidderSeat);
          return { valid: true, nextPhase: 'landlord_confirmed' };
        }
      }

      this.currentTurnSeat = (this.currentTurnSeat + 1) % 3;
      return { valid: true, nextPhase: 'bidding' };
    }
  }

  /**
   * Handle "抢地主" / "不抢" in GRABBING phase.
   */
  handleGrabLandlord(
    seat: number,
    grab: boolean
  ): {
    valid: boolean;
    error?: string;
    nextPhase: 'grabbing' | 'landlord_confirmed';
  } {
    if (this.phase !== 'GRABBING' || seat !== this.currentTurnSeat) {
      return { valid: false, error: '当前未轮到您抢地主', nextPhase: 'grabbing' };
    }

    if (grab) {
      this.grabMultiplier *= 2;
      this.lastGrabberSeat = seat;

      if (!this.hasAnyoneGrabbed && this.callerSeat !== null && seat !== this.callerSeat) {
        this.hasAnyoneGrabbed = true;
        if (!this.grabQueue.includes(this.callerSeat)) {
          this.grabQueue.push(this.callerSeat);
        }
      }
    }

    this.seatLastAction.set(seat, {
      seat,
      type: grab ? 'grab' : 'no_grab',
    });
    this.recordStep(seat, grab ? 'grab' : 'no_grab', undefined, grab ? '抢地主' : '不抢');

    if (this.grabQueue.length > 0) {
      this.currentTurnSeat = this.grabQueue.shift()!;
      return { valid: true, nextPhase: 'grabbing' };
    }

    const finalLandlord = this.lastGrabberSeat ?? this.callerSeat ?? this.firstBidderSeat;
    this.confirmLandlord(finalLandlord);
    return { valid: true, nextPhase: 'landlord_confirmed' };
  }

  private confirmLandlord(seat: number): void {
    this.landlordSeat = seat;
    this.phase = 'LANDLORD_REVEAL';

    // In TianDi Laizi (天地赖子) mode, reveal the second Earth Laizi (地赖子) when Landlord is confirmed
    if (this.dealMode === 'tiandi_laizi' && this.wildRanks.length === 1) {
      const earthWild = DdzRules.pickRandomWildRank(this.wildRanks);
      this.wildRanks = [this.wildRanks[0], earthWild];
    }

    this.landlordCards = DdzRules.markWildCards(this.landlordCards, this.wildRanks);
    const holeBonus = this.getBottomCardsBonus();
    this.bottomCardMultiplier = holeBonus?.multiplier ?? 1;

    for (let s = 0; s < 3; s++) {
      const h = this.hands.get(s) ?? [];
      if (s === seat) {
        const merged = DdzRules.sortCardsDesc(
          DdzRules.markWildCards([...h, ...this.landlordCards], this.wildRanks)
        );
        this.hands.set(s, merged);
      } else {
        this.hands.set(s, DdzRules.markWildCards(h, this.wildRanks));
      }
    }

    this.recordStep(
      seat,
      'landlord_reveal',
      this.landlordCards,
      holeBonus ? `底牌(${holeBonus.label})` : '底牌入库'
    );

    // Transition into DOUBLING phase starting with the Landlord
    this.doublingStep = 0;
    this.seatDoubleFactors.clear();
    this.currentTurnSeat = seat;
    this.phase = 'DOUBLING';
    this.seatLastAction.clear();
  }

  /**
   * Handle "不加倍" (1) / "加倍 ×2" (2) / "超级加倍 ×4" (4) in DOUBLING phase.
   */
  handleDoubleScore(
    seat: number,
    factor: 1 | 2 | 4
  ): {
    valid: boolean;
    error?: string;
    nextPhase: 'doubling' | 'playing';
  } {
    if (this.phase !== 'DOUBLING' || seat !== this.currentTurnSeat) {
      return { valid: false, error: '当前未轮到您选择加倍', nextPhase: 'doubling' };
    }

    const cleanFactor: 1 | 2 | 4 = factor === 4 ? 4 : factor === 2 ? 2 : 1;
    this.seatDoubleFactors.set(seat, cleanFactor);
    if (cleanFactor > 1) {
      this.doubleMultiplier *= cleanFactor;
    }

    const actionType =
      cleanFactor === 4 ? 'double_4' : cleanFactor === 2 ? 'double_2' : 'double_1';
    this.seatLastAction.set(seat, {
      seat,
      type: actionType,
    });
    this.recordStep(
      seat,
      actionType,
      undefined,
      cleanFactor === 4 ? '超级加倍 ×4' : cleanFactor === 2 ? '加倍 ×2' : '不加倍'
    );

    this.doublingStep += 1;
    if (this.doublingStep >= 3) {
      this.phase = 'PLAYING';
      this.currentTurnSeat = this.landlordSeat ?? 0;
      return { valid: true, nextPhase: 'playing' };
    }

    this.currentTurnSeat = (this.currentTurnSeat + 1) % 3;
    return { valid: true, nextPhase: 'doubling' };
  }

  /**
   * Handle playing cards or passing ("不出") in PLAYING phase.
   */
  handlePlayCards(
    seat: number,
    playerId: string,
    selectedCards: CardData[]
  ): {
    valid: boolean;
    error?: string;
    pattern?: ClassifiedPattern | null;
    isRoundOver?: boolean;
  } {
    if (this.phase !== 'PLAYING' || seat !== this.currentTurnSeat) {
      return { valid: false, error: '当前未轮到您出牌' };
    }

    const isFreeLead = !this.lastPlayed || this.lastPlayed.seat === seat;

    if (selectedCards.length === 0) {
      if (isFreeLead) {
        return { valid: false, error: '首出回合必须出牌，不能选择不出' };
      }

      this.passCountInTrick += 1;
      this.seatLastAction.set(seat, { seat, type: 'pass' });
      this.recordStep(seat, 'pass', [], '不出');

      if (this.passCountInTrick >= 2) {
        this.lastPlayed = null;
        this.passCountInTrick = 0;
      }

      this.currentTurnSeat = (seat + 1) % 3;
      return { valid: true, pattern: null, isRoundOver: false };
    }

    const myHand = this.hands.get(seat) ?? [];
    const handMap = new Map(myHand.map((c) => [c.id, c]));
    const authoritativeCards: CardData[] = [];

    for (const c of selectedCards) {
      const realCard = handMap.get(c.id);
      if (!realCard) {
        return { valid: false, error: '所选扑克不在您的手牌中' };
      }
      authoritativeCards.push(realCard);
      handMap.delete(c.id);
    }

    const targetPattern = isFreeLead ? null : this.lastPlayed!.pattern;
    // Ambiguity-aware: picks another legal interpretation if the primary one cannot beat the target.
    const pattern = DdzRules.identifyPatternFor(authoritativeCards, this.wildRanks, targetPattern);
    if (!pattern) {
      return { valid: false, error: '所选牌组不符合《欢乐斗地主》牌型规则（注意四带二不可拆炸弹）' };
    }

    if (!DdzRules.canBeat(pattern, targetPattern)) {
      return { valid: false, error: '所选牌型无法压制上家出牌' };
    }

    const remainingHand = DdzRules.sortCardsDesc(Array.from(handMap.values()));
    this.hands.set(seat, remainingHand);

    if (pattern.type === PatternType.BOMB || pattern.type === PatternType.ROCKET) {
      this.bombMultiplier *= 2;
    }

    if (seat === this.landlordSeat) {
      this.landlordPlayCount += 1;
    } else {
      this.peasantPlayCount += 1;
    }

    this.lastPlayed = {
      seat,
      playerId,
      cards: pattern.cards,
      pattern,
    };
    this.passCountInTrick = 0;
    this.seatLastAction.set(seat, {
      seat,
      type: 'play',
      cards: pattern.cards,
      patternLabel: pattern.label,
    });
    this.recordStep(seat, 'play', pattern.cards, pattern.label);

    if (remainingHand.length === 0) {
      this.phase = 'SETTLEMENT';
      return { valid: true, pattern, isRoundOver: true };
    }

    this.currentTurnSeat = (seat + 1) % 3;
    return { valid: true, pattern, isRoundOver: false };
  }

  getRemainingRankCountsForSeat(viewerSeat: number): Record<Rank, number> {
    const counts: Record<Rank, number> = {
      big_joker: 0,
      small_joker: 0,
      '2': 0,
      A: 0,
      K: 0,
      Q: 0,
      J: 0,
      '10': 0,
      '9': 0,
      '8': 0,
      '7': 0,
      '6': 0,
      '5': 0,
      '4': 0,
      '3': 0,
    };

    for (let s = 0; s < 3; s++) {
      if (s === viewerSeat) continue;
      const hand = this.hands.get(s) ?? [];
      for (const c of hand) {
        counts[c.rank] = (counts[c.rank] ?? 0) + 1;
      }
    }

    if (this.landlordSeat === null) {
      for (const c of this.landlordCards) {
        counts[c.rank] = (counts[c.rank] ?? 0) + 1;
      }
    }

    return counts;
  }
}
