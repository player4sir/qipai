import { Socket } from 'socket.io';
import { ConnectionManager } from './ConnectionManager.js';
import { redisClient } from './redisClient.js';
import { roomCardEngine } from './RoomCardEngine.js';

/**
 * Generic Room & Player Abstractions.
 * Strictly game-agnostic (/server/core boundary).
 */
export interface RoomPlayerInfo {
  playerId: string;
  nickname: string;
  avatarId: string;
  seatIndex: number;
  beans: number;
  ready: boolean;
  isBot: boolean;
  disconnected: boolean;
  trusteeship: boolean;
}

export interface RoomSummary {
  roomId: string;
  gameType: string;
  mode?: string;
  hostId: string;
  baseScore: number;
  initialScore?: number;
  isPrivate: boolean;
  status: string;
  playerCount: number;
  maxPlayers: number;
  players: Array<{ nickname: string; avatarId: string; isBot: boolean }>;
}

export interface IGameRoom {
  roomId: string;
  gameType: string;
  mode?: string;
  hostId: string;
  baseScore: number;
  initialScore?: number;
  isPrivate: boolean;
  status: string;
  maxPlayers: number;
  createdAt: number;

  addPlayer(player: { playerId: string; nickname: string; avatarId: string; beans: number; isBot?: boolean }): boolean;
  removePlayer(playerId: string): boolean;
  hasPlayer(playerId: string): boolean;
  getPlayerCount(): number;
  isEmptyOfHumans(): boolean;
  setPlayerReady(playerId: string, ready?: boolean): void;
  addBotPlayer(): boolean;
  replaceBotWithHuman?(player: { playerId: string; nickname: string; avatarId: string; beans: number }): boolean;
  rebuySeatScore?(playerId: string, addedScore: number): number;
  triggerImmediateDeal?(): void;
  handlePlayerDisconnect(playerId: string): void;
  handlePlayerReconnect(playerId: string): void;
  handleClientEvent(playerId: string, event: string, payload: unknown): void;
  getSummary(): RoomSummary;
  destroy(): void;
}

export type RoomFactory = (options: {
  roomId: string;
  hostId: string;
  baseScore: number;
  initialScore?: number;
  isPrivate: boolean;
  mode?: string;
  connectionManager: ConnectionManager;
  onRoomDestroyed: (roomId: string) => void;
}) => IGameRoom;

const ROOM_REDIS_TTL_SECONDS = 3600;
const STALE_ROOM_CHECK_INTERVAL_MS = 30000;
const STALE_WAITING_ROOM_TTL_MS = 15 * 60 * 1000;

export class RoomManager {
  private rooms: Map<string, IGameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private factories: Map<string, RoomFactory> = new Map();
  private connectionManager: ConnectionManager;
  private roomLastActiveAt: Map<string, number> = new Map();
  private gcTimer: NodeJS.Timeout;

  constructor(connectionManager: ConnectionManager) {
    this.connectionManager = connectionManager;
    this.gcTimer = setInterval(() => {
      void this.cleanupStaleRooms();
    }, STALE_ROOM_CHECK_INTERVAL_MS);
  }

  registerGameFactory(gameType: string, factory: RoomFactory): void {
    this.factories.set(gameType, factory);
  }

