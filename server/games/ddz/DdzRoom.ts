import { ConnectionManager } from '../../core/ConnectionManager.js';
import { IGameRoom, RoomPlayerInfo, RoomSummary } from '../../core/RoomManager.js';
import { roomCardEngine } from '../../core/RoomCardEngine.js';
import { redisClient } from '../../core/redisClient.js';
import { storageService } from '../../shared/storage.js';
import { DdzBotEngine } from './DdzBotEngine.js';
import { CardData, DdzRules, DealMode } from './DdzRules.js';
import { DdzStateMachine, SettlementSummary } from './DdzStateMachine.js';

const BOT_PROFILES = [
  { nickname: '卡神·陆九渊AI', avatarId: 'kashen' },
  { nickname: '锦鲤·贝儿AI', avatarId: 'beier' },
  { nickname: '棋圣·柳如风AI', avatarId: 'scholar' },
  { nickname: '侠女·红拂女AI', avatarId: 'heroine' },
  { nickname: '剑客·凌霄AI', avatarId: 'warrior' },
  { nickname: '员外·金百万AI', avatarId: 'noble' },
];

const TURN_DURATION_MS = 18000;
const BOT_THINK_DELAY_MS = 1250;
const TRUSTEESHIP_DELAY_MS = 1250;
const SETTLEMENT_AUTO_START_DELAY_MS = 6000;
const PRE_DEAL_ESCROW_WINDOW_MS = 3200;

export class DdzRoom implements IGameRoom {
  roomId: string;
  gameType = 'ddz';
  dealMode: DealMode;
  hostId: string;
  baseScore: number;
  initialScore: number;
  isPrivate: boolean;
  maxPlayers = 3;
  createdAt: number = Date.now();

  private seats: Array<RoomPlayerInfo | null> = [null, null, null];
  private stateMachine: DdzStateMachine = new DdzStateMachine();
  private connectionManager: ConnectionManager;
  private onRoomDestroyed: (roomId: string) => void;
  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private startRoundTimer: NodeJS.Timeout | null = null;
  private redealTimer: NodeJS.Timeout | null = null;
  private hintCursorMap: Map<string, number> = new Map();
  private hasDealtFirstRound = false;

  constructor(options: {
    roomId: string;
    hostId: string;
    baseScore: number;
    initialScore?: number;
    isPrivate: boolean;
    mode?: string;
    connectionManager: ConnectionManager;
    onRoomDestroyed: (roomId: string) => void;
  }) {
    this.roomId = options.roomId;
    this.hostId = options.hostId;
    this.baseScore = options.baseScore;
    this.initialScore =
      options.initialScore && options.initialScore > 0
        ? options.initialScore
        : Math.max(2000, options.baseScore * 20);
    this.isPrivate = options.isPrivate;
    const validModes: DealMode[] = [
      'classic',
      'no_shuffle',
      'laizi',
      'tiandi_laizi',
      'swap_three',
    ];
    this.dealMode = validModes.includes(options.mode as DealMode)
      ? (options.mode as DealMode)
      : 'classic';
    this.connectionManager = options.connectionManager;
    this.onRoomDestroyed = options.onRoomDestroyed;
  }

  get mode(): string {
    return this.dealMode;
  }

  get status(): string {
    return this.stateMachine.phase;
  }

