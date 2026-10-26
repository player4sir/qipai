import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Flame,
  HelpCircle,
  Loader2,
  LogOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Share2,
  Volume2,
  VolumeX,
  X,
  Sparkles,
} from 'lucide-react';
import { type ViewportMetrics } from '../../App';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { effectCoordinator, EffectPriority } from '../../shared/EffectCoordinator';
import { AvatarSvg } from '../../shared/ui/AvatarSvg';
import {
  AvailableAction,
  MahjongPhase,
  MahjongSuit,
  MahjongTableSnapshot,
  RoundBillRecord,
} from './types';
import { getSuit, setCurrentMahjongMode } from './algorithms/MahjongTile';
import { MahjongDebugLogger } from './utils/MahjongDebugLogger';
import { AutoLandscapeContainer } from './components/AutoLandscapeContainer';
import { MahjongPlayerAvatar } from './components/MahjongPlayerAvatar';
import { CompassCenter } from './components/CompassCenter';
import { DiscardRiverZone } from './components/DiscardRiverZone';
import { MeldsZone } from './components/MeldsZone';
import { HandTilesZone } from './components/HandTilesZone';
import { MahjongTileView } from './components/MahjongTileView';
import { ActionBarFSM } from './components/ActionBarFSM';
import { TingPromptPanel } from './components/TingPromptPanel';
import { DingQueOverlay } from './components/DingQueOverlay';
import { DiceThrowAnimation } from './components/DiceThrowAnimation';
import { ActionGlowEffect } from './components/ActionGlowEffect';
import { FullscreenGuideModal } from '../../shared/ui/FullscreenGuideModal';
import {
  RollingScoreCounter,
  SettlementHeroHeader,
} from '../../shared/ui/RollingScoreCounter';
import { detectFullscreenCapabilities } from '../../shared/utils/fullscreenHelper';
import { generateSharePoster } from './utils/sharePosterGenerator';

