import crypto from 'node:crypto';
import { storageService, UserProfile } from '../shared/storage.js';

export type ServerRoomCardGameType = 'ddz' | 'mahjong' | 'niuniu' | 'zhajinhua' | 'laoyancai';
export type ServerRoomCardPayMode = 'host' | 'aa' | 'winner';
export type ServerRoomCardRoundCap = 4 | 8 | 16;
export type ServerEscrowStatus = 'FROZEN' | 'CAPTURED' | 'RELEASED' | 'ELIGIBILITY_LOCKED';

export interface ServerRoomCardConfig {
  roomId: string;
  gameType: ServerRoomCardGameType;
  subMode: string;
  subModeLabel: string;
  baseScore: number;
  totalRounds: ServerRoomCardRoundCap;
  payMode: ServerRoomCardPayMode;
  fillBots: boolean;
  hostId: string;
  hostName: string;
  createdAt: number;
}

export interface ServerPlayerEscrowRecord {
  playerId: string;
  playerName: string;
  frozenCards: number;
  capturedCards: number;
  releasedCards: number;
  status: ServerEscrowStatus;
  updatedAt: number;
}

export interface ServerRoomCardPlayerStat {
  id: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  isBot: boolean;
  disconnected?: boolean;
  totalDelta: number;
  winCount: number;
  loseCount: number;
  bestSingleRound: number;
  roundsPlayed: number;
}

export interface ServerRoomCardRoundRecord {
  roundIndex: number;
  timestamp: number;
  summaryText: string;
  deltas: Record<string, number>;
  zeroSumCheck: number;
}

export interface ServerScorecardVerification {
  signature: string;
  issuedAt: number;
  zeroSumVerified: boolean;
  escrowState: ServerEscrowStatus;
  payerId: string | null;
  payerName: string;
  tieBreakRuleApplied?: string;
}

export interface ServerRoomCardSessionState {
  config: ServerRoomCardConfig;
  currentRound: number;
  status: 'waiting_first_round' | 'in_progress' | 'grand_settled' | 'disbanded_refunded';
  cardCostTotal: number;
  escrowState: ServerEscrowStatus;
  escrowMap: Record<string, ServerPlayerEscrowRecord>;
  deductedFromPlayerId: string | null;
  deductedAmount: number;
  refunded: boolean;
  players: Record<string, ServerRoomCardPlayerStat>;
  roundHistory: ServerRoomCardRoundRecord[];
  settledAt?: number;
  verification?: ServerScorecardVerification;
}

const SCORECARD_HMAC_SECRET =
  process.env.SESSION_HMAC_SECRET || 'h5_commercial_room_card_scorecard_hmac_2026';

export const SERVER_GAME_LABELS: Record<ServerRoomCardGameType, string> = {
  ddz: '竞技斗地主',
  mahjong: '普洱麻将',
  niuniu: '抢庄牛牛',
  zhajinhua: '经典金花',
  laoyancai: '云南捞腌菜',
};

export const SERVER_PAY_LABELS: Record<ServerRoomCardPayMode, string> = {
  host: '房主支付',
  aa: 'AA平摊',
  winner: '大赢家扣卡',
};

