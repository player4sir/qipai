import React from 'react';
import { ArrowLeft, Copy, Maximize2, Minimize2, Plus, Settings } from 'lucide-react';
import { AvatarSvg } from '../../shared/ui/AvatarSvg';
import type { UserProfile } from '../HallView';

export interface HallHeaderProps {
  profile: UserProfile | null;
  displayNumericId: string;
  isMainPortal: boolean;
  myBeans: number;
  myRoomCards: number;
  isBankruptAlert: boolean;
  isMobileLandscape?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onBackToPortal: () => void;
  onOpenProfile: () => void;
  onClaimRoomCards: () => void;
  onOpenFriendRoom?: () => void;
  onClaimSupply: () => void;
  onOpenSettings: () => void;
  onCopyIdSuccess: (id: string) => void;
}

export const HallHeader: React.FC<HallHeaderProps> = ({
  profile,
  displayNumericId,
  isMainPortal,
  myBeans,
  myRoomCards,
  isBankruptAlert,
  isFullscreen,
  onToggleFullscreen,
  onBackToPortal,
  onOpenProfile,
  onClaimRoomCards,
  onOpenFriendRoom,
  onClaimSupply,
  onOpenSettings,
  onCopyIdSuccess,
}) => {
  return (
    <header
      className="relative z-20 flex w-full shrink-0 items-center justify-center border-b border-white/10 bg-[#151824]/92 px-3 py-1.5 backdrop-blur-md sm:px-5 sm:py-2"
      style={{
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
        {/* Left: Back Button (in Sub-hall) + Player Avatar & ID Pill */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
          {!isMainPortal && (
            <button
              type="button"
              onClick={onBackToPortal}
              title="返回大厅"
              className="flex h-8 sm:h-9 items-center gap-1 rounded-full border border-amber-300/40 bg-[#2a1a10] px-2.5 sm:px-3 text-xs font-extrabold text-amber-200 shadow hover:bg-[#3a2416] active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline sm:inline">返回</span>
            </button>
          )}

          <div
            onClick={onOpenProfile}
            className="flex min-w-0 items-center gap-1.5 sm:gap-2 rounded-full border border-white/15 bg-[#1e2231]/90 py-0.5 pr-2.5 pl-1 cursor-pointer hover:border-amber-300/50 transition-colors"
          >
            <div className="relative h-8 w-8 sm:h-9 sm:w-9 shrink-0 overflow-hidden rounded-full border-2 border-amber-400 bg-[#3b1d0e] shadow-inner">
              <AvatarSvg avatarId={profile?.avatarId || 'noble'} size={34} />
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="max-w-[72px] sm:max-w-[110px] truncate text-[11px] sm:text-xs font-extrabold text-white">
                {profile?.nickname || '棋牌玩家'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard?.writeText(displayNumericId).catch(() => {});
                  onCopyIdSuccess(displayNumericId);
                }}
                className="flex items-center gap-0.5 text-[9px] sm:text-[10px] font-mono text-white/60 hover:text-amber-200 cursor-pointer"
              >
                <span>ID:{displayNumericId}</span>
                <Copy className="h-2.5 w-2.5 opacity-75" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Sub-hall Friend Room Button + Room Cards Capsule + Beans Capsule + Utility Icon Buttons */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {!isMainPortal && onOpenFriendRoom && (
            <button
              type="button"
              onClick={onOpenFriendRoom}
              className="flex h-7 sm:h-8 items-center gap-1 rounded-full border border-amber-300/60 bg-gradient-to-b from-amber-500 to-amber-600 px-2.5 sm:px-3 text-[11px] sm:text-xs font-black text-white shadow hover:brightness-105 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>好友约局</span>
            </button>
          )}

          {/* Room Cards Capsule */}
          <div
            onClick={onClaimRoomCards}
            title="打开房卡中心与账本明细"
            className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-white/15 bg-[#0f121b]/90 py-0.5 pr-1 pl-1.5 shadow-inner hover:border-amber-300/50 transition-colors cursor-pointer"
          >
            <img
              src="/assets/ui/zjm_icon_jinka.png"
              alt="房卡"
              className="h-4 w-4 sm:h-4.5 sm:w-4.5 shrink-0 object-contain"
            />
            <span className="px-0.5 font-mono text-[11px] sm:text-xs font-black text-white tabular-nums">
              {myRoomCards}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClaimRoomCards();
              }}
              title="房卡中心与免费补给"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-300 to-amber-500 text-[#1b0e04] shadow hover:brightness-110 active:scale-95 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* Cumulative Score Capsule */}
          <div
            title="累计对局积分"
            className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-white/15 bg-[#0f121b]/90 py-1 px-2.5 shadow-inner"
          >
            <span className="text-[10px] sm:text-[11px] font-bold text-white/60">积分</span>
            <span className="font-mono text-[11px] sm:text-xs font-black text-amber-300 tabular-nums">
              {myBeans > 0 ? `+${myBeans.toLocaleString()}` : myBeans.toLocaleString()}
            </span>
          </div>

          {/* Fullscreen Button */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? '退出全屏' : '全屏'}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#222738] text-amber-300 shadow hover:bg-[#2d344b] active:scale-95 cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="设置"
            className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#222738] text-white/90 shadow hover:bg-[#2d344b] active:scale-95 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