export interface MahjongTableViewProps {
  onLeaveRoom: () => void;
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const getModeLabel = (mode?: string) => {
  if (mode === 'puer') return '普洱麻将';
  if (mode === 'tuidaohu') return '经典推倒胡';
  if (mode === 'hongzhong') return '红中麻将';
  if (mode === 'xuezhan') return '血战到底';
  if (mode === 'guobiao') return '国标麻将';
  return '经典麻将';
};

export const MahjongTableView: React.FC<MahjongTableViewProps> = ({
  onLeaveRoom,
  viewport,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [snapshot, setSnapshot] = useState<MahjongTableSnapshot | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundEngine.isEnabled());
  const [showRuleModal, setShowRuleModal] = useState<boolean>(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);
  const [showFullscreenGuide, setShowFullscreenGuide] = useState<boolean>(false);
  const [showDiceAnimation, setShowDiceAnimation] = useState<boolean>(false);
  const [activeActionGlow, setActiveActionGlow] = useState<{
    action: 'chi' | 'peng' | 'gang' | 'hu' | 'zimo';
    relativeSeat?: number;
    subType?: 'guafeng' | 'xiayu';
    fanNames?: string[];
  } | null>(null);
  const [propTargetAbsSeat, setPropTargetAbsSeat] = useState<number | null>(null);
  const [floatingScores, setFloatingScores] = useState<Array<{ id: string; seatId: number; text: string; isWin: boolean }>>([]);
  const [sharePosterUrl, setSharePosterUrl] = useState<string | null>(null);
  const [isGeneratingPoster, setIsGeneratingPoster] = useState<boolean>(false);

  const prevBillsLengthRef = useRef<number>(0);
  const prevPhaseRef = useRef<MahjongPhase | null>(null);
  const prevTurnRef = useRef<number | null>(null);
  const prevDrawnRef = useRef<number | null>(null);
  const prevDiscardRef = useRef<{ seatId: number; tileId: number } | null>(null);
  const prevDiscardSeqRef = useRef<number | null>(null);
  const prevMeldsCountsRef = useRef<number[]>([0, 0, 0, 0]);

  // Initialize and register socket listener
  useEffect(() => {
    soundEngine.startBgm('table');
    soundEngine.preloadMahjongAudio();

    const unsubscribeSnapshot = socketClient.on('s2c_mj_snapshot', (data: MahjongTableSnapshot) => {
      setSnapshot(data);
    });

    // Active state resynchronization on mobile network recovery
    const unsubscribeReconnect = socketClient.on('socket_connected', () => {
      socketClient.emit('c2s_request_snapshot');
    });

    // Request snapshot on mount in case already in room
    socketClient.emit('c2s_request_snapshot');

    return () => {
      soundEngine.clearMahjongVoiceQueue();
      unsubscribeSnapshot();
      unsubscribeReconnect();
    };
  }, []);

  // Compute my Seat ID from current user profile
  const myPlayerId = socketClient.getPlayerId();
  const mySeatId = useMemo(() => {
    if (!snapshot || !myPlayerId) return 0;
    const found = snapshot.players.findIndex((p) => p.playerId === myPlayerId);
    return found !== -1 ? found : 0;
  }, [snapshot, myPlayerId]);

  // Audio, Discard Voices, Melds, and Bill Notifications
  useEffect(() => {
    if (!snapshot) return;
    setCurrentMahjongMode(snapshot.mode || 'puer');

    // 1. Phase sound cues & dice rolling ritual
    if (prevPhaseRef.current !== snapshot.phase) {
      if (snapshot.phase === 'DEALING') {
        soundEngine.clearMahjongVoiceQueue();
        soundEngine.playMahjongDeal();
        if (snapshot.diceValues) {
          setShowDiceAnimation(true);
        }
        MahjongDebugLogger.logDealSnapshot({
          roomId: snapshot.roomId,
          mode: snapshot.mode || 'puer',
          dealerSeat: snapshot.dealerSeatId,
          wallRemaining: snapshot.remainWallCount,
          seats: snapshot.players.map((p) => ({
            seat: p.seatId,
            name: p.nickname,
            isBot: p.isBot,
            hand: p.handTiles || [],
            melds: p.melds || [],
            discards: p.discards || [],
          })),
          source: 'CLIENT',
        });
      } else if (snapshot.phase === 'DING_QUE') {
        soundEngine.playTap(760);
      }
      prevPhaseRef.current = snapshot.phase;
    }

    // 2. Draw sound cues & Turn Analysis log for self
    const myPlayer = snapshot.players[mySeatId];
    if (myPlayer?.drawnTile && myPlayer.drawnTile !== prevDrawnRef.current) {
      if (myPlayer.drawnTile === 31 && (snapshot.mode === 'hongzhong' || snapshot.mode === 'hongzhong_xueliu')) {
        soundEngine.playMahjongWild();
      } else {
        soundEngine.playMahjongDraw();
      }
      prevDrawnRef.current = myPlayer.drawnTile;

      const lackMap: Record<number, 'wan' | 'tiao' | 'tong'> = { 0: 'wan', 1: 'tiao', 2: 'tong' };
      const dq = myPlayer.dingQueSuit;
      MahjongDebugLogger.logTurnAnalysis({
        seat: mySeatId,
        playerName: myPlayer.nickname,
        mode: snapshot.mode || 'puer',
        drawnTile: myPlayer.drawnTile,
        hand: myPlayer.handTiles || [],
        melds: myPlayer.melds || [],
        visibleTiles: [
          ...snapshot.players.flatMap((p) => p.discards || []),
          ...snapshot.players.flatMap((p) => (p.melds || []).flatMap((m) => m.tiles || [])),
        ],
        lackSuit: dq !== null && dq !== undefined ? lackMap[dq] || null : null,
        wallRemaining: snapshot.remainWallCount,
        isBot: false,
        source: 'CLIENT',
      });
    }

    // 3. Discard Voice Callout (Reference authentic female/male library)
    const latest = snapshot.latestDiscard;
    if (!latest) {
      prevDiscardRef.current = null;
      prevDiscardSeqRef.current = null;
    } else {
      const tileId = latest.tileId ?? latest.card ?? 0;
      const seq = latest.seq;
      const isNewDiscard =
        seq !== undefined
          ? seq !== prevDiscardSeqRef.current
          : (prevDiscardRef.current?.seatId !== latest.seatId ||
             prevDiscardRef.current?.tileId !== tileId);

      if (tileId > 0 && isNewDiscard) {
        if (seq !== undefined) {
          prevDiscardSeqRef.current = seq;
        }
        prevDiscardRef.current = { seatId: latest.seatId, tileId };

        // For opponent discard, play physical tile-drop acoustics (self already played on click)
        if (latest.seatId !== mySeatId) {
          soundEngine.playMahjongGive();
        }

        const player = snapshot.players[latest.seatId];
        const isFemale = player?.avatarId === 'beier' || player?.avatarId === 'heroine';
        const gender = isFemale ? 'female' : 'male';
        soundEngine.playTileVoice(tileId, gender);

        MahjongDebugLogger.logDiscardAction({
          seat: latest.seatId,
          playerName: player?.nickname || `座位${latest.seatId}`,
          tileId,
          gender,
          mode: snapshot.mode || 'puer',
          handAfter: latest.seatId === mySeatId ? myPlayer?.handTiles : undefined,
          melds: player?.melds || [],
          source: 'CLIENT',
        });
      }
    }

    const scheduleMahjongGlow = (glowPayload: {
      action: 'chi' | 'peng' | 'gang' | 'hu' | 'zimo';
      relativeSeat?: number;
      subType?: 'guafeng' | 'xiayu';
      fanNames?: string[];
    }) => {
      const priority =
        glowPayload.action === 'zimo'
          ? EffectPriority.ULTIMATE
          : glowPayload.action === 'hu'
            ? EffectPriority.CRITICAL
            : glowPayload.action === 'gang'
              ? EffectPriority.MAJOR
              : EffectPriority.NORMAL;
      const durationMs =
        glowPayload.action === 'zimo' || glowPayload.action === 'hu' ? 1420 : 1080;

      effectCoordinator.enqueue({
        sceneId: 'mahjong',
        type: `mj_${glowPayload.action}`,
        priority,
        useGlobalMask: false,
        durationMs,
        preemptLowerPriority: priority >= EffectPriority.CRITICAL,
        onStart: () => {
          setActiveActionGlow(glowPayload);
          return () => {
            setActiveActionGlow((prev) => (prev === glowPayload ? null : prev));
          };
        },
      });
    };

    // 4. Meld Action Voice Callout (e.g. 碰 / 吃)
    snapshot.players.forEach((p, sId) => {
      const meldsCount = p.melds?.length || 0;
      if (meldsCount > (prevMeldsCountsRef.current[sId] || 0)) {
        const latestMeld = p.melds[meldsCount - 1];
        const relSeat = (sId - mySeatId + 4) % 4;
        if (latestMeld && (latestMeld.type === 'peng' || latestMeld.type === 'chi')) {
          const isFemale = p.avatarId === 'beier' || p.avatarId === 'heroine';
          const gender = isFemale ? 'female' : 'male';
          const actType = latestMeld.type === 'chi' ? 'chi' : 'peng';
          soundEngine.playActionVoice('peng', gender);
          scheduleMahjongGlow({
            action: actType,
            relativeSeat: relSeat,
          });
          MahjongDebugLogger.logActionAndSettlement({
            action: 'peng',
            seat: sId,
            playerName: p.nickname,
            gender,
            targetTile: latestMeld.card || latestMeld.tiles?.[0],
            mode: snapshot.mode || 'puer',
            source: 'CLIENT',
          });
        }
      }
      prevMeldsCountsRef.current[sId] = meldsCount;
    });

    // 5. Round Bills (Hu / Gang bean transfer & Action voices)
    if (snapshot.bills && snapshot.bills.length > prevBillsLengthRef.current) {
      const newBills = snapshot.bills.slice(prevBillsLengthRef.current);
      prevBillsLengthRef.current = snapshot.bills.length;

      const latestBill = newBills[newBills.length - 1];

      soundEngine.playMahjongBeanFly();
      const winnerSeat = latestBill.winnerSeatId ?? 0;
      const winnerRelSeat = (winnerSeat - mySeatId + 4) % 4;
      const winnerPlayer = latestBill.winnerSeatId !== undefined ? snapshot.players[latestBill.winnerSeatId] : undefined;
      const isFemale = winnerPlayer?.avatarId === 'beier' || winnerPlayer?.avatarId === 'heroine';
      const gender = isFemale ? 'female' : 'male';
      const billFanNames = latestBill.fanName ? [latestBill.fanName] : undefined;

      if (latestBill.eventType === 'zimo') {
        soundEngine.playActionVoice('zimo', gender);
        scheduleMahjongGlow({
          action: 'zimo',
          relativeSeat: winnerRelSeat,
          fanNames: billFanNames,
        });
        MahjongDebugLogger.logActionAndSettlement({
          action: 'zimo',
          seat: winnerSeat,
          playerName: winnerPlayer?.nickname || '玩家',
          gender,
          mode: snapshot.mode || 'puer',
          hand: winnerPlayer?.handTiles,
          melds: winnerPlayer?.melds,
          scoreDelta: latestBill.scoreDelta,
          source: 'CLIENT',
        });
      } else if (latestBill.eventType === 'dianpao' || latestBill.eventType === 'qianggang') {
        soundEngine.playActionVoice('hu', gender);
        scheduleMahjongGlow({
          action: 'hu',
          relativeSeat: winnerRelSeat,
          fanNames: billFanNames,
        });
        MahjongDebugLogger.logActionAndSettlement({
          action: 'hu',
          seat: winnerSeat,
          playerName: winnerPlayer?.nickname || '玩家',
          gender,
          mode: snapshot.mode || 'puer',
          hand: winnerPlayer?.handTiles,
          melds: winnerPlayer?.melds,
          scoreDelta: latestBill.scoreDelta,
          source: 'CLIENT',
        });
      } else if (latestBill.eventType === 'guafeng' || latestBill.eventType === 'xiayu') {
        soundEngine.playActionVoice('gang', gender);
        scheduleMahjongGlow({
          action: 'gang',
          relativeSeat: winnerRelSeat,
          subType: latestBill.eventType,
        });
        MahjongDebugLogger.logActionAndSettlement({
          action: 'gang',
          seat: winnerSeat,
          playerName: winnerPlayer?.nickname || '玩家',
          gender,
          mode: snapshot.mode || 'puer',
          scoreDelta: latestBill.scoreDelta,
          source: 'CLIENT',
        });
      }

      if (latestBill.winnerSeatId !== undefined && latestBill.winnerSeatId === mySeatId) {
        soundEngine.playMahjongWin(latestBill.eventType === 'zimo');
        hapticEngine.playCard();
      }

      // Add floating score popup
      const newFloating: Array<{ id: string; seatId: number; text: string; isWin: boolean }> = [];
      if (latestBill.winnerSeatId !== undefined) {
        newFloating.push({
          id: `${latestBill.id}_win`,
          seatId: latestBill.winnerSeatId,
          text: `+${latestBill.scoreDelta ?? latestBill.delta ?? 0}`,
          isWin: true,
        });
      }
      if (latestBill.loserSeatId !== undefined && latestBill.loserSeatId !== -1) {
        newFloating.push({
          id: `${latestBill.id}_lose`,
          seatId: latestBill.loserSeatId,
          text: `-${latestBill.scoreDelta ?? latestBill.delta ?? 0}`,
          isWin: false,
        });
      }
      setFloatingScores((prev) => [...prev, ...newFloating]);

      const timer = setTimeout(() => {
        setFloatingScores((prev) => prev.filter((f) => !f.id.startsWith(latestBill.id)));
      }, 3500);

      return () => clearTimeout(timer);
    }
  }, [snapshot, mySeatId]);

  // Relative seat mapping: 0: Self (Bottom), 1: Right, 2: Top, 3: Left
  const relativePlayers = useMemo(() => {
    if (!snapshot) return [null, null, null, null];
    const rel = [null, null, null, null] as Array<(typeof snapshot.players)[0] | null>;
    for (let i = 0; i < 4; i++) {
      const absSeat = (mySeatId + i) % 4;
      rel[i] = snapshot.players[absSeat] || null;
    }
    return rel;
  }, [snapshot, mySeatId]);

  const relativeDiscards = useMemo(() => {
    if (!snapshot) return [[], [], [], []];
    const rivers: number[][] = [[], [], [], []];
    for (let i = 0; i < 4; i++) {
      const absSeat = (mySeatId + i) % 4;
      rivers[i] = snapshot.players[absSeat]?.discards || [];
    }
    return rivers;
  }, [snapshot, mySeatId]);

  const relativeLatestDiscard = useMemo(() => {
    if (!snapshot?.latestDiscard) return null;
    const relSeat = (snapshot.latestDiscard.seatId - mySeatId + 4) % 4;
    const tileId = snapshot.latestDiscard.tileId ?? snapshot.latestDiscard.card ?? 0;
    return {
      seatId: relSeat,
      tileId,
    };
  }, [snapshot, mySeatId]);

  const relativeCurrentTurn = useMemo(() => {
    if (!snapshot) return 0;
    return (snapshot.currentTurnSeatId - mySeatId + 4) % 4;
  }, [snapshot, mySeatId]);

  // Recommended DingQue suit (the suit with the fewest tiles, excluding HongZhong)
  const recommendedDingQue = useMemo(() => {
    const hand = relativePlayers[0]?.handTiles || [];
    const counts = [0, 0, 0];
    for (const t of hand) {
      const s = getSuit(t);
      if (s === 0 || s === 1 || s === 2) {
        counts[s]++;
      }
    }
    let minSuit: MahjongSuit = 0;
    let minCount = 999;
    for (let s = 0; s < 3; s++) {
      if (counts[s] < minCount) {
        minCount = counts[s];
        minSuit = s as MahjongSuit;
      }
    }
    return minSuit;
  }, [relativePlayers]);

  // Handlers
  const handleSelectDingQue = useCallback((suit: MahjongSuit) => {
    soundEngine.playTap(780);
    hapticEngine.selectCard();
    socketClient.emit('c2s_mj_dingque', { suit });
  }, []);

  const handleDiscard = useCallback((tileId: number) => {
    socketClient.emit('c2s_mj_discard', { tileId });
  }, []);

  const handleAction = useCallback((act: AvailableAction) => {
    soundEngine.playTap(820);
    hapticEngine.playCard();
    socketClient.emit('c2s_mj_action', {
      actionType: act.actionType,
      meldTiles: act.meldTiles,
    });
  }, []);

  const handleLeaveRoom = useCallback(() => {
    soundEngine.playTap(640);
    socketClient.emit('c2s_leave_room');
    onLeaveRoom();
  }, [onLeaveRoom]);

  const handlePlayAgain = useCallback(() => {
    soundEngine.playTap(760);
    socketClient.emit('c2s_quick_match', { gameType: 'mahjong' });
  }, []);

  const handleGenerateSharePoster = useCallback(async () => {
    if (!snapshot) return;
    try {
      setIsGeneratingPoster(true);
      soundEngine.playTap(720);
      const dataUrl = await generateSharePoster(snapshot);
      setSharePosterUrl(dataUrl);
    } catch (err) {
      console.error('Failed to generate share poster:', err);
    } finally {
      setIsGeneratingPoster(false);
    }
  }, [snapshot]);

  const toggleSound = () => {
    const next = soundEngine.toggle();
    setSoundEnabled(next);
  };

  const myPlayer = relativePlayers[0];
  const isMyTurn = relativeCurrentTurn === 0 && snapshot?.phase === 'PLAYING';
  const showDingQueOverlay =
    snapshot?.phase === 'DING_QUE' && myPlayer?.dingQueSuit === null;

  return (
    <AutoLandscapeContainer>
      {({
        stageWidth,
        stageHeight,
        isVirtualLandscape,
        scale,
        virtualWidth,
        virtualHeight,
        stageScale,
      }) => {
        return (
          <div
            className="relative flex h-full w-full items-center justify-center overflow-hidden select-none bg-[#03150c]"
            style={{
              backgroundImage: `url('/assets/mahjong/ui/bg_game.jpg')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* 3D Table Shadow Vignette Overlay */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.7)_95%)]" />

            {/* Virtual Stage Container: 720p height, dynamic virtualWidth, centered and scaled */}
            <div
              className="absolute overflow-hidden"
              style={{
                width: `${virtualWidth}px`,
                height: `${virtualHeight}px`,
                left: '50%',
                top: '50%',
                transform: `translate3d(-50%, -50%, 0) scale(${stageScale})`,
                transformOrigin: 'center center',
              }}
            >
              {/* ===================================================================
                  1. TOP NAVIGATION & HEADER CONTROLS (Auto-hidden during settlement)
                 =================================================================== */}
              {!(snapshot?.phase === 'SETTLEMENT' || snapshot?.phase === 'CHA_DA_JIAO') && (
                <>
                  {/* Top-Left: Cocos Buttons (bt_set.png, bt_exit.png) */}
                  <div className="absolute top-3 left-4 z-30 flex items-center gap-2 pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setShowLeaveConfirm(true)}
                      title="退出大厅"
                      className="h-10 w-10 transition-transform hover:scale-105 active:scale-95 drop-shadow-lg"
                    >
                      <img
                        src="/assets/mahjong/ui/bt_exit.png"
                        alt="离开"
                        className="h-full w-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowRuleModal(true)}
                      title="设置与规则"
                      className="h-10 w-10 transition-transform hover:scale-105 active:scale-95 drop-shadow-lg"
                    >
                      <img
                        src="/assets/mahjong/ui/bt_set.png"
                        alt="设置"
                        className="h-full w-full object-contain pointer-events-none"
                        draggable={false}
                      />
                    </button>
                  </div>

                  {/* Top-Center: Clean Mode & Base Score Capsule */}
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-amber-400/35 bg-black/60 px-4 py-1.5 backdrop-blur-md shadow-xl text-xs font-bold text-amber-200">
                    <span>{getModeLabel(snapshot?.mode)}</span>
                    <span className="text-white/30">·</span>
                    <span className="font-mono text-amber-300">底分 {snapshot?.baseScore ?? 100}</span>
                  </div>

                  {/* Top-Right: Sound & Fullscreen Controls */}
                  <div className="absolute top-3 right-4 z-30 flex items-center gap-2 pointer-events-auto">
                    <button
                      type="button"
                      onClick={toggleSound}
                      title={soundEnabled ? '静音' : '开启声音'}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/85 hover:bg-black/75 shadow-md backdrop-blur-xs cursor-pointer"
                    >
                      {soundEnabled ? (
                        <Volume2 className="h-4 w-4 text-amber-300" />
                      ) : (
                        <VolumeX className="h-4 w-4 text-rose-400" />
                      )}
                    </button>

                    {onToggleFullscreen && (
                      <button
                        type="button"
                        onClick={() => {
                          const caps = detectFullscreenCapabilities();
                          if (!caps.canNativeFullscreen && caps.isIOSSafari) {
                            setShowFullscreenGuide(true);
                          } else {
                            onToggleFullscreen();
                          }
                        }}
                        title={isFullscreen ? '退出全屏' : '全屏'}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white/85 hover:bg-black/75 shadow-md backdrop-blur-xs transition-all cursor-pointer"
                      >
                        {isFullscreen ? (
                          <Minimize2 className="h-4 w-4 text-amber-300" />
                        ) : (
                          <Maximize2 className="h-4 w-4 text-white" />
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ===================================================================
                  2. TABLE MAIN PLAY AREA (720p VIRTUAL COORDINATE SPACE)
                 =================================================================== */}
              {/* 1. CENTRAL DIRECTION COMPASS (y = 310) */}
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: '50%',
                  top: '310px',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <CompassCenter
                  currentTurnSeatId={relativeCurrentTurn}
                  remainWallCount={snapshot?.remainWallCount ?? 112}
                  baseScore={snapshot?.baseScore ?? 100}
                />
              </div>

              {/* 2. FOUR DISCARD RIVERS SURROUNDING COMPASS */}
              <DiscardRiverZone
                discards={relativeDiscards}
                latestDiscard={relativeLatestDiscard}
                centerY={310}
              />

              {/* 3. 3D OPPONENTS & SELF HANDS */}
              <HandTilesZone
                handTiles={myPlayer?.handTiles || []}
                drawnTile={myPlayer?.drawnTile}
                dingQueSuit={myPlayer?.dingQueSuit ?? null}
                isMyTurn={isMyTurn}
                onDiscard={handleDiscard}
                optimalDiscardTile={snapshot?.optimalDiscard?.bestTile}
                optimalDiscardReason={snapshot?.optimalDiscard?.reason}
                discardHints={snapshot?.discardHints}
                otherHandCounts={[
                  relativePlayers[1]?.handCount || 13,
                  relativePlayers[2]?.handCount || 13,
                  relativePlayers[3]?.handCount || 13,
                ]}
                melds={myPlayer?.melds || []}
              />

              {/* ===================================================================
                  3. AVATAR HUDS (4 SEATS)
                 =================================================================== */}
              {/* SEAT 0: BOTTOM (SELF) - Lower-Left Rail */}
              {myPlayer && (
                <div className="absolute bottom-[20px] left-5 z-30">
                  <MahjongPlayerAvatar
                    nickname={myPlayer.nickname}
                    avatarId={myPlayer.avatarId}
                    beans={myPlayer.beans}
                    isBanker={snapshot?.dealerSeatId === mySeatId}
                    dingQueSuit={myPlayer.dingQueSuit}
                    huCount={myPlayer.huCount}
                    isCurrentTurn={relativeCurrentTurn === 0}
                    showMelds={false}
                  />
                </div>
              )}

              {/* SEAT 3: LEFT PLAYER - Upper-Left Rail */}
              {relativePlayers[3] && (
                <div className="absolute top-[200px] left-5 z-20 flex flex-col items-start">
                  <div
                    onClick={() => {
                      const absSeat = (mySeatId + 3) % 4;
                      setPropTargetAbsSeat((prev) => (prev === absSeat ? null : absSeat));
                    }}
                    className="cursor-pointer transition-transform active:scale-95"
                    title="点击向该牌友赠送互动礼仪"
                  >
                    <MahjongPlayerAvatar
                      nickname={relativePlayers[3].nickname}
                      avatarId={relativePlayers[3].avatarId}
                      beans={relativePlayers[3].beans}
                      isBanker={snapshot?.dealerSeatId === (mySeatId + 3) % 4}
                      dingQueSuit={relativePlayers[3].dingQueSuit}
                      huCount={relativePlayers[3].huCount}
                      isCurrentTurn={relativeCurrentTurn === 3}
                      showMelds={false}
                    />
                  </div>
                  {propTargetAbsSeat === (mySeatId + 3) % 4 && (
                    <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/12 bg-[#12171B]/95 p-1 text-[#F3F4F6] shadow-xl backdrop-blur-md">
                      {[
                        { type: 'flower', label: '鲜花' },
                        { type: 'tea', label: '敬茶' },
                        { type: 'like', label: '点赞' },
                        { type: 'ingot', label: '元宝' },
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            socketClient.emit('c2s_throw_prop', {
                              targetSeat: (mySeatId + 3) % 4,
                              propType: item.type,
                            });
                            setPropTargetAbsSeat(null);
                          }}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#E5E7EB] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/15 hover:text-white active:scale-95 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SEAT 2: TOP PLAYER - Top Center-Right */}
              {relativePlayers[2] && (
                <div className="absolute top-[50px] right-[260px] z-20 flex flex-col items-end">
                  <div
                    onClick={() => {
                      const absSeat = (mySeatId + 2) % 4;
                      setPropTargetAbsSeat((prev) => (prev === absSeat ? null : absSeat));
                    }}
                    className="cursor-pointer transition-transform active:scale-95"
                    title="点击向该牌友赠送互动礼仪"
                  >
                    <MahjongPlayerAvatar
                      nickname={relativePlayers[2].nickname}
                      avatarId={relativePlayers[2].avatarId}
                      beans={relativePlayers[2].beans}
                      isBanker={snapshot?.dealerSeatId === (mySeatId + 2) % 4}
                      dingQueSuit={relativePlayers[2].dingQueSuit}
                      huCount={relativePlayers[2].huCount}
                      isCurrentTurn={relativeCurrentTurn === 2}
                      showMelds={false}
                    />
                  </div>
                  {propTargetAbsSeat === (mySeatId + 2) % 4 && (
                    <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/12 bg-[#12171B]/95 p-1 text-[#F3F4F6] shadow-xl backdrop-blur-md">
                      {[
                        { type: 'flower', label: '鲜花' },
                        { type: 'tea', label: '敬茶' },
                        { type: 'like', label: '点赞' },
                        { type: 'ingot', label: '元宝' },
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            socketClient.emit('c2s_throw_prop', {
                              targetSeat: (mySeatId + 2) % 4,
                              propType: item.type,
                            });
                            setPropTargetAbsSeat(null);
                          }}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#E5E7EB] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/15 hover:text-white active:scale-95 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SEAT 1: RIGHT PLAYER - Upper-Right Rail */}
              {relativePlayers[1] && (
                <div className="absolute top-[200px] right-5 z-20 flex flex-col items-end">
                  <div
                    onClick={() => {
                      const absSeat = (mySeatId + 1) % 4;
                      setPropTargetAbsSeat((prev) => (prev === absSeat ? null : absSeat));
                    }}
                    className="cursor-pointer transition-transform active:scale-95"
                    title="点击向该牌友赠送互动礼仪"
                  >
                    <MahjongPlayerAvatar
                      nickname={relativePlayers[1].nickname}
                      avatarId={relativePlayers[1].avatarId}
                      beans={relativePlayers[1].beans}
                      isBanker={snapshot?.dealerSeatId === (mySeatId + 1) % 4}
                      dingQueSuit={relativePlayers[1].dingQueSuit}
                      huCount={relativePlayers[1].huCount}
                      isCurrentTurn={relativeCurrentTurn === 1}
                      showMelds={false}
                    />
                  </div>
                  {propTargetAbsSeat === (mySeatId + 1) % 4 && (
                    <div className="mt-1 flex items-center gap-1 rounded-xl border border-white/12 bg-[#12171B]/95 p-1 text-[#F3F4F6] shadow-xl backdrop-blur-md">
                      {[
                        { type: 'flower', label: '鲜花' },
                        { type: 'tea', label: '敬茶' },
                        { type: 'like', label: '点赞' },
                        { type: 'ingot', label: '元宝' },
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => {
                            socketClient.emit('c2s_throw_prop', {
                              targetSeat: (mySeatId + 1) % 4,
                              propType: item.type,
                            });
                            setPropTargetAbsSeat(null);
                          }}
                          className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#E5E7EB] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/15 hover:text-white active:scale-95 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* DEDICATED TABLE MELDS ZONES (SEAT 1, 2, 3) */}
              {relativePlayers[3]?.melds && relativePlayers[3].melds.length > 0 && (
                <div
                  className="absolute z-15 pointer-events-none"
                  style={{ left: '50px', top: '380px' }}
                >
                  <MeldsZone
                    melds={relativePlayers[3].melds}
                    isSmall
                    perspective={1}
                    direction="column"
                  />
                </div>
              )}

              {relativePlayers[1]?.melds && relativePlayers[1].melds.length > 0 && (
                <div
                  className="absolute z-15 pointer-events-none"
                  style={{ right: '50px', top: '380px' }}
                >
                  <MeldsZone
                    melds={relativePlayers[1].melds}
                    isSmall
                    perspective={3}
                    direction="column"
                  />
                </div>
              )}

              {relativePlayers[2]?.melds && relativePlayers[2].melds.length > 0 && (
                <div
                  className="absolute z-15 pointer-events-none"
                  style={{ top: '50px', left: 'calc(50% - 380px)' }}
                >
                  <MeldsZone
                    melds={relativePlayers[2].melds}
                    isSmall
                    perspective={2}
                    direction="row"
                  />
                </div>
              )}

              {/* FLOATING BEAN SCORE DELTAS (+1600 / -800) */}
              {floatingScores.map((f) => {
                const relSeat = (f.seatId - mySeatId + 4) % 4;
                const posStyle: React.CSSProperties =
                  relSeat === 0
                    ? { bottom: '100px', left: '100px' }
                    : relSeat === 1
                    ? { right: '120px', top: '240px' }
                    : relSeat === 2
                    ? { top: '90px', left: 'calc(50% + 180px)' }
                    : { left: '120px', top: '240px' };
                return (
                  <div
                    key={f.id}
                    style={posStyle}
                    className={`pointer-events-none absolute z-40 font-display text-lg font-black tracking-wider transition-all duration-1000 animate-in fade-in slide-in-from-bottom-4 ${
                      f.isWin
                        ? 'text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]'
                        : 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                    }`}
                  >
                    {f.text}
                  </div>
                );
              })}

              {/* ACTION BAR (吃 碰 杠 胡 过 - 悬浮于自家手牌正上方，隔离带 y = 530px) */}
              {snapshot?.availableActions && snapshot.availableActions.length > 0 && (
                <div
                  className="absolute z-40 pointer-events-auto"
                  style={{ bottom: '130px', right: '50px' }}
                >
                  <ActionBarFSM
                    actions={snapshot.availableActions}
                    onAction={handleAction}
                  />
                </div>
              )}

              {/* TING PROMPT PANEL (Floating above melds / next to player avatar) */}
              {snapshot?.phase === 'PLAYING' && (
                <div
                  className="absolute z-30 pointer-events-auto"
                  style={{ bottom: '125px', left: '140px' }}
                >
                  <TingPromptPanel candidates={snapshot.tingList || []} />
                </div>
              )}
            </div>

            {/* ===================================================================
                4. DING QUE SELECTION OVERLAY (Phase: DING_QUE)
               =================================================================== */}
            {showDingQueOverlay && (
              <DingQueOverlay
                recommendedSuit={recommendedDingQue}
                onSelectSuit={handleSelectDingQue}
              />
            )}

            {/* ===================================================================
                5. SETTLEMENT / CHA DA JIAO MODAL
               =================================================================== */}
            {(snapshot?.phase === 'SETTLEMENT' || snapshot?.phase === 'CHA_DA_JIAO') && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
                <div className="relative flex max-h-[85dvh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md">
                  <SettlementHeroHeader
                    selfScoreDelta={
                      snapshot.settlement?.scoreDeltas?.[mySeatId] ??
                      snapshot.players[mySeatId]?.scoreDelta ??
                      0
                    }
                    titleWin="本局胜利"
                    titleLose="本局结算"
                    subtitle={`${getModeLabel(snapshot?.mode)} · 底分 ${(snapshot?.baseScore ?? 100).toLocaleString()} · 余牌 ${snapshot?.remainWallCount ?? 0} 张`}
                    onClose={handlePlayAgain}
                  />

                  {/* 4 Player Rounded Cards */}
                  <div className="flex flex-1 min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain p-3.5 sm:p-4">
                    {snapshot.players.map((p, idx) => {
                      const isWinner =
                        snapshot.settlement?.winners?.some((w) => w.seatId === idx) ||
                        ((p.huCount ?? 0) > 0 &&
                          (p.huCount ?? 0) ===
                            Math.max(...snapshot.players.map((x) => x.huCount ?? 0)));
                      const delta =
                        snapshot.settlement?.scoreDeltas?.[idx] ?? p.scoreDelta ?? 0;
                      const isDealer = snapshot.dealerSeatId === idx;
                      const isMe = p.playerId === myPlayerId;

                      const rawHand =
                        snapshot.settlement?.revealHands?.[idx] || p.handTiles || [];
                      const playerMelds =
                        snapshot.settlement?.melds?.[idx] || p.melds || [];
                      const winCard =
                        snapshot.settlement?.winners?.find((w) => w.seatId === idx)
                          ?.winCard ?? p.drawnTile;

                      const displayHand =
                        isWinner && winCard
                          ? (() => {
                              const copy = [...rawHand];
                              const foundIdx = copy.lastIndexOf(winCard);
                              if (foundIdx !== -1) copy.splice(foundIdx, 1);
                              return copy;
                            })()
                          : rawHand;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                            isMe
                              ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08]'
                              : 'border-white/[0.07] bg-white/[0.03]'
                          }`}
                        >
                          {/* Column 1: Player Identity */}
                          <div className="flex w-36 shrink-0 items-center gap-2.5">
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/12 bg-black/40">
                              <AvatarSvg avatarId={p.avatarId} size={32} />
                            </div>
                            <div className="flex min-w-0 flex-col">
                              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#F3F4F6]">
                                <span className="max-w-[78px] truncate">{p.nickname}</span>
                                {isMe && (
                                  <span className="text-[11px] font-semibold text-[#E5B85B]">· 我</span>
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#9CA3AF] tabular-nums">
                                <span>{isDealer ? '庄家' : '闲家'}</span>
                                <span aria-hidden="true">·</span>
                                <span>{p.beans.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Column 2: Exposed Melds & Hand Tiles */}
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
                            {playerMelds.map((m, mIdx) => (
                              <div
                                key={mIdx}
                                className="flex items-center gap-0.5 rounded bg-black/35 px-1.5 py-0.5 border border-white/[0.06]"
                              >
                                {m.tiles.map((t, tIdx) => (
                                  <MahjongTileView
                                    key={tIdx}
                                    tileId={t}
                                    isSmall
                                    perspective={2}
                                    kind="ming"
                                  />
                                ))}
                              </div>
                            ))}

                            <div className="flex items-center gap-0.5">
                              {displayHand.map((t, tIdx) => (
                                <MahjongTileView
                                  key={tIdx}
                                  tileId={t}
                                  isSmall
                                  perspective={2}
                                  kind="ming"
                                />
                              ))}
                            </div>

                            {isWinner && winCard && (
                              <div className="ml-1.5 flex items-center border-l border-white/15 pl-1.5">
                                <MahjongTileView
                                  tileId={winCard}
                                  isSmall
                                  perspective={2}
                                  kind="ming"
                                />
                              </div>
                            )}
                          </div>

                          {/* Column 3: Rolling Score & Winner Tag */}
                          <div className="flex w-24 shrink-0 flex-col items-end">
                            <RollingScoreCounter
                              value={delta}
                              size="md"
                              durationMs={900}
                              playTickSound={isMe}
                            />
                            {isWinner && (
                              <span className="text-[10px] font-semibold text-[#E5B85B]">
                                胡牌赢家
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Compact Right-Aligned Action Footer */}
                  <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
                    <button
                      type="button"
                      onClick={handleGenerateSharePoster}
                      disabled={isGeneratingPoster}
                      className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isGeneratingPoster ? '生成中...' : '分享战绩'}
                    </button>

                    <button
                      type="button"
                      onClick={handleLeaveRoom}
                      className="flex h-8.5 min-w-[84px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      返回大厅
                    </button>

                    <button
                      type="button"
                      onClick={handlePlayAgain}
                      className="flex h-8.5 min-w-[96px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] transition-colors hover:bg-[#E0A842] active:scale-98 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      再来一局
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================
                6. LEAVE CONFIRMATION MODAL (Lightweight Headerless Compact Dialog)
               =================================================================== */}
            {showLeaveConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
                <div
                  className="w-[300px] sm:w-[320px] rounded-2xl border border-white/10 bg-[#12171B]/95 p-5 text-center text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="text-[15px] font-bold text-[#F3F4F6]">
                    确认退出当前房间
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[#9CA3AF]">
                    对局中途退出将由托管接管直至本局结算。
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowLeaveConfirm(false)}
                      className="h-8.5 min-w-[92px] rounded-lg border border-white/12 bg-white/[0.06] px-4 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] transition-colors active:scale-98 cursor-pointer"
                    >
                      继续游戏
                    </button>
                    <button
                      type="button"
                      onClick={handleLeaveRoom}
                      className="h-8.5 min-w-[92px] rounded-lg bg-[#B93838] px-4 text-xs font-bold text-white hover:bg-[#C84343] transition-colors active:scale-98 cursor-pointer"
                    >
                      确认离开
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================
                7. RULES GUIDE MODAL
               =================================================================== */}
            {showRuleModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
                <div
                  className="flex max-h-[82dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
                    <h3 className="text-[15px] font-bold text-[#F3F4F6]">
                      四川红中血流成河 · 规则
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowRuleModal(false)}
                      aria-label="关闭"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain p-4 sm:p-5 text-xs leading-relaxed text-[#9CA3AF]">
                    <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] p-3 text-[#E5B85B]">
                      <strong className="font-bold">红中百搭</strong>：红中牌可替代任意花色组成顺子或刻子，摸齐 4 张红中可直接胡牌。
                    </div>
                    <div>
                      <strong className="font-bold text-[#F3F4F6]">1. 定缺门</strong>：开局在万、条、筒中选定一门缺色，打光该门手牌方可胡牌。
                    </div>
                    <div>
                      <strong className="font-bold text-[#F3F4F6]">2. 血流不倒牌</strong>：一人胡牌后对局继续，直至牌墙摸尽。
                    </div>
                    <div>
                      <strong className="font-bold text-[#F3F4F6]">3. 刮风下雨</strong>：明杠收取 1 家底分，暗杠收取 3 家底分。
                    </div>
                    <div>
                      <strong className="font-bold text-[#F3F4F6]">4. 查大叫与查花猪</strong>：牌墙耗尽后，未听牌玩家赔付听牌玩家最大番数，手存缺牌赔付 16 番封顶。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================================
                8. 3D DICE THROW CEREMONY & ACTION RADIAL GLOW
               =================================================================== */}
            {showDiceAnimation && snapshot?.diceValues && (
              <DiceThrowAnimation
                diceValues={snapshot.diceValues}
                dealerSeatId={snapshot.dealerSeatId}
                mySeatId={mySeatId}
                onFinish={() => setShowDiceAnimation(false)}
              />
            )}

            {activeActionGlow && (
              <ActionGlowEffect
                action={activeActionGlow.action}
                relativeSeat={activeActionGlow.relativeSeat}
                subType={activeActionGlow.subType}
                fanNames={activeActionGlow.fanNames}
                onComplete={() => setActiveActionGlow(null)}
              />
            )}

            {/* ===================================================================
                9. FULLSCREEN & HIDE NAVIGATION BAR GUIDE MODAL
               =================================================================== */}
            <FullscreenGuideModal
              isOpen={showFullscreenGuide}
              onClose={() => setShowFullscreenGuide(false)}
            />

            {/* ===================================================================
                10. SHARE POSTER MODAL (P3)
               =================================================================== */}
            {sharePosterUrl && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
                <div
                  className="relative flex max-h-[85dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex w-full shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
                    <span className="text-[15px] font-bold text-[#F3F4F6]">对局战绩海报</span>
                    <button
                      type="button"
                      onClick={() => setSharePosterUrl(null)}
                      aria-label="关闭"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Poster Image Preview */}
                  <div className="flex flex-1 min-h-0 items-center justify-center overflow-y-auto overscroll-contain p-4">
                    <img
                      src={sharePosterUrl}
                      alt="战绩海报"
                      className="max-h-[54dvh] w-auto rounded-xl border border-white/10 object-contain shadow-sm select-none"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex w-full shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSharePosterUrl(null)}
                      className="h-8.5 min-w-[76px] rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] cursor-pointer"
                    >
                      关闭
                    </button>
                    <a
                      href={sharePosterUrl}
                      download={`mahjong_record_${Date.now()}.png`}
                      onClick={() => soundEngine.playTap()}
                      className="flex h-8.5 min-w-[92px] items-center justify-center rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] active:scale-98 cursor-pointer"
                    >
                      保存图片
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AutoLandscapeContainer>
  );
};
