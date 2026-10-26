import {
  SOUND_MANIFEST,
  DDZ_PRELOAD_MANIFEST,
  MAHJONG_PRELOAD_MANIFEST,
  resolveDdzCardVoicePath,
  resolveDdzActionVoicePath,
  resolveDdzQuickChatVoicePath,
  resolveMahjongTileVoicePath,
  type BgmMode,
  type DdzActionVoiceType,
  type DdzSfxType,
  type MahjongActionVoiceType,
  type VoiceGender,
} from './SoundManifest';

const SOUND_STORAGE_KEY = 'cardgame_sound_enabled_v1';
const BGM_STORAGE_KEY = 'cardgame_bgm_enabled_v1';
const BGM_VOLUME_KEY = 'cardgame_bgm_volume_v1';
const SFX_VOLUME_KEY = 'cardgame_sfx_volume_v1';

/**
 * Tier-0 High-Frequency SFX paths that are pinned in the LRU cache (never evicted)
 * and pre-fetched as raw ArrayBuffers immediately upon module instantiation—even before
 * `AudioContext` is unlocked—eliminating any network or decode frame drops on table entry.
 */
const PINNED_HIGH_FREQ_PATHS: readonly string[] = [
  SOUND_MANIFEST.ddzSfx.deal,
  SOUND_MANIFEST.ddzSfx.cardTick,
  SOUND_MANIFEST.ddzSfx.cardFan,
  SOUND_MANIFEST.ddzSfx.discard,
  SOUND_MANIFEST.ui.cardSelect,
  SOUND_MANIFEST.ui.click,
  SOUND_MANIFEST.ddzSfx.clock,
  SOUND_MANIFEST.ddzSfx.alert,
  SOUND_MANIFEST.ddzSfx.bomb,
  SOUND_MANIFEST.ddzSfx.rocket,
  SOUND_MANIFEST.ddzSfx.plane,
  SOUND_MANIFEST.ddzSfx.shunzi,
  SOUND_MANIFEST.ddzSfx.liandui,
];

/**
 * Generic O(1) Least Recently Used (LRU) Cache with support for pinned (non-evictable) keys.
 * Uses JavaScript `Map` insertion-order invariants to promote accessed entries to the MRU tail
 * and evict the oldest unpinned entry when capacity is exceeded.
 */
export class LruAudioCache<V> {
  private readonly store = new Map<string, V>();
  private readonly pinnedKeys = new Set<string>();
  private readonly maxEntries: number;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxEntries: number, initialPinnedKeys: Iterable<string> = []) {
    this.maxEntries = Math.max(16, maxEntries);
    for (const k of initialPinnedKeys) {
      this.pinnedKeys.add(k);
    }
  }

  public pin(key: string): void {
    this.pinnedKeys.add(key);
  }

  public isPinned(key: string): boolean {
    return this.pinnedKeys.has(key);
  }

  public has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Retrieves a cached value and promotes its key to Most-Recently-Used (MRU) position.
   */
  public get(key: string): V | undefined {
    const val = this.store.get(key);
    if (val === undefined) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    // Promote to MRU tail by re-inserting
    this.store.delete(key);
    this.store.set(key, val);
    return val;
  }

  /**
   * Inserts or updates a cached value, evicting the Least-Recently-Used non-pinned entry
   * if capacity is exceeded.
   */
  public set(key: string, value: V, pinEntry = false): void {
    if (pinEntry) {
      this.pinnedKeys.add(key);
    }
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      this.evictOldestUnpinned();
    }
    this.store.set(key, value);
  }

  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  public get size(): number {
    return this.store.size;
  }

  public getStats(): {
    size: number;
    maxEntries: number;
    pinnedCount: number;
    hits: number;
    misses: number;
    evictions: number;
  } {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      pinnedCount: this.pinnedKeys.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private evictOldestUnpinned(): void {
    for (const candidateKey of this.store.keys()) {
      if (!this.pinnedKeys.has(candidateKey)) {
        this.store.delete(candidateKey);
        this.evictions++;
        return;
      }
    }
    // Fallback if all entries are pinned: evict the absolute oldest key
    const oldestKey = this.store.keys().next().value;
    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
      this.evictions++;
    }
  }
}

