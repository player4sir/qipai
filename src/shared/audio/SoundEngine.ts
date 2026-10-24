import { DdzDebugLogger } from '../../games/ddz/utils/DdzDebugLogger';
import { legacyIdToTileIndex } from '../../games/mahjong/algorithms/TileEngine';

export type VoicePersona = 'female' | 'male' | 'yunnan';

export interface AudioPreferences {
  masterMuted: boolean;
  bgmVolume: number; // 0.0 ~ 1.0
  sfxVolume: number; // 0.0 ~ 1.0
  voiceVolume: number; // 0.0 ~ 1.0
  voicePersona: VoicePersona;
}

const STORAGE_KEY_AUDIO_PREFS = 'h5_audio_preferences_v2';
const STORAGE_KEY_LEGACY_ENABLED = 'h5_sound_enabled';

const DEFAULT_PREFS: AudioPreferences = {
  masterMuted: false,
  bgmVolume: 0.55,
  sfxVolume: 0.85,
  voiceVolume: 0.95,
  voicePersona: 'female',
};

/**
 * Universal 3D Stereo Panning calculator for 3-seat (DDZ), 4-seat (Mahjong), and 5-seat (Niuniu/ZJH/LaoYanCai) tables.
 * Returns a stereo pan value in [-1.0 (left), +1.0 (right)].
 */
export function computeRelativeSeatPan(
  seatIndex?: number,
  selfSeatIndex = 0,
  totalSeats: 3 | 4 | 5 = 5
): number {
  if (seatIndex === undefined || seatIndex < 0) return 0;
  const rel = ((seatIndex - selfSeatIndex) % totalSeats + totalSeats) % totalSeats;

  if (totalSeats === 3) {
    // 0: Bottom self, 1: Right opponent, 2: Left opponent
    if (rel === 1) return 0.66;
    if (rel === 2) return -0.66;
    return 0;
  }

  if (totalSeats === 4) {
    // 0: Bottom self, 1: Right, 2: Top across, 3: Left
    if (rel === 1) return 0.72;
    if (rel === 2) return 0.08;
    if (rel === 3) return -0.72;
    return 0;
  }

  // 5-seat ring table: 0: Bottom, 1: Left, 2: Top-Left, 3: Top-Right, 4: Right
  switch (rel) {
    case 0:
      return 0;
    case 1:
      return -0.68;
    case 2:
      return -0.36;
    case 3:
      return 0.36;
    case 4:
      return 0.68;
    default:
      return 0;
  }
}

export function resolveMahjongTileVoiceUrl(
  tileId: number,
  gender: 'female' | 'male' = 'female'
): string {
  const idx = legacyIdToTileIndex(tileId);
  let file = 'mjt2_1.mp3';
  if (idx >= 18 && idx <= 26) {
    file = `mjt1_${idx - 18 + 1}.mp3`;
  } else if (idx >= 0 && idx <= 8) {
    file = `mjt2_${idx - 0 + 1}.mp3`;
  } else if (idx >= 9 && idx <= 17) {
    file = `mjt3_${idx - 9 + 1}.mp3`;
  } else if (idx >= 27 && idx <= 30) {
    file = `mjt4_${idx - 27 + 1}.mp3`;
  } else if (idx === 31) {
    file = 'mjt4_5.mp3';
  } else if (idx === 32) {
    file = 'mjt4_6.mp3';
  } else if (idx === 33) {
    file = 'mjt4_7.mp3';
  }
  return `/assets/mahjong/audio/voice/${gender}/${file}`;
}

export function resolveMahjongActionVoiceUrl(
  action: 'chi' | 'peng' | 'gang' | 'hu' | 'zimo' | string,
  gender: 'female' | 'male' = 'female'
): string {
  const actFile = action === 'chi' ? 'peng' : action;
  return `/assets/mahjong/audio/voice/${gender}/${actFile}.mp3`;
}

interface MahjongVoiceQueueItem {
  url: string;
  priority: number; // 10: 报牌语音, 20: 吃碰杠动作语音, 30: 胡/自摸高优语音
  pan?: number;
  playbackRate?: number;
}

class SoundEngine {
  private prefs: AudioPreferences = { ...DEFAULT_PREFS };
  private audioCtx: AudioContext | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private masterGainNode: GainNode | null = null;
  private bgmGainNode: GainNode | null = null;
  private sfxGainNode: GainNode | null = null;
  private voiceGainNode: GainNode | null = null;

  // BGM State & Auto-Ducking
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmSourceNode: AudioBufferSourceNode | null = null;
  private currentBgmType: 'lobby' | 'table' | null = null;
  private isBgmDucked = false;
  private duckRestoreTimer: number | null = null;

  // Shared Zero-Latency Decoded AudioBuffer Pool
  private bufferPool: Map<string, AudioBuffer> = new Map();
  private bufferPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
  private htmlAudioPool: Map<string, HTMLAudioElement> = new Map();

  // Mahjong & Recorded Voice Exclusive Priority Queue
  private mjCurrentVoiceAudio: HTMLAudioElement | null = null;
  private mjCurrentVoiceSource: AudioBufferSourceNode | null = null;
  private mjVoiceQueue: MahjongVoiceQueueItem[] = [];
  private mjVoicePlaying = false;

