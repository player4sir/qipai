import { io, Socket } from 'socket.io-client';

type EventHandler<T = any> = (payload: T) => void;

const PLAYER_ID_KEY = 'h5_game_player_id';
const NICKNAME_KEY = 'h5_game_nickname';
const AVATAR_KEY = 'h5_game_avatar';
const SESSION_TOKEN_KEY = 'h5_game_session_token';
const ACTIVE_ROOM_ID_KEY = 'h5_game_active_room_id';
const ACTIVE_GAME_TYPE_KEY = 'h5_game_active_game_type';

const HEARTBEAT_INTERVAL_MS = 10000;
const HEARTBEAT_TIMEOUT_MS = 6000;
const MAX_MISSED_HEARTBEATS = 2;

interface QueuedEvent {
  event: string;
  payload?: unknown;
  queuedAt: number;
}

/**
 * Generic WebSocket Client wrapper (/src/shared/network/SocketClient.ts).
 * Strictly game-agnostic: contains no game-specific business logic.
 * Features:
 * 1. Automatic application-layer heartbeat (`c2s_heartbeat` / `s2c_heartbeat_ack`) with RTT tracking & zombie socket detection
 * 2. Silent reconnection & session recovery backed by localStorage HMAC `sessionToken` and active room state
 * 3. Monotonic `_seq` action idempotency numbering & short disconnect queue buffering
 */
