import { randomInt } from 'node:crypto';
import { ConnectionManager } from '../../core/ConnectionManager.js';
import { IGameRoom, RoomPlayerInfo, RoomSummary } from '../../core/RoomManager.js';
import { roomCardEngine } from '../../core/RoomCardEngine.js';
import { storageService } from '../../shared/storage.js';
import {
  callCost,
  canCompareNow,
  compareCost,
  compareHands,
  createZjhDeck,
  evaluateHand,
  raiseOptions,
  resolveShowdown,
  stakeOf,
} from '../../../src/games/zhajinhua/algorithms/ZjhLogic.js';
import {
  ZJH_MAX_ROUNDS,
  ZJH_MAX_SEATS,
  ZJH_STAKE_LEVELS,
  ZJH_TURN_SECONDS,
  type ZjhActionPayload,
  type ZjhCard,
  type ZjhCompareEvent,
  type ZjhMode,
  type ZjhPhase,
  type ZjhSeatSnapshot,
  type ZjhSeatStatus,
  type ZjhSnapshot,
} from '../../../src/games/zhajinhua/types.js';
import { ZjhDebugLogger } from '../../../src/games/zhajinhua/utils/ZjhDebugLogger.js';
import { randomPersonality, ZjhBotEngine, type ZjhBotPersonality } from './ZjhBotEngine.js';

const BOT_PROFILES = [
  { nickname: '金牛·陆九渊AI', avatarId: 'kashen' },
  { nickname: '锦鲤·贝儿AI', avatarId: 'beier' },
  { nickname: '折扇·柳如风AI', avatarId: 'scholar' },
  { nickname: '财神·金百万AI', avatarId: 'noble' },
  { nickname: '红拂女AI', avatarId: 'heroine' },
  { nickname: '凌霄剑仙AI', avatarId: 'warrior' },
];

const START_COUNTDOWN_SECONDS = 3;
const RESULT_COUNTDOWN_SECONDS = 6;
const DEAL_ANIMATION_MS = 1200;
const SHOWDOWN_REVEAL_MS = 1800;
const AFK_TRUSTEESHIP_THRESHOLD = 2;

/** Per-seat state of the hand in progress. */
interface SeatState {
  cards: ZjhCard[];
  status: ZjhSeatStatus;
  seen: boolean;
  contribution: number;
  lastAction: string;
  delta: number;
  isWinner: boolean;
  afkCount: number;
  /** Human left the room mid-hand: seat is folded and removed at the next round start. */
  left: boolean;
  /** Seats that have been shown this seat's cards (compare reveals). */
  knownBy: Set<number>;
  personality: ZjhBotPersonality;
}

const freshState = (personality?: ZjhBotPersonality, afkCount = 0): SeatState => ({
  cards: [],
  status: 'waiting',
  seen: false,
  contribution: 0,
  lastAction: '',
  delta: 0,
  isWinner: false,
  afkCount,
  left: false,
  knownBy: new Set<number>(),
  personality: personality ?? randomPersonality(),
});

const shuffle = <T>(items: T[]): T[] => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

export class ZhajinhuaRoom implements IGameRoom {
  roomId: string;
  gameType = 'zhajinhua';
  hostId: string;
  baseScore: number;
  initialScore: number;
  isPrivate: boolean;
  maxPlayers = ZJH_MAX_SEATS;
  createdAt: number = Date.now();

  private playMode: ZjhMode;
  private seats: Array<RoomPlayerInfo | null> = Array(ZJH_MAX_SEATS).fill(null);
  private state: SeatState[] = Array.from({ length: ZJH_MAX_SEATS }, () => freshState());
  private phase: ZjhPhase = 'WAITING';
  private connectionManager: ConnectionManager;
  private onRoomDestroyed: (roomId: string) => void;
  private hasDealtFirstRound = false;

  // Hand state
  private dealerSeat = -1;
  private currentTurnSeat = -1;
  private turnOpen = false;
  private turnDeadline = 0;
  private round = 1;
  private stakeLevel = 0;
  private acted = new Set<number>();
  private revealAll = false;
  private ledgerApplied = true;
  private lastWinnerSeat = -1;
  private lastCompare: ZjhCompareEvent | null = null;
  private compareCounter = 0;
  private message = '';

