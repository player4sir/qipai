import { legacyIdToTileIndex } from '../../games/mahjong/algorithms/TileEngine';

/**
 * Commercial 4.0 Multi-Track Audio, Chinese Pentatonic BGM Sequencer,
 * Physical Playing Card Acoustics & Expressive Voice Announcer.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private bgmEnabled: boolean = true;
  private bgmMode: 'lobby' | 'table' | null = null;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;
  private lobbyAudio: HTMLAudioElement | null = null;
  private bgmVolume: number = 0.6;
  private sfxVolume: number = 0.8;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private pendingFetches: Map<string, Promise<AudioBuffer | null>> = new Map();
  private isUnlocked: boolean = false;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private activeVoiceAudio: HTMLAudioElement | null = null;

  constructor() {
    const savedSfx = localStorage.getItem('h5_audio_enabled');
    if (savedSfx !== null) {
      this.enabled = savedSfx === 'true';
    }
    const savedBgm = localStorage.getItem('h5_bgm_enabled');
    if (savedBgm !== null) {
      this.bgmEnabled = savedBgm === 'true';
    }
    const savedBgmVol = localStorage.getItem('h5_bgm_volume');
    if (savedBgmVol !== null) {
      const v = parseFloat(savedBgmVol);
      if (!isNaN(v)) this.bgmVolume = Math.max(0, Math.min(1, v));
    }
    const savedSfxVol = localStorage.getItem('h5_sfx_volume');
    if (savedSfxVol !== null) {
      const v = parseFloat(savedSfxVol);
      if (!isNaN(v)) this.sfxVolume = Math.max(0, Math.min(1, v));
    }

    // Auto unlock mobile WebAudio on first user gesture
    if (typeof window !== 'undefined') {
      const unlockHandler = () => {
        this.unlockAudio();
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
    }
  }

  /**
   * Unlock WebAudio context for mobile browser autoplay policies
   */
  unlockAudio(): void {
    if (typeof window === 'undefined') return;
    const ctx = this.getContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    if (!this.isUnlocked) {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.001);
        this.isUnlocked = true;
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Preload and cache decoded AudioBuffer for 0ms latency playback
   */
  async loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(url)) {
      return this.bufferCache.get(url)!;
    }
    if (this.pendingFetches.has(url)) {
      return this.pendingFetches.get(url)!;
    }

    const fetchPromise = (async () => {
      try {
        const ctx = this.getContext();
        if (!ctx) return null;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(arrayBuf);
        this.bufferCache.set(url, audioBuf);
        return audioBuf;
      } catch {
        return null;
      } finally {
        this.pendingFetches.delete(url);
      }
    })();

    this.pendingFetches.set(url, fetchPromise);
    return fetchPromise;
  }

  /**
   * Play decoded WebAudio buffer with HTMLAudioElement fallback
   */
  playBuffer(url: string, volumeScale = 1.0, fallbackChime = 2): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    if (this.bufferCache.has(url)) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.bufferCache.get(url)!;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * volumeScale, ctx.currentTime);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
        return;
      } catch {
        // Fallback
      }
    }

    this.loadAudioBuffer(url).then((buf) => {
      if (buf && ctx.state === 'running') {
        try {
          const source = ctx.createBufferSource();
          source.buffer = buf;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(this.sfxVolume * volumeScale, ctx.currentTime);
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start(0);
          return;
        } catch {
          // Fallback
        }
      }
      try {
        const audio = new Audio(url);
        audio.volume = Math.min(1.0, this.sfxVolume * volumeScale);
        audio.play().catch(() => {
          if (fallbackChime) this.playPowerChime(fallbackChime as 2 | 4);
        });
      } catch {
        if (fallbackChime) this.playPowerChime(fallbackChime as 2 | 4);
      }
    });
  }

  private getContext(): AudioContext | null {
    if (!this.enabled && !this.bgmEnabled) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    localStorage.setItem('h5_audio_enabled', String(this.enabled));
    if (this.enabled) {
      this.playTap(700);
    } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return this.enabled;
  }

  getBgmVolume(): number {
    return this.bgmVolume;
  }

  setBgmVolume(val: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('h5_bgm_volume', String(this.bgmVolume));
    if (this.lobbyAudio) {
      this.lobbyAudio.volume = this.bgmVolume;
    }
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  setSfxVolume(val: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    localStorage.setItem('h5_sfx_volume', String(this.sfxVolume));
  }

  toggleBgm(): boolean {
    this.bgmEnabled = !this.bgmEnabled;
    localStorage.setItem('h5_bgm_enabled', String(this.bgmEnabled));
    if (this.bgmEnabled) {
      const targetMode = this.bgmMode ?? 'table';
      this.bgmMode = null;
      this.startBgm(targetMode);
    } else {
      this.stopBgmLoopOnly();
    }
    return this.bgmEnabled;
  }

  /**
   * Start Chinese Pentatonic BGM Sequencer or play authentic lobby audio file.
   */
  startBgm(mode: 'lobby' | 'table'): void {
    if (this.bgmMode === mode && (this.bgmTimer !== null || (this.lobbyAudio && !this.lobbyAudio.paused))) return;
    this.bgmMode = mode;
    this.stopBgmLoopOnly();
    if (!this.bgmEnabled) return;

    if (mode === 'lobby') {
      try {
        if (!this.lobbyAudio) {
          this.lobbyAudio = new Audio('/assets/audio/bgm_lobby.wav');
          this.lobbyAudio.loop = true;
        }
        this.lobbyAudio.volume = this.bgmVolume;
        const playPromise = this.lobbyAudio.play();
        if (playPromise) {
          playPromise.catch(() => {
            // If browser autoplay policies block audio element, fallback to WebAudio sequencer
            this.startSynthesizedBgm('lobby');
          });
        }
        return;
      } catch {
        // Fallback to WebAudio sequencer
      }
    }

    this.startSynthesizedBgm(mode);
  }

  private startSynthesizedBgm(mode: 'lobby' | 'table'): void {
    // Pentatonic frequencies (C4, D4, E4, G4, A4, C5, D5, E5, G5, A5, C6)
    const lobbyMelody = [
      523.25, 659.25, 587.33, 523.25, 440.0, 523.25, 392.0, 0,
      440.0, 523.25, 587.33, 659.25, 587.33, 523.25, 440.0, 0,
    ];
    const tableMelody = [
      659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25, 587.33,
      659.25, 659.25, 783.99, 880.0, 1046.5, 880.0, 783.99, 0,
      587.33, 659.25, 783.99, 659.25, 523.25, 440.0, 392.0, 440.0,
      523.25, 587.33, 659.25, 587.33, 523.25, 392.0, 523.25, 0,
    ];
    const bassNotes = [261.63, 196.0, 220.0, 196.0];

    const stepMs = mode === 'table' ? 230 : 340;
    this.bgmStep = 0;

    this.bgmTimer = window.setInterval(() => {
      if (!this.bgmEnabled) return;
      const ctx = this.getContext();
      if (!ctx || ctx.state !== 'running') return;

      const seq = this.bgmMode === 'table' ? tableMelody : lobbyMelody;
      const note = seq[this.bgmStep % seq.length];
      const now = ctx.currentTime;
      const volMultiplier = this.bgmVolume;

      // Plucked Pipa / GuZheng lead note
      if (note > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.028 * volMultiplier, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.29);
      }

      // Warm plucked bass on every 4th step
      if (this.bgmStep % 4 === 0) {
        const bassFreq = bassNotes[(this.bgmStep / 4) % bassNotes.length];
        const bOsc = ctx.createOscillator();
        const bGain = ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bassFreq, now);

        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(0.024 * volMultiplier, now + 0.02);
        bGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.45);

        bOsc.connect(bGain);
        bGain.connect(ctx.destination);
        bOsc.start(now);
        bOsc.stop(now + 0.46);
      }

      this.bgmStep += 1;
    }, stepMs);
  }

  private stopBgmLoopOnly(): void {
    if (this.lobbyAudio) {
      try {
        this.lobbyAudio.pause();
        this.lobbyAudio.currentTime = 0;
      } catch {}
    }
    if (this.bgmTimer !== null) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  stopBgm(): void {
    this.bgmMode = null;
    this.stopBgmLoopOnly();
  }

  /** Play treasure chest open sound */
  playChestOpen(): void {
    if (!this.enabled) return;
    try {
      const audio = new Audio('/assets/audio/sfx_chest_open.wav');
      audio.volume = this.sfxVolume;
      audio.play().catch(() => {
        this.playPowerChime(2);
      });
    } catch {
      this.playPowerChime(2);
    }
  }

  /** Play Mahjong audio helper with WebAudio buffer caching and graceful fallback */
  playMahjongAudio(fileName: string, fallbackChime = 2): void {
    if (!this.enabled) return;
    this.playBuffer(`/assets/mahjong/audio/${fileName}`, 1.0, fallbackChime);
  }

  playMahjongDeal(): void {
    this.playMahjongAudio('Sepcial_Mahjong_Deal.wav');
  }

  playMahjongDraw(): void {
    this.playMahjongAudio('Sepcial_Mahjong_DrawCard.wav');
  }

  playMahjongGive(): void {
    this.playMahjongAudio('Sepcial_Mahjong_GiveCard.wav');
  }

  playMahjongWild(): void {
    this.playMahjongAudio('Sepcial_Mahjong_DrawGiveWild.wav', 4);
  }

  playMahjongBeanFly(): void {
    this.playMahjongAudio('Sepcial_Mahjong_BeanFly.wav');
  }

  playDiceRoll(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    [0, 0.07, 0.15, 0.24, 0.35].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 450, ctx.currentTime + t);
      gain.gain.setValueAtTime(0.09 / (i + 1), ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.05);
    });
  }

  playMahjongWin(isZimo = false): void {
    this.playMahjongAudio(
      isZimo ? 'Sepcial_Mahjong_Win_Zimo.wav' : 'Sepcial_Mahjong_Win.wav',
      4
    );
  }

  private activeMjVoiceSource: AudioBufferSourceNode | null = null;
  private activeMjVoiceAudio: HTMLAudioElement | null = null;
  private activeMjVoicePriority: number = 0;

  /**
   * Clear any active or queued Mahjong voice playback (called on leave room / new deal)
   */
  clearMahjongVoiceQueue(): void {
    this.activeMjVoicePriority = 0;
    if (this.activeMjVoiceSource) {
      try {
        this.activeMjVoiceSource.onended = null;
        this.activeMjVoiceSource.stop();
        this.activeMjVoiceSource.disconnect();
      } catch {
        // Ignored
      }
      this.activeMjVoiceSource = null;
    }
    if (this.activeMjVoiceAudio) {
      try {
        this.activeMjVoiceAudio.onended = null;
        this.activeMjVoiceAudio.pause();
        this.activeMjVoiceAudio.currentTime = 0;
      } catch {
        // Ignored
      }
      this.activeMjVoiceAudio = null;
    }
  }

  /**
   * Play Mahjong voice line from reference audio library (female/male) via exclusive priority channel.
   * Priority levels:
   * - 1: Tile discard readout (mjt*.mp3)
   * - 2: Peng / Gang action callout
   * - 3: Hu / Zimo victory callout
   */
  playMahjongVoice(fileName: string, gender: 'female' | 'male' = 'female', priority = 1): void {
    if (!this.enabled) return;

    // Do not let a low-priority tile readout interrupt an ongoing Peng/Gang/Hu callout
    const isBusy = this.activeMjVoiceSource !== null || this.activeMjVoiceAudio !== null;
    if (isBusy && priority < this.activeMjVoicePriority) {
      return;
    }

    const url = `/assets/mahjong/audio/voice/${gender}/${fileName}`;
    this.clearMahjongVoiceQueue();
    this.activeMjVoicePriority = priority;

    const ctx = this.getContext();
    if (ctx && this.bufferCache.has(url)) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.bufferCache.get(url)!;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * 1.25, ctx.currentTime);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
          if (this.activeMjVoiceSource === source) {
            this.activeMjVoiceSource = null;
            this.activeMjVoicePriority = 0;
          }
        };
        this.activeMjVoiceSource = source;
        source.start(0);
        return;
      } catch {
        // Fallback below
      }
    }

    this.loadAudioBuffer(url).then((buf) => {
      if (!this.enabled) return;
      if (
        (this.activeMjVoiceSource !== null || this.activeMjVoiceAudio !== null) &&
        priority < this.activeMjVoicePriority
      ) {
        return;
      }
      if (buf && ctx && ctx.state === 'running') {
        try {
          this.clearMahjongVoiceQueue();
          this.activeMjVoicePriority = priority;
          const source = ctx.createBufferSource();
          source.buffer = buf;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(this.sfxVolume * 1.25, ctx.currentTime);
          source.connect(gain);
          gain.connect(ctx.destination);
          source.onended = () => {
            if (this.activeMjVoiceSource === source) {
              this.activeMjVoiceSource = null;
              this.activeMjVoicePriority = 0;
            }
          };
          this.activeMjVoiceSource = source;
          source.start(0);
          return;
        } catch {
          // Fallback below
        }
      }
      try {
        this.clearMahjongVoiceQueue();
        this.activeMjVoicePriority = priority;
        const audio = new Audio(url);
        audio.volume = Math.min(1.0, this.sfxVolume * 1.25);
        audio.onended = () => {
          if (this.activeMjVoiceAudio === audio) {
            this.activeMjVoiceAudio = null;
            this.activeMjVoicePriority = 0;
          }
        };
        this.activeMjVoiceAudio = audio;
        audio.play().catch(() => {
          if (this.activeMjVoiceAudio === audio) {
            this.activeMjVoiceAudio = null;
            this.activeMjVoicePriority = 0;
          }
        });
      } catch {
        this.activeMjVoicePriority = 0;
      }
    });
  }

  /**
   * Speak discarded tile name using reference Mahjong sound bank.
   * Maps legacy IDs (1..9 万, 11..19 条, 21..29 筒, 41..44 东南西北, 31/45 中, 46 发, 47 白)
   * or continuous 0..33 indices to Cocos official mjt audio files:
   * 万 (0..8): mjt2_1.mp3 .. mjt2_9.mp3
   * 条 (9..17): mjt3_1.mp3 .. mjt3_9.mp3
   * 筒 (18..26): mjt1_1.mp3 .. mjt1_9.mp3
   * 东南西北 (27..30): mjt4_1.mp3 .. mjt4_4.mp3
   * 中发白 (31..33): mjt4_5.mp3 .. mjt4_7.mp3
   */
  playTileVoice(tileId: number, gender: 'female' | 'male' = 'female'): void {
    if (!this.enabled) return;
    const idx = legacyIdToTileIndex(tileId);
    let fileName = '';

    if (idx >= 0 && idx <= 8) {
      // 0..8: 一万 ~ 九万 -> mjt2_1.mp3 .. mjt2_9.mp3
      fileName = `mjt2_${idx + 1}.mp3`;
    } else if (idx >= 9 && idx <= 17) {
      // 9..17: 一条 ~ 九条 -> mjt3_1.mp3 .. mjt3_9.mp3
      fileName = `mjt3_${idx - 9 + 1}.mp3`;
    } else if (idx >= 18 && idx <= 26) {
      // 18..26: 一筒 ~ 九筒 -> mjt1_1.mp3 .. mjt1_9.mp3
      fileName = `mjt1_${idx - 18 + 1}.mp3`;
    } else if (idx >= 27 && idx <= 30) {
      // 27..30: 东南西北 -> mjt4_1.mp3 .. mjt4_4.mp3
      fileName = `mjt4_${idx - 27 + 1}.mp3`;
    } else if (idx === 31) {
      // 31: 红中 -> mjt4_5.mp3
      fileName = 'mjt4_5.mp3';
    } else if (idx === 32) {
      // 32: 发财 -> mjt4_6.mp3
      fileName = 'mjt4_6.mp3';
    } else if (idx === 33) {
      // 33: 白板 -> mjt4_7.mp3
      fileName = 'mjt4_7.mp3';
    }

    if (fileName) {
      this.playMahjongVoice(fileName, gender, 1);
    }
  }

  /**
   * Action voice callout: 碰、杠、胡、自摸 (higher priority than tile discard readout)
   */
  playActionVoice(action: 'peng' | 'gang' | 'hu' | 'zimo', gender: 'female' | 'male' = 'female'): void {
    if (!this.enabled) return;
    const priority = action === 'hu' || action === 'zimo' ? 3 : 2;
    this.playMahjongVoice(`${action}.mp3`, gender, priority);
  }

  /**
   * Niuniu (Bullfight) Casino Audio System
   */
  playNiuniuChip(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    // Multi-hit metallic clay casino chips clink
    [0, 0.04, 0.09].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400 + Math.random() * 600, ctx.currentTime + t);
      gain.gain.setValueAtTime(0.12 / (i + 1), ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.07);
    });
  }

  playNiuniuDeal(): void {
    this.playMahjongDeal();
  }

  playNiuniuCall(): void {
    this.playTap(780);
  }

  playNiuniuHandReveal(level: number): void {
    if (!this.enabled) return;
    if (level >= 10) {
      // Niu Niu or special hands (Five Small, Bomb, Gold, Silver) -> Grand fanfare
      this.playPowerChime(4);
      setTimeout(() => this.playPowerChime(6), 180);
    } else if (level >= 7) {
      // Niu 7 ~ 9
      this.playPowerChime(3);
    } else if (level > 0) {
      // Niu 1 ~ 6
      this.playPowerChime(2);
    } else {
      // No Niu
      this.playTap(320);
    }
  }

  /**
   * Preload critical Mahjong sounds for instant responsive playback
   */
  preloadMahjongAudio(): void {
    const sfxList = [
      'Sepcial_Mahjong_Deal.wav',
      'Sepcial_Mahjong_DrawCard.wav',
      'Sepcial_Mahjong_GiveCard.wav',
      'Sepcial_Mahjong_BeanFly.wav',
      'Sepcial_Mahjong_Win.wav',
      'Sepcial_Mahjong_Win_Zimo.wav',
    ];
    sfxList.forEach((f) => this.loadAudioBuffer(`/assets/mahjong/audio/${f}`));
    ['female', 'male'].forEach((g) => {
      ['hu.mp3', 'peng.mp3', 'gang.mp3', 'zimo.mp3'].forEach((a) => {
        this.loadAudioBuffer(`/assets/mahjong/audio/voice/${g}/${a}`);
      });
    });
  }

  private queuedVoiceFile: { fileName: string; volumeScale: number } | null = null;

  /** Stop any currently playing voice line so consecutive turn announcements never overlap */
  private stopActiveVoice(clearQueue = true): void {
    if (clearQueue) {
      this.queuedVoiceFile = null;
    }
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.onended = null;
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // Ignored
      }
      this.activeVoiceSource = null;
    }
    if (this.activeVoiceAudio) {
      try {
        this.activeVoiceAudio.onended = null;
        this.activeVoiceAudio.pause();
        this.activeVoiceAudio.currentTime = 0;
      } catch {
        // Ignored
      }
      this.activeVoiceAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignored
      }
    }
  }

  private flushQueuedVoice(): void {
    if (!this.queuedVoiceFile || !this.enabled) return;
    const next = this.queuedVoiceFile;
    this.queuedVoiceFile = null;
    this.playDdzVoice(next.fileName, next.volumeScale, false);
  }

  /** Play Dou Dizhu SFX audio on concurrent buffer channel */
  playDdzAudio(fileName: string, volumeScale = 1.0, fallbackChime = 2): void {
    if (!this.enabled) return;
    this.playBuffer(`/assets/audio/ddz/${fileName}`, volumeScale, fallbackChime);
  }

  /**
   * Play Dou Dizhu voice clip on exclusive voice channel.
   * If `enqueueIfBusy` is true (used for secondary alerts like `baojing1`/`baojing2`),
   * waits for the current card-reading voice clip to finish before speaking.
   */
  playDdzVoice(fileName: string, volumeScale = 1.25, enqueueIfBusy = false): void {
    if (!this.enabled) return;

    if (enqueueIfBusy && (this.activeVoiceSource !== null || this.activeVoiceAudio !== null)) {
      this.queuedVoiceFile = { fileName, volumeScale };
      return;
    }

    const url = `/assets/audio/ddz/${fileName}`;
    this.stopActiveVoice(true);

    const ctx = this.getContext();
    if (ctx && this.bufferCache.has(url)) {
      try {
        const source = ctx.createBufferSource();
        source.buffer = this.bufferCache.get(url)!;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this.sfxVolume * volumeScale, ctx.currentTime);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
          if (this.activeVoiceSource === source) {
            this.activeVoiceSource = null;
            this.flushQueuedVoice();
          }
        };
        this.activeVoiceSource = source;
        source.start(0);
        return;
      } catch {
        // Fallback below
      }
    }

    this.loadAudioBuffer(url).then((buf) => {
      if (!this.enabled) return;
      if (buf && ctx && ctx.state === 'running') {
        try {
          this.stopActiveVoice(false);
          const source = ctx.createBufferSource();
          source.buffer = buf;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(this.sfxVolume * volumeScale, ctx.currentTime);
          source.connect(gain);
          gain.connect(ctx.destination);
          source.onended = () => {
            if (this.activeVoiceSource === source) {
              this.activeVoiceSource = null;
              this.flushQueuedVoice();
            }
          };
          this.activeVoiceSource = source;
          source.start(0);
          return;
        } catch {
          // Fallback below
        }
      }
      try {
        this.stopActiveVoice(false);
        const audio = new Audio(url);
        audio.volume = Math.min(1.0, this.sfxVolume * volumeScale);
        audio.onended = () => {
          if (this.activeVoiceAudio === audio) {
            this.activeVoiceAudio = null;
            this.flushQueuedVoice();
          }
        };
        this.activeVoiceAudio = audio;
        audio.play().catch(() => {
          if (this.activeVoiceAudio === audio) {
            this.activeVoiceAudio = null;
          }
        });
      } catch {
        // Ignored
      }
    });
  }

  /**
   * Maps Dou Dizhu internal rank value (3..17) to standard poker audio index (1..15):
   * - 14 ('A') -> 1 (1.wav / dui1.wav / tuple1.wav)
   * - 15 ('2') -> 2 (2.wav / dui2.wav / tuple2.wav)
   * - 3..13 ('3'..'K') -> 3..13 (3.wav..13.wav / dui3.wav..dui13.wav / tuple3.wav..tuple13.wav)
   * - 16 ('small_joker') -> 14 (14.wav)
   * - 17 ('big_joker') -> 15 (15.wav)
   */
  private ddzValueToAudioIndex(mainValue: number): number {
    if (mainValue === 14) return 1;
    if (mainValue === 15) return 2;
    if (mainValue === 16) return 14;
    if (mainValue === 17) return 15;
    return Math.max(3, Math.min(13, Math.round(mainValue)));
  }

  /** Play Dou Dizhu read voice for played card pattern */
  playDdzCardVoice(
    patternType: string,
    mainValue: number,
    _seatIndex?: number,
    _mySeat?: number
  ): void {
    if (!this.enabled) return;
    const audioIdx = this.ddzValueToAudioIndex(mainValue);

    // 1. Single card: A->1.wav, 2->2.wav, 3..K->3..13.wav, small_joker->14.wav, big_joker->15.wav
    if (patternType === 'SINGLE') {
      this.playDdzVoice(`${audioIdx}.wav`, 1.25);
      return;
    }

    // 2. Pair: A->dui1.wav, 2->dui2.wav, 3..K->dui3..dui13.wav
    if (patternType === 'PAIR' && audioIdx >= 1 && audioIdx <= 13) {
      this.playDdzVoice(`dui${audioIdx}.wav`, 1.25);
      return;
    }

    // 3. Triple without wings: A->tuple1.wav, 2->tuple2.wav, 3..K->tuple3..tuple13.wav
    if (patternType === 'TRIPLE' && audioIdx >= 1 && audioIdx <= 13) {
      this.playDdzVoice(`tuple${audioIdx}.wav`, 1.25);
      return;
    }

    // 4. Special Patterns
    switch (patternType) {
      case 'TRIPLE_SINGLE':
        this.playDdzVoice('sandaiyi.wav', 1.3);
        break;
      case 'TRIPLE_PAIR':
        this.playDdzVoice('sandaiyidui.wav', 1.3);
        break;
      case 'STRAIGHT':
        this.playDdzVoice('shunzi.wav', 1.3);
        break;
      case 'CONSECUTIVE_PAIRS':
        this.playDdzVoice('liandui.wav', 1.3);
        break;
      case 'AIRPLANE':
      case 'AIRPLANE_SINGLE_WINGS':
      case 'AIRPLANE_PAIR_WINGS':
        this.playDdzVoice('feiji.wav', 1.35);
        setTimeout(() => this.playDdzSfx('plane'), 120);
        break;
      case 'FOUR_WITH_TWO_SINGLES':
        this.playDdzVoice('sidaier.wav', 1.3);
        break;
      case 'FOUR_WITH_TWO_PAIRS':
        this.playDdzVoice('sidailiangdui.wav', 1.3);
        break;
      case 'BOMB':
        this.playDdzVoice('zhadan.wav', 1.4);
        setTimeout(() => this.playDdzSfx('bomb'), 160);
        break;
      case 'ROCKET':
        this.playDdzVoice('wangzha.wav', 1.45);
        setTimeout(() => this.playDdzSfx('bomb'), 240);
        break;
    }
  }

  /** Play Dou Dizhu action voices: 不出/过、加倍、不加倍、报警 */
  playDdzActionVoice(
    action: 'pass' | 'jiabei' | 'bujiabei' | 'chaojijiabei' | 'baojing1' | 'baojing2',
    _seatIndex?: number,
    _mySeat?: number
  ): void {
    if (!this.enabled) return;
    switch (action) {
      case 'pass': {
        const rand = 1 + Math.floor(Math.random() * 4);
        this.playDdzVoice(`buyao${rand}.wav`, 1.2);
        break;
      }
      case 'jiabei':
        this.playDdzVoice('jiabei.wav', 1.25);
        break;
      case 'bujiabei':
        this.playDdzVoice('bujiabei.wav', 1.2);
        break;
      case 'chaojijiabei':
        this.playDdzVoice('chaojijiabei.wav', 1.3);
        break;
      case 'baojing1':
        this.playDdzVoice('baojing1.wav', 1.3, true);
        break;
      case 'baojing2':
        this.playDdzVoice('baojing2.wav', 1.3, true);
        break;
    }
  }

  /** Play Dou Dizhu SFX */
  playDdzSfx(
    sfx: 'bomb' | 'plane' | 'spring' | 'dispatch' | 'discard' | 'landlord' | 'alert',
    _seatIndex?: number,
    _mySeat?: number
  ): void {
    if (!this.enabled) return;
    switch (sfx) {
      case 'bomb':
        this.playDdzAudio('Special_Bomb_New.wav', 1.0);
        break;
      case 'plane':
        this.playDdzAudio('Special_plane.wav', 0.95);
        break;
      case 'spring':
        this.playDdzAudio('Special_Chuntian.wav', 1.1);
        break;
      case 'dispatch':
        this.playDdzAudio('Special_Dispatch_2D.wav', 0.85);
        break;
      case 'discard':
        this.playDdzAudio('Special_Discard.wav', 0.55);
        break;
      case 'landlord':
        this.playDdzAudio('Special_querendizhu.wav', 1.1);
        break;
      case 'alert':
        this.playDdzAudio('Special_alert.wav', 1.0);
        break;
    }
  }

  /** Preload all Dou Dizhu card voices & SFX for 0ms latency playback */
  preloadDdzAudio(): void {
    const list = [
      'Special_Bomb_New.wav',
      'Special_plane.wav',
      'Special_Chuntian.wav',
      'Special_Dispatch_2D.wav',
      'Special_Discard.wav',
      'Special_querendizhu.wav',
      'Special_alert.wav',
      'shunzi.wav',
      'liandui.wav',
      'feiji.wav',
      'zhadan.wav',
      'wangzha.wav',
      'sandaiyi.wav',
      'sandaier.wav',
      'sandaiyidui.wav',
      'sidaier.wav',
      'sidailiangdui.wav',
      'buyao1.wav',
      'buyao2.wav',
      'buyao3.wav',
      'buyao4.wav',
      'jiabei.wav',
      'bujiabei.wav',
      'chaojijiabei.wav',
      'baojing1.wav',
      'baojing2.wav',
    ];
    for (let i = 1; i <= 15; i++) {
      list.push(`${i}.wav`);
      if (i <= 13) {
        list.push(`dui${i}.wav`);
        list.push(`tuple${i}.wav`);
      }
    }
    list.forEach((f) => this.loadAudioBuffer(`/assets/audio/ddz/${f}`));
  }

  /** Crisp UI or card selection tap */
  playTap(freq = 640): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.38, now + 0.055);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  /** Realistic rapid card Riffle Shuffle sound (dealing start) */
  playRiffleShuffle(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const start = now + i * 0.042;
      const bufferSize = Math.floor(ctx.sampleRate * 0.032);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) {
        data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.35));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100 + i * 140, start);
      filter.Q.setValueAtTime(1.8, start);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.005, start + 0.032);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(start);
    }
  }

  /** Crisp single card fly/slide sound during staggered dealing */
  playCardFly(index = 0): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.028);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let j = 0; j < bufferSize; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.35));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1250 + (index % 10) * 65, now);
    filter.Q.setValueAtTime(2.0, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.028);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  /** Realistic physical card slap onto mahogany felt table */
  playCardPlace(isHeavy = false): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Paper snap noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.065);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isHeavy ? 950 : 1350, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isHeavy ? 0.24 : 0.17, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // 2. Wooden table resonance thump
    const thump = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(isHeavy ? 155 : 210, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.08);
    thumpGain.gain.setValueAtTime(isHeavy ? 0.22 : 0.12, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    thump.connect(thumpGain);
    thumpGain.connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.09);
  }

  /** Countdown urgent woodblock tick for final 5 seconds */
  playCountdownTick(urgent = false): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(urgent ? 980 : 740, now);
    osc.frequency.exponentialRampToValueAtTime(urgent ? 520 : 420, now + 0.045);

    gain.gain.setValueAtTime(urgent ? 0.12 : 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /** Ascending GuZheng glissando for Straight & Consecutive Pairs */
  playGlissando(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);

      gain.gain.setValueAtTime(0.09, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.23);
    });
  }

  /** Airplane flyby Doppler whoosh + heroic chord */
  playAirplaneFlyby(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.65);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1450, now + 0.32);
    filter.frequency.exponentialRampToValueAtTime(280, now + 0.65);
    filter.Q.setValueAtTime(2.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    this.playGlissando();
  }

  /** Bomb fuse sizzle + deep sub-bass explosion */
  playHeavyImpact(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Sub-bass cannon boom
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.48);

    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);

    // Explosion debris crackle
    const bufferSize = Math.floor(ctx.sampleRate * 0.38);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.32));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.24, now);
    nGain.gain.exponentialRampToValueAtTime(0.005, now + 0.38);
    noise.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  /** Rocket (王炸) siren + launch ascent + nuclear impact */
  playRocketLaunch(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Ascending rocket turbine whistle
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(1680, now + 0.34);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);

    // Impact explosion at 320ms
    setTimeout(() => {
      this.playHeavyImpact();
    }, 310);
  }

  /** Power-up chord for Doubling (×2, ×3, ×4+) */
  playPowerChime(level: number = 2): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs =
      level >= 4
        ? [523.25, 659.25, 783.99, 1046.5]
        : level === 3
        ? [493.88, 622.25, 739.99]
        : [440, 554.37, 659.25];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.055);
      gain.gain.setValueAtTime(0.12, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.29);
    });
  }

  /** Whoosh + chime for interactive prop throw */
  playPropWhoosh(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  /** Impact sound when an interactive prop lands on target avatar */
  playPropImpact(isExplosive: boolean): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (isExplosive) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.34);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.37);
      return;
    }

    const notes = [659.25, 880, 1046.5];
    notes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      gain.gain.setValueAtTime(0.09, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.23);
    });
  }

  /** Metallic Gold Bean Coin Cascade on Settlement */
  playCoinCascade(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const coinFreqs = [1318.5, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02];
    for (let i = 0; i < 10; i++) {
      const start = now + i * 0.055;
      const freq = coinFreqs[i % coinFreqs.length];
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.075, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  }

  /** Victory fanfare + coin cascade */
  playVictoryFanfare(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const chord = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.09);
      gain.gain.setValueAtTime(0.14, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.46);
    });
    setTimeout(() => this.playCoinCascade(), 250);
  }

  /** Defeat tone */
  playDefeatTone(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const notes = [392.0, 349.23, 329.63, 261.63];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.1, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.36);
    });
  }

  /**
   * Expressive Chinese Card Play Voice Announcer.
   * Translates single/pair card ranks into authentic Chinese callouts ("单A", "对2", "小王", "大王", "炸弹！")
   * and modulates pitch/rate for high-excitement patterns.
   */
  speakCardPlay(
    patternType: string,
    cards: Array<{ rank: string; value: number }> | undefined,
    fallbackLabel: string
  ): void {
    if (!this.enabled) return;

    const firstRank = cards && cards.length > 0 ? cards[0].rank : '';
    const rankSpokenMap: Record<string, string> = {
      '3': '三',
      '4': '四',
      '5': '五',
      '6': '六',
      '7': '七',
      '8': '八',
      '9': '九',
      '10': '十',
      J: '勾',
      Q: '圈',
      K: 'K',
      A: '尖',
      '2': '二',
      small_joker: '小王',
      big_joker: '大王',
    };

    let phrase = fallbackLabel;
    let excitement: 'normal' | 'high' | 'epic' = 'normal';

    if (patternType === 'SINGLE' && firstRank) {
      phrase =
        firstRank === 'small_joker' || firstRank === 'big_joker'
          ? rankSpokenMap[firstRank]
          : `${rankSpokenMap[firstRank] || firstRank}`;
      if (firstRank === '2' || firstRank === 'small_joker' || firstRank === 'big_joker') {
        excitement = 'high';
      }
    } else if (patternType === 'PAIR' && firstRank) {
      phrase = `对${rankSpokenMap[firstRank] || firstRank}`;
      if (firstRank === '2' || firstRank === 'A') excitement = 'high';
    } else if (patternType === 'ROCKET') {
      phrase = '王炸！';
      excitement = 'epic';
    } else if (patternType === 'BOMB') {
      phrase = '炸弹！';
      excitement = 'epic';
    } else if (
      patternType === 'STRAIGHT' ||
      patternType === 'CONSECUTIVE_PAIRS' ||
      patternType.startsWith('AIRPLANE')
    ) {
      excitement = 'high';
    }

    this.speak(phrase, excitement);
  }

  /** Web Speech API Chinese voice announcer with excitement modulation */
  speak(text: string, excitement: 'normal' | 'high' | 'epic' = 'normal'): void {
    if (!this.enabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'zh-CN';
      utter.rate = excitement === 'epic' ? 1.18 : excitement === 'high' ? 1.24 : 1.3;
      utter.pitch = excitement === 'epic' ? 1.22 : excitement === 'high' ? 1.14 : 1.06;
      utter.volume = excitement === 'epic' ? 1.0 : 0.85;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore speech synthesis errors on restricted browsers
    }
  }

  // =========================================================================
  // Yunnan Lao Yan Cai (捞腌菜) Special Hand Audio & Sequential Queue
  // =========================================================================
  private lycQueueTimers: number[] = [];

  clearLaoYanCaiAudioQueue(): void {
    if (typeof window === 'undefined') return;
    for (const t of this.lycQueueTimers) {
      window.clearTimeout(t);
    }
    this.lycQueueTimers = [];
  }

  /**
   * 豹子 (Three of a Kind) Ceremonial SFX:
   * Sub-bass shockwave + 5-note golden dragon pentatonic fanfare + coin cascade
   */
  playLaoYanCaiBaoziSfx(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    this.playHeavyImpact();

    const now = ctx.currentTime;
    // Ascending pentatonic royal fanfare: C5 - D5 - E5 - G5 - C6
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const start = now + 0.08 + idx * 0.065;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.18 * this.sfxVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.44);
    });

    if (typeof window !== 'undefined') {
      const t = window.setTimeout(() => this.playCoinCascade(), 320);
      this.lycQueueTimers.push(t);
    }
  }

  /**
   * 三公 (Three Face Cards J/Q/K) Ceremonial SFX:
   * Imperial court harmonic chime + triumphant brass-like chord
   */
  playLaoYanCaiSanGongSfx(): void {
    if (!this.enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Imperial gong harmonic shimmer + major triad (G4 - B4 - D5 - G5)
    const freqs = [392.0, 493.88, 587.33, 783.99, 987.77];
    freqs.forEach((freq, idx) => {
      const start = now + idx * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15 * this.sfxVolume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    if (typeof window !== 'undefined') {
      const t = window.setTimeout(() => this.playPowerChime(4), 220);
      this.lycQueueTimers.push(t);
    }
  }

  /**
   * Queues and plays Lao Yan Cai special hand announcements & SFX in priority order
   * so multiple special hands (豹子 / 三公 / 同花顺 / 天牌炸开) play sequentially with ceremonial pacing.
   */
  playLaoYanCaiShowdownQueue(
    items: Array<{
      category: string;
      handName: string;
      multiplier: number;
      nickname?: string;
      isWinner?: boolean;
    }>
  ): void {
    if (!this.enabled || typeof window === 'undefined') return;
    this.clearLaoYanCaiAudioQueue();

    const priorityWeight: Record<string, number> = {
      BAOZI: 100,
      STRAIGHT_FLUSH: 85,
      SANGONG: 75,
      NATURAL_9: 60,
      NATURAL_8: 55,
      SANYAN: 40,
    };

    const sorted = [...items].sort(
      (a, b) =>
        (priorityWeight[b.category] || 10) - (priorityWeight[a.category] || 10)
    );

    // If no special hand in the round, play standard showdown chime
    if (sorted.length === 0) {
      this.playCardPlace(true);
      return;
    }

    sorted.slice(0, 3).forEach((item, index) => {
      const delayMs = index * 920;
      const timerId = window.setTimeout(() => {
        if (!this.enabled) return;
        if (item.category === 'BAOZI') {
          this.playLaoYanCaiBaoziSfx();
          this.speak(`${item.handName}，${item.multiplier}倍暴击！`, 'epic');
        } else if (item.category === 'SANGONG') {
          this.playLaoYanCaiSanGongSfx();
          this.speak(`三公驾到，${item.multiplier}倍翻番！`, 'epic');
        } else if (item.category === 'STRAIGHT_FLUSH') {
          this.playPowerChime(4);
          this.speak(`同花顺，${item.multiplier}倍！`, 'epic');
        } else if (
          item.category === 'NATURAL_9' ||
          item.category === 'NATURAL_8'
        ) {
          this.playPowerChime(3);
          this.speak(`${item.handName}`, 'high');
        } else if (item.category === 'SANYAN') {
          this.playPowerChime(3);
          this.speak(`${item.handName}，三倍！`, 'high');
        }
      }, delayMs);
      this.lycQueueTimers.push(timerId);
    });
  }
}

export const soundEngine = new SoundEngine();
