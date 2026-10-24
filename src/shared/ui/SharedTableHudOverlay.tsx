import React, { useEffect, useRef, useState } from 'react';
import { SettingsModal } from '../../hall/components/modals/SettingsModal';
import { soundEngine } from '../audio/SoundEngine';
import {
  gameControlHub,
  useGameControlState,
} from '../control/GameControlHub';
import {
  ESCROW_STATUS_LABELS,
  PAY_MODE_LABELS,
  roomCardSessionHub,
  useRoomCardSession,
} from '../control/RoomCardSessionHub';
import { socketClient } from '../network/SocketClient';
import { RoomCardGrandSettlementModal } from './RoomCardGrandSettlementModal';

export interface SharedTableHudOverlayProps {
  activeRoomId: string | null;
  gameType: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom?: () => void;
  onShowNotice?: (msg: string) => void;
}

/**
 * Lightweight Table-Scoped Modal & Room Card Lifecycle Coordinator
 * - Automatically resets table-scoped trusteeship/modal states when switching rooms.
 * - Tracks multi-round Room Card sessions across all 5 games (`ddz`, `mahjong`, `niuniu`, `zhajinhua`, `laoyancai`),
 *   displaying a clean top room-card status bar and triggering the Grand Settlement Modal upon completion.
 */
