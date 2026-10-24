import { useEffect, useState } from 'react';

/**
 * 视觉特效优先级枚举：数值越高优先级越高
 */
export enum EffectPriority {
  /** 轻量环境/互动道具特效（如鲜花、敬茶、元宝抛物线） */
  AMBIENT = 20,
  /** 常规牌型动作提示（如麻将吃/碰） */
  NORMAL = 40,
  /** 中高阶牌型特效（如斗地主顺子/连对流光、飞机掠过、麻将杠牌刮风下雨） */
  MAJOR = 60,
  /** 核心重磅牌型特效（如斗地主炸弹炸开、麻将胡牌、捞腌菜三公） */
  CRITICAL = 80,
  /** 终极全屏仪式特效（如斗地主王炸、春天/反春、麻将自摸/天胡、捞腌菜豹子） */
  ULTIMATE = 100,
}

/**
 * 遮罩层级定义：避免多个半透明黑底叠加造成画面死黑
 */
export type EffectMaskLevel = 'none' | 'subtle' | 'medium' | 'heavy';

/**
 * 特效通道类型：
 * - `ceremony`: 牌桌主舞台互斥队列通道（炸弹、王炸、胡牌、自摸、三公/豹子等按优先级排队播放）
 * - `ambient`: 轻量并发通道（如互动道具抛物线，受并发上限与重型主特效压制控制）
 */
export type EffectChannel = 'ceremony' | 'ambient';

export interface EffectMaskConfig {
  level: EffectMaskLevel;
  opacity: number;
  blurPx: number;
  tintColor: string;
  zIndex: number;
}

export interface EffectTaskOptions {
  /** 特效唯一标识（若不传则自动生成） */
  id?: string;
  /** 所属游戏场景标识，如 'ddz' | 'mahjong' | 'laoyancai' | 'niuniu' | 'zhajinhua' */
  sceneId: string;
  /** 特效分类名称，如 'ddz_bomb' | 'mj_hu' | 'lyc_baozi' */
  type: string;
  /** 特效显示标题（用于调试或中心横幅辅助） */
  label?: string;
  /** 渲染优先级 */
  priority: EffectPriority;
  /** 调度通道，默认 'ceremony' */
  channel?: EffectChannel;
  /** 遮罩等级，默认根据优先级自动推导 */
  maskLevel?: EffectMaskLevel;
  /** 是否由全局 HUD 渲染统一背景遮罩（对于未自带背景遮罩的特效可开启） */
  useGlobalMask?: boolean;
  /** 预计持续时长（毫秒），超时后自动释放队列锁 */
  durationMs: number;
  /** 去重键：若队列中已存在相同 dedupeKey 的待执行任务则合并跳过 */
  dedupeKey?: string;
  /** 若当前正在播放低优先级特效，是否允许抢占中断低优先级特效 */
  preemptLowerPriority?: boolean;
  /** 特效正式开始渲染时的回调（可返回清理函数） */
  onStart?: () => void | (() => void);
  /** 特效正常结束或被抢占清理时的回调 */
  onComplete?: (reason: 'finished' | 'preempted' | 'scene_cleared') => void;
}

export interface ActiveEffectDescriptor {
  id: string;
  sceneId: string;
  type: string;
  label?: string;
  priority: EffectPriority;
  channel: EffectChannel;
  maskLevel: EffectMaskLevel;
  useGlobalMask: boolean;
  startedAt: number;
  durationMs: number;
}

export interface EffectCoordinatorSnapshot {
  activeSceneId: string;
  activeCeremony: ActiveEffectDescriptor | null;
  activeAmbients: ActiveEffectDescriptor[];
  queuedCount: number;
  maskConfig: EffectMaskConfig;
}

interface InternalEffectTask extends Required<
  Pick<
    EffectTaskOptions,
    'id' | 'sceneId' | 'type' | 'priority' | 'channel' | 'maskLevel' | 'useGlobalMask' | 'durationMs'
  >
> {
  label?: string;
  dedupeKey?: string;
  preemptLowerPriority: boolean;
  enqueuedAt: number;
  onStart?: () => void | (() => void);
  onComplete?: (reason: 'finished' | 'preempted' | 'scene_cleared') => void;
  cleanupFn?: (() => void) | void;
  timerId?: ReturnType<typeof setTimeout>;
}

