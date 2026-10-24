import { ConnectionManager } from '../../core/ConnectionManager.js';
import { IGameRoom, RoomPlayerInfo, RoomSummary } from '../../core/RoomManager.js';
import { roomCardEngine } from '../../core/RoomCardEngine.js';
import { storageService } from '../../shared/storage.js';
import {
  AvailableAction,
  MahjongMeld,
  MahjongPhase,
  MahjongSuit,
  MahjongTableSnapshot,
  MjSettlement,
  MjSettlementWinner,
  RoundBillRecord,
} from '../../../src/games/mahjong/types.js';
import {
  createDeckForPlayMode,
  createStandardDeck,
  getSuit,
  HONG_ZHONG_TILE,
  sortTiles,
} from '../../../src/games/mahjong/algorithms/MahjongTile.js';
import {
  analyzeTing,
  calculateOptimalDiscard,
  canPeng,
  checkGangOptions,
  evaluateHu,
} from '../../../src/games/mahjong/algorithms/MahjongRules.js';
import { MahjongBotEngine } from './MahjongBotEngine.js';
import { MahjongDebugLogger } from '../../../src/games/mahjong/utils/MahjongDebugLogger.js';

const BOT_PROFILES = [
  { nickname: '雀圣·陆九渊AI', avatarId: 'kashen' },
  { nickname: '锦鲤·贝儿AI', avatarId: 'beier' },
  { nickname: '折扇·柳如风AI', avatarId: 'scholar' },
  { nickname: '财神·金百万AI', avatarId: 'noble' },
  { nickname: '红拂女AI', avatarId: 'heroine' },
  { nickname: '凌霄剑仙AI', avatarId: 'warrior' },
];

const PRE_DEAL_ESCROW_WINDOW_MS = 3200;

export class MahjongRoom implements IGameRoom {
  roomId: string;
  gameType = 'mahjong';
  hostId: string;
  baseScore: number;
  initialScore: number;
  isPrivate: boolean;
  maxPlayers = 4;
  createdAt: number = Date.now();

  private playMode: string;
  private seats: Array<RoomPlayerInfo | null> = [null, null, null, null];
  private phase: MahjongPhase = 'WAITING';
  private connectionManager: ConnectionManager;
  private onRoomDestroyed: (roomId: string) => void;
  private hasDealtFirstRound = false;
  private preDealTimer: NodeJS.Timeout | null = null;

  // Mahjong State
  private deck: number[] = [];
  private dealerSeatId = 0;
  private currentTurnSeatId = 0;
  private hands: number[][] = [[], [], [], []];
  private drawnTiles: (number | null)[] = [null, null, null, null];
  private melds: MahjongMeld[][] = [[], [], [], []];
  private discards: number[][] = [[], [], [], []];
  private dingQueSuits: (MahjongSuit | null)[] = [null, null, null, null];
  private huCounts: number[] = [0, 0, 0, 0];
  private gangCounts: number[] = [0, 0, 0, 0];
  private discardSeq: number = 0;
  private latestDiscard: { seatId: number; tileId: number; seq: number } | null = null;
  private diceValues: [number, number] = [1, 1];
  private bills: RoundBillRecord[] = [];
  private pendingActions: Map<number, AvailableAction[]> = new Map();
  private initialRoundBeans: number[] = [0, 0, 0, 0];
  private settlementData: MjSettlement | null = null;