  generateRoomId(): string {
    for (let i = 0; i < 100; i++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    return Date.now().toString().slice(-6);
  }

  /**
   * Synchronizes hot room snapshot metadata to RedisClient with a 1-hour TTL
   * so active rooms & player mappings remain inspectable and recoverable.
   */
  async syncRoomSnapshotToRedis(room: IGameRoom): Promise<void> {
    this.roomLastActiveAt.set(room.roomId, Date.now());
    const summary = room.getSummary();
    await redisClient.set(
      `room:${room.roomId}`,
      JSON.stringify({
        ...summary,
        updatedAt: Date.now(),
      }),
      ROOM_REDIS_TTL_SECONDS
    );
  }

  createRoom(options: {
    preferredRoomId?: string;
    gameType: string;
    hostPlayer: { playerId: string; nickname: string; avatarId: string; beans: number };
    baseScore: number;
    initialScore?: number;
    isPrivate: boolean;
    mode?: string;
  }): IGameRoom {
    const existingRoom = this.getRoomByPlayer(options.hostPlayer.playerId);
    if (existingRoom) {
      this.leaveRoom(options.hostPlayer.playerId);
    }

    const factory = this.factories.get(options.gameType);
    if (!factory) {
      throw new Error(`Unsupported gameType: ${options.gameType}`);
    }

    const roomId =
      options.preferredRoomId &&
      /^\d{6}$/.test(options.preferredRoomId) &&
      !this.rooms.has(options.preferredRoomId)
        ? options.preferredRoomId
        : this.generateRoomId();
    const resolvedInitialScore =
      options.initialScore && options.initialScore > 0
        ? options.initialScore
        : options.hostPlayer.beans > 0
        ? options.hostPlayer.beans
        : Math.max(2000, options.baseScore * 20);

    const room = factory({
      roomId,
      hostId: options.hostPlayer.playerId,
      baseScore: options.baseScore,
      initialScore: resolvedInitialScore,
      isPrivate: options.isPrivate,
      mode: options.mode,
      connectionManager: this.connectionManager,
      onRoomDestroyed: (id) => {
        this.rooms.delete(id);
        this.roomLastActiveAt.delete(id);
        void redisClient.del(`room:${id}`);
      },
    });

    this.rooms.set(roomId, room);
    room.addPlayer(options.hostPlayer);
    this.playerToRoom.set(options.hostPlayer.playerId, roomId);
    this.bindSocketRoom(options.hostPlayer.playerId, roomId);
    void this.syncRoomSnapshotToRedis(room);
    return room;
  }

  joinRoom(
    roomId: string,
    player: { playerId: string; nickname: string; avatarId: string; beans: number }
  ): { ok: boolean; error?: string; room?: IGameRoom } {
    const currentRoom = this.getRoomByPlayer(player.playerId);
    if (currentRoom && currentRoom.roomId !== roomId) {
      this.leaveRoom(player.playerId);
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { ok: false, error: '房间号不存在或已解散' };
    }

    if (room.hasPlayer(player.playerId)) {
      this.playerToRoom.set(player.playerId, roomId);
      this.bindSocketRoom(player.playerId, roomId);
      room.handlePlayerReconnect(player.playerId);
      void this.syncRoomSnapshotToRedis(room);
      return { ok: true, room };
    }

    const isWaitingState =
      room.status === 'WAITING' ||
      room.status === 'waiting' ||
      room.status === 'ROUND_RESULT' ||
      room.status === 'RESULT';

    // Smart human seat replacement: if a waiting room is full because of bots, swap a bot out for the real human!
    if (room.getPlayerCount() >= room.maxPlayers) {
      if (isWaitingState && typeof room.replaceBotWithHuman === 'function') {
        const replaced = room.replaceBotWithHuman(player);
        if (replaced) {
          this.playerToRoom.set(player.playerId, roomId);
          this.bindSocketRoom(player.playerId, roomId);
          void this.syncRoomSnapshotToRedis(room);
          return { ok: true, room };
        }
      }
      return { ok: false, error: `该房间人数已满（${room.getPlayerCount()}/${room.maxPlayers}）` };
    }

    if (!isWaitingState) {
      return { ok: false, error: '该房间对局已开始，无法中途加入' };
    }

    const added = room.addPlayer(player);
    if (!added) {
      return { ok: false, error: '无法加入该房间' };
    }

    this.playerToRoom.set(player.playerId, roomId);
    this.bindSocketRoom(player.playerId, roomId);
    void this.syncRoomSnapshotToRedis(room);
    return { ok: true, room };
  }

  quickMatch(
    gameType: string,
    player: { playerId: string; nickname: string; avatarId: string; beans: number },
    baseScore = 100,
    fillBotsImmediately = true,
    mode?: string,
    initialScore?: number
  ): IGameRoom {
    const existing = this.getRoomByPlayer(player.playerId);
    if (existing) {
      this.leaveRoom(player.playerId);
    }

    const resolvedInitialScore =
      initialScore && initialScore > 0 ? initialScore : player.beans;

    // 1. Smart Human Matchmaking Window:
    // Prefer matching into an existing public room with matching gameType, baseScore, initialScore, and mode
    // that is either waiting for players OR has replaceable AI bots between rounds.
    for (const room of this.rooms.values()) {
      const isWaitingState =
        room.status === 'WAITING' ||
        room.status === 'waiting' ||
        room.status === 'ROUND_RESULT' ||
        room.status === 'RESULT';
      const hasOpenOrBotSeat =
        room.getPlayerCount() < room.maxPlayers ||
        typeof room.replaceBotWithHuman === 'function';

      if (
        room.gameType === gameType &&
        !room.isPrivate &&
        !room.isEmptyOfHumans() &&
        room.baseScore === baseScore &&
        (!room.initialScore || room.initialScore === resolvedInitialScore) &&
        (!mode || !room.mode || room.mode === mode) &&
        isWaitingState &&
        hasOpenOrBotSeat
      ) {
        const res = this.joinRoom(room.roomId, player);
        if (res.ok && res.room) {
          if (fillBotsImmediately) {
            while (res.room.getPlayerCount() < res.room.maxPlayers) {
              if (!res.room.addBotPlayer()) break;
            }
          }
          void this.syncRoomSnapshotToRedis(res.room);
          return res.room;
        }
      }
    }

    // 2. Otherwise create a new public room
    const newRoom = this.createRoom({
      gameType,
      hostPlayer: player,
      baseScore,
      initialScore: resolvedInitialScore,
      isPrivate: false,
      mode,
    });

    if (fillBotsImmediately) {
      while (newRoom.getPlayerCount() < newRoom.maxPlayers) {
        if (!newRoom.addBotPlayer()) break;
      }
    }

    void this.syncRoomSnapshotToRedis(newRoom);
    return newRoom;
  }

  leaveRoom(playerId: string): { refundedNotice?: string } {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return {};

    const room = this.rooms.get(roomId);
    this.playerToRoom.delete(playerId);
    this.unbindSocketRoom(playerId, roomId);

    const beforeSession = roomCardEngine.getSession(roomId);
    const wasWaitingFirstRound =
      beforeSession &&
      beforeSession.status === 'waiting_first_round' &&
      beforeSession.roundHistory.length === 0;

    roomCardEngine.handlePlayerLeaveOrDisconnect(roomId, playerId, false);

    if (!room) return {};
    room.removePlayer(playerId);

    let refundedNotice: string | undefined;
    if (room.isEmptyOfHumans()) {
      const rcSession = roomCardEngine.getSession(roomId);
      if (rcSession && rcSession.roundHistory.length === 0) {
        const disbandRes = roomCardEngine.disbandOrSettleSession(roomId, playerId);
        if (disbandRes.action === 'refunded') {
          refundedNotice = disbandRes.message;
        }
      }
      room.destroy();
      this.rooms.delete(roomId);
      this.roomLastActiveAt.delete(roomId);
      void redisClient.del(`room:${roomId}`);
    } else {
      if (wasWaitingFirstRound) {
        refundedNotice = '首局尚未发牌，已为您全额退还预冻房卡';
      }
      void this.syncRoomSnapshotToRedis(room);
    }
    return { refundedNotice };
  }

  getRoomByPlayer(playerId: string): IGameRoom | undefined {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return undefined;
    }
    return room;
  }

