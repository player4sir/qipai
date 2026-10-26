import React, { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import gsap from 'gsap';
import {
  LogOut,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { computeViewportMetrics, type ViewportMetrics } from '../../App';
import { soundEngine } from '../../shared/audio/SoundEngine';
import {
  gameControlHub,
  useGameControlState,
} from '../../shared/control/GameControlHub';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { AvatarSvg } from '../../shared/ui/AvatarSvg';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import { CommercialModalShell } from '../../shared/ui/CommercialModalShell';
import {
  RollingScoreCounter,
  SettlementHeroHeader,
} from '../../shared/ui/RollingScoreCounter';
import { ReplayViewerModal } from './components/ReplayViewerModal';
import {
  ArenaMatchingSeatPod,
  ArenaSeatAvatar,
  resolvePlayerPresenceState,
} from './components/ArenaSeatAvatar';
import {
  DdzViewState,
  GameStateManager,
} from './managers/GameStateManager';
import { preloadAllCardTextures } from './assets/CardAtlasGenerator';
import {
  spriteSheetManager,
  type SlicedSpriteFrame,
} from './assets/SpriteSheetManager';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  GameScene,
} from './scenes/GameScene';
import {
  getRoomTierByBaseScore,
  HandSortMode,
  MatchReplayRecord,
  PropType,
  Rank,
  SeatPlayerInfo,
} from './types';
import {
  spriteAnimationEngine,
  type DdzDynamicEffectEvent,
} from './SpriteAnimationEngine';

interface ActiveCanvasSpriteSequence {
  id: string;
  frames: SlicedSpriteFrame[];
  x: number;
  y: number;
  scale: number;
  fps: number;
  startTime: number;
  alpha: number;
}

/**
 * Hardware-accelerated HTML5 Canvas 2D SpriteSheet VFX layer mounted in `DdzTableView`
 * that renders parsed JSON+PNG SpriteSheet animations (`guang.json`, `baodian.json`, `zd.json`, `bomb.json`)
 * for 叫地主, 抢地主, 地主确认, 加倍/超级加倍, 炸弹, and 王炸.
 */
const DdzSpriteSheetCanvasOverlay: React.FC<{ width: number; height: number }> = ({
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeAnimsRef = useRef<ActiveCanvasSpriteSequence[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    void spriteSheetManager.preloadAllAtlases();

    const spawnSeq = (
      sheetKey: string,
      animName: string,
      x: number,
      y: number,
      scale: number,
      fps = 22,
      alpha = 0.95,
      delayMs = 0
    ) => {
      const frames = spriteSheetManager.getAnimationFrames(sheetKey, animName);
      if (!frames || frames.length === 0) return;
      activeAnimsRef.current.push({
        id: `${sheetKey}_${animName}_${performance.now()}_${Math.random()}`,
        frames,
        x,
        y,
        scale,
        fps,
        startTime: performance.now() + delayMs,
        alpha,
      });
      ensureLoop();
    };

    const ensureLoop = () => {
      if (rafRef.current !== null) return;
      const tick = (now: number) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          rafRef.current = null;
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          rafRef.current = null;
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const remaining: ActiveCanvasSpriteSequence[] = [];

        for (const item of activeAnimsRef.current) {
          if (now < item.startTime) {
            remaining.push(item);
            continue;
          }
          const elapsedSec = Math.max(0, (now - item.startTime) / 1000);
          const frameIndex = Math.floor(elapsedSec * item.fps);
          if (frameIndex >= item.frames.length) {
            continue;
          }
          const frame = item.frames[frameIndex];
          if (frame && frame.canvas && frame.width > 0 && frame.height > 0) {
            const drawW = frame.width * item.scale;
            const drawH = frame.height * item.scale;
            ctx.save();
            ctx.globalAlpha = item.alpha;
            ctx.drawImage(
              frame.canvas,
              item.x - drawW / 2,
              item.y - drawH / 2,
              drawW,
              drawH
            );
            ctx.restore();
          }
          remaining.push(item);
        }

        activeAnimsRef.current = remaining;
        if (remaining.length > 0) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const unsub = spriteAnimationEngine.subscribe((evt: DdzDynamicEffectEvent) => {
      const px = evt.x <= 1 ? evt.x * width : evt.x;
      const py = evt.y <= 1 ? evt.y * height : evt.y;

      switch (evt.type) {
        case 'deal_cards': {
          // Deck origin golden sweep + staggered starlight trail across the dealing fan trajectory
          spawnSeq('guang', 'gold_sweep', px, py, 1.18, 24, 0.92, 0);
          spawnSeq('baodian', 'default', px, py, 0.92, 24, 0.88, 0);
          const totalMs = evt.durationMs ?? 720;
          const trailPoints = 5;
          for (let i = 0; i < trailPoints; i++) {
            const ratio = i / (trailPoints - 1);
            const fanX = width * (0.28 + ratio * 0.44);
            const fanY = height * 0.78;
            const delay = Math.round(ratio * totalMs * 0.75);
            spawnSeq('baodian', 'default', fanX, fanY, 0.78, 24, 0.85, delay);
          }
          spawnSeq('guang', 'gold_sweep', width * 0.5, height * 0.78, 1.25, 22, 0.9, Math.round(totalMs * 0.82));
          break;
        }
        case 'call_landlord':
          spawnSeq('guang', 'gold_sweep', px, py, 1.15, 22, 0.92);
          spawnSeq('baodian', 'default', px, py, 0.95, 22, 0.9);
          break;
        case 'grab_landlord':
          spawnSeq('zd', 'shockwave', px, py, 0.58, 24, 0.88);
          spawnSeq('guang', 'gold_sweep', px, py, 1.25, 24, 0.95);
          spawnSeq('baodian', 'default', px, py, 1.1, 22, 0.92);
          break;
        case 'landlord_confirmed':
          spawnSeq('zd', 'shockwave', px, py, 0.72, 22, 0.9);
          spawnSeq('guang', 'gold_sweep', px, py, 1.35, 20, 0.95);
          spawnSeq('baodian', 'default', px - 70, py, 1.0, 22, 0.9);
          spawnSeq('baodian', 'default', px + 70, py, 1.0, 22, 0.9);
          break;
        case 'double_score':
          spawnSeq('guang', 'gold_sweep', px, py, 1.1, 22, 0.9);
          spawnSeq('baodian', 'default', px, py, 0.95, 22, 0.88);
          break;
        case 'super_double':
          spawnSeq('zd', 'shockwave', px, py, 0.68, 24, 0.92);
          spawnSeq('guang', 'gold_sweep', px, py, 1.3, 24, 0.95);
          spawnSeq('baodian', 'default', px, py, 1.15, 22, 0.92);
          break;
        case 'bomb':
          spawnSeq('zd', 'shockwave', width * 0.5, height * 0.45, 0.95, 22, 0.88);
          spawnSeq('baodian', 'default', width * 0.5, height * 0.45, 1.35, 20, 0.92);
          break;
        case 'rocket':
          spawnSeq('zd', 'shockwave', width * 0.5, height * 0.44, 1.25, 22, 0.92);
          spawnSeq('baodian', 'default', width * 0.5 - 85, height * 0.42, 1.3, 20, 0.9);
          spawnSeq('baodian', 'default', width * 0.5 + 85, height * 0.42, 1.3, 20, 0.9);
          break;
        default: {
          const layers = spriteAnimationEngine.getActionLayers(evt.type);
          for (const layer of layers) {
            spawnSeq(
              layer.spec.sheetKey,
              layer.spec.animationName,
              px + (layer.spec.offsetX ?? 0),
              py + (layer.spec.offsetY ?? 0),
              layer.spec.scale,
              layer.spec.fps,
              layer.spec.alpha,
              layer.spec.delayMs ?? 0
            );
          }
          break;
        }
      }
    });

    return () => {
      unsub();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      activeAnimsRef.current = [];
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    />
  );
};

export interface DdzTableViewProps {
  onLeaveRoom: () => void;
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  initialBaseScore?: number;
  initialTableScore?: number;
}

const RECORDER_ORDER: Array<{ rank: Rank; label: string }> = [
  { rank: 'big_joker', label: '大王' },
  { rank: 'small_joker', label: '小王' },
  { rank: '2', label: '2' },
  { rank: 'A', label: 'A' },
  { rank: 'K', label: 'K' },
  { rank: 'Q', label: 'Q' },
  { rank: 'J', label: 'J' },
  { rank: '10', label: '10' },
  { rank: '9', label: '9' },
  { rank: '8', label: '8' },
  { rank: '7', label: '7' },
  { rank: '6', label: '6' },
  { rank: '5', label: '5' },
  { rank: '4', label: '4' },
  { rank: '3', label: '3' },
];

const QUICK_PHRASES: Array<{ id: string; text: string }> = [
  { id: 'hurry', text: '快点吧，我等的花儿都谢了！' },
  { id: 'coop', text: '合作愉快，配合默契！' },
  { id: 'nice', text: '你的牌打得也太好了！' },
  { id: 'allnight', text: '不要走，决战到天亮！' },
  { id: 'boom', text: '炸弹来袭，小心了！' },
  { id: 'gg', text: '承让承让，这把运气不错！' },
];

const INTERACTIVE_PROPS: Array<{ type: PropType; label: string }> = [
  { type: 'flower', label: '鲜花' },
  { type: 'bomb_cup', label: '炸弹' },
  { type: 'tea', label: '敬茶' },
  { type: 'like', label: '点赞' },
  { type: 'ingot', label: '元宝' },
];

const INITIAL_VIEW_STATE: DdzViewState = {
  roomId: '',
  dealMode: 'classic',
  wildRanks: [],
  baseScore: 100,
  maxMultiplier: 32,
  isPrivate: false,
  hostId: '',
  phase: 'WAITING',
  multiplier: 1,
  mySeat: 0,
  currentSeat: 0,
  timeoutAt: 0,
  isFreeLead: false,
  landlordSeat: null,
  landlordId: null,
  players: [null, null, null],
  cardRecorder: {
    big_joker: 1,
    small_joker: 1,
    '2': 4,
    A: 4,
    K: 4,
    Q: 4,
    J: 4,
    '10': 4,
    '9': 4,
    '8': 4,
    '7': 4,
    '6': 4,
    '5': 4,
    '4': 4,
    '3': 4,
  },
  chatBubbles: { 0: null, 1: null, 2: null },
  settlement: null,
  errorToast: null,
};

/**
 * Contain-fit scale for the 1334x750 design stage: never overflows on EITHER axis.
 * (Height-only fit cropped the stage horizontally on 4:3 tablets / narrow desktop windows.)
 */
const computeFitScale = (width: number, height: number, stageWidth = DESIGN_WIDTH): number =>
  Math.min(height / DESIGN_HEIGHT, width / stageWidth);

type VirtualRotation = 0 | 90 | 270;

const DdzTableStage: React.FC<DdzTableViewProps & { rotationDeg: VirtualRotation }> = ({
  onLeaveRoom,
  viewport,
  isFullscreen = false,
  onToggleFullscreen,
  initialBaseScore = 100,
  rotationDeg,
}) => {
  // Latest CSS rotation of the stage container; read by the Pixi pointer mapper below.
  const rotationRef = useRef<VirtualRotation>(rotationDeg);
  rotationRef.current = rotationDeg;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const hudInnerRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const managerRef = useRef<GameStateManager | null>(null);

  const [measuredMetrics, setMeasuredMetrics] = useState<ViewportMetrics>(() =>
    viewport ?? computeViewportMetrics()
  );
  const metricsRef = useRef<ViewportMetrics>(measuredMetrics);
  metricsRef.current = measuredMetrics;

  const controlState = useGameControlState();
  const [viewState, setViewState] = useState<DdzViewState>(() => ({
    ...INITIAL_VIEW_STATE,
    baseScore: initialBaseScore || 100,
  }));
  const [showRecorder, setShowRecorder] = useState(false);
  const [showMultiplierDetail, setShowMultiplierDetail] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [activePropTargetSeat, setActivePropTargetSeat] = useState<number | null>(null);
  const [panelPropTarget, setPanelPropTarget] = useState<'left' | 'right'>('right');
  const [sfxEnabled, setSfxEnabled] = useState(soundEngine.isEnabled());
  const [bgmEnabled, setBgmEnabled] = useState(soundEngine.isBgmEnabled());
  const [hapticEnabled, setHapticEnabled] = useState(hapticEngine.isEnabled());
  const [handSortMode, setHandSortMode] = useState<HandSortMode>('rank');
  const [activeReplay, setActiveReplay] = useState<MatchReplayRecord | null>(null);
  const [copied, setCopied] = useState(false);

  // Measure container & compute resolution-tier layout percentages
  useEffect(() => {
    const updateMetrics = () => {
      const el = viewportRef.current;
      const w = el ? el.clientWidth : window.innerWidth;
      const h = el ? el.clientHeight : window.innerHeight;
      // Safe-area insets are already excluded by AutoLandscapeContainer (our parent box).
      if (w > 0 && h > 0) {
        const next = computeViewportMetrics(w, h);
        // computeViewportMetrics returns a fresh object: skip identical sizes to avoid re-rendering 1.4k lines of JSX
        setMeasuredMetrics((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next
        );
      }
    };

    // iOS fires `orientationchange` BEFORE the new dimensions are available -> re-measure once settled.
    let settleTimer: number | null = null;
    const onOrientationChange = () => {
      updateMetrics();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(updateMetrics, 320);
    };

    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    window.addEventListener('orientationchange', onOrientationChange);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      observer = new ResizeObserver(updateMetrics);
      observer.observe(viewportRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('orientationchange', onOrientationChange);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      observer?.disconnect();
    };
  }, [viewport?.width, viewport?.height]);

  const { zones, uiElementScale, tier } = measuredMetrics;

  // Full-bleed virtual width: in <=16:9 ratio, it is 1334. In 19.5:9~21:9, it expands up to 1660px.
  const containerAspect =
    measuredMetrics.height > 0
      ? measuredMetrics.width / measuredMetrics.height
      : DESIGN_WIDTH / DESIGN_HEIGHT;
  const virtualWidth = Math.max(
    DESIGN_WIDTH,
    Math.min(1660, Math.round(DESIGN_HEIGHT * containerAspect))
  );
  const fitScaleBase = computeFitScale(measuredMetrics.width, measuredMetrics.height, virtualWidth);
  const stageScale = Number(
    (fitScaleBase * Math.min(1.0, 0.985 + ((uiElementScale - 0.78) / 0.22) * 0.015)).toFixed(4)
  );

  // Synchronize PixiJS stage coordinates & virtual dimensions whenever resolution or zones update
  useEffect(() => {
    if (sceneRef.current && appRef.current) {
      appRef.current.renderer.resize(virtualWidth, DESIGN_HEIGHT);
      sceneRef.current.setVirtualDimensions(virtualWidth, DESIGN_HEIGHT);
      sceneRef.current.applyLayoutPercentages(zones);
    }
  }, [virtualWidth, zones]);

  useEffect(() => {
    soundEngine.startBgm('table');
    // Configure GSAP lag smoothing so 90Hz/120Hz mobile frame spikes never cause visual jumps
    gsap.ticker.lagSmoothing(500, 33);

    let destroyed = false;
    let rafId: number | null = null;

    // Frame-Sync & High-Refresh-Rate (90Hz/120Hz/144Hz) Performance Monitor state
    const nativeDpr = Math.min(window.devicePixelRatio || 1, 2);
    const perfMonitor = {
      lastFrameTime: performance.now(),
      emaFrameMs: 16.67,
      emaJitterMs: 0,
      highJitterFrames: 0,
      stableFrames: 0,
      currentResolution: nativeDpr,
      smoothedUiScale: metricsRef.current.uiElementScale,
      smoothedStageScale: 0,
      lastAppliedStageScale: -1,
      uiScaleSampleCounter: 0,
      cachedLiveUiScale: metricsRef.current.uiElementScale,
    };

    const readLiveCssUiScale = (): number => {
      const el = viewportRef.current;
      if (!el) return metricsRef.current.uiElementScale;
      const rawVal = getComputedStyle(el).getPropertyValue('--ui-element-scale').trim();
      const parsed = Number.parseFloat(rawVal);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : metricsRef.current.uiElementScale;
    };

    const manager = new GameStateManager(socketClient, (nextState) => {
      if (!destroyed) {
        setViewState(nextState);
      }
    });
    managerRef.current = manager;
    setViewState(manager.getState());

    const initPixi = async () => {
      const containerEl = hostRef.current;
      if (!containerEl) return;

      // Start background preloading of the full voice/SFX & secondary SpriteSheet catalog immediately
      soundEngine.preloadDdzAudio();
      void spriteSheetManager.preloadAllAtlases();

      // Strictly await card textures, essential dealing audio buffers, and core dealing SpriteSheets
      // BEFORE attaching the scene and triggering the entry deal animation, preventing any audio loss or lag
      await Promise.all([
        preloadAllCardTextures(),
        soundEngine.ensureDealAudioReady(),
        spriteSheetManager.preloadCoreAtlases(),
      ]);

      const app = new Application();
      await app.init({
        width: virtualWidth,
        height: DESIGN_HEIGHT,
        backgroundColor: 0x062318,
        antialias: true,
        autoStart: false,
        sharedTicker: false,
        powerPreference: 'high-performance',
        roundPixels: true,
        resolution: nativeDpr,
        autoDensity: true,
      });

      if (destroyed || !hostRef.current) {
        app.destroy(true, { children: true });
        return;
      }

      // Stop internal ticker so our unified requestAnimationFrame loop drives VSync lockstep
      app.ticker.stop();
      app.ticker.maxFPS = 0; // Allow native 60/90/120Hz VSync pacing without artificial timer drift

      appRef.current = app;
      const canvas = app.canvas;

      // Pixi maps pointer -> stage using canvas.getBoundingClientRect(). Under a 90/270deg CSS rotation
      // (virtual landscape on a portrait phone) that rect is the rotated bounding box, so x/y would be
      // swapped/mirrored. Invert the rotation here; 0deg keeps Pixi's default behaviour.
      const events = app.renderer.events as unknown as {
        mapPositionToPoint: (point: { x: number; y: number }, x: number, y: number) => void;
      };
      const defaultMap = events.mapPositionToPoint.bind(events);
      events.mapPositionToPoint = (point, clientX, clientY) => {
        const rot = rotationRef.current;
        if (rot === 0) {
          defaultMap(point, clientX, clientY);
          return;
        }
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        // Fractions along the canvas' OWN x / y axes (0..1)
        const fx =
          rot === 90 ? (clientY - rect.top) / rect.height : (rect.bottom - clientY) / rect.height;
        const fy =
          rot === 90 ? (rect.right - clientX) / rect.width : (clientX - rect.left) / rect.width;
        // canvas.width/height are device pixels (= logical size * resolution)
        point.x = (fx * canvas.width) / app.renderer.resolution;
        point.y = (fy * canvas.height) / app.renderer.resolution;
      };
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.transform = 'translateZ(0)';
      canvas.style.backfaceVisibility = 'hidden';
      hostRef.current.innerHTML = '';
      hostRef.current.appendChild(canvas);

      const gameScene = new GameScene(
        {
          onCallLandlord: (call) => manager.callLandlord(call),
          onGrabLandlord: (grab) => manager.grabLandlord(grab),
          onPlaySelectedCards: (cards) => manager.playCards(cards),
          onPassTurn: () => manager.passTurn(),
          onRequestHint: () => manager.requestHint(),
        },
        virtualWidth
      );

      gameScene.applyLayoutPercentages(metricsRef.current.zones);
      gameScene.syncFrameUiScale(metricsRef.current.uiElementScale);
      sceneRef.current = gameScene;
      app.stage.addChild(gameScene);
      manager.attachScene(gameScene);

      // Unified requestAnimationFrame Render Loop with Performance Monitor & --ui-element-scale Lockstep
      const frameSyncLoop = (now: number) => {
        if (destroyed || !appRef.current) return;

        const rawDt = now - perfMonitor.lastFrameTime;
        perfMonitor.lastFrameTime = now;

        // Clamp abnormal tab-switch delta spikes to prevent physics/animation lurch
        const clampedDt = Math.max(1, Math.min(rawDt, 50));
        const frameJitter = Math.abs(clampedDt - perfMonitor.emaFrameMs);

        // Update exponential moving averages for frame time and high-refresh jitter
        perfMonitor.emaFrameMs = perfMonitor.emaFrameMs * 0.88 + clampedDt * 0.12;
        perfMonitor.emaJitterMs = perfMonitor.emaJitterMs * 0.85 + frameJitter * 0.15;

        // Dynamic anti-jitter resolution scaling for high-DPI / high-refresh mobile screens
        if (perfMonitor.emaFrameMs > 21 && perfMonitor.emaJitterMs > 4.2) {
          perfMonitor.highJitterFrames += 1;
          perfMonitor.stableFrames = 0;
          if (perfMonitor.highJitterFrames >= 24 && perfMonitor.currentResolution > 1.25) {
            perfMonitor.currentResolution = Math.max(
              1.15,
              Number((perfMonitor.currentResolution - 0.25).toFixed(2))
            );
            app.renderer.resolution = perfMonitor.currentResolution;
            perfMonitor.highJitterFrames = 0;
          }
        } else if (perfMonitor.emaFrameMs < 14.5 && perfMonitor.emaJitterMs < 2.2) {
          perfMonitor.stableFrames += 1;
          perfMonitor.highJitterFrames = 0;
          if (perfMonitor.stableFrames >= 90 && perfMonitor.currentResolution < nativeDpr) {
            perfMonitor.currentResolution = Math.min(
              nativeDpr,
              Number((perfMonitor.currentResolution + 0.25).toFixed(2))
            );
            app.renderer.resolution = perfMonitor.currentResolution;
            perfMonitor.stableFrames = 0;
          }
        }

        // Read live --ui-element-scale and damp sub-pixel oscillations
        // getComputedStyle forces a style recalc: sample every 4th frame instead of every frame
        if (perfMonitor.uiScaleSampleCounter++ % 4 === 0) {
          perfMonitor.cachedLiveUiScale = readLiveCssUiScale();
        }
        const liveUiScale = perfMonitor.cachedLiveUiScale;
        perfMonitor.smoothedUiScale += (liveUiScale - perfMonitor.smoothedUiScale) * 0.35;
        const m = metricsRef.current;
        const mAspect = m.height > 0 ? m.width / m.height : DESIGN_WIDTH / DESIGN_HEIGHT;
        const mVirtualWidth = Math.max(
          DESIGN_WIDTH,
          Math.min(1660, Math.round(DESIGN_HEIGHT * mAspect))
        );
        const fitScale = computeFitScale(m.width, m.height, mVirtualWidth);
        const uiModulation = 0.985 + ((perfMonitor.smoothedUiScale - 0.78) / 0.22) * 0.015;
        const targetStageScale = fitScale * Math.max(0.97, Math.min(1.0, uiModulation));

        if (perfMonitor.smoothedStageScale === 0) {
          perfMonitor.smoothedStageScale = targetStageScale;
        } else {
          perfMonitor.smoothedStageScale +=
            (targetStageScale - perfMonitor.smoothedStageScale) * 0.38;
        }

        // Quantize to 0.0005 deadzone so 120Hz screens never micro-vibrate at sub-pixel boundaries
        const quantizedStageScale = Number(perfMonitor.smoothedStageScale.toFixed(4));
        if (Math.abs(quantizedStageScale - perfMonitor.lastAppliedStageScale) >= 0.0005) {
          perfMonitor.lastAppliedStageScale = quantizedStageScale;
          if (stageBoxRef.current) {
            stageBoxRef.current.style.transform = `translate3d(-50%, -50%, 0) scale(${quantizedStageScale})`;
          }
          if (hudInnerRef.current) {
            hudInnerRef.current.style.transform = `translate3d(-50%, -50%, 0) scale(${quantizedStageScale})`;
          }
        }

        // Sync PixiJS internal widget scale with --ui-element-scale before rendering
        if (sceneRef.current) {
          sceneRef.current.syncFrameUiScale(perfMonitor.smoothedUiScale);
        }

        // Step PixiJS ticker & render synchronously in this VSync frame
        app.ticker.update(now);
        app.render();

        rafId = requestAnimationFrame(frameSyncLoop);
      };

      rafId = requestAnimationFrame(frameSyncLoop);
    };

    initPixi();

    return () => {
      destroyed = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      manager.detachScene();
      manager.destroy();
      if (sceneRef.current) {
        sceneRef.current.destroyScene();
        sceneRef.current = null;
      }
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, []);

  const myPlayer = viewState.players[viewState.mySeat];
  const rightSeat = (viewState.mySeat + 1) % 3;
  const leftSeat = (viewState.mySeat + 2) % 3;
  const rightPlayer = viewState.players[rightSeat];
  const leftPlayer = viewState.players[leftSeat];
  const isMyTurn = viewState.currentSeat === viewState.mySeat;

  // Sync GameControlHub trusteeship & Auto-Next-Round with Dou Dizhu GameStateManager
  useEffect(() => {
    if (
      viewState.phase === 'SETTLEMENT' &&
      (controlState.autoNextRound || controlState.isTrusteeship)
    ) {
      const nextTimer = window.setTimeout(() => {
        managerRef.current?.readyForNextRound();
      }, gameControlHub.scaleDelay(2600));
      return () => window.clearTimeout(nextTimer);
    }

    if (!myPlayer || viewState.phase === 'WAITING' || viewState.phase === 'SETTLEMENT') {
      return;
    }

    if (Boolean(myPlayer.trusteeship) !== controlState.isTrusteeship) {
      managerRef.current?.toggleTrusteeship();
    }
  }, [
    viewState.phase,
    myPlayer,
    controlState.isTrusteeship,
    controlState.autoNextRound,
    controlState.paceSpeed,
  ]);

  const getRelationLabel = (seatIdx: number): { text: string; isTeammate: boolean } | null => {
    if (seatIdx === viewState.mySeat || viewState.landlordSeat === null) return null;
    const isTeammate =
      viewState.landlordSeat !== viewState.mySeat && viewState.landlordSeat !== seatIdx;
    return {
      text: isTeammate ? '队友' : '对手',
      isTeammate,
    };
  };

  const handleCopyRoomId = () => {
    if (!viewState.roomId) return;
    navigator.clipboard?.writeText(viewState.roomId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  /**
   * Render Left/Right Opponent Seat HUD using percentage coordinates (`avatarTopPct`, `sideMarginPct`)
   * and smooth CSS variable scaling (`var(--ui-element-scale)`) for seamless resize transitions.
   */
  const renderOpponentSeatHud = (
    player: SeatPlayerInfo | null,
    seatIdx: number,
    side: 'left' | 'right'
  ) => {
    const posStyle: React.CSSProperties = {
      top: `${zones.avatarTopPct}%`,
      ...(side === 'left'
        ? { left: `${zones.sideMarginPct}%`, transformOrigin: 'top left' }
        : { right: `${zones.sideMarginPct}%`, transformOrigin: 'top right' }),
      transform: 'scale(var(--ui-element-scale, 1))',
    };

    if (!player) {
      return (
        <div
          style={posStyle}
          className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute z-20"
        >
          <ArenaMatchingSeatPod
            side={side}
            onAddBot={() => managerRef.current?.addBot()}
          />
        </div>
      );
    }

    const hasRoleAssigned = viewState.landlordSeat !== null;
    const isLandlord = viewState.landlordSeat === seatIdx;
    const relation = getRelationLabel(seatIdx);
    const isCurrentTurn =
      viewState.currentSeat === seatIdx &&
      viewState.phase !== 'WAITING' &&
      viewState.phase !== 'SETTLEMENT';
    const bubble = viewState.chatBubbles[seatIdx];
    const showPropMenu = activePropTargetSeat === seatIdx;
    const doubleVal = player.doubleFactor ?? player.doubleMultiplier ?? 1;
    const openVal = player.openHandFactor ?? 1;
    const presenceState = resolvePlayerPresenceState(player);

    // Build clean unboxed metadata items (max 1 badge on card, rest via middot separator)
    const metaParts: string[] = [];
    if (relation) metaParts.push(relation.text);
    if (doubleVal > 1) metaParts.push(`加倍×${doubleVal}`);
    if (openVal > 1) metaParts.push(`明牌×${openVal}`);
    if (presenceState === 'trusteeship') metaParts.push('智能代打');
    if (presenceState === 'offline') metaParts.push('信号中断');

    return (
      <div
        key={`seat-pod-${seatIdx}-${player.playerId}`}
        style={posStyle}
        className={`ui-scale-smooth ui-scaled-font pointer-events-auto absolute z-20 flex flex-col ${
          side === 'right' ? 'items-end' : 'items-start'
        }`}
      >
        {bubble && (
          <div
            className={`mb-1.5 flex items-center rounded-xl border border-[#D4AF37]/45 bg-[#0B1116]/95 px-3 py-1 text-xs font-bold text-[#F3F4F6] shadow-lg backdrop-blur-md ${
              side === 'right' ? 'self-end' : 'self-start'
            }`}
          >
            <span className="max-w-[176px] truncate">{bubble.text}</span>
          </div>
        )}

        <div
          onClick={() => {
            setActivePropTargetSeat((prev) => (prev === seatIdx ? null : seatIdx));
          }}
          className={`group flex max-w-[244px] cursor-pointer items-center gap-2.5 rounded-2xl border ${
            showPropMenu
              ? 'border-[#D4AF37] bg-[#0B1116]/96 ring-2 ring-[#D4AF37]/40'
              : presenceState === 'offline'
                ? 'border-rose-500/40 bg-[#090D12]/94'
                : isCurrentTurn
                  ? 'border-[#D4AF37] bg-gradient-to-b from-[#17222B]/96 to-[#0B1116]/96 shadow-[0_0_22px_rgba(212,175,55,0.34)]'
                  : isLandlord
                    ? 'border-[#D4AF37]/55 bg-gradient-to-b from-[#181612]/94 to-[#0B1116]/94'
                    : 'border-white/14 bg-[#0B1116]/92'
          } px-2.5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.55)] backdrop-blur-md hover:border-[#D4AF37]/75 transition-all duration-300`}
          title="点击头像向该玩家投掷互动道具"
        >
          <ArenaSeatAvatar
            playerId={player.playerId}
            avatarId={player.avatarId}
            size="md"
            hasRoleAssigned={hasRoleAssigned}
            isLandlord={isLandlord}
            isCurrentTurn={isCurrentTurn}
            presenceState={presenceState}
            seatIndex={seatIdx}
            animState={
              viewState.phase === 'SETTLEMENT'
                ? (viewState.settlement?.scoreChanges[player.playerId] ?? 0) >= 0
                  ? 'win'
                  : 'lose'
                : isCurrentTurn
                  ? 'think'
                  : 'idle'
            }
          />

          {/* Clean Scannable Player Identity & Bankroll Stack */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="max-w-[96px] truncate text-xs font-extrabold tracking-tight text-[#F8FAFC]">
                {player.nickname}
              </span>
              {hasRoleAssigned && (
                <span
                  className={`rounded px-1.5 py-0.2 text-[10px] font-extrabold whitespace-nowrap shrink-0 ${
                    isLandlord
                      ? 'bg-gradient-to-b from-[#F3E5AB] to-[#D4AF37] text-[#12171B]'
                      : 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {isLandlord ? '地主' : '农民'}
                </span>
              )}
            </div>

            {/* Golden Bean Stack */}
            <div className="mt-0.5 flex items-center gap-1 text-xs font-mono font-extrabold text-[#F3E5AB] tabular-nums">
              <img
                src="/assets/ui/icon_douzi.png"
                alt=""
                className="h-3.5 w-3.5 shrink-0 object-contain"
                draggable={false}
              />
              <span className="truncate">
                {player.beans >= 100000
                  ? `${(player.beans / 10000).toFixed(2)}万`
                  : player.beans.toLocaleString()}
              </span>
            </div>

            {/* Unboxed Middot Metadata Line */}
            {metaParts.length > 0 && (
              <div className="mt-0.5 truncate text-[10px] font-bold text-[#94A3B8]">
                {metaParts.join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Live Open-Hand (明牌) or Settlement Showdown (摊牌) Mini Card Rack */}
        {viewState.openHands?.[seatIdx] && viewState.openHands[seatIdx].length > 0 && (
          <div
            className={`mt-1.5 flex max-w-[236px] flex-wrap gap-0.5 rounded-xl border border-[#D4AF37]/45 bg-[#12171B]/94 p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.6)] backdrop-blur-md ${
              side === 'right' ? 'justify-end self-end' : 'justify-start self-start'
            }`}
          >
            <div className="mb-0.5 flex w-full items-center justify-between px-0.5 text-[9px] font-extrabold text-[#D4AF37]">
              <span>{viewState.phase === 'SETTLEMENT' ? '摊牌亮底' : '明牌透视'}</span>
              <span className="font-mono">{viewState.openHands[seatIdx].length}张</span>
            </div>
            {viewState.openHands[seatIdx].map((card) => {
              const isRed =
                card.suit === 'heart' || card.suit === 'diamond' || card.rank === 'big_joker';
              const suitChar =
                card.suit === 'spade'
                  ? '♠'
                  : card.suit === 'heart'
                    ? '♥'
                    : card.suit === 'club'
                      ? '♣'
                      : card.suit === 'diamond'
                        ? '♦'
                        : '';
              const label =
                card.rank === 'big_joker'
                  ? '大王'
                  : card.rank === 'small_joker'
                    ? '小王'
                    : `${suitChar}${card.rank}`;
              return (
                <span
                  key={card.id}
                  className={`inline-flex items-center justify-center rounded border px-1 py-0.2 font-mono text-[10px] font-extrabold leading-tight shadow-xs ${
                    card.isWild
                      ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                      : isRed
                        ? 'border-rose-400/35 bg-[#F8FAFC] text-rose-600'
                        : 'border-slate-300/40 bg-[#F8FAFC] text-slate-900'
                  }`}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {showPropMenu && (
          <div
            className={`mt-1.5 flex items-center gap-1 rounded-xl border border-white/12 bg-[#12171B]/95 p-1.5 text-[#F3F4F6] shadow-xl backdrop-blur-md ${
              side === 'right' ? 'self-end' : 'self-start'
            }`}
          >
            {INTERACTIVE_PROPS.map((prop) => (
              <button
                key={prop.type}
                type="button"
                onClick={() => {
                  managerRef.current?.throwProp(seatIdx, prop.type);
                  setActivePropTargetSeat(null);
                }}
                className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-xs font-bold text-[#E5E7EB] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/15 hover:text-white active:scale-95 transition-all whitespace-nowrap cursor-pointer"
              >
                {prop.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setActivePropTargetSeat(null)}
              aria-label="关闭互动菜单"
              className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const myBubble = viewState.chatBubbles[viewState.mySeat];
  const isMyLandlord = viewState.landlordSeat === viewState.mySeat;
  const currentRoomTier = getRoomTierByBaseScore(viewState.baseScore);

  return (
    <div
      ref={viewportRef}
      data-table-tier={tier}
      className="ui-scale-smooth relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,#0b3b29_0%,#051b12_65%,#120905_100%)] select-none"
    >
      {/* 3D Perspective Ambient Table Depth Aura (Whitepaper 3.1 Camera Stack) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/45 via-transparent to-transparent"
      />

      {/* Full-Bleed Frame-Synced PixiJS Stage Box (GPU-composited translate3d + scale lockstep) */}
      <div
        ref={stageBoxRef}
        style={{
          width: virtualWidth,
          height: DESIGN_HEIGHT,
          transform: `translate3d(-50%, -50%, 0) scale(${stageScale})`,
          transformOrigin: 'center center',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
        className="absolute top-1/2 left-1/2 shrink-0 overflow-hidden"
      >
        <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Percentage-Based Responsive HUD Container (Frame-synced with PixiJS stage & --ui-element-scale) */}
      <div
        ref={hudInnerRef}
        style={{
          width: virtualWidth,
          height: DESIGN_HEIGHT,
          transform: `translate3d(-50%, -50%, 0) scale(${stageScale})`,
          transformOrigin: 'center center',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
        className="pointer-events-none absolute top-1/2 left-1/2 z-20"
      >
        <DdzSpriteSheetCanvasOverlay width={virtualWidth} height={DESIGN_HEIGHT} />
        <div className="pointer-events-none relative h-full w-full">
          {/* BAND 1A: Top-Left Wing (`topBarTopPct%`, `sideMarginPct%`) - Auto-hidden during settlement */}
          {!(viewState.phase === 'SETTLEMENT' && viewState.settlement) && (
            <div
              style={{
                top: `${zones.topBarTopPct}%`,
                left: `${zones.sideMarginPct}%`,
                transform: 'scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top left',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => {
                  managerRef.current?.leaveRoom();
                  onLeaveRoom();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-[#12171B]/90 text-[#E5E7EB] shadow-lg backdrop-blur-md hover:border-[#D4AF37]/60 hover:text-white active:scale-95 transition-all cursor-pointer"
                title="返回大厅"
              >
                <LogOut className="h-4 w-4" />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMultiplierDetail((v) => !v)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-white/12 bg-[#12171B]/90 px-3.5 text-xs font-bold text-[#E5E7EB] shadow-lg backdrop-blur-md hover:border-[#D4AF37]/50 transition-all cursor-pointer"
                  title="点击查看当前牌局倍率明细"
                >
                  <span className="text-[#D4AF37] whitespace-nowrap shrink-0">
                    {viewState.dealMode === 'tiandi_laizi'
                      ? '天地癞子'
                      : viewState.dealMode === 'laizi'
                        ? '经典癞子'
                        : viewState.dealMode === 'no_shuffle'
                          ? '不洗牌'
                          : viewState.dealMode === 'swap_three'
                            ? '换三张'
                            : '经典斗地主'}
                  </span>
                  <span aria-hidden="true" className="text-white/20">
                    |
                  </span>
                  <span className="font-mono text-[#9CA3AF] tabular-nums whitespace-nowrap shrink-0">
                    底分 <strong className="text-[#F3F4F6]">{viewState.baseScore.toLocaleString()}</strong>
                  </span>
                  <span aria-hidden="true" className="text-white/20">
                    |
                  </span>
                  <span className="font-mono text-[#D4AF37] tabular-nums whitespace-nowrap shrink-0">
                    {viewState.multiplier}倍
                  </span>
                  <span aria-hidden="true" className="text-white/20">
                    |
                  </span>
                  <span className="font-mono text-emerald-300 tabular-nums whitespace-nowrap shrink-0">
                    单注 {(viewState.baseScore * viewState.multiplier).toLocaleString()}
                  </span>
                  {viewState.holeCardBonus && viewState.holeCardBonus.multiplier > 1 && (
                    <span className="rounded border border-[#D4AF37]/50 bg-[#D4AF37]/20 px-1.5 py-0.5 text-[10px] font-extrabold text-[#F3E5AB] whitespace-nowrap shrink-0">
                      {viewState.holeCardBonus.label}
                    </span>
                  )}
                  {(viewState.openHandMultiplier ?? 1) > 1 && (
                    <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-200 whitespace-nowrap shrink-0">
                      明牌 ×{viewState.openHandMultiplier}
                    </span>
                  )}
                  {viewState.wildRanks.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-white/20">
                        |
                      </span>
                      <span className="rounded border border-[#D4AF37]/35 bg-[#D4AF37]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#F3E5AB] tabular-nums whitespace-nowrap shrink-0">
                        {viewState.wildRanks
                          .map((r, idx) => `${idx === 0 ? '天癞' : '地癞'}[${r}]`)
                          .join(' ')}
                      </span>
                    </>
                  )}
                </button>

                {showMultiplierDetail && (
                  <div className="absolute top-11 left-0 z-30 w-64 rounded-xl border border-white/12 bg-[#12171B]/95 p-3 text-xs text-[#E5E7EB] shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                      <span className="font-bold text-[#F3F4F6]">竞技场实时底池与倍率</span>
                      <span className="font-mono text-[11px] font-bold text-[#D4AF37]">
                        总计 ×{viewState.multiplier}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">公平验牌局号</span>
                        <span className="font-mono text-[10px] font-semibold text-emerald-300">
                          #{viewState.roundFairHash ?? 'DDZ-8942A1'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">场次底分</span>
                        <span className="font-mono font-bold text-[#F3F4F6]">
                          {viewState.baseScore.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">底牌奇牌暴击</span>
                        <span className="font-mono font-bold text-[#D4AF37]">
                          {viewState.holeCardBonus && viewState.holeCardBonus.multiplier > 1
                            ? `${viewState.holeCardBonus.label}`
                            : '×1 (普通底牌)'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">明牌博弈加成</span>
                        <span className="font-mono font-bold text-amber-300">
                          ×{viewState.openHandMultiplier ?? 1}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">我的加倍系数</span>
                        <span className="font-mono font-bold text-[#F3F4F6]">
                          ×{myPlayer?.doubleFactor ?? myPlayer?.doubleMultiplier ?? 1}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                        <span className="text-[#9CA3AF]">当前单注盈亏</span>
                        <span className="font-mono font-bold text-emerald-300">
                          {(viewState.baseScore * viewState.multiplier).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#9CA3AF]">地主最高敞口</span>
                        <span className="font-mono font-bold text-rose-300">
                          ±{(viewState.baseScore * viewState.multiplier * 2).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-white/10 pt-1.5">
                        <span className="text-[#9CA3AF]">场次封顶保护</span>
                        <span className="font-mono font-bold text-[#D4AF37]">
                          {currentRoomTier.maxMult}倍 ({(currentRoomTier.maxCap / 10000).toFixed(1)}万)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BAND 1B: Top-Right Wing (`topBarTopPct%`, `sideMarginPct%`) - Auto-hidden during settlement */}
          {!(viewState.phase === 'SETTLEMENT' && viewState.settlement) && (
            <div
              style={{
                top: `${zones.topBarTopPct}%`,
                right: `${zones.sideMarginPct}%`,
                transform: 'scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top right',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-2"
            >
              <button
                type="button"
                onClick={() => setShowRecorder((v) => !v)}
                className={`flex h-9 items-center rounded-xl border px-3.5 text-xs font-bold shadow-lg backdrop-blur-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  showRecorder
                    ? 'border-[#D4AF37]/80 bg-[#D4AF37]/20 text-[#F3E5AB]'
                    : 'border-white/12 bg-[#12171B]/90 text-[#E5E7EB] hover:border-[#D4AF37]/50 hover:text-white'
                }`}
              >
                <span>记牌器</span>
              </button>

              <button
                type="button"
                onClick={() => managerRef.current?.toggleTrusteeship()}
                className={`flex h-9 items-center rounded-xl border px-3.5 text-xs font-bold shadow-lg backdrop-blur-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  myPlayer?.trusteeship
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-[#12171B]'
                    : 'border-white/12 bg-[#12171B]/90 text-[#E5E7EB] hover:border-[#D4AF37]/50 hover:text-white'
                }`}
              >
                <span>{myPlayer?.trusteeship ? '取消托管' : '托管'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = soundEngine.toggle();
                  setSfxEnabled(next);
                  setBgmEnabled(soundEngine.isBgmEnabled());
                }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-[#12171B]/90 text-[#E5E7EB] shadow-lg backdrop-blur-md hover:border-[#D4AF37]/50 hover:text-white cursor-pointer transition-all"
                title={sfxEnabled ? '关闭声音' : '开启声音'}
              >
                {sfxEnabled ? (
                  <Volume2 className="h-4 w-4 text-[#D4AF37]" />
                ) : (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                )}
              </button>

              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-[#12171B]/90 text-[#E5E7EB] shadow-lg backdrop-blur-md hover:border-[#D4AF37]/50 hover:text-white cursor-pointer transition-all"
                  title={isFullscreen ? '退出全屏' : '全屏'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4 text-[#D4AF37]" />
                  ) : (
                    <Maximize2 className="h-4 w-4 text-[#E5E7EB]" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* BAND 1C: Floating Card Recorder (`recorderTopPct%`, centered at 50%) with Bomb & Rocket Risk Radar */}
          {showRecorder && viewState.phase !== 'WAITING' && !(viewState.phase === 'SETTLEMENT' && viewState.settlement) && (() => {
            const hasDualJokerOutside =
              (viewState.cardRecorder.big_joker ?? 0) === 1 &&
              (viewState.cardRecorder.small_joker ?? 0) === 1;
            const outsideQuadCount = RECORDER_ORDER.filter(
              (item) =>
                item.rank !== 'big_joker' &&
                item.rank !== 'small_joker' &&
                (viewState.cardRecorder[item.rank] ?? 0) === 4
            ).length;

            return (
              <div
                style={{
                  top: `${zones.recorderTopPct}%`,
                  left: '50%',
                  transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                  transformOrigin: 'top center',
                }}
                className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-2 overflow-hidden rounded-xl border border-white/14 bg-[#12171B]/94 px-2.5 py-1 shadow-[0_10px_28px_rgba(0,0,0,0.55)] backdrop-blur-md"
              >
                {(hasDualJokerOutside || outsideQuadCount > 0) && (
                  <div className="flex items-center gap-1 border-r border-white/12 pr-2">
                    {hasDualJokerOutside && (
                      <span className="rounded border border-rose-400/50 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-300 whitespace-nowrap">
                        王炸未出
                      </span>
                    )}
                    {outsideQuadCount > 0 && (
                      <span className="rounded border border-amber-400/50 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-200 whitespace-nowrap">
                        {outsideQuadCount}暗炸风险
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center divide-x divide-white/10">
                  {RECORDER_ORDER.map((item) => {
                    const count = viewState.cardRecorder[item.rank] ?? 0;
                    const isWildRank = viewState.wildRanks.includes(item.rank);
                    const isBombRisk =
                      count === 4 ||
                      (hasDualJokerOutside &&
                        (item.rank === 'big_joker' || item.rank === 'small_joker'));
                    return (
                      <div
                        key={item.rank}
                        className={`flex flex-col items-center px-1.5 text-center tabular-nums ${
                          isWildRank
                            ? 'bg-[#D4AF37]/20'
                            : isBombRisk
                              ? 'bg-rose-500/15'
                              : ''
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold leading-tight ${
                            isWildRank
                              ? 'text-[#F3E5AB]'
                              : item.rank === 'big_joker'
                                ? 'text-rose-400'
                                : item.rank === 'small_joker'
                                  ? 'text-sky-300'
                                  : isBombRisk
                                    ? 'text-amber-300'
                                    : 'text-[#9CA3AF]'
                          }`}
                        >
                          {isWildRank ? `[${item.label}]` : item.label}
                        </span>
                        <span
                          className={`font-mono text-xs font-bold leading-tight ${
                            count === 0
                              ? 'text-white/20'
                              : isBombRisk || isWildRank
                                ? 'text-[#D4AF37]'
                                : 'text-[#F3F4F6]'
                          }`}
                        >
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* BAND 2: Left & Right Opponent Seat HUDs (`avatarTopPct%`, above opponent card stacks at `opponentDeckTopPct%`) */}
          {renderOpponentSeatHud(leftPlayer, leftSeat, 'left')}
          {renderOpponentSeatHud(rightPlayer, rightSeat, 'right')}

          {/* BAND 4: Dedicated Card Action Button Bar (`actionBarTopPct%`, compact non-deforming tournament buttons) */}
          {viewState.phase === 'SWAPPING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-3.5"
            >
              <span className="flex h-9 items-center rounded-xl border border-[#D4AF37]/40 bg-[#12171B]/92 px-3.5 text-xs font-bold text-[#F3E5AB] shadow-lg backdrop-blur-md whitespace-nowrap shrink-0">
                {viewState.swapDirection === 'counter_clockwise' ? '逆时针换三张' : '顺时针换三张'}
              </span>
              <button
                type="button"
                onClick={() => managerRef.current?.autoSelectSwapThree()}
                className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-emerald-400/45 bg-gradient-to-b from-[#174936] to-[#0D2E22] px-4 text-sm font-bold text-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.45)] hover:border-emerald-300/70 hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                智能推荐
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.submitSwapThree()}
                disabled={(viewState.swapSubmittedSeats ?? []).includes(viewState.mySeat)}
                className="flex h-9.5 min-w-[116px] items-center justify-center rounded-xl border border-[#F3E5AB]/80 bg-gradient-to-b from-[#E5C158] via-[#D4AF37] to-[#B48A1E] px-5 text-sm font-extrabold text-[#12171B] shadow-[0_4px_14px_rgba(212,175,55,0.35)] hover:brightness-105 active:translate-y-0.5 disabled:opacity-55 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                {(viewState.swapSubmittedSeats ?? []).includes(viewState.mySeat)
                  ? '等待其他玩家...'
                  : '确认换三张'}
              </button>
            </div>
          )}

          {isMyTurn && viewState.phase === 'BIDDING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-3.5"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.callLandlord(false)}
                className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-white/18 bg-[#182026]/92 px-5 text-sm font-bold text-[#E5E7EB] shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-white/35 hover:text-white active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                不 叫
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.callLandlord(true)}
                className="flex h-9.5 min-w-[108px] items-center justify-center rounded-xl border border-[#F3E5AB]/80 bg-gradient-to-b from-[#E5C158] via-[#D4AF37] to-[#B48A1E] px-6 text-sm font-extrabold text-[#12171B] shadow-[0_4px_14px_rgba(212,175,55,0.38)] hover:brightness-105 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                叫地主
              </button>
              {!viewState.openHands?.[viewState.mySeat] && (
                <button
                  type="button"
                  onClick={() => {
                    managerRef.current?.declareOpenHand(5);
                    managerRef.current?.callLandlord(true);
                  }}
                  className="flex h-9.5 min-w-[116px] items-center justify-center rounded-xl border border-rose-300/65 bg-gradient-to-b from-[#C83E3E] to-[#8F1D1D] px-5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(200,62,62,0.42)] hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  明牌叫 ×5
                </button>
              )}
            </div>
          )}

          {isMyTurn && viewState.phase === 'GRABBING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-4"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.grabLandlord(false)}
                className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-white/18 bg-[#182026]/92 px-5 text-sm font-bold text-[#E5E7EB] shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-white/35 hover:text-white active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                不 抢
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.grabLandlord(true)}
                className="flex h-9.5 min-w-[116px] items-center justify-center rounded-xl border border-rose-300/60 bg-gradient-to-b from-[#C83E3E] to-[#8F1D1D] px-6 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(200,62,62,0.4)] hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                抢地主 ×2
              </button>
            </div>
          )}

          {isMyTurn && viewState.phase === 'DOUBLING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-3"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(1)}
                className="flex h-9.5 min-w-[92px] items-center justify-center rounded-xl border border-white/18 bg-[#182026]/92 px-4 text-sm font-bold text-[#E5E7EB] shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-white/35 hover:text-white active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                不加倍
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(2)}
                className="flex h-9.5 min-w-[104px] items-center justify-center rounded-xl border border-[#F3E5AB]/80 bg-gradient-to-b from-[#E5C158] via-[#D4AF37] to-[#B48A1E] px-5 text-sm font-extrabold text-[#12171B] shadow-[0_4px_14px_rgba(212,175,55,0.38)] hover:brightness-105 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                加倍 ×2
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(4)}
                className="flex h-9.5 min-w-[120px] items-center justify-center rounded-xl border border-rose-300/60 bg-gradient-to-b from-[#C83E3E] to-[#8F1D1D] px-5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(200,62,62,0.42)] hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                超级加倍 ×4
              </button>
              {!viewState.openHands?.[viewState.mySeat] && (
                <button
                  type="button"
                  onClick={() => managerRef.current?.declareOpenHand(3)}
                  className="flex h-9.5 min-w-[104px] items-center justify-center rounded-xl border border-amber-300/70 bg-gradient-to-b from-amber-500 to-amber-700 px-4 text-sm font-extrabold text-[#12171B] shadow-[0_4px_14px_rgba(245,158,11,0.38)] hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  明牌 ×3
                </button>
              )}
            </div>
          )}

          {isMyTurn && viewState.phase === 'PLAYING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-3.5"
            >
              {!viewState.isFreeLead ? (
                <button
                  type="button"
                  onClick={() => managerRef.current?.passTurn()}
                  className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-white/18 bg-[#182026]/92 px-5 text-sm font-bold text-[#E5E7EB] shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-white/35 hover:text-white active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  不 出
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => managerRef.current?.clearSelection()}
                  className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-white/18 bg-[#182026]/92 px-5 text-sm font-bold text-[#E5E7EB] shadow-[0_4px_12px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-white/35 hover:text-white active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  重 选
                </button>
              )}
              <button
                type="button"
                onClick={() => managerRef.current?.requestHint()}
                className="flex h-9.5 min-w-[96px] items-center justify-center rounded-xl border border-emerald-400/45 bg-gradient-to-b from-[#174936] to-[#0D2E22] px-5 text-sm font-bold text-emerald-100 shadow-[0_4px_12px_rgba(0,0,0,0.45)] hover:border-emerald-300/70 hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                提 示
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.playSelectedCards()}
                className="flex h-9.5 min-w-[108px] items-center justify-center rounded-xl border border-[#F3E5AB]/85 bg-gradient-to-b from-[#E5C158] via-[#D4AF37] to-[#B48A1E] px-6 text-sm font-extrabold text-[#12171B] shadow-[0_4px_14px_rgba(212,175,55,0.4)] hover:brightness-105 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                出 牌
              </button>
            </div>
          )}

          {/* BAND 6: Dedicated Bottom Status Dock (`bottomDockBottomPct%`, auto-hidden during settlement) */}
          {!(viewState.phase === 'SETTLEMENT' && viewState.settlement) && (
            <div
              style={{
                bottom: `${zones.bottomDockBottomPct}%`,
                left: `${zones.sideMarginPct}%`,
                right: `${zones.sideMarginPct}%`,
              }}
              className="pointer-events-none absolute flex items-end justify-between"
            >
              {/* Bottom-Left: My Player Slim Status Pill (smoothly scaled via `--ui-element-scale`) */}
              <div
                style={{
                  transform: 'scale(var(--ui-element-scale, 1))',
                  transformOrigin: 'bottom left',
                }}
                className="ui-scale-smooth ui-scaled-font pointer-events-auto flex flex-col items-start"
              >
                {myBubble && (
                  <div className="mb-1.5 flex items-center gap-1.5 rounded-xl border border-[#D4AF37]/45 bg-[#12171B]/95 px-3 py-1 text-xs font-bold text-[#F3F4F6] shadow-xl backdrop-blur-md">
                    <span className="max-w-[200px] truncate">{myBubble.text}</span>
                  </div>
                )}

                {myPlayer && (
                  <div
                    className={`flex items-center gap-2.5 rounded-2xl border ${
                      isMyTurn && viewState.phase !== 'WAITING' && viewState.phase !== 'SETTLEMENT'
                        ? 'border-[#D4AF37] bg-gradient-to-b from-[#17222B]/96 to-[#0B1116]/96 shadow-[0_0_22px_rgba(212,175,55,0.34)]'
                        : isMyLandlord
                          ? 'border-[#D4AF37]/55 bg-gradient-to-b from-[#181612]/94 to-[#0B1116]/94'
                          : 'border-white/14 bg-[#0B1116]/92'
                    } py-1.5 pr-4 pl-2 shadow-[0_10px_24px_rgba(0,0,0,0.55)] backdrop-blur-md transition-all duration-300`}
                  >
                    <ArenaSeatAvatar
                      playerId={myPlayer.playerId}
                      avatarId={myPlayer.avatarId}
                      size="sm"
                      hasRoleAssigned={viewState.landlordSeat !== null}
                      isLandlord={isMyLandlord}
                      isCurrentTurn={
                        isMyTurn &&
                        viewState.phase !== 'WAITING' &&
                        viewState.phase !== 'SETTLEMENT'
                      }
                      presenceState={resolvePlayerPresenceState(myPlayer)}
                      seatIndex={viewState.mySeat}
                      animState={
                        viewState.phase === 'SETTLEMENT'
                          ? (viewState.settlement?.scoreChanges[myPlayer.playerId] ?? 0) >= 0
                            ? 'win'
                            : 'lose'
                          : isMyTurn && viewState.phase !== 'WAITING'
                            ? 'play'
                            : 'idle'
                      }
                    />
                    <div className="flex items-center gap-2 text-xs">
                      <span className="max-w-[110px] truncate font-extrabold text-[#F8FAFC]">
                        {myPlayer.nickname}
                      </span>
                      {viewState.landlordSeat !== null && (
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] font-extrabold whitespace-nowrap shrink-0 ${
                            isMyLandlord
                              ? 'bg-gradient-to-b from-[#F3E5AB] to-[#D4AF37] text-[#12171B]'
                              : 'border border-emerald-400/35 bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {isMyLandlord ? '地主' : '农民'}
                        </span>
                      )}
                      <span className="flex items-center gap-1 font-mono font-extrabold text-[#F3E5AB] tabular-nums whitespace-nowrap shrink-0">
                        <img
                          src="/assets/ui/icon_douzi.png"
                          alt=""
                          className="h-3.5 w-3.5 shrink-0 object-contain"
                          draggable={false}
                        />
                        {myPlayer.beans.toLocaleString()}
                      </span>
                      {((myPlayer.doubleFactor ?? myPlayer.doubleMultiplier ?? 1) > 1 ||
                        (myPlayer.openHandFactor ?? 1) > 1 ||
                        myPlayer.trusteeship ||
                        myPlayer.disconnected) && (
                        <span className="text-[11px] font-bold text-[#94A3B8] whitespace-nowrap shrink-0">
                          {[
                            (myPlayer.doubleFactor ?? myPlayer.doubleMultiplier ?? 1) > 1
                              ? `加倍×${myPlayer.doubleFactor ?? myPlayer.doubleMultiplier}`
                              : null,
                            (myPlayer.openHandFactor ?? 1) > 1
                              ? `明牌×${myPlayer.openHandFactor}`
                              : null,
                            myPlayer.disconnected
                              ? '信号中断'
                              : myPlayer.trusteeship
                                ? '智能代打'
                                : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom-Right: Sort + Quick Chat Controls */}
              <div
                style={{
                  transform: 'scale(var(--ui-element-scale, 1))',
                  transformOrigin: 'bottom right',
                }}
                className="ui-scale-smooth ui-scaled-font pointer-events-auto flex flex-col items-end"
              >
                {showChatPanel && (
                  <div className="mb-2 w-60 rounded-2xl border border-white/12 bg-[#12171B]/95 p-3 text-[#F3F4F6] shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                      <span className="text-xs font-bold text-[#F3F4F6]">牌桌快捷语</span>
                      <button
                        type="button"
                        onClick={() => setShowChatPanel(false)}
                        className="rounded-lg p-1 text-[#9CA3AF] hover:bg-white/10 hover:text-white cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      {QUICK_PHRASES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            managerRef.current?.sendChat(item.text);
                            setShowChatPanel(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-left text-xs font-medium text-[#E5E7EB] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-white transition-colors cursor-pointer"
                        >
                          <span className="truncate">{item.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {viewState.phase !== 'WAITING' && viewState.phase !== 'SETTLEMENT' && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextMode = managerRef.current?.toggleHandSortMode() ?? 'rank';
                        setHandSortMode(nextMode);
                      }}
                      className={`flex h-8.5 items-center rounded-xl border px-3 text-xs font-bold shadow-lg backdrop-blur-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        handSortMode === 'count'
                          ? 'border-[#D4AF37]/80 bg-[#D4AF37]/20 text-[#F3E5AB]'
                          : 'border-white/12 bg-[#12171B]/90 text-[#E5E7EB] hover:border-[#D4AF37]/50 hover:text-white'
                      }`}
                      title="切换理牌顺序"
                    >
                      <span>{handSortMode === 'count' ? '按张数' : '按大小'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowChatPanel((v) => !v)}
                    className="flex h-8.5 items-center rounded-xl border border-white/12 bg-[#12171B]/90 px-3 text-xs font-bold text-[#D4AF37] shadow-lg backdrop-blur-md hover:border-[#D4AF37]/50 hover:text-[#F3E5AB] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>快捷语</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Waiting For Players Overlay (Outside scaled stage so it never distorts) */}
      {viewState.phase === 'WAITING' && (
        <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]">
          <div className="relative w-[310px] sm:w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 p-5 text-center text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <h3 className="text-[15px] font-bold tracking-wide text-[#F3F4F6]">
              等待牌友入座 ({viewState.players.filter(Boolean).length}/3)
            </h3>
            <p className="mt-1.5 text-xs text-[#9CA3AF] tabular-nums">
              房号{' '}
              <span className="font-mono font-bold text-[#E5B85B]">
                {viewState.roomId}
              </span>{' '}
              · 底分 <span className="font-mono font-semibold text-[#F3F4F6]">{viewState.baseScore}</span>
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyRoomId}
                className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? '已复制房号' : '复制房号'}
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.addBot()}
                className="flex h-8.5 min-w-[116px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                添加 AI 开局
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {viewState.errorToast && (
        <div className="pointer-events-none fixed top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D4AF37]/40 bg-[#12171B]/95 px-4 py-2 text-xs font-bold text-[#E5B85B] shadow-xl backdrop-blur-md">
          {viewState.errorToast}
        </div>
      )}

      {/* Authoritative Settlement Modal (Outside scaled stage) */}
      {viewState.phase === 'SETTLEMENT' && viewState.settlement && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div className="relative flex max-h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <SettlementHeroHeader
              selfScoreDelta={
                viewState.settlement.scoreChanges[myPlayer?.playerId || ''] ?? 0
              }
              titleWin={
                viewState.settlement.isLandlordWin ? '地主获胜' : '农民获胜'
              }
              titleLose={
                viewState.settlement.isLandlordWin ? '地主获胜' : '农民获胜'
              }
              subtitle={`底分 ${viewState.settlement.baseScore.toLocaleString()} · 共 ${viewState.settlement.effectiveMultiplier ?? viewState.settlement.totalMultiplier} 倍${viewState.settlement.isSpring || viewState.settlement.isAntiSpring ? ` (${viewState.settlement.isSpring ? '春天' : '反春'})` : ''}`}
              onClose={() => managerRef.current?.readyForNextRound()}
            />

            {/* Compact Rounded Player Cards */}
            <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
              {viewState.players.map((p, idx) => {
                if (!p) return null;
                const delta = viewState.settlement!.scoreChanges[p.playerId] ?? 0;
                const isLandlord = idx === viewState.landlordSeat;
                const isMe = idx === viewState.mySeat;
                const isProtected = (
                  viewState.settlement!.bankruptProtectedIds ?? []
                ).includes(p.playerId);
                const remainCount = (
                  viewState.settlement!.remainingHands[p.playerId] ?? []
                ).length;

                return (
                  <div
                    key={p.playerId}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 ${
                      isMe
                        ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08]'
                        : 'border-white/[0.07] bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/12 bg-black/40">
                        <AvatarSvg
                          avatarId={p.avatarId}
                          size={32}
                          isLandlord={isLandlord}
                        />
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#F3F4F6]">
                          <span className="max-w-[110px] truncate">{p.nickname}</span>
                          {isMe && (
                            <span className="text-[11px] font-semibold text-[#E5B85B]">· 我</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#9CA3AF] tabular-nums">
                          <span>{isLandlord ? '地主' : '农民'}</span>
                          <span aria-hidden="true">·</span>
                          <span>积分 {p.beans.toLocaleString()}</span>
                          {isProtected && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#E5B85B]">防爆</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-xs font-medium text-[#9CA3AF] tabular-nums">
                      {remainCount === 0 ? '出完手牌' : `余 ${remainCount} 张`}
                    </div>

                    <div className="flex w-22 shrink-0 flex-col items-end">
                      <RollingScoreCounter
                        value={delta}
                        size="md"
                        durationMs={900}
                        playTickSound={isMe}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Compact Right-Aligned Action Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
              {viewState.settlement.replay && (
                <button
                  type="button"
                  onClick={() => {
                    hapticEngine.tap();
                    setActiveReplay(viewState.settlement!.replay!);
                  }}
                  className="flex h-8.5 min-w-[80px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  明牌复盘
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  managerRef.current?.leaveRoom();
                  onLeaveRoom();
                }}
                className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
              >
                返回大厅
              </button>

              <button
                type="button"
                onClick={() => managerRef.current?.readyForNextRound()}
                className="flex h-8.5 min-w-[96px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] transition-colors hover:bg-[#E0A842] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
              >
                再来一局
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Perspective 3-Seat Open-Card Replay Viewer Modal */}
      {activeReplay && (
        <ReplayViewerModal
          replay={activeReplay}
          viewerPlayerId={myPlayer?.playerId}
          onClose={() => setActiveReplay(null)}
        />
      )}
    </div>
  );
};

/**
 * Public entry. Landscape: fills the (safe-area) box. Phone portrait: the whole table is rotated into
 * landscape automatically - no "please rotate" prompt. Scale is always uniform (contain-fit), never stretched.
 */
export const DdzTableView: React.FC<DdzTableViewProps> = (props) => (
  <AutoLandscapeContainer>
    {({ rotationDeg }) => <DdzTableStage {...props} rotationDeg={rotationDeg} />}
  </AutoLandscapeContainer>
);
