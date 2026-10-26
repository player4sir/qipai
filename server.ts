import http from 'http';
import path from 'path';
import express from 'express';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { ConnectionManager } from './server/core/ConnectionManager.js';
import { RoomManager } from './server/core/RoomManager.js';
import {
  roomCardEngine,
  ServerRoomCardGameType,
  ServerRoomCardPayMode,
  ServerRoomCardRoundCap,
  validateAndNormalizeServerStakes,
} from './server/core/RoomCardEngine.js';
import { securityGateway } from './server/core/SecurityGateway.js';
import { DdzRoom } from './server/games/ddz/DdzRoom.js';
import { MahjongRoom } from './server/games/mahjong/MahjongRoom.js';
import { NiuniuRoom } from './server/games/niuniu/NiuniuRoom.js';
import { ZhajinhuaRoom } from './server/games/zhajinhua/ZhajinhuaRoom.js';
import { LaoYanCaiRoom } from './server/games/laoyancai/LaoYanCaiRoom.js';
import { storageService, UserProfile } from './server/shared/storage.js';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json());

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const connectionManager = new ConnectionManager(io);
  const roomManager = new RoomManager(connectionManager);

  // Register game factories in generic RoomManager
  roomManager.registerGameFactory('ddz', (opts) => new DdzRoom(opts));
  roomManager.registerGameFactory('mahjong', (opts) => new MahjongRoom(opts));
  roomManager.registerGameFactory('niuniu', (opts) => new NiuniuRoom(opts));
  roomManager.registerGameFactory('zhajinhua', (opts) => new ZhajinhuaRoom(opts));
  roomManager.registerGameFactory('laoyancai', (opts) => new LaoYanCaiRoom(opts));

  // Every room type exposes sendSnapshotToPlayer(); avoid instanceof chains per game.
  const sendRoomSnapshot = (room: unknown, playerId: string): void => {
    const target = room as { sendSnapshotToPlayer?: (id: string) => void } | null | undefined;
    target?.sendSnapshotToPlayer?.(playerId);
  };

  // Helper to guarantee socket has a bound player session and verified/issued HMAC sessionToken
  const ensurePlayerProfile = async (
    socket: Socket,
    fallbackId?: string,
    nickname?: string,
    avatarId?: string,
    providedToken?: string
  ): Promise<UserProfile> => {
    const existingPlayerId = connectionManager.getPlayerIdBySocket(socket.id);
    if (existingPlayerId) {
      const existingProfile = storageService.getUser(existingPlayerId);
      if (existingProfile) return existingProfile;
    }

    const authData = (socket.handshake.auth ?? {}) as Record<string, string | undefined>;
    const tokenCandidate = providedToken || authData.sessionToken;
    const verifiedPlayerId = securityGateway.verifySessionToken(tokenCandidate);

    const rawId =
      verifiedPlayerId ||
      fallbackId ||
      authData.playerId ||
      `guest_${socket.id.slice(0, 8)}`;

    const profile = storageService.getOrCreateGuest(
      rawId,
      nickname || authData.nickname,
      avatarId || authData.avatarId
    );
    await connectionManager.bindSession(profile.playerId, socket);
    return profile;
  };

  // REST API endpoints for Lobby, Ledger Audit & Server Observability
  app.get('/api/rooms', (req, res) => {
    const gameType = typeof req.query.gameType === 'string' ? req.query.gameType : undefined;
    res.json({ rooms: roomManager.getPublicRooms(gameType) });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: storageService.getLeaderboard(10) });
  });

  app.get('/api/matches/:playerId', (req, res) => {
    const matches = storageService.getPlayerMatches(req.params.playerId, 15);
    res.json({ matches });
  });

  app.get('/api/ledger/:playerId', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const ledger = storageService.getPlayerLedger(req.params.playerId, limit);
    res.json({ ledger });
  });

  app.get('/api/server/stats', (_req, res) => {
    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      onlinePlayers: connectionManager.getOnlinePlayerCount(),
      pendingReconnects: connectionManager.getPendingReconnectCount(),
      rooms: roomManager.getRoomStats(),
      storage: storageService.getStorageStats(),
      security: securityGateway.getStats(),
    });
  });

  app.get('/api/replay/:matchId', (req, res) => {
    const replay = storageService.getMatchReplay(req.params.matchId);
    if (!replay) {
      res.status(404).json({ error: '未找到该局复盘数据' });
      return;
    }
    res.json({ replay });
  });

  app.get('/api/room-card/session/:roomId', (req, res) => {
    const session = roomCardEngine.getSession(req.params.roomId);
    if (!session) {
      res.status(404).json({ error: '未找到该房卡包间或已解散' });
      return;
    }
    res.json({ session });
  });

  // Commercial Room Card REST APIs (Two-Phase Escrow & Bankruptcy Rebuy)
  app.post('/api/room-cards/pre-freeze', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const playerId = String(body.playerId || '');
    const profile = storageService.getUser(playerId);
    if (!profile) {
      res.status(404).json({ ok: false, message: '未找到玩家账户' });
      return;
    }
    const roomId = String(body.roomId || roomManager.generateRoomId());
    const result = roomCardEngine.createSession({
      roomId,
      gameType: (body.gameType as ServerRoomCardGameType) || 'ddz',
      subMode: String(body.subMode || 'classic'),
      subModeLabel: String(body.subModeLabel || '标准场'),
      baseScore: Number(body.baseScore) || 100,
      initialScore: Number(body.initialScore) || 2000,
      totalRounds: body.totalRounds === 16 ? 16 : body.totalRounds === 8 ? 8 : 4,
      payMode: (body.payMode as ServerRoomCardPayMode) || 'host',
      fillBots: Boolean(body.fillBots ?? true),
      hostProfile: profile,
    });
    res.json({
      ...result,
      profile: storageService.getUser(playerId),
    });
  });

  app.post('/api/room-cards/commit', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const roomId = String(body.roomId || '').trim();
    const { capturedTotal, session } = roomCardEngine.captureEscrowOnFirstRound(roomId);
    if (!session) {
      res.status(404).json({ ok: false, message: '未找到对应房卡包间' });
      return;
    }
    res.json({ ok: true, capturedTotal, session });
  });

  app.post('/api/room-cards/refund', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const roomId = String(body.roomId || '').trim();
    const playerId = String(body.playerId || '').trim();
    const isIdleTimeout = Boolean(body.isIdleTimeout);
    const result = roomCardEngine.disbandOrSettleSession(roomId, playerId, isIdleTimeout);
    res.json({
      ok: result.action !== 'none',
      ...result,
      profile: playerId ? storageService.getUser(playerId) : undefined,
    });
  });

  // Periodic background sweep for idle rooms that timed out with no human joiners (15 min threshold)
  const idleRoomSweepInterval = setInterval(() => {
    roomCardEngine.sweepExpiredIdleSessions();
  }, 60_000);
  idleRoomSweepInterval.unref?.();

  app.post('/api/room-cards/rebuy', (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const roomId = String(body.roomId || '').trim();
    const playerId = String(body.playerId || '').trim();
    const multiplier: 1 | 2 = Number(body.multiplier) === 2 ? 2 : 1;
    const rebuyRes = roomCardEngine.rebuyPlayerScore({ roomId, playerId, multiplier });
    if (rebuyRes.ok) {
      const room = roomManager.getRoomByPlayer(playerId);
      room?.rebuySeatScore?.(playerId, rebuyRes.addedScore);
    }
    res.json({
      ...rebuyRes,
      profile: storageService.getUser(playerId),
    });
  });

  // WebSocket (Socket.io) protocol handlers
  io.on('connection', async (socket) => {
    // Auto-bind immediately from handshake auth if available
    if (socket.handshake.auth?.playerId || socket.handshake.auth?.sessionToken) {
      await ensurePlayerProfile(socket);
    }

    socket.on(
      'c2s_auth_guest',
      async (payload: {
        playerId?: string;
        nickname?: string;
        avatarId?: string;
        sessionToken?: string;
        activeRoomId?: string;
        activeGameType?: string;
        silentReconnect?: boolean;
      }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;

        const profile = await ensurePlayerProfile(
          socket,
          payload?.playerId,
          payload?.nickname,
          payload?.avatarId,
          payload?.sessionToken
        );

        const sessionToken = securityGateway.issueSessionToken(profile.playerId);
        let activeRoom = roomManager.getRoomByPlayer(profile.playerId);

        // Silent session & room recovery: if client carried an activeRoomId from localStorage
        // and the room is still alive on server, seamlessly rejoin it
        if (!activeRoom && payload?.activeRoomId) {
          const cleanRoomId = String(payload.activeRoomId).trim();
          const joinRes = roomManager.joinRoom(cleanRoomId, {
            playerId: profile.playerId,
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            beans: profile.beans,
          });
          if (joinRes.ok && joinRes.room) {
            activeRoom = joinRes.room;
          }
        }

        const rcSession =
          (activeRoom ? roomCardEngine.getSession(activeRoom.roomId) : null) ||
          roomCardEngine.getSessionByPlayer(profile.playerId);

        socket.emit('s2c_auth_success', {
          profile,
          sessionToken,
          activeRoomId: activeRoom?.roomId ?? null,
          activeGameType: activeRoom?.gameType ?? null,
          silentReconnect: Boolean(payload?.silentReconnect),
          rooms: roomManager.getPublicRooms(),
        });

        if (rcSession) {
          socket.emit('s2c_rc_session_sync', {
            session: rcSession,
            profile: storageService.getUser(profile.playerId),
          });
        }

        if (activeRoom) {
          socket.join(activeRoom.roomId);
          activeRoom.handlePlayerReconnect(profile.playerId);
          sendRoomSnapshot(activeRoom, profile.playerId);
          void roomManager.syncRoomSnapshotToRedis(activeRoom);
        }
      }
    );

    socket.on(
      'c2s_heartbeat',
      async (payload?: {
        clientTime?: number;
        sessionToken?: string;
        activeRoomId?: string;
      }) => {
        const profile = await ensurePlayerProfile(
          socket,
          undefined,
          undefined,
          undefined,
          payload?.sessionToken
        );
        await connectionManager.touchHeartbeat(profile.playerId, socket);

        let activeRoom = roomManager.getRoomByPlayer(profile.playerId);
        let recoveredRoom = false;

        if (!activeRoom && payload?.activeRoomId) {
          const cleanRoomId = String(payload.activeRoomId).trim();
          const joinRes = roomManager.joinRoom(cleanRoomId, {
            playerId: profile.playerId,
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            beans: profile.beans,
          });
          if (joinRes.ok && joinRes.room) {
            activeRoom = joinRes.room;
            recoveredRoom = true;
          }
        }

        const refreshedToken = securityGateway.issueSessionToken(profile.playerId);
        socket.emit('s2c_heartbeat_ack', {
          serverTime: Date.now(),
          clientTime: payload?.clientTime ?? Date.now(),
          playerId: profile.playerId,
          sessionToken: refreshedToken,
          activeRoomId: activeRoom?.roomId ?? null,
          activeGameType: activeRoom?.gameType ?? null,
          recoveredRoom,
        });

        if (activeRoom && recoveredRoom) {
          socket.join(activeRoom.roomId);
          activeRoom.handlePlayerReconnect(profile.playerId);
          sendRoomSnapshot(activeRoom, profile.playerId);
          void roomManager.syncRoomSnapshotToRedis(activeRoom);
        }
      }
    );

    socket.on(
      'c2s_update_profile',
      async (payload: { nickname: string; avatarId?: string }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
        const profile = await ensurePlayerProfile(socket);
        const updated = storageService.updateNickname(
          profile.playerId,
          payload?.nickname ?? '',
          payload?.avatarId
        );
        if (updated) {
          socket.emit('s2c_profile_updated', { profile: updated });
        }
      }
    );

    socket.on('c2s_claim_supply', async () => {
      if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
      const profile = await ensurePlayerProfile(socket);
      const updated = storageService.claimFreeSupply(profile.playerId);
      if (updated) {
        socket.emit('s2c_profile_updated', {
          profile: updated,
          notice: '已为您补充 5 张通用约局房卡',
        });
      }
    });

    socket.on('c2s_get_lobby_data', async () => {
      if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
      const profile = await ensurePlayerProfile(socket);
      socket.emit('s2c_lobby_data', {
        profile,
        rooms: roomManager.getPublicRooms(),
        leaderboard: storageService.getLeaderboard(10),
        matches: storageService.getPlayerMatches(profile.playerId, 15),
      });
    });

    socket.on(
      'c2s_exchange_room_cards',
      async (payload: { cardCount?: number; beanCost?: number }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
        const profile = await ensurePlayerProfile(socket);
        const cardCount = Math.max(1, Math.min(50, Number(payload?.cardCount) || 5));
        const updated = storageService.exchangeBeansForRoomCards(profile.playerId, cardCount, 0);
        if (!updated) {
          socket.emit('s2c_action_error', { message: '领取房卡补给失败' });
          return;
        }
        socket.emit('s2c_profile_updated', {
          profile: updated,
          notice: `已补充 ${cardCount} 张通用约局房卡`,
        });
      }
    );

    socket.on(
      'c2s_create_room',
      async (payload: {
        roomId?: string;
        gameType?: string;
        baseScore?: number;
        initialScore?: number;
        isPrivate?: boolean;
        autoFillBots?: boolean;
        mode?: string;
        subModeLabel?: string;
        totalRounds?: number;
        payMode?: 'host' | 'aa' | 'winner';
      }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
        if (!securityGateway.checkActionIdempotency(socket.id, 'c2s_create_room', payload)) return;

        const profile = await ensurePlayerProfile(socket);
        const rawGameType = (payload?.gameType || 'ddz') as ServerRoomCardGameType;
        const totalRounds: ServerRoomCardRoundCap =
          payload?.totalRounds === 16 ? 16 : payload?.totalRounds === 8 ? 8 : 4;
        const payMode: ServerRoomCardPayMode = payload?.payMode || 'host';

        const rawBaseScore = Number(payload?.baseScore) || 100;
        const rawInitialScore =
          Number(payload?.initialScore) > 0
            ? Number(payload?.initialScore)
            : Math.max(2000, rawBaseScore * 20);

        const candidateRoomId =
          payload?.roomId && /^\d{6}$/.test(payload.roomId)
            ? payload.roomId
            : roomManager.generateRoomId();

        // Phase-1 Two-Phase Escrow Freeze / Winner-Pay Eligibility Verification + Custom Stakes Validation
        const rcCreate = roomCardEngine.createSession({
          roomId: candidateRoomId,
          gameType: rawGameType,
          subMode: payload?.mode || 'classic',
          subModeLabel: payload?.subModeLabel || '商业房卡局',
          baseScore: rawBaseScore,
          initialScore: rawInitialScore,
          totalRounds,
          payMode,
          fillBots: Boolean(payload?.autoFillBots ?? true),
          hostProfile: profile,
        });

        if (!rcCreate.ok || !rcCreate.session) {
          socket.emit('s2c_action_error', { message: rcCreate.message });
          return;
        }

        const validatedBaseScore = rcCreate.session.config.baseScore;
        const validatedInitialScore = rcCreate.session.config.initialScore;

        const room = roomManager.createRoom({
          preferredRoomId: rcCreate.session.config.roomId,
          gameType: rawGameType,
          hostPlayer: {
            playerId: profile.playerId,
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            beans: validatedInitialScore,
          },
          baseScore: validatedBaseScore,
          initialScore: validatedInitialScore,
          isPrivate: Boolean(payload?.isPrivate),
          mode: payload?.mode || 'classic',
        });

        const updatedProfile = storageService.getUser(profile.playerId);
        socket.emit('s2c_profile_updated', {
          profile: updatedProfile,
          notice: rcCreate.message,
        });
        socket.emit('s2c_rc_session_sync', {
          session: rcCreate.session,
          profile: updatedProfile,
        });
        socket.emit('s2c_room_joined', { roomId: room.roomId, gameType: room.gameType });

        if (payload?.autoFillBots) {
          while (room.getPlayerCount() < room.maxPlayers) {
            room.addBotPlayer();
          }
          void roomManager.syncRoomSnapshotToRedis(room);
        }

        sendRoomSnapshot(room, profile.playerId);
        io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
      }
    );

    socket.on(
      'c2s_join_room',
      async (payload: { roomId: string; gameType?: string }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
        if (!securityGateway.checkActionIdempotency(socket.id, 'c2s_join_room', payload)) return;

        const profile = await ensurePlayerProfile(socket);
        const cleanRoomId = String(payload?.roomId ?? '').trim();

        // Check if this is a 6-digit Room Card session or if we need to bootstrap it on the server
        let targetRoom = roomManager.getPublicRooms().find((r) => r.roomId === cleanRoomId);
        const existingRcSession = roomCardEngine.getSession(cleanRoomId);
        let sessionInitialScore = existingRcSession?.config.initialScore || 2000;

        if (existingRcSession || /^\d{6}$/.test(cleanRoomId)) {
          const rcJoin = roomCardEngine.joinSession({
            roomId: cleanRoomId,
            playerProfile: profile,
            fallbackGameType: (payload?.gameType as ServerRoomCardGameType) || 'ddz',
          });

          if (!rcJoin.ok || !rcJoin.session) {
            socket.emit('s2c_action_error', { message: rcJoin.message });
            return;
          }

          sessionInitialScore = rcJoin.session.config.initialScore;

          // If the underlying game room isn't created yet (e.g. joining a preset code), create it now
          if (!targetRoom) {
            const created = roomManager.createRoom({
              preferredRoomId: cleanRoomId,
              gameType: rcJoin.session.config.gameType,
              hostPlayer: {
                playerId: profile.playerId,
                nickname: profile.nickname,
                avatarId: profile.avatarId,
                beans: sessionInitialScore,
              },
              baseScore: rcJoin.session.config.baseScore,
              isPrivate: true,
              mode: rcJoin.session.config.subMode,
            });
            while (created.getPlayerCount() < created.maxPlayers) {
              created.addBotPlayer();
            }
            targetRoom = created.getSummary();
          }

          const updatedProfile = storageService.getUser(profile.playerId);
          socket.emit('s2c_profile_updated', {
            profile: updatedProfile,
            notice: rcJoin.message,
          });
          io.to(cleanRoomId).emit('s2c_rc_session_sync', {
            session: rcJoin.session,
          });
          socket.emit('s2c_rc_session_sync', {
            session: rcJoin.session,
            profile: updatedProfile,
          });
        }

        const res = roomManager.joinRoom(cleanRoomId, {
          playerId: profile.playerId,
          nickname: profile.nickname,
          avatarId: profile.avatarId,
          beans: sessionInitialScore,
        });

        if (!res.ok || !res.room) {
          socket.emit('s2c_action_error', { message: res.error ?? '加入房间失败' });
          return;
        }

        socket.emit('s2c_room_joined', { roomId: res.room.roomId, gameType: res.room.gameType });
        sendRoomSnapshot(res.room, profile.playerId);
        io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
      }
    );

    socket.on(
      'c2s_rc_record_round',
      async (payload: {
        roomId: string;
        heroDelta: number;
        heroName?: string;
        summaryText?: string;
        peerDeltas?: Array<{ id?: string; name?: string; delta: number }>;
      }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
        const profile = await ensurePlayerProfile(socket);
        const cleanRoomId = String(payload?.roomId ?? '').trim();
        if (!cleanRoomId) return;

        const updatedSession = roomCardEngine.recordRoundSettlement({
          roomId: cleanRoomId,
          heroId: profile.playerId,
          heroDelta: Number(payload?.heroDelta) || 0,
          heroName: payload?.heroName || profile.nickname,
          summaryText: payload?.summaryText,
          peerDeltas: payload?.peerDeltas,
        });

        if (!updatedSession) return;

        const refreshedProfile = storageService.getUser(profile.playerId);
        socket.emit('s2c_profile_updated', { profile: refreshedProfile });
        io.to(cleanRoomId).emit('s2c_rc_session_sync', {
          session: updatedSession,
          profile: refreshedProfile,
        });
        socket.emit('s2c_rc_session_sync', {
          session: updatedSession,
          profile: refreshedProfile,
        });
      }
    );

    socket.on(
      'c2s_rc_simulate_round',
      async (payload: { roomId: string }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
        const profile = await ensurePlayerProfile(socket);
        const cleanRoomId = String(payload?.roomId ?? '').trim();
        const session = roomCardEngine.getSession(cleanRoomId);
        if (!session || session.status === 'grand_settled') return;

        const base = session.config.baseScore || 100;
        const multipliers = [3, 2, -1, -2, 4, -3];
        const pick = multipliers[(session.roundHistory.length + 1) % multipliers.length];
        const updatedSession = roomCardEngine.recordRoundSettlement({
          roomId: cleanRoomId,
          heroId: profile.playerId,
          heroDelta: base * pick,
          heroName: profile.nickname,
          summaryText: `第 ${session.roundHistory.length + 1} 局零和核验结算`,
        });

        if (!updatedSession) return;
        const refreshedProfile = storageService.getUser(profile.playerId);
        socket.emit('s2c_profile_updated', { profile: refreshedProfile });
        socket.emit('s2c_rc_session_sync', {
          session: updatedSession,
          profile: refreshedProfile,
        });
      }
    );

    socket.on(
      'c2s_rc_disband_or_settle',
      async (payload: { roomId: string }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
        const profile = await ensurePlayerProfile(socket);
        const cleanRoomId = String(payload?.roomId ?? '').trim();
        if (!cleanRoomId) return;

        const res = roomCardEngine.disbandOrSettleSession(cleanRoomId, profile.playerId);
        const refreshedProfile = storageService.getUser(profile.playerId);

        socket.emit('s2c_profile_updated', {
          profile: refreshedProfile,
          notice: res.message,
        });

        if (res.session) {
          io.to(cleanRoomId).emit('s2c_rc_session_sync', {
            session: res.session,
            action: res.action,
            message: res.message,
          });
          socket.emit('s2c_rc_session_sync', {
            session: res.session,
            action: res.action,
            message: res.message,
            profile: refreshedProfile,
          });
        }
      }
    );

    socket.on(
      'c2s_rc_commit_deal',
      async (payload?: { roomId?: string }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
        const profile = await ensurePlayerProfile(socket);
        const room = roomManager.getRoomByPlayer(profile.playerId);
        const targetRoomId = String(payload?.roomId || room?.roomId || '').trim();
        if (!targetRoomId) return;

        room?.triggerImmediateDeal?.();
        const { capturedTotal, session } = roomCardEngine.captureEscrowOnFirstRound(targetRoomId);
        const refreshedProfile = storageService.getUser(profile.playerId);
        if (session) {
          io.to(targetRoomId).emit('s2c_rc_session_sync', {
            session,
            action: 'escrow_captured',
            capturedTotal,
          });
          socket.emit('s2c_rc_session_sync', {
            session,
            profile: refreshedProfile,
            action: 'escrow_captured',
            capturedTotal,
          });
        }
        if (refreshedProfile) {
          socket.emit('s2c_profile_updated', {
            profile: refreshedProfile,
            notice:
              capturedTotal > 0
                ? `首局正式发牌，已核销 ${capturedTotal} 张预冻房卡`
                : '牌局已发牌开局',
          });
        }
      }
    );

    socket.on(
      'c2s_rc_rebuy',
      async (payload: { roomId?: string; multiplier?: 1 | 2 }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
        const profile = await ensurePlayerProfile(socket);
        const room = roomManager.getRoomByPlayer(profile.playerId);
        const targetRoomId = String(payload?.roomId || room?.roomId || '').trim();
        if (!targetRoomId) {
          socket.emit('s2c_action_error', { message: '当前不在有效牌桌内，无法补分' });
          return;
        }

        const multiplier: 1 | 2 = Number(payload?.multiplier) === 2 ? 2 : 1;
        const rebuyRes = roomCardEngine.rebuyPlayerScore({
          roomId: targetRoomId,
          playerId: profile.playerId,
          multiplier,
        });

        if (!rebuyRes.ok) {
          socket.emit('s2c_action_error', { message: rebuyRes.message });
          return;
        }

        const newSeatScore =
          room?.rebuySeatScore?.(profile.playerId, rebuyRes.addedScore) ??
          rebuyRes.newTableScore;
        const refreshedProfile = storageService.getUser(profile.playerId);

        socket.emit('s2c_profile_updated', {
          profile: refreshedProfile,
          notice: rebuyRes.message,
        });
        socket.emit('s2c_rc_rebuy_success', {
          roomId: targetRoomId,
          cardCost: rebuyRes.cardCost,
          addedScore: rebuyRes.addedScore,
          newTableScore: newSeatScore,
          newScore: newSeatScore,
          message: rebuyRes.message,
          session: rebuyRes.session,
          profile: refreshedProfile,
        });

        if (rebuyRes.session) {
          io.to(targetRoomId).emit('s2c_rc_session_sync', {
            session: rebuyRes.session,
            action: 'rebuy',
            message: rebuyRes.message,
          });
        }
        if (room) {
          sendRoomSnapshot(room, profile.playerId);
        }
      }
    );

    socket.on(
      'c2s_quick_match',
      async (payload: {
        gameType?: string;
        baseScore?: number;
        initialScore?: number;
        fillBots?: boolean;
        mode?: string;
        totalRounds?: number;
        payMode?: 'host' | 'aa' | 'winner';
      }) => {
        if (!securityGateway.consumeRateLimit(socket.id, 2)) return;
        if (!securityGateway.checkActionIdempotency(socket.id, 'c2s_quick_match', payload)) return;

        const profile = await ensurePlayerProfile(socket);
        const gameType = (payload?.gameType || 'ddz') as ServerRoomCardGameType;
        const fillBots = payload?.fillBots !== undefined ? Boolean(payload.fillBots) : true;
        const totalRounds: ServerRoomCardRoundCap =
          payload?.totalRounds === 16 ? 16 : payload?.totalRounds === 8 ? 8 : 4;
        const payMode: ServerRoomCardPayMode = payload?.payMode || 'host';

        const rawBase = Number(payload?.baseScore) || 100;
        const defaultTierInitial =
          Number(payload?.initialScore) > 0
            ? Number(payload?.initialScore)
            : rawBase >= 10000
            ? 200000
            : rawBase >= 2000
            ? 50000
            : rawBase >= 500
            ? 10000
            : rawBase >= 200
            ? 5000
            : 2000;

        const stakeCheck = validateAndNormalizeServerStakes(rawBase, defaultTierInitial);
        if (!stakeCheck.valid) {
          socket.emit('s2c_action_error', {
            message: stakeCheck.errorMessage || '场次底分与初始积分配置不合规',
          });
          return;
        }

        const baseScore = stakeCheck.baseScore;
        const tierInitialScore = stakeCheck.initialScore;
        const roomCardCost = stakeCheck.roomCardCost;

        if (profile.roomCards < roomCardCost) {
          socket.emit('s2c_action_error', {
            message: `可用房卡不足（本场次准入需预冻 ${roomCardCost} 张房卡，当前可用 ${profile.roomCards} 张）`,
          });
          return;
        }

        const resolvedMode =
          payload?.mode ||
          (gameType === 'mahjong'
            ? 'puer'
            : gameType === 'niuniu'
            ? 'qiangzhuang'
            : gameType === 'laoyancai'
            ? 'kunming'
            : 'classic');

        const room = roomManager.quickMatch(
          gameType,
          {
            playerId: profile.playerId,
            nickname: profile.nickname,
            avatarId: profile.avatarId,
            beans: tierInitialScore,
          },
          baseScore,
          fillBots,
          resolvedMode,
          tierInitialScore
        );

        // Quick Match: Immediate lightweight stake-tier deduction upon entry
        let rcSession = roomCardEngine.getSession(room.roomId);
        if (!rcSession) {
          const rcCreate = roomCardEngine.createSession({
            roomId: room.roomId,
            gameType,
            subMode: resolvedMode,
            subModeLabel: `底分${baseScore}场`,
            baseScore,
            initialScore: tierInitialScore,
            totalRounds,
            payMode,
            fillBots,
            hostProfile: profile,
            isQuickMatch: true,
          });
          if (!rcCreate.ok || !rcCreate.session) {
            roomManager.leaveRoom(profile.playerId);
            socket.emit('s2c_action_error', {
              message: rcCreate.message || '房卡准入实扣失败，请先补充房卡',
            });
            return;
          }
          rcSession = rcCreate.session;
        } else {
          const rcJoin = roomCardEngine.joinSession({
            roomId: room.roomId,
            playerProfile: profile,
            fallbackGameType: gameType,
          });
          if (rcJoin.session) {
            rcSession = rcJoin.session;
          }
        }

        const updatedProfile = storageService.getUser(profile.playerId) ?? profile;
        socket.emit('s2c_profile_updated', {
          profile: updatedProfile,
        });
        if (rcSession) {
          socket.emit('s2c_rc_session_sync', {
            session: rcSession,
            profile: updatedProfile,
          });
        }
        socket.emit('s2c_room_joined', { roomId: room.roomId, gameType: room.gameType });
        sendRoomSnapshot(room, profile.playerId);
        io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
      }
    );

    socket.on('c2s_request_snapshot', async () => {
      if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
      const profile = await ensurePlayerProfile(socket);
      const room = roomManager.getRoomByPlayer(profile.playerId);
      sendRoomSnapshot(room, profile.playerId);
    });

    socket.on('c2s_add_bot', async () => {
      if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
      const profile = await ensurePlayerProfile(socket);
      const room = roomManager.getRoomByPlayer(profile.playerId);
      if (!room) return;

      room.addBotPlayer();
      void roomManager.syncRoomSnapshotToRedis(room);
      sendRoomSnapshot(room, profile.playerId);
      io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
    });

    socket.on('c2s_toggle_ready', async (payload?: { ready?: boolean }) => {
      if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
      const profile = await ensurePlayerProfile(socket);
      const room = roomManager.getRoomByPlayer(profile.playerId);
      if (!room) return;

      room.setPlayerReady(profile.playerId, payload?.ready ?? true);
      void roomManager.syncRoomSnapshotToRedis(room);
    });

    socket.on('c2s_leave_room', async () => {
      if (!securityGateway.consumeRateLimit(socket.id, 1)) return;
      const profile = await ensurePlayerProfile(socket);
      const { refundedNotice } = roomManager.leaveRoom(profile.playerId);
      const updatedProfile = storageService.getUser(profile.playerId);
      if (refundedNotice && updatedProfile) {
        socket.emit('s2c_profile_updated', {
          profile: updatedProfile,
          notice: refundedNotice,
        });
      }
      socket.emit('s2c_left_room', {
        profile: updatedProfile,
        rooms: roomManager.getPublicRooms(),
        notice: refundedNotice,
      });
      io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
    });

    // Forward game-specific events to room with Token Bucket rate limiting & action sequence idempotency guard
    const gameEvents = [
      'c2s_call_landlord',
      'c2s_grab_landlord',
      'c2s_double_score',
      'c2s_play_cards',
      'c2s_request_hint',
      'c2s_toggle_trusteeship',
      'c2s_send_chat',
      'c2s_throw_prop',
      // Mahjong events
      'c2s_mj_dingque',
      'c2s_mj_swap_three',
      'c2s_mj_discard',
      'c2s_mj_respond',
      'c2s_mj_self_action',
      'c2s_mj_action',
      // Niuniu events
      'c2s_niuniu_call_banker',
      'c2s_niuniu_bet',
      'c2s_niuniu_show_hand',
      'c2s_niuniu_ready',
      // Zhajinhua events
      'c2s_zjh_action',
      'c2s_zjh_ready',
      // Lao Yan Cai events
      'c2s_lyc_call_banker',
      'c2s_lyc_bet',
      'c2s_lyc_banker_natural',
      'c2s_lyc_player_decision',
      'c2s_lyc_banker_decision',
      'c2s_lyc_ready',
    ];

    for (const evt of gameEvents) {
      socket.on(evt, async (payload: unknown) => {
        if (!securityGateway.consumeRateLimit(socket.id, 1)) {
          socket.emit('s2c_action_error', { message: '操作过于频繁，请稍候再试' });
          return;
        }
        if (evt !== 'c2s_request_hint' && !securityGateway.checkActionIdempotency(socket.id, evt, payload)) {
          return;
        }

        const profile = await ensurePlayerProfile(socket);
        const room = roomManager.getRoomByPlayer(profile.playerId);
        if (!room) return;
        room.handleClientEvent(profile.playerId, evt, payload);
        void roomManager.syncRoomSnapshotToRedis(room);
      });
    }

    socket.on('disconnect', () => {
      connectionManager.handleDisconnect(
        socket.id,
        (playerId) => {
          const room = roomManager.getRoomByPlayer(playerId);
          if (room) {
            roomCardEngine.handlePlayerLeaveOrDisconnect(room.roomId, playerId, true);
            room.handlePlayerDisconnect(playerId);
            void roomManager.syncRoomSnapshotToRedis(room);
          }
        },
        (playerId) => {
          const room = roomManager.getRoomByPlayer(playerId);
          if (room && roomCardEngine.isSessionLockedInProgress(room.roomId)) {
            // Preserve player's seat in locked-in-progress Room Card matches
            roomCardEngine.handlePlayerLeaveOrDisconnect(room.roomId, playerId, true);
            return;
          }
          roomManager.leaveRoom(playerId);
          io.emit('s2c_rooms_updated', { rooms: roomManager.getPublicRooms() });
        }
      );
    });
  });

  // Mount Vite dev server in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