  // New robust arbitration & mode state
  private retiredSeats: Set<number> = new Set();
  private winningEvents: MjSettlementWinner[] = [];
  private pendingResponders: Set<number> = new Set();
  private submittedResponses: Map<number, AvailableAction> = new Map();

  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private responseTimer: NodeJS.Timeout | null = null;

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
    this.baseScore = options.baseScore || 100;
    this.initialScore =
      options.initialScore && options.initialScore > 0
        ? options.initialScore
        : Math.max(2000, this.baseScore * 20);
    this.isPrivate = options.isPrivate;
    this.playMode = options.mode || 'puer';
    this.connectionManager = options.connectionManager;
    this.onRoomDestroyed = options.onRoomDestroyed;
  }

  get mode(): string {
    return this.playMode;
  }

  get status(): string {
    return this.phase === 'WAITING' ? 'waiting' : 'playing';
  }

  getPlayerCount(): number {
    return this.seats.filter((s) => s !== null).length;
  }

  isFull(): boolean {
    return this.getPlayerCount() >= this.maxPlayers;
  }

  isEmpty(): boolean {
    return this.getPlayerCount() === 0;
  }

  hasPlayer(playerId: string): boolean {
    return this.seats.some((s) => s?.playerId === playerId);
  }

  addPlayer(player: { playerId: string; nickname: string; avatarId: string; beans: number; isBot?: boolean }): boolean {
    if (this.isFull()) return false;
    const existingIdx = this.seats.findIndex((s) => s?.playerId === player.playerId);
    if (existingIdx !== -1) return true;

    const emptyIdx = this.seats.findIndex((s) => s === null);
    if (emptyIdx === -1) return false;

    this.seats[emptyIdx] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      beans: player.beans,
      isBot: Boolean(player.isBot),
      seatIndex: emptyIdx,
      ready: true,
      disconnected: false,
      trusteeship: false,
    };

    if (this.phase === 'WAITING') {
      this.autoFillBotsAndStart();
    }

    return true;
  }

  removePlayer(playerId: string): boolean {
    const idx = this.seats.findIndex((s) => s?.playerId === playerId);
    if (idx !== -1) {
      this.seats[idx] = null;
      if (this.isEmpty()) {
        this.destroy();
      } else {
        this.broadcastSnapshot();
      }
      return true;
    }
    return false;
  }

  isEmptyOfHumans(): boolean {
    return this.seats.every((s) => !s || s.isBot);
  }

  setPlayerReady(playerId: string, ready = true): void {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (!seat) return;
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
    if (ready && (this.phase === 'WAITING' || this.phase === 'SETTLEMENT')) {
      this.startRound();
    }
  }

  rebuySeatScore(playerId: string, addedScore: number): number {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (!seat) return 0;
    seat.beans = Math.max(0, seat.beans) + Math.max(0, Math.round(addedScore));
    seat.ready = true;
    this.broadcastSnapshot();
    if (this.phase === 'WAITING' || this.phase === 'SETTLEMENT') {
      this.startRound();
    }
    return seat.beans;
  }

  triggerImmediateDeal(): void {
    if (this.phase !== 'WAITING' && this.phase !== 'SETTLEMENT') return;
    if (this.preDealTimer) {
      clearTimeout(this.preDealTimer);
      this.preDealTimer = null;
    }
    while (this.getPlayerCount() < this.maxPlayers) {
      this.addBotPlayer();
    }
    this.startRound();
  }

  addBotPlayer(): boolean {
    if (this.isFull()) return false;
    const emptyIdx = this.seats.findIndex((s) => s === null);
    if (emptyIdx === -1) return false;

    const usedNicknames = new Set(this.seats.filter(Boolean).map((s) => s!.nickname));
    const availableProfiles = BOT_PROFILES.filter((p) => !usedNicknames.has(p.nickname));
    const botProfile =
      availableProfiles[Math.floor(Math.random() * availableProfiles.length)] ||
      BOT_PROFILES[emptyIdx % BOT_PROFILES.length];

    this.seats[emptyIdx] = {
      playerId: `bot_${this.roomId}_${emptyIdx}_${Date.now()}`,
      nickname: botProfile.nickname,
      avatarId: botProfile.avatarId,
      beans: this.initialScore,
      isBot: true,
      seatIndex: emptyIdx,
      ready: true,
      disconnected: false,
      trusteeship: false,
    };
    return true;
  }

  replaceBotWithHuman(player: {
    playerId: string;
    nickname: string;
    avatarId: string;
    beans: number;
  }): boolean {
    if (this.phase !== 'WAITING' && this.phase !== 'SETTLEMENT') return false;
    const botIdx = this.seats.findIndex((s) => s?.isBot);
    if (botIdx === -1) return false;
    this.seats[botIdx] = {
      playerId: player.playerId,
      nickname: player.nickname,
      avatarId: player.avatarId,
      beans: player.beans,
      isBot: false,
      seatIndex: botIdx,
      ready: true,
      disconnected: false,
      trusteeship: false,
    };
    this.broadcastSnapshot();
    return true;
  }

  private isAutoActSeat(seatId: number): boolean {
    const p = this.seats[seatId];
    return Boolean(p && (p.isBot || p.disconnected || p.trusteeship));
  }

  autoFillBotsAndStart(): void {
    while (this.getPlayerCount() < this.maxPlayers) {
      this.addBotPlayer();
    }
    this.broadcastSnapshot();
    if (!this.hasDealtFirstRound) {
      if (this.preDealTimer) clearTimeout(this.preDealTimer);
      this.preDealTimer = setTimeout(() => {
        this.preDealTimer = null;
        if (this.phase === 'WAITING' && !this.isEmptyOfHumans()) {
          this.startRound();
        }
      }, PRE_DEAL_ESCROW_WINDOW_MS);
    } else {
      this.startRound();
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

  startRound(): void {
    if (this.preDealTimer) {
      clearTimeout(this.preDealTimer);
      this.preDealTimer = null;
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

    if (!this.hasDealtFirstRound) {
      this.hasDealtFirstRound = true;
      this.commitFirstRoundEscrow();
    }

    this.phase = 'DEALING';
    this.deck = createDeckForPlayMode(this.playMode);
    this.hands = [[], [], [], []];
    this.drawnTiles = [null, null, null, null];
    this.melds = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.dingQueSuits = [null, null, null, null];
    this.huCounts = [0, 0, 0, 0];
    this.gangCounts = [0, 0, 0, 0];
    this.discardSeq = 0;
    this.latestDiscard = null;
    this.diceValues = [
      Math.floor(Math.random() * 6) + 1,
      Math.floor(Math.random() * 6) + 1,
    ];
    this.bills = [];
    this.pendingActions.clear();
    this.pendingResponders.clear();
    this.submittedResponses.clear();
    this.retiredSeats.clear();
    this.winningEvents = [];
    this.initialRoundBeans = this.seats.map((s) => s?.beans ?? 0);
    this.settlementData = null;

    // Deal 13 cards to each player
    for (let seat = 0; seat < 4; seat++) {
      this.hands[seat] = sortTiles(this.deck.splice(0, 13), this.playMode);
    }
    this.dealerSeatId = 0;
    this.currentTurnSeatId = 0;

    MahjongDebugLogger.logDealSnapshot({
      roomId: this.roomId,
      mode: this.playMode,
      dealerSeat: this.dealerSeatId,
      wallRemaining: this.deck.length,
      seats: this.seats.map((s, idx) => ({
        seat: idx,
        name: s?.nickname || `座位${idx}`,
        isBot: s?.isBot,
        hand: this.hands[idx],
        melds: this.melds[idx],
        discards: this.discards[idx],
      })),
      source: 'SERVER',
    });

    this.broadcastSnapshot();

    const isHongZhong = this.playMode === 'hongzhong' || this.playMode === 'hongzhong_xueliu';
    const requiresDingQue = isHongZhong || this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi';

    if (requiresDingQue) {
      setTimeout(() => {
        this.phase = 'DING_QUE';
        this.broadcastSnapshot();

        for (let s = 0; s < 4; s++) {
          if (this.isAutoActSeat(s)) {
            this.dingQueSuits[s] = MahjongBotEngine.decideDingQue(this.hands[s], this.playMode);
          }
        }

        if (this.dingQueSuits.every((s) => s !== null)) {
          this.finishDingQueAndStartPlay();
        }
      }, 700);
    } else {
      // Classic Tuidaohu / Puer: No DingQue
      this.dingQueSuits = [null, null, null, null];
      setTimeout(() => {
        this.finishDingQueAndStartPlay();
      }, 700);
    }
  }

  handlePlayerDingQue(playerId: string, suit: MahjongSuit): void {
    if (this.phase !== 'DING_QUE') return;
    const seatId = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatId === -1) return;

    this.dingQueSuits[seatId] = suit;
    this.broadcastSnapshot();

    if (this.dingQueSuits.every((s) => s !== null)) {
      this.finishDingQueAndStartPlay();
    }
  }

  private finishDingQueAndStartPlay(): void {
    this.phase = 'PLAYING';

    // Dealer draws 14th tile
    const dealerCard = this.deck.pop();
    if (dealerCard !== undefined) {
      this.drawnTiles[this.dealerSeatId] = dealerCard;
      this.hands[this.dealerSeatId].push(dealerCard);
    }

    this.broadcastSnapshot();
    this.checkTurnActions(this.dealerSeatId);
  }

  private checkTurnActions(seatId: number): void {
    this.pendingActions.clear();
    if (this.retiredSeats.has(seatId)) return;

    const hand = this.hands[seatId];
    const drawn = this.drawnTiles[seatId];
    const dingQue = this.dingQueSuits[seatId];

    const actions: AvailableAction[] = [];

    // Check Zimo Hu
    const huRes = evaluateHu(
      hand,
      undefined,
      this.melds[seatId],
      dingQue,
      true,
      false,
      false,
      false,
      false,
      256,
      this.playMode
    );
    if (huRes.canHu) {
      actions.push({
        actionType: 'hu',
        targetTile: drawn || hand[hand.length - 1],
        fanName: huRes.fanName,
        factor: huRes.totalFactor,
      });
    }

    // Check AnGang & BuGang
    const gangOpts = checkGangOptions(hand, undefined, true, this.melds[seatId], dingQue, this.playMode);
    for (const opt of gangOpts) {
      actions.push({
        actionType: 'gang',
        targetTile: opt.tileId,
        meldTiles: opt.tiles,
      });
    }

    if (actions.length > 0) {
      actions.push({ actionType: 'pass', targetTile: 0 });
      this.pendingActions.set(seatId, actions);
    }

    this.broadcastSnapshot();

    const player = this.seats[seatId];
    const visibleTiles = [
      ...this.discards.flat(),
      ...this.melds.flatMap((mList) => mList.flatMap((m) => m.tiles || [])),
    ];
    const lackMap: Record<number, 'wan' | 'tiao' | 'tong'> = { 0: 'wan', 1: 'tiao', 2: 'tong' };
    MahjongDebugLogger.logTurnAnalysis({
      seat: seatId,
      playerName: player?.nickname || `座位${seatId}`,
      mode: this.playMode,
      drawnTile: drawn,
      hand,
      melds: this.melds[seatId],
      visibleTiles,
      lackSuit: dingQue !== null && dingQue !== undefined ? lackMap[dingQue] || null : null,
      wallRemaining: this.deck.length,
      isBot: player?.isBot,
      source: 'SERVER',
    });

    if (this.isAutoActSeat(seatId)) {
      this.scheduleBotTurn(seatId);
    }
  }

  private scheduleBotTurn(seatId: number): void {
    if (this.botTimer) clearTimeout(this.botTimer);
    const delayMs = 1150 + Math.floor(Math.random() * 100);
    this.botTimer = setTimeout(() => {
      const pending = this.pendingActions.get(seatId);
      if (pending && pending.length > 0) {
        const choice = MahjongBotEngine.decideAction(
          pending,
          this.hands[seatId],
          this.melds[seatId]?.length || 0,
          this.playMode
        );
        if (choice) {
          this.executeAction(seatId, choice);
          return;
        }
      }

      const discardsCount: Record<number, number> = {};
      for (const river of this.discards) {
        for (const t of river) discardsCount[t] = (discardsCount[t] || 0) + 1;
      }
      for (const pMelds of this.melds) {
        for (const m of pMelds) {
          const mTiles = m.tiles || (m.card ? [m.card, m.card, m.card] : []);
          for (const t of mTiles) discardsCount[t] = (discardsCount[t] || 0) + 1;
        }
      }

      const discard = MahjongBotEngine.decideDiscard(
        this.hands[seatId],
        this.dingQueSuits[seatId],
        this.melds[seatId],
        this.deck.length,
        discardsCount,
        this.playMode
      );
      this.executeDiscard(seatId, discard);
    }, delayMs);
  }

  handlePlayerDiscard(playerId: string, tileId: number): void {
    if (this.phase !== 'PLAYING') return;
    const seatId = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatId === -1 || seatId !== this.currentTurnSeatId) return;

    this.executeDiscard(seatId, tileId);
  }

  private executeDiscard(seatId: number, tileId: number): void {
    const hand = this.hands[seatId];
    const idx = hand.indexOf(tileId);
    if (idx === -1) return;

    hand.splice(idx, 1);
    this.hands[seatId] = sortTiles(hand, this.playMode);
    this.drawnTiles[seatId] = null;
    this.discards[seatId].push(tileId);
    this.discardSeq++;
    this.latestDiscard = { seatId, tileId, seq: this.discardSeq };

    const player = this.seats[seatId];
    const isFemale = player?.avatarId === 'beier' || player?.avatarId === 'heroine';
    const lackMap: Record<number, 'wan' | 'tiao' | 'tong'> = { 0: 'wan', 1: 'tiao', 2: 'tong' };
    const dq = this.dingQueSuits[seatId];
    MahjongDebugLogger.logDiscardAction({
      seat: seatId,
      playerName: player?.nickname || `座位${seatId}`,
      tileId,
      gender: isFemale ? 'female' : 'male',
      mode: this.playMode,
      handAfter: this.hands[seatId],
      melds: this.melds[seatId],
      lackSuit: dq !== null && dq !== undefined ? lackMap[dq] || null : null,
      visibleTiles: [
        ...this.discards.flat(),
        ...this.melds.flatMap((mList) => mList.flatMap((m) => m.tiles || [])),
      ],
      source: 'SERVER',
    });

    this.arbitrateDiscardResponse(seatId, tileId);
  }

  private arbitrateDiscardResponse(discardSeatId: number, tileId: number): void {
    this.pendingActions.clear();
    this.pendingResponders.clear();
    this.submittedResponses.clear();
    if (this.responseTimer) clearTimeout(this.responseTimer);

    for (let s = 0; s < 4; s++) {
      if (s === discardSeatId || this.retiredSeats.has(s)) continue;
      const otherHand = this.hands[s];
      const otherMelds = this.melds[s];
      const otherDingQue = this.dingQueSuits[s];

      const actions: AvailableAction[] = [];

      // 1. Dianpao Hu
      const huRes = evaluateHu(
        otherHand,
        tileId,
        otherMelds,
        otherDingQue,
        false,
        false,
        false,
        false,
        false,
        256,
        this.playMode
      );
      if (huRes.canHu) {
        actions.push({
          actionType: 'hu',
          targetTile: tileId,
          fanName: huRes.fanName,
          factor: huRes.totalFactor,
        });
      }

      // 2. Direct Gang
      const gangOpts = checkGangOptions(otherHand, tileId, false, otherMelds, otherDingQue, this.playMode);
      for (const g of gangOpts) {
        actions.push({ actionType: 'gang', targetTile: tileId, meldTiles: g.tiles });
      }

      // 3. Peng
      if (canPeng(otherHand, tileId, otherDingQue, this.playMode)) {
        actions.push({
          actionType: 'peng',
          targetTile: tileId,
          meldTiles: [tileId, tileId, tileId],
        });
      }

      if (actions.length > 0) {
        actions.push({ actionType: 'pass', targetTile: tileId });
        this.pendingActions.set(s, actions);
        this.pendingResponders.add(s);
      }
    }

    this.broadcastSnapshot();

    if (this.pendingResponders.size === 0) {
      this.nextTurn((discardSeatId + 1) % 4);
      return;
    }

    // Safety timeout: auto pass if no response within 9 seconds
    this.responseTimer = setTimeout(() => {
      for (const s of this.pendingResponders) {
        this.submittedResponses.set(s, { actionType: 'pass', targetTile: tileId });
      }
      this.pendingResponders.clear();
      this.resolveDiscardResponses();
    }, 9000);

    // AI bot or disconnected/trusteeship player automatic response scheduling (950ms ~ 1100ms)
    this.pendingResponders.forEach((s) => {
      if (this.isAutoActSeat(s)) {
        const acts = this.pendingActions.get(s) || [];
        setTimeout(() => {
          if (!this.pendingResponders.has(s)) return;
          const act = MahjongBotEngine.decideAction(
            acts,
            this.hands[s],
            this.melds[s]?.length || 0,
            this.playMode
          );
          this.submitPlayerResponse(s, act || { actionType: 'pass', targetTile: tileId });
        }, 950 + Math.floor(Math.random() * 150));
      }
    });
  }

  handlePlayerAction(
    playerId: string,
    actionType: string,
    meldTiles?: number[]
  ): void {
    const seatId = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatId === -1) return;

    const acts = this.pendingActions.get(seatId);
    if (!acts) return;

    const matched = acts.find((a) => a.actionType === actionType);
    if (!matched) return;

    const fullAction = { ...matched, meldTiles: meldTiles || matched.meldTiles };

    if (this.pendingResponders.has(seatId)) {
      // Discard response phase
      this.submitPlayerResponse(seatId, fullAction);
    } else {
      // Self turn action (Zimo Hu, AnGang, BuGang)
      this.executeAction(seatId, fullAction);
    }
  }

  private submitPlayerResponse(seatId: number, action: AvailableAction): void {
    if (!this.pendingResponders.has(seatId)) return;
    this.submittedResponses.set(seatId, action);
    this.pendingResponders.delete(seatId);

    // If all responders submitted, arbitrate immediately
    if (this.pendingResponders.size === 0) {
      if (this.responseTimer) clearTimeout(this.responseTimer);
      this.resolveDiscardResponses();
    }
  }

  /**
   * Deterministic arbitration: Hu (highest priority) > Gang/Peng > Pass.
   * Completely solves the concurrency bug where a faster Peng stolen an eligible Hu!
   */
  private resolveDiscardResponses(): void {
    this.pendingActions.clear();
    if (!this.latestDiscard) return;
    const discardTile = this.latestDiscard.tileId;
    const discardSeat = this.latestDiscard.seatId;

    // 1. Check for Hu actions (supports YiPaoDuoXiang if multiple Hu)
    const huResponders: Array<{ seatId: number; action: AvailableAction }> = [];
    this.submittedResponses.forEach((act, seat) => {
      if (act.actionType === 'hu') {
        huResponders.push({ seatId: seat, action: act });
      }
    });

    if (huResponders.length > 0) {
      // Discarded tile is won and removed from river
      this.discards[discardSeat].pop();

      for (const { seatId, action } of huResponders) {
        this.huCounts[seatId] += 1;
        const winPoints = (action.factor || 2) * this.baseScore;

        this.winningEvents.push({
          seatId,
          winType: 'dianpao',
          fan: action.factor || 2,
          fanNames: [action.fanName || '点炮平胡'],
          winCard: discardTile,
          fromSeat: discardSeat,
          score: winPoints,
        });

        this.bills.push({
          id: `bill_${Date.now()}_${seatId}`,
          timestamp: Date.now(),
          eventType: 'dianpao',
          winnerSeatId: seatId,
          loserSeatId: discardSeat,
          fanName: action.fanName || '点炮平胡',
          totalFactor: action.factor || 2,
          scoreDelta: winPoints,
        });

        this.transferBeans(seatId, discardSeat, winPoints);

        if (this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi') {
          this.retiredSeats.add(seatId);
        }
      }

      this.broadcastSnapshot();

      // All standard/casual game modes (puer, tuidaohu, hongzhong, guobiao, etc.): First Hu ends round!
      // Only multi-hu blood battle mode (xuezhan) continues until 3 players retire.
      const isBloodBattle = this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi';
      if (!isBloodBattle || this.retiredSeats.size >= 3) {
        this.settleRound();
        return;
      }

      this.nextTurn((discardSeat + 1) % 4);
      return;
    }

    // 2. Check for Gang / Peng
    let gangCandidate: { seatId: number; action: AvailableAction } | null = null;
    let pengCandidate: { seatId: number; action: AvailableAction } | null = null;

    this.submittedResponses.forEach((act, seat) => {
      if (act.actionType === 'gang' && !gangCandidate) {
        gangCandidate = { seatId: seat, action: act };
      } else if (act.actionType === 'peng' && !pengCandidate) {
        pengCandidate = { seatId: seat, action: act };
      }
    });

    if (gangCandidate) {
      this.executeGangAction((gangCandidate as any).seatId, (gangCandidate as any).action);
      return;
    }

    if (pengCandidate) {
      this.executePengAction((pengCandidate as any).seatId, (pengCandidate as any).action);
      return;
    }

    // 3. All passed: turn goes to next player after discarder
    this.nextTurn((discardSeat + 1) % 4);
  }

  private executeAction(seatId: number, action: AvailableAction): void {
    this.pendingActions.delete(seatId);

    if (action.actionType === 'hu') {
      this.pendingActions.clear();
      this.huCounts[seatId] += 1;
      const targetCard =
        this.drawnTiles[seatId] || this.hands[seatId][this.hands[seatId].length - 1] || 1;
      const winPoints = (action.factor || 2) * this.baseScore;

      this.winningEvents.push({
        seatId,
        winType: 'zimo',
        fan: action.factor || 2,
        fanNames: [action.fanName || '自摸平胡'],
        winCard: targetCard,
        fromSeat: seatId,
        score: winPoints,
      });

      this.bills.push({
        id: `bill_${Date.now()}_${seatId}`,
        timestamp: Date.now(),
        eventType: 'zimo',
        winnerSeatId: seatId,
        loserSeatId: -1,
        fanName: action.fanName || '自摸平胡',
        totalFactor: action.factor || 2,
        scoreDelta: winPoints,
      });

      this.transferBeans(seatId, -1, winPoints);

      if (this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi') {
        this.retiredSeats.add(seatId);
      }

      this.broadcastSnapshot();

      // All standard/casual game modes (puer, tuidaohu, hongzhong, guobiao, etc.): First Hu ends round!
      const isBloodBattle = this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi';
      if (!isBloodBattle || this.retiredSeats.size >= 3) {
        this.settleRound();
        return;
      }

      this.nextTurn((seatId + 1) % 4);
      return;
    }

    if (action.actionType === 'gang') {
      this.executeGangAction(seatId, action);
      return;
    }

    if (action.actionType === 'peng') {
      this.executePengAction(seatId, action);
      return;
    }
  }

  private executeGangAction(seatId: number, action: AvailableAction): void {
    this.gangCounts[seatId] += 1;
    const target = action.targetTile;
    const isAnGang = action.meldTiles?.length === 4 && seatId === this.currentTurnSeatId;
    const isBuGang = this.melds[seatId].some((m) => m.type === 'peng' && m.tiles[0] === target);

    const meldType = isAnGang
      ? target === HONG_ZHONG_TILE
        ? 'hongzhong_gang'
        : 'an_gang'
      : isBuGang
      ? 'bu_gang'
      : 'ming_gang';

    if (isAnGang) {
      for (let i = 0; i < 4; i++) {
        const idx = this.hands[seatId].indexOf(target);
        if (idx !== -1) this.hands[seatId].splice(idx, 1);
      }
    } else if (isBuGang) {
      const idx = this.hands[seatId].indexOf(target);
      if (idx !== -1) this.hands[seatId].splice(idx, 1);
      const mIdx = this.melds[seatId].findIndex(
        (m) => m.type === 'peng' && m.tiles[0] === target
      );
      if (mIdx !== -1) this.melds[seatId].splice(mIdx, 1);
    } else {
      for (let i = 0; i < 3; i++) {
        const idx = this.hands[seatId].indexOf(target);
        if (idx !== -1) this.hands[seatId].splice(idx, 1);
      }
      if (this.latestDiscard) {
        this.discards[this.latestDiscard.seatId].pop();
      }
    }

    const triggerSeat = isAnGang ? seatId : this.latestDiscard?.seatId ?? seatId;
    if (!isAnGang && !isBuGang) {
      this.latestDiscard = null;
    }

    this.melds[seatId].push({
      type: meldType,
      kind: (meldType === 'hongzhong_gang' ? 'an_gang' : meldType) as any,
      card: target,
      fromSeat: triggerSeat,
      triggerSeatId: triggerSeat,
      tiles: [target, target, target, target],
    });

    const gangPoints = (isAnGang ? 2 : 1) * this.baseScore;
    const gangLoser = isAnGang || isBuGang ? -1 : this.latestDiscard?.seatId ?? -1;

    this.bills.push({
      id: `gang_${Date.now()}_${seatId}`,
      timestamp: Date.now(),
      eventType: isAnGang ? 'xiayu' : 'guafeng',
      winnerSeatId: seatId,
      loserSeatId: gangLoser,
      fanName: isAnGang ? '下雨 (暗杠)' : '刮风 (杠牌)',
      totalFactor: isAnGang ? 2 : 1,
      scoreDelta: gangPoints,
    });

    this.transferBeans(seatId, gangLoser, gangPoints);

    // Draw replacement card after gang
    this.drawTileForSeat(seatId);
  }

  private executePengAction(seatId: number, action: AvailableAction): void {
    const target = action.targetTile;
    for (let i = 0; i < 2; i++) {
      const idx = this.hands[seatId].indexOf(target);
      if (idx !== -1) this.hands[seatId].splice(idx, 1);
    }
    if (this.latestDiscard) {
      this.discards[this.latestDiscard.seatId].pop();
    }
    const triggerSeat = this.latestDiscard?.seatId ?? seatId;
    this.latestDiscard = null;

    this.melds[seatId].push({
      type: 'peng',
      kind: 'peng',
      card: target,
      fromSeat: triggerSeat,
      triggerSeatId: triggerSeat,
      tiles: [target, target, target],
    });

    this.currentTurnSeatId = seatId;
    this.broadcastSnapshot();
    this.checkTurnActions(seatId);
  }

  private nextTurn(seatId: number): void {
    let targetSeat = seatId;
    let attempts = 0;
    while (this.retiredSeats.has(targetSeat) && attempts < 4) {
      targetSeat = (targetSeat + 1) % 4;
      attempts++;
    }

    if (attempts >= 4 || this.deck.length === 0) {
      this.settleRound();
      return;
    }

    this.currentTurnSeatId = targetSeat;
    this.drawTileForSeat(targetSeat);
  }

  private drawTileForSeat(seatId: number): void {
    if (this.deck.length === 0) {
      this.settleRound();
      return;
    }

    const tile = this.deck.pop()!;
    this.drawnTiles[seatId] = tile;
    this.hands[seatId].push(tile);
    this.currentTurnSeatId = seatId;

    this.broadcastSnapshot();
    this.checkTurnActions(seatId);
  }

  private transferBeans(winnerSeat: number, loserSeat: number, amount: number): void {
    const RAKE_RATE = 0;
    if (loserSeat === -1) {
      let totalDeducted = 0;
      for (let s = 0; s < 4; s++) {
        if (s !== winnerSeat && this.seats[s]) {
          const actualDeduct = Math.min(Math.max(0, this.seats[s]!.beans), amount);
          this.seats[s]!.beans -= actualDeduct;
          totalDeducted += actualDeduct;
          if (!this.seats[s]!.isBot) {
            storageService.updateBeans(this.seats[s]!.playerId, -actualDeduct);
          }
        }
      }
      const winAfterRake = Math.floor(totalDeducted * (1 - RAKE_RATE));
      if (this.seats[winnerSeat]) {
        this.seats[winnerSeat]!.beans += winAfterRake;
        if (!this.seats[winnerSeat]!.isBot) {
          storageService.updateBeans(this.seats[winnerSeat]!.playerId, winAfterRake);
        }
      }
    } else if (this.seats[loserSeat] && this.seats[winnerSeat]) {
      const actualDeduct = Math.min(Math.max(0, this.seats[loserSeat]!.beans), amount);
      this.seats[loserSeat]!.beans -= actualDeduct;
      const winAfterRake = Math.floor(actualDeduct * (1 - RAKE_RATE));
      this.seats[winnerSeat]!.beans += winAfterRake;
      if (!this.seats[loserSeat]!.isBot) {
        storageService.updateBeans(this.seats[loserSeat]!.playerId, -actualDeduct);
      }
      if (!this.seats[winnerSeat]!.isBot) {
        storageService.updateBeans(this.seats[winnerSeat]!.playerId, winAfterRake);
      }
    }
  }

  private settleRound(): void {
    this.phase = 'SETTLEMENT';
    this.performSettlement();
    this.broadcastSnapshot();
  }

  private performSettlement(): void {
    const hasHuWinners = this.winningEvents.length > 0;
    const isPuer = this.playMode === 'puer';
    const isClassic = this.playMode === 'tuidaohu' || this.playMode === 'classic_tuidaohu';
    const isChuan =
      this.playMode === 'xuezhan' ||
      this.playMode === 'xuezhan_daodi' ||
      this.playMode === 'hongzhong_xueliu';

    if (isChuan && (!hasHuWinners || this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi')) {
      // 1. 查花猪 (Check Pig): unretired players who still have Ding Que suit tiles pay 16x baseScore to non-pigs
      for (let s = 0; s < 4; s++) {
        if (this.retiredSeats.has(s) || this.huCounts[s] > 0) continue;
        const dq = this.dingQueSuits[s];
        if (dq !== null && this.hands[s].some((t) => getSuit(t) === dq)) {
          const pigFine = 16 * this.baseScore;
          for (let other = 0; other < 4; other++) {
            if (other === s) continue;
            const otherDq = this.dingQueSuits[other];
            const otherIsPig = otherDq !== null && this.hands[other].some((t) => getSuit(t) === otherDq);
            if (!otherIsPig) {
              this.bills.push({
                id: `huazhu_${Date.now()}_${s}_${other}`,
                timestamp: Date.now(),
                eventType: 'dianpao',
                winnerSeatId: other,
                loserSeatId: s,
                fanName: '查花猪 (赔满番)',
                totalFactor: 16,
                scoreDelta: pigFine,
              });
              this.transferBeans(other, s, pigFine);
            }
          }
        }
      }
    }

    if ((isChuan && (this.playMode === 'xuezhan' || this.playMode === 'xuezhan_daodi')) || !hasHuWinners) {
      // 2. 查大叫 (Check Ready Hands: 川麻终局或普洱麻将流局)
      const discardsCount: Record<number, number> = {};
      for (const river of this.discards) {
        for (const t of river) discardsCount[t] = (discardsCount[t] || 0) + 1;
      }
      for (const pMelds of this.melds) {
        for (const m of pMelds) {
          const mTiles = m.tiles || (m.card ? [m.card, m.card, m.card] : []);
          for (const t of mTiles) discardsCount[t] = (discardsCount[t] || 0) + 1;
        }
      }

      const tingResults = this.hands.map((h, s) => {
        return analyzeTing(h, this.melds[s], this.dingQueSuits[s], discardsCount, this.playMode);
      });

      // Crucial Fix: Any player who already Hu'd or retired is considered READY!
      const isReady = tingResults.map((tList, s) => {
        if (this.retiredSeats.has(s) || this.huCounts[s] > 0) return true;
        return tList.length > 0;
      });

      const maxFactors = tingResults.map((tList) => {
        if (tList.length === 0) return 0;
        return Math.max(...tList.map((cand) => cand.factor));
      });

      for (let unreadySeat = 0; unreadySeat < 4; unreadySeat++) {
        if (isReady[unreadySeat]) continue;
        for (let readySeat = 0; readySeat < 4; readySeat++) {
          if (!isReady[readySeat] || unreadySeat === readySeat) continue;
          const factor = Math.max(1, maxFactors[readySeat]);
          const points = factor * this.baseScore;
          this.bills.push({
            id: `chadajiao_${Date.now()}_${unreadySeat}_${readySeat}`,
            timestamp: Date.now(),
            eventType: 'dianpao',
            winnerSeatId: readySeat,
            loserSeatId: unreadySeat,
            fanName: `查大叫 (${factor}番)`,
            totalFactor: factor,
            scoreDelta: points,
          });
          this.transferBeans(readySeat, unreadySeat, points);
        }
      }

      // 3. 退税 (Tax Refund: only unready players who did NOT hu must refund gang)
      const gangBills = this.bills.filter(
        (b) => (b.eventType === 'guafeng' || b.eventType === 'xiayu') && b.winnerSeatId !== undefined
      );
      for (let unreadySeat = 0; unreadySeat < 4; unreadySeat++) {
        if (isReady[unreadySeat]) continue;
        const wonGangs = gangBills.filter((b) => b.winnerSeatId === unreadySeat);
        for (const gang of wonGangs) {
          const refundPoints = gang.scoreDelta || this.baseScore;
          const targetLoser = gang.loserSeatId ?? -1;
          this.bills.push({
            id: `tuishui_${Date.now()}_${unreadySeat}`,
            timestamp: Date.now(),
            winnerSeatId: targetLoser,
            loserSeatId: unreadySeat,
            fanName: '退税 (未听牌退杠)',
            totalFactor: gang.totalFactor || 1,
            scoreDelta: refundPoints,
          });
          if (targetLoser === -1) {
            for (let s = 0; s < 4; s++) {
              if (s !== unreadySeat) {
                const part = Math.floor(refundPoints / 3);
                this.transferBeans(s, unreadySeat, part);
              }
            }
          } else {
            this.transferBeans(targetLoser, unreadySeat, refundPoints);
          }
        }
      }
    }

    // 4. Final round net score deltas
    const scoreDeltas = this.seats.map((s, idx) => {
      const currentBeans = s?.beans ?? 0;
      const initBeans = this.initialRoundBeans[idx] ?? currentBeans;
      return currentBeans - initBeans;
    });

    // 5. Winners population
    let winners: MjSettlementWinner[] = [...this.winningEvents];
    if (winners.length === 0) {
      const maxDelta = Math.max(...scoreDeltas);
      if (maxDelta > 0 && !isClassic) {
        this.seats.forEach((s, idx) => {
          if (scoreDeltas[idx] === maxDelta) {
            winners.push({
              seatId: idx,
              winType: 'zimo',
              fan: 1,
              fanNames: ['查大叫胜'],
              winCard: this.hands[idx][this.hands[idx].length - 1] || 1,
              fromSeat: idx,
              score: scoreDeltas[idx],
            });
          }
        });
      }
    }

    const revealHands = this.hands.map((h) => sortTiles([...h], this.playMode));

    this.settlementData = {
      endedReason: winners.length > 0 ? 'hu' : 'draw',
      winners,
      scoreDeltas,
      beans: this.seats.map((s) => s?.beans ?? 0),
      revealHands,
      melds: this.melds.map((mList) => [...mList]),
      remainWallCount: this.deck.length,
      nextDealerSeatId: winners.length > 0 ? winners[0].seatId : (this.dealerSeatId + 1) % 4,
      roundIndex: 1,
      timestamp: Date.now(),
    };

    // 6. Record match settlement into persistent storage
    const storageResults = this.seats.map((s, idx) => {
      const delta = scoreDeltas[idx] ?? 0;
      const isWinner = winners.some((w) => w.seatId === idx);
      return {
        playerId: s?.playerId ?? `seat_${idx}`,
        nickname: s?.nickname ?? `玩家${idx + 1}`,
        isBot: Boolean(s?.isBot),
        role: isWinner ? 'hu' : 'player',
        scoreDelta: delta,
        isWinner,
      };
    });

    const winRole = winners.length > 0 ? (winners[0].winType === 'zimo' ? 'zimo' : 'hu') : 'draw';
    const effectiveMultiplier = winners.length > 0 ? Math.max(1, winners[0].fan) : 1;

    storageService.recordSettlement(
      this.roomId,
      this.gameType,
      this.baseScore,
      effectiveMultiplier,
      winRole,
      storageResults,
      undefined,
      true // skipBeanUpdate: true, beans already transferred in real-time
    );

    const humanIdx = this.seats.findIndex((s) => s && !s.isBot);
    if (humanIdx !== -1 && this.seats[humanIdx]) {
      const human = this.seats[humanIdx]!;
      const updatedRcSession = roomCardEngine.recordRoundSettlement({
        roomId: this.roomId,
        heroId: human.playerId,
        heroDelta: scoreDeltas[humanIdx] ?? 0,
        heroName: human.nickname,
        summaryText: winners.length > 0 ? '胡牌结算' : '流局查叫结算',
        peerDeltas: this.seats
          .map((s, idx) =>
            s && idx !== humanIdx
              ? { id: s.playerId, name: s.nickname, delta: scoreDeltas[idx] ?? 0 }
              : null
          )
          .filter((x): x is { id: string; name: string; delta: number } => Boolean(x)),
      });
      if (updatedRcSession) {
        for (const s of this.seats) {
          if (s && !s.isBot) {
            this.connectionManager.emitToPlayer(s.playerId, 's2c_rc_session_sync', {
              session: updatedRcSession,
            });
          }
        }
      }
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
      }
    }
  }

  buildSnapshotForPlayer(playerId: string): MahjongTableSnapshot {
    const mySeatId = this.seats.findIndex((s) => s?.playerId === playerId);
    const isSettlement = this.phase === 'SETTLEMENT' || this.phase === 'CHA_DA_JIAO';

    const players = this.seats.map((s, idx) => {
      const isMe = idx === mySeatId;
      const handTiles = isSettlement
        ? (this.settlementData?.revealHands[idx] || sortTiles([...this.hands[idx]]))
        : (isMe ? [...this.hands[idx]] : undefined);

      return {
        seatId: idx,
        playerId: s?.playerId ?? '',
        nickname: s?.nickname ?? '',
        avatarId: s?.avatarId ?? 'noble',
        beans: s?.beans ?? 0,
        isBot: s?.isBot ?? false,
        handCount: this.hands[idx].length,
        handTiles,
        drawnTile: isMe ? this.drawnTiles[idx] : null,
        melds: [...this.melds[idx]],
        discards: [...this.discards[idx]],
        dingQueSuit: this.dingQueSuits[idx],
        isTing: false,
        huCount: this.huCounts[idx],
        gangCount: this.gangCounts[idx],
        scoreDelta: this.settlementData ? this.settlementData.scoreDeltas[idx] : undefined,
      };
    });

    const discardsCount: Record<number, number> = {};
    for (const river of this.discards) {
      for (const t of river) {
        discardsCount[t] = (discardsCount[t] || 0) + 1;
      }
    }
    for (const pMelds of this.melds) {
      for (const m of pMelds) {
        const mTiles = m.tiles || (m.card ? [m.card, m.card, m.card] : []);
        for (const t of mTiles) {
          discardsCount[t] = (discardsCount[t] || 0) + 1;
        }
      }
    }

    const tingList =
      mySeatId !== -1 && this.phase === 'PLAYING'
        ? analyzeTing(
            this.hands[mySeatId],
            this.melds[mySeatId],
            this.dingQueSuits[mySeatId],
            discardsCount,
            this.playMode
          )
        : [];

    const isMyTurn = mySeatId !== -1 && this.currentTurnSeatId === mySeatId && this.phase === 'PLAYING';
    const optDiscard = isMyTurn
      ? calculateOptimalDiscard(
          this.hands[mySeatId],
          this.melds[mySeatId],
          this.dingQueSuits[mySeatId],
          discardsCount,
          this.discards.flat(),
          this.deck.length,
          this.playMode
        )
      : null;

    // 计算出牌听牌提示 (discardHints): 标记手中哪些牌打出后可以听牌
    const discardHints: Array<{ card: number; waits: number[] }> = [];
    if (isMyTurn && mySeatId !== -1) {
      const myHand = this.hands[mySeatId];
      const uniqueCards = Array.from(new Set(myHand));
      for (const card of uniqueCards) {
        const testHand = [...myHand];
        const cIdx = testHand.indexOf(card);
        if (cIdx !== -1) testHand.splice(cIdx, 1);
        const tList = analyzeTing(
          testHand,
          this.melds[mySeatId],
          this.dingQueSuits[mySeatId],
          discardsCount,
          this.playMode
        );
        if (tList.length > 0) {
          discardHints.push({
            card,
            waits: tList.map((t) => t.tileId),
          });
        }
      }
    }

    return {
      roomId: this.roomId,
      baseScore: this.baseScore,
      dealerSeatId: this.dealerSeatId,
      currentTurnSeatId: this.currentTurnSeatId,
      phase: this.phase,
      remainWallCount: this.deck.length,
      latestDiscard: this.latestDiscard,
      diceValues: this.diceValues,
      players,
      availableActions: mySeatId !== -1 ? this.pendingActions.get(mySeatId) : undefined,
      discardHints,
      tingList,
      optimalDiscard: optDiscard
        ? {
            bestTile: optDiscard.bestTile,
            totalTingCount: optDiscard.totalTingCount,
            maxFactor: optDiscard.maxFactor,
            reason: optDiscard.reason,
          }
        : undefined,
      bills: [...this.bills],
      settlement: this.settlementData || undefined,
      mode: this.playMode,
    };
  }

  sendSnapshotToPlayer(playerId: string): void {
    const socket = this.connectionManager.getSocketByPlayerId(playerId);
    if (!socket) return;
    socket.emit('s2c_mj_snapshot', this.buildSnapshotForPlayer(playerId));
  }

  broadcastSnapshot(): void {
    for (const s of this.seats) {
      if (s && !s.isBot) {
        this.sendSnapshotToPlayer(s.playerId);
      }
    }
  }

  private triggerAutoTakeoverIfNeeded(seatId: number): void {
    if (!this.isAutoActSeat(seatId)) return;
    if (this.phase === 'DING_QUE' && this.dingQueSuits[seatId] === null) {
      const suit = MahjongBotEngine.decideDingQue(this.hands[seatId], this.playMode);
      const p = this.seats[seatId];
      if (p) this.handlePlayerDingQue(p.playerId, suit);
    } else if (this.phase === 'PLAYING') {
      if (this.pendingResponders.has(seatId)) {
        const acts = this.pendingActions.get(seatId) || [];
        const targetTile = this.latestDiscard?.tileId ?? 0;
        setTimeout(() => {
          if (!this.pendingResponders.has(seatId)) return;
          const act = MahjongBotEngine.decideAction(
            acts,
            this.hands[seatId],
            this.melds[seatId]?.length || 0,
            this.playMode
          );
          this.submitPlayerResponse(seatId, act || { actionType: 'pass', targetTile });
        }, 850);
      } else if (this.currentTurnSeatId === seatId) {
        this.scheduleBotTurn(seatId);
      }
    }
  }

  handlePlayerReconnect(playerId: string): void {
    const seat = this.seats.find((s) => s?.playerId === playerId);
    if (seat) {
      seat.disconnected = false;
      seat.trusteeship = false;
    }
    this.sendSnapshotToPlayer(playerId);
    this.broadcastSnapshot();
  }

  handlePlayerDisconnect(playerId: string): void {
    const seatId = this.seats.findIndex((s) => s?.playerId === playerId);
    if (seatId === -1 || !this.seats[seatId]) return;
    this.seats[seatId]!.disconnected = true;
    this.seats[seatId]!.trusteeship = true;
    this.broadcastSnapshot();
    this.triggerAutoTakeoverIfNeeded(seatId);
  }

  handleClientEvent(playerId: string, event: string, payload: unknown): void {
    const seatId = this.seats.findIndex((s) => s?.playerId === playerId);
    if (
      seatId !== -1 &&
      this.seats[seatId] &&
      event !== 'c2s_toggle_trusteeship' &&
      event !== 'c2s_send_chat' &&
      event !== 'c2s_throw_prop'
    ) {
      this.seats[seatId]!.disconnected = false;
      if (this.seats[seatId]!.trusteeship) {
        this.seats[seatId]!.trusteeship = false;
        this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
          playerId,
          seatIndex: seatId,
          trusteeship: false,
        });
      }
    }

    if (event === 'c2s_throw_prop') {
      if (seatId !== -1 && this.seats[seatId]) {
        const data = (payload || {}) as { targetSeat?: number; propType?: string };
        const targetSeat = Number(data.targetSeat);
        const allowedProps = ['flower', 'tea', 'like', 'ingot', 'bomb_cup'];
        const rawProp = String(data.propType ?? 'flower');
        const propType = allowedProps.includes(rawProp) ? rawProp : 'flower';
        if ([0, 1, 2, 3].includes(targetSeat) && targetSeat !== seatId && this.seats[targetSeat]) {
          for (const s of this.seats) {
            if (s && !s.isBot) {
              this.connectionManager.emitToPlayer(s.playerId, 's2c_prop_thrown', {
                fromSeat: seatId,
                toSeat: targetSeat,
                propType,
                fromNickname: this.seats[seatId]!.nickname,
                toNickname: this.seats[targetSeat]!.nickname,
              });
            }
          }
        }
      }
      return;
    }

    if (event === 'c2s_send_chat') {
      if (seatId !== -1 && this.seats[seatId]) {
        const data = (payload || {}) as { text?: string; emoji?: string };
        const text = typeof data.text === 'string' ? data.text.slice(0, 40) : '';
        const emoji = typeof data.emoji === 'string' ? data.emoji.slice(0, 12) : undefined;
        if (text || emoji) {
          for (const s of this.seats) {
            if (s && !s.isBot) {
              this.connectionManager.emitToPlayer(s.playerId, 's2c_chat_message', {
                playerId,
                seatIndex: seatId,
                nickname: this.seats[seatId]!.nickname,
                text,
                emoji,
              });
            }
          }
        }
      }
      return;
    }

    if (event === 'c2s_toggle_trusteeship') {
      if (seatId !== -1 && this.seats[seatId]) {
        const data = (payload || {}) as { trusteeship?: boolean };
        const nextTrust =
          data.trusteeship !== undefined ? Boolean(data.trusteeship) : !this.seats[seatId]!.trusteeship;
        this.seats[seatId]!.trusteeship = nextTrust;
        this.connectionManager.emitToPlayer(playerId, 's2c_trusteeship_changed', {
          playerId,
          seatIndex: seatId,
          trusteeship: nextTrust,
        });
        this.broadcastSnapshot();
        if (nextTrust) {
          this.triggerAutoTakeoverIfNeeded(seatId);
        }
      }
      return;
    }

    if (event === 'c2s_mj_dingque') {
      const p = payload as { suit: MahjongSuit };
      this.handlePlayerDingQue(playerId, p.suit);
    } else if (event === 'c2s_mj_discard') {
      const p = payload as { tileId: number };
      this.handlePlayerDiscard(playerId, p.tileId);
    } else if (event === 'c2s_mj_action') {
      const p = payload as { actionType: string; meldTiles?: number[] };
      this.handlePlayerAction(playerId, p.actionType, p.meldTiles);
    } else if (event === 'c2s_mj_test_settle') {
      const mySeatId = this.seats.findIndex((s) => s?.playerId === playerId);
      const winSeat = mySeatId !== -1 ? mySeatId : 0;
      this.winningEvents = [{
        seatId: winSeat,
        winType: 'zimo',
        fan: 4,
        fanNames: ['自摸平胡'],
        winCard: this.hands[winSeat][this.hands[winSeat].length - 1] || 1,
        fromSeat: winSeat,
        score: 4 * this.baseScore,
      }];
      this.transferBeans(winSeat, -1, 4 * this.baseScore);
      this.settleRound();
    }
  }

  getSummary(): RoomSummary {
    return this.getRoomSummary();
  }

  getRoomSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      gameType: this.gameType,
      mode: this.mode,
      hostId: this.hostId,
      baseScore: this.baseScore,
      initialScore: this.initialScore,
      isPrivate: this.isPrivate,
      status: this.status,
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
    if (this.preDealTimer) clearTimeout(this.preDealTimer);
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.responseTimer) clearTimeout(this.responseTimer);
    this.onRoomDestroyed(this.roomId);
  }
}
