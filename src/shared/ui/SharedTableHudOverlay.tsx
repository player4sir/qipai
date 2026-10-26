import React, { useEffect, useMemo, useState } from 'react';
import {
  Coffee,
  Flower2,
  ThumbsUp,
  X,
} from 'lucide-react';
import { soundEngine } from '../audio/SoundEngine';
import { hapticEngine } from '../haptics/HapticEngine';
import { socketClient } from '../network/SocketClient';
import {
  effectCoordinator,
  EffectPriority,
  useEffectCoordinator,
} from '../EffectCoordinator';
import { computeRebuyOptions } from '../roomcard/RoomCardSystem';

export interface SharedTableHudOverlayProps {
  activeRoomId: string | null;
  gameType: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onShowNotice?: (msg: string) => void;
  onLeaveRoom?: () => void;
}

type QuickIconKey = 'flame' | 'sparkles' | 'thumbsup' | 'shield' | 'coffee' | 'trophy';
export type InteractivePropType = 'flower' | 'tea' | 'like' | 'ingot';

interface IncomingChatBubble {
  id: string;
  playerId: string;
  seatIndex: number;
  nickname: string;
  text: string;
  iconKey?: QuickIconKey;
}

interface ActiveFlyingProp {
  id: string;
  fromSeat: number;
  toSeat: number;
  propType: InteractivePropType;
  fromNickname?: string;
  toNickname?: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const QUICK_CHAT_PRESETS: Array<{ iconKey: QuickIconKey; text: string }> = [
  { iconKey: 'flame', text: '快点吧，我等得花儿都谢了！' },
  { iconKey: 'sparkles', text: '好牌气势如虹，这把稳了！' },
  { iconKey: 'thumbsup', text: '各位牌友手下留情，合作愉快！' },
  { iconKey: 'shield', text: '底牌在手，稳扎稳打！' },
  { iconKey: 'coffee', text: '喝杯滇红定定神，咱们再来一局！' },
  { iconKey: 'trophy', text: '打得漂亮，痛快淋漓！' },
];

const INTERACTIVE_PROPS: Array<{
  type: InteractivePropType;
  label: string;
}> = [
  { type: 'flower', label: '赠鲜花' },
  { type: 'tea', label: '敬香茗' },
  { type: 'like', label: '赞好牌' },
  { type: 'ingot', label: '赐元宝' },
];

function renderPropGraphic(propType: InteractivePropType, sizeClass = 'h-6 w-6') {
  switch (propType) {
    case 'flower':
      return <Flower2 className={`${sizeClass} text-rose-400 drop-shadow-[0_2px_8px_rgba(244,63,94,0.65)]`} />;
    case 'tea':
      return <Coffee className={`${sizeClass} text-emerald-300 drop-shadow-[0_2px_8px_rgba(52,211,153,0.65)]`} />;
    case 'like':
      return <ThumbsUp className={`${sizeClass} text-amber-300 drop-shadow-[0_2px_8px_rgba(251,191,36,0.65)]`} />;
    case 'ingot':
      return (
        <img
          src="/assets/ui/csr_yuanbao_xiao.png"
          alt="元宝"
          className={`${sizeClass} object-contain drop-shadow-[0_2px_8px_rgba(251,191,36,0.75)]`}
        />
      );
  }
}

function getRelativeSeatAnchor(relSeat: number, totalSeats: number): { x: number; y: number } {
  if (totalSeats === 4) {
    if (relSeat === 1) return { x: 84, y: 46 };
    if (relSeat === 2) return { x: 50, y: 16 };
    if (relSeat === 3) return { x: 16, y: 46 };
    return { x: 24, y: 82 };
  }
  if (totalSeats === 5) {
    if (relSeat === 1) return { x: 84, y: 58 };
    if (relSeat === 2) return { x: 78, y: 24 };
    if (relSeat === 3) return { x: 22, y: 24 };
    if (relSeat === 4) return { x: 16, y: 58 };
    return { x: 28, y: 82 };
  }
  if (relSeat === 1) return { x: 82, y: 34 };
  if (relSeat === 2) return { x: 18, y: 34 };
  return { x: 24, y: 82 };
}

export const SharedTableHudOverlay: React.FC<SharedTableHudOverlayProps> = ({
  activeRoomId,
  gameType,
  onShowNotice,
  onLeaveRoom,
}) => {
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [isTrusteeship, setIsTrusteeship] = useState<boolean>(false);
  const [showChatMenu, setShowChatMenu] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<'chat' | 'props'>('chat');
  const [mySeatIndex, setMySeatIndex] = useState<number>(0);
  const [chatBubbles, setChatBubbles] = useState<IncomingChatBubble[]>([]);
  const [flyingProps, setFlyingProps] = useState<ActiveFlyingProp[]>([]);
  const [lastPropSentAt, setLastPropSentAt] = useState<number>(0);

  // Commercial Room Card Escrow & Table Score State
  const [baseScore, setBaseScore] = useState<number>(100);
  const [initialScore, setInitialScore] = useState<number>(2000);
  const [myTableScore, setMyTableScore] = useState<number>(2000);
  const [showRebuyModal, setShowRebuyModal] = useState<boolean>(false);
  const [isBankruptTriggered, setIsBankruptTriggered] = useState<boolean>(false);
  const [rebuySubmitting, setRebuySubmitting] = useState<boolean>(false);
  const [isSettlementActive, setIsSettlementActive] = useState<boolean>(false);

  const totalSeats = gameType === 'mahjong' ? 4 : gameType === 'ddz' ? 3 : 5;
  const isDdz = gameType === 'ddz';
  const coordinatorSnap = useEffectCoordinator();

  const [standardRebuyOpt, doubleRebuyOpt] = useMemo(
    () => computeRebuyOptions(baseScore, initialScore),
    [baseScore, initialScore]
  );

  useEffect(() => {
    setIsTrusteeship(false);
    setShowChatMenu(false);
    setShowRebuyModal(false);
    setIsBankruptTriggered(false);
    setIsSettlementActive(false);
    const sceneKey = gameType || 'hall';
    effectCoordinator.setActiveScene(sceneKey);
    return () => {
      effectCoordinator.clearScene(sceneKey);
    };
  }, [activeRoomId, gameType]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      socketClient.on('socket_heartbeat', () => {
        setIsReconnecting(false);
      })
    );

    unsubs.push(
      socketClient.on('socket_reconnecting', () => {
        setIsReconnecting(true);
      })
    );

    unsubs.push(
      socketClient.on('socket_disconnected', () => {
        setIsReconnecting(true);
      })
    );

    unsubs.push(
      socketClient.on('socket_connected', () => {
        setIsReconnecting(false);
      })
    );

    unsubs.push(
      socketClient.on(
        's2c_rc_session_sync',
        (payload: {
          session?: {
            status?: 'waiting_first_round' | 'in_progress' | 'grand_settled';
            config?: {
              baseScore?: number;
              initialScore?: number;
            };
            participants?: Array<{
              playerId: string;
              currentScore?: number;
            }>;
          };
        }) => {
          const sess = payload?.session;
          if (!sess) return;
          if (typeof sess.config?.baseScore === 'number' && sess.config.baseScore > 0) {
            setBaseScore(sess.config.baseScore);
          }
          if (typeof sess.config?.initialScore === 'number' && sess.config.initialScore > 0) {
            setInitialScore(sess.config.initialScore);
          }
          const myId = socketClient.getPlayerId();
          const me = sess.participants?.find((p) => p.playerId === myId);
          if (me && typeof me.currentScore === 'number') {
            setMyTableScore(me.currentScore);
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_bankruptcy_prompt',
        (data: {
          roomId?: string;
          gameType?: string;
          currentScore?: number;
          baseScore?: number;
          initialScore?: number;
        }) => {
          if (typeof data?.currentScore === 'number') {
            setMyTableScore(data.currentScore);
          }
          if (typeof data?.baseScore === 'number' && data.baseScore > 0) {
            setBaseScore(data.baseScore);
          }
          if (typeof data?.initialScore === 'number' && data.initialScore > 0) {
            setInitialScore(data.initialScore);
          }
          soundEngine.playTap(420);
          hapticEngine.tap();
          setIsBankruptTriggered(true);
          setShowRebuyModal(true);
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_rc_rebuy_success',
        (data: {
          roomId?: string;
          addedScore?: number;
          newTableScore?: number;
          cardCost?: number;
        }) => {
          setRebuySubmitting(false);
          if (typeof data?.newTableScore === 'number') {
            setMyTableScore(data.newTableScore);
          }
          setIsBankruptTriggered(false);
          setShowRebuyModal(false);
          soundEngine.playPowerChime(2);
          hapticEngine.tap();
          if (data?.addedScore) {
            onShowNotice?.(
              `补分成功：消耗 ${data.cardCost ?? 1} 张房卡，补充 +${data.addedScore.toLocaleString()} 台面积分`
            );
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_trusteeship_changed',
        (data: { playerId?: string; seatIndex?: number; trusteeship?: boolean }) => {
          if (!data?.playerId || data.playerId === socketClient.getPlayerId()) {
            setIsTrusteeship(Boolean(data?.trusteeship));
            if (typeof data?.seatIndex === 'number') {
              setMySeatIndex(data.seatIndex);
            }
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_mj_snapshot',
        (snap: {
          phase?: string;
          mySeatId?: number;
          baseScore?: number;
          initialScore?: number;
          seats?: Array<{ seatId?: number; playerId?: string; beans?: number }>;
        }) => {
          setIsSettlementActive(
            snap?.phase === 'SETTLEMENT' || snap?.phase === 'CHA_DA_JIAO'
          );
          if (typeof snap?.mySeatId === 'number') {
            setMySeatIndex(snap.mySeatId);
          }
          if (typeof snap?.baseScore === 'number' && snap.baseScore > 0) {
            setBaseScore(snap.baseScore);
          }
          if (typeof snap?.initialScore === 'number' && snap.initialScore > 0) {
            setInitialScore(snap.initialScore);
          }
          const myId = socketClient.getPlayerId();
          const me =
            snap?.seats?.find((s) => s.playerId === myId) ??
            (typeof snap?.mySeatId === 'number' ? snap?.seats?.[snap.mySeatId] : undefined);
          if (me && typeof me.beans === 'number') {
            setMyTableScore(me.beans);
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_niuniu_snapshot',
        (snap: {
          phase?: string;
          mySeatId?: number;
          baseScore?: number;
          initialScore?: number;
          seats?: Array<{ seatId?: number; playerId?: string; beans?: number }>;
        }) => {
          setIsSettlementActive(snap?.phase === 'ROUND_RESULT');
          if (typeof snap?.mySeatId === 'number') {
            setMySeatIndex(snap.mySeatId);
          }
          if (typeof snap?.baseScore === 'number' && snap.baseScore > 0) {
            setBaseScore(snap.baseScore);
          }
          if (typeof snap?.initialScore === 'number' && snap.initialScore > 0) {
            setInitialScore(snap.initialScore);
          }
          const myId = socketClient.getPlayerId();
          const me =
            snap?.seats?.find((s) => s.playerId === myId) ??
            (typeof snap?.mySeatId === 'number' ? snap?.seats?.[snap.mySeatId] : undefined);
          if (me && typeof me.beans === 'number') {
            setMyTableScore(me.beans);
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_lyc_snapshot',
        (snap: {
          phase?: string;
          mySeatId?: number;
          baseScore?: number;
          initialScore?: number;
          seats?: Array<{ seatId?: number; playerId?: string; beans?: number }>;
        }) => {
          setIsSettlementActive(snap?.phase === 'ROUND_RESULT');
          if (typeof snap?.mySeatId === 'number') {
            setMySeatIndex(snap.mySeatId);
          }
          if (typeof snap?.baseScore === 'number' && snap.baseScore > 0) {
            setBaseScore(snap.baseScore);
          }
          if (typeof snap?.initialScore === 'number' && snap.initialScore > 0) {
            setInitialScore(snap.initialScore);
          }
          const myId = socketClient.getPlayerId();
          const me =
            snap?.seats?.find((s) => s.playerId === myId) ??
            (typeof snap?.mySeatId === 'number' ? snap?.seats?.[snap.mySeatId] : undefined);
          if (me && typeof me.beans === 'number') {
            setMyTableScore(me.beans);
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_zjh_snapshot',
        (snap: {
          phase?: string;
          mySeat?: number;
          myTrusteeship?: boolean;
          baseScore?: number;
          initialScore?: number;
          seats?: Array<{ seatIndex?: number; playerId?: string; beans?: number }>;
        }) => {
          setIsSettlementActive(snap?.phase === 'RESULT');
          if (typeof snap?.mySeat === 'number' && snap.mySeat >= 0) {
            setMySeatIndex(snap.mySeat);
          }
          if (typeof snap?.myTrusteeship === 'boolean') {
            setIsTrusteeship(snap.myTrusteeship);
          }
          if (typeof snap?.baseScore === 'number' && snap.baseScore > 0) {
            setBaseScore(snap.baseScore);
          }
          if (typeof snap?.initialScore === 'number' && snap.initialScore > 0) {
            setInitialScore(snap.initialScore);
          }
          const myId = socketClient.getPlayerId();
          const me =
            snap?.seats?.find((s) => s.playerId === myId) ??
            (typeof snap?.mySeat === 'number' ? snap?.seats?.[snap.mySeat] : undefined);
          if (me && typeof me.beans === 'number') {
            setMyTableScore(me.beans);
          }
        }
      )
    );

    unsubs.push(
      socketClient.on('s2c_game_over', () => {
        setIsSettlementActive(true);
      })
    );

    unsubs.push(
      socketClient.on('s2c_game_started', () => {
        setIsSettlementActive(false);
      })
    );

    unsubs.push(
      socketClient.on(
        's2c_room_state',
        (state: {
          baseScore?: number;
          initialScore?: number;
          players?: Array<{
            playerId: string;
            seatIndex?: number;
            trusteeship?: boolean;
            beans?: number;
          }>;
        }) => {
          if (typeof state?.baseScore === 'number' && state.baseScore > 0) {
            setBaseScore(state.baseScore);
          }
          if (typeof state?.initialScore === 'number' && state.initialScore > 0) {
            setInitialScore(state.initialScore);
          }
          const me = state?.players?.find((p) => p.playerId === socketClient.getPlayerId());
          if (me) {
            if (typeof me.trusteeship === 'boolean') {
              setIsTrusteeship(me.trusteeship);
            }
            if (typeof me.seatIndex === 'number') {
              setMySeatIndex(me.seatIndex);
            }
            if (typeof me.beans === 'number') {
              setMyTableScore(me.beans);
            }
          }
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_chat_message',
        (msg: {
          playerId: string;
          seatIndex: number;
          nickname: string;
          text?: string;
          emoji?: string;
        }) => {
          if (!msg?.text && !msg?.emoji) return;
          soundEngine.playTap(880);
          const bubbleId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const entry: IncomingChatBubble = {
            id: bubbleId,
            playerId: msg.playerId,
            seatIndex: msg.seatIndex,
            nickname: msg.nickname || '牌友',
            text: msg.text || '',
          };
          setChatBubbles((prev) => [...prev.slice(-3), entry]);
          window.setTimeout(() => {
            setChatBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
          }, 3400);
        }
      )
    );

    unsubs.push(
      socketClient.on(
        's2c_prop_thrown',
        (evt: {
          fromSeat: number;
          toSeat: number;
          propType: string;
          fromNickname?: string;
          toNickname?: string;
        }) => {
          if (gameType === 'ddz') return;

          const fromRel = (evt.fromSeat - mySeatIndex + totalSeats) % totalSeats;
          const toRel = (evt.toSeat - mySeatIndex + totalSeats) % totalSeats;
          const startPos = getRelativeSeatAnchor(fromRel, totalSeats);
          const endPos = getRelativeSeatAnchor(toRel, totalSeats);
          const validProps: InteractivePropType[] = ['flower', 'tea', 'like', 'ingot'];
          const normalizedProp: InteractivePropType = validProps.includes(
            evt.propType as InteractivePropType
          )
            ? (evt.propType as InteractivePropType)
            : 'flower';

          const id = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const item: ActiveFlyingProp = {
            id,
            fromSeat: evt.fromSeat,
            toSeat: evt.toSeat,
            propType: normalizedProp,
            fromNickname: evt.fromNickname,
            toNickname: evt.toNickname,
            startX: startPos.x,
            startY: startPos.y,
            endX: endPos.x,
            endY: endPos.y,
          };

          effectCoordinator.enqueue({
            id,
            sceneId: gameType || 'table',
            type: 'prop_throw',
            priority: EffectPriority.AMBIENT,
            channel: 'ambient',
            durationMs: 1350,
            onStart: () => {
              soundEngine.playPowerChime(1);
              hapticEngine.tap();
              setFlyingProps((prev) => [...prev.slice(-4), item]);
              return () => {
                setFlyingProps((prev) => prev.filter((p) => p.id !== id));
              };
            },
          });
        }
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [gameType, mySeatIndex, totalSeats, onShowNotice]);

  const handleExecuteRebuy = (multiplier: 1 | 2) => {
    if (!activeRoomId || rebuySubmitting) return;
    soundEngine.playTap(840);
    hapticEngine.tap();
    setRebuySubmitting(true);
    socketClient.emit('c2s_rc_rebuy', {
      roomId: activeRoomId,
      multiplier,
    });
    window.setTimeout(() => setRebuySubmitting(false), 1600);
  };

  const handleQuickFreeRoomCards = () => {
    soundEngine.playPowerChime(2);
    hapticEngine.tap();
    socketClient.emit('c2s_exchange_room_cards', { cardCount: 5, beanCost: 0 });
    onShowNotice?.('已为您免费补充 +5 张房卡');
  };

  const handleToggleTrusteeship = (nextValue?: boolean) => {
    soundEngine.playTap(740);
    hapticEngine.tap();
    const target = nextValue !== undefined ? nextValue : !isTrusteeship;
    setIsTrusteeship(target);
    socketClient.emit('c2s_toggle_trusteeship', { trusteeship: target });
  };

  const handleSendQuickChat = (preset: { iconKey: QuickIconKey; text: string }) => {
    soundEngine.playTap(840);
    hapticEngine.tap();
    setShowChatMenu(false);
    socketClient.emit('c2s_send_chat', {
      emoji: preset.iconKey,
      text: preset.text,
    });
  };

  const handleThrowPropToNextOpponent = (propType: InteractivePropType, targetRelOffset = 1) => {
    const now = Date.now();
    if (now - lastPropSentAt < 750) return;
    setLastPropSentAt(now);
    soundEngine.playTap(860);
    hapticEngine.tap();
    setShowChatMenu(false);
    const targetSeat = (mySeatIndex + targetRelOffset) % totalSeats;
    socketClient.emit('c2s_throw_prop', {
      targetSeat,
      propType,
    });
  };

  const isScoreLow = myTableScore < baseScore;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden select-none">
      <style>{`
        @keyframes hudPropArcFlight {
          0% {
            transform: translate(-50%, -50%) scale(0.65) rotate(-18deg);
            opacity: 0.2;
          }
          18% {
            opacity: 1;
          }
          50% {
            transform: translate(calc(-50% + var(--mid-dx)), calc(-50% + var(--mid-dy) - 48px)) scale(1.25) rotate(12deg);
            opacity: 1;
          }
          82% {
            transform: translate(calc(-50% + var(--end-dx)), calc(-50% + var(--end-dy))) scale(1.35) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(calc(-50% + var(--end-dx)), calc(-50% + var(--end-dy))) scale(1.65);
            opacity: 0;
          }
        }
      `}</style>

      {coordinatorSnap.maskConfig.level !== 'none' && (
        <div
          className="pointer-events-none fixed inset-0 transition-opacity duration-200"
          style={{
            backgroundColor: coordinatorSnap.maskConfig.tintColor,
            backdropFilter:
              coordinatorSnap.maskConfig.blurPx > 0
                ? `blur(${coordinatorSnap.maskConfig.blurPx}px)`
                : undefined,
            zIndex: coordinatorSnap.maskConfig.zIndex,
          }}
        />
      )}

      {/* 1. Top-Center Silent Reconnection Banner */}
      {isReconnecting && (
        <div className="pointer-events-auto fixed top-2.5 left-1/2 z-50 flex -translate-x-1/2 items-center rounded-xl border border-white/12 bg-[#12171B]/95 px-3.5 py-1.5 text-xs font-bold text-[#F3F4F6] shadow-lg backdrop-blur-md">
          <span className="whitespace-nowrap">网络重连中...</span>
        </div>
      )}

      {/* 2. Incoming Chat Broadcast Bubbles */}
      {!isDdz && !isSettlementActive && chatBubbles.length > 0 && (
        <div className="pointer-events-none fixed top-14 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {chatBubbles.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-[#12171B]/92 px-3 py-1 text-xs text-[#F3F4F6] shadow-md backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            >
              <span className="font-bold text-[#E5B85B]">{b.nickname}：</span>
              <span>{b.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* 3. Parabolic Interactive Prop Flight Layer */}
      {!isDdz &&
        !isSettlementActive &&
        flyingProps.map((prop) => {
          const dxVw = prop.endX - prop.startX;
          const dyVh = prop.endY - prop.startY;
          return (
            <div
              key={prop.id}
              className="pointer-events-none fixed z-50 flex flex-col items-center justify-center"
              style={
                {
                  left: `${prop.startX}vw`,
                  top: `${prop.startY}vh`,
                  '--mid-dx': `${dxVw * 0.5}vw`,
                  '--mid-dy': `${dyVh * 0.5}vh`,
                  '--end-dx': `${dxVw}vw`,
                  '--end-dy': `${dyVh}vh`,
                  animation: 'hudPropArcFlight 1.25s cubic-bezier(0.22, 1, 0.36, 1) forwards',
                } as React.CSSProperties
              }
            >
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/60 bg-black/55 shadow-[0_0_24px_rgba(251,191,36,0.55)] backdrop-blur-xs">
                <img
                  src="/assets/mahjong/actions/hu_fangshe.png"
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full scale-150 object-contain opacity-75 animate-spin"
                />
                <div className="relative z-10">{renderPropGraphic(prop.propType, 'h-8 w-8')}</div>
              </div>
              {prop.fromNickname && prop.toNickname && (
                <span className="mt-1 rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-bold text-amber-200 whitespace-nowrap shadow">
                  {prop.fromNickname} 赠 {prop.toNickname}
                </span>
              )}
            </div>
          );
        })}

      {/* 4. Bottom-Right Floating Quick-Chat / Props & AI Trusteeship Controls */}
      {!isDdz && !isSettlementActive && (
        <div
          className="pointer-events-auto fixed bottom-2.5 right-2.5 z-40 flex items-center gap-1.5"
          style={{
            bottom: 'max(0.55rem, env(safe-area-inset-bottom, 0px))',
            right: 'max(0.65rem, env(safe-area-inset-right, 0px))',
          }}
        >
          {/* Quick-Chat & Interactive Prop Drawer */}
          <div className="relative">
            {showChatMenu && (
              <div className="absolute right-0 bottom-10 mb-1 w-64 rounded-2xl border border-white/10 bg-[#12171B]/95 p-3 text-[#F3F4F6] shadow-[0_20px_50px_rgba(0,0,0,0.68)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
                <div className="mb-2 flex items-center justify-between border-b border-white/[0.08] pb-1.5">
                  <div className="flex items-center gap-1 rounded-lg bg-black/35 p-0.5 border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setDrawerTab('chat')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        drawerTab === 'chat'
                          ? 'bg-[#D49B35] text-[#111315]'
                          : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                      }`}
                    >
                      快捷语
                    </button>
                    <button
                      type="button"
                      onClick={() => setDrawerTab('props')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                        drawerTab === 'props'
                          ? 'bg-[#D49B35] text-[#111315]'
                          : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                      }`}
                    >
                      互动礼仪
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowChatMenu(false)}
                    aria-label="关闭互动菜单"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {drawerTab === 'chat' ? (
                  <div className="flex flex-col gap-1">
                    {QUICK_CHAT_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendQuickChat(preset)}
                        className="flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-left text-xs font-medium text-[#E5E7EB] transition-colors hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-[#F3F4F6] active:scale-98 cursor-pointer"
                      >
                        <span className="truncate">{preset.text}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {INTERACTIVE_PROPS.map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => handleThrowPropToNextOpponent(item.type, 1)}
                        className="flex items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-xs font-bold text-[#F3F4F6] transition-colors hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 active:scale-95 cursor-pointer"
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(760);
                setShowChatMenu((prev) => !prev);
              }}
              className="flex h-8 items-center rounded-lg border border-white/12 bg-[#12171B]/90 px-3 text-xs font-bold text-[#E5E7EB] shadow-md backdrop-blur-xs transition-all hover:border-white/25 hover:bg-[#1A2128] active:scale-95 whitespace-nowrap cursor-pointer"
              title="牌桌快捷语与互动礼仪"
            >
              <span>互动</span>
            </button>
          </div>

          {/* AI Trusteeship Toggle Button */}
          <button
            type="button"
            onClick={() => handleToggleTrusteeship()}
            className={`flex h-8 items-center rounded-lg border px-3 text-xs font-bold shadow-md backdrop-blur-xs transition-all active:scale-95 whitespace-nowrap cursor-pointer ${
              isTrusteeship
                ? 'border-[#D49B35] bg-[#D49B35] text-[#111315]'
                : 'border-white/12 bg-[#12171B]/90 text-[#E5E7EB] hover:border-white/25 hover:bg-[#1A2128]'
            }`}
            title={isTrusteeship ? '点击取消托管' : '开启托管'}
          >
            <span>{isTrusteeship ? '托管中' : '托管'}</span>
          </button>
        </div>
      )}

      {/* 6. Active AI Trusteeship Banner */}
      {!isDdz && !isSettlementActive && isTrusteeship && (
        <div className="pointer-events-auto fixed bottom-12 left-1/2 z-40 -translate-x-1/2">
          <button
            type="button"
            onClick={() => handleToggleTrusteeship(false)}
            className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/40 bg-[#12171B]/95 px-4 py-2 text-xs font-bold text-[#E5B85B] shadow-xl backdrop-blur-md transition-transform hover:scale-102 active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <span>智能托管中 · 点击恢复手动出牌</span>
          </button>
        </div>
      )}

      {/* 7. Commercial Bankruptcy Protection & Room Card Rebuy Modal */}
      {showRebuyModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150">
          <div
            className="relative flex w-full max-w-[400px] max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-3">
              <h3 className="text-[15px] font-bold tracking-wide text-[#F3F4F6]">
                {isBankruptTriggered || isScoreLow ? '房卡补分续局' : '补充台面积分'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRebuyModal(false)}
                aria-label="关闭面板"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5">
              {/* Current Table Score Metrics */}
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
                <div>
                  <div className="text-[11px] font-medium text-[#9CA3AF]">当前台面积分</div>
                  <div
                    className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
                      isScoreLow ? 'text-rose-400' : 'text-[#F3F4F6]'
                    }`}
                  >
                    {myTableScore.toLocaleString()}
                  </div>
                </div>
                <div className="border-x border-white/[0.07]">
                  <div className="text-[11px] font-medium text-[#9CA3AF]">本桌底分</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#E5B85B] tabular-nums">
                    {baseScore.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-[#9CA3AF]">准入初始分</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-[#F3F4F6] tabular-nums">
                    {initialScore.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Two Commercial Rebuy Tiers */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={rebuySubmitting}
                  onClick={() => handleExecuteRebuy(1)}
                  className="flex flex-col items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center transition-all hover:border-[#D4AF37]/40 active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-[#9CA3AF]">
                    1x {standardRebuyOpt.label}
                  </span>
                  <div className="my-2 font-mono text-base font-bold text-[#E5B85B] tabular-nums">
                    +{standardRebuyOpt.addedScore.toLocaleString()} 分
                  </div>
                  <div className="h-8 px-3 flex items-center justify-center rounded-lg bg-[#D49B35] text-xs font-bold text-[#111315]">
                    消耗 {standardRebuyOpt.cardCost} 张房卡
                  </div>
                </button>

                <button
                  type="button"
                  disabled={rebuySubmitting}
                  onClick={() => handleExecuteRebuy(2)}
                  className="flex flex-col items-center justify-between rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/[0.08] p-3 text-center transition-all hover:border-[#D4AF37]/60 active:scale-98 disabled:opacity-50 cursor-pointer"
                >
                  <span className="rounded-md bg-[#D4AF37]/20 px-2 py-0.5 text-[11px] font-bold text-[#E5B85B]">
                    2x {doubleRebuyOpt.label}
                  </span>
                  <div className="my-2 font-mono text-base font-bold text-[#E5B85B] tabular-nums">
                    +{doubleRebuyOpt.addedScore.toLocaleString()} 分
                  </div>
                  <div className="h-8 px-3 flex items-center justify-center rounded-lg bg-[#D49B35] text-xs font-bold text-[#111315]">
                    消耗 {doubleRebuyOpt.cardCost} 张房卡
                  </div>
                </button>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 sm:px-5 py-2.5">
              {onLeaveRoom && (
                <button
                  type="button"
                  onClick={() => {
                    setShowRebuyModal(false);
                    onLeaveRoom();
                  }}
                  className="h-8.5 min-w-[84px] rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors hover:bg-white/[0.11] active:scale-98 cursor-pointer whitespace-nowrap"
                >
                  离桌结算
                </button>
              )}

              <button
                type="button"
                onClick={handleQuickFreeRoomCards}
                className="h-8.5 min-w-[116px] rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] transition-colors hover:bg-[#E0A842] active:scale-98 cursor-pointer whitespace-nowrap"
              >
                免费补充房卡 (+5)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