  addPlayer(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
    isBot?: boolean;
  }): boolean {
    const existingSeat = this.seats.findIndex((s) => s?.playerId === player.playerId);
    if (existingSeat !== -1) {
      this.seats[existingSeat]!.disconnected = false;
      this.broadcastRoomState();
      return true;
    }

    const emptySeat = this.seats.findIndex((s) => s === null);
    if (emptySeat === -1) return false;

    this.seats[emptySeat] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: emptySeat,
      beans: player.beans,
      ready: true,
      isBot: Boolean(player.isBot),
      disconnected: false,
      trusteeship: false,
    };

    this.broadcastRoomState();
    this.checkStartGame();
    return true;
  }

  addBotPlayer(): boolean {
    const emptySeat = this.seats.findIndex((s) => s === null);
    if (emptySeat === -1) return false;

    const usedNames = new Set(this.seats.filter(Boolean).map((s) => s!.nickname));
    const profile =
      BOT_PROFILES.find((p) => !usedNames.has(p.nickname)) ??
      BOT_PROFILES[emptySeat % BOT_PROFILES.length];

    const botDefaultBeans = this.initialScore;
    return this.addPlayer({
      playerId: `bot_${this.roomId}_${emptySeat}_${Date.now().toString().slice(-3)}`,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      beans: botDefaultBeans,
      isBot: true,
    });
  }

  removePlayer(playerId: string): boolean {
    const seatIdx = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIdx === -1) return false;

    if (this.stateMachine.phase !== 'WAITING' && this.stateMachine.phase !== 'SETTLEMENT') {
      const seatPlayer = this.seats[seatIdx]!;
      seatPlayer.disconnected = true;
      seatPlayer.trusteeship = true;
      this.broadcastToRoom('s2c_player_disconnected', { playerId });
      this.broadcastRoomState();
      if (this.stateMachine.currentTurnSeat === seatIdx) {
        this.scheduleAutoTurnAction(seatIdx, TRUSTEESHIP_DELAY_MS);
      }
      return true;
    }

    this.seats[seatIdx] = null;
    if (this.hostId === playerId) {
      const nextHuman = this.seats.find((s) => s && !s.isBot);
      if (nextHuman) {
        this.hostId = nextHuman.playerId;
      }
    }

    this.broadcastRoomState();
    return true;
  }

  hasPlayer(playerId: string): boolean {
    return this.seats.some((s) => s?.playerId === playerId);
  }

  getPlayerCount(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  isEmptyOfHumans(): boolean {
    return !this.seats.some((s) => s !== null && !s.isBot && !s.disconnected);
  }

  replaceBotWithHuman(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
  }): boolean {
    if (this.stateMachine.phase !== 'WAITING' && this.stateMachine.phase !== 'SETTLEMENT') {
      return false;
    }
    const botIdx = this.seats.findIndex((s) => s?.isBot);
    if (botIdx === -1) return false;
    this.seats[botIdx] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: botIdx,
      beans: player.beans,
      ready: false,
      isBot: false,
      disconnected: false,
      trusteeship: false,
    };
    this.broadcastRoomState();
    return true;
  }

  setPlayerReady(playerId: string, ready = true): void {
    const player = this.seats.find((s) => s?.playerId === playerId);
    if (!player) return;

    if (ready && !player.isBot && player.beans < this.baseScore) {
      this.connectionManager.emitToPlayer(playerId, 's2c_bankruptcy_prompt', {
        roomId: this.roomId,
        gameType: this.gameType,
        currentScore: player.beans,
        baseScore: this.baseScore,
        initialScore: this.initialScore,
      });
      return;
    }

    player.ready = ready;
    player.trusteeship = false;

    for (const s of this.seats) {
      if (s && s.isBot) {
        if (s.beans < this.baseScore) s.beans = this.initialScore;
        s.ready = true;
      }
    }

    this.broadcastRoomState();
    this.checkStartGame(180);
  }

  rebuySeatScore(playerId: string, addedScore: number): number {
    const player = this.seats.find((s) => s?.playerId === playerId);
    if (!player) return 0;
    player.beans = Math.max(0, player.beans) + Math.max(0, Math.round(addedScore));
    player.ready = true;
    player.trusteeship = false;
    this.broadcastRoomState();
    this.sendSnapshotToPlayer(playerId);
    this.checkStartGame(280);
    return player.beans;
  }

  triggerImmediateDeal(): void {
    if (this.stateMachine.phase !== 'WAITING' && this.stateMachine.phase !== 'SETTLEMENT') {
      return;
    }
    if (this.startRoundTimer) {
      clearTimeout(this.startRoundTimer);
      this.startRoundTimer = null;
    }
    for (const s of this.seats) {
      if (s && s.isBot) s.ready = true;
    }
    const allSeated = this.seats.every((s) => s !== null);
    if (allSeated) {
      this.startNewRound(false);
    }
  }

  handlePlayerDisconnect(playerId: string): void {
    const seatPlayer = this.seats.find((s) => s?.playerId === playerId);
    if (!seatPlayer) return;

    seatPlayer.disconnected = true;
    seatPlayer.trusteeship = true;

    this.broadcastToRoom('s2c_player_disconnected', { playerId });
    this.broadcastRoomState();

    if (
      (this.stateMachine.phase === 'BIDDING' ||
        this.stateMachine.phase === 'GRABBING' ||
        this.stateMachine.phase === 'DOUBLING' ||
        this.stateMachine.phase === 'PLAYING') &&
      this.stateMachine.currentTurnSeat === seatPlayer.seatIndex
    ) {
      this.scheduleAutoTurnAction(seatPlayer.seatIndex, TRUSTEESHIP_DELAY_MS);
    }
  }

  handlePlayerReconnect(playerId: string): void {
    const seatPlayer = this.seats.find((s) => s?.playerId === playerId);
    if (!seatPlayer) return;

    seatPlayer.disconnected = false;
    seatPlayer.trusteeship = false;

    this.broadcastToRoom('s2c_player_reconnected', { playerId });
    this.broadcastRoomState();
    this.sendSnapshotToPlayer(playerId);

    // A trusteeship auto-action may still be pending for this seat: re-arm a normal human turn
    // timer so the reconnected player is not auto-played.
    const phase = this.stateMachine.phase;
    if (
      this.stateMachine.currentTurnSeat === seatPlayer.seatIndex &&
      (phase === 'BIDDING' || phase === 'GRABBING' || phase === 'DOUBLING' || phase === 'PLAYING')
    ) {
      this.advanceTurnTimer();
    }
  }

  /** Free a seat (host handoff included). Only safe outside an active round. */
  private freeSeat(seatIdx: number): void {
    const leaving = this.seats[seatIdx];
    if (!leaving) return;
    this.seats[seatIdx] = null;
    if (this.hostId === leaving.playerId) {
      const nextHuman = this.seats.find((s) => s && !s.isBot);
      if (nextHuman) {
        this.hostId = nextHuman.playerId;
      }
    }
  }

  handleClientEvent(playerId: string, event: string, payload: unknown): void {
    const seatPlayer = this.seats.find((s) => s?.playerId === playerId);
    if (!seatPlayer) return;

    const seat = seatPlayer.seatIndex;
    const data = (payload ?? {}) as Record<string, unknown>;

    switch (event) {
      case 'c2s_swap_three': {
        const cards = Array.isArray(data.cards) ? (data.cards as CardData[]) : undefined;
        this.onSwapThree(seat, cards);
        break;
      }
      case 'c2s_call_landlord': {
        this.onCallLandlord(seat, Boolean(data.call));
        break;
      }
      case 'c2s_grab_landlord': {
        this.onGrabLandlord(seat, Boolean(data.grab));
        break;
      }
      case 'c2s_double_score': {
        const rawFactor = Number(data.factor);
        const factor: 1 | 2 | 4 = rawFactor === 4 ? 4 : rawFactor === 2 ? 2 : 1;
        this.onDoubleScore(seat, factor);
        break;
      }
      case 'c2s_declare_open_hand': {
        const rawOpenFactor = Number(data.factor);
        const openFactor: 3 | 5 = rawOpenFactor === 5 ? 5 : 3;
        this.onDeclareOpenHand(seat, openFactor);
        break;
      }
      case 'c2s_play_cards': {
        const cards = Array.isArray(data.cards) ? (data.cards as CardData[]) : [];
        this.onPlayCards(seat, cards);
        break;
      }
      case 'c2s_request_hint': {
        this.onRequestHint(seatPlayer);
        break;
      }
      case 'c2s_send_chat': {
        const text = typeof data.text === 'string' ? data.text.slice(0, 40) : '';
        const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 12) : undefined;
        if (text || emoji) {
          this.broadcastToRoom('s2c_chat_message', {
            playerId: seatPlayer.playerId,
            seatIndex: seat,
            nickname: seatPlayer.nickname,
            text,
            emoji,
          });
        }
        break;
      }
      case 'c2s_throw_prop': {
        const targetSeat = Number(data.targetSeat);
        const allowedProps = ['flower', 'tea', 'like', 'ingot', 'egg', 'slipper', 'bomb_cup'];
        const rawProp = String(data.propType ?? 'flower');
        const propType = allowedProps.includes(rawProp) ? rawProp : 'flower';
        if ([0, 1, 2].includes(targetSeat) && targetSeat !== seat && this.seats[targetSeat]) {
          this.broadcastToRoom('s2c_prop_thrown', {
            fromSeat: seat,
            toSeat: targetSeat,
            propType,
            fromNickname: seatPlayer.nickname,
            toNickname: this.seats[targetSeat]!.nickname,
          });
        }
        break;
      }
      case 'c2s_toggle_trusteeship': {
        const enabled =
          typeof data.trusteeship === 'boolean' ? data.trusteeship : !seatPlayer.trusteeship;
        seatPlayer.trusteeship = enabled;
        this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_trusteeship_changed', {
          playerId: seatPlayer.playerId,
          seatIndex: seat,
          trusteeship: enabled,
        });
        this.broadcastRoomState();
        if (
          enabled &&
          this.stateMachine.currentTurnSeat === seat &&
          (this.stateMachine.phase === 'BIDDING' ||
            this.stateMachine.phase === 'GRABBING' ||
            this.stateMachine.phase === 'DOUBLING' ||
            this.stateMachine.phase === 'PLAYING')
        ) {
          this.scheduleAutoTurnAction(seat, 600);
        }
        break;
      }
      default:
        break;
    }
  }

  private checkStartGame(delayMs = 280): void {
    if (this.stateMachine.phase !== 'WAITING' && this.stateMachine.phase !== 'SETTLEMENT') {
      return;
    }

    // Check if any human seat is bankrupt (< baseScore)
    for (const s of this.seats) {
      if (s && !s.isBot && s.beans < this.baseScore) {
        s.ready = false;
        this.connectionManager.emitToPlayer(s.playerId, 's2c_bankruptcy_prompt', {
          roomId: this.roomId,
          gameType: this.gameType,
          currentScore: s.beans,
          baseScore: this.baseScore,
          initialScore: this.initialScore,
        });
        return;
      }
      if (s && s.isBot && s.beans < this.baseScore) {
        s.beans = this.initialScore;
      }
    }

    const allSeatedAndReady = this.seats.every((s) => s !== null && s.ready);
    if (!allSeatedAndReady) return;

    const effectiveDelay = !this.hasDealtFirstRound
      ? Math.max(delayMs, PRE_DEAL_ESCROW_WINDOW_MS)
      : delayMs;

    if (this.startRoundTimer) return;
    this.startRoundTimer = setTimeout(() => {
      this.startRoundTimer = null;
      const stillReady = this.seats.every((s) => s !== null && s.ready && s.beans >= this.baseScore);
      if (
        stillReady &&
        (this.stateMachine.phase === 'WAITING' || this.stateMachine.phase === 'SETTLEMENT')
      ) {
        this.startNewRound(false);
      }
    }, effectiveDelay);
  }

  private commitFirstRoundEscrow(): void {
    const { capturedTotal, session } = roomCardEngine.captureEscrowOnFirstRound(this.roomId);
    if (!session) return;
    for (const seat of this.seats) {
      if (seat && !seat.isBot) {
        const updatedProfile = storageService.getUser(seat.playerId);
        this.connectionManager.emitToPlayer(seat.playerId, 's2c_rc_session_sync', {
          session,
          profile: updatedProfile,
          action: 'escrow_captured',
          capturedTotal,
        });
        if (updatedProfile && capturedTotal > 0) {
          this.connectionManager.emitToPlayer(seat.playerId, 's2c_profile_updated', {
            profile: updatedProfile,
          });
        }
      }
    }
  }

  private startNewRound(isRedeal: boolean): void {
    this.clearTimers();
    if (this.redealTimer) {
      clearTimeout(this.redealTimer);
      this.redealTimer = null;
    }
    this.hintCursorMap.clear();
    if (!isRedeal) {
      this.stateMachine.redealCount = 0;
    }
    if (!this.hasDealtFirstRound) {
      this.hasDealtFirstRound = true;
      this.commitFirstRoundEscrow();
    }
    this.stateMachine.startDealing(this.dealMode);

    console.log(
      `[DDZ-SERVER-DEBUG][发牌] 房间:${this.roomId} | 模式:${this.dealMode} | 赖子:${JSON.stringify(this.stateMachine.wildRanks)} | 底牌:${DdzRules.formatCards(this.stateMachine.landlordCards)}`
    );
    for (let s = 0; s < 3; s++) {
      const hand = this.stateMachine.hands.get(s) ?? [];
      const part = DdzBotEngine.partitionHand(hand, this.stateMachine.wildRanks);
      console.log(
        `  ├─ Seat#${s} (${this.seats[s]?.nickname ?? 'Empty'}) 初始手牌(${hand.length}张): ${DdzRules.formatCards(hand)} | 拆牌:`,
        DdzBotEngine.formatPartitionSummary(part)
      );
    }

    this.broadcastRoomState();

    for (let seat = 0; seat < 3; seat++) {
      const p = this.seats[seat];
      if (!p || p.isBot) continue;

      const myCards = this.stateMachine.hands.get(seat) ?? [];
      const othersCount: Record<string, number> = {};
      for (let otherSeat = 0; otherSeat < 3; otherSeat++) {
        if (otherSeat === seat) continue;
        const otherPlayer = this.seats[otherSeat];
        if (otherPlayer) {
          othersCount[otherPlayer.playerId] = (this.stateMachine.hands.get(otherSeat) ?? []).length;
        }
      }

      this.connectionManager.emitToPlayer(p.playerId, 's2c_cards_dealt', {
        myCards,
        othersCount,
        multiplier: this.stateMachine.totalMultiplier,
        wildRanks: this.stateMachine.wildRanks,
        cardRecorder: this.stateMachine.getRemainingRankCountsForSeat(seat),
        swapDirection: this.stateMachine.swapDirection,
      });
    }

    if (this.stateMachine.phase === 'SWAPPING') {
      this.startSwappingPhaseTimer();
      return;
    }

    this.advanceTurnTimer();
  }

  /** Tracked redeal delay (all 3 passed). Cancelled on destroy / new round. */
  private scheduleRedeal(): void {
    if (this.redealTimer) clearTimeout(this.redealTimer);
    this.redealTimer = setTimeout(() => {
      this.redealTimer = null;
      if (this.stateMachine.phase !== 'DEALING') return;
      this.startNewRound(true);
    }, 1200);
  }

  private startSwappingPhaseTimer(): void {
    this.clearTimers();
    this.stateMachine.turnSeq += 1;
    const expectedSeq = this.stateMachine.turnSeq;
    const now = Date.now();
    const timeoutAt = now + 12000;
    this.stateMachine.turnTimeoutAt = timeoutAt;

    this.broadcastToRoom('s2c_turn_change', {
      currentPlayerId: null,
      currentSeat: this.stateMachine.currentTurnSeat,
      phase: 'SWAPPING',
      timeoutAt,
      serverTime: now,
      isFreeLead: false,
      swapDirection: this.stateMachine.swapDirection,
    });

    // Bots immediately submit their optimal 3 cards
    this.botTimer = setTimeout(() => {
      if (this.stateMachine.turnSeq !== expectedSeq || this.stateMachine.phase !== 'SWAPPING') {
        return;
      }
      for (let s = 0; s < 3; s++) {
        const p = this.seats[s];
        if (p && (p.isBot || p.trusteeship || p.disconnected)) {
          this.onSwapThree(s);
        }
      }
    }, 550);

    // Timeout auto-submits any remaining human seat
    this.turnTimer = setTimeout(() => {
      if (this.stateMachine.turnSeq !== expectedSeq || this.stateMachine.phase !== 'SWAPPING') {
        return;
      }
      for (let s = 0; s < 3; s++) {
        if (!this.stateMachine.swapSelections.has(s)) {
          this.onSwapThree(s);
        }
      }
    }, 12000);
  }

  private onSwapThree(seat: number, selectedCards?: CardData[]): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer || this.stateMachine.phase !== 'SWAPPING') return;

    const res = this.stateMachine.handleSubmitSwapThree(seat, selectedCards);
    if (!res.valid) {
      if (!seatPlayer.isBot) {
        this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
          message: res.error ?? '换三张提交失败',
        });
      }
      return;
    }

    if (!res.allSwapped) {
      this.broadcastRoomState();
      for (let s = 0; s < 3; s++) {
        const p = this.seats[s];
        if (p && !p.isBot) {
          this.sendSnapshotToPlayer(p.playerId);
        }
      }
      return;
    }

    // All 3 seats have completed swapping -> notify each player of their new hand & swapped-in cards
    this.clearTimers();
    for (let s = 0; s < 3; s++) {
      const p = this.seats[s];
      if (!p || p.isBot) continue;
      const inCards = this.stateMachine.swappedInCards.get(s) ?? [];
      const outCards = this.stateMachine.swapSelections.get(s) ?? [];
      this.connectionManager.emitToPlayer(p.playerId, 's2c_swap_three_result', {
        swapDirection: res.swapDirection,
        swappedInCards: inCards,
        swappedOutCards: outCards,
        myCards: this.stateMachine.hands.get(s) ?? [],
        cardRecorder: this.stateMachine.getRemainingRankCountsForSeat(s),
      });
    }

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private onCallLandlord(seat: number, call: boolean): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    // Validate FIRST: a rejected / out-of-turn message must never touch the running turn timers.
    const res = this.stateMachine.handleCallLandlord(seat, call);
    if (!res.valid) {
      this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
        message: res.error ?? '无效操作',
      });
      return;
    }
    this.clearTimers();

    this.broadcastToRoom('s2c_call_result', {
      playerId: seatPlayer.playerId,
      seatIndex: seat,
      actionType: 'call',
      call,
      multiplier: this.stateMachine.totalMultiplier,
      nextPhase: res.nextPhase,
    });

    if (res.nextPhase === 'redeal') {
      // State machine already moved to DEALING, so no further bidding input is accepted.
      this.scheduleRedeal();
      return;
    }

    if (res.nextPhase === 'landlord_confirmed') {
      this.broadcastLandlordConfirmed();
      return;
    }

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private onGrabLandlord(seat: number, grab: boolean): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    const res = this.stateMachine.handleGrabLandlord(seat, grab);
    if (!res.valid) {
      this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
        message: res.error ?? '无效操作',
      });
      return;
    }
    this.clearTimers();

    this.broadcastToRoom('s2c_call_result', {
      playerId: seatPlayer.playerId,
      seatIndex: seat,
      actionType: 'grab',
      call: grab,
      multiplier: this.stateMachine.totalMultiplier,
      nextPhase: res.nextPhase,
    });

    if (res.nextPhase === 'landlord_confirmed') {
      this.broadcastLandlordConfirmed();
      return;
    }

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private broadcastLandlordConfirmed(): void {
    const landlordSeat = this.stateMachine.landlordSeat!;
    const landlordPlayer = this.seats[landlordSeat]!;
    const bottomCardsTag = this.stateMachine.getBottomCardsTag();
    const holeCardBonus = this.stateMachine.getBottomCardsBonus();
    const openHands = this.stateMachine.getOpenHandsMap();

    for (let seat = 0; seat < 3; seat++) {
      const p = this.seats[seat];
      if (!p || p.isBot) continue;

      const othersCount: Record<string, number> = {};
      for (let os = 0; os < 3; os++) {
        if (os === seat) continue;
        const op = this.seats[os];
        if (op) {
          othersCount[op.playerId] = (this.stateMachine.hands.get(os) ?? []).length;
        }
      }

      this.connectionManager.emitToPlayer(p.playerId, 's2c_landlord_confirmed', {
        landlordId: landlordPlayer.playerId,
        landlordSeat,
        landlordCards: this.stateMachine.landlordCards,
        bottomCardsTag,
        holeCardBonus,
        openHandMultiplier: this.stateMachine.openHandMultiplier,
        openHands,
        multiplier: this.stateMachine.totalMultiplier,
        wildRanks: this.stateMachine.wildRanks,
        myCards: this.stateMachine.hands.get(seat) ?? [],
        othersCount,
        cardRecorder: this.stateMachine.getRemainingRankCountsForSeat(seat),
      });
    }

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private onDeclareOpenHand(seat: number, factor: 3 | 5 = 3): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    const res = this.stateMachine.handleDeclareOpenHand(seat, factor);
    if (!res.valid) {
      if (!seatPlayer.isBot) {
        this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
          message: res.error ?? '当前不可明牌',
        });
      }
      return;
    }

    this.broadcastToRoom('s2c_open_hand_declared', {
      playerId: seatPlayer.playerId,
      seatIndex: seat,
      factor: res.factor,
      multiplier: this.stateMachine.totalMultiplier,
      openHandMultiplier: this.stateMachine.openHandMultiplier,
      openHands: this.stateMachine.getOpenHandsMap(),
    });
    this.broadcastRoomState();
  }

  private onDoubleScore(seat: number, factor: 1 | 2 | 4): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    const res = this.stateMachine.handleDoubleScore(seat, factor);
    if (!res.valid) {
      this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
        message: res.error ?? '无效加倍操作',
      });
      return;
    }
    this.clearTimers();

    this.broadcastToRoom('s2c_double_result', {
      playerId: seatPlayer.playerId,
      seatIndex: seat,
      factor,
      multiplier: this.stateMachine.totalMultiplier,
      nextPhase: res.nextPhase,
    });

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private onPlayCards(seat: number, selectedCards: CardData[]): void {
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    const res = this.stateMachine.handlePlayCards(seat, seatPlayer.playerId, selectedCards);
    if (!res.valid) {
      this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_action_error', {
        message: res.error ?? '出牌不符合规则',
      });
      return;
    }

    this.clearTimers();
    this.hintCursorMap.delete(seatPlayer.playerId);

    const remainingMyCards = this.stateMachine.hands.get(seat) ?? [];
    const roleLabel = seat === this.stateMachine.landlordSeat ? '地主' : '农民';
    if (res.pattern) {
      const voiceFile = DdzRules.resolveVoiceFile(res.pattern.type, res.pattern.mainValue);
      console.log(
        `[DDZ-SERVER-DEBUG][出牌/读牌] 房间:${this.roomId} | Seat#${seat}(${seatPlayer.nickname}/${roleLabel}) -> ${res.pattern.label}(${res.pattern.type}, 主牌值=${res.pattern.mainValue}[${DdzRules.valueToLabel(res.pattern.mainValue)}], 优先级=${res.pattern.priority ?? 0}, 音频=${voiceFile}) | 出牌:${DdzRules.formatCards(res.pattern.cards)} | 剩余(${remainingMyCards.length}张):${DdzRules.formatCards(remainingMyCards)}`
      );
    } else {
      console.log(
        `[DDZ-SERVER-DEBUG][不出] 房间:${this.roomId} | Seat#${seat}(${seatPlayer.nickname}/${roleLabel}) -> 不出(PASS) | 剩余(${remainingMyCards.length}张):${DdzRules.formatCards(remainingMyCards)}`
      );
    }

    for (let viewerSeat = 0; viewerSeat < 3; viewerSeat++) {
      const viewer = this.seats[viewerSeat];
      if (!viewer || viewer.isBot) continue;

      const othersCount: Record<string, number> = {};
      for (let os = 0; os < 3; os++) {
        if (os === viewerSeat) continue;
        const op = this.seats[os];
        if (op) {
          othersCount[op.playerId] = (this.stateMachine.hands.get(os) ?? []).length;
        }
      }

      this.connectionManager.emitToPlayer(viewer.playerId, 's2c_cards_played', {
        playerId: seatPlayer.playerId,
        seatIndex: seat,
        cards: res.pattern ? res.pattern.cards : [],
        pattern: res.pattern ? res.pattern.type : 'PASS',
        patternLabel: res.pattern ? res.pattern.label : '不出',
        mainValue: res.pattern ? res.pattern.mainValue : 0,
        multiplier: this.stateMachine.totalMultiplier,
        openHands: this.stateMachine.getOpenHandsMap(),
        wildRanks: this.stateMachine.wildRanks,
        remainingCount: remainingMyCards.length,
        myCards: this.stateMachine.hands.get(viewerSeat) ?? [],
        othersCount,
        cardRecorder: this.stateMachine.getRemainingRankCountsForSeat(viewerSeat),
        isNewTrick: this.stateMachine.lastPlayed === null,
      });
    }

    if (res.isRoundOver) {
      this.handleSettlement(seat);
      return;
    }

    this.broadcastRoomState();
    this.advanceTurnTimer();
  }

  private onRequestHint(seatPlayer: RoomPlayerInfo): void {
    const seat = seatPlayer.seatIndex;
    if (this.stateMachine.phase !== 'PLAYING' || this.stateMachine.currentTurnSeat !== seat) {
      return;
    }

    const myCards = this.stateMachine.hands.get(seat) ?? [];
    const target =
      this.stateMachine.lastPlayed && this.stateMachine.lastPlayed.seat !== seat
        ? this.stateMachine.lastPlayed.pattern
        : null;

    const moves = DdzBotEngine.findAllPlayableMoves(
      myCards,
      target,
      this.stateMachine.wildRanks
    );
    if (moves.length === 0) {
      this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_hint_result', {
        cards: [],
        noPlayableMove: true,
      });
      return;
    }

    const cursor = this.hintCursorMap.get(seatPlayer.playerId) ?? 0;
    const chosenMove = moves[cursor % moves.length];
    this.hintCursorMap.set(seatPlayer.playerId, (cursor + 1) % moves.length);

    this.connectionManager.emitToPlayer(seatPlayer.playerId, 's2c_hint_result', {
      cards: chosenMove,
      noPlayableMove: false,
    });
  }

  private handleSettlement(winnerSeat: number): void {
    this.clearTimers();

    const landlordSeat = this.stateMachine.landlordSeat!;
    const isLandlordWin = winnerSeat === landlordSeat;

    const isSpring = isLandlordWin && this.stateMachine.peasantPlayCount === 0;
    const isAntiSpring = !isLandlordWin && this.stateMachine.landlordPlayCount <= 1;

    if (isSpring || isAntiSpring) {
      this.stateMachine.springMultiplier = 2;
    }

    const totalMul = this.stateMachine.totalMultiplier;
    const maxMultiplier = DdzRules.getMaxMultiplierForBaseScore(this.baseScore);
    const effectiveMultiplier = Math.min(totalMul, maxMultiplier);
    const isCapped = totalMul > maxMultiplier;
    const unitScore = this.baseScore * effectiveMultiplier;

    const scoreChanges: Record<string, number> = {};
    const remainingHands: Record<string, CardData[]> = {};
    const bankruptProtectedIds: string[] = [];
    const storageResults: Array<{
      playerId: string;
      nickname: string;
      isBot: boolean;
      role: string;
      scoreDelta: number;
      isWinner: boolean;
    }> = [];

    // Whitepaper 2.6 Anti-Bust & Cap Mathematical Model
    const peasantSeats = [0, 1, 2].filter((s) => s !== landlordSeat);
    const landlordPlayer = this.seats[landlordSeat]!;

    let landlordTotalDelta = 0;
    for (const ps of peasantSeats) {
      const peasantPlayer = this.seats[ps]!;
      let peasantRaw = unitScore;
      // Strictly zero-sum: the payer can never lose more than they own.
      //  - landlord wins: each peasant pays at most their own balance
      //  - landlord loses: landlord pays each peasant at most half of the landlord's balance
      const maxAffordable = isLandlordWin
        ? Math.max(0, peasantPlayer.beans)
        : Math.max(0, Math.floor(landlordPlayer.beans / 2));
      if (peasantRaw > maxAffordable) {
        if (!isLandlordWin && !bankruptProtectedIds.includes(landlordPlayer.playerId)) {
          bankruptProtectedIds.push(landlordPlayer.playerId);
        }
        if (isLandlordWin && !bankruptProtectedIds.includes(peasantPlayer.playerId)) {
          bankruptProtectedIds.push(peasantPlayer.playerId);
        }
        peasantRaw = maxAffordable;
      }

      const pDelta = isLandlordWin ? -peasantRaw : peasantRaw;
      scoreChanges[peasantPlayer.playerId] = pDelta;
      landlordTotalDelta -= pDelta;
    }
    scoreChanges[landlordPlayer.playerId] = landlordTotalDelta;

    for (let s = 0; s < 3; s++) {
      const p = this.seats[s]!;
      const isLandlord = s === landlordSeat;
      const isWinner = isLandlord ? isLandlordWin : !isLandlordWin;
      const delta = scoreChanges[p.playerId] ?? 0;

      remainingHands[p.playerId] = this.stateMachine.hands.get(s) ?? [];
      p.beans = Math.max(0, p.beans + delta);
      if (p.isBot && p.beans < this.baseScore) {
        p.beans = this.initialScore;
      }
      // Trusteeship (AFK) humans auto-ready only if not bankrupt
      p.ready = p.isBot || (p.trusteeship && p.beans >= this.baseScore);

      storageResults.push({
        playerId: p.playerId,
        nickname: p.nickname,
        isBot: p.isBot,
        role: isLandlord ? 'landlord' : 'peasant',
        scoreDelta: delta,
        isWinner,
      });
    }

    const replaySeats = [0, 1, 2].map((s) => {
      const p = this.seats[s]!;
      const isLandlord = s === landlordSeat;
      return {
        seatIndex: s,
        playerId: p.playerId,
        nickname: p.nickname,
        avatarId: p.avatarId,
        role: (isLandlord ? 'landlord' : 'peasant') as 'landlord' | 'peasant',
        scoreDelta: scoreChanges[p.playerId] ?? 0,
        isWinner: isLandlord ? isLandlordWin : !isLandlordWin,
      };
    });

    const matchRecord = storageService.recordSettlement(
      this.roomId,
      this.gameType,
      this.baseScore,
      effectiveMultiplier,
      isLandlordWin ? 'landlord' : 'peasant',
      storageResults,
      {
        roomId: this.roomId,
        dealMode: this.dealMode,
        wildRanks: [...this.stateMachine.wildRanks],
        baseScore: this.baseScore,
        finalMultiplier: effectiveMultiplier,
        landlordSeat,
        winnerSeat,
        isSpring,
        isAntiSpring,
        timestamp: Date.now(),
        seats: replaySeats,
        initialHands: this.stateMachine.initialHands,
        landlordCards: this.stateMachine.landlordCards.map((c) => ({ ...c })),
        steps: [...this.stateMachine.replaySteps],
      }
    );

    // Sync round settlement with RoomCardEngine session
    const humanSeat = this.seats.find((s) => s && !s.isBot);
    if (humanSeat) {
      const updatedRcSession = roomCardEngine.recordRoundSettlement({
        roomId: this.roomId,
        heroId: humanSeat.playerId,
        heroDelta: scoreChanges[humanSeat.playerId] ?? 0,
        heroName: humanSeat.nickname,
        summaryText: isLandlordWin ? '地主获胜' : '农民合作获胜',
        peerDeltas: this.seats
          .filter((s): s is RoomPlayerInfo => s !== null && s.playerId !== humanSeat.playerId)
          .map((s) => ({
            id: s.playerId,
            name: s.nickname,
            delta: scoreChanges[s.playerId] ?? 0,
          })),
      });
      if (updatedRcSession) {
        this.broadcastToRoom('s2c_rc_session_sync', { session: updatedRcSession });
      }
    }

    const savedReplay = storageService.getMatchReplay(matchRecord.id) ?? undefined;
    const winnerPlayer = this.seats[winnerSeat]!;
    const settlementPayload: SettlementSummary = {
      matchId: matchRecord.id,
      winnerId: winnerPlayer.playerId,
      winnerSeat,
      isLandlordWin,
      baseScore: this.baseScore,
      grabMultiplier: this.stateMachine.grabMultiplier,
      doubleMultiplier: this.stateMachine.doubleMultiplier,
      bombMultiplier: this.stateMachine.bombMultiplier,
      springMultiplier: this.stateMachine.springMultiplier,
      bottomCardMultiplier: this.stateMachine.bottomCardMultiplier,
      bottomCardsTag: this.stateMachine.getBottomCardsTag(),
      openHandMultiplier: this.stateMachine.openHandMultiplier,
      totalMultiplier: totalMul,
      maxMultiplier,
      effectiveMultiplier,
      isCapped,
      bankruptProtectedIds,
      isSpring,
      isAntiSpring,
      scoreChanges,
      remainingHands,
      wildRanks: [...this.stateMachine.wildRanks],
      replay: savedReplay,
    };

    this.broadcastToRoom('s2c_game_settlement', settlementPayload);

    // Emit bankruptcy prompt to any human player whose table score dropped below baseScore
    for (let s = 0; s < 3; s++) {
      const p = this.seats[s];
      if (p && !p.isBot && !p.disconnected && p.beans < this.baseScore) {
        p.ready = false;
        this.connectionManager.emitToPlayer(p.playerId, 's2c_bankruptcy_prompt', {
          roomId: this.roomId,
          gameType: this.gameType,
          currentScore: p.beans,
          baseScore: this.baseScore,
          initialScore: this.initialScore,
        });
      }
    }

    // Humans who dropped during the round are released now so they cannot block the next round.
    for (let s = 0; s < 3; s++) {
      const p = this.seats[s];
      if (p && !p.isBot && p.disconnected) {
        this.freeSeat(s);
      }
    }

    this.broadcastRoomState();
    // Everyone left is auto-ready (bots / AFK): give the settlement screen time to show.
    this.checkStartGame(SETTLEMENT_AUTO_START_DELAY_MS);
  }

  private advanceTurnTimer(): void {
    this.clearTimers();
    this.stateMachine.turnSeq += 1;
    const expectedSeq = this.stateMachine.turnSeq;

    const currentSeat = this.stateMachine.currentTurnSeat;
    const currentPlayer = this.seats[currentSeat];
    if (!currentPlayer) return;

    const now = Date.now();
    const timeoutAt = now + TURN_DURATION_MS;
    this.stateMachine.turnTimeoutAt = timeoutAt;

    const isFreeLead =
      this.stateMachine.phase === 'PLAYING' &&
      (!this.stateMachine.lastPlayed || this.stateMachine.lastPlayed.seat === currentSeat);

    this.broadcastToRoom('s2c_turn_change', {
      currentPlayerId: currentPlayer.playerId,
      currentSeat,
      phase: this.stateMachine.phase,
      timeoutAt,
      serverTime: now,
      isFreeLead,
    });

    this.persistStateToRedis();

    if (currentPlayer.isBot) {
      this.scheduleAutoTurnAction(currentSeat, BOT_THINK_DELAY_MS, expectedSeq);
      return;
    }

    if (currentPlayer.trusteeship || currentPlayer.disconnected) {
      this.scheduleAutoTurnAction(currentSeat, TRUSTEESHIP_DELAY_MS, expectedSeq);
      return;
    }

    this.turnTimer = setTimeout(() => {
      if (this.stateMachine.turnSeq !== expectedSeq) return;
      this.handleHumanTurnTimeout(currentSeat);
    }, TURN_DURATION_MS);
  }

  /**
   * A connected human ran out of time. Never decide aggressively for them:
   * bidding -> pass, doubling -> no double, playing -> enter trusteeship (so the
   * next turns are auto-played quickly instead of burning the full timer every turn).
   */
  private handleHumanTurnTimeout(seat: number): void {
    if (this.stateMachine.currentTurnSeat !== seat) return;
    const seatPlayer = this.seats[seat];
    if (!seatPlayer) return;

    switch (this.stateMachine.phase) {
      case 'BIDDING':
        this.onCallLandlord(seat, false);
        return;
      case 'GRABBING':
        this.onGrabLandlord(seat, false);
        return;
      case 'DOUBLING':
        this.onDoubleScore(seat, 1);
        return;
      case 'PLAYING':
        if (!seatPlayer.isBot) {
          seatPlayer.trusteeship = true;
          this.broadcastRoomState();
        }
        this.executeAutoTurnAction(seat);
        return;
      default:
        return;
    }
  }

  private scheduleAutoTurnAction(
    seat: number,
    delayMs: number,
    expectedSeq = this.stateMachine.turnSeq
  ): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => {
      if (this.stateMachine.turnSeq !== expectedSeq) return;
      this.executeAutoTurnAction(seat);
    }, delayMs);
  }

  private executeAutoTurnAction(seat: number): void {
    if (this.stateMachine.currentTurnSeat !== seat) return;

    const myCards = this.stateMachine.hands.get(seat) ?? [];

    if (this.stateMachine.phase === 'BIDDING') {
      const shouldCall = DdzBotEngine.shouldCallOrGrab(
        myCards,
        false,
        this.stateMachine.totalMultiplier,
        this.stateMachine.wildRanks
      );
      this.onCallLandlord(seat, shouldCall);
      return;
    }

    if (this.stateMachine.phase === 'GRABBING') {
      const shouldGrab = DdzBotEngine.shouldCallOrGrab(
        myCards,
        true,
        this.stateMachine.totalMultiplier,
        this.stateMachine.wildRanks
      );
      this.onGrabLandlord(seat, shouldGrab);
      return;
    }

    if (this.stateMachine.phase === 'DOUBLING') {
      const seatPlayer = this.seats[seat];
      const factor =
        seatPlayer && !seatPlayer.isBot && (seatPlayer.trusteeship || seatPlayer.disconnected)
          ? 1
          : DdzBotEngine.chooseDoubleFactor(
              myCards,
              seat === this.stateMachine.landlordSeat,
              this.stateMachine.totalMultiplier,
              this.stateMachine.wildRanks
            );
      this.onDoubleScore(seat, factor);
      return;
    }

    if (this.stateMachine.phase === 'PLAYING') {
      const seatCardCounts: Record<number, number> = {
        0: (this.stateMachine.hands.get(0) ?? []).length,
        1: (this.stateMachine.hands.get(1) ?? []).length,
        2: (this.stateMachine.hands.get(2) ?? []).length,
      };

      const bestMove = DdzBotEngine.chooseBestMove({
        myCards,
        mySeat: seat,
        landlordSeat: this.stateMachine.landlordSeat ?? 0,
        lastPlayed: this.stateMachine.lastPlayed
          ? {
              seat: this.stateMachine.lastPlayed.seat,
              pattern: this.stateMachine.lastPlayed.pattern,
            }
          : null,
        seatCardCounts,
        wildRanks: this.stateMachine.wildRanks,
      });

      this.onPlayCards(seat, bestMove);
    }
  }

  sendSnapshotToPlayer(playerId: string): void {
    const seatIdx = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIdx === -1) return;

    const othersCount: Record<string, number> = {};
    for (let s = 0; s < 3; s++) {
      if (s === seatIdx) continue;
      const p = this.seats[s];
      if (p) {
        othersCount[p.playerId] = (this.stateMachine.hands.get(s) ?? []).length;
      }
    }

    const landlordPlayer =
      this.stateMachine.landlordSeat !== null
        ? this.seats[this.stateMachine.landlordSeat]
        : null;

    const currentPlayer = this.seats[this.stateMachine.currentTurnSeat];
    const isFreeLead =
      this.stateMachine.phase === 'PLAYING' &&
      (!this.stateMachine.lastPlayed || this.stateMachine.lastPlayed.seat === seatIdx);

    this.connectionManager.emitToPlayer(playerId, 's2c_game_snapshot', {
      roomId: this.roomId,
      dealMode: this.dealMode,
      wildRanks: this.stateMachine.wildRanks,
      baseScore: this.baseScore,
      initialScore: this.initialScore,
      maxMultiplier: DdzRules.getMaxMultiplierForBaseScore(this.baseScore),
      isPrivate: this.isPrivate,
      hostId: this.hostId,
      phase: this.stateMachine.phase,
      players: this.seats,
      mySeat: seatIdx,
      myCards: this.stateMachine.hands.get(seatIdx) ?? [],
      othersCount,
      landlordId: landlordPlayer?.playerId ?? null,
      landlordSeat: this.stateMachine.landlordSeat,
      landlordCards:
        this.stateMachine.landlordSeat !== null ? this.stateMachine.landlordCards : [],
      bottomCardsTag:
        this.stateMachine.landlordSeat !== null
          ? this.stateMachine.getBottomCardsTag()
          : null,
      holeCardBonus:
        this.stateMachine.landlordSeat !== null
          ? this.stateMachine.getBottomCardsBonus()
          : null,
      openHandMultiplier: this.stateMachine.openHandMultiplier,
      openHands: this.stateMachine.getOpenHandsMap(),
      multiplier: this.stateMachine.totalMultiplier,
      currentPlayerId: currentPlayer?.playerId ?? null,
      currentSeat: this.stateMachine.currentTurnSeat,
      timeoutAt: this.stateMachine.turnTimeoutAt,
      serverTime: Date.now(),
      isFreeLead,
      lastPlayed: this.stateMachine.lastPlayed
        ? {
            playerId: this.stateMachine.lastPlayed.playerId,
            seatIndex: this.stateMachine.lastPlayed.seat,
            cards: this.stateMachine.lastPlayed.cards,
            patternLabel: this.stateMachine.lastPlayed.pattern.label,
          }
        : null,
      seatLastActions: Array.from(this.stateMachine.seatLastAction.values()),
      cardRecorder: this.stateMachine.getRemainingRankCountsForSeat(seatIdx),
      swapDirection: this.stateMachine.swapDirection,
      swappedInCardIds: (this.stateMachine.swappedInCards.get(seatIdx) ?? []).map((c) => c.id),
      swapSubmittedSeats: Array.from(this.stateMachine.swapSelections.keys()),
    });
  }

  broadcastRoomState(): void {
    const landlordPlayer =
      this.stateMachine.landlordSeat !== null
        ? this.seats[this.stateMachine.landlordSeat]
        : null;

    this.broadcastToRoom('s2c_room_state', {
      roomId: this.roomId,
      gameType: this.gameType,
      dealMode: this.dealMode,
      wildRanks: this.stateMachine.wildRanks,
      hostId: this.hostId,
      baseScore: this.baseScore,
      initialScore: this.initialScore,
      maxMultiplier: DdzRules.getMaxMultiplierForBaseScore(this.baseScore),
      isPrivate: this.isPrivate,
      status: this.stateMachine.phase,
      multiplier: this.stateMachine.totalMultiplier,
      landlordId: landlordPlayer?.playerId ?? null,
      landlordSeat: this.stateMachine.landlordSeat,
      players: this.seats,
    });

    this.persistStateToRedis();
  }

  private broadcastToRoom(event: string, payload: unknown): void {
    for (const seat of this.seats) {
      if (seat && !seat.isBot) {
        this.connectionManager.emitToPlayer(seat.playerId, event, payload);
      }
    }
  }

  private persistStateToRedis(): void {
    redisClient.set(
      `room:${this.roomId}`,
      JSON.stringify({
        roomId: this.roomId,
        dealMode: this.dealMode,
        phase: this.stateMachine.phase,
        baseScore: this.baseScore,
        initialScore: this.initialScore,
        multiplier: this.stateMachine.totalMultiplier,
        landlordSeat: this.stateMachine.landlordSeat,
        currentTurnSeat: this.stateMachine.currentTurnSeat,
        updatedAt: Date.now(),
      }),
      3600
    );
  }

  getSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      gameType: this.gameType,
      mode: this.dealMode,
      hostId: this.hostId,
      baseScore: this.baseScore,
      initialScore: this.initialScore,
      isPrivate: this.isPrivate,
      status: this.stateMachine.phase,
      playerCount: this.getPlayerCount(),
      maxPlayers: this.maxPlayers,
      players: this.seats
        .filter((s): s is RoomPlayerInfo => s !== null)
        .map((s) => ({
          nickname: s.nickname,
          avatarId: s.avatarId,
          isBot: s.isBot,
        })),
    };
  }

  private clearTimers(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  destroy(): void {
    this.clearTimers();
    if (this.startRoundTimer) {
      clearTimeout(this.startRoundTimer);
      this.startRoundTimer = null;
    }
    if (this.redealTimer) {
      clearTimeout(this.redealTimer);
      this.redealTimer = null;
    }
    this.onRoomDestroyed(this.roomId);
  }
}
