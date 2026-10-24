import { io, Socket } from 'socket.io-client';

export class SocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private playerId = '';

  constructor() {
    this.initPlayerIdentity();
  }

  private initPlayerIdentity(): void {
    if (typeof window !== 'undefined') {
      try {
        let id = localStorage.getItem('h5_game_player_id');
        if (!id) {
          id = `player_${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem('h5_game_player_id', id);
        }
        this.playerId = id;
      } catch {
        this.playerId = `player_${Math.random().toString(36).slice(2, 10)}`;
      }
    }
  }

  getPlayerId(): string {
    if (!this.playerId) this.initPlayerIdentity();
    return this.playerId;
  }

  connect(): void {
    if (this.socket?.connected || typeof window === 'undefined') return;
    const nickname = localStorage.getItem('h5_game_nickname') || undefined;
    const avatarId = localStorage.getItem('h5_game_avatar') || undefined;

    if (this.socket) {
      this.socket.connect();
      return;
    }

    this.socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      auth: {
        playerId: this.getPlayerId(),
        nickname,
        avatarId,
      },
    });

    this.socket.on('connect', () => {
      this.emit('c2s_auth_guest', {
        playerId: this.getPlayerId(),
        nickname: localStorage.getItem('h5_game_nickname') || undefined,
        avatarId: localStorage.getItem('h5_game_avatar') || undefined,
      });
      this.dispatchLocal('socket_connected', {});
    });

    this.socket.onAny((event: string, payload: any) => {
      if (event === 's2c_auth_success' && payload && typeof payload === 'object') {
        const prof = payload.profile;
        if (prof?.playerId) {
          this.playerId = prof.playerId;
          try {
            localStorage.setItem('h5_game_player_id', prof.playerId);
          } catch {
            // Ignore
          }
        }
      }
      this.dispatchLocal(event, payload);
    });
  }

  private dispatchLocal(event: string, payload: any): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[SocketClient] Listener error on ${event}:`, err);
        }
      });
    }
  }

  on<T = any>(event: string, callback: (data: T) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback as (data: any) => void);
    return () => {
      set?.delete(callback as (data: any) => void);
    };
  }

  emit<T = any>(event: string, payload?: T): void {
    if (!this.socket) {
      this.connect();
    }
    this.socket?.emit(event, payload);
  }
}

export const socketClient = new SocketClient();