const MASK_PRESETS: Record<EffectMaskLevel, EffectMaskConfig> = {
  none: {
    level: 'none',
    opacity: 0,
    blurPx: 0,
    tintColor: 'rgba(2, 6, 23, 0)',
    zIndex: 40,
  },
  subtle: {
    level: 'subtle',
    opacity: 0.22,
    blurPx: 0,
    tintColor: 'rgba(2, 6, 23, 0.22)',
    zIndex: 45,
  },
  medium: {
    level: 'medium',
    opacity: 0.42,
    blurPx: 1,
    tintColor: 'rgba(2, 6, 23, 0.42)',
    zIndex: 55,
  },
  heavy: {
    level: 'heavy',
    opacity: 0.62,
    blurPx: 2,
    tintColor: 'rgba(2, 6, 23, 0.62)',
    zIndex: 65,
  },
};

const MAX_CEREMONY_QUEUE_SIZE = 6;
const MAX_CONCURRENT_AMBIENT = 3;

/**
 * 统一特效调度器 (`EffectCoordinator`)
 * 负责管理全游戏场景（斗地主、麻将、捞腌菜、牛牛、诈金花）中重型视觉特效的：
 * 1. 优先级队列排序与抢占（如王炸/胡牌/自摸抢占普通吃碰或顺子流光）
 * 2. 跨场景生命周期隔离（切换房间或子大厅时自动销毁残留特效与定时器）
 * 3. 全局遮罩层级仲裁（防止多层重型特效同时叠加半透明黑幕导致画面死黑）
 */
export class EffectCoordinator {
  private activeSceneId: string = 'hall';
  private ceremonyQueue: InternalEffectTask[] = [];
  private activeCeremony: InternalEffectTask | null = null;
  private activeAmbients: Map<string, InternalEffectTask> = new Map();
  private listeners: Set<(snapshot: EffectCoordinatorSnapshot) => void> = new Set();
  private seq: number = 0;

  /**
   * 切换当前活跃场景；若场景变化则立即清理旧场景尚未完成的特效队列与定时器
   */
  setActiveScene(sceneId: string | null | undefined): void {
    const normalized = sceneId || 'hall';
    if (this.activeSceneId === normalized) return;
    const prevScene = this.activeSceneId;
    this.activeSceneId = normalized;
    this.clearScene(prevScene);
    this.emitChange();
  }

  getActiveScene(): string {
    return this.activeSceneId;
  }

  /**
   * 清理指定场景（或全部场景）的排队与正在播放特效，释放视觉与定时器资源
   */
  clearScene(sceneId?: string): void {
    // 1. 清理待执行队列
    const remainingQueue: InternalEffectTask[] = [];
    for (const task of this.ceremonyQueue) {
      if (!sceneId || task.sceneId === sceneId) {
        this.safeInvokeComplete(task, 'scene_cleared');
      } else {
        remainingQueue.push(task);
      }
    }
    this.ceremonyQueue = remainingQueue;

    // 2. 清理当前主舞台特效
    if (this.activeCeremony && (!sceneId || this.activeCeremony.sceneId === sceneId)) {
      this.terminateActiveCeremony('scene_cleared');
    }

    // 3. 清理并发环境/道具特效
    for (const [id, ambient] of this.activeAmbients.entries()) {
      if (!sceneId || ambient.sceneId === sceneId) {
        if (ambient.timerId) clearTimeout(ambient.timerId);
        this.safeInvokeCleanup(ambient);
        this.safeInvokeComplete(ambient, 'scene_cleared');
        this.activeAmbients.delete(id);
      }
    }

    this.emitChange();
  }

