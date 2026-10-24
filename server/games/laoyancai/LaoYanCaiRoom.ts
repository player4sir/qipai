import { ConnectionManager } from '../../core/ConnectionManager.js';
import { IGameRoom, RoomPlayerInfo, RoomSummary } from '../../core/RoomManager.js';
import { roomCardEngine } from '../../core/RoomCardEngine.js';
import { storageService } from '../../shared/storage.js';
import {
  LaoYanCaiCard,
  LaoYanCaiDecision,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandResult,
  LaoYanCaiPhase,
  LaoYanCaiPlayerInfo,
  LaoYanCaiPlayMode,
  LaoYanCaiSettlement,
  LaoYanCaiTableSnapshot,
} from '../../../src/games/laoyancai/types.js';
import {
  analyzeLaoYanCaiDrawOdds,
  compareLaoYanCaiHands,
  createStandardLaoYanCaiDeck,
  evaluateLaoYanCaiHand,
  shuffleLaoYanCaiDeck,
} from '../../../src/games/laoyancai/algorithms/LaoYanCaiLogic.js';
import { LaoYanCaiDebugLogger } from '../../../src/games/laoyancai/utils/LaoYanCaiDebugLogger.js';
import { LaoYanCaiBotEngine } from './LaoYanCaiBotEngine.js';

const BOT_PROFILES = [
  { nickname: '滇池·阿鹏AI', avatarId: 'kashen' },
  { nickname: '玉溪·金花AI', avatarId: 'beier' },
  { nickname: '翠湖·柳先生AI', avatarId: 'scholar' },
  { nickname: '苍山·金掌柜AI', avatarId: 'noble' },
  { nickname: '版纳·红拂AI', avatarId: 'heroine' },
  { nickname: '抚仙·剑客AI', avatarId: 'warrior' },
];

export class LaoYanCaiRoom implements IGameRoom {
  roomId: string;
  gameType = 'laoyancai';
  hostId: string;
  baseScore: number;
  initialScore: number;
  isPrivate: boolean;
  maxPlayers = 5;
  createdAt: number = Date.now();

  private playMode: LaoYanCaiPlayMode;
  private seats: Array<RoomPlayerInfo | null> = [null, null, null, null, null];
  private phase: LaoYanCaiPhase = 'WAITING';
  private connectionManager: ConnectionManager;
  private onRoomDestroyed: (roomId: string) => void;
  private hasDealtFirstRound = false;

