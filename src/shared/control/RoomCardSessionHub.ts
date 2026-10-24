import { useEffect, useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';
import { socketClient } from '../network/SocketClient';

export type RoomCardGameType = 'ddz' | 'mahjong' | 'niuniu' | 'zhajinhua' | 'laoyancai';
export type RoomCardPayMode = 'host' | 'aa' | 'winner';
export type RoomCardRoundCap = 4 | 8 | 16;
export type RoomCardEscrowStatus = 'FROZEN' | 'CAPTURED' | 'RELEASED' | 'ELIGIBILITY_LOCKED';

export interface RoomCardConfig {
  roomId: string;
  gameType: RoomCardGameType;
  subMode: string;
  subModeLabel: string;
  baseScore: number;
  totalRounds: RoomCardRoundCap;
  payMode: RoomCardPayMode;
  fillBots: boolean;
  hostId: string;
  hostName: string;
  createdAt: number;
}

export interface RoomCardPlayerStat {
  id: string;
  name: string;
  seatIndex?: number;
  isHost: boolean;
  isBot: boolean;
  disconnected?: boolean;
  totalDelta: number;
  winCount: number;
  loseCount: number;
  bestSingleRound: number;
  roundsPlayed: number;
}

export interface RoomCardRoundRecord {
  roundIndex: number;
  timestamp: number;
  summaryText: string;
  deltas: Record<string, number>;
  zeroSumCheck?: number;
}

export interface RoomCardScorecardVerification {
  signature: string;
  issuedAt: number;
  zeroSumVerified: boolean;
  escrowState: RoomCardEscrowStatus;
  payerId: string | null;
  payerName: string;
  tieBreakRuleApplied?: string;
}

export interface RoomCardSessionState {
  config: RoomCardConfig;
  currentRound: number;
  status: 'waiting_first_round' | 'in_progress' | 'grand_settled' | 'disbanded_refunded';
  cardCostTotal: number;
  escrowState?: RoomCardEscrowStatus;
  deductedFromPlayerId: string | null;
  deductedAmount: number;
  refunded: boolean;
  players: Record<string, RoomCardPlayerStat>;
  roundHistory: RoomCardRoundRecord[];
  settledAt?: number;
  verification?: RoomCardScorecardVerification;
}

export type RoomCardLedgerReason =
  | 'INIT_GIFT'
  | 'DAILY_GIFT'
  | 'HOST_CREATE'
  | 'AA_JOIN'
  | 'ESCROW_FREEZE'
  | 'ESCROW_CAPTURE'
  | 'WINNER_SETTLE'
  | 'DISBAND_REFUND'
  | 'PACK_SUPPLY';

export interface RoomCardLedgerEntry {
  id: string;
  timestamp: number;
  reason: RoomCardLedgerReason;
  deltaCards: number;
  cardsAfter: number;
  frozenAfter?: number;
  roomId?: string;
  gameType?: RoomCardGameType;
  note: string;
}

interface PersistedRoomCardStore {
  localBalance: number;
  frozenBalance: number;
  lastDailyClaimDate: string;
  ledger: RoomCardLedgerEntry[];
  activeSession: RoomCardSessionState | null;
  recentRooms: RoomCardConfig[];
}

const STORAGE_KEY = 'yx_commercial_room_card_store_v2';

export const GAME_TYPE_LABELS: Record<RoomCardGameType, string> = {
  ddz: '竞技斗地主',
  mahjong: '普洱麻将',
  niuniu: '抢庄牛牛',
  zhajinhua: '经典金花',
  laoyancai: '云南捞腌菜',
};

export const PAY_MODE_LABELS: Record<RoomCardPayMode, string> = {
  host: '房主支付',
  aa: 'AA平摊',
  winner: '大赢家扣卡',
};

export const ESCROW_STATUS_LABELS: Record<RoomCardEscrowStatus, string> = {
  FROZEN: '预冻结托管中',
  CAPTURED: '已正式划扣',
  RELEASED: '已全额解冻退回',
  ELIGIBILITY_LOCKED: '终局大赢家待扣',
};

export function calculateRoomCardCost(totalRounds: RoomCardRoundCap, payMode: RoomCardPayMode): number {
  if (payMode === 'aa') {
    return totalRounds === 16 ? 2 : 1;
  }
  if (totalRounds === 4) return 1;
  if (totalRounds === 8) return 2;
  return 4;
}

/**
 * Commercial Winner-Pay Tie-Breaker Comparator:
 * 1. Cumulative Net Score DESC (`totalDelta`)
 * 2. Peak Single-Round Burst Score DESC (`bestSingleRound`)
 * 3. Total Rounds Won DESC (`winCount`)
 * 4. Seat Order Priority ASC (`seatIndex`)
 */
export function compareRoomCardPlayers(a: RoomCardPlayerStat, b: RoomCardPlayerStat): number {
  if (b.totalDelta !== a.totalDelta) return b.totalDelta - a.totalDelta;
  if (b.bestSingleRound !== a.bestSingleRound) return b.bestSingleRound - a.bestSingleRound;
  if (b.winCount !== a.winCount) return b.winCount - a.winCount;
  return (a.seatIndex ?? 99) - (b.seatIndex ?? 99);
}

/**
 * Largest Remainder Zero-Sum Score Matrix Normalizer ($\sum \Delta_i = 0$).
 */
export function normalizeZeroSumRoundDeltas(
  seatIds: string[],
  heroId: string,
  heroDelta: number,
  rawPeerDeltas?: Array<{ name?: string; delta: number }>
): Record<string, number> {
  const result: Record<string, number> = {};
  const cleanHero = Math.round(Number(heroDelta) || 0);
  const peers = seatIds.filter((id) => id !== heroId);

  if (peers.length === 0) {
    result[heroId] = 0;
    return result;
  }

  result[heroId] = cleanHero;

  if (rawPeerDeltas && rawPeerDeltas.length > 0) {
    let sum = cleanHero;
    peers.forEach((pid, idx) => {
      const d = Math.round(Number(rawPeerDeltas[idx]?.delta) || 0);
      result[pid] = d;
      sum += d;
    });
    if (sum !== 0) {
      const corr = -sum;
      const baseAdj = Math.trunc(corr / peers.length);
      let rem = corr - baseAdj * peers.length;
      peers.forEach((pid) => {
        const step = rem !== 0 ? (rem > 0 ? 1 : -1) : 0;
        rem -= step;
        result[pid] += baseAdj + step;
      });
    }
    return result;
  }

  const oppositeTotal = -cleanHero;
  const baseShare = Math.trunc(oppositeTotal / peers.length);
  let remainder = oppositeTotal - baseShare * peers.length;
  peers.forEach((pid) => {
    const extra = remainder !== 0 ? (remainder > 0 ? 1 : -1) : 0;
    remainder -= extra;
    result[pid] = baseShare + extra;
  });

  return result;
}

function computeClientFallbackDigest(session: RoomCardSessionState): RoomCardScorecardVerification {
  const sorted = Object.values(session.players).sort(compareRoomCardPlayers);
  const topWinner = sorted[0];
  const zeroSumVerified = session.roundHistory.every(
    (r) => Object.values(r.deltas).reduce((acc, v) => acc + v, 0) === 0
  );

  let payerName = session.config.hostName;
  if (session.config.payMode === 'aa') {
    payerName = '全员AA平摊';
  } else if (session.config.payMode === 'winner') {
    if (session.deductedFromPlayerId && session.players[session.deductedFromPlayerId]) {
      payerName = session.players[session.deductedFromPlayerId].name;
    } else if (topWinner && topWinner.totalDelta > 0) {
      payerName = `${topWinner.name} (顺位暂领)`;
    } else {
      payerName = '待终局大赢家裁决';
    }
  }

  let tieBreakRuleApplied: string | undefined;
  if (
    sorted.length >= 2 &&
    sorted[0].totalDelta > 0 &&
    sorted[0].totalDelta === sorted[1].totalDelta
  ) {
    if (sorted[0].bestSingleRound !== sorted[1].bestSingleRound) {
      tieBreakRuleApplied = '并列最高分·按单局最高爆发分优先裁决';
    } else if (sorted[0].winCount !== sorted[1].winCount) {
      tieBreakRuleApplied = '并列最高分·按胜局数优先裁决';
    } else {
      tieBreakRuleApplied = '并列最高分·按入座顺位优先裁决';
    }
  }

  // Deterministic 16-hex digest matching server format when offline/optimistic
  const rawStr = [
    session.config.roomId,
    session.config.gameType,
    session.roundHistory.length,
    ...sorted.map((p) => `${p.id}:${p.totalDelta}`),
  ].join('|');

  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < rawStr.length; i++) {
    const ch = rawStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0;
  }
  const hex1 = h1.toString(16).toUpperCase().padStart(8, '0');
  const hex2 = h2.toString(16).toUpperCase().padStart(8, '0');

  return {
    signature: session.verification?.signature || `RC-${hex1}-${hex2}`,
    issuedAt: session.settledAt || Date.now(),
    zeroSumVerified,
    escrowState: session.escrowState || 'FROZEN',
    payerId: session.deductedFromPlayerId,
    payerName,
    tieBreakRuleApplied,
  };
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

class RoomCardSessionHub {
  private store: PersistedRoomCardStore;
  private listeners = new Set<() => void>();

  constructor() {
    this.store = this.loadFromStorage();
    this.bindServerAuthoritativeEvents();
  }

  private bindServerAuthoritativeEvents(): void {
    if (typeof window === 'undefined') return;

    socketClient.on(
      's2c_rc_session_sync',
      (data: {
        session?: RoomCardSessionState;
        action?: 'refunded' | 'settled' | 'none';
        message?: string;
        profile?: { roomCards?: number; frozenRoomCards?: number };
      }) => {
        if (data?.profile) {
          if (typeof data.profile.roomCards === 'number') {
            this.store.localBalance = Math.max(0, data.profile.roomCards);
          }
          if (typeof data.profile.frozenRoomCards === 'number') {
            this.store.frozenBalance = Math.max(0, data.profile.frozenRoomCards);
          }
        }

        if (data?.action === 'refunded') {
          this.store.activeSession = null;
          this.emit();
          return;
        }

        if (data?.session) {
          this.store.activeSession = data.session;
          const cfg = data.session.config;
          this.store.recentRooms = [
            cfg,
            ...this.store.recentRooms.filter((r) => r.roomId !== cfg.roomId),
          ].slice(0, 8);
          this.emit();
        }
      }
    );

    socketClient.on(
      's2c_profile_updated',
      (data: { profile?: { roomCards?: number; frozenRoomCards?: number } }) => {
        if (data?.profile) {
          if (typeof data.profile.roomCards === 'number') {
            this.store.localBalance = Math.max(0, data.profile.roomCards);
          }
          if (typeof data.profile.frozenRoomCards === 'number') {
            this.store.frozenBalance = Math.max(0, data.profile.frozenRoomCards);
          }
          this.emit();
        }
      }
    );
  }

  private loadFromStorage(): PersistedRoomCardStore {
    const defaultInitLedger: RoomCardLedgerEntry = {
      id: 'init_gift_01',
      timestamp: Date.now() - 3600_000,
      reason: 'INIT_GIFT',
      deltaCards: 10,
      cardsAfter: 10,
      frozenAfter: 0,
      note: '新用户创角尊享房卡礼遇',
    };
    const fallback: PersistedRoomCardStore = {
      localBalance: 10,
      frozenBalance: 0,
      lastDailyClaimDate: '',
      ledger: [defaultInitLedger],
      activeSession: null,
      recentRooms: [],
    };

    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<PersistedRoomCardStore>;
      return {
        localBalance: typeof parsed.localBalance === 'number' ? Math.max(0, parsed.localBalance) : fallback.localBalance,
        frozenBalance: typeof parsed.frozenBalance === 'number' ? Math.max(0, parsed.frozenBalance) : 0,
        lastDailyClaimDate: typeof parsed.lastDailyClaimDate === 'string' ? parsed.lastDailyClaimDate : '',
        ledger: Array.isArray(parsed.ledger) && parsed.ledger.length > 0 ? parsed.ledger : fallback.ledger,
        activeSession: parsed.activeSession ?? null,
        recentRooms: Array.isArray(parsed.recentRooms) ? parsed.recentRooms : [],
      };
    } catch {
      return fallback;
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch {
      // Ignore storage quota errors
    }
  }

  private emit(): void {
    this.saveToStorage();
    this.listeners.forEach((fn) => fn());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStore(): PersistedRoomCardStore {
    return this.store;
  }

  public getBalance(): number {
    return this.store.localBalance;
  }

  public syncServerBalance(serverRoomCards: number, serverFrozenCards = 0): void {
    if (typeof serverRoomCards === 'number' && serverRoomCards >= 0) {
      this.store.localBalance = serverRoomCards;
      this.store.frozenBalance = Math.max(0, serverFrozenCards);
      this.emit();
    }
  }

  public canClaimDailyGift(): boolean {
    return this.store.lastDailyClaimDate !== getTodayStr();
  }

  public claimDailyRoomCards(): { ok: boolean; message: string; added: number } {
    const today = getTodayStr();
    if (this.store.lastDailyClaimDate === today) {
      return { ok: false, message: '今日已领取过每日免费房卡补给', added: 0 };
    }
    const added = 3;
    this.store.localBalance += added;
    this.store.lastDailyClaimDate = today;
    this.appendLedger({
      reason: 'DAILY_GIFT',
      deltaCards: added,
      note: '每日签到免费领取房卡补给',
    });
    soundEngine.playTap(740);
    this.emit();
    return { ok: true, message: '成功领取今日 3 张免费房卡', added };
  }

  public claimCardSupplyPack(cardCount: number, packLabel = '通用约局礼盒'): {
    ok: boolean;
    message: string;
  } {
    if (cardCount <= 0) {
      return { ok: false, message: '无效的房卡补给数量' };
    }
    this.store.localBalance += cardCount;
    this.appendLedger({
      reason: 'PACK_SUPPLY',
      deltaCards: cardCount,
      note: `申领【${packLabel}】获得 +${cardCount} 张房卡`,
    });
    soundEngine.playTap(740);
    this.emit();
    return { ok: true, message: `申领成功！已补充 ${cardCount} 张通用约局房卡` };
  }

  private appendLedger(params: {
    reason: RoomCardLedgerReason;
    deltaCards: number;
    roomId?: string;
    gameType?: RoomCardGameType;
    note: string;
  }): void {
    const entry: RoomCardLedgerEntry = {
      id: `rc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      reason: params.reason,
      deltaCards: params.deltaCards,
      cardsAfter: this.store.localBalance,
      frozenAfter: this.store.frozenBalance,
      roomId: params.roomId,
      gameType: params.gameType,
      note: params.note,
    };
    this.store.ledger = [entry, ...this.store.ledger].slice(0, 60);
  }

  public generateRoomCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += Math.floor(i === 0 ? 1 + Math.random() * 9 : Math.random() * 10).toString();
    }
    return code;
  }

  /**
   * Optimistically creates a Room Card session with Phase-1 Escrow Freeze (`FROZEN`)
   * or Winner-Pay Eligibility Lock (`ELIGIBILITY_LOCKED`).
   * The server confirms and reconciles via `s2c_rc_session_sync`.
   */
  public createSession(params: {
    roomId?: string;
    gameType: RoomCardGameType;
    subMode: string;
    subModeLabel: string;
    baseScore: number;
    totalRounds: RoomCardRoundCap;
    payMode: RoomCardPayMode;
    fillBots: boolean;
    hostId: string;
    hostName: string;
  }): { ok: boolean; message: string; session?: RoomCardSessionState } {
    const cost = calculateRoomCardCost(params.totalRounds, params.payMode);
    if (this.store.localBalance < cost) {
      return {
        ok: false,
        message:
          params.payMode === 'winner'
            ? `大赢家扣卡模式要求至少持有 ${cost} 张可用房卡方可建房`
            : `可用房卡余额不足（当前 ${this.store.localBalance} 张，需预冻结 ${cost} 张）`,
      };
    }

    const roomId = params.roomId && /^\d{6}$/.test(params.roomId) ? params.roomId : this.generateRoomCode();
    let deductedFromPlayerId: string | null = null;
    let deductedAmount = 0;
    let escrowState: RoomCardEscrowStatus = 'ELIGIBILITY_LOCKED';

    if (params.payMode === 'host' || params.payMode === 'aa') {
      this.store.localBalance -= cost;
      this.store.frozenBalance += cost;
      deductedFromPlayerId = params.hostId;
      deductedAmount = cost;
      escrowState = 'FROZEN';
      this.appendLedger({
        reason: 'ESCROW_FREEZE',
        deltaCards: -cost,
        roomId,
        gameType: params.gameType,
        note: `包间 #${roomId} 预冻结托管 ${cost} 张房卡 (${PAY_MODE_LABELS[params.payMode]})`,
      });
    }

    const config: RoomCardConfig = {
      roomId,
      gameType: params.gameType,
      subMode: params.subMode,
      subModeLabel: params.subModeLabel,
      baseScore: params.baseScore,
      totalRounds: params.totalRounds,
      payMode: params.payMode,
      fillBots: params.fillBots,
      hostId: params.hostId,
      hostName: params.hostName,
      createdAt: Date.now(),
    };

    const defaultPlayers = this.buildDefaultPlayers(config, params.hostId, params.hostName);

    const session: RoomCardSessionState = {
      config,
      currentRound: 1,
      status: 'waiting_first_round',
      cardCostTotal: cost,
      escrowState,
      deductedFromPlayerId,
      deductedAmount,
      refunded: false,
      players: defaultPlayers,
      roundHistory: [],
    };
    session.verification = computeClientFallbackDigest(session);

    this.store.activeSession = session;
    this.store.recentRooms = [config, ...this.store.recentRooms.filter((r) => r.roomId !== roomId)].slice(0, 8);
    this.emit();
    return { ok: true, message: '包间创建成功', session };
  }

  public joinSessionByCode(params: {
    roomId: string;
    playerId: string;
    playerName: string;
    fallbackGameType?: RoomCardGameType;
  }): { ok: boolean; message: string; session?: RoomCardSessionState } {
    const cleanCode = params.roomId.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return { ok: false, message: '请输入完整的 6 位数字包间密码' };
    }

    // Seat Preservation Check: if rejoining current active session
    if (this.store.activeSession && this.store.activeSession.config.roomId === cleanCode) {
      return {
        ok: true,
        message: `恢复包间 #${cleanCode} 座位成功`,
        session: this.store.activeSession,
      };
    }

    const existingConfig = this.store.recentRooms.find((r) => r.roomId === cleanCode) ?? {
      roomId: cleanCode,
      gameType: params.fallbackGameType ?? 'ddz',
      subMode: 'classic',
      subModeLabel: '好友约局标准场',
      baseScore: 100,
      totalRounds: 8 as RoomCardRoundCap,
      payMode: 'aa' as RoomCardPayMode,
      fillBots: true,
      hostId: 'room_host_vip',
      hostName: '包间房主',
      createdAt: Date.now(),
    };

    const neededCost = existingConfig.payMode === 'aa' ? calculateRoomCardCost(existingConfig.totalRounds, 'aa') : 0;
    const minRequired = existingConfig.payMode === 'winner'
      ? calculateRoomCardCost(existingConfig.totalRounds, 'winner')
      : neededCost;

    if (this.store.localBalance < minRequired) {
      return {
        ok: false,
        message: `入房失败：当前包间为【${PAY_MODE_LABELS[existingConfig.payMode]}】，需至少持有 ${minRequired} 张可用房卡`,
      };
    }

    let deductedAmount = 0;
    let escrowState: RoomCardEscrowStatus = 'ELIGIBILITY_LOCKED';
    if (existingConfig.payMode === 'aa') {
      this.store.localBalance -= neededCost;
      this.store.frozenBalance += neededCost;
      deductedAmount = neededCost;
      escrowState = 'FROZEN';
      this.appendLedger({
        reason: 'ESCROW_FREEZE',
        deltaCards: -neededCost,
        roomId: cleanCode,
        gameType: existingConfig.gameType,
        note: `入房 #${cleanCode} 预冻结托管 ${neededCost} 张房卡 (AA平摊)`,
      });
    }

    const players = this.buildDefaultPlayers(existingConfig, params.playerId, params.playerName);
    const session: RoomCardSessionState = {
      config: existingConfig,
      currentRound: 1,
      status: 'waiting_first_round',
      cardCostTotal: calculateRoomCardCost(existingConfig.totalRounds, existingConfig.payMode),
      escrowState,
      deductedFromPlayerId: deductedAmount > 0 ? params.playerId : null,
      deductedAmount,
      refunded: false,
      players,
      roundHistory: [],
    };
    session.verification = computeClientFallbackDigest(session);

    this.store.activeSession = session;
    this.emit();
    return { ok: true, message: `成功加入 #${cleanCode} 包间`, session };
  }

  private buildDefaultPlayers(
    config: RoomCardConfig,
    localPlayerId = 'local_me',
    localPlayerName?: string
  ): Record<string, RoomCardPlayerStat> {
    const heroName = localPlayerName || config.hostName || '本家牌手';
    const seatCountByGame: Record<RoomCardGameType, number> = {
      ddz: 3,
      mahjong: 4,
      niuniu: 4,
      zhajinhua: 4,
      laoyancai: 4,
    };
    const count = seatCountByGame[config.gameType] || 3;
    const botNames = ['茶马雀神', '彩云金仙', '洱海钓客', '苍山剑客'];

    const map: Record<string, RoomCardPlayerStat> = {
      [localPlayerId]: {
        id: localPlayerId,
        name: heroName,
        seatIndex: 0,
        isHost: true,
        isBot: false,
        disconnected: false,
        totalDelta: 0,
        winCount: 0,
        loseCount: 0,
        bestSingleRound: 0,
        roundsPlayed: 0,
      },
    };

    for (let i = 1; i < count; i++) {
      const botId = `seat_peer_${i}`;
      map[botId] = {
        id: botId,
        name: botNames[(i - 1) % botNames.length],
        seatIndex: i,
        isHost: false,
        isBot: true,
        disconnected: false,
        totalDelta: 0,
        winCount: 0,
        loseCount: 0,
        bestSingleRound: 0,
        roundsPlayed: 0,
      };
    }
    return map;
  }

  /**
   * Records a finished single round with Largest Remainder Zero-Sum Normalization ($\sum \Delta_i = 0$)
   * and synchronizes with the authoritative server engine via `c2s_rc_record_round`.
   */
  public recordRoundSettlement(params: {
    heroDelta: number;
    heroName?: string;
    summaryText?: string;
    peerDeltas?: Array<{ name: string; delta: number }>;
  }): RoomCardSessionState | null {
    const session = this.store.activeSession;
    if (!session || session.status === 'grand_settled' || session.status === 'disbanded_refunded') {
      return null;
    }

    const lastRecord = session.roundHistory[session.roundHistory.length - 1];
    if (lastRecord && Date.now() - lastRecord.timestamp < 1800) {
      return session;
    }

    // Forward to authoritative server engine
    socketClient.emit('c2s_rc_record_round', {
      roomId: session.config.roomId,
      heroDelta: params.heroDelta,
      heroName: params.heroName,
      summaryText: params.summaryText,
      peerDeltas: params.peerDeltas,
    });

    const roundNumber = session.roundHistory.length + 1;
    if (roundNumber > session.config.totalRounds) {
      return session;
    }

    // Phase-2b Escrow Capture on Round 1
    if (roundNumber === 1 && session.escrowState === 'FROZEN') {
      session.escrowState = 'CAPTURED';
      this.store.frozenBalance = Math.max(0, this.store.frozenBalance - session.deductedAmount);
      this.appendLedger({
        reason: 'ESCROW_CAPTURE',
        deltaCards: 0,
        roomId: session.config.roomId,
        gameType: session.config.gameType,
        note: `包间 #${session.config.roomId} 首局开牌正式划扣 ${session.deductedAmount} 张冻结房卡`,
      });
    }

    const orderedPlayers = Object.values(session.players).sort(
      (a, b) => (a.seatIndex ?? 99) - (b.seatIndex ?? 99)
    );
    const playerIds = orderedPlayers.map((p) => p.id);
    const heroId = orderedPlayers.find((p) => !p.isBot)?.id || playerIds[0];
    const peerIds = playerIds.filter((id) => id !== heroId);

    if (params.heroName && session.players[heroId]) {
      session.players[heroId].name = params.heroName;
    }
    if (params.peerDeltas && params.peerDeltas.length > 0) {
      peerIds.forEach((pid, idx) => {
        const pd = params.peerDeltas![idx];
        if (pd?.name && session.players[pid]) {
          session.players[pid].name = pd.name;
        }
      });
    }

    const roundDeltas = normalizeZeroSumRoundDeltas(
      playerIds,
      heroId,
      params.heroDelta,
      params.peerDeltas
    );

    let zeroSumCheck = 0;
    Object.entries(roundDeltas).forEach(([pid, delta]) => {
      zeroSumCheck += delta;
      const stat = session.players[pid];
      if (!stat) return;
      stat.totalDelta += delta;
      stat.roundsPlayed += 1;
      if (delta > 0) stat.winCount += 1;
      if (delta < 0) stat.loseCount += 1;
      if (delta > stat.bestSingleRound) {
        stat.bestSingleRound = delta;
      }
    });

    session.roundHistory.push({
      roundIndex: roundNumber,
      timestamp: Date.now(),
      summaryText: params.summaryText || `第 ${roundNumber} 局零和核验结算`,
      deltas: roundDeltas,
      zeroSumCheck,
    });

    session.status = 'in_progress';

    if (roundNumber >= session.config.totalRounds) {
      this.finalizeGrandSettlement(session, false);
    } else {
      session.currentRound = roundNumber + 1;
      session.verification = computeClientFallbackDigest(session);
    }

    this.emit();
    return session;
  }

  private finalizeGrandSettlement(session: RoomCardSessionState, isEarlyMidMatch: boolean): void {
    if (session.status === 'grand_settled') return;
    session.status = 'grand_settled';
    session.settledAt = Date.now();
    session.currentRound = Math.max(1, session.roundHistory.length);

    const sorted = Object.values(session.players).sort(compareRoomCardPlayers);
    const topCandidate = sorted[0];

    if (session.config.payMode === 'winner' && session.deductedAmount === 0) {
      const adjudicatedWinner =
        topCandidate && topCandidate.totalDelta > 0
          ? topCandidate
          : session.players[session.config.hostId] || topCandidate;

      const cost = session.cardCostTotal;
      if (adjudicatedWinner && !adjudicatedWinner.isBot) {
        const actualDeduct = Math.min(this.store.localBalance, cost);
        this.store.localBalance = Math.max(0, this.store.localBalance - actualDeduct);
        session.deductedFromPlayerId = adjudicatedWinner.id;
        session.deductedAmount = cost;
        session.escrowState = 'CAPTURED';
        this.appendLedger({
          reason: 'WINNER_SETTLE',
          deltaCards: -cost,
          roomId: session.config.roomId,
          gameType: session.config.gameType,
          note: `包间 #${session.config.roomId} ${
            isEarlyMidMatch ? '中途提前结算' : '终局结算'
          }·大赢家顺位裁决扣卡`,
        });
      } else if (adjudicatedWinner) {
        session.deductedFromPlayerId = adjudicatedWinner.id;
        session.deductedAmount = cost;
        session.escrowState = 'CAPTURED';
      }
    } else if (session.escrowState === 'FROZEN') {
      session.escrowState = 'CAPTURED';
      this.store.frozenBalance = Math.max(0, this.store.frozenBalance - session.deductedAmount);
    }

    session.verification = computeClientFallbackDigest(session);
  }

  /**
   * Disbands the room early or settles completed rounds:
   * - If 0 rounds completed (`waiting_first_round`), releases frozen escrow (`RELEASED`) and refunds full cards!
   * - If >= 1 rounds completed, triggers Grand Settlement immediately and adjudicates Winner Pay.
   */
  public disbandOrSettleActiveSession(): {
    action: 'refunded' | 'settled' | 'none';
    message: string;
    session: RoomCardSessionState | null;
  } {
    const session = this.store.activeSession;
    if (!session) {
      return { action: 'none', message: '当前无进行中的房卡包间', session: null };
    }

    socketClient.emit('c2s_rc_disband_or_settle', {
      roomId: session.config.roomId,
    });

    if (session.roundHistory.length === 0) {
      if (session.deductedAmount > 0 && !session.refunded) {
        this.store.localBalance += session.deductedAmount;
        this.store.frozenBalance = Math.max(0, this.store.frozenBalance - session.deductedAmount);
        session.refunded = true;
        session.escrowState = 'RELEASED';
        this.appendLedger({
          reason: 'DISBAND_REFUND',
          deltaCards: session.deductedAmount,
          roomId: session.config.roomId,
          gameType: session.config.gameType,
          note: `包间 #${session.config.roomId} 未开局解散，全额解冻退回 ${session.deductedAmount} 张房卡`,
        });
      }
      session.status = 'disbanded_refunded';
      this.store.activeSession = null;
      this.emit();
      return {
        action: 'refunded',
        message:
          session.deductedAmount > 0
            ? `包间 #${session.config.roomId} 未开局解散，已全额解冻退还 ${session.deductedAmount} 张房卡`
            : `包间 #${session.config.roomId} 已解散`,
        session: null,
      };
    }

    this.finalizeGrandSettlement(session, true);
    this.emit();
    return {
      action: 'settled',
      message: `包间 #${session.config.roomId} 按已完成 ${session.roundHistory.length} 局完成大赢家裁决与防伪战报签名`,
      session,
    };
  }

  public simulateRoundSettlement(): RoomCardSessionState | null {
    const session = this.store.activeSession;
    if (!session || session.status === 'grand_settled') return session;
    const base = session.config.baseScore || 100;
    const multipliers = [3, 2, -1, -2, 4, -3];
    const pick = multipliers[(session.roundHistory.length + 1) % multipliers.length];
    return this.recordRoundSettlement({
      heroDelta: base * pick,
      summaryText: `第 ${session.roundHistory.length + 1} 局零和核验结算`,
    });
  }

  public restartSameRoomWithPlayers(): { ok: boolean; message: string; session?: RoomCardSessionState } {
    const prev = this.store.activeSession;
    if (!prev) {
      return { ok: false, message: '未找到上一局包间配置' };
    }
    return this.createSession({
      gameType: prev.config.gameType,
      subMode: prev.config.subMode,
      subModeLabel: prev.config.subModeLabel,
      baseScore: prev.config.baseScore,
      totalRounds: prev.config.totalRounds,
      payMode: prev.config.payMode,
      fillBots: prev.config.fillBots,
      hostId: prev.config.hostId,
      hostName: prev.config.hostName,
    });
  }

  public clearActiveSession(): void {
    this.store.activeSession = null;
    this.emit();
  }
}

export const roomCardSessionHub = new RoomCardSessionHub();

export function useRoomCardSession() {
  const [snapshot, setSnapshot] = useState(() => ({
    store: roomCardSessionHub.getStore(),
    activeSession: roomCardSessionHub.getStore().activeSession,
    balance: roomCardSessionHub.getStore().localBalance,
    frozenBalance: roomCardSessionHub.getStore().frozenBalance,
  }));

  useEffect(() => {
    return roomCardSessionHub.subscribe(() => {
      const current = roomCardSessionHub.getStore();
      setSnapshot({
        store: current,
        activeSession: current.activeSession,
        balance: current.localBalance,
        frozenBalance: current.frozenBalance,
      });
    });
  }, []);

  return snapshot;
}