  /**
   * 将特效任务提交至统一调度器
   * @returns 特效任务 ID，可用于提前手动调用 `completeEffect(id)`
   */
  enqueue(options: EffectTaskOptions): string {
    const id = options.id || `fx_${++this.seq}_${Date.now()}`;
    const channel: EffectChannel = options.channel ?? 'ceremony';
    const maskLevel: EffectMaskLevel =
      options.maskLevel ?? this.inferMaskLevel(options.priority, channel);
    const preemptLowerPriority =
      options.preemptLowerPriority ?? options.priority >= EffectPriority.CRITICAL;

    // 自动同步当前活跃场景
    if (options.sceneId && this.activeSceneId !== options.sceneId) {
      this.setActiveScene(options.sceneId);
    }

    const task: InternalEffectTask = {
      id,
      sceneId: options.sceneId,
      type: options.type,
      label: options.label,
      priority: options.priority,
      channel,
      maskLevel,
      useGlobalMask: Boolean(options.useGlobalMask),
      durationMs: Math.max(120, options.durationMs),
      dedupeKey: options.dedupeKey,
      preemptLowerPriority,
      enqueuedAt: Date.now(),
      onStart: options.onStart,
      onComplete: options.onComplete,
    };

    if (channel === 'ambient') {
      this.scheduleAmbientTask(task);
      return id;
    }

    // 主舞台特效去重检查：若队列中已有相同 dedupeKey，跳过重复入队
    if (
      task.dedupeKey &&
      (this.activeCeremony?.dedupeKey === task.dedupeKey ||
        this.ceremonyQueue.some((q) => q.dedupeKey === task.dedupeKey))
    ) {
      return id;
    }

    // 若当前正在播放低优先级主舞台特效，且新任务具备抢占权，则立即中断当前低优特效
    if (
      this.activeCeremony &&
      task.preemptLowerPriority &&
      task.priority > this.activeCeremony.priority
    ) {
      this.terminateActiveCeremony('preempted');
    }

    // 插入优先级队列：按 priority 降序，同优先级按入队时间升序
    this.ceremonyQueue.push(task);
    this.ceremonyQueue.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    // 限制最大队列长度，淘汰队尾最低优先级任务，避免极端高频操作造成特效积压
    while (this.ceremonyQueue.length > MAX_CEREMONY_QUEUE_SIZE) {
      const dropped = this.ceremonyQueue.pop();
      if (dropped) {
        this.safeInvokeComplete(dropped, 'preempted');
      }
    }

    this.pumpCeremonyQueue();
    return id;
  }

  /**
   * 主动标记某个特效播放完毕并推进队列
   */
  completeEffect(id: string): void {
    if (this.activeCeremony && this.activeCeremony.id === id) {
      this.terminateActiveCeremony('finished');
      this.pumpCeremonyQueue();
      return;
    }

    const ambient = this.activeAmbients.get(id);
    if (ambient) {
      if (ambient.timerId) clearTimeout(ambient.timerId);
      this.safeInvokeCleanup(ambient);
      this.safeInvokeComplete(ambient, 'finished');
      this.activeAmbients.delete(id);
      this.emitChange();
      return;
    }

    const qIdx = this.ceremonyQueue.findIndex((t) => t.id === id);
    if (qIdx !== -1) {
      const [removed] = this.ceremonyQueue.splice(qIdx, 1);
      this.safeInvokeComplete(removed, 'finished');
      this.emitChange();
    }
  }

  /**
   * 获取当前调度器快照（含激活特效与统一遮罩配置）
   */
  getSnapshot(): EffectCoordinatorSnapshot {
    const activeCeremonyDesc: ActiveEffectDescriptor | null = this.activeCeremony
      ? {
          id: this.activeCeremony.id,
          sceneId: this.activeCeremony.sceneId,
          type: this.activeCeremony.type,
          label: this.activeCeremony.label,
          priority: this.activeCeremony.priority,
          channel: this.activeCeremony.channel,
          maskLevel: this.activeCeremony.maskLevel,
          useGlobalMask: this.activeCeremony.useGlobalMask,
          startedAt: this.activeCeremony.enqueuedAt,
          durationMs: this.activeCeremony.durationMs,
        }
      : null;

    const activeAmbientsDesc: ActiveEffectDescriptor[] = Array.from(
      this.activeAmbients.values()
    ).map((a) => ({
      id: a.id,
      sceneId: a.sceneId,
      type: a.type,
      label: a.label,
      priority: a.priority,
      channel: a.channel,
      maskLevel: a.maskLevel,
      useGlobalMask: a.useGlobalMask,
      startedAt: a.enqueuedAt,
      durationMs: a.durationMs,
    }));

    const effectiveMaskLevel: EffectMaskLevel =
      this.activeCeremony && this.activeCeremony.useGlobalMask
        ? this.activeCeremony.maskLevel
        : 'none';

    return {
      activeSceneId: this.activeSceneId,
      activeCeremony: activeCeremonyDesc,
      activeAmbients: activeAmbientsDesc,
      queuedCount: this.ceremonyQueue.length,
      maskConfig: MASK_PRESETS[effectiveMaskLevel],
    };
  }

