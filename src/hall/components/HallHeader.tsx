import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, Wifi } from 'lucide-react';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';
import { socketClient } from '../../shared/network/SocketClient';
import { AvatarSvg } from '../../shared/ui/AvatarSvg';
import { PortalStageType, UserProfile } from '../HallView';

export interface HallHeaderProps {
  profile: UserProfile | null;
  displayNumericId: string;
  isMainPortal: boolean;
  portalStage?: PortalStageType;
  myBeans: number;
  myRoomCards: number;
  isBankruptAlert: boolean;
  isMobileLandscape?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onBackToPortal: () => void;
  onOpenProfile: () => void;
  onClaimRoomCards: () => void;
  onClaimSupply: () => void;
  onOpenSettings: () => void;
  onOpenFriendRoom?: () => void;
  onCopyIdSuccess?: (id: string) => void;
}

const SUBHALL_TITLES: Record<PortalStageType, string> = {
  main_portal: '棋牌大厅',
  ddz_subhall: '斗地主专区',
  mahjong_subhall: '普洱麻将专区',
  niuniu_subhall: '抢庄斗牛专区',
  zhajinhua_subhall: '经典金花专区',
  laoyancai_subhall: '云南捞腌菜专区',
};

export const HallHeader: React.FC<HallHeaderProps> = ({
  profile,
  displayNumericId,
  isMainPortal,
  portalStage = 'main_portal',
  myRoomCards,
  isMobileLandscape = false,
  onBackToPortal,
  onOpenProfile,
  onClaimRoomCards,
  onClaimSupply,
  onOpenSettings,
  onCopyIdSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [rttMs, setRttMs] = useState<number>(() => socketClient.getRttMs() || 22);
  const [reconnecting, setReconnecting] = useState<boolean>(false);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      socketClient.on('socket_heartbeat', (data: { rttMs?: number }) => {
        if (typeof data?.rttMs === 'number') {
          setRttMs(data.rttMs);
        }
        setReconnecting(false);
      })
    );
    unsubs.push(socketClient.on('socket_reconnecting', () => setReconnecting(true)));
    unsubs.push(socketClient.on('socket_disconnected', () => setReconnecting(true)));
    unsubs.push(socketClient.on('socket_connected', () => setReconnecting(false)));
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playTap(820);
    hapticEngine.tap();

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(displayNumericId);
      } else {
        const ta = document.createElement('textarea');
        ta.value = displayNumericId;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      // Ignore clipboard permission errors in restricted iframes
    }

    setCopied(true);
    onCopyIdSuccess?.(displayNumericId);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const rttColor = reconnecting
    ? 'text-rose-400'
    : rttMs < 85
    ? 'text-emerald-400'
    : rttMs < 180
    ? 'text-amber-300'
    : 'text-rose-400';

  return (
    <header
      className={`relative z-20 w-full max-w-full shrink-0 border-b border-amber-200/20 bg-gradient-to-b from-[#1a0f08]/78 via-[#1a0f08]/52 to-transparent px-2.5 backdrop-blur-md transition-all sm:px-5 ${
        isMobileLandscape ? 'h-11 sm:h-12' : 'h-13 sm:h-15'
      }`}
      style={{
        paddingTop: 'max(0.15rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.65rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.65rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-between gap-2 sm:gap-4">
        {/* ZONE 1 (LEFT): Player Profile in Main Portal / Back Button + Title in Sub-Halls */}
        <div className="flex min-w-0 items-center justify-start gap-2 sm:gap-3">
          {!isMainPortal ? (
            <>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap(680);
                  hapticEngine.tap();
                  onBackToPortal();
                }}
                className="group flex h-8.5 items-center justify-center gap-1.5 rounded-full border border-amber-200/35 bg-[#1e120a]/85 px-3 text-white shadow-md backdrop-blur-xs transition-all hover:border-amber-300 hover:bg-[#2b190e] active:scale-95 sm:h-9.5 sm:px-3.5 cursor-pointer"
                title="返回棋牌主大厅"
              >
                <img
                  src="/assets/ui/btn_back.png"
                  alt="返回"
                  className="h-3.5 w-3.5 shrink-0 object-contain drop-shadow sm:h-4 sm:w-4"
                />
                <span className="text-xs font-extrabold tracking-wide whitespace-nowrap text-amber-100">
                  大厅
                </span>
              </button>
              <span className="h-4 w-px bg-amber-200/20 shrink-0" />
              <h1 className="font-display text-sm sm:text-base font-black tracking-wide text-amber-100 whitespace-nowrap truncate drop-shadow-xs">
                {SUBHALL_TITLES[portalStage] || '专场选桌'}
              </h1>
            </>
          ) : (
            profile && (
              <div className="flex max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-full border border-amber-200/30 bg-gradient-to-r from-[#1c120c]/88 via-[#261810]/82 to-[#1c120c]/75 py-0.5 pr-3 pl-1 shadow-[0_4px_12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md sm:gap-2.5 sm:py-1 sm:pr-3.5 sm:pl-1.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTap(700);
                    hapticEngine.tap();
                    onOpenProfile();
                  }}
                  className="relative flex h-8.5 w-8.5 shrink-0 items-center justify-center transition-transform hover:scale-105 active:scale-95 sm:h-9.5 sm:w-9.5 cursor-pointer"
                  title="点击修改头像与昵称"
                >
                  <div className="flex h-7.5 w-7.5 items-center justify-center overflow-hidden rounded-full bg-gradient-to-b from-[#3d4659] to-[#1e2330] sm:h-8.5 sm:w-8.5">
                    <AvatarSvg
                      avatarId={profile.avatarId}
                      size={isMobileLandscape ? 26 : 32}
                      animState="idle"
                    />
                  </div>
                  <img
                    src="/assets/ui/head_frame.png"
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)]"
                  />
                </button>

                <div className="flex min-w-0 flex-col justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(700);
                      hapticEngine.tap();
                      onOpenProfile();
                    }}
                    className="max-w-[110px] truncate text-left text-xs leading-tight font-extrabold tracking-tight text-white drop-shadow-xs transition-colors hover:text-amber-200 sm:max-w-[160px] sm:text-sm cursor-pointer"
                    title="点击修改昵称"
                  >
                    {profile.nickname}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="group/id mt-0.5 flex items-center gap-1 text-left whitespace-nowrap transition-opacity active:scale-95 cursor-pointer"
                    title="点击复制玩家 ID"
                  >
                    <span className="font-mono text-[10px] leading-none font-bold text-amber-100/85 tabular-nums sm:text-[11px]">
                      ID:{displayNumericId}
                    </span>
                    {copied ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/25 px-1 py-0.2 text-[9px] leading-none font-extrabold text-emerald-300">
                        <Check className="h-2.5 w-2.5 shrink-0 stroke-[3]" />
                        <span>已复制</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 rounded bg-white/10 px-1 py-0.2 text-[9px] leading-none font-bold text-amber-300/95 group-hover/id:bg-amber-400/25 group-hover/id:text-amber-200">
                        <Copy className="h-2.5 w-2.5 shrink-0" />
                        <span>复制</span>
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        {/* ZONE 2 (CENTER): Clean Room Cards Capsule Only */}
        <div className="flex shrink-0 items-center justify-center">
          <div className="flex h-8 items-center rounded-full border border-amber-200/35 bg-[#1c120c]/88 pr-1 pl-2.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.25)] backdrop-blur-md sm:h-9 sm:pr-1.5 sm:pl-3">
            <img
              src="/assets/ui/zjm_icon_jinka.png"
              alt="房卡"
              className="h-4 w-4 shrink-0 object-contain drop-shadow sm:h-4.5 sm:w-4.5"
            />
            <span className="px-2 font-mono text-xs font-black text-amber-200 tabular-nums sm:text-sm">
              {myRoomCards.toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => {
                onClaimSupply();
                onClaimRoomCards();
              }}
              className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full border border-amber-100/90 bg-gradient-to-b from-[#ffe58f] via-[#f59e0b] to-[#d97706] text-[#261105] shadow hover:brightness-110 active:scale-90 sm:h-6 sm:w-6 cursor-pointer"
              title="补充房卡"
            >
              <Plus className="h-3 w-3 stroke-[3]" />
            </button>
          </div>
        </div>

        {/* ZONE 3 (RIGHT): RTT Signal + Settings Button */}
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <div
            className="hidden h-8 items-center gap-1 rounded-full border border-amber-200/20 bg-[#1c120c]/75 px-2.5 text-[11px] backdrop-blur-md md:flex"
            title="实时网络延迟"
          >
            <Wifi className={`h-3 w-3 ${rttColor}`} />
            <span className={`font-mono font-bold tabular-nums ${rttColor}`}>
              {reconnecting ? '重连中' : `${rttMs}ms`}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(760);
              hapticEngine.tap();
              onOpenSettings();
            }}
            className="group flex h-8 items-center justify-center gap-1.5 rounded-full border border-amber-200/30 bg-[#1c120c]/85 px-2.5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-[#2b190e] active:scale-95 sm:h-9 sm:px-3 cursor-pointer"
            title="系统设置"
          >
            <img
              src="/assets/ui/zjm_icon_shezhi.png"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/assets/ui/icon_setting.png';
              }}
              alt="设置"
              className="h-4 w-4 shrink-0 object-contain drop-shadow transition-transform duration-300 group-hover:rotate-45"
            />
            <span className="hidden text-xs font-extrabold tracking-wide whitespace-nowrap text-white sm:inline">
              设置
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