export function computeCommercialRoomCardCost(
  totalRounds: ServerRoomCardRoundCap,
  payMode: ServerRoomCardPayMode
): number {
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
export function comparePlayersForWinnerPay(
  a: ServerRoomCardPlayerStat,
  b: ServerRoomCardPlayerStat
): number {
  if (b.totalDelta !== a.totalDelta) return b.totalDelta - a.totalDelta;
  if (b.bestSingleRound !== a.bestSingleRound) return b.bestSingleRound - a.bestSingleRound;
  if (b.winCount !== a.winCount) return b.winCount - a.winCount;
  return (a.seatIndex ?? 99) - (b.seatIndex ?? 99);
}

/**
 * Largest Remainder Zero-Sum Score Matrix Normalizer:
 * Guarantees that the sum of all seat deltas in a round equals strictly 0 ($\sum \Delta_i = 0$).
 */
export function normalizeZeroSumDeltas(
  seatIds: string[],
  heroId: string,
  heroDelta: number,
  rawPeerDeltas?: Array<{ id?: string; name?: string; delta: number }>
): Record<string, number> {
  const result: Record<string, number> = {};
  const cleanHeroDelta = Math.round(Number(heroDelta) || 0);
  const peers = seatIds.filter((id) => id !== heroId);

  if (peers.length === 0) {
    result[heroId] = 0;
    return result;
  }

  result[heroId] = cleanHeroDelta;

  if (rawPeerDeltas && rawPeerDeltas.length > 0) {
    let rawSum = cleanHeroDelta;
    peers.forEach((pid, idx) => {
      const d = Math.round(Number(rawPeerDeltas[idx]?.delta) || 0);
      result[pid] = d;
      rawSum += d;
    });

    // If rounding or partial snapshot caused a non-zero residual, distribute residual via Largest Remainder
    if (rawSum !== 0) {
      const correctionTotal = -rawSum;
      const baseAdj = Math.trunc(correctionTotal / peers.length);
      let rem = correctionTotal - baseAdj * peers.length;
      peers.forEach((pid) => {
        const step = rem !== 0 ? (rem > 0 ? 1 : -1) : 0;
        rem -= step;
        result[pid] += baseAdj + step;
      });
    }
    return result;
  }

  // Only heroDelta provided: distribute exact opposite across peer seats using Largest Remainder
  const oppositeTotal = -cleanHeroDelta;
  const baseShare = Math.trunc(oppositeTotal / peers.length);
  let remainder = oppositeTotal - baseShare * peers.length;
  peers.forEach((pid) => {
    const extra = remainder !== 0 ? (remainder > 0 ? 1 : -1) : 0;
    remainder -= extra;
    result[pid] = baseShare + extra;
  });

  return result;
}

export class RoomCardEngine {
  private sessions: Map<string, ServerRoomCardSessionState> = new Map();
  private playerToActiveSession: Map<string, string> = new Map();

  public getSession(roomId: string): ServerRoomCardSessionState | null {
    return this.sessions.get(roomId) ?? null;
  }

  public getSessionByPlayer(playerId: string): ServerRoomCardSessionState | null {
    const roomId = this.playerToActiveSession.get(playerId);
    if (!roomId) return null;
    return this.sessions.get(roomId) ?? null;
  }

  public isSessionLockedInProgress(roomId: string): boolean {
    const s = this.sessions.get(roomId);
    return Boolean(s && s.status === 'in_progress' && s.roundHistory.length > 0);
  }

  private buildInitialPlayers(
    config: ServerRoomCardConfig,
    hostSeatPlayerId: string,
    hostSeatName: string
  ): Record<string, ServerRoomCardPlayerStat> {
    const seatCountByGame: Record<ServerRoomCardGameType, number> = {
      ddz: 3,
      mahjong: 4,
      niuniu: 4,
      zhajinhua: 4,
      laoyancai: 4,
    };
    const count = seatCountByGame[config.gameType] || 3;
    const botNames = ['茶马雀神', '彩云金仙', '洱海钓客', '苍山剑客'];

    const players: Record<string, ServerRoomCardPlayerStat> = {
      [hostSeatPlayerId]: {
        id: hostSeatPlayerId,
        name: hostSeatName,
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
      players[botId] = {
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

    return players;
  }

  /**
   * Creates a commercial Room Card session with Phase-1 Escrow Freeze (`FROZEN`)
   * or Winner-Pay Eligibility Lock (`ELIGIBILITY_LOCKED`).
   */
  public createSession(params: {
    roomId: string;
    gameType: ServerRoomCardGameType;
    subMode: string;
    subModeLabel: string;
    baseScore: number;
    totalRounds: ServerRoomCardRoundCap;
    payMode: ServerRoomCardPayMode;
    fillBots: boolean;
    hostProfile: UserProfile;
  }): {
    ok: boolean;
    message: string;
    session?: ServerRoomCardSessionState;
    updatedProfile?: UserProfile | null;
  } {
    const { hostProfile } = params;
    // Release any previous waiting session created by this host that hasn't started Round 1
    const prevSession = this.getSessionByPlayer(hostProfile.playerId);
    if (prevSession && prevSession.config.roomId !== params.roomId && prevSession.roundHistory.length === 0) {
      this.disbandOrSettleSession(prevSession.config.roomId, hostProfile.playerId);
    }

    const cost = computeCommercialRoomCardCost(params.totalRounds, params.payMode);
    if (hostProfile.roomCards < cost) {
      return {
        ok: false,
        message:
          params.payMode === 'winner'
            ? `大赢家扣卡模式要求至少持有 ${cost} 张可用房卡方可建房`
            : `可用房卡不足（本次需预冻结 ${cost} 张，当前可用 ${hostProfile.roomCards} 张）`,
      };
    }

    let escrowStatus: ServerEscrowStatus = 'ELIGIBILITY_LOCKED';
    let frozenCards = 0;
    let updatedProfile: UserProfile | null = hostProfile;

    if (params.payMode === 'host' || params.payMode === 'aa') {
      const freezeRes = storageService.freezeRoomCard(
        hostProfile.playerId,
        cost,
        params.roomId,
        params.gameType,
        `包间 #${params.roomId} 预冻结托管 (${SERVER_PAY_LABELS[params.payMode]})`
      );
      if (!freezeRes.ok) {
        return {
          ok: false,
          message: `房卡预冻结失败，请检查房卡余额`,
        };
      }
      escrowStatus = 'FROZEN';
      frozenCards = cost;
      updatedProfile = freezeRes.profile;
    }

    const config: ServerRoomCardConfig = {
      roomId: params.roomId,
      gameType: params.gameType,
      subMode: params.subMode,
      subModeLabel: params.subModeLabel,
      baseScore: params.baseScore,
      totalRounds: params.totalRounds,
      payMode: params.payMode,
      fillBots: params.fillBots,
      hostId: hostProfile.playerId,
      hostName: hostProfile.nickname,
      createdAt: Date.now(),
    };

    const players = this.buildInitialPlayers(config, hostProfile.playerId, hostProfile.nickname);
    const escrowMap: Record<string, ServerPlayerEscrowRecord> = {
      [hostProfile.playerId]: {
        playerId: hostProfile.playerId,
        playerName: hostProfile.nickname,
        frozenCards,
        capturedCards: 0,
        releasedCards: 0,
        status: escrowStatus,
        updatedAt: Date.now(),
      },
    };

    const session: ServerRoomCardSessionState = {
      config,
      currentRound: 1,
      status: 'waiting_first_round',
      cardCostTotal: cost,
      escrowState: escrowStatus,
      escrowMap,
      deductedFromPlayerId: frozenCards > 0 ? hostProfile.playerId : null,
      deductedAmount: frozenCards,
      refunded: false,
      players,
      roundHistory: [],
    };

    session.verification = this.signScorecardDigest(session);

    this.sessions.set(params.roomId, session);
    this.playerToActiveSession.set(hostProfile.playerId, params.roomId);

    return {
      ok: true,
      message:
        escrowStatus === 'FROZEN'
          ? `已预冻结 ${frozenCards} 张房卡（未开局解散将全额解冻退回）`
          : `已通过大赢家房卡准入核验（终局由最高分大赢家扣减 ${cost} 张）`,
      session,
      updatedProfile,
    };
  }

  /**
   * Handles a player joining a Room Card session by 6-digit code,
   * including seat preservation on reconnect and AA / Winner-Pay escrow checks.
   */
  public joinSession(params: {
    roomId: string;
    playerProfile: UserProfile;
    fallbackGameType?: ServerRoomCardGameType;
  }): {
    ok: boolean;
    message: string;
    reconnected?: boolean;
    session?: ServerRoomCardSessionState;
    updatedProfile?: UserProfile | null;
  } {
    const { roomId, playerProfile } = params;
    let session = this.sessions.get(roomId);

    // If joining a preset/recent room code not yet initialized in memory, bootstrap it
    if (!session) {
      const createRes = this.createSession({
        roomId,
        gameType: params.fallbackGameType ?? 'ddz',
        subMode: 'classic',
        subModeLabel: '标准约局场',
        baseScore: 100,
        totalRounds: 8,
        payMode: 'aa',
        fillBots: true,
        hostProfile: playerProfile,
      });
      return createRes;
    }

    // 1. Seat Preservation & Reconnect Check: if player is already in this session, restore seat!
    if (session.players[playerProfile.playerId]) {
      session.players[playerProfile.playerId].disconnected = false;
      session.players[playerProfile.playerId].name = playerProfile.nickname;
      this.playerToActiveSession.set(playerProfile.playerId, roomId);
      return {
        ok: true,
        reconnected: true,
        message: `断线重连成功，已恢复 #${roomId} 座位与累计战绩`,
        session,
        updatedProfile: storageService.getUser(playerProfile.playerId),
      };
    }

    if (session.status !== 'waiting_first_round') {
      return {
        ok: false,
        message: `包间 #${roomId} 已开局锁定座位，无法中途新入座`,
      };
    }

    const { config } = session;
    const neededCost =
      config.payMode === 'aa' ? computeCommercialRoomCardCost(config.totalRounds, 'aa') : 0;
    const minRequired =
      config.payMode === 'winner'
        ? computeCommercialRoomCardCost(config.totalRounds, 'winner')
        : neededCost;

    if (playerProfile.roomCards < minRequired) {
      return {
        ok: false,
        message: `入房失败：本房为【${SERVER_PAY_LABELS[config.payMode]}】，需至少持有 ${minRequired} 张可用房卡`,
      };
    }

    let updatedProfile: UserProfile | null = playerProfile;
    let escrowStatus: ServerEscrowStatus = 'ELIGIBILITY_LOCKED';
    let frozenCards = 0;

    if (config.payMode === 'aa' && neededCost > 0) {
      const freezeRes = storageService.freezeRoomCard(
        playerProfile.playerId,
        neededCost,
        roomId,
        config.gameType,
        `加入包间 #${roomId} 预冻结托管 (AA平摊)`
      );
      if (!freezeRes.ok) {
        return { ok: false, message: 'AA平摊房卡预冻结失败，请检查余额' };
      }
      escrowStatus = 'FROZEN';
      frozenCards = neededCost;
      updatedProfile = freezeRes.profile;
      session.deductedAmount += neededCost;
    }

    // Replace the first bot seat with this human player
    const botEntry = Object.values(session.players)
      .filter((p) => p.isBot)
      .sort((a, b) => a.seatIndex - b.seatIndex)[0];

    const assignedSeatIndex = botEntry ? botEntry.seatIndex : Object.keys(session.players).length;
    if (botEntry) {
      delete session.players[botEntry.id];
    }

    session.players[playerProfile.playerId] = {
      id: playerProfile.playerId,
      name: playerProfile.nickname,
      seatIndex: assignedSeatIndex,
      isHost: false,
      isBot: false,
      disconnected: false,
      totalDelta: 0,
      winCount: 0,
      loseCount: 0,
      bestSingleRound: 0,
      roundsPlayed: 0,
    };

    session.escrowMap[playerProfile.playerId] = {
      playerId: playerProfile.playerId,
      playerName: playerProfile.nickname,
      frozenCards,
      capturedCards: 0,
      releasedCards: 0,
      status: escrowStatus,
      updatedAt: Date.now(),
    };

    session.verification = this.signScorecardDigest(session);
    this.playerToActiveSession.set(playerProfile.playerId, roomId);

    return {
      ok: true,
      message:
        frozenCards > 0
          ? `加入 #${roomId} 成功，已预冻结 ${frozenCards} 张AA房卡`
          : `加入 #${roomId} 成功`,
      session,
      updatedProfile,
    };
  }

  /**
   * Phase 2b (Capture): Triggered automatically when Round 1 starts/settles.
   * Converts all `FROZEN` escrow records into permanent `CAPTURED` deductions.
   */
  public captureEscrowOnFirstRound(roomId: string): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    for (const record of Object.values(session.escrowMap)) {
      if (record.status === 'FROZEN' && record.frozenCards > 0) {
        storageService.captureFrozenRoomCard(
          record.playerId,
          record.frozenCards,
          roomId,
          session.config.gameType,
          `包间 #${roomId} 首局开牌正式划扣 ${record.frozenCards} 张房卡`
        );
        record.capturedCards = record.frozenCards;
        record.frozenCards = 0;
        record.status = 'CAPTURED';
        record.updatedAt = Date.now();
      }
    }

    if (session.config.payMode !== 'winner') {
      session.escrowState = 'CAPTURED';
    }
  }

  /**
   * Records a completed round with strict Zero-Sum Matrix Normalization ($\sum \Delta_i = 0$),
   * captures Round 1 escrow, and triggers Grand Settlement when `totalRounds` is reached.
   */
  public recordRoundSettlement(params: {
    roomId: string;
    heroId: string;
    heroDelta: number;
    heroName?: string;
    summaryText?: string;
    peerDeltas?: Array<{ id?: string; name?: string; delta: number }>;
  }): ServerRoomCardSessionState | null {
    const session = this.sessions.get(params.roomId);
    if (
      !session ||
      session.status === 'grand_settled' ||
      session.status === 'disbanded_refunded'
    ) {
      return session ?? null;
    }

    // Debounce duplicate round settlement emissions within 1.8s
    const lastRound = session.roundHistory[session.roundHistory.length - 1];
    if (lastRound && Date.now() - lastRound.timestamp < 1800) {
      return session;
    }

    const roundNumber = session.roundHistory.length + 1;
    if (roundNumber > session.config.totalRounds) {
      return session;
    }

    // Officially capture frozen room cards upon Round 1 completion
    if (roundNumber === 1) {
      this.captureEscrowOnFirstRound(params.roomId);
    }

    const orderedPlayers = Object.values(session.players).sort(
      (a, b) => a.seatIndex - b.seatIndex
    );
    const seatIds = orderedPlayers.map((p) => p.id);
    const resolvedHeroId = session.players[params.heroId]
      ? params.heroId
      : orderedPlayers.find((p) => !p.isBot)?.id || seatIds[0];

    if (params.heroName && session.players[resolvedHeroId]) {
      session.players[resolvedHeroId].name = params.heroName;
    }

    const peerSeats = orderedPlayers.filter((p) => p.id !== resolvedHeroId);
    if (params.peerDeltas && params.peerDeltas.length > 0) {
      peerSeats.forEach((p, idx) => {
        const pd = params.peerDeltas![idx];
        if (pd?.name) {
          p.name = pd.name;
        }
      });
    }

    const normalizedDeltas = normalizeZeroSumDeltas(
      seatIds,
      resolvedHeroId,
      params.heroDelta,
      params.peerDeltas
    );

    let zeroSumCheck = 0;
    for (const [pid, delta] of Object.entries(normalizedDeltas)) {
      zeroSumCheck += delta;
      const stat = session.players[pid];
      if (!stat) continue;
      stat.totalDelta += delta;
      stat.roundsPlayed += 1;
      if (delta > 0) stat.winCount += 1;
      if (delta < 0) stat.loseCount += 1;
      if (delta > stat.bestSingleRound) {
        stat.bestSingleRound = delta;
      }
    }

    session.roundHistory.push({
      roundIndex: roundNumber,
      timestamp: Date.now(),
      summaryText: params.summaryText || `第 ${roundNumber} 局零和核验结算`,
      deltas: normalizedDeltas,
      zeroSumCheck,
    });

    session.status = 'in_progress';

    if (roundNumber >= session.config.totalRounds) {
      this.finalizeGrandSettlement(session, false);
    } else {
      session.currentRound = roundNumber + 1;
      session.verification = this.signScorecardDigest(session);
    }

    return session;
  }

  /**
   * Finalizes Grand Settlement (either at round cap or mid-match disband after >=1 completed round).
   * Applies the commercial Winner-Pay tie-breaker (`totalDelta > bestSingleRound > winCount > seatIndex`)
   * and signs the scorecard with HMAC-SHA256.
   */
  private finalizeGrandSettlement(
    session: ServerRoomCardSessionState,
    isEarlyMidMatchSettle: boolean
  ): void {
    if (session.status === 'grand_settled') return;

    // Ensure any remaining frozen escrow is captured
    this.captureEscrowOnFirstRound(session.config.roomId);

    session.status = 'grand_settled';
    session.settledAt = Date.now();
    session.currentRound = Math.max(1, session.roundHistory.length);

    const sortedPlayers = Object.values(session.players).sort(comparePlayersForWinnerPay);
    const topCandidate = sortedPlayers[0];

    if (session.config.payMode === 'winner') {
      // If someone has a positive net score, they are the adjudicated Big Winner;
      // if all players are <= 0, fallback to room host
      const adjudicatedWinner =
        topCandidate && topCandidate.totalDelta > 0
          ? topCandidate
          : session.players[session.config.hostId] || topCandidate;

      const cost = session.cardCostTotal;
      if (adjudicatedWinner) {
        session.deductedFromPlayerId = adjudicatedWinner.id;
        session.deductedAmount = cost;
        session.escrowState = 'CAPTURED';

        if (!adjudicatedWinner.isBot) {
          storageService.settleWinnerRoomCard(
            adjudicatedWinner.id,
            cost,
            session.config.roomId,
            session.config.gameType,
            `包间 #${session.config.roomId} ${
              isEarlyMidMatchSettle ? '中途提前结算' : '终局满局结算'
            }·大赢家顺位裁决扣减 ${cost} 张房卡`
          );
        }

        const existingEscrow = session.escrowMap[adjudicatedWinner.id];
        if (existingEscrow) {
          existingEscrow.capturedCards = cost;
          existingEscrow.status = 'CAPTURED';
          existingEscrow.updatedAt = Date.now();
        } else {
          session.escrowMap[adjudicatedWinner.id] = {
            playerId: adjudicatedWinner.id,
            playerName: adjudicatedWinner.name,
            frozenCards: 0,
            capturedCards: cost,
            releasedCards: 0,
            status: 'CAPTURED',
            updatedAt: Date.now(),
          };
        }
      }
    }

    session.verification = this.signScorecardDigest(session);
  }

  /**
   * Disbands or settles a Room Card session:
   * - If `roundHistory.length === 0`: Releases all frozen room cards (`RELEASED`) back to players' available balance.
   * - If `roundHistory.length >= 1`: Immediately triggers Grand Settlement based on completed rounds (`GRAND_SETTLED`).
   */
  public disbandOrSettleSession(
    roomId: string,
    _actorPlayerId?: string
  ): {
    action: 'refunded' | 'settled' | 'none';
    message: string;
    session: ServerRoomCardSessionState | null;
  } {
    const session = this.sessions.get(roomId);
    if (!session) {
      return { action: 'none', message: '未找到对应的房卡包间', session: null };
    }

    if (session.roundHistory.length === 0) {
      let totalReleased = 0;
      for (const record of Object.values(session.escrowMap)) {
        if (record.status === 'FROZEN' && record.frozenCards > 0) {
          storageService.releaseFrozenRoomCard(
            record.playerId,
            record.frozenCards,
            roomId,
            session.config.gameType,
            `包间 #${roomId} 未开局解散，全额解冻退回 ${record.frozenCards} 张房卡`
          );
          totalReleased += record.frozenCards;
          record.releasedCards = record.frozenCards;
          record.frozenCards = 0;
          record.status = 'RELEASED';
          record.updatedAt = Date.now();
        }
      }

      session.status = 'disbanded_refunded';
      session.escrowState = 'RELEASED';
      session.refunded = true;
      session.verification = this.signScorecardDigest(session);

      for (const pid of Object.keys(session.players)) {
        if (this.playerToActiveSession.get(pid) === roomId) {
          this.playerToActiveSession.delete(pid);
        }
      }
      this.sessions.delete(roomId);

      return {
        action: 'refunded',
        message:
          totalReleased > 0
            ? `包间 #${roomId} 未开局解散，服务端已全额解冻退还 ${totalReleased} 张房卡`
            : `包间 #${roomId} 未开局解散，已解除大赢家准入锁`,
        session,
      };
    }

    this.finalizeGrandSettlement(session, true);
    return {
      action: 'settled',
      message: `包间 #${roomId} 按已完成 ${session.roundHistory.length} 局完成大赢家裁决与防伪战报签名`,
      session,
    };
  }

  /**
   * Called when a player disconnects or leaves a room.
   * - If the match is in progress (`roundHistory.length > 0`), preserves their seat!
   * - If `waiting_first_round` and a non-host AA player leaves, releases their frozen AA share.
   */
  public handlePlayerLeaveOrDisconnect(roomId: string, playerId: string, isDisconnectOnly: boolean): void {
    const session = this.sessions.get(roomId);
    if (!session) return;

    const playerStat = session.players[playerId];
    if (!playerStat) return;

    if (isDisconnectOnly || session.roundHistory.length > 0) {
      playerStat.disconnected = true;
      return;
    }

    // Waiting for Round 1 & explicit leave: if host leaves, disband and refund all
    if (playerStat.isHost) {
      this.disbandOrSettleSession(roomId, playerId);
      return;
    }

    // Non-host leaves before Round 1: release their frozen AA share if any
    const escrow = session.escrowMap[playerId];
    if (escrow && escrow.status === 'FROZEN' && escrow.frozenCards > 0) {
      storageService.releaseFrozenRoomCard(
        playerId,
        escrow.frozenCards,
        roomId,
        session.config.gameType,
        `包间 #${roomId} 开局前离座，自动解冻退回 ${escrow.frozenCards} 张AA房卡`
      );
      session.deductedAmount = Math.max(0, session.deductedAmount - escrow.frozenCards);
      escrow.releasedCards = escrow.frozenCards;
      escrow.frozenCards = 0;
      escrow.status = 'RELEASED';
      escrow.updatedAt = Date.now();
    }

    this.playerToActiveSession.delete(playerId);
  }

  /**
   * Generates an authoritative HMAC-SHA256 anti-counterfeit signature over the session scorecard.
   */
  public signScorecardDigest(session: ServerRoomCardSessionState): ServerScorecardVerification {
    const sorted = Object.values(session.players).sort(comparePlayersForWinnerPay);
    const topWinner = sorted[0];
    const zeroSumVerified = session.roundHistory.every((r) => r.zeroSumCheck === 0);

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

    // Check if there was a tie for top positive score to explain tie-breaker rule
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

    const issuedAt = session.settledAt || Date.now();
    const scoreVector = sorted
      .map((p) => `${p.id}:${p.totalDelta}:${p.bestSingleRound}:${p.winCount}`)
      .join('|');
    const canonicalPayload = [
      session.config.roomId,
      session.config.gameType,
      session.config.subMode,
      session.config.baseScore,
      `${session.roundHistory.length}/${session.config.totalRounds}`,
      session.config.payMode,
      session.escrowState,
      scoreVector,
    ].join('::');

    const rawHex = crypto
      .createHmac('sha256', SCORECARD_HMAC_SECRET)
      .update(canonicalPayload)
      .digest('hex')
      .toUpperCase();

    const signature = `RC-${rawHex.slice(0, 8)}-${rawHex.slice(8, 16)}`;

    return {
      signature,
      issuedAt,
      zeroSumVerified,
      escrowState: session.escrowState,
      payerId: session.deductedFromPlayerId,
      payerName,
      tieBreakRuleApplied,
    };
  }
}

export const roomCardEngine = new RoomCardEngine();