  getPublicRooms(gameType?: string): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!gameType || room.gameType === gameType) {
        list.push(room.getSummary());
      }
    }
    return list.sort((a, b) => b.playerCount - a.playerCount);
  }

  /**
   * Periodic zombie/abandoned room garbage collector.
   * Cleans up rooms with zero human players or idle WAITING rooms older than 15 minutes.
   */
  async cleanupStaleRooms(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      const lastActive = this.roomLastActiveAt.get(roomId) ?? room.createdAt;
      const isWaiting = room.status === 'WAITING' || room.status === 'waiting';
      const isAbandoned =
        room.isEmptyOfHumans() ||
        (isWaiting && now - lastActive > STALE_ROOM_CHECK_INTERVAL_MS && now - room.createdAt > STALE_WAITING_ROOM_TTL_MS);

      if (isAbandoned) {
        const rcSession = roomCardEngine.getSession(roomId);
        if (rcSession && rcSession.roundHistory.length === 0) {
          roomCardEngine.disbandOrSettleSession(roomId);
        }
        room.destroy();
        this.rooms.delete(roomId);
        this.roomLastActiveAt.delete(roomId);
        await redisClient.del(`room:${roomId}`);
        cleaned += 1;
      } else {
        await this.syncRoomSnapshotToRedis(room);
      }
    }
    return cleaned;
  }

  getRoomStats(): {
    totalRooms: number;
    activePlayerMappings: number;
    roomsByGame: Record<string, number>;
  } {
    const roomsByGame: Record<string, number> = {};
    for (const room of this.rooms.values()) {
      roomsByGame[room.gameType] = (roomsByGame[room.gameType] ?? 0) + 1;
    }
    return {
      totalRooms: this.rooms.size,
      activePlayerMappings: this.playerToRoom.size,
      roomsByGame,
    };
  }

  private bindSocketRoom(playerId: string, roomId: string): void {
    const socket: Socket | undefined = this.connectionManager.getSocketByPlayerId(playerId);
    if (socket) {
      socket.join(roomId);
    }
  }

  private unbindSocketRoom(playerId: string, roomId: string): void {
    const socket: Socket | undefined = this.connectionManager.getSocketByPlayerId(playerId);
    if (socket) {
      socket.leave(roomId);
    }
  }
}
