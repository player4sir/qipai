import { computeRelativeSeatPan, soundEngine } from './SoundEngine';

export type AudioQueueChannel = 'deal' | 'chip' | 'lightning' | 'reveal' | 'voice';

export interface QueuedSfxTask {
  id: number;
  channel: Exclude<AudioQueueChannel, 'voice'>;
  priority: number;
  delayMs: number;
  pan: number; // -1.0 (left) .. 0 (center) .. +1.0 (right)
  duckBgm?: boolean;
  execute: (ctx: AudioContext, pan: number) => void;
}

/**
 * 5人环形牌桌座位立体声声像映射 (Seat 0 为底部主视角居中，1左、2左上、3右上、4右)
 */
export function seatIndexToStereoPan(seatIndex?: number, selfSeatIndex = 0): number {
  return computeRelativeSeatPan(seatIndex, selfSeatIndex, 5);
}

/**
 * 商业化棋牌 WebAudio 队列管理器
 * 与全局 SoundEngine 的三总线混音矩阵（BGM / SFX / Voice Bus + DynamicsCompressor）无缝联通，
 * 负责发牌序列、筹码碰撞、比牌闪电以及牛数/牌型语音报牌的低延迟解码、3D 立体声定位、BGM 自动闪避与防重叠优先级调度
 */
export class WebAudioQueueManager {
  private sfxQueue: QueuedSfxTask[] = [];
  private sfxProcessing = false;
  private lastChannelTimestamp: Record<string, number> = {};
  private activeTimers = new Set<number>();
  private taskIdSeq = 1;

  private ensureContext(): AudioContext | null {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return null;
    return soundEngine.getCtx();
  }

  /**
   * 预加载并解码指定游戏的 WAV 音频资产至全局共享的 WebAudio AudioBuffer 内存缓存池
   */
  preloadGameAssets(game: 'niuniu' | 'zjh' | 'all' = 'all'): void {
    soundEngine.preloadNiuniuAudio();
    soundEngine.preloadZjhAudio();

    if (typeof window === 'undefined') return;
    const urls: string[] = ['/assets/audio/ddz/Special_Dispatch_2D.wav'];

    if (game === 'niuniu' || game === 'all') {
      urls.push(
        '/assets/audio/niuniu/chip_bet.wav',
        '/assets/audio/niuniu/banker_tick.wav',
        '/assets/audio/niuniu/banker_lock.wav',
        '/assets/audio/niuniu/card_reveal.wav',
        '/assets/audio/niuniu/high_niu_fanfare.wav'
      );
    }
    if (game === 'zjh' || game === 'all') {
      urls.push(
        '/assets/audio/zjh/chip_toss.wav',
        '/assets/audio/zjh/chip_allin.wav',
        '/assets/audio/zjh/card_peek.wav',
        '/assets/audio/zjh/vs_lightning.wav',
        '/assets/audio/zjh/fold_slide.wav'
      );
    }

    for (const url of urls) {
      void soundEngine.loadAudioBuffer(url);
    }
  }

  /**
   * 清理当前排队的音效定时器与语音队列（离开牌桌时调用）
   */
  clearAllQueues(): void {
    this.sfxQueue = [];
    this.sfxProcessing = false;
    this.activeTimers.forEach((id) => window.clearTimeout(id));
    this.activeTimers.clear();
    soundEngine.clearLaoYanCaiAudioQueue();
  }

