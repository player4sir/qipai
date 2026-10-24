import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAllCardTexturePaths, preloadAllCardTextures } from './games/ddz/assets/CardAtlasGenerator';
import { DealMode } from './games/ddz/types';
import {
  HallView,
  MatchRecord,
  RoomSummary,
  UserProfile,
} from './hall/HallView';
import { soundEngine } from './shared/audio/SoundEngine';
import { gameControlHub } from './shared/control/GameControlHub';
import { socketClient } from './shared/network/SocketClient';
import { GameErrorBoundary } from './shared/ui/GameErrorBoundary';
import { SharedTableHudOverlay } from './shared/ui/SharedTableHudOverlay';
import {
  RoomEntryManager,
  RoomEntryRequest,
  ConfirmedRoomEntryPayload,
  EntryGameType,
} from './shared/roomcard/RoomEntryManager';
import {
  requestUniversalFullscreen,
  exitUniversalFullscreen,
  detectFullscreenCapabilities,
} from './shared/utils/fullscreenHelper';

const DdzTableView = React.lazy(() =>
  import('./games/ddz/DdzTableView').then((m) => ({ default: m.DdzTableView }))
);
const MahjongTableView = React.lazy(() =>
  import('./games/mahjong/MahjongTableView').then((m) => ({ default: m.MahjongTableView }))
);
const NiuniuTableView = React.lazy(() =>
  import('./games/niuniu/NiuniuTableView').then((m) => ({ default: m.NiuniuTableView }))
);
const ZhajinhuaTableView = React.lazy(() =>
  import('./games/zhajinhua/ZhajinhuaTableView').then((m) => ({ default: m.ZhajinhuaTableView }))
);
const LaoYanCaiTableView = React.lazy(() =>
  import('./games/laoyancai/LaoYanCaiTableView').then((m) => ({ default: m.LaoYanCaiTableView }))
);

// ============================================================================
// LocalStorage Keys & Safe Persistence Helpers
// ============================================================================
const STORAGE_KEY_PROFILE = 'h5_game_user_profile';
const STORAGE_KEY_ACTIVE_ROOM_ID = 'h5_game_active_room_id';
const STORAGE_KEY_ACTIVE_GAME_TYPE = 'h5_game_active_game_type';

function loadPersistedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    if (parsed && typeof parsed.playerId === 'string' && typeof parsed.nickname === 'string') {
      return parsed;
    }
  } catch {
    // Ignore malformed localStorage data
  }
  return null;
}

function savePersistedProfile(profile: UserProfile | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (profile) {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profile));
      localStorage.setItem('h5_game_nickname', profile.nickname);
      localStorage.setItem('h5_game_avatar', profile.avatarId);
    } else {
      localStorage.removeItem(STORAGE_KEY_PROFILE);
    }
  } catch {
    // Ignore storage quota errors
  }
}

function loadPersistedRoomState(): { roomId: string | null; gameType: string | null } {
  if (typeof window === 'undefined') return { roomId: null, gameType: null };
  try {
    const roomId = localStorage.getItem(STORAGE_KEY_ACTIVE_ROOM_ID);
    const gameType = localStorage.getItem(STORAGE_KEY_ACTIVE_GAME_TYPE);
    if (roomId && roomId.trim().length > 0) {
      return { roomId, gameType: gameType || 'ddz' };
    }
  } catch {
    // Ignore storage errors
  }
  return { roomId: null, gameType: null };
}

const STORAGE_KEY_PORTAL_STAGE = 'h5_game_portal_stage';

function syncSubHallStageForGame(gameType: string | null): void {
  if (typeof window === 'undefined' || !gameType) return;
  try {
    const map: Record<string, string> = {
      ddz: 'ddz_subhall',
      mahjong: 'mahjong_subhall',
      niuniu: 'niuniu_subhall',
      zhajinhua: 'zhajinhua_subhall',
      laoyancai: 'laoyancai_subhall',
    };
    if (map[gameType]) {
      localStorage.setItem(STORAGE_KEY_PORTAL_STAGE, map[gameType]);
    }
  } catch {
    // Ignore storage error
  }
}

function savePersistedRoomState(roomId: string | null, gameType: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (roomId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ROOM_ID, roomId);
      if (gameType) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_GAME_TYPE, gameType);
        syncSubHallStageForGame(gameType);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_ROOM_ID);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_GAME_TYPE);
    }
  } catch {
    // Ignore storage quota errors
  }
}

// ============================================================================
// Asset Manifest & Preloader for Smooth GameLoadingFallback Progress
// ============================================================================
interface GameAssetManifest {
  images: string[];
  audios: string[];
}

