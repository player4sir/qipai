import fs from 'fs';
import path from 'path';
import type { DealMode, Rank } from '../games/ddz/DdzRules.js';
import type { MatchReplayRecord } from '../games/ddz/DdzStateMachine.js';

export interface UserProfile {
  playerId: string;
  nickname: string;
  avatarId: string;
  roomCards: number;
  frozenRoomCards?: number;
  beans: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: number;
}

export type BeanLedgerReason =
  | 'INITIAL_GRANT'
  | 'BANKRUPTCY_RELIEF'
  | 'FREE_SUPPLY'
  | 'ROOM_CREATE'
  | 'ROOM_REFUND'
  | 'ROOM_AA_PAY'
  | 'ROOM_WINNER_PAY'
  | 'ROOM_ESCROW_FREEZE'
  | 'ROOM_ESCROW_RELEASE'
  | 'ROOM_ESCROW_CAPTURE'
  | 'ROOM_WINNER_SETTLE'
  | 'ROOM_REBUY'
  | 'CARD_EXCHANGE'
  | 'ROUND_SETTLEMENT'
  | 'REALTIME_TRANSFER';

export interface BeanLedgerEntry {
  id: string;
  playerId: string;
  roomId?: string;
  gameType?: string;
  deltaBeans: number;
  balanceAfter: number;
  deltaRoomCards?: number;
  roomCardsAfter?: number;
  frozenCardsAfter?: number;
  note?: string;
  reason: BeanLedgerReason;
  timestamp: number;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  gameType: string;
  dealMode?: DealMode;
  wildRanks?: Rank[];
  hasReplay?: boolean;
  timestamp: number;
  baseScore: number;
  multiplier: number;
  winnerSide: string;
  players: Array<{
    playerId: string;
    nickname: string;
    role: string;
    scoreDelta: number;
    isWinner: boolean;
  }>;
}

interface PersistedData {
  users: Record<string, UserProfile>;
  matches: MatchRecord[];
  replays?: Record<string, MatchReplayRecord>;
  ledger?: BeanLedgerEntry[];
}

const DATA_FILE = path.resolve(process.cwd(), '.game-data.json');
const TMP_DATA_FILE = path.resolve(process.cwd(), '.game-data.json.tmp');
const SAVE_DEBOUNCE_MS = 300;
const MAX_LEDGER_ENTRIES = 300;

const SEED_NAMES = [
  '长安棋圣',
  '江南布衣',
  '玉面书生',
  '云端雀神',
  '紫禁巅峰',
  '清风剑客',
];

export class StorageService {
  private data: PersistedData = {
    users: {},
    matches: [],
    replays: {},
    ledger: [],
  };

  private saveTimer: NodeJS.Timeout | null = null;
  private isWritingAsync = false;
  private hasPendingWrite = false;
  private totalAtomicFlushes = 0;
  private lastFlushAt: number | null = null;

  constructor() {
    this.load();
    this.ensureSeedLeaderboard();
    this.registerExitHooks();
  }

