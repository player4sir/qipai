/**
 * HapticEngine — Multi-level Tactile Vibration Engine for Mobile H5 Landscape Gameplay.
 * Uses the standard Web Vibration API (`navigator.vibrate`) with graceful fallback on unsupported devices.
 */
class HapticEngine {
  private enabled: boolean = true;
  private lastSlidePulseAt: number = 0;

  constructor() {
    try {
      const saved = localStorage.getItem('ddz_haptic_enabled');
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch {
      this.enabled = true;
    }
  }

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem('ddz_haptic_enabled', String(this.enabled));
    } catch {
      // ignore storage errors
    }
    if (this.enabled) {
      this.vibrate(12);
    }
    return this.enabled;
  }

  private vibrate(pattern: number | number[]): void {
    if (!this.enabled || !this.isSupported()) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration permission errors on restricted webviews
    }
  }

  /** Crisp 8ms micro-tap when selecting/deselecting a card or UI button */
  public tap(): void {
    this.vibrate(8);
  }

  /** Alias for tap() used when selecting cards or lobby buttons */
  public selectCard(): void {
    this.tap();
  }

  /** Throttled 6ms tick when sliding across cards in a marquee drag */
  public slideTick(): void {
    const now = performance.now();
    if (now - this.lastSlidePulseAt < 42) return;
    this.lastSlidePulseAt = now;
    this.vibrate(6);
  }

  /** Alias for slideTick() */
  public slideCard(): void {
    this.slideTick();
  }

  /** Distinct double-pulse when smart combo extraction locks onto a Straight/Airplane */
  public smartComboLock(): void {
    this.vibrate([10, 22, 16]);
  }

  /** Crisp shuffle pulse when switching hand sort mode (Rank vs Count) */
  public sortShuffle(): void {
    this.vibrate([10, 18, 12]);
  }

  /** Alias for sortShuffle() */
  public sortCards(): void {
    this.sortShuffle();
  }

  /** Solid 18ms thud when playing normal cards onto the table */
  public playCard(): void {
    this.vibrate(18);
  }

  /** Alias for playCard() */
  public playCards(): void {
    this.playCard();
  }

  /** Heavy multi-stage blast vibration for Soft Bomb / Hard Bomb / Pure Laizi Bomb */
  public bombBlast(): void {
    this.vibrate([40, 30, 80]);
  }

  /** Alias for bombBlast() */
  public bomb(): void {
    this.bombBlast();
  }

  /** Full-throttle Dragon Missile rumble for Rocket (王炸) */
  public rocketBlast(): void {
    this.vibrate([60, 40, 120, 40, 160]);
  }

  /** Alias for rocketBlast() */
  public rocket(): void {
    this.rocketBlast();
  }

  /** Urgent countdown heartbeat when <= 3 seconds remain */
  public urgentCountdown(): void {
    this.vibrate([14, 30, 14]);
  }

  /** Alias for urgentCountdown() */
  public countdownTick(): void {
    this.urgentCountdown();
  }
}

export const hapticEngine = new HapticEngine();