function getGameAssetManifest(gameType: string | null): GameAssetManifest {
  if (gameType === 'mahjong') {
    return {
      images: [
        '/assets/avatars/kashen.svg',
        '/assets/avatars/beier.svg',
        '/assets/avatars/scholar.svg',
        '/assets/avatars/noble.svg',
      ],
      audios: [
        '/assets/mahjong/audio/Sepcial_Mahjong_Deal.wav',
        '/assets/mahjong/audio/Sepcial_Mahjong_DrawCard.wav',
        '/assets/mahjong/audio/Sepcial_Mahjong_GiveCard.wav',
        '/assets/mahjong/audio/Sepcial_Mahjong_BeanFly.wav',
        '/assets/mahjong/audio/Sepcial_Mahjong_Win.wav',
        '/assets/mahjong/audio/Sepcial_Mahjong_Win_Zimo.wav',
        '/assets/mahjong/audio/voice/female/peng.mp3',
        '/assets/mahjong/audio/voice/female/gang.mp3',
        '/assets/mahjong/audio/voice/female/hu.mp3',
        '/assets/mahjong/audio/voice/female/zimo.mp3',
        '/assets/mahjong/audio/voice/male/peng.mp3',
        '/assets/mahjong/audio/voice/male/gang.mp3',
        '/assets/mahjong/audio/voice/male/hu.mp3',
        '/assets/mahjong/audio/voice/male/zimo.mp3',
      ],
    };
  }

  if (gameType === 'niuniu' || gameType === 'zhajinhua' || gameType === 'laoyancai') {
    const cardSample = getAllCardTexturePaths().slice(0, 16);
    return {
      images: [
        ...cardSample,
        '/assets/avatars/kashen.svg',
        '/assets/avatars/beier.svg',
        '/assets/avatars/scholar.svg',
        '/assets/avatars/noble.svg',
      ],
      audios: [
        '/assets/mahjong/audio/Sepcial_Mahjong_Deal.wav',
        '/assets/audio/ddz/Special_Dispatch_2D.wav',
        '/assets/audio/ddz/Special_Discard.wav',
      ],
    };
  }

  // Default: Dou Dizhu ('ddz')
  const cardPaths = getAllCardTexturePaths();
  return {
    images: cardPaths,
    audios: [
      '/assets/audio/ddz/Special_Dispatch_2D.wav',
      '/assets/audio/ddz/Special_Discard.wav',
      '/assets/audio/ddz/Special_Bomb_New.wav',
      '/assets/audio/ddz/Special_plane.wav',
      '/assets/audio/ddz/Special_Chuntian.wav',
      '/assets/audio/ddz/Special_querendizhu.wav',
      '/assets/audio/ddz/Special_alert.wav',
      '/assets/audio/ddz/shunzi.wav',
      '/assets/audio/ddz/liandui.wav',
      '/assets/audio/ddz/feiji.wav',
      '/assets/audio/ddz/zhadan.wav',
      '/assets/audio/ddz/wangzha.wav',
    ],
  };
}

function preloadSingleImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve();
      return;
    }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = url;
  });
}

