import React, { useEffect, useRef, useState } from 'react';
import { Application } from 'pixi.js';
import gsap from 'gsap';
import {
  ArrowUpDown,
  Bot,
  Copy,
  Check,
  Coffee,
  Coins,
  Eye,
  Film,
  Flame,
  Heart,
  LogOut,
  Maximize2,
  Minimize2,
  MessageSquare,
  Music,
  RotateCcw,
  Smartphone,
  Sparkles,
  ThumbsUp,
  Volume2,
  VolumeX,
  UserPlus,
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
  DdzViewState,
  GameStateManager,
} from './managers/GameStateManager';
import { preloadAllCardTextures } from './assets/CardAtlasGenerator';
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

const renderPropIcon = (type: PropType, className = 'h-4 w-4') => {
  switch (type) {
    case 'flower':
      return <Heart className={`${className} text-rose-400`} />;
    case 'bomb_cup':
      return <Flame className={`${className} text-red-400`} />;
    case 'tea':
      return <Coffee className={`${className} text-emerald-400`} />;
    case 'like':
      return <ThumbsUp className={`${className} text-amber-400`} />;
    case 'ingot':
      return <Coins className={`${className} text-yellow-400`} />;
  }
};

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

      // Preload all 55 poker card textures into Assets cache BEFORE creating scene
      await preloadAllCardTextures();
      soundEngine.preloadDdzAudio();

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
          className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute z-20 flex items-center gap-2 rounded-xl border border-amber-400/25 bg-[#062016]/90 px-3 py-1.5 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => managerRef.current?.addBot()}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>添加AI补位</span>
          </button>
        </div>
      );
    }

    const isLandlord = viewState.landlordSeat === seatIdx;
    const isCurrentTurn =
      viewState.currentSeat === seatIdx &&
      viewState.phase !== 'WAITING' &&
      viewState.phase !== 'SETTLEMENT';
    const bubble = viewState.chatBubbles[seatIdx];
    const showPropMenu = activePropTargetSeat === seatIdx;

    return (
      <div
        style={posStyle}
        className={`ui-scale-smooth ui-scaled-font pointer-events-auto absolute z-20 flex flex-col ${
          side === 'right' ? 'items-end' : 'items-start'
        }`}
      >
        {bubble && (
          <div
            className={`mb-1 flex items-center gap-1.5 rounded-2xl border border-amber-300/60 bg-[#1B120C]/95 px-3 py-1 text-xs font-medium text-amber-100 shadow-xl backdrop-blur-md ${
              side === 'right' ? 'self-end' : 'self-start'
            }`}
          >
            <MessageSquare className="h-3 w-3 shrink-0 text-amber-300" />
            <span className="max-w-[168px] truncate">{bubble.text}</span>
          </div>
        )}

        <div
          onClick={() => {
            setActivePropTargetSeat((prev) => (prev === seatIdx ? null : seatIdx));
          }}
          className={`flex max-w-[224px] cursor-pointer items-center gap-2 rounded-xl border ${
            showPropMenu
              ? 'border-amber-300 bg-[#1B120C]/95 ring-2 ring-amber-400/50'
              : isCurrentTurn
                ? 'border-amber-300 bg-[#1B120C]/92 shadow-[0_0_16px_rgba(251,191,36,0.3)]'
                : isLandlord
                  ? 'border-amber-400/65 bg-[#1B120C]/88'
                  : 'border-emerald-400/25 bg-[#062016]/88'
          } px-2.5 py-1.5 shadow-md backdrop-blur-sm hover:border-amber-300/70 transition-all`}
          title="点击头像向该玩家投掷互动道具"
        >
          <div className="relative shrink-0">
            <AvatarSvg
              avatarId={player.avatarId}
              size={36}
              isLandlord={isLandlord}
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
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-xs font-extrabold text-[#FAF8F5]">
              <span className="max-w-[92px] truncate">{player.nickname}</span>
              {viewState.landlordSeat !== null && (
                <span
                  className={`rounded px-1 py-0.2 text-[10px] font-black whitespace-nowrap shrink-0 ${
                    isLandlord
                      ? 'bg-amber-400 text-[#240e03]'
                      : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/35'
                  }`}
                >
                  {isLandlord ? '地主' : '农民'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-mono font-bold text-amber-300 tabular-nums">
              <span className="truncate">
                {player.beans >= 100000
                  ? `${(player.beans / 10000).toFixed(1)}万`
                  : player.beans.toLocaleString()}
              </span>
              {player.trusteeship && (
                <span className="font-sans text-[10px] text-amber-200 whitespace-nowrap shrink-0">·托管</span>
              )}
              {player.disconnected && (
                <span className="font-sans text-[10px] text-rose-400 whitespace-nowrap shrink-0">·离线</span>
              )}
            </div>
          </div>
        </div>

        {showPropMenu && (
          <div
            className={`mt-1.5 flex items-center gap-1 rounded-xl border border-amber-400/50 bg-[#062016]/95 p-1.5 shadow-2xl backdrop-blur-md ${
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
                className="flex flex-col items-center rounded-lg px-2 py-1 text-center hover:bg-emerald-800/70 active:scale-95 transition-all"
              >
                <div className="flex h-5 w-5 items-center justify-center">
                  {renderPropIcon(prop.type)}
                </div>
                <span className="mt-1 text-[10px] font-medium text-emerald-100 whitespace-nowrap">
                  {prop.label}
                </span>
              </button>
            ))}
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
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-2.5"
            >
              <button
                type="button"
                onClick={() => {
                  managerRef.current?.leaveRoom();
                  onLeaveRoom();
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/30 bg-[#062016]/90 text-emerald-100 shadow-md hover:border-amber-300 hover:text-white active:scale-95 transition-all cursor-pointer"
                title="返回大厅"
              >
                <LogOut className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 rounded-full border border-amber-400/25 bg-[#062016]/90 px-3.5 py-1.5 text-xs font-bold text-emerald-100 shadow-md backdrop-blur-sm">
                <span className="text-amber-300 whitespace-nowrap shrink-0">
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
                <span aria-hidden="true" className="text-emerald-600">
                  ·
                </span>
                <span className="font-mono text-emerald-200 tabular-nums whitespace-nowrap shrink-0">
                  底分 {viewState.baseScore.toLocaleString()}
                </span>
                <span aria-hidden="true" className="text-emerald-600">
                  ·
                </span>
                <span className="font-mono text-amber-300 tabular-nums whitespace-nowrap shrink-0">
                  {viewState.multiplier}倍
                </span>
                {viewState.wildRanks.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-emerald-600">
                      ·
                    </span>
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-bold text-amber-300 whitespace-nowrap shrink-0">
                      {viewState.wildRanks
                        .map((r, idx) => `${idx === 0 ? '天癞' : '地癞'}[${r}]`)
                        .join(' ')}
                    </span>
                  </>
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
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showRecorder
                    ? 'border-amber-400/70 bg-amber-500/25 text-amber-200'
                    : 'border-emerald-400/25 bg-[#062016]/90 text-emerald-100 hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>记牌器</span>
              </button>

              <button
                type="button"
                onClick={() => managerRef.current?.toggleTrusteeship()}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  myPlayer?.trusteeship
                    ? 'border-amber-400 bg-amber-500 text-[#18181B]'
                    : 'border-emerald-400/25 bg-[#062016]/90 text-emerald-100 hover:text-white'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                <span>{myPlayer?.trusteeship ? '取消托管' : '托管'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = soundEngine.toggle();
                  setSfxEnabled(next);
                  setBgmEnabled(soundEngine.isBgmEnabled());
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/25 bg-[#062016]/90 text-emerald-200 shadow-md hover:text-white cursor-pointer"
                title={sfxEnabled ? '关闭声音' : '开启声音'}
              >
                {sfxEnabled ? (
                  <Volume2 className="h-4 w-4 text-amber-300" />
                ) : (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                )}
              </button>

              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/25 bg-[#062016]/90 text-emerald-200 shadow-md hover:text-white cursor-pointer"
                  title={isFullscreen ? '退出全屏' : '全屏'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4 text-amber-300" />
                  ) : (
                    <Maximize2 className="h-4 w-4 text-emerald-200" />
                  )}
                </button>
              )}
            </div>
          )}

          {/* BAND 1C: Floating Card Recorder (`recorderTopPct%`, centered at 50%) - Auto-hidden during settlement */}
          {showRecorder && viewState.phase !== 'WAITING' && !(viewState.phase === 'SETTLEMENT' && viewState.settlement) && (
            <div
              style={{
                top: `${zones.recorderTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center overflow-hidden rounded-xl border border-amber-400/35 bg-[#062016]/95 px-2.5 py-1 shadow-lg backdrop-blur-sm"
            >
              <div className="flex items-center divide-x divide-emerald-800/70">
                {RECORDER_ORDER.map((item) => {
                  const count = viewState.cardRecorder[item.rank] ?? 0;
                  const isWildRank = viewState.wildRanks.includes(item.rank);
                  return (
                    <div
                      key={item.rank}
                      className={`flex flex-col items-center px-1.5 text-center tabular-nums ${
                        isWildRank ? 'bg-amber-500/20' : ''
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold leading-tight ${
                          isWildRank
                            ? 'text-amber-300'
                            : item.rank === 'big_joker'
                              ? 'text-rose-400'
                              : item.rank === 'small_joker'
                                ? 'text-sky-300'
                                : 'text-emerald-100'
                        }`}
                      >
                        {isWildRank ? `[${item.label}]` : item.label}
                      </span>
                      <span
                        className={`font-mono text-xs font-bold leading-tight ${
                          count === 0
                            ? 'text-emerald-700'
                            : count === 4 || isWildRank
                              ? 'text-amber-400'
                              : 'text-white'
                        }`}
                      >
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* BAND 2: Left & Right Opponent Seat HUDs (`avatarTopPct%`, above opponent card stacks at `opponentDeckTopPct%`) */}
          {renderOpponentSeatHud(leftPlayer, leftSeat, 'left')}
          {renderOpponentSeatHud(rightPlayer, rightSeat, 'right')}

          {/* BAND 4: Dedicated Card Action Button Bar (`actionBarTopPct%`, smoothly scaled via `--ui-element-scale` & `--ui-font-scale`) */}
          {viewState.phase === 'SWAPPING' && (
            <div
              style={{
                top: `${zones.actionBarTopPct}%`,
                left: '50%',
                transform: 'translateX(-50%) scale(var(--ui-element-scale, 1))',
                transformOrigin: 'top center',
              }}
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-4"
            >
              <span className="rounded-full border border-amber-400/50 bg-[#1B120C]/92 px-4 py-1.5 text-xs font-bold text-amber-200 shadow-lg whitespace-nowrap shrink-0">
                {viewState.swapDirection === 'counter_clockwise' ? '逆时针换三张' : '顺时针换三张'}
              </span>
              <button
                type="button"
                onClick={() => managerRef.current?.autoSelectSwapThree()}
                className="rounded-full border-t border-sky-200/80 bg-gradient-to-b from-sky-500 to-cyan-700 px-5 py-2 font-display text-sm font-extrabold text-white shadow-[0_4px_0_#0e7490,0_8px_16px_rgba(14,165,233,0.35)] hover:brightness-110 active:translate-y-0.5 transition-all whitespace-nowrap shrink-0"
              >
                智能推荐
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.submitSwapThree()}
                disabled={(viewState.swapSubmittedSeats ?? []).includes(viewState.mySeat)}
                className="rounded-full border-t border-amber-100/95 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 px-7 py-2 font-display text-base font-extrabold text-[#18181B] shadow-[0_4px_0_#92400e,0_8px_20px_rgba(245,158,11,0.45)] hover:brightness-105 active:translate-y-0.5 disabled:opacity-55 transition-all whitespace-nowrap shrink-0"
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
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-5"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.callLandlord(false)}
                className="rounded-full border-t border-emerald-200/60 bg-gradient-to-b from-emerald-700 to-emerald-900 px-8 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#022c22,0_8px_16px_rgba(0,0,0,0.45)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#022c22] transition-all whitespace-nowrap shrink-0"
              >
                不 叫
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.callLandlord(true)}
                className="rounded-full border-t border-amber-100/90 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 px-8 py-2 font-display text-base font-extrabold text-[#18181B] shadow-[0_4px_0_#92400e,0_8px_18px_rgba(245,158,11,0.4)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#92400e] transition-all whitespace-nowrap shrink-0"
              >
                叫地主
              </button>
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
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-5"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.grabLandlord(false)}
                className="rounded-full border-t border-emerald-200/60 bg-gradient-to-b from-emerald-700 to-emerald-900 px-8 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#022c22,0_8px_16px_rgba(0,0,0,0.45)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#022c22] transition-all whitespace-nowrap shrink-0"
              >
                不 抢
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.grabLandlord(true)}
                className="rounded-full border-t border-rose-200/80 bg-gradient-to-b from-rose-500 via-rose-600 to-red-800 px-8 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#7f1d1d,0_8px_18px_rgba(225,29,72,0.45)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#7f1d1d] transition-all whitespace-nowrap shrink-0"
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
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-4"
            >
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(1)}
                className="rounded-full border-t border-emerald-200/60 bg-gradient-to-b from-emerald-700 to-emerald-900 px-6 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#022c22,0_8px_16px_rgba(0,0,0,0.45)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#022c22] transition-all whitespace-nowrap shrink-0"
              >
                不加倍
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(2)}
                className="rounded-full border-t border-amber-100/90 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 px-6 py-2 font-display text-base font-extrabold text-[#18181B] shadow-[0_4px_0_#92400e,0_8px_18px_rgba(245,158,11,0.4)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#92400e] transition-all whitespace-nowrap shrink-0"
              >
                加倍 ×2
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.doubleScore(4)}
                className="rounded-full border-t border-amber-200/90 bg-gradient-to-r from-rose-600 via-red-600 to-amber-500 px-7 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#7f1d1d,0_8px_20px_rgba(225,29,72,0.5)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#7f1d1d] transition-all whitespace-nowrap shrink-0"
              >
                超级加倍 ×4
              </button>
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
              className="ui-scale-smooth ui-scaled-font pointer-events-auto absolute flex items-center gap-4"
            >
              {!viewState.isFreeLead ? (
                <button
                  type="button"
                  onClick={() => managerRef.current?.passTurn()}
                  className="rounded-full border-t border-slate-300/60 bg-gradient-to-b from-slate-600 to-slate-800 px-7 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#1e293b,0_8px_16px_rgba(0,0,0,0.4)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#1e293b] transition-all whitespace-nowrap shrink-0"
                >
                  不 出
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => managerRef.current?.clearSelection()}
                  className="rounded-full border-t border-slate-300/60 bg-gradient-to-b from-slate-600 to-slate-800 px-7 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#1e293b,0_8px_16px_rgba(0,0,0,0.4)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#1e293b] transition-all whitespace-nowrap shrink-0"
                >
                  重 选
                </button>
              )}
              <button
                type="button"
                onClick={() => managerRef.current?.requestHint()}
                className="rounded-full border-t border-emerald-200/80 bg-gradient-to-b from-emerald-500 to-emerald-700 px-7 py-2 font-display text-base font-extrabold text-white shadow-[0_4px_0_#064e3b,0_8px_16px_rgba(16,185,129,0.35)] hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_#064e3b] transition-all whitespace-nowrap shrink-0"
              >
                提 示
              </button>
              <button
                type="button"
                onClick={() => managerRef.current?.playSelectedCards()}
                className="rounded-full border-t border-amber-100/95 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 px-9 py-2 font-display text-base font-extrabold text-[#18181B] shadow-[0_4px_0_#92400e,0_8px_20px_rgba(245,158,11,0.45)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_#92400e] transition-all whitespace-nowrap shrink-0"
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
                  <div className="mb-1.5 flex items-center gap-1.5 rounded-2xl border border-amber-300/60 bg-[#1B120C]/95 px-3 py-1 text-xs font-medium text-amber-100 shadow-xl backdrop-blur-md">
                    <span className="max-w-[200px] truncate">{myBubble.text}</span>
                  </div>
                )}

                {myPlayer && (
                  <div
                    className={`flex items-center gap-2.5 rounded-full border ${
                      isMyTurn && viewState.phase !== 'WAITING' && viewState.phase !== 'SETTLEMENT'
                        ? 'border-amber-300 bg-[#1B120C]/95 shadow-[0_0_16px_rgba(251,191,36,0.28)]'
                        : isMyLandlord
                          ? 'border-amber-400/75 bg-[#1B120C]/92'
                          : 'border-emerald-400/30 bg-[#062016]/92'
                    } py-1 pr-3.5 pl-1.5 shadow-lg backdrop-blur-sm transition-all`}
                  >
                    <AvatarSvg
                      avatarId={myPlayer.avatarId}
                      size={30}
                      isLandlord={isMyLandlord}
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
                      <span className="max-w-[110px] truncate font-extrabold text-[#FAF8F5]">
                        {myPlayer.nickname}
                      </span>
                      {viewState.landlordSeat !== null && (
                        <span
                          className={`rounded px-1 py-0.2 text-[10px] font-black whitespace-nowrap shrink-0 ${
                            isMyLandlord
                              ? 'bg-amber-400 text-[#240e03]'
                              : 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/35'
                          }`}
                        >
                          {isMyLandlord ? '地主' : '农民'}
                        </span>
                      )}
                      <span className="font-mono font-bold text-amber-300 tabular-nums whitespace-nowrap shrink-0">
                        {myPlayer.beans.toLocaleString()}
                      </span>
                      {myPlayer.trusteeship && (
                        <span className="text-amber-300 whitespace-nowrap shrink-0">· 托管</span>
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
                  <div className="mb-2 w-60 rounded-2xl border border-[#DFD2B8] bg-[#FAF8F3]/98 p-3 text-[#1E242B] shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex items-center justify-between border-b border-[#E6DEC8] pb-1.5">
                      <span className="text-xs font-black text-[#2C1E10]">牌桌快捷语</span>
                      <button
                        type="button"
                        onClick={() => setShowChatPanel(false)}
                        className="rounded-full p-0.5 text-[#5A6572] hover:bg-black/5 hover:text-[#1E242B]"
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
                          className="flex w-full items-center gap-2 rounded-xl border border-transparent bg-white px-2.5 py-1.5 text-left text-xs font-bold text-[#334155] hover:border-[#F59E0B] hover:bg-[#FFFBEB] hover:text-[#B45309] transition-colors cursor-pointer"
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
                      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        handSortMode === 'count'
                          ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                          : 'border-emerald-400/35 bg-[#062016]/92 text-emerald-100 hover:border-amber-400/60'
                      }`}
                      title="切换理牌顺序"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5 text-amber-400" />
                      <span>{handSortMode === 'count' ? '按张数' : '按大小'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowChatPanel((v) => !v)}
                    className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-[#062016]/92 px-3.5 py-1.5 text-xs font-bold text-amber-200 shadow-lg hover:bg-emerald-900/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
                    <span>快捷语</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Waiting For Players Overlay when in WAITING phase */}
          {viewState.phase === 'WAITING' && (
            <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]">
              <div
                style={{ transform: `scale(${uiElementScale})` }}
                className="w-full max-w-md overflow-hidden rounded-3xl border border-[#DFD2B8] bg-gradient-to-b from-[#FAF8F3] to-[#F3EFE6] p-6 text-center text-[#1E242B] shadow-[0_24px_60px_rgba(20,16,10,0.28)]"
              >
                <h3 className="font-display text-xl font-black text-[#2C1E10]">
                  正在等待牌友入座 ({viewState.players.filter(Boolean).length}/3)
                </h3>
                <p className="mt-1.5 text-xs font-medium text-[#5A6572]">
                  房间号{' '}
                  <span className="font-mono font-black text-[#D97706] tabular-nums">
                    {viewState.roomId}
                  </span>{' '}
                  · 底分 <span className="font-mono font-bold tabular-nums">{viewState.baseScore}</span> 积分
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => managerRef.current?.addBot()}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-5 py-2.5 text-xs font-black text-white shadow-sm hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4" />
                    <span>一键添加 AI 机器人立即开局</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyRoomId}
                    className="flex items-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-4 py-2.5 text-xs font-extrabold text-[#334155] hover:bg-[#FAF8F3] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-[#0D9488]" />
                    ) : (
                      <Copy className="h-4 w-4 text-[#5A6572]" />
                    )}
                    <span>{copied ? '已复制房号' : '复制房号邀好友'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toast Notification */}
          {viewState.errorToast && (
            <div className="pointer-events-none absolute top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#F59E0B] bg-[#FFFBEB]/95 px-5 py-2.5 text-sm font-black text-[#B45309] shadow-xl">
              {viewState.errorToast}
            </div>
          )}

          {/* Authoritative Settlement Modal (SETTLEMENT phase) */}
          {viewState.phase === 'SETTLEMENT' && viewState.settlement && (
            <CommercialModalShell
              title={viewState.settlement.isLandlordWin ? '地主获胜 · 本局结算' : '农民合力获胜 · 本局结算'}
              subtitle={`${currentRoomTier.name} · 底分 ${viewState.settlement.baseScore} · 抢地主 ×${viewState.settlement.grabMultiplier} · 加倍 ×${viewState.settlement.doubleMultiplier ?? 1} · 炸弹 ×${viewState.settlement.bombMultiplier}${(viewState.settlement.isSpring || viewState.settlement.isAntiSpring) ? ` · ${viewState.settlement.isSpring ? '春天' : '反春'} ×2` : ''}`}
              size="lg"
              portalMode="stage"
              closeOnBackdrop={false}
              onClose={() => {
                managerRef.current?.leaveRoom();
                onLeaveRoom();
              }}
              headerExtra={
                <div className="rounded-xl border border-[#DEC99A] bg-white px-3 py-1 text-right shadow-2xs tabular-nums">
                  <div className="text-[10px] font-bold text-[#6E5A44]">
                    {viewState.settlement.isCapped
                      ? `封顶有效倍数`
                      : '结算有效倍数'}
                  </div>
                  <div className="font-mono text-base sm:text-lg font-black text-[#D97706]">
                    ×{viewState.settlement.effectiveMultiplier ?? viewState.settlement.totalMultiplier}
                  </div>
                </div>
              }
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    {viewState.settlement.replay && (
                      <button
                        type="button"
                        onClick={() => {
                          hapticEngine.tap();
                          setActiveReplay(viewState.settlement!.replay!);
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-4 py-2 text-xs font-black text-[#B45309] hover:bg-[#FEF3C7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Film className="h-4 w-4 text-[#D97706]" />
                        <span>回看本局（三家明牌复盘）</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        managerRef.current?.leaveRoom();
                        onLeaveRoom();
                      }}
                      className="flex h-9 min-w-[116px] items-center justify-center rounded-xl border border-[#D8CEB8] bg-white px-4 text-xs font-extrabold text-[#5A6572] hover:bg-[#FAF8F3] hover:text-[#1E242B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      返回大厅
                    </button>
                    <button
                      type="button"
                      onClick={() => managerRef.current?.readyForNextRound()}
                      className="flex h-9 min-w-[136px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-6 text-xs font-black text-white shadow-sm hover:brightness-105 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>再来一局</span>
                    </button>
                  </div>
                </div>
              }
            >
              <div className="space-y-3">
                {/* Commercial Hero Rolling Score Banner */}
                <div className="overflow-hidden rounded-2xl border border-amber-400/40 shadow-md">
                  <SettlementHeroHeader
                    selfScoreDelta={
                      viewState.settlement.scoreChanges[myPlayer?.playerId || ''] ?? 0
                    }
                    titleWin={
                      viewState.settlement.isLandlordWin
                        ? '地主获胜 · 凯旋得胜'
                        : '农民合力 · 凯旋得胜'
                    }
                    titleLose={
                      viewState.settlement.isLandlordWin
                        ? '地主获胜 · 本局惜败'
                        : '农民获胜 · 本局惜败'
                    }
                    subtitle={`底分 ${viewState.settlement.baseScore.toLocaleString()} · 有效倍数 ×${viewState.settlement.effectiveMultiplier ?? viewState.settlement.totalMultiplier}`}
                    suffix=" 积分"
                  />
                </div>

                {viewState.players.map((p, idx) => {
                  if (!p) return null;
                  const delta = viewState.settlement!.scoreChanges[p.playerId] ?? 0;
                  const isLandlord = idx === viewState.landlordSeat;
                  const isMe = idx === viewState.mySeat;
                  const isProtected = (
                    viewState.settlement!.bankruptProtectedIds ?? []
                  ).includes(p.playerId);
                  return (
                    <div
                      key={p.playerId}
                      className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
                        isMe
                          ? 'border-[#F59E0B] bg-[#FFFBEB] shadow-xs'
                          : 'border-[#E8E1D0] bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <AvatarSvg
                          avatarId={p.avatarId}
                          size={36}
                          isLandlord={isLandlord}
                        />
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-black text-[#1E242B]">
                            <span>{p.nickname}</span>
                            <span className="text-xs font-bold text-[#B45309]">
                              · {isLandlord ? '地主' : '农民'}
                            </span>
                            {isMe && (
                              <span className="text-xs font-extrabold text-[#0D9488]">
                                · 我
                              </span>
                            )}
                            {isProtected && (
                              <span className="text-xs font-bold text-rose-600">
                                · 防爆保护
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] font-medium text-[#5A6572] tabular-nums">
                            剩余手牌 {(viewState.settlement!.remainingHands[p.playerId] ?? []).length} 张
                          </div>
                        </div>
                      </div>
                      <div className="rounded-xl border border-amber-400/35 bg-[#1b1209] px-3 py-1 shadow-inner">
                        <RollingScoreCounter
                          value={delta}
                          suffix=" 积分"
                          size="md"
                          durationMs={950}
                          playTickSound={isMe}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CommercialModalShell>
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
      </div>
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
