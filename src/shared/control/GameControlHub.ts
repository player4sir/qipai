import { useEffect, useState } from 'react';

export interface GameControlState {
  isTrusteeship: boolean;
  autoNextRound: boolean;
  paceSpeed: 1 | 1.25 | 1.5;
  lastSwitchTimestamp: number;
}

type Listener = (state: GameControlState) => void;

class GameControlHub {
  private state: GameControlState = {
    isTrusteeship: false,
    autoNextRound: false,
    paceSpeed: 1,
    lastSwitchTimestamp: 0,
  };

  private listeners = new Set<Listener>();

  public getState(): GameControlState {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = { ...this.state };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  public setTrusteeship(enabled: boolean): void {
    if (this.state.isTrusteeship === enabled) return;
    this.state = {
      ...this.state,
      isTrusteeship: enabled,
      lastSwitchTimestamp: Date.now(),
    };
    this.emit();
  }

  public toggleTrusteeship(): boolean {
    const next = !this.state.isTrusteeship;
    this.setTrusteeship(next);
    return next;
  }

  public setAutoNextRound(enabled: boolean): void {
    if (this.state.autoNextRound === enabled) return;
    this.state = {
      ...this.state,
      autoNextRound: enabled,
    };
    this.emit();
  }

  public setPaceSpeed(speed: 1 | 1.25 | 1.5): void {
    this.state = {
      ...this.state,
      paceSpeed: speed,
    };
    this.emit();
  }

  public scaleDelay(ms: number): number {
    return Math.max(80, Math.round(ms / this.state.paceSpeed));
  }

  public resetTableScopedState(): void {
    this.state = {
      ...this.state,
      isTrusteeship: false,
      lastSwitchTimestamp: Date.now(),
    };
    this.emit();
  }
}

export const gameControlHub = new GameControlHub();

export function useGameControlState(): GameControlState {
  const [state, setState] = useState<GameControlState>(() => gameControlHub.getState());

  useEffect(() => {
    return gameControlHub.subscribe(setState);
  }, []);

  return state;
}