  /**
   * 订阅调度器状态变更
   */
  subscribe(listener: (snapshot: EffectCoordinatorSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private scheduleAmbientTask(task: InternalEffectTask): void {
    // 若当前存在 ULTIMATE 终极全屏仪式特效（如王炸/自摸/豹子），暂缓或抑制过多的并发互动道具以防遮挡主视觉
    if (
      this.activeCeremony &&
      this.activeCeremony.priority >= EffectPriority.ULTIMATE &&
      this.activeAmbients.size >= 1
    ) {
      this.safeInvokeComplete(task, 'preempted');
      return;
    }

    // 并发上限控制：若超过上限则淘汰最早的一个环境特效
    if (this.activeAmbients.size >= MAX_CONCURRENT_AMBIENT) {
      const oldestKey = this.activeAmbients.keys().next().value;
      if (oldestKey) {
        const oldest = this.activeAmbients.get(oldestKey)!;
        if (oldest.timerId) clearTimeout(oldest.timerId);
        this.safeInvokeCleanup(oldest);
        this.safeInvokeComplete(oldest, 'preempted');
        this.activeAmbients.delete(oldestKey);
      }
    }

    try {
      task.cleanupFn = task.onStart?.();
    } catch (err) {
      console.warn('[EffectCoordinator] Ambient onStart error:', err);
    }

    task.timerId = setTimeout(() => {
      this.completeEffect(task.id);
    }, task.durationMs);

    this.activeAmbients.set(task.id, task);
    this.emitChange();
  }

  private pumpCeremonyQueue(): void {
    if (this.activeCeremony || this.ceremonyQueue.length === 0) {
      this.emitChange();
      return;
    }

    const nextTask = this.ceremonyQueue.shift()!;
    this.activeCeremony = nextTask;

    try {
      nextTask.cleanupFn = nextTask.onStart?.();
    } catch (err) {
      console.warn('[EffectCoordinator] Ceremony onStart error:', err);
    }

    nextTask.timerId = setTimeout(() => {
      if (this.activeCeremony?.id === nextTask.id) {
        this.terminateActiveCeremony('finished');
        this.pumpCeremonyQueue();
      }
    }, nextTask.durationMs);

    this.emitChange();
  }

  private terminateActiveCeremony(reason: 'finished' | 'preempted' | 'scene_cleared'): void {
    const current = this.activeCeremony;
    if (!current) return;
    this.activeCeremony = null;
    if (current.timerId) clearTimeout(current.timerId);
    this.safeInvokeCleanup(current);
    this.safeInvokeComplete(current, reason);
  }

  private safeInvokeCleanup(task: InternalEffectTask): void {
    if (typeof task.cleanupFn === 'function') {
      try {
        task.cleanupFn();
      } catch (err) {
        console.warn('[EffectCoordinator] Cleanup error:', err);
      }
      task.cleanupFn = undefined;
    }
  }

  private safeInvokeComplete(
    task: InternalEffectTask,
    reason: 'finished' | 'preempted' | 'scene_cleared'
  ): void {
    if (typeof task.onComplete === 'function') {
      try {
        task.onComplete(reason);
      } catch (err) {
        console.warn('[EffectCoordinator] onComplete error:', err);
      }
    }
  }

  private inferMaskLevel(priority: EffectPriority, channel: EffectChannel): EffectMaskLevel {
    if (channel === 'ambient') return 'none';
    if (priority >= EffectPriority.ULTIMATE) return 'heavy';
    if (priority >= EffectPriority.CRITICAL) return 'medium';
    if (priority >= EffectPriority.MAJOR) return 'subtle';
    return 'none';
  }

  private emitChange(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }
}

export const effectCoordinator = new EffectCoordinator();

/**
 * React Hook：订阅统一特效调度器状态与全局遮罩配置
 */
export function useEffectCoordinator(): EffectCoordinatorSnapshot {
  const [snapshot, setSnapshot] = useState<EffectCoordinatorSnapshot>(() =>
    effectCoordinator.getSnapshot()
  );

  useEffect(() => {
    return effectCoordinator.subscribe(setSnapshot);
  }, []);

  return snapshot;
}
