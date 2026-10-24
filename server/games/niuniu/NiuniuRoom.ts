import { ConnectionManager } from '../../core/ConnectionManager.js';
import { IGameRoom, RoomPlayerInfo, RoomSummary } from '../../core/RoomManager.js';
import { roomCardEngine } from '../../core/RoomCardEngine.js';
import { storageService } from '../../shared/storage.js';
import {
  NiuniuCard,
  NiuniuHandResult,
  NiuniuPhase,
  NiuniuPlayerInfo,
  NiuniuPlayMode,
  NiuniuSettlement,
  NiuniuTableSnapshot,
} from '../../../src/games/niuniu/types.js';
import {
  analyzeFourCardOdds,
  compareHands,
  createStandardNiuniuDeck,
  evaluateNiuniuHand,
  shuffleDeck,
} from '../../../src/games/niuniu/algorithms/NiuniuLogic.js';
import { NiuniuDebugLogger } from '../../../src/games/niuniu/utils/NiuniuDebugLogger.js';
import { NiuniuBotEngine } from './NiuniuBotEngine.js';

const BOT_PROFILES = [
  { nickname: '金牛·陆九渊AI', avatarId: 'kashen' },
  { nickname: '锦鲤·贝儿AI', avatarId: 'beier' },
  { nickname: '折扇·柳如风AI', avatarId: 'scholar' },
  { nickname: '财神·金百万AI', avatarId: 'noble' },
  { nickname: '红拂女AI', avatarId: 'heroine' },
  { nickname: '凌霄剑仙AI', avatarId: 'warrior' },
];

export class NiuniuRoom implements IGameRoom {
  roomId: string;
  gameType = 'niuniu';
  hostId: string;
  baseScore: number;
  initialScore: number;
  isPrivate: boolean;
  maxPlayers = 5;
  createdAt: number = Date.now();

  private playMode: NiuniuPlayMode;
  private seats: Array<RoomPlayerInfo | null> = [null, null, null, null, null];
  private phase: NiuniuPhase = 'WAITING';
  private connectionManager: ConnectionManager;
  private onRoomDestroyed: (roomId: string) => void;
  private hasDealtFirstRound = false;