export const SharedTableHudOverlay: React.FC<SharedTableHudOverlayProps> = ({
  activeRoomId,
  gameType,
  isFullscreen,
  onToggleFullscreen,
  onLeaveRoom,
  onShowNotice,
}) => {
  const controlState = useGameControlState();
  const { activeSession } = useRoomCardSession();
  const [copiedCode, setCopiedCode] = useState(false);
  const [showGrandModal, setShowGrandModal] = useState(false);

  const prevMjPhaseRef = useRef<string>('');
  const prevNiuniuPhaseRef = useRef<string>('');
  const prevZjhPhaseRef = useRef<string>('');
  const prevLycPhaseRef = useRef<string>('');

  useEffect(() => {
    gameControlHub.resetTableScopedState();
  }, [activeRoomId, gameType]);

  // Auto-open Grand Settlement Modal when all rounds complete
  useEffect(() => {
    if (activeSession?.status === 'grand_settled') {
      setShowGrandModal(true);
    }
  }, [activeSession?.status, activeSession?.roundHistory.length]);

  // Subscribe to all 5 games' round settlement socket events when a Room Card session is active
  useEffect(() => {
    if (!activeRoomId || !activeSession) return;

    const myId = socketClient.getPlayerId();
    const unsubs: Array<() => void> = [];

    // 1. Dou Dizhu settlement event
    unsubs.push(
      socketClient.on('s2c_game_settlement', (data: {
        results?: Array<{ playerId: string; nickname: string; scoreDelta: number; isBot?: boolean }>;
      }) => {
        if (!Array.isArray(data?.results)) return;
        const me = data.results.find((r) => r.playerId === myId) || data.results[0];
        const peers = data.results
          .filter((r) => r !== me)
          .map((r) => ({ name: r.nickname, delta: r.scoreDelta }));
        roomCardSessionHub.recordRoundSettlement({
          heroDelta: me?.scoreDelta ?? 0,
          heroName: me?.nickname,
          summaryText: '斗地主本局结算',
          peerDeltas: peers,
        });
      })
    );

    // 2. Mahjong snapshot round completion
    unsubs.push(
      socketClient.on('s2c_mj_snapshot', (snap: {
        phase?: string;
        players?: Array<{ playerId: string; nickname: string; roundScoreDelta?: number; isBot?: boolean }>;
      }) => {
        const phase = snap?.phase || '';
        if (
          (phase === 'ROUND_RESULT' || phase === 'GAME_OVER') &&
          prevMjPhaseRef.current !== 'ROUND_RESULT' &&
          prevMjPhaseRef.current !== 'GAME_OVER' &&
          Array.isArray(snap?.players)
        ) {
          const me = snap.players.find((p) => p.playerId === myId) || snap.players[0];
          const peers = snap.players
            .filter((p) => p !== me)
            .map((p) => ({ name: p.nickname, delta: p.roundScoreDelta ?? 0 }));
          roomCardSessionHub.recordRoundSettlement({
            heroDelta: me?.roundScoreDelta ?? 0,
            heroName: me?.nickname,
            summaryText: '普洱麻将本局结算',
            peerDeltas: peers,
          });
        }
        prevMjPhaseRef.current = phase;
      })
    );

    // 3. Niuniu snapshot round completion
    unsubs.push(
      socketClient.on('s2c_niuniu_snapshot', (snap: {
        phase?: string;
        seats?: Array<{ playerId: string; nickname: string; roundDelta?: number; isBot?: boolean } | null>;
      }) => {
        const phase = snap?.phase || '';
        if (
          phase === 'ROUND_RESULT' &&
          prevNiuniuPhaseRef.current !== 'ROUND_RESULT' &&
          Array.isArray(snap?.seats)
        ) {
          const validSeats = snap.seats.filter(Boolean) as Array<{
            playerId: string;
            nickname: string;
            roundDelta?: number;
            isBot?: boolean;
          }>;
          const me = validSeats.find((s) => !s.isBot || s.playerId === myId) || validSeats[0];
          const peers = validSeats
            .filter((s) => s !== me)
            .map((s) => ({ name: s.nickname, delta: s.roundDelta ?? 0 }));
          roomCardSessionHub.recordRoundSettlement({
            heroDelta: me?.roundDelta ?? 0,
            heroName: me?.nickname,
            summaryText: '抢庄牛牛本局结算',
            peerDeltas: peers,
          });
        }
        prevNiuniuPhaseRef.current = phase;
      })
    );

    // 4. Zhajinhua snapshot round completion
    unsubs.push(
      socketClient.on('s2c_zjh_snapshot', (snap: {
        phase?: string;
        seats?: Array<{ playerId: string; nickname: string; roundDelta?: number; isBot?: boolean } | null>;
      }) => {
        const phase = snap?.phase || '';
        if (
          (phase === 'SETTLE' || phase === 'ROUND_RESULT') &&
          prevZjhPhaseRef.current !== 'SETTLE' &&
          prevZjhPhaseRef.current !== 'ROUND_RESULT' &&
          Array.isArray(snap?.seats)
        ) {
          const validSeats = snap.seats.filter(Boolean) as Array<{
            playerId: string;
            nickname: string;
            roundDelta?: number;
            isBot?: boolean;
          }>;
          const me = validSeats.find((s) => !s.isBot || s.playerId === myId) || validSeats[0];
          const peers = validSeats
            .filter((s) => s !== me)
            .map((s) => ({ name: s.nickname, delta: s.roundDelta ?? 0 }));
          roomCardSessionHub.recordRoundSettlement({
            heroDelta: me?.roundDelta ?? 0,
            heroName: me?.nickname,
            summaryText: '经典金花本局结算',
            peerDeltas: peers,
          });
        }
        prevZjhPhaseRef.current = phase;
      })
    );

    // 5. Lao Yan Cai snapshot round completion
    unsubs.push(
      socketClient.on('s2c_lyc_snapshot', (snap: {
        phase?: string;
        seats?: Array<{ playerId: string; nickname: string; roundDelta?: number; isBot?: boolean } | null>;
      }) => {
        const phase = snap?.phase || '';
        if (
          phase === 'ROUND_RESULT' &&
          prevLycPhaseRef.current !== 'ROUND_RESULT' &&
          Array.isArray(snap?.seats)
        ) {
          const validSeats = snap.seats.filter(Boolean) as Array<{
            playerId: string;
            nickname: string;
            roundDelta?: number;
            isBot?: boolean;
          }>;
          const me = validSeats.find((s) => !s.isBot || s.playerId === myId) || validSeats[0];
          const peers = validSeats
            .filter((s) => s !== me)
            .map((s) => ({ name: s.nickname, delta: s.roundDelta ?? 0 }));
          roomCardSessionHub.recordRoundSettlement({
            heroDelta: me?.roundDelta ?? 0,
            heroName: me?.nickname,
            summaryText: '云南捞腌菜本局结算',
            peerDeltas: peers,
          });
        }
        prevLycPhaseRef.current = phase;
      })
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [activeRoomId, activeSession]);

  if (!activeRoomId) return null;

  const isRoomCardMatch = Boolean(
    activeSession &&
      (!gameType || activeSession.config.gameType === gameType)
  );

  const handleCopyRoomCode = () => {
    if (!activeSession) return;
    soundEngine.playTap(740);
    navigator.clipboard?.writeText(activeSession.config.roomId).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleDisbandOrSettle = () => {
    if (!activeSession) return;
    soundEngine.playTap(740);
    if (activeSession.roundHistory.length === 0) {
      const res = roomCardSessionHub.disbandOrSettleActiveSession();
      onShowNotice?.(res.message);
      onLeaveRoom?.();
    } else {
      roomCardSessionHub.disbandOrSettleActiveSession();
      setShowGrandModal(true);
    }
  };

  return (
    <>
      {/* Clean Single-Line Room Card Progress Bar */}
      {isRoomCardMatch && activeSession && (
        <div
          className="pointer-events-auto fixed top-1.5 left-1/2 z-[65] -translate-x-1/2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-1 text-[11px] text-slate-800 shadow-xs backdrop-blur-xs select-none"
          style={{
            marginTop: 'env(safe-area-inset-top, 0px)',
          }}
        >
          <span className="font-mono tabular-nums font-black text-slate-900 whitespace-nowrap">
            房号 #{activeSession.config.roomId}
          </span>

          <button
            type="button"
            onClick={handleCopyRoomCode}
            className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            {copiedCode ? '已复制' : '复制'}
          </button>

          <span className="text-slate-300">|</span>

          <span className="font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
            第 {Math.min(activeSession.currentRound, activeSession.config.totalRounds)}/
            {activeSession.config.totalRounds} 局
          </span>

          <span className="hidden sm:inline text-slate-300">|</span>

          <span className="hidden sm:inline text-[10px] font-bold text-slate-500 whitespace-nowrap">
            {PAY_MODE_LABELS[activeSession.config.payMode]} ·{' '}
            {ESCROW_STATUS_LABELS[activeSession.escrowState || 'FROZEN']}
          </span>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(740);
              setShowGrandModal(true);
            }}
            className="rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            战报
          </button>

          <button
            type="button"
            onClick={handleDisbandOrSettle}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white active:scale-95 cursor-pointer whitespace-nowrap"
          >
            {activeSession.roundHistory.length === 0 ? '解散退卡' : '总结算'}
          </button>
        </div>
      )}

      {/* Room Card Multi-Round Grand Settlement Modal */}
      {isRoomCardMatch && activeSession && (
        <RoomCardGrandSettlementModal
          open={showGrandModal}
          session={activeSession}
          portalMode="fixed"
          onClose={() => setShowGrandModal(false)}
          onPlayAgainSameRoom={() => {
            const res = roomCardSessionHub.restartSameRoomWithPlayers();
            setShowGrandModal(false);
            if (!res.ok) {
              onShowNotice?.(res.message);
            } else {
              onShowNotice?.(`已开启新房间 #${res.session?.config.roomId}`);
              gameControlHub.requestSwitchTable(gameType);
            }
          }}
          onExitToHall={() => {
            setShowGrandModal(false);
            roomCardSessionHub.clearActiveSession();
            onLeaveRoom?.();
          }}
        />
      )}

      {controlState.isInTableSettingsOpen && (
        <SettingsModal
          inTableMode={true}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          onSwitchTable={() => gameControlHub.requestSwitchTable(gameType)}
          onClose={() => gameControlHub.setInTableSettingsOpen(false)}
        />
      )}
    </>
  );
};
