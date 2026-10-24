export enum EffectPriority {
  AMBIENT = 10,
  MAJOR = 20,
  CRITICAL = 30,
  ULTIMATE = 40,
}

export interface EffectTaskOptions {
  sceneId: string;
  type: string;
  channel?: string;
  label?: string;
  priority: EffectPriority;
  maskLevel?: 'none' | 'subtle' | 'light' | 'medium' | 'heavy' | string;
  useGlobalMask?: boolean;
  durationMs: number;
  preemptLowerPriority?: boolean;
  onStart: () => void | (() => void);
}

interface ActiveSceneEffect {
  options: EffectTaskOptions;
  timerId: number;
  cleanup?: () => void;
}

class EffectCoordinator {
  private queues: Map<string, EffectTaskOptions[]> = new Map();
  private activeByScene: Map<string, ActiveSceneEffect> = new Map();

  enqueue(options: EffectTaskOptions): void {
    const { sceneId, priority, preemptLowerPriority } = options;
    const current = this.activeByScene.get(sceneId);

    if (current) {
      if (preemptLowerPriority && priority > current.options.priority) {
        this.stopActive(sceneId);
      } else {
        const list = this.queues.get(sceneId) ?? [];
        list.push(options);
        list.sort((a, b) => b.priority - a.priority);
        this.queues.set(sceneId, list);
        return;
      }
    }

    this.runEffect(options);
  }

  private runEffect(options: EffectTaskOptions): void {
    const { sceneId, durationMs, onStart } = options;
    let cleanupFn: (() => void) | undefined;
    try {
      const res = onStart();
      if (typeof res === 'function') {
        cleanupFn = res;
      }
    } catch {
      // Ignore effect callback error
    }

    const timerId =
      typeof window !== 'undefined'
        ? window.setTimeout(() => {
            this.finishActive(sceneId);
          }, Math.max(100, durationMs))
        : (setTimeout(() => {
            this.finishActive(sceneId);
          }, Math.max(100, durationMs)) as unknown as number);

    this.activeByScene.set(sceneId, {
      options,
      timerId,
      cleanup: cleanupFn,
    });
  }

  private stopActive(sceneId: string): void {
    const current = this.activeByScene.get(sceneId);
    if (!current) return;
    if (typeof window !== 'undefined') {
      window.clearTimeout(current.timerId);
    } else {
      clearTimeout(current.timerId);
    }
    try {
      current.cleanup?.();
    } catch {
      // Ignore cleanup error
    }
    this.activeByScene.delete(sceneId);
  }

  private finishActive(sceneId: string): void {
    this.stopActive(sceneId);
    const list = this.queues.get(sceneId);
    if (list && list.length > 0) {
      const next = list.shift()!;
      this.runEffect(next);
    }
  }

  clearScene(sceneId: string): void {
    this.queues.delete(sceneId);
    this.stopActive(sceneId);
  }
}

export const effectCoordinator = new EffectCoordinator();