  // Game Round State
  private deck: LaoYanCaiCard[] = [];
  private hands: LaoYanCaiCard[][] = [[], [], [], [], []];
  private callMultipliers: number[] = [-1, -1, -1, -1, -1];
  private betMultipliers: number[] = [0, 0, 0, 0, 0];
  private decisions: LaoYanCaiDecision[] = [
    'PENDING',
    'PENDING',
    'PENDING',
    'PENDING',
    'PENDING',
  ];
  private hasRevealed: boolean[] = [false, false, false, false, false];
  private handResults: (LaoYanCaiHandResult | undefined)[] = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];
  private drawOddsList: (LaoYanCaiDrawOdds | undefined)[] = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];
  private scoreDeltas: number[] = [0, 0, 0, 0, 0];
  private dealerSeatId: number = 0;
  private bankerZhaKaiAll: boolean = false;
  private currentSettlement?: LaoYanCaiSettlement;

  // Timers
  private phaseTimer: NodeJS.Timeout | null = null;
  private botActionTimers: NodeJS.Timeout[] = [];
  private countdown: number = 0;
  private countdownInterval: NodeJS.Timeout | null = null;

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
      options.mode === 'yuxi' || options.mode === 'crazy' ? options.mode : 'kunming';
    this.connectionManager = options.connectionManager;
    this.onRoomDestroyed = options.onRoomDestroyed;
  }

  get mode(): string {
    return this.playMode;
  }

  get status(): string {
    return this.phase;
  }

  addPlayer(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
    isBot?: boolean;
  }): boolean {
    const existingIndex = this.seats.findIndex((s) => s?.playerId === player.playerId);
    if (existingIndex !== -1) {
      this.seats[existingIndex]!.disconnected = false;
      this.broadcastSnapshot();
      return true;
    }

    const emptyIndex = this.seats.findIndex((s) => s === null);
    if (emptyIndex === -1) return false;

    this.seats[emptyIndex] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: emptyIndex,
      beans: player.beans,
      ready: true,
      isBot: Boolean(player.isBot),
      disconnected: false,
      trusteeship: false,
    };

    this.broadcastSnapshot();
    this.checkAutoStart();
    return true;
  }

  removePlayer(playerId: string): boolean {
    const seatIndex = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1) return false;

    if (this.phase !== 'WAITING' && this.phase !== 'ROUND_RESULT') {
      this.seats[seatIndex]!.disconnected = true;
      this.broadcastSnapshot();
      return true;
    }

    this.seats[seatIndex] = null;
    this.broadcastSnapshot();

    if (this.isEmptyOfHumans()) {
      this.destroy();
    }
    return true;
  }

  hasPlayer(playerId: string): boolean {
    return this.seats.some((s) => s?.playerId === playerId);
  }

  getPlayerCount(): number {
    return this.seats.filter(Boolean).length;
  }

  isEmptyOfHumans(): boolean {
    return !this.seats.some((s) => s && !s.isBot);
  }

  setPlayerReady(playerId: string, ready: boolean = true): void {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (seat) {
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
      this.checkAutoStart();
    }
  }

  rebuySeatScore(playerId: string, addedScore: number): number {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (!seat) return 0;
    seat.beans = Math.max(0, seat.beans) + Math.max(0, Math.round(addedScore));
    seat.ready = true;
    this.broadcastSnapshot();
    this.checkAutoStart();
    return seat.beans;
  }

  triggerImmediateDeal(): void {
    if (this.phase !== 'WAITING' && this.phase !== 'ROUND_RESULT') return;
    this.clearTimers();
    while (this.getPlayerCount() < this.maxPlayers) {
      this.addBotPlayer();
    }
    this.seats.forEach((s) => {
      if (s) s.ready = true;
    });
    this.startRound();
  }

  addBotPlayer(): boolean {
    const emptyIndex = this.seats.findIndex((s) => s === null);
    if (emptyIndex === -1) return false;

    const usedAvatars = this.seats.filter(Boolean).map((s) => s!.avatarId);
    const profile =
      BOT_PROFILES.find((b) => !usedAvatars.includes(b.avatarId)) ??
      BOT_PROFILES[emptyIndex % BOT_PROFILES.length];

    const botId = `bot_lyc_${this.roomId}_${emptyIndex}_${Date.now().toString().slice(-4)}`;
    return this.addPlayer({
      playerId: botId,
      nickname: profile.nickname,
      avatarId: profile.avatarId,
      beans: this.initialScore,
      isBot: true,
    });
  }

  replaceBotWithHuman(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
  }): boolean {
    if (this.phase !== 'WAITING' && this.phase !== 'ROUND_RESULT') return false;
    const botIndex = this.seats.findIndex((s) => s?.isBot);
    if (botIndex === -1) return false;
    this.seats[botIndex] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      seatIndex: botIndex,
      beans: player.beans,
      ready: true,
      isBot: false,
      disconnected: false,
      trusteeship: false,
    };
    this.broadcastSnapshot();
    this.checkAutoStart();
    return true;
  }

  private isAutoActSeat(seatIndex: number): boolean {
    const s = this.seats[seatIndex];
    return Boolean(s && (s.isBot || s.disconnected || s.trusteeship));
  }

  private triggerAutoTakeoverIfNeeded(seatIndex: number): void {
    if (!this.isAutoActSeat(seatIndex)) return;
    const seat = this.seats[seatIndex];
    if (!seat) return;

    if (this.phase === 'CALL_BANKER' && this.callMultipliers[seatIndex] === -1) {
      const timer = setTimeout(() => {
        if (this.phase === 'CALL_BANKER' && this.callMultipliers[seatIndex] === -1) {
          const call = LaoYanCaiBotEngine.decideCallBanker(
            this.playMode,
            seat.beans,
            this.baseScore
          );
          this.handleCallBanker(seatIndex, call);
        }
      }, 850);
      this.botActionTimers.push(timer);
    } else if (
      this.phase === 'BETTING' &&
      seatIndex !== this.dealerSeatId &&
      this.betMultipliers[seatIndex] === 0
    ) {
      const dealerCall = Math.max(1, this.callMultipliers[this.dealerSeatId] || 1);
      const timer = setTimeout(() => {
        if (this.phase === 'BETTING' && this.betMultipliers[seatIndex] === 0) {
          const bet = LaoYanCaiBotEngine.decideBetMultiplier(this.playMode, dealerCall);
          this.handleBet(seatIndex, bet);
        }
      }, 850);
      this.botActionTimers.push(timer);
    } else if (this.phase === 'BANKER_NATURAL' && seatIndex === this.dealerSeatId) {
      const timer = setTimeout(() => {
        if (this.phase === 'BANKER_NATURAL') {
          const shouldZhaKai = LaoYanCaiBotEngine.decideBankerNaturalZhaKai(
            this.hands[seatIndex],
            this.playMode
          );
          this.handleBankerNaturalDecision(seatIndex, shouldZhaKai);
        }
      }, 850);
      this.botActionTimers.push(timer);
    } else if (
      this.phase === 'PLAYER_DECISION' &&
      seatIndex !== this.dealerSeatId &&
      this.decisions[seatIndex] === 'PENDING'
    ) {
      const timer = setTimeout(() => {
        if (this.phase === 'PLAYER_DECISION' && this.decisions[seatIndex] === 'PENDING') {
          const action = LaoYanCaiBotEngine.decidePlayerAction(
            this.hands[seatIndex],
            this.playMode,
            this.deck
          );
          this.handlePlayerDecision(seatIndex, action);
        }
      }, 850);
      this.botActionTimers.push(timer);
    } else if (
      this.phase === 'BANKER_DECISION' &&
      seatIndex === this.dealerSeatId &&
      this.decisions[seatIndex] === 'PENDING'
    ) {
      const idleDecs = this.seats
        .map((s, idx) => (s && idx !== this.dealerSeatId ? this.decisions[idx] : null))
        .filter((d): d is LaoYanCaiDecision => d !== null);
      const timer = setTimeout(() => {
        if (this.phase === 'BANKER_DECISION' && this.decisions[seatIndex] === 'PENDING') {
          const action = LaoYanCaiBotEngine.decideBankerDrawAction(
            this.hands[seatIndex],
            this.playMode,
            this.deck,
            idleDecs
          );
          this.handleBankerDecision(seatIndex, action);
        }
      }, 850);
      this.botActionTimers.push(timer);
    }
  }

  handlePlayerDisconnect(playerId: string): void {
    const seatIndex = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex !== -1 && this.seats[seatIndex]) {
      this.seats[seatIndex]!.disconnected = true;
      this.seats[seatIndex]!.trusteeship = true;
      this.broadcastSnapshot();
      this.triggerAutoTakeoverIfNeeded(seatIndex);
    }
  }

  handlePlayerReconnect(playerId: string): void {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (seat) {
      seat.disconnected = false;
      seat.trusteeship = false;
      this.sendSnapshotToPlayer(playerId);
      this.broadcastSnapshot();
    }
  }

  handleClientEvent(playerId: string, event: string, payload: unknown): void {
    const seatIndex = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatIndex === -1 || !this.seats[seatIndex]) return;

    const data = (payload || {}) as Record<string, unknown>;
    if (event === 'c2s_throw_prop') {
      const targetSeat = Number(data.targetSeat);
      const allowedProps = ['flower', 'tea', 'like', 'ingot', 'bomb_cup'];
      const rawProp = String(data.propType ?? 'flower');
      const propType = allowedProps.includes(rawProp) ? rawProp : 'flower';
      if (
        targetSeat >= 0 &&
        targetSeat < this.maxPlayers &&
        targetSeat !== seatIndex &&
        this.seats[targetSeat]
      ) {
        this.seats.forEach((s) => {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_prop_thrown', {
              fromSeat: seatIndex,
              toSeat: targetSeat,
              propType,
              fromNickname: this.seats[seatIndex]!.nickname,
              toNickname: this.seats[targetSeat]!.nickname,
            });
          }
        });
      }
      return;
    }

    if (event === 'c2s_send_chat') {
      const text = typeof data.text === 'string' ? data.text.slice(0, 40) : '';
      const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 12) : undefined;
      if (text || emoji) {
        this.seats.forEach((s) => {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_chat_message', {
              playerId,
              seatIndex,
              nickname: this.seats[seatIndex]!.nickname,
              text,
              emoji,
            });
          }
        });
      }
      return;
    }

    if (event === 'c2s_toggle_trusteeship') {
      const nextTrust =
        data.trusteeship !== undefined ? Boolean(data.trusteeship) : !this.seats[seatIndex]!.trusteeship;
      this.seats[seatIndex]!.trusteeship = nextTrust;
      this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
        playerId,
        seatIndex,
        trusteeship: nextTrust,
      });
      this.broadcastSnapshot();
      if (nextTrust) {
        this.triggerAutoTakeoverIfNeeded(seatIndex);
      }
      return;
    }

    this.seats[seatIndex]!.disconnected = false;
    if (this.seats[seatIndex]!.trusteeship) {
      this.seats[seatIndex]!.trusteeship = false;
      this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
        playerId,
        seatIndex,
        trusteeship: false,
      });
    }

    if (event === 'c2s_lyc_call_banker') {
      this.handleCallBanker(seatIndex, Number(data.callMultiplier ?? 0));
    } else if (event === 'c2s_lyc_bet') {
      this.handleBet(seatIndex, Number(data.betMultiplier ?? 5));
    } else if (event === 'c2s_lyc_banker_natural') {
      this.handleBankerNaturalDecision(seatIndex, Boolean(data.zhaKai));
    } else if (event === 'c2s_lyc_player_decision') {
      const dec = data.decision;
      if (dec === 'ZHAKAI' || dec === 'LAO' || dec === 'BULAO') {
        this.handlePlayerDecision(seatIndex, dec);
      }
    } else if (event === 'c2s_lyc_banker_decision') {
      const dec = data.decision;
      if (dec === 'LAO' || dec === 'BULAO') {
        this.handleBankerDecision(seatIndex, dec);
      }
    } else if (event === 'c2s_lyc_ready') {
      this.setPlayerReady(playerId, true);
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
      players: this.seats.filter(Boolean).map((s) => ({
        nickname: s!.nickname,
        avatarId: s!.avatarId,
        isBot: s!.isBot,
      })),
    };
  }

  destroy(): void {
    this.clearTimers();
    this.onRoomDestroyed(this.roomId);
  }

  // =========================================================================
  // Game Flow State Machine
  // =========================================================================

  private clearTimers(): void {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
    for (const t of this.botActionTimers) {
      clearTimeout(t);
    }
    this.botActionTimers = [];
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private startCountdown(seconds: number, onComplete: () => void): void {
    this.countdown = seconds;
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    this.countdownInterval = setInterval(() => {
      this.countdown -= 1;
      this.broadcastSnapshot();
      if (this.countdown <= 0) {
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
        }
        onComplete();
      }
    }, 1000);
  }

  private checkAutoStart(): void {
    if (this.phase !== 'WAITING' && this.phase !== 'ROUND_RESULT') return;
    if (this.isEmptyOfHumans()) return;

    while (this.getPlayerCount() < this.maxPlayers) {
      this.addBotPlayer();
    }

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

    const readyCount = this.seats.filter((s) => s && s.ready).length;
    if (readyCount === this.maxPlayers) {
      if (!this.hasDealtFirstRound) {
        if (!this.countdownInterval) {
          this.startCountdown(3, () => this.startRound());
        }
      } else {
        this.startRound();
      }
    }
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
    this.clearTimers();
    if (!this.hasDealtFirstRound) {
      this.hasDealtFirstRound = true;
      this.commitFirstRoundEscrow();
    }
    this.deck = shuffleLaoYanCaiDeck(createStandardLaoYanCaiDeck());
    this.hands = [[], [], [], [], []];
    this.callMultipliers = [-1, -1, -1, -1, -1];
    this.betMultipliers = [0, 0, 0, 0, 0];
    this.decisions = ['PENDING', 'PENDING', 'PENDING', 'PENDING', 'PENDING'];
    this.hasRevealed = [false, false, false, false, false];
    this.handResults = [undefined, undefined, undefined, undefined, undefined];
    this.drawOddsList = [undefined, undefined, undefined, undefined, undefined];
    this.scoreDeltas = [0, 0, 0, 0, 0];
    this.bankerZhaKaiAll = false;
    this.currentSettlement = undefined;

    this.seats.forEach((s) => {
      if (s) s.ready = s.isBot;
    });

    // In Yuxi classic rotating banker mode, rotate banker and skip CALL_BANKER
    if (this.playMode === 'yuxi') {
      const validSeats = this.seats
        .map((s, idx) => (s ? idx : -1))
        .filter((idx) => idx >= 0);
      if (validSeats.length > 0) {
        const nextPos =
          (validSeats.indexOf(this.dealerSeatId) + 1) % validSeats.length;
        this.dealerSeatId = validSeats[nextPos];
      }
      this.seats.forEach((s, idx) => {
        if (s) {
          this.callMultipliers[idx] = idx === this.dealerSeatId ? 1 : 0;
        }
      });
      this.enterBettingPhase();
      return;
    }

    this.enterCallBankerPhase();
  }

  private enterCallBankerPhase(): void {
    this.clearTimers();
    this.phase = 'CALL_BANKER';
    this.countdown = 6;
    this.broadcastSnapshot();

    this.seats.forEach((seat, idx) => {
      if (seat && this.isAutoActSeat(idx) && this.callMultipliers[idx] === -1) {
        const delay = 500 + Math.random() * 1000;
        const timer = setTimeout(() => {
          if (this.phase === 'CALL_BANKER' && this.callMultipliers[idx] === -1) {
            const call = LaoYanCaiBotEngine.decideCallBanker(
              this.playMode,
              seat.beans,
              this.baseScore
            );
            this.handleCallBanker(idx, call);
          }
        }, delay);
        this.botActionTimers.push(timer);
      }
    });

    this.startCountdown(6, () => {
      this.seats.forEach((seat, idx) => {
        if (seat && this.callMultipliers[idx] === -1) {
          this.callMultipliers[idx] = 0;
        }
      });
      this.finalizeBankerAndEnterBetting();
    });
  }

  private handleCallBanker(seatIndex: number, multiplier: number): void {
    if (this.phase !== 'CALL_BANKER') return;
    const clamped = Math.max(0, Math.min(3, Math.round(multiplier)));
    this.callMultipliers[seatIndex] = clamped;
    this.broadcastSnapshot();

    const allCalled = this.seats.every(
      (s, idx) => !s || this.callMultipliers[idx] !== -1
    );
    if (allCalled) {
      this.clearTimers();
      this.finalizeBankerAndEnterBetting();
    }
  }

  private finalizeBankerAndEnterBetting(): void {
    let maxCall = 0;
    this.seats.forEach((s, idx) => {
      if (s && this.callMultipliers[idx] > maxCall) {
        maxCall = this.callMultipliers[idx];
      }
    });

    const candidates: number[] = [];
    this.seats.forEach((s, idx) => {
      if (s && this.callMultipliers[idx] === maxCall) {
        candidates.push(idx);
      }
    });

    const chosenDealer =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : 0;
    this.dealerSeatId = chosenDealer;
    if (this.callMultipliers[chosenDealer] <= 0) {
      this.callMultipliers[chosenDealer] = 1;
    }

    this.enterBettingPhase();
  }

  private enterBettingPhase(): void {
    this.clearTimers();
    this.phase = 'BETTING';
    this.countdown = 6;
    this.betMultipliers[this.dealerSeatId] = 1;
    this.broadcastSnapshot();

    const dealerCall = Math.max(1, this.callMultipliers[this.dealerSeatId] || 1);

    this.seats.forEach((seat, idx) => {
      if (
        seat &&
        this.isAutoActSeat(idx) &&
        idx !== this.dealerSeatId &&
        this.betMultipliers[idx] === 0
      ) {
        const delay = 450 + Math.random() * 900;
        const timer = setTimeout(() => {
          if (this.phase === 'BETTING' && this.betMultipliers[idx] === 0) {
            const bet = LaoYanCaiBotEngine.decideBetMultiplier(
              this.playMode,
              dealerCall
            );
            this.handleBet(idx, bet);
          }
        }, delay);
        this.botActionTimers.push(timer);
      }
    });

    this.startCountdown(6, () => {
      this.seats.forEach((seat, idx) => {
        if (seat && idx !== this.dealerSeatId && this.betMultipliers[idx] === 0) {
          this.betMultipliers[idx] = 5;
        }
      });
      this.dealInitialTwoCards();
    });
  }

  private handleBet(seatIndex: number, multiplier: number): void {
    if (this.phase !== 'BETTING' || seatIndex === this.dealerSeatId) return;
    const allowed = [5, 10, 15, 20];
    this.betMultipliers[seatIndex] = allowed.includes(multiplier) ? multiplier : 5;
    this.broadcastSnapshot();

    const allBet = this.seats.every(
      (s, idx) => !s || idx === this.dealerSeatId || this.betMultipliers[idx] > 0
    );
    if (allBet) {
      this.clearTimers();
      this.dealInitialTwoCards();
    }
  }

  private dealInitialTwoCards(): void {
    this.clearTimers();
    this.phase = 'DEAL_2';

    // Deal 2 hole cards to each seated player
    for (let c = 0; c < 2; c++) {
      for (let s = 0; s < 5; s++) {
        if (this.seats[s] && this.deck.length > 0) {
          this.hands[s].push(this.deck.pop()!);
        }
      }
    }

    // Evaluate initial 2-card hands and compute 50-card draw odds for each seat
    this.seats.forEach((seat, idx) => {
      if (!seat) return;
      const evalRes = evaluateLaoYanCaiHand(this.hands[idx], this.playMode, false);
      const odds = analyzeLaoYanCaiDrawOdds(
        this.hands[idx],
        this.playMode,
        this.deck
      );
      this.handResults[idx] = evalRes;
      this.drawOddsList[idx] = odds;
      LaoYanCaiDebugLogger.logInitialDealAndOdds(
        idx,
        seat.nickname,
        idx === this.dealerSeatId,
        this.hands[idx],
        evalRes,
        odds,
        this.playMode
      );
    });

    this.broadcastSnapshot();

    this.phaseTimer = setTimeout(() => {
      this.checkBankerNaturalPhase();
    }, 750);
  }

  private checkBankerNaturalPhase(): void {
    this.clearTimers();
    const bankerHand = this.hands[this.dealerSeatId] || [];
    const bankerEval = evaluateLaoYanCaiHand(bankerHand, this.playMode, false);

    // Authentic rule: If Banker's initial 2 cards total 8 or 9 points, Banker can choose to 炸开 first!
    if (bankerEval.canZhaKai) {
      this.phase = 'BANKER_NATURAL';
      this.countdown = 6;
      this.broadcastSnapshot();

      if (this.isAutoActSeat(this.dealerSeatId)) {
        const timer = setTimeout(() => {
          if (this.phase === 'BANKER_NATURAL') {
            const shouldZhaKai = LaoYanCaiBotEngine.decideBankerNaturalZhaKai(
              bankerHand,
              this.playMode
            );
            this.handleBankerNaturalDecision(this.dealerSeatId, shouldZhaKai);
          }
        }, 900);
        this.botActionTimers.push(timer);
      }

      this.startCountdown(6, () => {
        // Default on timeout: if 9 points or suited 8, auto-ZhaKai
        this.handleBankerNaturalDecision(this.dealerSeatId, true);
      });
      return;
    }

    this.enterPlayerDecisionPhase();
  }

  private handleBankerNaturalDecision(seatIndex: number, zhaKai: boolean): void {
    if (this.phase !== 'BANKER_NATURAL' || seatIndex !== this.dealerSeatId) return;
    this.clearTimers();

    if (zhaKai) {
      // Banker chooses 炸开! Instant showdown with all players; no one draws a 3rd card
      this.bankerZhaKaiAll = true;
      this.decisions[this.dealerSeatId] = 'ZHAKAI';
      this.hasRevealed[this.dealerSeatId] = true;
      this.handResults[this.dealerSeatId] = evaluateLaoYanCaiHand(
        this.hands[this.dealerSeatId],
        this.playMode,
        true
      );

      const bankerSeat = this.seats[this.dealerSeatId];
      if (bankerSeat) {
        LaoYanCaiDebugLogger.logPlayerDecision(
          this.dealerSeatId,
          bankerSeat.nickname,
          true,
          'ZHAKAI',
          null,
          this.handResults[this.dealerSeatId]!
        );
      }

      // All idle players lock their 2-card hands (if an idle player also has 8/9, mark as ZHAKAI)
      this.seats.forEach((s, idx) => {
        if (!s || idx === this.dealerSeatId) return;
        const idleEval = evaluateLaoYanCaiHand(
          this.hands[idx],
          this.playMode,
          false
        );
        const isIdleNatural = idleEval.canZhaKai;
        this.decisions[idx] = isIdleNatural ? 'ZHAKAI' : 'BULAO';
        this.hasRevealed[idx] = true;
        this.handResults[idx] = evaluateLaoYanCaiHand(
          this.hands[idx],
          this.playMode,
          isIdleNatural
        );
      });

      this.enterShowdownAndSettle();
      return;
    }

    // Banker chose not to 炸开; proceed to idle player decisions
    this.enterPlayerDecisionPhase();
  }

  private enterPlayerDecisionPhase(): void {
    this.clearTimers();
    this.phase = 'PLAYER_DECISION';
    this.countdown = 8;
    this.broadcastSnapshot();

    this.seats.forEach((seat, idx) => {
      if (
        seat &&
        this.isAutoActSeat(idx) &&
        idx !== this.dealerSeatId &&
        this.decisions[idx] === 'PENDING'
      ) {
        const delay = 650 + Math.random() * 1400;
        const timer = setTimeout(() => {
          if (
            this.phase === 'PLAYER_DECISION' &&
            this.decisions[idx] === 'PENDING'
          ) {
            const action = LaoYanCaiBotEngine.decidePlayerAction(
              this.hands[idx],
              this.playMode,
              this.deck
            );
            this.handlePlayerDecision(idx, action);
          }
        }, delay);
        this.botActionTimers.push(timer);
      }
    });

    this.startCountdown(8, () => {
      this.seats.forEach((seat, idx) => {
        if (
          seat &&
          idx !== this.dealerSeatId &&
          this.decisions[idx] === 'PENDING'
        ) {
          const evalRes = evaluateLaoYanCaiHand(
            this.hands[idx],
            this.playMode,
            false
          );
          const defaultDec: LaoYanCaiDecision = evalRes.canZhaKai
            ? 'ZHAKAI'
            : evalRes.points <= 4
            ? 'LAO'
            : 'BULAO';
          this.applyDecisionForSeat(idx, defaultDec);
        }
      });
      this.enterBankerDecisionPhase();
    });
  }

  private applyDecisionForSeat(
    seatIndex: number,
    decision: 'ZHAKAI' | 'LAO' | 'BULAO'
  ): void {
    const seat = this.seats[seatIndex];
    if (!seat || this.decisions[seatIndex] !== 'PENDING') return;

    const currentEval = evaluateLaoYanCaiHand(
      this.hands[seatIndex],
      this.playMode,
      false
    );
    let actualDecision = decision;
    if (actualDecision === 'ZHAKAI' && !currentEval.canZhaKai) {
      actualDecision = 'BULAO';
    }

    let drawnCard: LaoYanCaiCard | null = null;
    if (actualDecision === 'LAO' && this.deck.length > 0) {
      drawnCard = this.deck.pop()!;
      this.hands[seatIndex].push(drawnCard);
    }

    this.decisions[seatIndex] = actualDecision;
    if (actualDecision === 'ZHAKAI') {
      this.hasRevealed[seatIndex] = true;
    }

    const finalEval = evaluateLaoYanCaiHand(
      this.hands[seatIndex],
      this.playMode,
      actualDecision === 'ZHAKAI'
    );
    this.handResults[seatIndex] = finalEval;

    LaoYanCaiDebugLogger.logPlayerDecision(
      seatIndex,
      seat.nickname,
      seatIndex === this.dealerSeatId,
      actualDecision,
      drawnCard,
      finalEval
    );
  }

  private handlePlayerDecision(
    seatIndex: number,
    decision: 'ZHAKAI' | 'LAO' | 'BULAO'
  ): void {
    if (this.phase !== 'PLAYER_DECISION' || seatIndex === this.dealerSeatId) return;
    if (this.decisions[seatIndex] !== 'PENDING') return;

    this.applyDecisionForSeat(seatIndex, decision);
    this.broadcastSnapshot();

    const allIdleDecided = this.seats.every(
      (s, idx) =>
        !s || idx === this.dealerSeatId || this.decisions[idx] !== 'PENDING'
    );
    if (allIdleDecided) {
      this.clearTimers();
      this.enterBankerDecisionPhase();
    }
  }

  private enterBankerDecisionPhase(): void {
    this.clearTimers();

    // Check if all idle players already chose ZHAKAI; if so, Banker cannot draw a 3rd card against them
    const anyNonZhaKaiIdle = this.seats.some(
      (s, idx) =>
        s && idx !== this.dealerSeatId && this.decisions[idx] !== 'ZHAKAI'
    );

    if (!anyNonZhaKaiIdle) {
      this.applyDecisionForSeat(this.dealerSeatId, 'BULAO');
      this.enterShowdownAndSettle();
      return;
    }

    this.phase = 'BANKER_DECISION';
    this.countdown = 7;
    // Refresh Banker's draw odds against remaining deck
    this.drawOddsList[this.dealerSeatId] = analyzeLaoYanCaiDrawOdds(
      this.hands[this.dealerSeatId],
      this.playMode,
      this.deck
    );
    this.broadcastSnapshot();

    if (this.isAutoActSeat(this.dealerSeatId)) {
      const idleDecs = this.seats
        .map((s, idx) => (s && idx !== this.dealerSeatId ? this.decisions[idx] : null))
        .filter((d): d is LaoYanCaiDecision => d !== null);

      const timer = setTimeout(() => {
        if (
          this.phase === 'BANKER_DECISION' &&
          this.decisions[this.dealerSeatId] === 'PENDING'
        ) {
          const action = LaoYanCaiBotEngine.decideBankerDrawAction(
            this.hands[this.dealerSeatId],
            this.playMode,
            this.deck,
            idleDecs
          );
          this.handleBankerDecision(this.dealerSeatId, action);
        }
      }, 950);
      this.botActionTimers.push(timer);
    }

    this.startCountdown(7, () => {
      if (this.decisions[this.dealerSeatId] === 'PENDING') {
        const evalRes = evaluateLaoYanCaiHand(
          this.hands[this.dealerSeatId],
          this.playMode,
          false
        );
        this.applyDecisionForSeat(
          this.dealerSeatId,
          evalRes.points <= 4 ? 'LAO' : 'BULAO'
        );
      }
      this.enterShowdownAndSettle();
    });
  }

  private handleBankerDecision(
    seatIndex: number,
    decision: 'LAO' | 'BULAO'
  ): void {
    if (this.phase !== 'BANKER_DECISION' || seatIndex !== this.dealerSeatId) return;
    if (this.decisions[this.dealerSeatId] !== 'PENDING') return;

    this.clearTimers();
    this.applyDecisionForSeat(this.dealerSeatId, decision);
    this.enterShowdownAndSettle();
  }

  private enterShowdownAndSettle(): void {
    this.clearTimers();
    this.phase = 'SHOWDOWN';

    // Ensure all active seats are revealed and evaluated
    this.seats.forEach((seat, idx) => {
      if (!seat) return;
      this.hasRevealed[idx] = true;
      if (!this.handResults[idx]) {
        this.handResults[idx] = evaluateLaoYanCaiHand(
          this.hands[idx],
          this.playMode,
          this.decisions[idx] === 'ZHAKAI'
        );
      }
    });

    const dealerIdx = this.dealerSeatId >= 0 ? this.dealerSeatId : 0;
    const dealerSeat = this.seats[dealerIdx];
    const dealerFullResult =
      this.handResults[dealerIdx] ??
      evaluateLaoYanCaiHand(
        this.hands[dealerIdx],
        this.playMode,
        this.decisions[dealerIdx] === 'ZHAKAI'
      );
    // Also evaluate Banker's initial 2 cards in case an idle player chose ZHAKAI earlier
    const dealerTwoCardResult = evaluateLaoYanCaiHand(
      this.hands[dealerIdx].slice(0, 2),
      this.playMode,
      this.decisions[dealerIdx] === 'ZHAKAI'
    );

    const scoreDeltas = [0, 0, 0, 0, 0];

    if (dealerSeat) {
      const dealerCall = Math.max(1, this.callMultipliers[dealerIdx] || 1);
      const rawDeltas = [0, 0, 0, 0, 0];

      this.seats.forEach((seat, idx) => {
        if (!seat || idx === dealerIdx) return;
        const playerResult = this.handResults[idx]!;
        const playerBet = this.betMultipliers[idx] || 5;

        // If idle player locked in ZHAKAI (2-card natural 8/9), compare against Banker's 2-card hand;
        // otherwise compare against Banker's final hand
        const bankerTargetResult =
          this.decisions[idx] === 'ZHAKAI' ? dealerTwoCardResult : dealerFullResult;

        const cmp = compareLaoYanCaiHands(playerResult, bankerTargetResult);
        if (cmp > 0) {
          const rawWin = Math.round(
            this.baseScore * dealerCall * playerBet * playerResult.multiplier
          );
          rawDeltas[idx] = Math.min(rawWin, seat.beans);
        } else {
          const rawLoss = Math.round(
            this.baseScore * dealerCall * playerBet * bankerTargetResult.multiplier
          );
          rawDeltas[idx] = -Math.min(rawLoss, seat.beans);
        }
      });

      // Banker payout cap protection
      const totalPlayersWin = rawDeltas.reduce(
        (acc, d) => (d > 0 ? acc + d : acc),
        0
      );
      const totalPlayersLoss = rawDeltas.reduce(
        (acc, d) => (d < 0 ? acc + Math.abs(d) : acc),
        0
      );
      const dealerAvailable = dealerSeat.beans + totalPlayersLoss;
      const payoutScale =
        totalPlayersWin > dealerAvailable && totalPlayersWin > 0
          ? dealerAvailable / totalPlayersWin
          : 1;

      let dealerNet = 0;
      this.seats.forEach((seat, idx) => {
        if (!seat || idx === dealerIdx) return;
        if (rawDeltas[idx] > 0) {
          const finalWin = Math.round(rawDeltas[idx] * payoutScale);
          scoreDeltas[idx] = finalWin;
          dealerNet -= finalWin;
        } else {
          scoreDeltas[idx] = rawDeltas[idx];
          dealerNet -= rawDeltas[idx];
        }
      });
      scoreDeltas[dealerIdx] = dealerNet;
    }

    this.scoreDeltas = scoreDeltas;

    this.seats.forEach((seat, idx) => {
      if (seat) {
        seat.beans = Math.max(0, seat.beans + scoreDeltas[idx]);
        if (seat.isBot && seat.beans < this.baseScore) {
          seat.beans = this.initialScore;
        }
      }
    });

    const dealerCallMult = Math.max(1, this.callMultipliers[dealerIdx] || 1);

    storageService.recordSettlement(
      this.roomId,
      this.gameType,
      this.baseScore,
      dealerCallMult,
      scoreDeltas[dealerIdx] >= 0 ? 'banker' : 'player',
      this.seats
        .map((seat, idx) => {
          if (!seat) return null!;
          const res = this.handResults[idx];
          return {
            playerId: seat.playerId,
            nickname: seat.nickname,
            isBot: seat.isBot,
            role:
              idx === dealerIdx
                ? `庄家(${dealerCallMult}倍)·${res?.name || ''}`
                : `闲家(${this.betMultipliers[idx] || 5}倍)·${res?.name || ''}`,
            scoreDelta: scoreDeltas[idx],
            isWinner: scoreDeltas[idx] > 0,
          };
        })
        .filter(Boolean)
    );

    const humanIdx = this.seats.findIndex((s) => s && !s.isBot);
    if (humanIdx !== -1 && this.seats[humanIdx]) {
      const human = this.seats[humanIdx]!;
      const updatedRcSession = roomCardEngine.recordRoundSettlement({
        roomId: this.roomId,
        heroId: human.playerId,
        heroDelta: scoreDeltas[humanIdx] ?? 0,
        heroName: human.nickname,
        summaryText: `捞腌菜·${this.handResults[humanIdx]?.name || '结算'}`,
        peerDeltas: this.seats
          .map((s, idx) =>
            s && idx !== humanIdx
              ? { id: s.playerId, name: s.nickname, delta: scoreDeltas[idx] ?? 0 }
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

    this.currentSettlement = {
      baseScore: this.baseScore,
      playMode: this.playMode,
      dealerSeatIndex: dealerIdx,
      bankerZhaKaiAll: this.bankerZhaKaiAll,
      players: this.seats
        .map((seat, idx) => {
          if (!seat) return null!;
          const res =
            this.handResults[idx] ??
            evaluateLaoYanCaiHand(
              this.hands[idx],
              this.playMode,
              this.decisions[idx] === 'ZHAKAI'
            );
          return {
            seatIndex: idx,
            playerId: seat.playerId,
            nickname: seat.nickname,
            avatarId: seat.avatarId,
            isDealer: idx === dealerIdx,
            callMultiplier: this.callMultipliers[idx],
            betMultiplier: this.betMultipliers[idx],
            decision: this.decisions[idx],
            cards: this.hands[idx],
            handName: res.name,
            badgeText: res.badgeText,
            points: res.points,
            multiplier: res.multiplier,
            scoreDelta: scoreDeltas[idx],
            balance: seat.beans,
            isWinner: scoreDeltas[idx] > 0,
          };
        })
        .filter(Boolean),
    };

    LaoYanCaiDebugLogger.logRoundSettlement(
      this.roomId,
      this.playMode,
      dealerIdx,
      this.currentSettlement
    );

    this.broadcastSnapshot();

    this.phaseTimer = setTimeout(() => {
      this.phase = 'ROUND_RESULT';
      this.broadcastSnapshot();

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
        }
      }

      this.startCountdown(7, () => {
        this.seats.forEach((s) => {
          if (s && (s.isBot || s.beans >= this.baseScore)) s.ready = true;
        });
        this.checkAutoStart();
      });
    }, 2200);
  }

  // =========================================================================
  // Snapshot Serialization (Enforces Hole-Card Privacy & ZhaKai Reveal)
  // =========================================================================

  private buildSnapshot(targetPlayerId?: string): LaoYanCaiTableSnapshot {
    const targetSeatIndex = this.seats.findIndex(
      (s) => s?.playerId === targetPlayerId
    );
    const isShowdownOrResult =
      this.phase === 'SHOWDOWN' || this.phase === 'ROUND_RESULT';

    const mappedSeats: Array<LaoYanCaiPlayerInfo | null> = this.seats.map(
      (s, idx) => {
        if (!s) return null;
        const isSelf = idx === targetSeatIndex;
        const revealed = this.hasRevealed[idx] || isShowdownOrResult;
        const rawCards = this.hands[idx] || [];

        const visibleCards: LaoYanCaiCard[] =
          isSelf || revealed
            ? rawCards
            : rawCards.map((_, i) => ({
                id: -200 - idx * 10 - i,
                suit: 'spade',
                rank: 0,
                point: 0,
              }));

        const showDealer =
          idx === this.dealerSeatId &&
          this.phase !== 'WAITING' &&
          this.phase !== 'CALL_BANKER';

        return {
          playerId: s.playerId,
          nickname: s.nickname,
          avatarId: s.avatarId,
          seatIndex: idx,
          beans: s.beans,
          ready: s.ready,
          isBot: s.isBot,
          disconnected: s.disconnected,
          isDealer: showDealer,
          callMultiplier: this.callMultipliers[idx],
          betMultiplier: this.betMultipliers[idx],
          decision: this.decisions[idx],
          cards: visibleCards,
          hasRevealed: revealed,
          handResult: isSelf || revealed ? this.handResults[idx] : undefined,
          drawOdds: isSelf ? this.drawOddsList[idx] : undefined,
          scoreDelta: this.scoreDeltas[idx],
        };
      }
    );

    return {
      roomId: this.roomId,
      baseScore: this.baseScore,
      playMode: this.playMode,
      phase: this.phase,
      countdown: this.countdown,
      dealerSeatId: this.dealerSeatId,
      remainingDeckCount: this.deck.length,
      bankerZhaKaiAll: this.bankerZhaKaiAll,
      seats: mappedSeats,
      settlement: this.currentSettlement,
    };
  }

  sendSnapshotToPlayer(playerId: string): void {
    const snapshot = this.buildSnapshot(playerId);
    this.connectionManager.emitToPlayer(playerId, 's2c_lyc_snapshot', snapshot);
  }

  private broadcastSnapshot(): void {
    this.seats.forEach((seat) => {
      if (seat && !seat.isBot) {
        this.sendSnapshotToPlayer(seat.playerId);
      }
    });
  }
}