  /**
   * 内部调度器：通过 SoundEngine 的 SFX Bus 播放已解码的 AudioBuffer（支持 3D 立体声摇摄、微调音高与音量）
   */
  private playDecodedOrFallback(
    ctx: AudioContext,
    url: string,
    options: { volume?: number; playbackRate?: number; pan?: number; duckBgm?: boolean } = {}
  ): void {
    if (!soundEngine.isEnabled() || soundEngine.getSfxVolume() <= 0) return;
    const volume = options.volume ?? 0.85;
    const playbackRate = options.playbackRate ?? 1.0;
    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));

    if (options.duckBgm) {
      soundEngine.triggerBgmDucking(1150);
    }

    const buffer = soundEngine.getCachedBuffer(url);
    if (buffer) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);

        this.connectWithPan(ctx, source, gainNode, pan);
        source.start(0);
        return;
      } catch {
        // Fall through to SoundEngine playback
      }
    }

    soundEngine.playAudioFile(url, volume, {
      bus: 'sfx',
      pan,
      playbackRate,
      duckBgm: options.duckBgm,
    });
  }

  /**
   * 将音效任务压入 WebAudio 队列并按通道最小防抖间隔顺序执行
   */
  private enqueueSfx(task: Omit<QueuedSfxTask, 'id'>): void {
    if (
      !soundEngine.isEnabled() ||
      soundEngine.getSfxVolume() <= 0 ||
      typeof window === 'undefined'
    ) {
      return;
    }
    this.sfxQueue.push({
      ...task,
      id: this.taskIdSeq++,
    });
    this.sfxQueue.sort((a, b) => b.priority - a.priority || a.id - b.id);
    if (!this.sfxProcessing) {
      this.processNextSfx();
    }
  }

  private processNextSfx(): void {
    if (
      !soundEngine.isEnabled() ||
      soundEngine.getSfxVolume() <= 0 ||
      this.sfxQueue.length === 0 ||
      typeof window === 'undefined'
    ) {
      this.sfxProcessing = false;
      return;
    }

    this.sfxProcessing = true;
    const task = this.sfxQueue.shift()!;
    const now = performance.now();
    const minChannelGap: Record<Exclude<AudioQueueChannel, 'voice'>, number> = {
      deal: 38,
      chip: 45,
      lightning: 140,
      reveal: 95,
    };

    const lastTime = this.lastChannelTimestamp[task.channel] ?? 0;
    const elapsed = now - lastTime;
    const waitMs = Math.max(task.delayMs, Math.max(0, minChannelGap[task.channel] - elapsed));

    const timerId = window.setTimeout(() => {
      this.activeTimers.delete(timerId);
      const ctx = this.ensureContext();
      if (ctx && soundEngine.isEnabled() && soundEngine.getSfxVolume() > 0) {
        if (task.duckBgm || task.priority >= 25) {
          soundEngine.triggerBgmDucking(1100);
        }
        this.lastChannelTimestamp[task.channel] = performance.now();
        task.execute(ctx, task.pan);
      }
      this.processNextSfx();
    }, waitMs);

    this.activeTimers.add(timerId);
  }

  /**
   * 1. 发牌动作触发：级联发牌声学队列 (Deal Cascade)
   * 支持多张手牌按时间步进依次入列，并伴随音高递增与座位声像平移
   */
  enqueueDealCascade(
    cardCount = 4,
    intervalMs = 60,
    seatIndex?: number,
    selfSeatIndex = 0
  ): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const clampedCount = Math.max(1, Math.min(8, cardCount));
    const basePan = seatIndexToStereoPan(seatIndex, selfSeatIndex);

    for (let i = 0; i < clampedCount; i++) {
      const stepIndex = i;
      const pan =
        seatIndex !== undefined
          ? basePan
          : Math.sin((stepIndex / Math.max(1, clampedCount - 1)) * Math.PI - Math.PI / 2) * 0.45;

      const timerId = window.setTimeout(() => {
        this.activeTimers.delete(timerId);
        this.enqueueSfx({
          channel: 'deal',
          priority: 18,
          delayMs: 0,
          pan,
          execute: (ctx, p) => {
            const rate = 0.96 + stepIndex * 0.032;
            if (stepIndex === 0) {
              this.playDecodedOrFallback(ctx, '/assets/audio/ddz/Special_Dispatch_2D.wav', {
                volume: 0.72,
                playbackRate: rate,
                pan: p,
              });
            }
            this.synthesizeCardSlideSnap(ctx, rate, p);
          },
        });
      }, stepIndex * intervalMs);

      this.activeTimers.add(timerId);
    }
  }

  /**
   * 2. 筹码动作触发：多枚筹码抛掷与陶瓷/金属碰撞声学队列 (Chip Collision)
   */
  enqueueChipCollision(params: {
    count?: number;
    intensity?: 'normal' | 'high' | 'allin';
    seatIndex?: number;
    selfSeatIndex?: number;
    game?: 'niuniu' | 'zjh';
    voiceLabel?: string;
  }): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const {
      count = 2,
      intensity = 'normal',
      seatIndex,
      selfSeatIndex = 0,
      game = 'niuniu',
      voiceLabel,
    } = params;

    const pan = seatIndexToStereoPan(seatIndex, selfSeatIndex);
    const chipClinks =
      intensity === 'allin'
        ? 5
        : intensity === 'high'
        ? Math.max(3, count)
        : Math.max(1, Math.min(4, count));

    const sampleUrl =
      intensity === 'allin'
        ? '/assets/audio/zjh/chip_allin.wav'
        : game === 'zjh'
        ? '/assets/audio/zjh/chip_toss.wav'
        : '/assets/audio/niuniu/chip_bet.wav';

    for (let i = 0; i < chipClinks; i++) {
      const idx = i;
      const timerId = window.setTimeout(() => {
        this.activeTimers.delete(timerId);
        this.enqueueSfx({
          channel: 'chip',
          priority: intensity === 'allin' ? 26 : 16,
          delayMs: 0,
          pan,
          duckBgm: intensity === 'allin',
          execute: (ctx, p) => {
            const rate = 0.94 + idx * 0.045 + (Math.random() - 0.5) * 0.04;
            if (idx === 0 || (intensity === 'allin' && idx === 2)) {
              this.playDecodedOrFallback(ctx, sampleUrl, {
                volume: intensity === 'allin' ? 0.92 : 0.82,
                playbackRate: rate,
                pan: p,
                duckBgm: intensity === 'allin',
              });
            }
            this.synthesizeChipCollisionChime(ctx, rate, p, intensity);
          },
        });
      }, idx * 48);

      this.activeTimers.add(timerId);
    }

    if (voiceLabel) {
      this.enqueueVoice({
        text: voiceLabel,
        priority: intensity === 'allin' ? 28 : 14,
        replaceLower: intensity !== 'allin',
      });
    }
  }

  /**
   * 3. 比牌闪电动作触发：高压电弧噼啪声 + 低频雷鸣冲击队列 + BGM 自动闪避 (Compare Lightning)
   */
  enqueueCompareLightning(params?: {
    fromSeat?: number;
    toSeat?: number;
    selfSeatIndex?: number;
    announceVoice?: boolean;
  }): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const fromPan = seatIndexToStereoPan(params?.fromSeat, params?.selfSeatIndex ?? 0);
    const toPan = seatIndexToStereoPan(params?.toSeat, params?.selfSeatIndex ?? 0);
    const centerPan = Number(((fromPan + toPan) / 2).toFixed(2));

    this.enqueueSfx({
      channel: 'lightning',
      priority: 30,
      delayMs: 0,
      pan: centerPan,
      duckBgm: true,
      execute: (ctx, p) => {
        this.playDecodedOrFallback(ctx, '/assets/audio/zjh/vs_lightning.wav', {
          volume: 0.94,
          playbackRate: 1.0,
          pan: p,
          duckBgm: true,
        });
        this.synthesizeLightningArc(ctx, fromPan, toPan);
      },
    });

    if (params?.announceVoice) {
      this.enqueueVoice({
        text: '闪电比牌',
        priority: 25,
        replaceLower: false,
      });
    }
  }

  /**
   * 4. 抢庄牛牛：动作触发的亮牌音效与牛数报牌队列 (Niu Hand Reveal & Callout)
   */
  enqueueNiuAnnouncement(params: {
    level: number;
    handName: string;
    multiplier?: number;
    seatIndex?: number;
    selfSeatIndex?: number;
    isSelf?: boolean;
  }): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const {
      level,
      handName,
      multiplier,
      seatIndex,
      selfSeatIndex = 0,
      isSelf = false,
    } = params;

    const pan = seatIndexToStereoPan(seatIndex, selfSeatIndex);
    const isHighNiu = level >= 10;
    const sampleUrl = isHighNiu
      ? '/assets/audio/niuniu/high_niu_fanfare.wav'
      : '/assets/audio/niuniu/card_reveal.wav';

    this.enqueueSfx({
      channel: 'reveal',
      priority: isSelf ? 24 : 19,
      delayMs: 0,
      pan,
      duckBgm: isHighNiu,
      execute: (ctx, p) => {
        this.playDecodedOrFallback(ctx, sampleUrl, {
          volume: isHighNiu ? 0.92 : 0.82,
          playbackRate: level === 0 ? 0.92 : Math.min(1.18, 0.96 + level * 0.012),
          pan: p,
          duckBgm: isHighNiu,
        });
        this.synthesizeNiuHarmonicBell(ctx, level, p);
      },
    });

    const spokenText =
      level >= 10 && multiplier && multiplier > 1
        ? `${handName}，${multiplier}倍`
        : handName;

    this.enqueueVoice({
      text: spokenText,
      priority: isSelf ? 26 : isHighNiu ? 22 : 16,
      replaceLower: !isSelf && level < 10,
      pitch: isHighNiu ? 1.12 : level === 0 ? 0.94 : 1.04,
      rate: isHighNiu ? 1.15 : 1.2,
    });
  }

  /**
   * 5. 抢庄牛牛：叫庄/抢庄与定庄锁定声学触发
   */
  enqueueBankerAction(params: {
    type: 'call' | 'lock';
    multiplier?: number;
    seatIndex?: number;
    selfSeatIndex?: number;
    announceVoice?: boolean;
  }): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const pan = seatIndexToStereoPan(params.seatIndex, params.selfSeatIndex ?? 0);
    const url =
      params.type === 'lock'
        ? '/assets/audio/niuniu/banker_lock.wav'
        : '/assets/audio/niuniu/banker_tick.wav';

    this.enqueueSfx({
      channel: 'reveal',
      priority: params.type === 'lock' ? 25 : 15,
      delayMs: 0,
      pan,
      duckBgm: params.type === 'lock',
      execute: (ctx, p) => {
        const mult = params.multiplier ?? 1;
        this.playDecodedOrFallback(ctx, url, {
          volume: params.type === 'lock' ? 0.9 : 0.8,
          playbackRate: params.type === 'lock' ? 1.0 : 0.95 + Math.max(0, mult) * 0.04,
          pan: p,
          duckBgm: params.type === 'lock',
        });
      },
    });

    if (params.announceVoice && params.type === 'call' && params.multiplier !== undefined) {
      const label = params.multiplier <= 0 ? '不抢' : `抢${params.multiplier}倍`;
      this.enqueueVoice({
        text: label,
        priority: 15,
        replaceLower: true,
      });
    }
  }

  /**
   * 6. 炸金花：看牌/闷牌/跟注/加注/弃牌/全押综合动作触发队列
   */
  enqueueZjhAction(params: {
    action: 'look' | 'call' | 'blind' | 'raise' | 'compare' | 'fold' | 'allin';
    seatIndex?: number;
    selfSeatIndex?: number;
    handLabel?: string;
    isSelf?: boolean;
  }): void {
    if (!soundEngine.isEnabled() || typeof window === 'undefined') return;
    const { action, seatIndex, selfSeatIndex = 0, handLabel, isSelf = false } = params;
    const pan = seatIndexToStereoPan(seatIndex, selfSeatIndex);

    switch (action) {
      case 'look':
        this.enqueueSfx({
          channel: 'reveal',
          priority: 17,
          delayMs: 0,
          pan,
          execute: (ctx, p) => {
            this.playDecodedOrFallback(ctx, '/assets/audio/zjh/card_peek.wav', {
              volume: 0.85,
              playbackRate: 1.02,
              pan: p,
            });
          },
        });
        if (isSelf || handLabel) {
          this.enqueueVoice({
            text: isSelf && handLabel ? `看牌，${handLabel}` : '看牌',
            priority: isSelf ? 20 : 13,
            replaceLower: true,
          });
        }
        break;

      case 'blind':
        this.enqueueChipCollision({
          count: 1,
          intensity: 'normal',
          seatIndex,
          selfSeatIndex,
          game: 'zjh',
          voiceLabel: isSelf ? '闷牌' : undefined,
        });
        break;

      case 'call':
        this.enqueueChipCollision({
          count: 2,
          intensity: 'normal',
          seatIndex,
          selfSeatIndex,
          game: 'zjh',
          voiceLabel: isSelf ? '跟注' : undefined,
        });
        break;

      case 'raise':
        this.enqueueChipCollision({
          count: 3,
          intensity: 'high',
          seatIndex,
          selfSeatIndex,
          game: 'zjh',
          voiceLabel: '加注',
        });
        break;

      case 'allin':
        this.enqueueChipCollision({
          count: 5,
          intensity: 'allin',
          seatIndex,
          selfSeatIndex,
          game: 'zjh',
          voiceLabel: '全押',
        });
        break;

      case 'compare':
        this.enqueueCompareLightning({
          fromSeat: seatIndex,
          selfSeatIndex,
          announceVoice: true,
        });
        break;

      case 'fold':
        this.enqueueSfx({
          channel: 'deal',
          priority: 14,
          delayMs: 0,
          pan,
          execute: (ctx, p) => {
            this.playDecodedOrFallback(ctx, '/assets/audio/zjh/fold_slide.wav', {
              volume: 0.78,
              playbackRate: 0.98,
              pan: p,
            });
          },
        });
        if (isSelf) {
          this.enqueueVoice({
            text: '弃牌',
            priority: 13,
            replaceLower: true,
          });
        }
        break;
    }
  }

  /**
   * 专属防重叠语音播报队列 (直接委托至 SoundEngine 统一 Voice Bus 优先级队列，杜绝双队列并发冲突)
   */
  enqueueVoice(params: {
    text: string;
    priority?: number;
    replaceLower?: boolean;
    rate?: number;
    pitch?: number;
  }): void {
    soundEngine.enqueuePokerVoice(
      params.text,
      params.priority ?? 15,
      params.replaceLower ?? true,
      params.rate,
      params.pitch
    );
  }

  // ---------------------------------------------------------------------------
  // WebAudio 物理建模高保真合成增强层 (全部通过 SFX Bus 输出，受 SFX 音量滑块与动态压缩器控制)
  // ---------------------------------------------------------------------------

  private synthesizeCardSlideSnap(ctx: AudioContext, rate: number, pan: number): void {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520 * rate, now);
      osc.frequency.exponentialRampToValueAtTime(1240 * rate, now + 0.045);

      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

      this.connectWithPan(ctx, osc, gain, pan);
      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // Ignore synth error
    }
  }

  private synthesizeChipCollisionChime(
    ctx: AudioContext,
    rate: number,
    pan: number,
    intensity: 'normal' | 'high' | 'allin'
  ): void {
    try {
      const now = ctx.currentTime;
      const freqs = intensity === 'allin' ? [2680, 4120, 5640] : [2950, 4480];
      const peakGain = intensity === 'allin' ? 0.14 : intensity === 'high' ? 0.11 : 0.08;

      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * rate, now);

        gain.gain.setValueAtTime(peakGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

        this.connectWithPan(ctx, osc, gain, pan);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch {
      // Ignore synth error
    }
  }

  private synthesizeLightningArc(ctx: AudioContext, fromPan: number, toPan: number): void {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1480, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.28);

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      const targetBus = soundEngine.getSfxBus() ?? ctx.destination;
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(fromPan, now);
        panner.pan.linearRampToValueAtTime(toPan, now + 0.28);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(targetBus);
      } else {
        osc.connect(gain);
        gain.connect(targetBus);
      }

      osc.start(now);
      osc.stop(now + 0.31);
    } catch {
      // Ignore synth error
    }
  }

  private synthesizeNiuHarmonicBell(ctx: AudioContext, level: number, pan: number): void {
    try {
      const now = ctx.currentTime;
      const baseFreq = level >= 10 ? 587.33 : level >= 7 ? 523.25 : level > 0 ? 440 : 311.13;
      const intervals = level >= 10 ? [1, 1.25, 1.5, 2] : level > 0 ? [1, 1.25] : [1];

      intervals.forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = level >= 10 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, now + idx * 0.035);

        gain.gain.setValueAtTime(0.1, now + idx * 0.035);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.035 + 0.22);

        this.connectWithPan(ctx, osc, gain, pan);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.24);
      });
    } catch {
      // Ignore synth error
    }
  }

  private connectWithPan(
    ctx: AudioContext,
    source: AudioNode,
    gain: GainNode,
    pan: number
  ): void {
    const targetBus = soundEngine.getSfxBus() ?? ctx.destination;
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
      source.connect(gain);
      gain.connect(panner);
      panner.connect(targetBus);
    } else {
      source.connect(gain);
      gain.connect(targetBus);
    }
  }
}

export const webAudioQueue = new WebAudioQueueManager();