/**
 * SoundEngine — Commercial Production Audio Engine with Two-Stage LRU Pre-caching
 *
 * Strictly zero WebAudio Oscillator synthesis (`createOscillator`), zero procedural noise buffers,
 * and zero browser `speechSynthesis` TTS.
 * 100% of background music (BGM), sound effects (SFX), and male/female character voices (`Man_*` / `Woman_*`)
 * are decoded and played from authentic commercial audio assets mapped in `SoundManifest.ts`.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private bgmEnabled: boolean = true;
  private bgmVolume: number = 0.75;
  private sfxVolume: number = 0.9;
  private bgmMode: BgmMode = 'lobby';
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmHtmlAudio: HTMLAudioElement | null = null;
  private bgmLoadingToken: number = 0;

  // Stage-2 LRU Decoded AudioBuffer cache (capacity: 96 clips, high-frequency SFX pinned)
  private readonly audioBufferCache = new LruAudioCache<AudioBuffer>(96, PINNED_HIGH_FREQ_PATHS);
  // Stage-1 LRU Raw ArrayBuffer pre-cache (warms network bytes BEFORE AudioContext is created)
  private readonly rawByteCache = new LruAudioCache<ArrayBuffer>(64, PINNED_HIGH_FREQ_PATHS);

  private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();
  private rawFetchPromises: Map<string, Promise<ArrayBuffer | null>> = new Map();

  // Concurrency-throttled background preload queue to prevent decode spikes during entry animations
  private preloadQueue: string[] = [];
  private queuedPathsSet: Set<string> = new Set();
  private activePreloadWorkers = 0;
  private readonly maxConcurrentPreloads = 3;

  // Per-clip cooldown tracking (ms) to prevent overlapping clipping during rapid actions
  private lastPlayedAt: Map<string, number> = new Map();

  // Active Mahjong voice timers so `clearMahjongVoiceQueue` can cancel pending queued calls cleanly
  private mahjongVoiceTimers: Set<number> = new Set();

  // Controlled dealing cascade audio nodes so `Special_Dispatch.mp3` never overlaps or overruns dealing
  private dealCascadeSource: AudioBufferSourceNode | null = null;
  private dealCascadeGain: GainNode | null = null;
  private dealFanTimer: number | null = null;
  private coreDealPreloaded: boolean = false;

  constructor() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedSound = window.localStorage.getItem(SOUND_STORAGE_KEY);
        if (savedSound !== null) {
          this.enabled = savedSound !== 'false';
        }
        const savedBgm = window.localStorage.getItem(BGM_STORAGE_KEY);
        if (savedBgm !== null) {
          this.bgmEnabled = savedBgm !== 'false';
        } else {
          this.bgmEnabled = this.enabled;
        }
        const savedBgmVol = window.localStorage.getItem(BGM_VOLUME_KEY);
        if (savedBgmVol !== null) {
          const parsed = parseFloat(savedBgmVol);
          if (!Number.isNaN(parsed)) {
            this.bgmVolume = Math.max(0, Math.min(1, parsed));
          }
        }
        const savedSfxVol = window.localStorage.getItem(SFX_VOLUME_KEY);
        if (savedSfxVol !== null) {
          const parsed = parseFloat(savedSfxVol);
          if (!Number.isNaN(parsed)) {
            this.sfxVolume = Math.max(0, Math.min(1, parsed));
          }
        }
      }
    } catch {
      this.enabled = true;
      this.bgmEnabled = true;
    }
    // Immediately warm Stage-1 raw ArrayBuffer cache for high-frequency dealing & card SFX
    // before any AudioContext user gesture occurs, so initial table entry has zero network wait.
    this.primeHighFrequencyRawBuffers();
  }

  /**
   * Pre-fetches raw `.mp3`/`.wav` bytes into the Stage-1 LRU `rawByteCache` before `AudioContext`
   * initialization completes, ensuring instantaneous `decodeAudioData` once the table mounts.
   */
  private primeHighFrequencyRawBuffers(): void {
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
    const immediateDealPaths = [
      SOUND_MANIFEST.ddzSfx.deal,
      SOUND_MANIFEST.ddzSfx.cardTick,
      SOUND_MANIFEST.ddzSfx.cardFan,
      SOUND_MANIFEST.ddzSfx.discard,
      SOUND_MANIFEST.ui.cardSelect,
      SOUND_MANIFEST.ui.click,
    ];
    for (const path of immediateDealPaths) {
      void this.fetchRawAudioBytes(path, true);
    }
  }

  /**
   * Fetches and caches raw audio bytes in the Stage-1 LRU cache without requiring an active `AudioContext`.
   */
  private async fetchRawAudioBytes(path: string, pin = false): Promise<ArrayBuffer | null> {
    const cachedRaw = this.rawByteCache.get(path);
    if (cachedRaw) return cachedRaw;

    const existing = this.rawFetchPromises.get(path);
    if (existing) return existing;

    const task = (async (): Promise<ArrayBuffer | null> => {
      try {
        const res = await fetch(path);
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        this.rawByteCache.set(path, buf, pin || this.audioBufferCache.isPinned(path));
        return buf;
      } catch {
        return null;
      } finally {
        this.rawFetchPromises.delete(path);
      }
    })();

    this.rawFetchPromises.set(path, task);
    return task;
  }

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
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
    if (this.ctx && !this.coreDealPreloaded) {
      this.coreDealPreloaded = true;
      // Decode pinned Tier-0 dealing & card interaction buffers immediately from pre-fetched raw bytes
      for (const path of [
        SOUND_MANIFEST.ddzSfx.deal,
        SOUND_MANIFEST.ddzSfx.cardTick,
        SOUND_MANIFEST.ddzSfx.cardFan,
        SOUND_MANIFEST.ddzSfx.discard,
        SOUND_MANIFEST.ui.cardSelect,
      ]) {
        void this.loadAudioBuffer(path, true);
      }
      this.pumpPreloadQueue();
    }
    return this.ctx;
  }

  private getSfxMultiplier(): number {
    return this.enabled ? this.sfxVolume : 0;
  }

  private getBgmMultiplier(): number {
    if (!this.bgmEnabled || !this.enabled) return 0;
    return this.bgmVolume;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(val));
      }
    } catch {
      // Ignore storage errors
    }
    if (!val) {
      this.stopBgm();
    } else if (this.bgmEnabled) {
      this.startBgm(this.bgmMode);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setBgmEnabled(val: boolean): void {
    this.bgmEnabled = val;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(BGM_STORAGE_KEY, String(val));
      }
    } catch {
      // Ignore storage errors
    }
    if (!val) {
      this.stopBgm();
    } else if (this.enabled) {
      this.startBgm(this.bgmMode);
    }
  }

  isBgmEnabled(): boolean {
    return this.bgmEnabled && this.enabled;
  }

  toggleBgm(): boolean {
    this.setBgmEnabled(!this.bgmEnabled);
    return this.bgmEnabled;
  }

  getBgmVolume(): number {
    return this.bgmVolume;
  }

  setBgmVolume(val: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(BGM_VOLUME_KEY, String(this.bgmVolume));
      }
    } catch {
      // Ignore storage errors
    }
    this.syncBgmVolume();
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  setSfxVolume(val: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SFX_VOLUME_KEY, String(this.sfxVolume));
      }
    } catch {
      // Ignore storage errors
    }
  }

  private getBgmTrackPath(mode: BgmMode): string {
    if (mode === 'lobby') return SOUND_MANIFEST.bgm.lobby;
    if (mode === 'exciting') return SOUND_MANIFEST.bgm.exciting;
    return SOUND_MANIFEST.bgm.table;
  }

  /**
   * Starts authentic commercial Dou Dizhu looping BGM (`MusicEx_Welcome.mp3`, `MusicEx_Normal.mp3`, `MusicEx_Exciting.mp3`).
   */
  startBgm(mode: BgmMode = 'table'): void {
    const modeChanged = this.bgmMode !== mode;
    this.bgmMode = mode;

    const bgmVol = this.getBgmMultiplier();
    if (bgmVol <= 0) {
      this.stopBgm();
      return;
    }

    if (!modeChanged && (this.bgmSource || (this.bgmHtmlAudio && !this.bgmHtmlAudio.paused))) {
      this.syncBgmVolume();
      return;
    }

    this.stopBgm();
    const trackPath = this.getBgmTrackPath(mode);
    const token = ++this.bgmLoadingToken;

    if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(trackPath);
        audio.loop = true;
        audio.volume = Math.max(0, Math.min(1, 0.42 * bgmVol));
        this.bgmHtmlAudio = audio;
        audio.play().catch(() => {
          if (this.bgmLoadingToken === token) {
            void this.startWebAudioBgmFallback(trackPath, token);
          }
        });
        return;
      } catch {
        // Fallback to WebAudio buffer below
      }
    }

    void this.startWebAudioBgmFallback(trackPath, token);
  }

  private async startWebAudioBgmFallback(trackPath: string, token: number): Promise<void> {
    const ctx = this.getContext();
    if (!ctx) return;
    const buffer = await this.loadAudioBuffer(trackPath);
    if (!buffer || token !== this.bgmLoadingToken) return;

    const bgmVol = this.getBgmMultiplier();
    if (bgmVol <= 0) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.001, 0.42 * bgmVol), ctx.currentTime);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);

      this.bgmSource = source;
      this.bgmGain = gain;
    } catch {
      // Ignore WebAudio state errors
    }
  }

  /**
   * Switches table BGM into high-tension climax mode (`MusicEx_Exciting.mp3`) when a Bomb/Rocket
   * is played or when any player drops to 1–2 remaining cards.
   */
  triggerExcitingBgm(): void {
    if (this.bgmMode === 'table') {
      this.startBgm('exciting');
    }
  }

  private syncBgmVolume(): void {
    const bgmVol = this.getBgmMultiplier();
    if (this.bgmHtmlAudio) {
      this.bgmHtmlAudio.volume = Math.max(0, Math.min(1, 0.42 * bgmVol));
    }
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(Math.max(0.0001, 0.42 * bgmVol), this.ctx.currentTime);
    }
  }

  stopBgm(): void {
    this.bgmLoadingToken++;
    if (this.bgmHtmlAudio) {
      try {
        this.bgmHtmlAudio.pause();
        this.bgmHtmlAudio.currentTime = 0;
      } catch {}
      this.bgmHtmlAudio = null;
    }
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
        this.bgmSource.disconnect();
      } catch {}
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch {}
      this.bgmGain = null;
    }
  }

  /**
   * Preloads core Dou Dizhu commercial audio files using a two-tier LRU priority strategy:
   * - Tier 0 (Dealing & card interaction SFX) are pinned and decoded immediately.
   * - Tier 1 (Bidding, multiplier, combo SFX & character voices) are queued through a
   *   concurrency-throttled background pipeline (`maxConcurrentPreloads = 3`) so entry dealing
   *   never suffers main-thread decode frame drops.
   */
  preloadDdzAudio(): void {
    const dealPriority = [
      SOUND_MANIFEST.ddzSfx.deal,
      SOUND_MANIFEST.ddzSfx.cardTick,
      SOUND_MANIFEST.ddzSfx.cardFan,
      SOUND_MANIFEST.ddzSfx.discard,
      SOUND_MANIFEST.ui.cardSelect,
    ];
    for (const p of dealPriority) {
      void this.loadAudioBuffer(p, true);
    }
    this.enqueueBackgroundPreload(DDZ_PRELOAD_MANIFEST);
  }

  /**
   * Ensures core Dou Dizhu dealing audio buffers (`Special_Dispatch.mp3`, `Common_click_cards.mp3`,
   * `Common_fanpai.mp3`) are decoded and pinned in the LRU cache before starting the entry deal animation.
   */
  public async ensureDealAudioReady(): Promise<void> {
    if (!this.enabled) return;

    const dealEssentials = [
      SOUND_MANIFEST.ddzSfx.deal,
      SOUND_MANIFEST.ddzSfx.cardTick,
      SOUND_MANIFEST.ddzSfx.cardFan,
      SOUND_MANIFEST.ddzSfx.discard,
      SOUND_MANIFEST.ui.cardSelect,
    ];

    // Ensure Stage-1 raw bytes are fetched even if AudioContext is still initializing
    await Promise.race([
      Promise.all(dealEssentials.map((p) => this.fetchRawAudioBytes(p, true))),
      new Promise<void>((resolve) => setTimeout(resolve, 350)),
    ]);

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      await Promise.race([
        Promise.all(dealEssentials.map((p) => this.loadAudioBuffer(p, true))),
        new Promise<void>((resolve) => setTimeout(resolve, 450)),
      ]);
    } catch {
      // Ignore preload errors
    }
  }

  /**
   * Alias for backwards compatibility.
   */
  preloadDdzEssentials(): void {
    this.preloadDdzAudio();
  }

  /**
   * Preloads core Mahjong commercial audio files via the concurrency-throttled LRU queue.
   */
  preloadMahjongAudio(): void {
    this.enqueueBackgroundPreload(MAHJONG_PRELOAD_MANIFEST);
  }

  /**
   * Returns live LRU cache telemetry for debugging or diagnostics.
   */
  public getAudioCacheStats() {
    return {
      decodedBuffers: this.audioBufferCache.getStats(),
      rawByteBuffers: this.rawByteCache.getStats(),
      queuedPreloads: this.preloadQueue.length,
    };
  }

  /**
   * Enqueues audio paths into the low-jitter background preload queue, prioritizing pinned SFX first.
   */
  private enqueueBackgroundPreload(paths: readonly string[]): void {
    const sorted = [...paths].sort((a, b) => {
      const aPinned = this.audioBufferCache.isPinned(a) ? 0 : 1;
      const bPinned = this.audioBufferCache.isPinned(b) ? 0 : 1;
      return aPinned - bPinned;
    });

    for (const path of sorted) {
      if (
        this.audioBufferCache.has(path) ||
        this.loadingPromises.has(path) ||
        this.queuedPathsSet.has(path)
      ) {
        continue;
      }
      this.queuedPathsSet.add(path);
      this.preloadQueue.push(path);
    }

    this.pumpPreloadQueue();
  }

  /**
   * Drains the background preload queue with bounded concurrency (`maxConcurrentPreloads = 3`)
   * so audio decoding never starves the 60/120Hz PixiJS rendering loop during table entry.
   */
  private pumpPreloadQueue(): void {
    while (
      this.activePreloadWorkers < this.maxConcurrentPreloads &&
      this.preloadQueue.length > 0
    ) {
      const nextPath = this.preloadQueue.shift();
      if (!nextPath) break;
      this.queuedPathsSet.delete(nextPath);

      if (this.audioBufferCache.has(nextPath)) {
        continue;
      }

      this.activePreloadWorkers++;
      const isPinned = this.audioBufferCache.isPinned(nextPath);

      // If AudioContext is not yet created, warm Stage-1 raw bytes first; otherwise decode to Stage-2 AudioBuffer
      const job = this.ctx
        ? this.loadAudioBuffer(nextPath, isPinned)
        : this.fetchRawAudioBytes(nextPath, isPinned);

      void job.finally(() => {
        this.activePreloadWorkers = Math.max(0, this.activePreloadWorkers - 1);
        if (this.preloadQueue.length > 0) {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (
              window as Window & {
                requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
              }
            ).requestIdleCallback(() => this.pumpPreloadQueue(), { timeout: 120 });
          } else {
            setTimeout(() => this.pumpPreloadQueue(), 16);
          }
        }
      });
    }
  }

  private async loadAudioBuffer(path: string, pinEntry = false): Promise<AudioBuffer | null> {
    const cached = this.audioBufferCache.get(path);
    if (cached) {
      if (pinEntry) this.audioBufferCache.pin(path);
      return cached;
    }

    const existingPromise = this.loadingPromises.get(path);
    if (existingPromise) return existingPromise;

    const ctx = this.getContext();
    if (!ctx) {
      // Even if AudioContext cannot start yet, pre-cache the raw ArrayBuffer in Stage-1 LRU
      void this.fetchRawAudioBytes(path, pinEntry);
      return null;
    }

    const promise = (async () => {
      try {
        // Consume pre-fetched Stage-1 raw ArrayBuffer if available (zero network wait!)
        let arrayBuf = this.rawByteCache.get(path);
        if (!arrayBuf) {
          const fetched = await this.fetchRawAudioBytes(path, pinEntry);
          if (!fetched) return null;
          arrayBuf = fetched;
        }
        // Clone the ArrayBuffer slice before decodeAudioData detaches it, keeping rawByteCache valid if needed
        const decodeCopy = arrayBuf.slice(0);
        const decoded = await ctx.decodeAudioData(decodeCopy);
        this.audioBufferCache.set(path, decoded, pinEntry || this.audioBufferCache.isPinned(path));
        // Once decoded into Stage-2 AudioBuffer, unpinned Stage-1 raw bytes can be released to save memory
        if (!this.audioBufferCache.isPinned(path)) {
          this.rawByteCache.delete(path);
        }
        return decoded;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(path);
      }
    })();

    this.loadingPromises.set(path, promise);
    return promise;
  }

  /**
   * Plays a pre-recorded commercial audio file from `/public/assets/` with stereo pan,
   * playback rate, volume scaling, and anti-clipping cooldown.
   */
  public async playAudioFile(
    path: string,
    volume: number = 0.85,
    pan: number = 0,
    playbackRate: number = 1.0,
    cooldownMs: number = 35
  ): Promise<void> {
    if (!this.enabled) return;
    const sfxMult = this.getSfxMultiplier();
    if (sfxMult <= 0) return;

    const now = performance.now();
    const lastTime = this.lastPlayedAt.get(path) ?? 0;
    if (cooldownMs > 0 && now - lastTime < cooldownMs) {
      return;
    }
    this.lastPlayedAt.set(path, now);

    // Ensure HTML5 BGM resumes if browser blocked initial autoplay
    if (this.bgmHtmlAudio && this.bgmHtmlAudio.paused && this.getBgmMultiplier() > 0) {
      this.bgmHtmlAudio.play().catch(() => {});
    }

    const ctx = this.getContext();
    if (!ctx) return;

    const playDecodedBuffer = (buffer: AudioBuffer) => {
      try {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        if (playbackRate !== 1.0) {
          source.playbackRate.value = Math.max(0.5, Math.min(2.0, playbackRate));
        }

        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume * sfxMult));

        if (typeof ctx.createStereoPanner === 'function' && pan !== 0) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, pan));
          source.connect(gain);
          gain.connect(panner);
          panner.connect(ctx.destination);
        } else {
          source.connect(gain);
          gain.connect(ctx.destination);
        }

        source.start(0);
      } catch {
        // Ignore WebAudio state errors gracefully
      }
    };

    // Synchronous zero-latency fast path when buffer is already decoded in memory
    const cached = this.audioBufferCache.get(path);
    if (cached) {
      playDecodedBuffer(cached);
      return;
    }

    try {
      const buffer = await this.loadAudioBuffer(path);
      if (!buffer) return;
      playDecodedBuffer(buffer);
    } catch {
      // Ignore decoding or playback errors gracefully
    }
  }

  /**
   * Computes stereo pan (-0.42 left, 0 bottom/center, +0.42 right) from seat index.
   */
  public getSeatPan(seatIndex?: number, mySeat?: number): number {
    if (seatIndex === undefined || mySeat === undefined) return 0;
    const diff = (seatIndex - mySeat + 3) % 3;
    if (diff === 1) return 0.42; // Right opponent
    if (diff === 2) return -0.42; // Left opponent
    return 0; // Self (bottom)
  }

  /**
   * Determines whether a seat uses the Female (`Woman_*`) or Male (`Man_*`) voice pack
   * based on avatarId or seat index.
   */
  public isFemaleVoice(avatarId?: string, seatIndex?: number): boolean {
    if (avatarId) {
      const lower = avatarId.toLowerCase();
      if (
        lower.includes('dizhupo') ||
        lower.includes('nongminmei') ||
        lower.includes('girl') ||
        lower.includes('woman') ||
        lower.includes('female') ||
        lower === 'avatar_2' ||
        lower === 'avatar_4'
      ) {
        return true;
      }
      if (lower.includes('dizhu') || lower.includes('nongmin') || lower.includes('man')) {
        return false;
      }
    }
    return seatIndex === 1;
  }

  /**
   * Plays authentic Dou Dizhu card rank/pattern voice (`Man_*` or `Woman_*`) via `SoundManifest`.
   */
  public playDdzCardVoice(
    patternType: string,
    mainValue: number = 0,
    seatIndex?: number,
    mySeat?: number,
    avatarId?: string,
    isBeatingOpponent: boolean = false
  ): void {
    const pan = this.getSeatPan(seatIndex, mySeat);
    const isFemale = this.isFemaleVoice(avatarId, seatIndex);
    const useBeating = isBeatingOpponent && Math.random() < 0.38;

    const path = resolveDdzCardVoicePath(patternType, mainValue, isFemale, useBeating);
    if (path) {
      void this.playAudioFile(path, 0.94, pan, 1.0, 45);
    }
  }

  /**
   * Plays authentic Dou Dizhu character action voice (`叫地主`, `不叫`, `抢地主`, `不抢`, `加倍`, `超级加倍`, `不加倍`, `不出`, `报单`, `报双`, `明牌`).
   */
  public playDdzActionVoice(
    action: DdzActionVoiceType,
    seatIndex?: number,
    mySeat?: number,
    avatarId?: string,
    grabCount: number = 1
  ): void {
    // Ensure any dealing cascade track stops before bidding/action voices speak
    this.stopDealCascade();
    const pan = this.getSeatPan(seatIndex, mySeat);
    const isFemale = this.isFemaleVoice(avatarId, seatIndex);
    const path = resolveDdzActionVoicePath(action, isFemale, grabCount);
    if (path) {
      void this.playAudioFile(path, 0.94, pan, 1.0, 45);
    }
  }

  /**
   * Starts a time-bounded, non-overlapping dealing riffle cascade (`Special_Dispatch.mp3`)
   * that automatically fades out when the 17th card lands and finishes with a crisp fan snap (`Common_fanpai.mp3`).
   */
  public async startDealCascade(durationMs: number = 820): Promise<void> {
    this.stopDealCascade();
    if (!this.enabled) return;
    const sfxMult = this.getSfxMultiplier();
    if (sfxMult <= 0) return;

    const ctx = this.getContext();
    if (!ctx) return;

    const clampedDurationSec = Math.max(0.35, Math.min(1.6, durationMs / 1000));

    // Schedule the final hand fan-settle snap right as the cards lock into place
    if (typeof window !== 'undefined') {
      this.dealFanTimer = window.setTimeout(() => {
        this.dealFanTimer = null;
        void this.playAudioFile(SOUND_MANIFEST.ddzSfx.cardFan, 0.76, 0, 1.04, 30);
      }, Math.max(200, durationMs - 65));
    }

    const startCascadeNode = (buffer: AudioBuffer) => {
      if (!this.enabled) return;
      if (this.dealCascadeSource) {
        try {
          this.dealCascadeSource.stop();
          this.dealCascadeSource.disconnect();
        } catch {}
      }

      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 1.08;

      const gain = ctx.createGain();
      const peakGain = Math.max(0.001, Math.min(1, 0.78 * sfxMult));
      gain.gain.setValueAtTime(peakGain, now);
      const fadeStart = now + Math.max(0.18, clampedDurationSec - 0.14);
      gain.gain.setValueAtTime(peakGain, fadeStart);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + clampedDurationSec);

      source.connect(gain);
      gain.connect(ctx.destination);

      this.dealCascadeSource = source;
      this.dealCascadeGain = gain;

      source.onended = () => {
        if (this.dealCascadeSource === source) {
          this.dealCascadeSource = null;
          this.dealCascadeGain = null;
        }
      };

      source.start(now);
      source.stop(now + clampedDurationSec + 0.02);
    };

    // Synchronous zero-latency fast path when dealing buffer is already decoded
    const cachedDealBuf = this.audioBufferCache.get(SOUND_MANIFEST.ddzSfx.deal);
    if (cachedDealBuf) {
      try {
        startCascadeNode(cachedDealBuf);
      } catch {}
      return;
    }

    try {
      const buffer = await this.loadAudioBuffer(SOUND_MANIFEST.ddzSfx.deal);
      if (!buffer || !this.enabled) return;
      startCascadeNode(buffer);
    } catch {
      // Ignore WebAudio state errors gracefully
    }
  }

  /**
   * Immediately stops any active dealing cascade audio node.
   */
  public stopDealCascade(): void {
    if (this.dealFanTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.dealFanTimer);
      this.dealFanTimer = null;
    }
    if (this.dealCascadeSource) {
      try {
        this.dealCascadeSource.stop();
        this.dealCascadeSource.disconnect();
      } catch {}
      this.dealCascadeSource = null;
    }
    if (this.dealCascadeGain) {
      try {
        this.dealCascadeGain.disconnect();
      } catch {}
      this.dealCascadeGain = null;
    }
  }

  /**
   * Plays Dou Dizhu physical table & VFX sound effects mapped in `SOUND_MANIFEST.ddzSfx`.
   */
  public playDdzSfx(type: DdzSfxType, seatIndex?: number, mySeat?: number): void {
    const pan = this.getSeatPan(seatIndex, mySeat);
    const sfx = SOUND_MANIFEST.ddzSfx;

    switch (type) {
      case 'deal':
        void this.startDealCascade(820);
        break;
      case 'discard':
        void this.playAudioFile(sfx.discard, 0.88, pan, 1.0, 25);
        break;
      case 'shunzi':
        void this.playAudioFile(sfx.shunzi, 0.88, pan, 1.0, 80);
        break;
      case 'liandui':
        void this.playAudioFile(sfx.liandui, 0.88, pan, 1.0, 80);
        break;
      case 'plane':
        void this.playAudioFile(sfx.plane, 0.92, 0, 1.0, 100);
        break;
      case 'bomb':
        void this.playAudioFile(sfx.bomb, 0.96, 0, 1.0, 100);
        this.triggerExcitingBgm();
        break;
      case 'long_bomb':
      case 'rocket':
        void this.playAudioFile(sfx.rocket, 0.98, 0, 1.0, 100);
        void this.playAudioFile(sfx.longBomb, 0.92, 0, 1.0, 100);
        this.triggerExcitingBgm();
        break;
      case 'chuntian':
      case 'spring':
        void this.playAudioFile(sfx.spring, 0.92, 0, 1.0, 120);
        void this.playAudioFile(sfx.star, 0.85, 0, 1.0, 120);
        break;
      case 'alert':
        void this.playAudioFile(sfx.alert, 0.92, pan, 1.0, 120);
        this.triggerExcitingBgm();
        break;
      case 'landlord':
        void this.playAudioFile(sfx.landlordConfirm, 0.88, 0, 1.0, 100);
        void this.playAudioFile(SOUND_MANIFEST.ui.cardFlip, 0.82, 0, 1.0, 80);
        break;
      case 'chaojijiabei':
        void this.playAudioFile(sfx.chaojijiabei, 0.88, pan, 1.0, 80);
        void this.playAudioFile(sfx.multiply, 0.85, pan, 1.0, 80);
        break;
      case 'multiply':
        void this.playAudioFile(sfx.multiply, 0.85, pan, 1.0, 60);
        break;
    }
  }

  /**
   * Plays authentic Quick Chat voice (`Man_chat_1..9.mp3` / `Woman_chat_1..9.mp3`).
   * Supports both `(text, seatIdx, mySeat, avatarId)` and `(text, isFemale)`.
   */
  public speak(
    text: string,
    seatOrFemale?: number | boolean,
    mySeat?: number,
    avatarId?: string
  ): void {
    if (!this.enabled || !text) return;

    let isFemale = false;
    let pan = 0;

    if (typeof seatOrFemale === 'boolean') {
      isFemale = seatOrFemale;
    } else if (typeof seatOrFemale === 'number') {
      pan = this.getSeatPan(seatOrFemale, mySeat);
      isFemale = this.isFemaleVoice(avatarId, seatOrFemale);
    }

    const path = resolveDdzQuickChatVoicePath(text, isFemale);
    void this.playAudioFile(path, 0.92, pan, 1.0, 120);
  }

  // ============================================================================
  // UI & Card Interaction SFX
  // ============================================================================

  public playCardSelect(): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.cardSelect, 0.78, 0, 1.0, 20);
  }

  /**
   * Plays authentic physical card placement / table confirmation sound (`Special_Discard.wav` / `Common_fanpai.mp3`).
   */
  public playCardPlace(heavy: boolean = false, pan: number = 0): void {
    if (heavy) {
      void this.playAudioFile(SOUND_MANIFEST.ui.cardPlace, 0.88, pan, 0.96, 25);
    } else {
      void this.playAudioFile(SOUND_MANIFEST.ui.cardFlip, 0.8, pan, 1.0, 22);
    }
  }

  /**
   * Plays crisp single-card flick (`Common_click_cards.mp3`) with subtle stereo pan & pitch progression during dealing.
   */
  public playCardFly(index: number = 0, pan?: number): void {
    const computedPan =
      pan !== undefined ? pan : Math.max(-0.35, Math.min(0.35, ((index % 17) / 16 - 0.5) * 0.6));
    const rate = Math.min(1.2, 0.96 + (index % 17) * 0.012);
    void this.playAudioFile(SOUND_MANIFEST.ddzSfx.cardTick, 0.52, computedPan, rate, 28);
  }

  public playInvalidPlay(): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.invalid, 0.85, 0, 1.0, 80);
  }

  public playTap(_freq: number = 720, _duration: number = 0.045): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.tap, 0.65, 0, 1.0, 30);
  }

  public playCancel(): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.cancel, 0.68, 0, 1.0, 40);
  }

  public playCardSlide(pan: number = 0): void {
    void this.playAudioFile(SOUND_MANIFEST.ddzSfx.cardTick, 0.68, pan, 1.0, 25);
  }

  public playCardSnap(pan: number = 0): void {
    void this.playAudioFile(SOUND_MANIFEST.ddzSfx.discard, 0.86, pan, 1.0, 25);
  }

  public playRiffleShuffle(durationMs: number = 820): void {
    void this.startDealCascade(durationMs);
  }

  public playGlissando(): void {
    void this.playAudioFile(SOUND_MANIFEST.ddzSfx.shunzi, 0.85, 0, 1.0, 80);
  }

  public playDoubleRibbon(): void {
    void this.playAudioFile(SOUND_MANIFEST.ddzSfx.liandui, 0.85, 0, 1.0, 80);
  }

  public playBiplaneFlyover(): void {
    this.playDdzSfx('plane');
  }

  public playBombExplosion(isRocket: boolean = false): void {
    if (isRocket) {
      this.playDdzSfx('rocket');
    } else {
      this.playDdzSfx('bomb');
    }
  }

  public playSpringCelebration(): void {
    this.playDdzSfx('chuntian');
  }

  public playClockTick(urgent: boolean = false): void {
    void this.playAudioFile(
      SOUND_MANIFEST.ui.countdownTick,
      urgent ? 0.84 : 0.56,
      0,
      urgent ? 1.1 : 1.0,
      140
    );
  }

  /**
   * Alias used by `GameScene.ts` during final 5-second turn countdown.
   */
  public playCountdownTick(urgent: boolean = false): void {
    this.playClockTick(urgent);
  }

  public playPowerChime(level: number = 1): void {
    if (level >= 4) {
      this.playDdzSfx('chaojijiabei');
    } else {
      this.playDdzSfx('multiply');
    }
  }

  public playPropWhoosh(): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.beanFly, 0.75, 0, 1.0, 60);
  }

  public playPropImpact(isHeavy: boolean = false): void {
    if (isHeavy) {
      void this.playAudioFile(SOUND_MANIFEST.ddzSfx.bomb, 0.82, 0, 1.0, 80);
    } else {
      void this.playAudioFile(SOUND_MANIFEST.ddzSfx.flower, 0.82, 0, 1.0, 60);
    }
  }

  public playChestOpen(): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.chestOpen, 0.88, 0, 1.0, 120);
  }

  public playDiceRoll(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.diceRoll, 0.88, 0, 1.0, 100);
  }

  public playVictoryFanfare(): void {
    this.stopBgm();
    void this.playAudioFile(SOUND_MANIFEST.bgm.winStinger, 0.88, 0, 1.0, 200);
    void this.playAudioFile(SOUND_MANIFEST.ui.beanWin, 0.82, 0, 1.0, 200);
  }

  public playDefeatTone(): void {
    this.stopBgm();
    void this.playAudioFile(SOUND_MANIFEST.bgm.loseStinger, 0.88, 0, 1.0, 200);
    void this.playAudioFile(SOUND_MANIFEST.ui.beanLose, 0.82, 0, 1.0, 200);
  }

  public playCoinCascade(_count: number = 10): void {
    void this.playAudioFile(SOUND_MANIFEST.ui.beanFly, 0.85, 0, 1.0, 100);
  }

  // ============================================================================
  // NiuNiu (抢庄牛牛) & ZJH (诈金花) Commercial Audio Methods
  // ============================================================================

  public playNiuniuCall(isLock: boolean = false): void {
    const path = isLock ? SOUND_MANIFEST.niuniu.bankerLock : SOUND_MANIFEST.niuniu.bankerTick;
    void this.playAudioFile(path, 0.88, 0, 1.0, 45);
  }

  public playNiuniuChip(): void {
    void this.playAudioFile(SOUND_MANIFEST.niuniu.chipBet, 0.85, 0, 1.0, 35);
  }

  public playNiuniuHandReveal(level: number = 0): void {
    void this.playAudioFile(SOUND_MANIFEST.niuniu.cardReveal, 0.86, 0, 1.0, 40);
    if (level >= 7) {
      void this.playAudioFile(SOUND_MANIFEST.niuniu.highNiuFanfare, 0.9, 0, 1.0, 120);
    }
  }

  public playZjhActionVoice(
    action: 'genzhu' | 'jiazhu' | 'kanpai' | 'qipai' | 'bipai' | 'allin' | 'win' | 'lose'
  ): void {
    switch (action) {
      case 'kanpai':
        void this.playAudioFile(SOUND_MANIFEST.zjh.cardPeek, 0.88, 0, 1.0, 50);
        break;
      case 'qipai':
        void this.playAudioFile(SOUND_MANIFEST.zjh.foldSlide, 0.86, 0, 1.0, 50);
        break;
      case 'bipai':
        void this.playAudioFile(SOUND_MANIFEST.zjh.vsLightning, 0.92, 0, 1.0, 80);
        break;
      case 'allin':
        void this.playAudioFile(SOUND_MANIFEST.zjh.chipAllIn, 0.94, 0, 1.0, 80);
        break;
      case 'win':
        this.playVictoryFanfare();
        break;
      case 'lose':
        this.playDefeatTone();
        break;
      default:
        void this.playAudioFile(SOUND_MANIFEST.zjh.chipToss, 0.86, 0, 1.0, 40);
        break;
    }
  }

  // ============================================================================
  // Mahjong (麻将) Commercial Audio Methods
  // ============================================================================

  public clearMahjongVoiceQueue(): void {
    for (const timerId of this.mahjongVoiceTimers) {
      window.clearTimeout(timerId);
    }
    this.mahjongVoiceTimers.clear();
  }

  public playMahjongDeal(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.deal, 0.86, 0, 1.0, 80);
  }

  public playMahjongDraw(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.draw, 0.82, 0, 1.0, 30);
  }

  public playMahjongGive(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.give, 0.86, 0, 1.0, 30);
  }

  public playMahjongWild(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.wild, 0.88, 0, 1.0, 60);
  }

  public playMahjongBeanFly(): void {
    void this.playAudioFile(SOUND_MANIFEST.mahjong.beanFly, 0.86, 0, 1.0, 80);
  }

  public playMahjongWin(isZimo: boolean = false): void {
    const path = isZimo ? SOUND_MANIFEST.mahjong.zimo : SOUND_MANIFEST.mahjong.win;
    void this.playAudioFile(path, 0.92, 0, 1.0, 120);
  }

  public playTileVoice(tileId: string, gender: VoiceGender = 'male'): void {
    const path = resolveMahjongTileVoicePath(tileId, gender);
    if (path) {
      void this.playAudioFile(path, 0.92, 0, 1.0, 40);
    }
  }

  public playActionVoice(action: MahjongActionVoiceType, gender: VoiceGender = 'male'): void {
    const folder = gender === 'female' ? 'female' : 'male';
    const path = `/assets/mahjong/audio/voice/${folder}/${action}.mp3`;
    void this.playAudioFile(path, 0.95, 0, 1.0, 50);
  }

  /**
   * Unified sound effect dispatcher for cross-game UI & table events.
   */
  public play(
    soundName:
      | 'click'
      | 'cancel'
      | 'invalid'
      | 'deal'
      | 'chip'
      | 'card_flip'
      | 'card_select'
      | 'card_place'
      | 'win'
      | 'lose'
      | 'clock_tick'
      | 'bomb'
      | 'plane'
      | 'shunzi'
      | 'liandui'
      | 'spring'
      | 'shuffle'
      | 'coin'
      | 'power'
  ): void {
    switch (soundName) {
      case 'click':
        this.playTap();
        break;
      case 'cancel':
        this.playCancel();
        break;
      case 'invalid':
        this.playInvalidPlay();
        break;
      case 'card_select':
        this.playCardSelect();
        break;
      case 'card_place':
        this.playCardPlace(true);
        break;
      case 'deal':
        this.playCardSlide();
        break;
      case 'chip':
      case 'coin':
        this.playCoinCascade(8);
        break;
      case 'card_flip':
        void this.playAudioFile(SOUND_MANIFEST.ui.cardFlip, 0.82, 0, 1.0, 30);
        break;
      case 'win':
        this.playVictoryFanfare();
        break;
      case 'lose':
        this.playDefeatTone();
        break;
      case 'clock_tick':
        this.playClockTick(true);
        break;
      case 'bomb':
        this.playBombExplosion(false);
        break;
      case 'plane':
        this.playBiplaneFlyover();
        break;
      case 'shunzi':
        this.playGlissando();
        break;
      case 'liandui':
        this.playDoubleRibbon();
        break;
      case 'spring':
        this.playSpringCelebration();
        break;
      case 'shuffle':
        this.playRiffleShuffle();
        break;
      case 'power':
        this.playPowerChime(2);
        break;
    }
  }
}

export const soundEngine = new SoundEngine();
export { SOUND_MANIFEST };