  // Timers
  private phaseTimer: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private countdownInterval: NodeJS.Timeout | null = null;
  private countdown = 0;
  private filling = false;
  private destroyed = false;

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
    this.playMode =
      options.mode === 'special' || options.mode === 'bloody' || options.mode === 'quick'
        ? options.mode
        : 'classic';
    this.connectionManager = options.connectionManager;
    this.onRoomDestroyed = options.onRoomDestroyed;
  }

  private get maxRounds(): number {
    if (this.playMode === 'bloody') return 15;
    if (this.playMode === 'quick') return 8;
    return ZJH_MAX_ROUNDS;
  }

  get mode(): string {
    return this.playMode;
  }

  get status(): string {
    return this.phase;
  }

  // ===========================================================================
  // IGameRoom
  // ===========================================================================

  addPlayer(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
    isBot?: boolean;
  }): boolean {
    const existing = this.seats.findIndex((s) => s?.playerId === player.playerId);
    if (existing !== -1) {
      this.seats[existing]!.disconnected = false;
      this.broadcastSnapshot();
      return true;
    }

    const empty = this.seats.findIndex((s) => s === null);
    if (empty === -1) return false;

    this.seats[empty] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: empty,
      beans: player.beans,
      ready: true,
      isBot: Boolean(player.isBot),
      disconnected: false,
      trusteeship: false,
    };
    this.state[empty] = freshState();

    this.broadcastSnapshot();
    if (!this.filling) this.checkAutoStart();
    return true;
  }

  removePlayer(playerId: string): boolean {
    const idx = this.seatOf(playerId);
    if (idx === -1) return false;

    if (this.phase === 'WAITING' || this.phase === 'RESULT') {
      this.seats[idx] = null;
      this.state[idx] = freshState();
      this.broadcastSnapshot();
      return true;
    }

    // Mid-hand: forfeit. Chips already in the pot stay there.
    this.state[idx].left = true;
    if (this.state[idx].status === 'active') {
      this.foldSeat(idx, '离开');
    } else {
      this.broadcastSnapshot();
    }
    return true;
  }

  hasPlayer(playerId: string): boolean {
    return this.seatOf(playerId) !== -1;
  }

  getPlayerCount(): number {
    return this.seats.filter(Boolean).length;
  }

  isEmptyOfHumans(): boolean {
    return !this.seats.some((s, i) => s && !s.isBot && !this.state[i].left);
  }

  setPlayerReady(playerId: string, ready: boolean = true): void {
    const idx = this.seatOf(playerId);
    if (idx === -1) return;
    const seat = this.seats[idx]!;
    if (ready && !seat.isBot && seat.beans < this.baseScore) {
      this.connectionManager.emitToPlayer(playerId, 's2c_bankruptcy_prompt', {
        roomId: this.roomId,
        gameType: this.gameType,
        currentScore: seat.beans,
        baseScore: this.baseScore,
        initialScore: this.initialScore,
      });
      return;
    }
    seat.ready = ready;
    this.broadcastSnapshot();
    if (ready && (this.phase === 'WAITING' || this.phase === 'RESULT')) {
      this.checkAutoStart();
    }
  }

  rebuySeatScore(playerId: string, addedScore: number): number {
    const idx = this.seatOf(playerId);
    if (idx === -1 || !this.seats[idx]) return 0;
    const seat = this.seats[idx]!;
    seat.beans = Math.max(0, seat.beans) + Math.max(0, Math.round(addedScore));
    seat.ready = true;
    this.broadcastSnapshot();
    if (this.phase === 'WAITING' || this.phase === 'RESULT') {
      this.startRound();
    }
    return seat.beans;
  }

  triggerImmediateDeal(): void {
    if (this.phase !== 'WAITING' && this.phase !== 'RESULT') return;
    this.clearTimers();
    this.fillBots();
    this.startRound();
  }

  addBotPlayer(): boolean {
    const empty = this.seats.findIndex((s) => s === null);
    if (empty === -1) return false;

    const used = this.seats.filter(Boolean).map((s) => s!.avatarId);
    const profile =
      BOT_PROFILES.find((b) => !used.includes(b.avatarId)) ?? BOT_PROFILES[empty % BOT_PROFILES.length];

    return this.addPlayer({
      playerId: `bot_zjh_${this.roomId}_${empty}_${Date.now().toString().slice(-4)}`,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      beans: this.botBankroll(),
      isBot: true,
    });
  }

  replaceBotWithHuman(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
  }): boolean {
    if (this.phase !== 'WAITING' && this.phase !== 'RESULT') return false;
    const botIdx = this.seats.findIndex((s) => s?.isBot);
    if (botIdx === -1) return false;
    this.seats[botIdx] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: botIdx,
      beans: player.beans,
      ready: true,
      isBot: false,
      disconnected: false,
      trusteeship: false,
    };
    this.state[botIdx] = freshState();
    this.broadcastSnapshot();
    return true;
  }

  handlePlayerDisconnect(playerId: string): void {
    const idx = this.seatOf(playerId);
    if (idx === -1) return;
    this.seats[idx]!.disconnected = true;
    this.seats[idx]!.trusteeship = true;
    this.broadcastSnapshot();
    if (this.phase === 'BETTING' && this.turnOpen && this.currentTurnSeat === idx) {
      this.scheduleBotTurn(idx, true);
    }
  }

  handlePlayerReconnect(playerId: string): void {
    const idx = this.seatOf(playerId);
    if (idx === -1) return;
    this.seats[idx]!.disconnected = false;
    this.seats[idx]!.trusteeship = false;
    this.sendSnapshotToPlayer(playerId);
    this.broadcastSnapshot();
  }

  handleClientEvent(playerId: string, event: string, payload: unknown): void {
    const idx = this.seatOf(playerId);
    if (idx === -1) return;

    if (event === 'c2s_throw_prop') {
      const data = (payload || {}) as { targetSeat?: number; propType?: string };
      const targetSeat = Number(data.targetSeat);
      const allowedProps = ['flower', 'tea', 'like', 'ingot', 'bomb_cup'];
      const rawProp = String(data.propType ?? 'flower');
      const propType = allowedProps.includes(rawProp) ? rawProp : 'flower';
      if (
        targetSeat >= 0 &&
        targetSeat < this.maxPlayers &&
        targetSeat !== idx &&
        this.seats[targetSeat]
      ) {
        this.seats.forEach((s) => {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_prop_thrown', {
              fromSeat: idx,
              toSeat: targetSeat,
              propType,
              fromNickname: this.seats[idx]!.nickname,
              toNickname: this.seats[targetSeat]!.nickname,
            });
          }
        });
      }
      return;
    }

    if (event === 'c2s_send_chat') {
      const data = (payload || {}) as { text?: string; emoji?: string };
      const text = typeof data.text === 'string' ? data.text.slice(0, 40) : '';
      const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 12) : undefined;
      if (text || emoji) {
        this.seats.forEach((s) => {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_chat_message', {
              playerId,
              seatIndex: idx,
              nickname: this.seats[idx]!.nickname,
              text,
              emoji,
            });
          }
        });
      }
      return;
    }

    if (event === 'c2s_toggle_trusteeship') {
      const seat = this.seats[idx]!;
      const data = (payload || {}) as { trusteeship?: boolean };
      const nextTrust =
        data.trusteeship !== undefined ? Boolean(data.trusteeship) : !seat.trusteeship;
      seat.trusteeship = nextTrust;
      this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
        playerId,
        seatIndex: idx,
        trusteeship: nextTrust,
      });
      this.broadcastSnapshot();
      if (seat.trusteeship && this.phase === 'BETTING' && this.turnOpen && this.currentTurnSeat === idx) {
        this.scheduleBotTurn(idx, true);
      }
      return;
    }

    if (event === 'c2s_zjh_action') {
      const seat = this.seats[idx]!;
      seat.disconnected = false;
      if (seat.trusteeship) {
        seat.trusteeship = false;
        this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
          playerId,
          seatIndex: idx,
          trusteeship: false,
        });
      }
      this.state[idx].afkCount = 0;
      this.performAction(idx, (payload ?? {}) as ZjhActionPayload, false);
    } else if (event === 'c2s_zjh_ready') {
      this.seats[idx]!.disconnected = false;
      this.seats[idx]!.trusteeship = false;
      this.state[idx].afkCount = 0;
      this.broadcastSnapshot();
    }
  }

  getSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      gameType: this.gameType,
      mode: this.playMode,
      hostId: this.hostId,
      baseScore: this.baseScore,
      initialScore: this.initialScore,
      isPrivate: this.isPrivate,
      status: this.phase,
      playerCount: this.getPlayerCount(),
      maxPlayers: this.maxPlayers,
      players: this.seats
        .filter((s): s is RoomPlayerInfo => Boolean(s))
        .map((s) => ({ nickname: s.nickname, avatarId: s.avatarId, isBot: s.isBot })),
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    // Humans who abandon a live hand forfeit what they already put in the pot.
    if (!this.ledgerApplied) {
      this.seats.forEach((seat, i) => {
        const contribution = this.state[i].contribution;
        if (seat && !seat.isBot && contribution > 0) {
          storageService.updateBeans(seat.playerId, -contribution);
        }
      });
      this.ledgerApplied = true;
    }
    this.onRoomDestroyed(this.roomId);
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  private seatOf(playerId: string): number {
    return this.seats.findIndex((s) => s?.playerId === playerId);
  }

  private botBankroll(): number {
    return this.initialScore;
  }

  private clearTurnTimers(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.turnTimer = null;
    this.botTimer = null;
  }

  private clearTimers(): void {
    this.clearTurnTimers();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = null;
  }

  private startCountdown(seconds: number, onComplete: () => void): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdown = seconds;
    this.countdownInterval = setInterval(() => {
      this.countdown -= 1;
      if (this.countdown <= 0) {
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.countdown = 0;
        onComplete();
        return;
      }
      this.broadcastSnapshot();
    }, 1000);
    this.broadcastSnapshot();
  }

  private hasHuman(): boolean {
    return !this.isEmptyOfHumans();
  }

  private fillBots(): void {
    this.filling = true;
    while (this.getPlayerCount() < this.maxPlayers) {
      if (!this.addBotPlayer()) break;
    }
    this.filling = false;
  }

  private checkAutoStart(): void {
    if (this.phase !== 'WAITING' || this.countdownInterval || this.destroyed) return;
    this.fillBots();
    if (!this.hasHuman()) return;
    this.message = '即将开局';
    this.startCountdown(START_COUNTDOWN_SECONDS, () => this.startRound());
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

  private startRound(): void {
    if (this.destroyed) return;
    this.clearTimers();

    // Remove humans who left during the previous hand.
    this.seats.forEach((seat, i) => {
      if (seat && this.state[i].left) {
        this.seats[i] = null;
        this.state[i] = freshState();
      }
    });
    this.fillBots();
    if (!this.hasHuman()) return;

    // Check if any human seat is bankrupt (< baseScore)
    for (const seat of this.seats) {
      if (seat && !seat.isBot && seat.beans < this.baseScore) {
        seat.ready = false;
        this.phase = 'WAITING';
        this.message = '台面积分不足，请补充积分后继续';
        this.broadcastSnapshot();
        this.connectionManager.emitToPlayer(seat.playerId, 's2c_bankruptcy_prompt', {
          roomId: this.roomId,
          gameType: this.gameType,
          currentScore: seat.beans,
          baseScore: this.baseScore,
          initialScore: this.initialScore,
        });
        return;
      }
    }

    // Bots always sit with a healthy bankroll.
    this.seats.forEach((seat) => {
      if (seat?.isBot && seat.beans < this.baseScore * 10) seat.beans = this.botBankroll();
    });

    const participants = this.seats
      .map((seat, i) => (seat && seat.beans >= this.baseScore ? i : -1))
      .filter((i) => i !== -1);

    // AFK counter must survive across hands, otherwise trusteeship can never trigger.
    this.state = this.state.map((s) => freshState(s.personality, s.afkCount));
    this.acted.clear();
    this.revealAll = false;
    this.lastCompare = null;
    this.round = 1;
    this.stakeLevel = 0;
    this.countdown = 0;

    if (participants.length < 2) {
      this.phase = 'WAITING';
      this.message = '积分不足，无法开局';
      this.broadcastSnapshot();
      return;
    }

    if (!this.hasDealtFirstRound) {
      this.hasDealtFirstRound = true;
      this.commitFirstRoundEscrow();
    }

    // Deal 3 cards round-robin from a freshly shuffled deck.
    const deck = shuffle(createZjhDeck());
    for (let c = 0; c < 3; c++) {
      for (const i of participants) this.state[i].cards.push(deck.pop()!);
    }

    // Ante.
    for (const i of participants) {
      this.seats[i]!.beans -= this.baseScore;
      this.state[i].contribution = this.baseScore;
      this.state[i].status = 'active';
      this.state[i].lastAction = '底注';
    }
    this.ledgerApplied = false;

    // Dealer: last winner keeps the button, otherwise rotate (random first hand).
    if (participants.includes(this.lastWinnerSeat)) {
      this.dealerSeat = this.lastWinnerSeat;
    } else if (this.dealerSeat === -1) {
      this.dealerSeat = participants[randomInt(participants.length)];
    } else {
      this.dealerSeat = this.nextLiveSeat(this.dealerSeat);
    }

    this.phase = 'BETTING';
    this.turnOpen = false;
    this.currentTurnSeat = this.nextLiveSeat(this.dealerSeat);
    this.message = `底注 ${this.baseScore}`;
    this.broadcastSnapshot();

    this.phaseTimer = setTimeout(() => this.beginTurn(), DEAL_ANIMATION_MS);
  }

  // ===========================================================================
  // Turn handling
  // ===========================================================================

  private liveSeats(): number[] {
    return this.state.map((s, i) => (s.status === 'active' ? i : -1)).filter((i) => i !== -1);
  }

  private nextLiveSeat(from: number): number {
    for (let step = 1; step <= ZJH_MAX_SEATS; step++) {
      const i = (from + step) % ZJH_MAX_SEATS;
      if (this.seats[i] && (this.state[i].status === 'active' || this.phase === 'WAITING' || this.phase === 'RESULT')) {
        return i;
      }
    }
    return from;
  }

  private isAuto(idx: number): boolean {
    const seat = this.seats[idx];
    return Boolean(seat && (seat.isBot || seat.trusteeship || seat.disconnected || this.state[idx].left));
  }

  private beginTurn(): void {
    if (this.phase !== 'BETTING' || this.destroyed) return;
    this.clearTurnTimers();
    const idx = this.currentTurnSeat;
    this.turnOpen = true;
    this.turnDeadline = Date.now() + ZJH_TURN_SECONDS * 1000;
    this.broadcastSnapshot();

    if (this.isAuto(idx)) this.scheduleBotTurn(idx);
    this.turnTimer = setTimeout(() => this.onTurnTimeout(idx), ZJH_TURN_SECONDS * 1000 + 300);
  }

  private scheduleBotTurn(idx: number, fast = false): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    // When every human is already out of the hand, fast-forward the remaining bots.
    const humanStillIn = this.seats.some(
      (seat, i) => seat && !seat.isBot && !this.state[i].left && this.state[i].status === 'active',
    );
    const delay = fast ? 600 : humanStillIn ? 900 + Math.random() * 1400 : 250 + Math.random() * 250;
    this.botTimer = setTimeout(() => this.runBotTurn(idx), delay);
  }

  private runBotTurn(idx: number): void {
    if (this.phase !== 'BETTING' || !this.turnOpen || this.currentTurnSeat !== idx) return;
    const seat = this.seats[idx];
    if (!seat) return;

    const options = this.optionsFor(idx);
    const payload = ZjhBotEngine.decide({
      seatIndex: idx,
      nickname: seat.nickname,
      mode: this.playMode,
      pot: this.pot(),
      cards: this.state[idx].cards,
      seen: this.state[idx].seen,
      round: this.round,
      maxRounds: this.maxRounds,
      stakeLevel: this.stakeLevel,
      activeCount: this.liveSeats().length,
      beans: seat.beans,
      callCost: options.callCost,
      raiseOptions: options.raiseOptions,
      compareCost: options.compareCost,
      canCompare: options.canCompare,
      compareTargets: options.compareTargets,
      mustAllIn: options.mustAllIn,
      personality: this.state[idx].personality,
    });
    this.performAction(idx, payload, true);
  }

  private onTurnTimeout(idx: number): void {
    if (this.phase !== 'BETTING' || this.currentTurnSeat !== idx || !this.turnOpen) return;
    const seat = this.seats[idx];
    if (!seat) return;
    if (!seat.isBot) {
      this.state[idx].afkCount += 1;
      if (this.state[idx].afkCount >= AFK_TRUSTEESHIP_THRESHOLD) seat.trusteeship = true;
    }
    this.foldSeat(idx, '超时弃牌');
  }

  /** Options + prices for a seat, as shown to the player and used by bots. */
  private optionsFor(idx: number): ZjhSnapshot['my'] {
    const seat = this.seats[idx];
    const st = this.state[idx];
    const none: ZjhSnapshot['my'] = {
      canAct: false,
      canLook: false,
      callCost: 0,
      raiseOptions: [],
      compareCost: 0,
      canCompare: false,
      compareTargets: [],
      canAllIn: false,
      mustAllIn: false,
    };
    if (!seat || this.phase !== 'BETTING' || st.status !== 'active') return none;

    const ctx = { baseScore: this.baseScore, stakeLevel: this.stakeLevel, seen: st.seen };
    const inTurn = this.turnOpen && this.currentTurnSeat === idx;
    const live = this.liveSeats();
    const call = callCost(ctx);
    const cmp = compareCost(ctx);
    const targets = live.filter((s) => s !== idx);
    const mustAllIn = inTurn && seat.beans < call;

    return {
      canAct: inTurn,
      canLook: !st.seen,
      callCost: call,
      raiseOptions: inTurn ? raiseOptions(ctx).filter((o) => o.cost <= seat.beans) : [],
      compareCost: cmp,
      canCompare:
        inTurn &&
        canCompareNow(this.round, live.length, this.playMode) &&
        seat.beans >= cmp &&
        targets.length > 0,
      compareTargets: inTurn ? targets : [],
      canAllIn: mustAllIn,
      mustAllIn,
    };
  }

  private reject(idx: number, text: string): void {
    const seat = this.seats[idx];
    if (seat && !seat.isBot) {
      this.connectionManager.emitToPlayer(seat.playerId, 's2c_zjh_error', { message: text });
    }
  }

  private pay(idx: number, amount: number): void {
    this.seats[idx]!.beans -= amount;
    this.state[idx].contribution += amount;
  }

  private performAction(idx: number, payload: ZjhActionPayload, auto: boolean): void {
    if (this.phase !== 'BETTING') return;
    const seat = this.seats[idx];
    const st = this.state[idx];
    if (!seat || st.status !== 'active') return;

    // Looking at your cards is allowed at any time and never consumes the turn.
    if (payload.action === 'look') {
      if (st.seen) return;
      st.seen = true;
      st.lastAction = '看牌';
      this.broadcastSnapshot();
      if (auto && this.currentTurnSeat === idx) this.scheduleBotTurn(idx, true);
      return;
    }

    if (!this.turnOpen || this.currentTurnSeat !== idx) {
      this.reject(idx, '还没轮到你');
      return;
    }

    const options = this.optionsFor(idx);

    switch (payload.action) {
      case 'fold':
        this.foldSeat(idx, '弃牌');
        return;

      case 'call': {
        if (options.mustAllIn) return this.reject(idx, '豆子不足，只能全押或弃牌');
        this.pay(idx, options.callCost);
        st.lastAction = st.seen ? `跟注 ${options.callCost}` : `闷 ${options.callCost}`;
        break;
      }

      case 'raise': {
        const option = options.raiseOptions.find((o) => o.level === payload.level);
        if (!option) return this.reject(idx, '无法加到该档位');
        this.pay(idx, option.cost);
        this.stakeLevel = option.level;
        st.lastAction = `加注 ${option.cost}`;
        break;
      }

      case 'compare': {
        const target = payload.targetSeat;
        if (!options.canCompare || target === undefined || !options.compareTargets.includes(target)) {
          return this.reject(idx, '当前不能比牌');
        }
        this.pay(idx, options.compareCost);
        this.resolveCompare(idx, target);
        break;
      }

      case 'allin': {
        if (!options.canAllIn) return this.reject(idx, '当前不能全押');
        const all = seat.beans;
        this.pay(idx, all);
        st.status = 'allin';
        st.lastAction = `全押 ${all}`;
        this.message = `${seat.nickname} 全押，直接开牌`;
        this.startShowdown();
        return;
      }

      default:
        return;
    }

    this.afterAction(idx);
  }

  private resolveCompare(from: number, to: number): void {
    const a = this.state[from];
    const b = this.state[to];
    const result = compareHands(a.cards, b.cards, this.playMode);
    const loser = result === 1 ? to : from;
    const winner = loser === from ? to : from;

    // Both players get to see each other's hands.
    a.knownBy.add(to);
    b.knownBy.add(from);

    this.state[loser].status = 'lost';
    this.state[loser].lastAction = '比牌输';
    this.state[winner].lastAction = '比牌赢';
    this.lastCompare = {
      id: ++this.compareCounter,
      fromSeat: from,
      toSeat: to,
      loserSeat: loser,
      tie: result === 0,
    };
    ZjhDebugLogger.logCompareDuel(
      from,
      this.seats[from]?.nickname ?? `#${from}`,
      a.cards,
      to,
      this.seats[to]?.nickname ?? `#${to}`,
      b.cards,
      loser,
      this.playMode,
    );
    this.message = `${this.seats[from]!.nickname} 比牌 ${this.seats[to]!.nickname}，${this.seats[loser]!.nickname} 出局`;
  }

  private foldSeat(idx: number, label: string): void {
    const st = this.state[idx];
    if (st.status !== 'active') return;
    st.status = 'folded';
    st.lastAction = label;
    this.message = `${this.seats[idx]?.nickname ?? ''} ${label}`;

    if (this.phase !== 'BETTING') {
      this.broadcastSnapshot();
      return;
    }
    // Folding out of turn (e.g. leaving) must not skip anyone's turn.
    if (this.currentTurnSeat === idx) {
      this.afterAction(idx);
    } else {
      this.afterAction(this.currentTurnSeat, false);
    }
  }

  /**
   * Common tail of every turn-consuming action.
   * @param advance false when a non-acting seat dropped out and the current turn must stay.
   */
  private afterAction(idx: number, advance = true): void {
    this.clearTurnTimers();
    const live = this.liveSeats();

    if (live.length <= 1) {
      this.endByLastStanding(live[0]);
      return;
    }

    if (!advance) {
      this.beginTurnKeepingClock();
      return;
    }

    this.acted.add(idx);
    if (live.every((s) => this.acted.has(s))) {
      this.round += 1;
      this.acted.clear();
      if (this.round > this.maxRounds) {
        this.message = `已达 ${this.maxRounds} 轮封顶，直接开牌`;
        this.startShowdown();
        return;
      }
    }

    this.currentTurnSeat = this.nextLiveSeat(idx);
    this.beginTurn();
  }

  private beginTurnKeepingClock(): void {
    const remaining = Math.max(1000, this.turnDeadline - Date.now());
    this.broadcastSnapshot();
    const idx = this.currentTurnSeat;
    if (this.isAuto(idx)) this.scheduleBotTurn(idx);
    this.turnTimer = setTimeout(() => this.onTurnTimeout(idx), remaining + 300);
  }

  // ===========================================================================
  // Settlement
  // ===========================================================================

  private pot(): number {
    return this.state.reduce((sum, s) => sum + s.contribution, 0);
  }

  private endByLastStanding(winner: number | undefined): void {
    this.clearTimers();
    this.turnOpen = false;
    if (winner === undefined) {
      this.settle(new Map(), [], false);
      return;
    }
    this.message = `${this.seats[winner]!.nickname} 赢得底池`;
    this.settle(new Map([[winner, this.pot()]]), [winner], false);
  }

  private startShowdown(): void {
    this.clearTimers();
    this.turnOpen = false;
    this.phase = 'SHOWDOWN';
    this.revealAll = true;
    this.broadcastSnapshot();
    this.phaseTimer = setTimeout(() => this.settleShowdown(), SHOWDOWN_REVEAL_MS);
  }

  private settleShowdown(): void {
    const contenders = this.state
      .map((s, seat) => ({ s, seat }))
      .filter(({ s }) => s.cards.length === 3)
      .map(({ s, seat }) => ({
        seat,
        contribution: s.contribution,
        folded: s.status === 'folded' || s.status === 'lost',
        allIn: s.status === 'allin',
        cards: s.cards,
      }));

    // Ties go to the seat closest after the dealer.
    const order: number[] = [];
    for (let step = 1; step <= ZJH_MAX_SEATS; step++) order.push((this.dealerSeat + step) % ZJH_MAX_SEATS);

    const result = resolveShowdown(contenders, this.playMode, order);
    ZjhDebugLogger.logShowdownResult(this.roomId, this.playMode, contenders, result);
    const names = result.winners.map((w) => this.seats[w]?.nickname ?? '').join('、');
    const top = result.winners[0];
    const label = top !== undefined ? evaluateHand(this.state[top].cards).label : '';
    this.message = `${names} 以${label}获胜`;
    this.settle(result.payouts, result.winners, true);
  }

  private settle(payouts: Map<number, number>, winners: number[], reveal: boolean): void {
    this.clearTimers();
    this.turnOpen = false;
    this.revealAll = reveal;

    this.seats.forEach((seat, i) => {
      const st = this.state[i];
      if (!seat || st.cards.length === 0) return;
      const gain = payouts.get(i) ?? 0;
      st.delta = gain - st.contribution;
      st.isWinner = winners.includes(i);
      seat.beans = Math.max(0, seat.beans + gain);
      if (!seat.isBot && st.delta !== 0) {
        storageService.updateBeans(seat.playerId, st.delta);
      }
    });
    this.ledgerApplied = true;
    this.lastWinnerSeat = winners[0] ?? -1;

    const humanIdx = this.seats.findIndex((s) => s && !s.isBot);
    if (humanIdx !== -1 && this.seats[humanIdx]) {
      const human = this.seats[humanIdx]!;
      const updatedRcSession = roomCardEngine.recordRoundSettlement({
        roomId: this.roomId,
        heroId: human.playerId,
        heroDelta: this.state[humanIdx]?.delta ?? 0,
        heroName: human.nickname,
        summaryText: this.message || '诈金花比牌结算',
        peerDeltas: this.seats
          .map((s, idx) =>
            s && idx !== humanIdx
              ? { id: s.playerId, name: s.nickname, delta: this.state[idx]?.delta ?? 0 }
              : null
          )
          .filter((x): x is { id: string; name: string; delta: number } => Boolean(x)),
      });
      if (updatedRcSession) {
        this.seats.forEach((s) => {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_rc_session_sync', {
              session: updatedRcSession,
            });
          }
        });
      }
    }

    this.phase = 'RESULT';
    this.broadcastSnapshot();

    for (const seat of this.seats) {
      if (seat && !seat.isBot && seat.beans < this.baseScore) {
        seat.ready = false;
        this.connectionManager.emitToPlayer(seat.playerId, 's2c_bankruptcy_prompt', {
          roomId: this.roomId,
          gameType: this.gameType,
          currentScore: seat.beans,
          baseScore: this.baseScore,
          initialScore: this.initialScore,
        });
      }
    }

    this.startCountdown(RESULT_COUNTDOWN_SECONDS, () => this.startRound());
  }

  // ===========================================================================
  // Snapshots
  // ===========================================================================

  private visibleCards(target: number, viewer: number): ZjhCard[] | null {
    const st = this.state[target];
    if (st.cards.length !== 3) return null;
    const live = st.status === 'active' || st.status === 'allin';
    if (target === viewer && (st.seen || this.revealAll)) return st.cards;
    if (st.knownBy.has(viewer)) return st.cards;
    if (this.revealAll && live) return st.cards;
    return null;
  }

  private buildSnapshot(viewerId: string): ZjhSnapshot {
    const viewer = this.seatOf(viewerId);

    const seats = this.seats.map((seat, i): ZjhSeatSnapshot | null => {
      if (!seat) return null;
      const st = this.state[i];
      const cards = this.visibleCards(i, viewer);
      return {
        playerId: seat.playerId,
        nickname: seat.nickname,
        avatarId: seat.avatarId,
        seatIndex: i,
        beans: seat.beans,
        isBot: seat.isBot,
        disconnected: seat.disconnected,
        status: st.status,
        seen: st.seen,
        totalBet: st.contribution,
        lastAction: st.lastAction,
        cards,
        handLabel: cards ? evaluateHand(cards).label : '',
        isWinner: st.isWinner,
        delta: this.phase === 'RESULT' ? st.delta : 0,
      };
    });

    const my = this.optionsFor(viewer);

    return {
      roomId: this.roomId,
      phase: this.phase,
      mode: this.playMode,
      baseScore: this.baseScore,
      round: this.round,
      maxRounds: this.maxRounds,
      pot: this.pot(),
      stake: stakeOf(this.baseScore, this.stakeLevel),
      stakeLevel: Math.min(this.stakeLevel, ZJH_STAKE_LEVELS.length - 1),
      dealerSeat: this.dealerSeat,
      currentTurnSeat: this.phase === 'BETTING' && this.turnOpen ? this.currentTurnSeat : -1,
      turnSecondsLeft:
        this.phase === 'BETTING' && this.turnOpen ? Math.max(0, Math.ceil((this.turnDeadline - Date.now()) / 1000)) : 0,
      countdown: this.countdown,
      mySeat: viewer,
      myTrusteeship: viewer !== -1 && Boolean(this.seats[viewer]?.trusteeship),
      seats,
      my,
      lastCompare: this.lastCompare,
      message: this.message,
    };
  }

  sendSnapshotToPlayer(playerId: string): void {
    this.connectionManager.emitToPlayer(playerId, 's2c_zjh_snapshot', this.buildSnapshot(playerId));
  }

  private broadcastSnapshot(): void {
    if (this.destroyed) return;
    this.seats.forEach((seat) => {
      if (seat && !seat.isBot) this.sendSnapshotToPlayer(seat.playerId);
    });
  }
}
