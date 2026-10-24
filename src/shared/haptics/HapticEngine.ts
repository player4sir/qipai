class HapticEngine {
  private enabled = true;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('h5_haptic_enabled');
        if (saved !== null) {
          this.enabled = saved === 'true';
        }
      } catch {
        // Ignore
      }
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
    try {
      localStorage.setItem('h5_haptic_enabled', String(val));
    } catch {
      // Ignore
    }
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  vibrate(pattern: number | number[]): void {
    if (this.enabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore
      }
    }
  }

  tap(): void {
    this.vibrate(10);
  }

  selectCard(): void {
    this.vibrate(8);
  }

  playCard(): void {
    this.vibrate([14, 20, 18]);
  }

  slideTick(): void {
    this.vibrate(5);
  }

  smartComboLock(): void {
    this.vibrate([10, 15, 12]);
  }

  sortShuffle(): void {
    this.vibrate([8, 12, 8]);
  }

  bombBlast(): void {
    this.vibrate([35, 30, 55, 25, 40]);
  }

  rocketBlast(): void {
    this.vibrate([50, 30, 80, 30, 60]);
  }

  urgentCountdown(): void {
    this.vibrate(16);
  }
}

export const hapticEngine = new HapticEngine();