export const GameLoadingFallback: React.FC<{
  gameType: string | null;
  onFinishLoading?: () => void;
}> = ({ gameType, onFinishLoading }) => {
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(1);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const targetProgressRef = useRef<number>(8);
  const currentProgressRef = useRef<number>(0);
  const finishedTriggeredRef = useRef<boolean>(false);

  const getGameLabel = () => {
    if (gameType === 'mahjong') return '麻将';
    if (gameType === 'niuniu') return '抢庄牛牛';
    if (gameType === 'zhajinhua') return '炸金花';
    if (gameType === 'laoyancai') return '云南捞腌菜';
    return '斗地主';
  };

  // Preload actual game textures & audio buffers and update target completion percentage
  useEffect(() => {
    let cancelled = false;
    finishedTriggeredRef.current = false;
    currentProgressRef.current = 0;
    targetProgressRef.current = 8;
    setDisplayProgress(0);

    const manifest = getGameAssetManifest(gameType);
    const total = Math.max(1, manifest.images.length + manifest.audios.length);
    setTotalCount(total);
    setLoadedCount(0);

    if (gameType === 'ddz' || !gameType) {
      preloadAllCardTextures().catch(() => {});
    }

    let completed = 0;
    const markOneLoaded = () => {
      if (cancelled) return;
      completed += 1;
      setLoadedCount(completed);
      const pct = Math.min(100, Math.round((completed / total) * 100));
      targetProgressRef.current = Math.max(targetProgressRef.current, pct);
    };

    manifest.images.forEach((imgUrl) => {
      preloadSingleImage(imgUrl).then(markOneLoaded);
    });

    manifest.audios.forEach((audioUrl) => {
      soundEngine
        .loadAudioBuffer(audioUrl)
        .catch(() => null)
        .then(markOneLoaded);
    });

    // Safety fallback so bad network assets never stall the progress bar
    const safetyTimer = window.setTimeout(() => {
      if (!cancelled) {
        targetProgressRef.current = 100;
        setLoadedCount(total);
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [gameType]);

  // Smooth requestAnimationFrame interpolation toward target asset loading percentage
  useEffect(() => {
    let rafId: number | null = null;

    const step = () => {
      const current = currentProgressRef.current;
      const target = targetProgressRef.current;
      const diff = target - current;

      if (Math.abs(diff) <= 0.35) {
        currentProgressRef.current = target;
        setDisplayProgress(target);
        if (target >= 100 && !finishedTriggeredRef.current) {
          finishedTriggeredRef.current = true;
          onFinishLoading?.();
          return;
        }
      } else {
        // Smooth damping step with guaranteed minimum forward velocity
        const delta = Math.max(diff * 0.22, 1.4);
        const next = Math.min(target, current + delta);
        currentProgressRef.current = next;
        setDisplayProgress(next);
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [onFinishLoading]);

  const roundedPct = Math.min(100, Math.max(0, Math.round(displayProgress)));
  const getStageDescription = () => {
    if (roundedPct < 35) return '正在载入高清牌面纹理与国风桌布材质...';
    if (roundedPct < 75) return '正在预解码零延迟多轨音效与真人报牌语音...';
    if (roundedPct < 98) return '正在初始化商业牌桌算法与同步房间快照...';
    return '资源准备就绪，即将进入牌桌...';
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#07150e] px-6 text-amber-200 select-none">
      <div className="relative flex w-full max-w-md flex-col items-center gap-3.5 rounded-2xl border border-amber-400/20 bg-black/35 px-7 py-6 shadow-[0_20px_50px_rgba(0,0,0,0.65)] backdrop-blur-md">
        <div className="relative flex h-14 w-14 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-amber-400/25 animate-ping" />
          <Loader2 className="h-9 w-9 animate-spin text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]" />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-base font-black tracking-wider text-amber-300 drop-shadow">
            正在进入 {getGameLabel()} 对局
          </span>
          <span className="text-xs font-serif text-amber-200/70 tracking-wider">
            {getStageDescription()}
          </span>
        </div>

        {/* Smooth Asset-Driven Progress Bar */}
        <div className="mt-1 w-full">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-amber-200/65 font-medium tracking-wide">
              资源加载 ({Math.min(loadedCount, totalCount)}/{totalCount})
            </span>
            <span className="font-mono font-bold tabular-nums text-amber-300">
              {roundedPct}%
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-amber-400/25 bg-[#030b07] p-0.5 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.55)] transition-[width] duration-75 ease-out"
              style={{ width: `${roundedPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export type ResolutionTier = 'compact_mobile' | 'wide_mobile' | 'ultrawide' | 'tablet_desktop';

/**
 * Percentage-based layout matrix (0% - 100%) guaranteeing zero overlap and zero edge clipping
 * between Hand Operation Zone, Played Cards Zone, Action Bar, and Avatar HUDs
 * across all mainstream mobile, tablet, desktop, and ultrawide landscape resolutions.
 */
export interface LayoutZonePercentages {
  sideMarginPct: number;
  topBarTopPct: number;
  holeCardsTopPct: number;
  scoreLineTopPct: number;
  recorderTopPct: number;
  avatarTopPct: number;
  opponentDeckSideXPct: number;
  opponentDeckTopPct: number;
  turnClockSideXPct: number;
  turnClockBottomTopPct: number;
  playedSideXPct: number;
  playedSideTopPct: number;
  playedBottomTopPct: number;
  actionBarTopPct: number;
  comboBannerTopPct: number;
  handBandTopPct: number;
  handCenterYPct: number;
  handBandBottomPct: number;
  handWidthPct: number;
  handCardScale: number;
  bottomDockBottomPct: number;
}

export interface ViewportMetrics {
  width: number;
  height: number;
  aspectRatio: number;
  tier: ResolutionTier;
  isCompactMobileLandscape: boolean;
  /** Continuously interpolated UI scale factor (0.78 ~ 1.0) without breakpoint jumps */
  uiElementScale: number;
  zones: LayoutZonePercentages;
}

const PERCENTAGE_PROFILES: Record<ResolutionTier, LayoutZonePercentages> = {
  // Small-screen mobile landscape (e.g., 667x375, 640x360, 740x360)
  compact_mobile: {
    sideMarginPct: 2.8,
    topBarTopPct: 2.6,
    holeCardsTopPct: 8.2,
    scoreLineTopPct: 15.6,
    recorderTopPct: 17.4,
    avatarTopPct: 13.0,
    opponentDeckSideXPct: 7.2,
    opponentDeckTopPct: 29.8,
    turnClockSideXPct: 15.0,
    turnClockBottomTopPct: 45.8,
    playedSideXPct: 27.4,
    playedSideTopPct: 30.2,
    playedBottomTopPct: 39.2,
    actionBarTopPct: 52.4,
    comboBannerTopPct: 61.8,
    handBandTopPct: 63.0,
    handCenterYPct: 76.8,
    handBandBottomPct: 88.6,
    handWidthPct: 68.0,
    handCardScale: 0.98,
    bottomDockBottomPct: 2.4,
  },
  // Standard full-screen mobile landscape (e.g., 800x375, 812x375, 18:9 ~ 19:9)
  wide_mobile: {
    sideMarginPct: 3.6,
    topBarTopPct: 2.8,
    holeCardsTopPct: 8.4,
    scoreLineTopPct: 15.8,
    recorderTopPct: 17.6,
    avatarTopPct: 13.4,
    opponentDeckSideXPct: 7.6,
    opponentDeckTopPct: 30.2,
    turnClockSideXPct: 15.4,
    turnClockBottomTopPct: 46.2,
    playedSideXPct: 27.8,
    playedSideTopPct: 30.6,
    playedBottomTopPct: 39.6,
    actionBarTopPct: 52.8,
    comboBannerTopPct: 62.2,
    handBandTopPct: 63.4,
    handCenterYPct: 77.0,
    handBandBottomPct: 88.8,
    handWidthPct: 66.5,
    handCardScale: 1.0,
    bottomDockBottomPct: 2.6,
  },
  // Ultrawide mobile & display landscape (>= 19.5:9 / 20:9 / 21:9, e.g., 844x390, 915x412, 932x430, 2560x1080)
  ultrawide: {
    sideMarginPct: 4.8,
    topBarTopPct: 3.0,
    holeCardsTopPct: 8.6,
    scoreLineTopPct: 16.2,
    recorderTopPct: 18.0,
    avatarTopPct: 13.8,
    opponentDeckSideXPct: 8.4,
    opponentDeckTopPct: 30.6,
    turnClockSideXPct: 16.2,
    turnClockBottomTopPct: 46.0,
    playedSideXPct: 28.4,
    playedSideTopPct: 30.8,
    playedBottomTopPct: 39.4,
    actionBarTopPct: 52.5,
    comboBannerTopPct: 61.8,
    handBandTopPct: 63.2,
    handCenterYPct: 76.5,
    handBandBottomPct: 88.2,
    handWidthPct: 64.0,
    handCardScale: 0.96,
    bottomDockBottomPct: 2.8,
  },
  // Tablet & Desktop landscape (>= 960x540, 4:3 / 16:10 / 16:9)
  tablet_desktop: {
    sideMarginPct: 3.2,
    topBarTopPct: 2.6,
    holeCardsTopPct: 8.2,
    scoreLineTopPct: 15.6,
    recorderTopPct: 17.4,
    avatarTopPct: 13.0,
    opponentDeckSideXPct: 7.2,
    opponentDeckTopPct: 30.0,
    turnClockSideXPct: 15.0,
    turnClockBottomTopPct: 46.6,
    playedSideXPct: 27.6,
    playedSideTopPct: 30.4,
    playedBottomTopPct: 40.0,
    actionBarTopPct: 53.4,
    comboBannerTopPct: 62.6,
    handBandTopPct: 63.8,
    handCenterYPct: 77.5,
    handBandBottomPct: 89.2,
    handWidthPct: 67.5,
    handCardScale: 1.02,
    bottomDockBottomPct: 2.4,
  },
};

function lerp(a: number, b: number, t: number): number {
  return Number((a + (b - a) * t).toFixed(3));
}

function interpolateZones(
  z1: LayoutZonePercentages,
  z2: LayoutZonePercentages,
  t: number
): LayoutZonePercentages {
  return {
    sideMarginPct: lerp(z1.sideMarginPct, z2.sideMarginPct, t),
    topBarTopPct: lerp(z1.topBarTopPct, z2.topBarTopPct, t),
    holeCardsTopPct: lerp(z1.holeCardsTopPct, z2.holeCardsTopPct, t),
    scoreLineTopPct: lerp(z1.scoreLineTopPct, z2.scoreLineTopPct, t),
    recorderTopPct: lerp(z1.recorderTopPct, z2.recorderTopPct, t),
    avatarTopPct: lerp(z1.avatarTopPct, z2.avatarTopPct, t),
    opponentDeckSideXPct: lerp(z1.opponentDeckSideXPct, z2.opponentDeckSideXPct, t),
    opponentDeckTopPct: lerp(z1.opponentDeckTopPct, z2.opponentDeckTopPct, t),
    turnClockSideXPct: lerp(z1.turnClockSideXPct, z2.turnClockSideXPct, t),
    turnClockBottomTopPct: lerp(z1.turnClockBottomTopPct, z2.turnClockBottomTopPct, t),
    playedSideXPct: lerp(z1.playedSideXPct, z2.playedSideXPct, t),
    playedSideTopPct: lerp(z1.playedSideTopPct, z2.playedSideTopPct, t),
    playedBottomTopPct: lerp(z1.playedBottomTopPct, z2.playedBottomTopPct, t),
    actionBarTopPct: lerp(z1.actionBarTopPct, z2.actionBarTopPct, t),
    comboBannerTopPct: lerp(z1.comboBannerTopPct, z2.comboBannerTopPct, t),
    handBandTopPct: lerp(z1.handBandTopPct, z2.handBandTopPct, t),
    handCenterYPct: lerp(z1.handCenterYPct, z2.handCenterYPct, t),
    handBandBottomPct: lerp(z1.handBandBottomPct, z2.handBandBottomPct, t),
    handWidthPct: lerp(z1.handWidthPct, z2.handWidthPct, t),
    handCardScale: lerp(z1.handCardScale, z2.handCardScale, t),
    bottomDockBottomPct: lerp(z1.bottomDockBottomPct, z2.bottomDockBottomPct, t),
  };
}

/**
 * Compute C1-continuous Hermite-smoothed `--ui-element-scale` (0.78 ~ 1.0)
 * from actual rendered container dimensions so resizing never produces visual step discontinuities.
 */
export function computeSmoothUiElementScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const effW = Math.max(width, height);
  const effH = Math.min(width, height);
  const ratioW = effW / 1100;
  const ratioH = effH / 560;
  const aspect = effH > 0 ? effW / effH : 1.78;
  // On ultrawide aspect ratios (> 1.95), slightly damp scale so HUD elements stay compact vertically
  const aspectDamp = aspect > 1.95 ? Math.max(0.9, 1 - (aspect - 1.95) * 0.18) : 1;
  const effectiveRatio = Math.min(ratioW, ratioH) * aspectDamp;

  // Normalize effectiveRatio from [0.52 .. 1.0] into [0 .. 1]
  const rawT = Math.max(0, Math.min(1, (effectiveRatio - 0.52) / (1.0 - 0.52)));
  // Smoothstep (3t^2 - 2t^3) eliminates any derivative discontinuity at breakpoints
  const smoothT = rawT * rawT * (3 - 2 * rawT);
  return Number((0.78 + smoothT * 0.22).toFixed(4));
}

export function computeSmoothUiFontScale(uiElementScale: number): number {
  // Gently modulate font scale (0.86 ~ 1.0) in lockstep with --ui-element-scale
  const normalized = Math.max(0, Math.min(1, (uiElementScale - 0.78) / 0.22));
  return Number((0.86 + normalized * 0.14).toFixed(4));
}

export function computeViewportMetrics(rawW?: number, rawH?: number): ViewportMetrics {
  if (typeof window === 'undefined') {
    return {
      width: 1334,
      height: 750,
      aspectRatio: 1334 / 750,
      tier: 'tablet_desktop',
      isCompactMobileLandscape: false,
      uiElementScale: 1,
      zones: PERCENTAGE_PROFILES.tablet_desktop,
    };
  }
  const vv = window.visualViewport;
  const width = Math.round(rawW ?? (vv ? vv.width : window.innerWidth));
  const height = Math.round(rawH ?? (vv ? vv.height : window.innerHeight));

  const effW = Math.max(width, height);
  const effH = Math.min(width, height);
  const aspectRatio = effH > 0 ? Number((effW / effH).toFixed(4)) : 1.78;

  const uiElementScale = computeSmoothUiElementScale(effW, effH);

  const effectiveRatio = Math.min(effW / 1100, effH / 560);
  const sRaw = Math.max(0, Math.min(1, (effectiveRatio - 0.52) / (1.0 - 0.52)));
  const s = sRaw * sRaw * (3 - 2 * sRaw);

  let baseTier: ResolutionTier = 'tablet_desktop';
  let baseZones: LayoutZonePercentages;

  if (s < 0.45) {
    baseTier = 'compact_mobile';
    const localT = s / 0.45;
    baseZones = interpolateZones(
      PERCENTAGE_PROFILES.compact_mobile,
      PERCENTAGE_PROFILES.wide_mobile,
      localT
    );
  } else if (s < 0.85) {
    baseTier = 'wide_mobile';
    const localT = (s - 0.45) / 0.4;
    baseZones = interpolateZones(
      PERCENTAGE_PROFILES.wide_mobile,
      PERCENTAGE_PROFILES.tablet_desktop,
      localT
    );
  } else {
    baseTier = 'tablet_desktop';
    baseZones = PERCENTAGE_PROFILES.tablet_desktop;
  }

  const ultraRaw = Math.max(0, Math.min(1, (aspectRatio - 1.85) / (2.22 - 1.85)));
  const ultraSmooth = ultraRaw * ultraRaw * (3 - 2 * ultraRaw);
  const zones =
    ultraSmooth > 0
      ? interpolateZones(baseZones, PERCENTAGE_PROFILES.ultrawide, ultraSmooth)
      : baseZones;

  const tier: ResolutionTier = aspectRatio >= 1.98 ? 'ultrawide' : baseTier;

  return {
    width,
    height,
    aspectRatio,
    tier,
    isCompactMobileLandscape: tier !== 'tablet_desktop' && effH < 560,
    uiElementScale,
    zones,
  };
}

/**
 * Reusable Responsive Landscape Container with a built-in ResizeObserver that
 * inspects the container's actual rendered size (`contentRect` / `contentBoxSize`)
 * and dynamically fine-tunes `--ui-element-scale` and `--ui-font-scale` via
 * frame-smoothed interpolation so buttons and typography transition without visual discontinuities.
 */
export const ResponsiveLayoutContainer: React.FC<{
  viewport: ViewportMetrics;
  onContainerResize?: (metrics: ViewportMetrics) => void;
  children: React.ReactNode;
}> = ({ viewport, onContainerResize, children }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentScaleRef = useRef<number>(viewport.uiElementScale);
  const targetScaleRef = useRef<number>(viewport.uiElementScale);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const animateScaleStep = () => {
      const current = currentScaleRef.current;
      const target = targetScaleRef.current;
      const diff = target - current;

      if (Math.abs(diff) <= 0.0008) {
        currentScaleRef.current = target;
        const fontScale = computeSmoothUiFontScale(target);
        el.style.setProperty('--ui-element-scale', String(target));
        el.style.setProperty('--ui-font-scale', String(fontScale));
        rafRef.current = null;
        return;
      }

      const next = Number((current + diff * 0.32).toFixed(4));
      currentScaleRef.current = next;
      const fontScale = computeSmoothUiFontScale(next);
      el.style.setProperty('--ui-element-scale', String(next));
      el.style.setProperty('--ui-font-scale', String(fontScale));
      rafRef.current = requestAnimationFrame(animateScaleStep);
    };

    const applyMeasuredSize = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      const nextMetrics = computeViewportMetrics(w, h);
      targetScaleRef.current = nextMetrics.uiElementScale;
      el.style.setProperty('--side-margin-pct', `${nextMetrics.zones.sideMarginPct}%`);

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(animateScaleStep);
      }
      onContainerResize?.(nextMetrics);
    };

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      applyMeasuredSize(rect.width, rect.height);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentBoxSize?.[0];
      const width = box ? box.inlineSize : entry.contentRect.width;
      const height = box ? box.blockSize : entry.contentRect.height;
      applyMeasuredSize(width, height);
    });

    observer.observe(el);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      observer.disconnect();
    };
  }, [onContainerResize]);

  return (
    <div
      ref={containerRef}
      data-resolution-tier={viewport.tier}
      style={
        {
          width: '100dvw',
          height: '100dvh',
          '--ui-element-scale': currentScaleRef.current,
          '--ui-font-scale': computeSmoothUiFontScale(currentScaleRef.current),
          '--side-margin-pct': `${viewport.zones.sideMarginPct}%`,
        } as React.CSSProperties
      }
      className="ui-scale-smooth relative h-[100dvh] w-[100dvw] overflow-hidden overscroll-none bg-[#041810] select-none touch-manipulation"
    >
      {children}
    </div>
  );
};

export default function App() {
  // Initialize login profile from localStorage; always start in the Hall so pre-entry room card & score confirmation modal is never bypassed
  const [profile, setProfile] = useState<UserProfile | null>(() => loadPersistedProfile());
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomGameType, setActiveRoomGameType] = useState<string | null>(null);
  const hasConfirmedEntryRef = useRef<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportMetrics>(() => computeViewportMetrics());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pendingRoomEntry, setPendingRoomEntry] = useState<RoomEntryRequest | null>(null);
  const [activeEntryConfig, setActiveEntryConfig] = useState<{
    baseScore: number;
    initialScore: number;
  }>({ baseScore: 100, initialScore: 2000 });

  // Sync profile changes to localStorage
  useEffect(() => {
    if (profile) {
      savePersistedProfile(profile);
    }
  }, [profile]);

  // Sync activeRoomId & activeRoomGameType changes to localStorage
  useEffect(() => {
    savePersistedRoomState(activeRoomId, activeRoomGameType);
  }, [activeRoomId, activeRoomGameType]);

  const leaveCurrentRoom = useCallback(() => {
    hasConfirmedEntryRef.current = false;
    setActiveRoomId((prevRoom) => {
      if (prevRoom) {
        socketClient.emit('c2s_leave_room');
      }
      return null;
    });
    setActiveRoomGameType((prevGame) => {
      if (prevGame) {
        syncSubHallStageForGame(prevGame);
      }
      return null;
    });
    savePersistedRoomState(null, null);
    gameControlHub.resetTableScopedState();
  }, []);

  // Progressive idle prefetching of all 5 game table chunks & card textures
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scheduleIdle =
      (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 1500));

    const timer = window.setTimeout(() => {
      scheduleIdle(
        () => {
          preloadAllCardTextures().catch(() => {});
          void import('./games/ddz/DdzTableView');
          void import('./games/mahjong/MahjongTableView');
          void import('./games/niuniu/NiuniuTableView');
          void import('./games/zhajinhua/ZhajinhuaTableView');
          void import('./games/laoyancai/LaoYanCaiTableView');
        },
        { timeout: 3000 }
      );
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const handleContainerResize = useCallback((nextMetrics: ViewportMetrics) => {
    setViewport((prev) => {
      if (
        prev.width === nextMetrics.width &&
        prev.height === nextMetrics.height &&
        prev.uiElementScale === nextMetrics.uiElementScale
      ) {
        return prev;
      }
      return nextMetrics;
    });
  }, []);

  // Track visualViewport & fullscreen changes across all mobile phone resolutions
  useEffect(() => {
    const syncViewport = () => {
      setViewport(computeViewportMetrics());
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    document.addEventListener('fullscreenchange', syncViewport);

    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      document.removeEventListener('fullscreenchange', syncViewport);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      const caps = detectFullscreenCapabilities();
      if (!caps.isCurrentlyFullscreen) {
        await requestUniversalFullscreen();
      } else {
        await exitUniversalFullscreen();
      }
    } catch {
      // Ignore fullscreen restriction in embedded iframes
    }
  }, []);

  useEffect(() => {
    socketClient.connect();

    const unsubs: Array<() => void> = [];

    unsubs.push(
      socketClient.on('s2c_auth_success', (data) => {
        if (data.profile) {
          setProfile(data.profile);
          savePersistedProfile(data.profile);
        }
        if (Array.isArray(data.rooms)) {
          setRooms(data.rooms);
        }

        if (data.activeRoomId && hasConfirmedEntryRef.current) {
          // User already confirmed entry in this session and socket reconnected: restore snapshot
          setActiveRoomId(data.activeRoomId);
          if (data.activeGameType) {
            setActiveRoomGameType(data.activeGameType);
          }
          socketClient.emit('c2s_request_snapshot');
        } else {
          // Never bypass the Hall pre-entry room card & score confirmation modal on initial load
          if (data.activeRoomId) {
            socketClient.emit('c2s_leave_room');
          }
          savePersistedRoomState(null, null);
        }
        socketClient.emit('c2s_get_lobby_data');
      })
    );

    unsubs.push(
      socketClient.on('s2c_lobby_data', (data) => {
        if (data.profile) {
          setProfile(data.profile);
          savePersistedProfile(data.profile);
        }
        if (Array.isArray(data.rooms)) setRooms(data.rooms);
        if (Array.isArray(data.leaderboard)) setLeaderboard(data.leaderboard);
        if (Array.isArray(data.matches)) setMatches(data.matches);
      })
    );

    unsubs.push(
      socketClient.on('s2c_profile_updated', (data) => {
        if (data.profile) {
          setProfile(data.profile);
          savePersistedProfile(data.profile);
        }
        if (data.notice) {
          showNotice(data.notice);
        }
      })
    );

    unsubs.push(
      socketClient.on('s2c_rooms_updated', (data) => {
        if (Array.isArray(data.rooms)) {
          setRooms(data.rooms);
        }
      })
    );

    unsubs.push(
      socketClient.on('s2c_room_joined', (data) => {
        soundEngine.playTap(760);
        hasConfirmedEntryRef.current = true;
        setActiveRoomId(data.roomId);
        if (data.gameType) {
          setActiveRoomGameType(data.gameType);
        }
      })
    );

    unsubs.push(
      socketClient.on('s2c_left_room', (data) => {
        if (Date.now() - gameControlHub.getState().lastSwitchTimestamp < 1500) {
          // Switching tables in place: keep active table view mounted while quick_match joins new room
          return;
        }
        leaveCurrentRoom();
        soundEngine.startBgm('lobby');
        if (data?.profile) {
          setProfile(data.profile);
          savePersistedProfile(data.profile);
        }
        if (Array.isArray(data?.rooms)) setRooms(data.rooms);
        socketClient.emit('c2s_get_lobby_data');
      })
    );

    unsubs.push(
      socketClient.on('s2c_action_error', (data) => {
        if (data?.message) {
          showNotice(data.message);
        }
      })
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [leaveCurrentRoom, showNotice]);

  const handleQuickMatch = (
    baseScore: number,
    fillBots: boolean,
    mode: DealMode = 'classic',
    initialScore?: number
  ) => {
    soundEngine.playTap(720);
    setPendingRoomEntry({
      actionType: 'quick_match',
      gameType: 'ddz',
      baseScore,
      initialScore,
      mode,
      fillBots,
    });
  };

  const handleQuickMatchMahjong = (
    baseScore = 100,
    mode = 'puer',
    initialScore?: number
  ) => {
    soundEngine.playTap(720);
    setPendingRoomEntry({
      actionType: 'quick_match',
      gameType: 'mahjong',
      baseScore,
      initialScore,
      mode,
      fillBots: true,
    });
  };

  const handleQuickMatchNiuniu = (
    baseScore = 100,
    mode = 'qiangzhuang',
    initialScore?: number
  ) => {
    soundEngine.playTap(720);
    setPendingRoomEntry({
      actionType: 'quick_match',
      gameType: 'niuniu',
      baseScore,
      initialScore,
      mode,
      fillBots: true,
    });
  };

  const handleQuickMatchZhajinhua = (
    baseScore = 100,
    mode = 'classic',
    initialScore?: number
  ) => {
    soundEngine.playTap(720);
    setPendingRoomEntry({
      actionType: 'quick_match',
      gameType: 'zhajinhua',
      baseScore,
      initialScore,
      mode,
      fillBots: true,
    });
  };

  const handleQuickMatchLaoYanCai = (
    baseScore = 100,
    mode = 'kunming',
    initialScore?: number
  ) => {
    soundEngine.playTap(720);
    setPendingRoomEntry({
      actionType: 'quick_match',
      gameType: 'laoyancai',
      baseScore,
      initialScore,
      mode,
      fillBots: true,
    });
  };

  const handleCreateRoom = (
    baseScore: number,
    isPrivate: boolean,
    autoFillBots: boolean,
    mode = 'classic',
    gameType = 'ddz',
    totalRounds = 8,
    payMode: 'host' | 'aa' | 'winner' = 'host',
    roomId?: string,
    initialScore = 2000
  ) => {
    soundEngine.playTap(720);
    const normalizedGame: EntryGameType =
      gameType === 'mahjong' ||
      gameType === 'niuniu' ||
      gameType === 'zhajinhua' ||
      gameType === 'laoyancai'
        ? gameType
        : 'ddz';
    setPendingRoomEntry({
      actionType: 'create_room',
      gameType: normalizedGame,
      baseScore,
      initialScore,
      mode,
      fillBots: autoFillBots,
      isPrivate,
      totalRounds,
      payMode,
      roomId,
    });
  };

  const handleJoinRoom = (roomId: string, gameType?: string) => {
    soundEngine.playTap(720);
    const matchedRoom = rooms.find((r) => r.roomId === roomId);
    const rawGame = gameType || matchedRoom?.gameType || 'ddz';
    const normalizedGame: EntryGameType =
      rawGame === 'mahjong' ||
      rawGame === 'niuniu' ||
      rawGame === 'zhajinhua' ||
      rawGame === 'laoyancai'
        ? rawGame
        : 'ddz';
    setPendingRoomEntry({
      actionType: 'join_room',
      gameType: normalizedGame,
      baseScore: matchedRoom?.baseScore || 100,
      mode: matchedRoom?.mode,
      roomId,
    });
  };

  const handleExecuteConfirmedRoomEntry = (confirmed: ConfirmedRoomEntryPayload) => {
    setPendingRoomEntry(null);
    hasConfirmedEntryRef.current = true;
    const {
      actionType,
      gameType,
      mode,
      baseScore,
      initialScore,
      totalRounds,
      payMode,
      fillBots,
      isPrivate,
      roomId,
    } = confirmed;

    setActiveEntryConfig({ baseScore, initialScore });
    setActiveRoomGameType(gameType);
    syncSubHallStageForGame(gameType);

    if (actionType === 'join_room' && roomId) {
      setActiveRoomId(roomId);
      socketClient.emit('c2s_join_room', { roomId, gameType });
      return;
    }

    if (actionType === 'create_room') {
      if (roomId) {
        setActiveRoomId(roomId);
      } else if (gameType === 'niuniu') {
        setActiveRoomId('room_niuniu_quick');
      } else if (gameType === 'zhajinhua') {
        setActiveRoomId('room_zhajinhua_quick');
      } else if (gameType === 'laoyancai') {
        setActiveRoomId('room_laoyancai_quick');
      }
      socketClient.emit('c2s_create_room', {
        roomId,
        gameType,
        baseScore,
        initialScore,
        isPrivate,
        autoFillBots: fillBots,
        mode,
        totalRounds,
        payMode,
      });
      return;
    }

    // quick_match
    if (gameType === 'niuniu') {
      setActiveRoomId('room_niuniu_quick');
    } else if (gameType === 'zhajinhua') {
      setActiveRoomId('room_zhajinhua_quick');
    } else if (gameType === 'laoyancai') {
      setActiveRoomId('room_laoyancai_quick');
    }

    socketClient.emit('c2s_quick_match', {
      gameType,
      baseScore,
      initialScore,
      fillBots,
      mode,
      totalRounds,
      payMode,
    });
  };

  const handleExchangeRoomCards = (cardCount: number, beanCost = 0) => {
    socketClient.emit('c2s_exchange_room_cards', { cardCount, beanCost });
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            roomCards: (prev.roomCards ?? 0) + cardCount,
          }
        : prev
    );
  };

  const handleRefreshLobby = () => {
    soundEngine.playTap(640);
    soundEngine.startBgm('lobby');
    socketClient.emit('c2s_get_lobby_data');
  };

  const handleClaimSupply = () => {
    soundEngine.playTap(840);
    soundEngine.startBgm('lobby');
    socketClient.emit('c2s_claim_supply');
  };

  const handleUpdateProfile = (nickname: string, avatarId: string) => {
    soundEngine.playTap(720);
    soundEngine.startBgm('lobby');
    socketClient.emit('c2s_update_profile', { nickname, avatarId });
  };

  return (
    <GameErrorBoundary onResetToHall={leaveCurrentRoom}>
      <ResponsiveLayoutContainer
        viewport={viewport}
        onContainerResize={handleContainerResize}
      >
        {activeRoomId ? (
          <Suspense fallback={<GameLoadingFallback gameType={activeRoomGameType} />}>
            <SharedTableHudOverlay
              activeRoomId={activeRoomId}
              gameType={activeRoomGameType}
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onShowNotice={showNotice}
              onLeaveRoom={() => {
                leaveCurrentRoom();
                exitUniversalFullscreen().catch(() => {});
                soundEngine.startBgm('lobby');
                socketClient.emit('c2s_get_lobby_data');
              }}
            />
            {activeRoomGameType === 'mahjong' ? (
              <MahjongTableView
                viewport={viewport}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onLeaveRoom={() => {
                  leaveCurrentRoom();
                  exitUniversalFullscreen().catch(() => {});
                  soundEngine.startBgm('lobby');
                  socketClient.emit('c2s_get_lobby_data');
                }}
              />
            ) : activeRoomGameType === 'zhajinhua' ? (
              <ZhajinhuaTableView
                viewport={viewport}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onLeaveRoom={() => {
                  leaveCurrentRoom();
                  exitUniversalFullscreen().catch(() => {});
                  soundEngine.startBgm('lobby');
                  socketClient.emit('c2s_get_lobby_data');
                }}
              />
            ) : activeRoomGameType === 'niuniu' ? (
              <NiuniuTableView
                viewport={viewport}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                initialBaseScore={activeEntryConfig.baseScore}
                initialTableScore={activeEntryConfig.initialScore}
                onLeaveRoom={() => {
                  leaveCurrentRoom();
                  exitUniversalFullscreen().catch(() => {});
                  soundEngine.startBgm('lobby');
                  socketClient.emit('c2s_get_lobby_data');
                }}
              />
            ) : activeRoomGameType === 'laoyancai' ? (
              <LaoYanCaiTableView
                viewport={viewport}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onLeaveRoom={() => {
                  leaveCurrentRoom();
                  exitUniversalFullscreen().catch(() => {});
                  soundEngine.startBgm('lobby');
                  socketClient.emit('c2s_get_lobby_data');
                }}
              />
            ) : (
              <DdzTableView
                viewport={viewport}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                initialBaseScore={activeEntryConfig.baseScore}
                initialTableScore={activeEntryConfig.initialScore}
                onLeaveRoom={() => {
                  leaveCurrentRoom();
                  exitUniversalFullscreen().catch(() => {});
                  soundEngine.startBgm('lobby');
                  socketClient.emit('c2s_get_lobby_data');
                }}
              />
            )}
          </Suspense>
        ) : (
          <HallView
            profile={profile}
            rooms={rooms}
            leaderboard={leaderboard}
            matches={matches}
            notice={notice}
            viewport={viewport}
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            onQuickMatch={handleQuickMatch}
            onQuickMatchMahjong={handleQuickMatchMahjong}
            onQuickMatchNiuniu={handleQuickMatchNiuniu}
            onQuickMatchZhajinhua={handleQuickMatchZhajinhua}
            onQuickMatchLaoYanCai={handleQuickMatchLaoYanCai}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onExchangeRoomCards={handleExchangeRoomCards}
            onRefreshLobby={handleRefreshLobby}
            onClaimSupply={handleClaimSupply}
            onUpdateProfile={handleUpdateProfile}
          />
        )}

        <RoomEntryManager
          pendingRequest={pendingRoomEntry}
          availableRoomCards={profile?.roomCards ?? 28}
          onCancel={() => setPendingRoomEntry(null)}
          onReplenishRoomCards={() => {
            handleExchangeRoomCards(5, 0);
            showNotice('已补充 +5 张通用房卡');
          }}
          onConfirmEntry={handleExecuteConfirmedRoomEntry}
        />
      </ResponsiveLayoutContainer>
    </GameErrorBoundary>
  );
}