export class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private playerId: string;
  private actionSeq = 0;

  // Heartbeat & silent reconnect state
  private heartbeatTimer: number | null = null;
  private heartbeatTimeoutTimer: number | null = null;
  private missedHeartbeats = 0;
  private lastPongAt = 0;
  private rttMs = 0;
  private hasConnectedOnce = false;
  private isSilentReconnecting = false;
  private pendingQueue: QueuedEvent[] = [];
  private lifecycleBound = false;

  constructor() {
    const savedId = this.safeGetStorage(PLAYER_ID_KEY);
    if (savedId) {
      this.playerId = savedId;
    } else {
      this.playerId = `guest_${Math.random().toString(36).slice(2, 10)}`;
      this.safeSetStorage(PLAYER_ID_KEY, this.playerId);
    }
  }

  private safeGetStorage(key: string): string | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
      return localStorage.getItem(key) || undefined;
    } catch {
      return undefined;
    }
  }

  private safeSetStorage(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota errors
    }
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getSessionToken(): string | undefined {
    return this.safeGetStorage(SESSION_TOKEN_KEY);
  }

  getRttMs(): number {
    return this.rttMs;
  }

  isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  private buildHandshakeAuth(): Record<string, string | undefined> {
    const savedId = this.safeGetStorage(PLAYER_ID_KEY);
    if (savedId) {
      this.playerId = savedId;
    }
    return {
      playerId: this.playerId,
      nickname: this.safeGetStorage(NICKNAME_KEY),
      avatarId: this.safeGetStorage(AVATAR_KEY),
      sessionToken: this.safeGetStorage(SESSION_TOKEN_KEY),
      activeRoomId: this.safeGetStorage(ACTIVE_ROOM_ID_KEY),
      activeGameType: this.safeGetStorage(ACTIVE_GAME_TYPE_KEY),
    };
  }

  connect(): void {
    if (this.socket) return;

    this.bindBrowserLifecycleEvents();

    this.socket = io(window.location.origin, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
      timeout: 10000,
      auth: this.buildHandshakeAuth(),
    });

    // Always inject the freshest sessionToken & room state from localStorage before each reconnect attempt
    this.socket.io.on('reconnect_attempt', () => {
      this.isSilentReconnecting = true;
      if (this.socket) {
        this.socket.auth = this.buildHandshakeAuth();
      }
      this.dispatchLocal('socket_reconnecting', { silent: true });
    });

    this.socket.on('connect', () => {
      const isReconnect = this.hasConnectedOnce || this.isSilentReconnecting;
      this.hasConnectedOnce = true;
      this.isSilentReconnecting = false;
      this.missedHeartbeats = 0;
      this.lastPongAt = Date.now();
      this.actionSeq = 0;

      // Authenticate / silently recover session using localStorage token & active room state
      this.authenticateAndRecoverSession(isReconnect);

      // Start periodic heartbeat loop
      this.startHeartbeat();

      // Flush any actions queued during a brief silent reconnect window
      this.flushPendingQueue();

      this.dispatchLocal('socket_connected', {
        connected: true,
        reconnected: isReconnect,
      });
    });

    this.socket.on(
      's2c_auth_success',
      (data: {
        sessionToken?: string;
        profile?: { playerId?: string; nickname?: string; avatarId?: string };
        activeRoomId?: string | null;
        activeGameType?: string | null;
      }) => {
        if (data?.sessionToken) {
          this.safeSetStorage(SESSION_TOKEN_KEY, data.sessionToken);
        }
        if (data?.profile?.playerId) {
          this.playerId = data.profile.playerId;
          this.safeSetStorage(PLAYER_ID_KEY, this.playerId);
        }
        if (data?.profile?.nickname) {
          this.safeSetStorage(NICKNAME_KEY, data.profile.nickname);
        }
        if (data?.profile?.avatarId) {
          this.safeSetStorage(AVATAR_KEY, data.profile.avatarId);
        }
        if (this.socket) {
          this.socket.auth = this.buildHandshakeAuth();
        }
      }
    );

    this.socket.on(
      's2c_heartbeat_ack',
      (data: {
        serverTime?: number;
        clientTime?: number;
        playerId?: string;
        sessionToken?: string;
        activeRoomId?: string | null;
        activeGameType?: string | null;
        recoveredRoom?: boolean;
      }) => {
        this.clearHeartbeatTimeout();
        this.missedHeartbeats = 0;
        this.lastPongAt = Date.now();

        if (typeof data?.clientTime === 'number') {
          this.rttMs = Math.max(1, Date.now() - data.clientTime);
        }
        if (data?.sessionToken) {
          this.safeSetStorage(SESSION_TOKEN_KEY, data.sessionToken);
        }
        if (data?.playerId && data.playerId !== this.playerId) {
          this.playerId = data.playerId;
          this.safeSetStorage(PLAYER_ID_KEY, this.playerId);
        }

        // If heartbeat recovered an active room session, notify listeners to sync UI state
        if (data?.recoveredRoom && data.activeRoomId) {
          this.dispatchLocal('s2c_room_joined', {
            roomId: data.activeRoomId,
            gameType: data.activeGameType || this.safeGetStorage(ACTIVE_GAME_TYPE_KEY) || 'ddz',
          });
        }

        this.dispatchLocal('socket_heartbeat', {
          rttMs: this.rttMs,
          timestamp: this.lastPongAt,
        });
      }
    );

    this.socket.on('disconnect', () => {
      this.stopHeartbeat();
      this.isSilentReconnecting = true;
      this.dispatchLocal('socket_disconnected', { connected: false });
    });

    this.socket.on('connect_error', () => {
      if (this.socket) {
        this.socket.auth = this.buildHandshakeAuth();
      }
    });

    this.socket.onAny((event: string, payload: unknown) => {
      if (event === 's2c_heartbeat_ack') return;
      this.dispatchLocal(event, payload);
    });
  }

  /**
   * Emits `c2s_auth_guest` with persisted `sessionToken` and `activeRoomId`
   * to silently restore identity and table state after reconnect.
   */
  private authenticateAndRecoverSession(silentReconnect: boolean): void {
    const authPayload = this.buildHandshakeAuth();
    this.emit('c2s_auth_guest', {
      playerId: authPayload.playerId,
      nickname: authPayload.nickname,
      avatarId: authPayload.avatarId,
      sessionToken: authPayload.sessionToken,
      activeRoomId: authPayload.activeRoomId,
      activeGameType: authPayload.activeGameType,
      silentReconnect,
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (typeof window === 'undefined') return;

    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeatPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private sendHeartbeatPing(): void {
    if (!this.socket || !this.socket.connected) {
      this.triggerSilentReconnect();
      return;
    }

    this.clearHeartbeatTimeout();
    this.socket.emit('c2s_heartbeat', {
      clientTime: Date.now(),
      sessionToken: this.safeGetStorage(SESSION_TOKEN_KEY),
      activeRoomId: this.safeGetStorage(ACTIVE_ROOM_ID_KEY),
    });

    if (typeof window !== 'undefined') {
      this.heartbeatTimeoutTimer = window.setTimeout(() => {
        this.missedHeartbeats += 1;
        if (this.missedHeartbeats >= MAX_MISSED_HEARTBEATS) {
          this.triggerSilentReconnect();
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }
  }

  /**
   * Proactively recovers from zombie / half-open connections or network switches
   * using the persisted session token in localStorage.
   */
  triggerSilentReconnect(): void {
    if (!this.socket) {
      this.connect();
      return;
    }

    this.isSilentReconnecting = true;
    this.missedHeartbeats = 0;
    this.socket.auth = this.buildHandshakeAuth();

    if (this.socket.connected) {
      // Connection looks open but missed heartbeats: cycle transport silently
      this.socket.disconnect().connect();
    } else {
      this.socket.connect();
    }
  }

  private bindBrowserLifecycleEvents(): void {
    if (this.lifecycleBound || typeof window === 'undefined') return;
    this.lifecycleBound = true;

    window.addEventListener('online', () => {
      if (!this.socket?.connected) {
        this.triggerSilentReconnect();
      } else {
        this.sendHeartbeatPing();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!this.socket?.connected) {
          this.triggerSilentReconnect();
        } else {
          // Immediately verify connection liveness & sync room snapshot upon returning to foreground
          this.sendHeartbeatPing();
          const activeRoomId = this.safeGetStorage(ACTIVE_ROOM_ID_KEY);
          if (activeRoomId) {
            this.emit('c2s_request_snapshot');
          }
        }
      }
    });
  }

  private flushPendingQueue(): void {
    if (!this.socket?.connected || this.pendingQueue.length === 0) return;
    const now = Date.now();
    const queue = this.pendingQueue.splice(0, this.pendingQueue.length);
    for (const item of queue) {
      // Only flush recent events (< 8s old) to avoid stale actions
      if (now - item.queuedAt < 8000) {
        this.emit(item.event, item.payload);
      }
    }
  }

  emit(event: string, payload?: unknown): void {
    if (!this.socket) {
      this.connect();
    }

    // If socket is temporarily disconnected during a silent reconnect, buffer non-heartbeat events
    if (this.socket && !this.socket.connected && event !== 'c2s_auth_guest' && event !== 'c2s_heartbeat') {
      if (this.pendingQueue.length < 15) {
        this.pendingQueue.push({ event, payload, queuedAt: Date.now() });
      }
      this.triggerSilentReconnect();
      return;
    }

    this.actionSeq += 1;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      this.socket?.emit(event, {
        ...(payload as Record<string, unknown>),
        _seq: this.actionSeq,
      });
    } else {
      this.socket?.emit(event, payload);
    }
  }

  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<T = any>(event: string, handler: EventHandler<T>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(handler);
    }
  }

  private dispatchLocal(event: string, payload: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      fn(payload);
    }
  }
}

export const socketClient = new SocketClient();