  // Niuniu Specific Game States
  private hands: NiuniuCard[][] = [[], [], [], [], []];
  private callMultipliers: number[] = [-1, -1, -1, -1, -1];
  private betMultipliers: number[] = [0, 0, 0, 0, 0];
  private dealerSeatId: number = 0;
  private hasShownHand: boolean[] = [false, false, false, false, false];
  private handResults: (NiuniuHandResult | undefined)[] = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];
  private scoreDeltas: number[] = [0, 0, 0, 0, 0];
  private candidateDealerSeats: number[] = [];
  private currentSettlement?: NiuniuSettlement;

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
      options.mode === 'tongbi' || options.mode === 'crazy' || options.mode === 'classic'
        ? options.mode
        : 'qiangzhuang';
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
      // Auto-ready upon initial join so quick match starts seamlessly
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

    const botId = `bot_nn_${this.roomId}_${emptyIndex}_${Date.now().toString().slice(-4)}`;
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
          const call = NiuniuBotEngine.decideCallBanker(
            this.hands[seatIndex].slice(0, 4),
            this.playMode
          );
          this.handleCallBanker(seatIndex, call);
        }
      }, 900);
      this.botActionTimers.push(timer);
    } else if (
      this.phase === 'BETTING' &&
      seatIndex !== this.dealerSeatId &&
      this.betMultipliers[seatIndex] === 0
    ) {
      const dealerCall = Math.max(1, this.callMultipliers[this.dealerSeatId] || 1);
      const timer = setTimeout(() => {
        if (this.phase === 'BETTING' && this.betMultipliers[seatIndex] === 0) {
          const bet = NiuniuBotEngine.decideBetMultiplier(
            this.hands[seatIndex].slice(0, 4),
            this.playMode,
            dealerCall
          );
          this.handleBet(seatIndex, bet);
        }
      }, 900);
      this.botActionTimers.push(timer);
    } else if (this.phase === 'SHOWDOWN' && !this.hasShownHand[seatIndex]) {
      const timer = setTimeout(() => {
        if (this.phase === 'SHOWDOWN' && !this.hasShownHand[seatIndex]) {
          this.handleShowHand(seatIndex);
        }
      }, 900);
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

    if (event === 'c2s_throw_prop') {
      const data = (payload || {}) as { targetSeat?: number; propType?: string };
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
      const data = (payload || {}) as { text?: string; emoji?: string };
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
      const data = (payload || {}) as { trusteeship?: boolean };
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

    if (event === 'c2s_niuniu_call_banker') {
      const { callMultiplier } = (payload || {}) as { callMultiplier?: number };
      this.handleCallBanker(seatIndex, callMultiplier ?? 0);
    } else if (event === 'c2s_niuniu_bet') {
      const { betMultiplier } = (payload || {}) as { betMultiplier?: number };
      this.handleBet(seatIndex, betMultiplier ?? 5);
    } else if (event === 'c2s_niuniu_show_hand') {
      this.handleShowHand(seatIndex);
    } else if (event === 'c2s_niuniu_ready') {
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
  // Game Flow Logic (FSM)
  // =========================================================================

  private clearTimers() {
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

  private startCountdown(seconds: number, onComplete: () => void) {
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
    this.phase = 'DEAL_FIRST_4';
    this.callMultipliers = [-1, -1, -1, -1, -1];
    this.betMultipliers = [0, 0, 0, 0, 0];
    this.hasShownHand = [false, false, false, false, false];
    this.handResults = [undefined, undefined, undefined, undefined, undefined];
    this.scoreDeltas = [0, 0, 0, 0, 0];
    this.candidateDealerSeats = [];
    this.currentSettlement = undefined;

    // Reset ready flags for the active round
    this.seats.forEach((s) => {
      if (s) s.ready = s.isBot;
    });

    // Deal 5 cards to each seated player from standard 52-card deck
    const deck = shuffleDeck(createStandardNiuniuDeck());
    this.hands = [[], [], [], [], []];
    for (let c = 0; c < 5; c++) {
      for (let s = 0; s < 5; s++) {
        if (this.seats[s]) {
          this.hands[s].push(deck.pop()!);
        }
      }
    }

    this.broadcastSnapshot();

    // In Tongbi mode (通比牛牛), everyone bets 5x automatically and skips banker call
    if (this.playMode === 'tongbi') {
      this.dealerSeatId = -1;
      this.callMultipliers = [0, 0, 0, 0, 0];
      this.betMultipliers = [5, 5, 5, 5, 5];
      this.phaseTimer = setTimeout(() => {
        this.enterDeal5thPhase();
      }, 900);
      return;
    }

    // After dealing first 4 cards animation (0.9s), enter CALL_BANKER
    this.phaseTimer = setTimeout(() => {
      this.enterCallBankerPhase();
    }, 900);
  }

  private enterCallBankerPhase(): void {
    this.clearTimers();
    this.phase = 'CALL_BANKER';
    this.countdown = 6;
    this.broadcastSnapshot();

    // Trigger AI bots to call banker using exact 48-card EV solver & log 4-card odds
    this.seats.forEach((seat, idx) => {
      if (seat && this.hands[idx].length >= 4) {
        const odds = analyzeFourCardOdds(this.hands[idx].slice(0, 4), this.playMode);
        NiuniuDebugLogger.logFourCardOdds(
          idx,
          seat.nickname,
          this.hands[idx].slice(0, 4),
          odds,
          this.playMode
        );
      }
      if (seat && this.isAutoActSeat(idx) && this.callMultipliers[idx] === -1) {
        const delay = 600 + Math.random() * 1100;
        const timer = setTimeout(() => {
          if (this.phase === 'CALL_BANKER' && this.callMultipliers[idx] === -1) {
            const call = NiuniuBotEngine.decideCallBanker(
              this.hands[idx].slice(0, 4),
              this.playMode
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
      this.determineBanker();
    });
  }

  private handleCallBanker(seatIndex: number, multiplier: number): void {
    if (this.phase !== 'CALL_BANKER') return;
    this.callMultipliers[seatIndex] = Math.max(0, Math.min(4, multiplier));
    this.broadcastSnapshot();

    const allCalled = this.seats.every(
      (s, idx) => !s || this.callMultipliers[idx] !== -1
    );
    if (allCalled) {
      this.clearTimers();
      this.determineBanker();
    }
  }

  private determineBanker(): void {
    this.clearTimers();
    this.phase = 'DETERMINE_BANKER';

    let maxCall = 0;
    this.seats.forEach((s, idx) => {
      if (s && this.callMultipliers[idx] > maxCall) {
        maxCall = this.callMultipliers[idx];
      }
    });

    const candidateSeats: number[] = [];
    this.seats.forEach((s, idx) => {
      if (s && this.callMultipliers[idx] === maxCall) {
        candidateSeats.push(idx);
      }
    });

    // If nobody called (>0), all seated players become candidates at 1x
    if (maxCall === 0) {
      this.seats.forEach((s, idx) => {
        if (s) {
          this.callMultipliers[idx] = 1;
        }
      });
    }

    this.candidateDealerSeats = candidateSeats.length > 0 ? candidateSeats : [0];
    const chosenDealer =
      this.candidateDealerSeats[
        Math.floor(Math.random() * this.candidateDealerSeats.length)
      ];
    this.dealerSeatId = chosenDealer;
    if (this.callMultipliers[chosenDealer] <= 0) {
      this.callMultipliers[chosenDealer] = 1;
    }

    this.broadcastSnapshot();

    const delayMs = this.candidateDealerSeats.length > 1 ? 1300 : 650;
    this.phaseTimer = setTimeout(() => {
      this.enterBettingPhase();
    }, delayMs);
  }

  private enterBettingPhase(): void {
    this.clearTimers();
    this.phase = 'BETTING';
    this.countdown = 6;
    this.betMultipliers[this.dealerSeatId] = 1;
    this.broadcastSnapshot();

    const dealerCall = Math.max(1, this.callMultipliers[this.dealerSeatId] || 1);

    this.seats.forEach((seat, idx) => {
      if (seat && this.isAutoActSeat(idx) && idx !== this.dealerSeatId && this.betMultipliers[idx] === 0) {
        const delay = 500 + Math.random() * 1000;
        const timer = setTimeout(() => {
          if (this.phase === 'BETTING' && this.betMultipliers[idx] === 0) {
            const bet = NiuniuBotEngine.decideBetMultiplier(
              this.hands[idx].slice(0, 4),
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
      this.enterDeal5thPhase();
    });
  }

  private handleBet(seatIndex: number, multiplier: number): void {
    if (this.phase !== 'BETTING' || seatIndex === this.dealerSeatId) return;
    const validMultipliers = [5, 10, 15, 20];
    this.betMultipliers[seatIndex] = validMultipliers.includes(multiplier)
      ? multiplier
      : 5;
    this.broadcastSnapshot();

    const allBet = this.seats.every(
      (s, idx) => !s || idx === this.dealerSeatId || this.betMultipliers[idx] > 0
    );
    if (allBet) {
      this.clearTimers();
      this.enterDeal5thPhase();
    }
  }

  private enterDeal5thPhase(): void {
    this.clearTimers();
    this.phase = 'DEAL_5TH';
    this.broadcastSnapshot();

    this.phaseTimer = setTimeout(() => {
      this.enterShowdownPhase();
    }, 650);
  }

  private enterShowdownPhase(): void {
    this.clearTimers();
    this.phase = 'SHOWDOWN';
    this.countdown = 8;

    this.seats.forEach((seat, idx) => {
      if (seat && this.hands[idx].length === 5) {
        const res = evaluateNiuniuHand(this.hands[idx], this.playMode);
        this.handResults[idx] = res;
        NiuniuDebugLogger.logHandEvaluation(
          idx,
          seat.nickname,
          this.hands[idx],
          res,
          this.playMode
        );
      }
    });

    this.broadcastSnapshot();

    this.seats.forEach((seat, idx) => {
      if (seat && this.isAutoActSeat(idx)) {
        const delay = 800 + Math.random() * 1600;
        const timer = setTimeout(() => {
          if (this.phase === 'SHOWDOWN' && !this.hasShownHand[idx]) {
            this.handleShowHand(idx);
          }
        }, delay);
        this.botActionTimers.push(timer);
      }
    });

    this.startCountdown(8, () => {
      this.seats.forEach((seat, idx) => {
        if (seat && !this.hasShownHand[idx]) {
          this.hasShownHand[idx] = true;
        }
      });
      this.compareAndSettle();
    });
  }

  private handleShowHand(seatIndex: number): void {
    if (this.phase !== 'SHOWDOWN') return;
    this.hasShownHand[seatIndex] = true;
    this.broadcastSnapshot();

    const allShown = this.seats.every((s, idx) => !s || this.hasShownHand[idx]);
    if (allShown) {
      this.clearTimers();
      this.compareAndSettle();
    }
  }

  private compareAndSettle(): void {
    this.clearTimers();
    this.phase = 'COMPARE_AND_SETTLE';

    const scoreDeltas = [0, 0, 0, 0, 0];

    if (this.playMode === 'tongbi') {
      // 通比牛牛：全场最大牌型者赢其余所有人
      let winnerIdx = 0;
      for (let i = 1; i < 5; i++) {
        if (!this.seats[i] || !this.handResults[i]) continue;
        if (
          !this.handResults[winnerIdx] ||
          compareHands(this.handResults[i]!, this.handResults[winnerIdx]!) > 0
        ) {
          winnerIdx = i;
        }
      }
      const winResult = this.handResults[winnerIdx]!;
      let totalWin = 0;
      this.seats.forEach((seat, idx) => {
        if (!seat || idx === winnerIdx) return;
        const rawLoss = Math.round(this.baseScore * 5 * winResult.multiplier);
        const cappedLoss = Math.min(rawLoss, seat.beans);
        scoreDeltas[idx] = -cappedLoss;
        totalWin += cappedLoss;
      });
      scoreDeltas[winnerIdx] = totalWin;
      this.dealerSeatId = winnerIdx;
    } else {
      // 看牌抢庄 & 疯狂加倍：闲家分别与庄家比牌，带商业级以小博大/庄家赔付封顶保护
      const dealerIdx = this.dealerSeatId >= 0 ? this.dealerSeatId : 0;
      const dealerSeat = this.seats[dealerIdx];
      const dealerResult = this.handResults[dealerIdx];
      if (!dealerSeat || !dealerResult) return;

      const dealerCall = Math.max(1, this.callMultipliers[dealerIdx] || 1);
      const rawDeltas = [0, 0, 0, 0, 0];

      this.seats.forEach((seat, idx) => {
        if (!seat || idx === dealerIdx) return;
        const playerResult = this.handResults[idx];
        if (!playerResult) return;

        const playerBet = this.betMultipliers[idx] || 5;
        const cmp = compareHands(playerResult, dealerResult);

        if (cmp > 0) {
          const rawWin = Math.round(
            this.baseScore * dealerCall * playerBet * playerResult.multiplier
          );
          rawDeltas[idx] = Math.min(rawWin, seat.beans);
        } else {
          const rawLoss = Math.round(
            this.baseScore * dealerCall * playerBet * dealerResult.multiplier
          );
          rawDeltas[idx] = -Math.min(rawLoss, seat.beans);
        }
      });

      // 计算庄家净输赢并进行庄家余额封顶保护
      const totalPlayersWin = rawDeltas.reduce(
        (acc, d) => (d > 0 ? acc + d : acc),
        0
      );
      const totalPlayersLoss = rawDeltas.reduce(
        (acc, d) => (d < 0 ? acc + Math.abs(d) : acc),
        0
      );

      const dealerAvailableForPayout = dealerSeat.beans + totalPlayersLoss;
      const payoutScale =
        totalPlayersWin > dealerAvailableForPayout && totalPlayersWin > 0
          ? dealerAvailableForPayout / totalPlayersWin
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

    // Update player balances & record match in storageService
    this.seats.forEach((seat, idx) => {
      if (seat) {
        seat.beans = Math.max(0, seat.beans + scoreDeltas[idx]);
        if (seat.isBot && seat.beans < this.baseScore) {
          seat.beans = this.initialScore;
        }
      }
    });

    const dealerIdx = this.dealerSeatId >= 0 ? this.dealerSeatId : 0;
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
              this.playMode === 'tongbi'
                ? `通比·${res?.name || '无牛'}`
                : idx === dealerIdx
                ? `庄家(${dealerCallMult}倍)·${res?.name || '无牛'}`
                : `闲家(${this.betMultipliers[idx] || 5}倍)·${res?.name || '无牛'}`,
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
        summaryText: `抢庄牛牛·${this.handResults[humanIdx]?.name || '比牌结算'}`,
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
      players: this.seats
        .map((seat, idx) => {
          if (!seat) return null!;
          const res =
            this.handResults[idx] ??
            evaluateNiuniuHand(this.hands[idx], this.playMode);
          return {
            seatIndex: idx,
            playerId: seat.playerId,
            nickname: seat.nickname,
            avatarId: seat.avatarId,
            isDealer: idx === dealerIdx && this.playMode !== 'tongbi',
            callMultiplier: this.callMultipliers[idx],
            betMultiplier: this.betMultipliers[idx],
            handType: res.handType,
            handName: res.name,
            handMultiplier: res.multiplier,
            cards: this.hands[idx],
            scoreDelta: scoreDeltas[idx],
            balance: seat.beans,
            isWinner: scoreDeltas[idx] > 0,
          };
        })
        .filter(Boolean),
    };

    NiuniuDebugLogger.logRoundSettlement(
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
    }, 2400);
  }

  // =========================================================================
  // Snapshot Serialization (Enforces 4明1暗 in 看牌抢庄)
  // =========================================================================

  private buildSnapshot(targetPlayerId?: string): NiuniuTableSnapshot {
    const targetSeatIndex = this.seats.findIndex((s) => s?.playerId === targetPlayerId);

    const isFifthCardDealt =
      this.phase === 'DEAL_5TH' ||
      this.phase === 'SHOWDOWN' ||
      this.phase === 'COMPARE_AND_SETTLE' ||
      this.phase === 'ROUND_RESULT';

    const isCompareOrResult =
      this.phase === 'COMPARE_AND_SETTLE' || this.phase === 'ROUND_RESULT';

    const mappedSeats: Array<NiuniuPlayerInfo | null> = this.seats.map((s, idx) => {
      if (!s) return null;

      const isSelf = idx === targetSeatIndex;
      const playerHasShown = this.hasShownHand[idx] || isCompareOrResult;
      const rawHand = this.hands[idx] || [];

      let visibleCards: NiuniuCard[] = [];
      if (isSelf) {
        if (isFifthCardDealt) {
          visibleCards = rawHand;
        } else {
          // 看牌抢庄核心：前4张明牌，第5张暗牌
          visibleCards = rawHand.map((c, i) =>
            i < 4
              ? c
              : {
                  id: -105,
                  suit: 'spade',
                  rank: 0,
                  value: 0,
                }
          );
        }
      } else {
        if (playerHasShown) {
          visibleCards = rawHand;
        } else {
          visibleCards = rawHand.map((_, i) => ({
            id: -100 - idx * 10 - i,
            suit: 'spade',
            rank: 0,
            value: 0,
          }));
        }
      }

      const showDealerBadge =
        this.playMode !== 'tongbi' &&
        idx === this.dealerSeatId &&
        this.phase !== 'WAITING' &&
        this.phase !== 'DEAL_FIRST_4' &&
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
        callMultiplier: this.callMultipliers[idx],
        betMultiplier: this.betMultipliers[idx],
        isDealer: showDealerBadge,
        cards: visibleCards,
        hasShownHand: this.hasShownHand[idx],
        handResult:
          (isSelf && isFifthCardDealt) || playerHasShown
            ? this.handResults[idx]
            : undefined,
        scoreDelta: this.scoreDeltas[idx],
      };
    });

    return {
      roomId: this.roomId,
      baseScore: this.baseScore,
      playMode: this.playMode,
      phase: this.phase,
      countdown: this.countdown,
      dealerSeatId: this.dealerSeatId,
      seats: mappedSeats,
      candidateDealerSeats: this.candidateDealerSeats,
      settlement: this.currentSettlement,
    };
  }

  sendSnapshotToPlayer(playerId: string): void {
    const snapshot = this.buildSnapshot(playerId);
    this.connectionManager.emitToPlayer(playerId, 's2c_niuniu_snapshot', snapshot);
  }

  private broadcastSnapshot(): void {
    this.seats.forEach((seat) => {
      if (seat && !seat.isBot) {
        this.sendSnapshotToPlayer(seat.playerId);
      }
    });
  }
}