  private load(): void {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedData;
        if (parsed && parsed.users && Array.isArray(parsed.matches)) {
          this.data = {
            users: parsed.users,
            matches: parsed.matches,
            replays: parsed.replays ?? {},
            ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
          };
        }
      }
    } catch {
      // Fallback to in-memory default
    }
  }

  /**
   * Non-blocking 300ms debounced atomic write-behind (.game-data.json.tmp -> rename).
   * Prevents event-loop stalls during high-frequency game actions & settlements.
   */
  private save(): void {
    this.hasPendingWrite = true;
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushAsync();
    }, SAVE_DEBOUNCE_MS);
  }

  private async flushAsync(): Promise<void> {
    if (this.isWritingAsync || !this.hasPendingWrite) return;
    this.isWritingAsync = true;
    this.hasPendingWrite = false;

    try {
      const payload = JSON.stringify(this.data, null, 2);
      await fs.promises.writeFile(TMP_DATA_FILE, payload, 'utf-8');
      await fs.promises.rename(TMP_DATA_FILE, DATA_FILE);
      this.totalAtomicFlushes += 1;
      this.lastFlushAt = Date.now();
    } catch {
      // Ignore write errors in read-only environments
    } finally {
      this.isWritingAsync = false;
      if (this.hasPendingWrite) {
        this.save();
      }
    }
  }

  flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.hasPendingWrite) return;
    this.hasPendingWrite = false;
    try {
      const payload = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(TMP_DATA_FILE, payload, 'utf-8');
      fs.renameSync(TMP_DATA_FILE, DATA_FILE);
      this.totalAtomicFlushes += 1;
      this.lastFlushAt = Date.now();
    } catch {
      // Ignore write errors on exit
    }
  }

  private registerExitHooks(): void {
    const onExit = () => {
      this.flushSync();
    };
    process.once('exit', onExit);
    process.once('SIGINT', () => {
      this.flushSync();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      this.flushSync();
      process.exit(0);
    });
  }

  private appendLedger(entry: Omit<BeanLedgerEntry, 'id' | 'timestamp'>): void {
    if (!this.data.ledger) {
      this.data.ledger = [];
    }
    const record: BeanLedgerEntry = {
      ...entry,
      id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    this.data.ledger.unshift(record);
    if (this.data.ledger.length > MAX_LEDGER_ENTRIES) {
      this.data.ledger.length = MAX_LEDGER_ENTRIES;
    }
  }

  private ensureSeedLeaderboard(): void {
    if (Object.keys(this.data.users).length > 0) return;
    const seeds: Array<{ id: string; name: string; avatar: string; beans: number; played: number; won: number }> = [
      { id: 'seed_1', name: '长安棋圣·陆羽', avatar: 'scholar', beans: 38600, played: 84, won: 56 },
      { id: 'seed_2', name: '金陵酒客·沈万', avatar: 'noble', beans: 29400, played: 62, won: 39 },
      { id: 'seed_3', name: '临安侠女·苏映雪', avatar: 'heroine', beans: 24800, played: 55, won: 33 },
      { id: 'seed_4', name: '姑苏剑仙·慕容', avatar: 'warrior', beans: 19200, played: 48, won: 26 },
    ];
    for (const s of seeds) {
      this.data.users[s.id] = {
        playerId: s.id,
        nickname: s.name,
        avatarId: s.avatar,
        roomCards: 12,
        beans: s.beans,
        gamesPlayed: s.played,
        gamesWon: s.won,
        createdAt: Date.now() - 86400000,
      };
    }
    this.save();
  }

  getOrCreateGuest(playerId: string, preferredNickname?: string, avatarId?: string): UserProfile {
    const existing = this.data.users[playerId];
    if (existing) {
      if (preferredNickname && preferredNickname.trim()) {
        existing.nickname = preferredNickname.trim().slice(0, 14);
      }
      if (avatarId) {
        existing.avatarId = avatarId;
      }
      this.save();
      return existing;
    }

    const suffix = playerId.slice(-4).toUpperCase();
    const randomTitle = SEED_NAMES[Math.floor(Math.random() * SEED_NAMES.length)];
    const profile: UserProfile = {
      playerId,
      nickname: preferredNickname?.trim() || `${randomTitle}${suffix}`,
      avatarId: avatarId || 'noble',
      roomCards: 12,
      beans: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      createdAt: Date.now(),
    };
    this.data.users[playerId] = profile;
    this.appendLedger({
      playerId,
      deltaBeans: 0,
      balanceAfter: 0,
      deltaRoomCards: 12,
      roomCardsAfter: 12,
      reason: 'INITIAL_GRANT',
    });
    this.save();
    return profile;
  }

  getUser(playerId: string): UserProfile | null {
    return this.data.users[playerId] ?? null;
  }

  updateNickname(playerId: string, nickname: string, avatarId?: string): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u) return null;
    if (nickname.trim()) {
      u.nickname = nickname.trim().slice(0, 14);
    }
    if (avatarId) {
      u.avatarId = avatarId;
    }
    this.save();
    return u;
  }

  consumeRoomCard(
    playerId: string,
    count = 1,
    roomId?: string,
    gameType?: string,
    reason: BeanLedgerReason = 'ROOM_CREATE'
  ): boolean {
    const u = this.data.users[playerId];
    if (!u || u.roomCards < count) return false;
    u.roomCards -= count;
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: -count,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards ?? 0,
      reason,
    });
    this.save();
    return true;
  }

  /**
   * Phase 1 (Freeze): Atomically moves `count` room cards from available `roomCards`
   * into `frozenRoomCards` escrow when creating or joining a room before Round 1 starts.
   */
  freezeRoomCard(
    playerId: string,
    count: number,
    roomId: string,
    gameType: string,
    note?: string
  ): { ok: boolean; profile: UserProfile | null } {
    const u = this.data.users[playerId];
    if (!u || count < 0) return { ok: false, profile: u ?? null };
    if (count === 0) return { ok: true, profile: u };
    if (u.roomCards < count) return { ok: false, profile: u };

    u.roomCards -= count;
    u.frozenRoomCards = (u.frozenRoomCards ?? 0) + count;
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: -count,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards,
      note: note ?? `包间 #${roomId} 预冻结托管 ${count} 张房卡`,
      reason: 'ROOM_ESCROW_FREEZE',
    });
    this.save();
    return { ok: true, profile: u };
  }

  /**
   * Phase 2a (Release): Atomically unfreezes `count` room cards from `frozenRoomCards`
   * back to available `roomCards` when a room is disbanded or left before Round 1 starts.
   */
  releaseFrozenRoomCard(
    playerId: string,
    count: number,
    roomId: string,
    gameType: string,
    note?: string
  ): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u || count <= 0) return u ?? null;
    const currentFrozen = u.frozenRoomCards ?? 0;
    const releaseAmount = Math.min(currentFrozen, count);
    u.frozenRoomCards = Math.max(0, currentFrozen - releaseAmount);
    u.roomCards += count;
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: count,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards,
      note: note ?? `包间 #${roomId} 未开局解冻退回 ${count} 张房卡`,
      reason: 'ROOM_ESCROW_RELEASE',
    });
    this.save();
    return u;
  }

  /**
   * Phase 2b (Capture): Permanently captures `count` frozen room cards once Round 1 starts/settles.
   */
  captureFrozenRoomCard(
    playerId: string,
    count: number,
    roomId: string,
    gameType: string,
    note?: string
  ): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u || count <= 0) return u ?? null;
    const currentFrozen = u.frozenRoomCards ?? 0;
    u.frozenRoomCards = Math.max(0, currentFrozen - count);
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: 0,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards,
      note: note ?? `包间 #${roomId} 首局开牌正式划扣 ${count} 张冻结房卡`,
      reason: 'ROOM_ESCROW_CAPTURE',
    });
    this.save();
    return u;
  }

  /**
   * Winner-Pay Settlement: Deducts `count` room cards from the adjudicated Big Winner at Grand Settlement.
   */
  settleWinnerRoomCard(
    playerId: string,
    count: number,
    roomId: string,
    gameType: string,
    note?: string
  ): { deducted: number; profile: UserProfile | null } {
    const u = this.data.users[playerId];
    if (!u || count <= 0) return { deducted: 0, profile: u ?? null };
    const actualDeduct = Math.min(u.roomCards, count);
    u.roomCards = Math.max(0, u.roomCards - actualDeduct);
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: -actualDeduct,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards ?? 0,
      note: note ?? `包间 #${roomId} 终局大赢家结账扣减 ${actualDeduct} 张房卡`,
      reason: 'ROOM_WINNER_SETTLE',
    });
    this.save();
    return { deducted: actualDeduct, profile: u };
  }

  refundRoomCard(playerId: string, count = 1, roomId?: string, gameType?: string): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u || count <= 0) return u ?? null;
    u.roomCards += count;
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: count,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards ?? 0,
      reason: 'ROOM_REFUND',
    });
    this.save();
    return u;
  }

  /**
   * Commercial Bankruptcy Protection Rebuy:
   * Deducts `cardCost` room cards from player's available balance and records the table score replenishment (`scoreAdded`) in the audit ledger.
   */
  rebuyTableScoreWithRoomCard(
    playerId: string,
    cardCost: number,
    scoreAdded: number,
    roomId: string,
    gameType: string,
    note?: string
  ): { ok: boolean; profile: UserProfile | null } {
    const u = this.data.users[playerId];
    if (!u || cardCost <= 0 || u.roomCards < cardCost) {
      return { ok: false, profile: u ?? null };
    }
    u.roomCards -= cardCost;
    this.appendLedger({
      playerId,
      roomId,
      gameType,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: -cardCost,
      roomCardsAfter: u.roomCards,
      frozenCardsAfter: u.frozenRoomCards ?? 0,
      note:
        note ??
        `包间 #${roomId} 破产保护消耗 ${cardCost} 张房卡补分 +${scoreAdded.toLocaleString()} 台面积分`,
      reason: 'ROOM_REBUY',
    });
    this.save();
    return { ok: true, profile: u };
  }

  exchangeBeansForRoomCards(playerId: string, cardCount: number, _beanCost = 0): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u || cardCount <= 0) return null;
    u.roomCards += cardCount;
    this.appendLedger({
      playerId,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: cardCount,
      roomCardsAfter: u.roomCards,
      reason: 'CARD_EXCHANGE',
    });
    this.save();
    return u;
  }

  updateBeans(
    playerId: string,
    delta: number,
    meta?: { roomId?: string; gameType?: string; reason?: BeanLedgerReason }
  ): number {
    const u = this.data.users[playerId];
    if (!u) return 0;
    u.beans += delta;
    if (delta !== 0) {
      this.appendLedger({
        playerId,
        roomId: meta?.roomId,
        gameType: meta?.gameType,
        deltaBeans: delta,
        balanceAfter: u.beans,
        reason: meta?.reason ?? 'REALTIME_TRANSFER',
      });
    }
    this.save();
    return u.beans;
  }

  claimFreeSupply(playerId: string): UserProfile | null {
    const u = this.data.users[playerId];
    if (!u) return null;
    const deltaCards = 5;
    u.roomCards += deltaCards;
    this.appendLedger({
      playerId,
      deltaBeans: 0,
      balanceAfter: u.beans,
      deltaRoomCards: deltaCards,
      roomCardsAfter: u.roomCards,
      reason: 'FREE_SUPPLY',
    });
    this.save();
    return u;
  }

  recordSettlement(
    roomId: string,
    gameType: string,
    baseScore: number,
    multiplier: number,
    winnerSide: string,
    results: Array<{
      playerId: string;
      nickname: string;
      isBot: boolean;
      role: string;
      scoreDelta: number;
      isWinner: boolean;
    }>,
    replayData?: Omit<MatchReplayRecord, 'matchId'>,
    skipBeanUpdate = false
  ): MatchRecord {
    for (const r of results) {
      if (r.isBot) continue;
      const u = this.data.users[r.playerId];
      if (u) {
        if (!skipBeanUpdate) {
          u.beans += r.scoreDelta;
          this.appendLedger({
            playerId: r.playerId,
            roomId,
            gameType,
            deltaBeans: r.scoreDelta,
            balanceAfter: u.beans,
            reason: 'ROUND_SETTLEMENT',
          });
        } else if (r.scoreDelta !== 0) {
          this.appendLedger({
            playerId: r.playerId,
            roomId,
            gameType,
            deltaBeans: r.scoreDelta,
            balanceAfter: u.beans,
            reason: 'ROUND_SETTLEMENT',
          });
        }
        u.gamesPlayed += 1;
        if (r.isWinner) {
          u.gamesWon += 1;
        }
      }
    }

    const matchId = `match_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const record: MatchRecord = {
      id: matchId,
      roomId,
      gameType,
      dealMode: replayData?.dealMode ?? 'classic',
      wildRanks: replayData?.wildRanks ?? [],
      hasReplay: Boolean(replayData),
      timestamp: Date.now(),
      baseScore,
      multiplier,
      winnerSide,
      players: results.map((r) => ({
        playerId: r.playerId,
        nickname: r.nickname,
        role: r.role,
        scoreDelta: r.scoreDelta,
        isWinner: r.isWinner,
      })),
    };

    if (!this.data.replays) {
      this.data.replays = {};
    }
    if (replayData) {
      this.data.replays[matchId] = {
        ...replayData,
        matchId,
      };
    }

    this.data.matches.unshift(record);
    if (this.data.matches.length > 50) {
      const removed = this.data.matches.slice(50);
      this.data.matches = this.data.matches.slice(0, 50);
      for (const old of removed) {
        if (this.data.replays && old.id in this.data.replays) {
          delete this.data.replays[old.id];
        }
      }
    }
    this.save();
    return record;
  }

  getMatchReplay(matchId: string): MatchReplayRecord | null {
    return this.data.replays?.[matchId] ?? null;
  }

  getLeaderboard(limit = 10): UserProfile[] {
    return Object.values(this.data.users)
      .sort((a, b) => b.beans - a.beans)
      .slice(0, limit);
  }

  getPlayerMatches(playerId: string, limit = 15): MatchRecord[] {
    return this.data.matches
      .filter((m) => m.players.some((p) => p.playerId === playerId))
      .slice(0, limit);
  }

  getPlayerLedger(playerId: string, limit = 25): BeanLedgerEntry[] {
    return (this.data.ledger ?? [])
      .filter((entry) => entry.playerId === playerId)
      .slice(0, limit);
  }

  getStorageStats(): {
    totalUsers: number;
    totalMatchesStored: number;
    totalLedgerEntries: number;
    totalAtomicFlushes: number;
    lastFlushAt: number | null;
    hasPendingWrite: boolean;
  } {
    return {
      totalUsers: Object.keys(this.data.users).length,
      totalMatchesStored: this.data.matches.length,
      totalLedgerEntries: (this.data.ledger ?? []).length,
      totalAtomicFlushes: this.totalAtomicFlushes,
      lastFlushAt: this.lastFlushAt,
      hasPendingWrite: this.hasPendingWrite,
    };
  }
}

export const storageService = new StorageService();
