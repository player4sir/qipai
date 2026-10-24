import { useEffect, useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';
import { webAudioQueue } from '../audio/WebAudioQueueManager';
import { effectCoordinator } from '../EffectCoordinator';
import { hapticEngine } from '../haptics/HapticEngine';
import { socketClient } from '../network/SocketClient';

export type PaceSpeed = 1 | 1.5 | 2;

export interface GameControlState {
  isTrusteeship: boolean;
  paceSpeed: PaceSpeed;
  autoNextRound: boolean;
  isInTableSettingsOpen: boolean;
  switchTableSeq: number;
  lastSwitchTimestamp: number;
}

class GameControlHub {
  private state: GameControlState = {
    isTrusteeship: false,
    paceSpeed: 1,
    autoNextRound: false,
    isInTableSettingsOpen: false,
    switchTableSeq: 0,
    lastSwitchTimestamp: 0,
  };

  private listeners = new Set<(state: GameControlState) => void>();

  getState(): GameControlState {
    return this.state;
  }

  subscribe(listener: (state: GameControlState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = { ...this.state };
    this.listeners.forEach((fn) => {
      try {
        fn(snapshot);
      } catch (err) {
        console.error('[GameControlHub] Listener error:', err);
      }
    });
  }

  scaleDelay(baseMs: number, minMs = 110): number {
    return Math.max(minMs, Math.round(baseMs / this.state.paceSpeed));
  }

  setTrusteeship(active: boolean, options?: { silent?: boolean }): void {
    if (this.state.isTrusteeship === active) return;
    this.state = {
      ...this.state,
      isTrusteeship: active,
    };
    if (!options?.silent) {
      soundEngine.playTap(active ? 820 : 620);
      hapticEngine.tap();
    }
    this.emit();
  }

  toggleTrusteeship(): boolean {
    const next = !this.state.isTrusteeship;
    this.setTrusteeship(next);
    return next;
  }

  setPaceSpeed(speed: PaceSpeed): void {
    if (this.state.paceSpeed === speed) return;
    this.state = {
      ...this.state,
      paceSpeed: speed,
    };
    this.emit();
  }

  cyclePaceSpeed(): PaceSpeed {
    return this.state.paceSpeed;
  }

  setAutoNextRound(enabled: boolean): void {
    if (this.state.autoNextRound === enabled) return;
    this.state = {
      ...this.state,
      autoNextRound: enabled,
    };
    this.emit();
  }

  toggleAutoNextRound(): boolean {
    const next = !this.state.autoNextRound;
    this.setAutoNextRound(next);
    return next;
  }

  setInTableSettingsOpen(open: boolean): void {
    if (this.state.isInTableSettingsOpen === open) return;
    if (open) {
      soundEngine.playTap(740);
    }
    this.state = {
      ...this.state,
      isInTableSettingsOpen: open,
    };
    this.emit();
  }

  resetTableScopedState(): void {
    if (!this.state.isTrusteeship && !this.state.isInTableSettingsOpen) return;
    this.state = {
      ...this.state,
      isTrusteeship: false,
      isInTableSettingsOpen: false,
    };
    this.emit();
  }

  requestSwitchTable(gameType?: string | null, baseScore = 100): void {
    const now = Date.now();
    if (now - this.state.lastSwitchTimestamp < 500) return;

    soundEngine.playTap(790);
    hapticEngine.playCard();
    webAudioQueue.clearAllQueues();
    soundEngine.clearMahjongVoiceQueue();
    effectCoordinator.clearScene('laoyancai');
    effectCoordinator.clearScene('ddz');
    effectCoordinator.clearScene('mahjong');

    this.state = {
      ...this.state,
      isTrusteeship: false,
      switchTableSeq: this.state.switchTableSeq + 1,
      lastSwitchTimestamp: now,
    };
    this.emit();

    const targetGame = gameType || 'ddz';
    if (targetGame === 'mahjong') {
      socketClient.emit('c2s_mahjong_quick_match', { baseScore, mode: 'puer' });
    } else if (targetGame === 'niuniu') {
      socketClient.emit('c2s_niuniu_quick_match', {
        baseScore,
        playMode: 'qiangzhuang',
      });
    } else if (targetGame === 'zhajinhua') {
      socketClient.emit('c2s_zjh_quick_match', { baseScore, mode: 'classic' });
    } else if (targetGame === 'laoyancai') {
      socketClient.emit('c2s_lyc_quick_match', {
        baseScore,
        playMode: 'kunming',
      });
    } else {
      socketClient.emit('c2s_quick_match', {
        baseScore,
        autoFillBots: true,
        mode: 'classic',
      });
    }
  }
}

export const gameControlHub = new GameControlHub();

export function useGameControlState(): GameControlState {
  const [state, setState] = useState<GameControlState>(() =>
    gameControlHub.getState()
  );

  useEffect(() => {
    setState(gameControlHub.getState());
    return gameControlHub.subscribe(setState);
  }, []);

  return state;
}