  // SpeechSynthesis Priority Queue
  private pokerVoiceQueue: Array<{
    text: string;
    priority: number;
    rate?: number;
    pitch?: number;
  }> = [];
  private pokerVoiceSpeaking = false;

  private unlockBound = false;

  constructor() {
    this.loadPreferences();
    this.bindGlobalAutoUnlock();
  }

  private loadPreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_AUDIO_PREFS);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioPreferences>;
        this.prefs = {
          masterMuted: Boolean(parsed.masterMuted ?? DEFAULT_PREFS.masterMuted),
          bgmVolume: this.clamp01(parsed.bgmVolume ?? DEFAULT_PREFS.bgmVolume),
          sfxVolume: this.clamp01(parsed.sfxVolume ?? DEFAULT_PREFS.sfxVolume),
          voiceVolume: this.clamp01(parsed.voiceVolume ?? DEFAULT_PREFS.voiceVolume),
          voicePersona:
            parsed.voicePersona === 'male' ||
            parsed.voicePersona === 'yunnan' ||
            parsed.voicePersona === 'female'
              ? parsed.voicePersona
              : 'female',
        };
        return;
      }
      const legacy = localStorage.getItem(STORAGE_KEY_LEGACY_ENABLED);
      if (legacy !== null) {
        this.prefs.masterMuted = legacy !== 'true';
      }
    } catch {
      // Ignore storage error
    }
  }

  private savePreferences(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_AUDIO_PREFS, JSON.stringify(this.prefs));
      localStorage.setItem(STORAGE_KEY_LEGACY_ENABLED, String(!this.prefs.masterMuted));
    } catch {
      // Ignore storage quota error
    }
  }

  private clamp01(val: number): number {
    if (Number.isNaN(val)) return 0.8;
    return Number(Math.max(0, Math.min(1, val)).toFixed(2));
  }

  /**
   * Automatically unlocks WebAudio context on first user pointer/touch/key interaction.
   */
  private bindGlobalAutoUnlock(): void {
    if (typeof window === 'undefined' || this.unlockBound) return;
    this.unlockBound = true;

    const unlock = () => {
      const ctx = this.getCtx();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (this.currentBgmType && this.isBgmEnabled()) {
        this.startBgm(this.currentBgmType);
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  /**
   * Initializes the 3-Bus WebAudio Mixing Graph:
   * [BGM Bus] ──┐
   * [SFX Bus] ──┼──► [DynamicsCompressor] ──► [Master Gain] ──► [Destination]
   * [Voice Bus] ┘
   */
  public getCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        this.audioCtx = ctx;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, ctx.currentTime);
        compressor.knee.setValueAtTime(18, ctx.currentTime);
        compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
        compressor.attack.setValueAtTime(0.004, ctx.currentTime);
        compressor.release.setValueAtTime(0.18, ctx.currentTime);

        const masterGain = ctx.createGain();
        const bgmGain = ctx.createGain();
        const sfxGain = ctx.createGain();
        const voiceGain = ctx.createGain();

        bgmGain.connect(compressor);
        sfxGain.connect(compressor);
        voiceGain.connect(compressor);
        compressor.connect(masterGain);
        masterGain.connect(ctx.destination);

        this.compressorNode = compressor;
        this.masterGainNode = masterGain;
        this.bgmGainNode = bgmGain;
        this.sfxGainNode = sfxGain;
        this.voiceGainNode = voiceGain;

        this.syncBusGainsImmediate();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended' && !this.prefs.masterMuted) {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public getSfxBus(): AudioNode | null {
    const ctx = this.getCtx();
    return this.sfxGainNode ?? (ctx ? ctx.destination : null);
  }

  public getVoiceBus(): AudioNode | null {
    const ctx = this.getCtx();
    return this.voiceGainNode ?? (ctx ? ctx.destination : null);
  }

  private getEffectiveBgmTargetGain(): number {
    if (this.prefs.masterMuted || this.prefs.bgmVolume <= 0) return 0;
    const modeScale = this.currentBgmType === 'table' ? 0.32 : 0.48;
    const duckFactor = this.isBgmDucked ? 0.28 : 1.0;
    return this.prefs.bgmVolume * modeScale * duckFactor;
  }

  private syncBusGainsImmediate(): void {
    const ctx = this.audioCtx;
    if (ctx && this.masterGainNode && this.bgmGainNode && this.sfxGainNode && this.voiceGainNode) {
      const now = ctx.currentTime;
      this.masterGainNode.gain.setTargetAtTime(this.prefs.masterMuted ? 0 : 1, now, 0.015);
      this.bgmGainNode.gain.setTargetAtTime(this.getEffectiveBgmTargetGain(), now, 0.04);
      this.sfxGainNode.gain.setTargetAtTime(
        this.prefs.masterMuted ? 0 : this.prefs.sfxVolume,
        now,
        0.015
      );
      this.voiceGainNode.gain.setTargetAtTime(
        this.prefs.masterMuted ? 0 : this.prefs.voiceVolume,
        now,
        0.015
      );
    }

    if (this.bgmAudio) {
      this.bgmAudio.volume = Math.max(0, Math.min(1, this.getEffectiveBgmTargetGain()));
      if (this.prefs.masterMuted || this.prefs.bgmVolume <= 0) {
        this.bgmAudio.pause();
      }
    }
  }

  /**
   * Automatic Audio Ducking: smoothly lowers BGM when high-priority voice callouts or epic fanfare SFX trigger,
   * then restores BGM volume after `durationMs`.
   */
  public triggerBgmDucking(durationMs = 1100): void {
    if (this.prefs.masterMuted || typeof window === 'undefined') return;
    this.isBgmDucked = true;

    const ctx = this.audioCtx;
    if (ctx && this.bgmGainNode) {
      this.bgmGainNode.gain.setTargetAtTime(
        this.getEffectiveBgmTargetGain(),
        ctx.currentTime,
        0.05
      );
    }
    if (this.bgmAudio) {
      this.bgmAudio.volume = Math.max(0, Math.min(1, this.getEffectiveBgmTargetGain()));
    }

    if (this.duckRestoreTimer !== null) {
      window.clearTimeout(this.duckRestoreTimer);
    }
    this.duckRestoreTimer = window.setTimeout(() => {
      this.isBgmDucked = false;
      this.duckRestoreTimer = null;
      if (this.audioCtx && this.bgmGainNode) {
        this.bgmGainNode.gain.setTargetAtTime(
          this.getEffectiveBgmTargetGain(),
          this.audioCtx.currentTime,
          0.25
        );
      }
      if (this.bgmAudio) {
        this.bgmAudio.volume = Math.max(0, Math.min(1, this.getEffectiveBgmTargetGain()));
      }
    }, Math.max(300, durationMs));
  }

  // =========================================================================
  // Public Preference Getters & Setters (3-Bus Volume + Voice Persona)
  // =========================================================================

  public getPreferences(): AudioPreferences {
    return { ...this.prefs };
  }

  public isEnabled(): boolean {
    return !this.prefs.masterMuted;
  }

  public isBgmEnabled(): boolean {
    return !this.prefs.masterMuted && this.prefs.bgmVolume > 0;
  }

  public getBgmVolume(): number {
    return this.prefs.bgmVolume;
  }

  public getSfxVolume(): number {
    return this.prefs.sfxVolume;
  }

  public getVoiceVolume(): number {
    return this.prefs.voiceVolume;
  }

  public getVoicePersona(): VoicePersona {
    return this.prefs.voicePersona;
  }

  public setBgmVolume(vol: number): void {
    this.prefs.bgmVolume = this.clamp01(vol);
    if (this.prefs.bgmVolume > 0 && this.prefs.masterMuted) {
      this.prefs.masterMuted = false;
    }
    this.savePreferences();
    this.syncBusGainsImmediate();
    if (this.prefs.bgmVolume > 0 && this.currentBgmType) {
      this.startBgm(this.currentBgmType);
    }
  }

  public setSfxVolume(vol: number): void {
    this.prefs.sfxVolume = this.clamp01(vol);
    if (this.prefs.sfxVolume > 0 && this.prefs.masterMuted) {
      this.prefs.masterMuted = false;
    }
    this.savePreferences();
    this.syncBusGainsImmediate();
  }

  public setVoiceVolume(vol: number): void {
    this.prefs.voiceVolume = this.clamp01(vol);
    if (this.prefs.voiceVolume > 0 && this.prefs.masterMuted) {
      this.prefs.masterMuted = false;
    }
    this.savePreferences();
    this.syncBusGainsImmediate();
  }

  public setVoicePersona(persona: VoicePersona, playPreview = true): void {
    this.prefs.voicePersona = persona;
    this.savePreferences();
    if (playPreview && !this.prefs.masterMuted) {
      this.previewVoicePersona(persona);
    }
  }

  public previewVoicePersona(persona: VoicePersona = this.prefs.voicePersona): void {
    if (this.prefs.masterMuted) return;
    this.playTap(840);
    if (persona === 'female') {
      this.speak('温婉女声已开启，祝您鸿运当头', 'high');
    } else if (persona === 'male') {
      this.speak('浑厚男声已开启，大吉大利', 'high');
    } else {
      this.speak('滇南特色方言音色已开启，把把炸开捞大牌', 'high');
    }
  }

  public toggle(): boolean {
    this.prefs.masterMuted = !this.prefs.masterMuted;
    this.savePreferences();
    this.syncBusGainsImmediate();

    if (!this.prefs.masterMuted) {
      if (this.currentBgmType) this.startBgm(this.currentBgmType);
    } else {
      this.stopBgm();
      this.clearMahjongVoiceQueue();
      this.clearLaoYanCaiAudioQueue();
    }
    return !this.prefs.masterMuted;
  }

  public toggleBgm(): boolean {
    if (this.prefs.bgmVolume > 0) {
      this.setBgmVolume(0);
    } else {
      this.setBgmVolume(0.55);
    }
    return this.isBgmEnabled();
  }

  // =========================================================================
  // Zero-Latency AudioBuffer Loader & Multi-Bus Playback
  // =========================================================================

  public async loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    if (typeof window === 'undefined') return null;
    if (this.bufferPool.has(url)) {
      return this.bufferPool.get(url)!;
    }
    if (this.bufferPromises.has(url)) {
      return this.bufferPromises.get(url)!;
    }

    const promise = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error('HTTP error'))))
      .then(async (raw) => {
        const ctx = this.getCtx();
        if (!ctx) return null;
        const decoded = await ctx.decodeAudioData(raw);
        if (decoded) {
          this.bufferPool.set(url, decoded);
        }
        return decoded;
      })
      .catch(() => {
        if (!this.htmlAudioPool.has(url)) {
          const a = new Audio();
          a.preload = 'auto';
          a.src = url;
          this.htmlAudioPool.set(url, a);
        }
        return null;
      })
      .finally(() => {
        this.bufferPromises.delete(url);
      });

    this.bufferPromises.set(url, promise);
    return promise;
  }

  public getCachedBuffer(url: string): AudioBuffer | undefined {
    return this.bufferPool.get(url);
  }

  public startBgm(type: 'lobby' | 'table' = 'lobby'): void {
    this.currentBgmType = type;
    if (!this.isBgmEnabled() || typeof window === 'undefined') return;
    try {
      if (!this.bgmAudio) {
        this.bgmAudio = new Audio('/assets/audio/bgm_lobby.wav');
        this.bgmAudio.loop = true;
      }
      this.bgmAudio.volume = Math.max(0, Math.min(1, this.getEffectiveBgmTargetGain()));
      if (this.bgmAudio.paused) {
        this.bgmAudio.play().catch(() => {});
      }
    } catch {
      // Ignore autoplay block
    }
  }

  public stopBgm(): void {
    if (this.bgmSourceNode) {
      try {
        this.bgmSourceNode.stop();
      } catch {
        // Ignore
      }
      this.bgmSourceNode = null;
    }
    if (this.bgmAudio) {
      try {
        this.bgmAudio.pause();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Plays an audio asset through the WebAudio SFX or Voice bus with optional 3D stereo panning
   * and playbackRate modulation. Automatically falls back to HTMLAudio if not yet decoded.
   */
  public playAudioFile(
    url: string,
    volume = 0.85,
    options: {
      bus?: 'sfx' | 'voice';
      pan?: number;
      playbackRate?: number;
      duckBgm?: boolean;
    } = {}
  ): void {
    if (this.prefs.masterMuted || typeof window === 'undefined') return;
    const busType = options.bus ?? 'sfx';
    const busVolume = busType === 'voice' ? this.prefs.voiceVolume : this.prefs.sfxVolume;
    if (busVolume <= 0) return;

    if (options.duckBgm) {
      this.triggerBgmDucking(1200);
    }

    const ctx = this.getCtx();
    const cachedBuf = this.bufferPool.get(url);

    if (ctx && cachedBuf) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = cachedBuf;
        if (options.playbackRate && options.playbackRate !== 1) {
          source.playbackRate.setValueAtTime(options.playbackRate, ctx.currentTime);
        }

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(Math.max(0, Math.min(1.5, volume)), ctx.currentTime);

        const targetBus =
          (busType === 'voice' ? this.voiceGainNode : this.sfxGainNode) ?? ctx.destination;

        if (
          typeof ctx.createStereoPanner === 'function' &&
          options.pan !== undefined &&
          options.pan !== 0
        ) {
          const panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan)), ctx.currentTime);
          source.connect(gainNode);
          gainNode.connect(panner);
          panner.connect(targetBus);
        } else {
          source.connect(gainNode);
          gainNode.connect(targetBus);
        }

        source.start(0);
        return;
      } catch {
        // Fall through to HTMLAudio fallback
      }
    }

    // Trigger background decode for next time so future plays are zero-latency
    void this.loadAudioBuffer(url);

    try {
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume * busVolume));
      if (options.playbackRate) {
        audio.playbackRate = options.playbackRate;
      }
      audio.play().catch(() => {});
    } catch {
      // Ignore
    }
  }

  // =========================================================================
  // Mahjong Voice & SFX Queue (Connected to Voice Bus, Persona & Ducking)
  // =========================================================================

  public clearMahjongVoiceQueue(): void {
    this.mjVoiceQueue = [];
    this.mjVoicePlaying = false;
    if (this.mjCurrentVoiceSource) {
      try {
        this.mjCurrentVoiceSource.stop();
      } catch {
        // Ignore
      }
      this.mjCurrentVoiceSource = null;
    }
    if (this.mjCurrentVoiceAudio) {
      try {
        this.mjCurrentVoiceAudio.pause();
        this.mjCurrentVoiceAudio.currentTime = 0;
      } catch {
        // Ignore
      }
      this.mjCurrentVoiceAudio = null;
    }
  }

  public enqueueMahjongVoice(
    url: string,
    priority: number,
    replaceEqualOrLower = false,
    pan = 0,
    playbackRate = 1.0
  ): void {
    if (this.prefs.masterMuted || this.prefs.voiceVolume <= 0 || typeof window === 'undefined') {
      return;
    }
    if (replaceEqualOrLower) {
      this.mjVoiceQueue = this.mjVoiceQueue.filter((item) => item.priority > priority);
    }
    if (priority >= 20) {
      this.triggerBgmDucking(priority >= 30 ? 1600 : 1050);
    }
    this.mjVoiceQueue.push({ url, priority, pan, playbackRate });
    this.mjVoiceQueue.sort((a, b) => b.priority - a.priority);

    if (!this.mjVoicePlaying) {
      this.processNextMahjongVoice();
    }
  }

  private processNextMahjongVoice(): void {
    if (
      this.prefs.masterMuted ||
      this.prefs.voiceVolume <= 0 ||
      this.mjVoiceQueue.length === 0
    ) {
      this.mjVoicePlaying = false;
      this.mjCurrentVoiceAudio = null;
      this.mjCurrentVoiceSource = null;
      return;
    }

    const nextItem = this.mjVoiceQueue.shift()!;
    this.mjVoicePlaying = true;

    const ctx = this.getCtx();
    const cachedBuf = this.bufferPool.get(nextItem.url);

    if (ctx && cachedBuf && this.voiceGainNode) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = cachedBuf;
        source.playbackRate.setValueAtTime(nextItem.playbackRate ?? 1.0, ctx.currentTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.96, ctx.currentTime);

        if (typeof ctx.createStereoPanner === 'function' && nextItem.pan) {
          const panner = ctx.createStereoPanner();
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, nextItem.pan)), ctx.currentTime);
          source.connect(gain);
          gain.connect(panner);
          panner.connect(this.voiceGainNode);
        } else {
          source.connect(gain);
          gain.connect(this.voiceGainNode);
        }

        this.mjCurrentVoiceSource = source;
        source.onended = () => {
          this.mjCurrentVoiceSource = null;
          this.processNextMahjongVoice();
        };
        source.start(0);
        return;
      } catch {
        // Fallback to HTMLAudio below
      }
    }

    void this.loadAudioBuffer(nextItem.url);

    try {
      const audio = new Audio(nextItem.url);
      audio.volume = Math.max(0, Math.min(1, 0.95 * this.prefs.voiceVolume));
      if (nextItem.playbackRate) {
        audio.playbackRate = nextItem.playbackRate;
      }
      this.mjCurrentVoiceAudio = audio;

      const onFinish = () => {
        audio.onended = null;
        audio.onerror = null;
        this.mjCurrentVoiceAudio = null;
        this.processNextMahjongVoice();
      };

      audio.onended = onFinish;
      audio.onerror = onFinish;
      audio.play().catch(() => {
        onFinish();
      });
    } catch {
      this.mjVoicePlaying = false;
      this.processNextMahjongVoice();
    }
  }

  public preloadMahjongAudio(): void {
    if (typeof window === 'undefined') return;
    const urls = [
      '/assets/mahjong/audio/Sepcial_Mahjong_Deal.wav',
      '/assets/mahjong/audio/Sepcial_Mahjong_DrawCard.wav',
      '/assets/mahjong/audio/Sepcial_Mahjong_GiveCard.wav',
      '/assets/mahjong/audio/Sepcial_Mahjong_BeanFly.wav',
      '/assets/mahjong/audio/Sepcial_Mahjong_Win.wav',
      '/assets/mahjong/audio/Sepcial_Mahjong_Win_Zimo.wav',
    ];
    for (const u of urls) {
      void this.loadAudioBuffer(u);
    }
  }

  public playMahjongDeal(): void {
    this.playAudioFile('/assets/mahjong/audio/Sepcial_Mahjong_Deal.wav', 0.78);
  }

  public playMahjongDraw(seatIndex?: number, selfSeatIndex = 0): void {
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 4);
    this.playAudioFile('/assets/mahjong/audio/Sepcial_Mahjong_DrawCard.wav', 0.72, { pan });
  }

  public playMahjongWild(): void {
    this.playAudioFile('/assets/mahjong/audio/Sepcial_Mahjong_DrawGiveWild.wav', 0.82);
  }

  public playMahjongGive(seatIndex?: number, selfSeatIndex = 0): void {
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 4);
    this.playAudioFile('/assets/mahjong/audio/Sepcial_Mahjong_GiveCard.wav', 0.86, { pan });
  }

  public playMahjongBeanFly(): void {
    this.playAudioFile('/assets/mahjong/audio/Sepcial_Mahjong_BeanFly.wav', 0.82);
  }

  public playMahjongWin(isZimo = false): void {
    const url = isZimo
      ? '/assets/mahjong/audio/Sepcial_Mahjong_Win_Zimo.wav'
      : '/assets/mahjong/audio/Sepcial_Mahjong_Win.wav';
    this.playAudioFile(url, 0.94, { duckBgm: true });
  }

  private resolveEffectiveGender(explicitGender?: 'female' | 'male'): 'female' | 'male' {
    if (this.prefs.voicePersona === 'male') return 'male';
    if (this.prefs.voicePersona === 'female') return 'female';
    return explicitGender ?? 'female';
  }

  public playTileVoice(
    tileId: number,
    gender?: 'female' | 'male',
    seatIndex?: number,
    selfSeatIndex = 0
  ): string {
    const effGender = this.resolveEffectiveGender(gender);
    const url = resolveMahjongTileVoiceUrl(tileId, effGender);
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 4);
    const rate = this.prefs.voicePersona === 'yunnan' ? 1.06 : 1.0;
    this.enqueueMahjongVoice(url, 10, true, pan, rate);
    return url;
  }

  public playActionVoice(
    action: 'chi' | 'peng' | 'gang' | 'hu' | 'zimo' | string,
    gender?: 'female' | 'male',
    seatIndex?: number,
    selfSeatIndex = 0
  ): string {
    const effGender = this.resolveEffectiveGender(gender);
    const url = resolveMahjongActionVoiceUrl(action, effGender);
    const priority = action === 'hu' || action === 'zimo' ? 30 : 20;
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 4);
    const rate = this.prefs.voicePersona === 'yunnan' ? 1.05 : 1.0;
    this.enqueueMahjongVoice(url, priority, false, pan, rate);
    return url;
  }

  // =========================================================================
  // Dou Dizhu (DDZ) SFX & Voice (with 3-Seat Stereo Panning & BGM Ducking)
  // =========================================================================

  public preloadDdzAudio(): void {
    if (typeof window === 'undefined') return;
    const urls = [
      '/assets/audio/ddz/Special_Discard.wav',
      '/assets/audio/ddz/Special_querendizhu.wav',
      '/assets/audio/ddz/Special_Chuntian.wav',
      '/assets/audio/ddz/Special_alert.wav',
      '/assets/audio/ddz/Special_Bomb_New.wav',
      '/assets/audio/ddz/Special_plane.wav',
      '/assets/audio/ddz/Special_Dispatch_2D.wav',
    ];
    for (const u of urls) {
      void this.loadAudioBuffer(u);
    }
  }

  public playDdzSfx(
    type: 'discard' | 'landlord' | 'spring' | 'alert' | 'bomb' | 'plane' | string,
    seatIndex?: number,
    selfSeatIndex = 0
  ): void {
    const map: Record<string, string> = {
      discard: '/assets/audio/ddz/Special_Discard.wav',
      landlord: '/assets/audio/ddz/Special_querendizhu.wav',
      spring: '/assets/audio/ddz/Special_Chuntian.wav',
      alert: '/assets/audio/ddz/Special_alert.wav',
      bomb: '/assets/audio/ddz/Special_Bomb_New.wav',
      plane: '/assets/audio/ddz/Special_plane.wav',
    };
    if (map[type]) {
      const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 3);
      const isEpic = type === 'bomb' || type === 'spring' || type === 'plane';
      this.playAudioFile(map[type], isEpic ? 0.94 : 0.85, {
        bus: 'sfx',
        pan,
        duckBgm: isEpic,
      });
    }
  }

  public playDdzActionVoice(action: string, seatIndex?: number, selfSeatIndex = 0): void {
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 3);
    const rate =
      this.prefs.voicePersona === 'male'
        ? 0.94
        : this.prefs.voicePersona === 'yunnan'
        ? 1.06
        : 1.0;

    if (action === 'pass') {
      const idx = Math.floor(Math.random() * 4) + 1;
      this.playAudioFile(`/assets/audio/ddz/buyao${idx}.wav`, 0.9, {
        bus: 'voice',
        pan,
        playbackRate: rate,
      });
    } else {
      this.playAudioFile(`/assets/audio/ddz/${action}.wav`, 0.9, {
        bus: 'voice',
        pan,
        playbackRate: rate,
        duckBgm: action === 'chaojijiabei' || action === 'qiangdizhu',
      });
    }
  }

  public playDdzCardVoice(
    patternType: string,
    mainValue: number,
    seatIndex?: number,
    selfSeatIndex = 0
  ): void {
    const file = DdzDebugLogger.resolveVoiceFile(patternType, mainValue);
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 3);
    const isEpic =
      patternType === 'BOMB' ||
      patternType === 'ROCKET' ||
      patternType.startsWith('AIRPLANE');
    const rate =
      this.prefs.voicePersona === 'male'
        ? 0.94
        : this.prefs.voicePersona === 'yunnan'
        ? 1.05
        : 1.0;

    if (file && file !== 'unknown.wav') {
      this.playAudioFile(`/assets/audio/ddz/${file}`, 0.94, {
        bus: 'voice',
        pan,
        playbackRate: rate,
        duckBgm: isEpic,
      });
    }
    if (patternType === 'BOMB' || patternType === 'ROCKET') {
      this.playDdzSfx('bomb', seatIndex, selfSeatIndex);
    } else if (patternType.startsWith('AIRPLANE')) {
      this.playDdzSfx('plane', seatIndex, selfSeatIndex);
    }
  }

  // =========================================================================
  // Synthesized Tactile UI & Table Micro-SFX (Routed through SFX Bus)
  // =========================================================================

  public playTap(freq = 720, pan = 0): void {
    if (this.prefs.masterMuted || this.prefs.sfxVolume <= 0) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);

      const targetBus = this.sfxGainNode ?? ctx.destination;
      if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(targetBus);
      } else {
        osc.connect(gain);
        gain.connect(targetBus);
      }

      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch {
      // Ignore
    }
  }

  public playCardPlace(accent = false, pan = 0): void {
    this.playTap(accent ? 820 : 660, pan);
  }

  public playCardFly(index = 0, pan = 0): void {
    this.playTap(580 + (index % 8) * 35, pan);
  }

  public playGlissando(): void {
    this.playTap(880);
  }

  public playRiffleShuffle(): void {
    this.playAudioFile('/assets/audio/ddz/Special_Dispatch_2D.wav', 0.75);
  }

  public playPowerChime(level = 2): void {
    if (level >= 3) {
      this.triggerBgmDucking(950);
    }
    this.playTap(660 + level * 80);
  }

  public playVictoryFanfare(): void {
    this.triggerBgmDucking(1400);
    this.playTap(980);
  }

  public playDefeatTone(): void {
    this.playTap(360);
  }

  public playDiceRoll(): void {
    this.playTap(740);
  }

  public playCountdownTick(urgent = false): void {
    this.playTap(urgent ? 940 : 620);
  }

  public playPropWhoosh(): void {
    this.playTap(700);
  }

  public playPropImpact(negative = false): void {
    this.playTap(negative ? 320 : 560);
  }

  // =========================================================================
  // Niuniu, Zhajinhua & Yunnan LaoYanCai Audio Preload & Voice Queue
  // =========================================================================

  public preloadNiuniuAudio(): void {
    if (typeof window === 'undefined') return;
    const urls = [
      '/assets/audio/niuniu/chip_bet.wav',
      '/assets/audio/niuniu/banker_tick.wav',
      '/assets/audio/niuniu/banker_lock.wav',
      '/assets/audio/niuniu/card_reveal.wav',
      '/assets/audio/niuniu/high_niu_fanfare.wav',
      '/assets/audio/ddz/Special_Dispatch_2D.wav',
    ];
    for (const u of urls) {
      void this.loadAudioBuffer(u);
    }
  }

  public preloadZjhAudio(): void {
    if (typeof window === 'undefined') return;
    const urls = [
      '/assets/audio/zjh/chip_toss.wav',
      '/assets/audio/zjh/chip_allin.wav',
      '/assets/audio/zjh/card_peek.wav',
      '/assets/audio/zjh/vs_lightning.wav',
      '/assets/audio/zjh/fold_slide.wav',
      '/assets/audio/ddz/Special_Dispatch_2D.wav',
    ];
    for (const u of urls) {
      void this.loadAudioBuffer(u);
    }
  }

  public playNiuniuDeal(): void {
    this.playAudioFile('/assets/audio/ddz/Special_Dispatch_2D.wav', 0.72);
  }

  public playNiuniuBankerTick(): void {
    this.playAudioFile('/assets/audio/niuniu/banker_tick.wav', 0.78);
  }

  public playNiuniuBankerLock(): void {
    this.playAudioFile('/assets/audio/niuniu/banker_lock.wav', 0.88);
  }

  public playNiuniuCall(multiplier = 1): void {
    this.playAudioFile('/assets/audio/niuniu/banker_tick.wav', 0.82);
    const label = multiplier <= 0 ? '不抢' : `抢${multiplier}倍`;
    this.enqueuePokerVoice(label, 15, true);
  }

  public playNiuniuChip(multiplier?: number): void {
    this.playAudioFile('/assets/audio/niuniu/chip_bet.wav', 0.85);
    if (multiplier && multiplier > 0) {
      this.enqueuePokerVoice(`下${multiplier}倍`, 12, true);
    }
  }

  public playNiuniuHandReveal(level = 0, handName?: string): void {
    if (level >= 10) {
      this.playAudioFile('/assets/audio/niuniu/high_niu_fanfare.wav', 0.92, {
        duckBgm: true,
      });
    } else {
      this.playAudioFile('/assets/audio/niuniu/card_reveal.wav', 0.82);
    }
    if (handName) {
      this.enqueuePokerVoice(handName, level >= 10 ? 25 : 18, false);
    }
  }

  public playZjhChip(): void {
    this.playAudioFile('/assets/audio/zjh/chip_toss.wav', 0.84);
  }

  public playZjhAllIn(): void {
    this.playAudioFile('/assets/audio/zjh/chip_allin.wav', 0.92, { duckBgm: true });
  }

  public playZjhLook(): void {
    this.playAudioFile('/assets/audio/zjh/card_peek.wav', 0.85);
  }

  public playZjhCompareClash(): void {
    this.playAudioFile('/assets/audio/zjh/vs_lightning.wav', 0.92, { duckBgm: true });
  }

  public playZjhFold(): void {
    this.playAudioFile('/assets/audio/zjh/fold_slide.wav', 0.78);
  }

  public playZjhActionVoice(
    action: 'look' | 'call' | 'blind' | 'raise' | 'compare' | 'fold' | 'allin',
    handLabel?: string
  ): void {
    switch (action) {
      case 'look':
        this.playZjhLook();
        this.enqueuePokerVoice(handLabel ? `看牌，${handLabel}` : '看牌', 16, true);
        break;
      case 'blind':
        this.playZjhChip();
        this.enqueuePokerVoice('闷牌', 14, true);
        break;
      case 'call':
        this.playZjhChip();
        this.enqueuePokerVoice('跟注', 14, true);
        break;
      case 'raise':
        this.playZjhChip();
        this.enqueuePokerVoice('加注', 18, true);
        break;
      case 'compare':
        this.playZjhCompareClash();
        this.enqueuePokerVoice('比牌', 24, false);
        break;
      case 'allin':
        this.playZjhAllIn();
        this.enqueuePokerVoice('全押', 28, false);
        break;
      case 'fold':
        this.playZjhFold();
        this.enqueuePokerVoice('弃牌', 12, true);
        break;
    }
  }

  /**
   * Formats phrase with regional Yunnan cadence when 'yunnan' persona is selected.
   */
  public localizeVoiceText(rawText: string): string {
    if (this.prefs.voicePersona !== 'yunnan') return rawText;
    if (rawText === '捞腌菜') return '捞腌菜啰';
    if (rawText === '炸开') return '天牌炸开咯';
    if (rawText === '不捞') return '不捞喽，稳住';
    return rawText;
  }

  public getPersonaSpeechParams(
    baseRate = 1.18,
    basePitch = 1.05
  ): { rate: number; pitch: number; volume: number } {
    const vol = Math.max(0, Math.min(1, this.prefs.voiceVolume));
    if (this.prefs.voicePersona === 'male') {
      return {
        rate: Number((baseRate * 0.94).toFixed(2)),
        pitch: Number((basePitch * 0.78).toFixed(2)),
        volume: vol,
      };
    }
    if (this.prefs.voicePersona === 'yunnan') {
      return {
        rate: Number((baseRate * 1.06).toFixed(2)),
        pitch: Number((basePitch * 1.12).toFixed(2)),
        volume: vol,
      };
    }
    return {
      rate: baseRate,
      pitch: basePitch,
      volume: vol,
    };
  }

  public enqueuePokerVoice(
    text: string,
    priority = 15,
    replaceLower = true,
    rate?: number,
    pitch?: number
  ): void {
    if (
      this.prefs.masterMuted ||
      this.prefs.voiceVolume <= 0 ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window)
    ) {
      return;
    }
    try {
      const localized = this.localizeVoiceText(text);
      if (replaceLower) {
        this.pokerVoiceQueue = this.pokerVoiceQueue.filter((item) => item.priority > priority);
      }
      // Deduplicate identical consecutive queued text
      if (this.pokerVoiceQueue.some((v) => v.text === localized)) {
        return;
      }
      if (priority >= 22) {
        this.triggerBgmDucking(1300);
      }
      this.pokerVoiceQueue.push({ text: localized, priority, rate, pitch });
      this.pokerVoiceQueue.sort((a, b) => b.priority - a.priority);
      if (!this.pokerVoiceSpeaking) {
        this.processNextPokerVoice();
      }
    } catch {
      // Ignore speech synthesis errors
    }
  }

  private processNextPokerVoice(): void {
    if (
      this.prefs.masterMuted ||
      this.prefs.voiceVolume <= 0 ||
      this.pokerVoiceQueue.length === 0 ||
      typeof window === 'undefined'
    ) {
      this.pokerVoiceSpeaking = false;
      return;
    }
    const next = this.pokerVoiceQueue.shift()!;
    this.pokerVoiceSpeaking = true;
    try {
      const utter = new SpeechSynthesisUtterance(next.text);
      const params = this.getPersonaSpeechParams(next.rate ?? 1.18, next.pitch ?? 1.05);
      utter.lang = 'zh-CN';
      utter.rate = params.rate;
      utter.pitch = params.pitch;
      utter.volume = params.volume;
      const done = () => {
        utter.onend = null;
        utter.onerror = null;
        this.processNextPokerVoice();
      };
      utter.onend = done;
      utter.onerror = done;
      window.speechSynthesis.speak(utter);
    } catch {
      this.pokerVoiceSpeaking = false;
    }
  }

  public clearLaoYanCaiAudioQueue(): void {
    this.pokerVoiceQueue = [];
    this.pokerVoiceSpeaking = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }

  public playLaoYanCaiBaoziSfx(seatIndex?: number, selfSeatIndex = 0): void {
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 5);
    this.playAudioFile('/assets/audio/niuniu/high_niu_fanfare.wav', 0.94, {
      pan,
      duckBgm: true,
    });
    this.playPowerChime(4);
  }

  public playLaoYanCaiSanGongSfx(seatIndex?: number, selfSeatIndex = 0): void {
    const pan = computeRelativeSeatPan(seatIndex, selfSeatIndex, 5);
    this.playAudioFile('/assets/audio/niuniu/high_niu_fanfare.wav', 0.88, {
      pan,
      duckBgm: true,
    });
    this.playPowerChime(3);
  }

  public playLaoYanCaiShowdownQueue(
    items: Array<{
      category: string;
      handName: string;
      multiplier: number;
      nickname?: string;
      isWinner?: boolean;
      seatIndex?: number;
    }>
  ): void {
    if (this.prefs.masterMuted) return;
    if (!items || items.length === 0) {
      this.playAudioFile('/assets/audio/niuniu/card_reveal.wav', 0.8);
      return;
    }

    const sorted = [...items].sort((a, b) => b.multiplier - a.multiplier);
    sorted.slice(0, 2).forEach((item, idx) => {
      if (idx === 0) {
        if (item.category === 'BAOZI') {
          this.playLaoYanCaiBaoziSfx(item.seatIndex, 0);
          this.speak(`${item.handName}，${item.multiplier}倍通杀`, 'epic');
        } else if (item.category === 'SANGONG' || item.category === 'STRAIGHT_FLUSH') {
          this.playLaoYanCaiSanGongSfx(item.seatIndex, 0);
          this.speak(`${item.handName}，${item.multiplier}倍`, 'high');
        } else {
          this.playAudioFile('/assets/audio/niuniu/card_reveal.wav', 0.85);
          this.speak(`${item.handName}`, 'normal');
        }
      } else {
        this.enqueuePokerVoice(`${item.handName}，${item.multiplier}倍`, 20, false);
      }
    });
  }

  public speak(
    text: string,
    priorityLevel: 'normal' | 'high' | 'epic' = 'normal'
  ): void {
    const prio = priorityLevel === 'epic' ? 30 : priorityLevel === 'high' ? 22 : 15;
    this.enqueuePokerVoice(text, prio, priorityLevel !== 'epic');
  }
}

export const soundEngine = new SoundEngine();
