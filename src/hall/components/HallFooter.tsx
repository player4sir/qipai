import React from 'react';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { hapticEngine } from '../../shared/haptics/HapticEngine';

export interface HallFooterProps {
  roomsCount: number;
  signedInToday: boolean;
  isMobileLandscape?: boolean;
  onOpenFriendRoom: () => void;
  onOpenRooms: () => void;
  onOpenLeaderboard: () => void;
  onOpenRecords: () => void;
  onOpenSignIn: () => void;
}

export const HallFooter: React.FC<HallFooterProps> = ({
  roomsCount,
  signedInToday,
  isMobileLandscape = false,
  onOpenFriendRoom,
  onOpenRooms,
  onOpenLeaderboard,
  onOpenRecords,
  onOpenSignIn,
}) => {
  return (
    <footer
      className={`relative z-20 w-full shrink-0 border-t border-white/15 bg-gradient-to-t from-black/55 via-black/40 to-black/25 px-2 backdrop-blur-md transition-all shadow-[0_-4px_16px_rgba(0,0,0,0.22)] sm:px-4 ${
        isMobileLandscape ? 'h-11 sm:h-12' : 'h-13.5 sm:h-15'
      }`}
      style={{
        paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(0.6rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.6rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Top specular highlight */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/45 to-transparent" />

      <div className="mx-auto flex h-full max-w-3xl items-center justify-around gap-1 sm:gap-2">
        {/* 1. 好友 */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(760);
            hapticEngine.tap();
            onOpenFriendRoom();
          }}
          className="group relative flex flex-1 items-center justify-center py-1 transition-transform duration-100 active:scale-95 cursor-pointer"
          title="好友约局"
        >
          <img
            src="/assets/ui/nav_friend.png"
            alt="好友"
            className={`${
              isMobileLandscape ? 'h-7.5 sm:h-8.5' : 'h-9 sm:h-10 md:h-10.5'
            } w-auto object-contain transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-106 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`}
          />
        </button>

        <div className="h-5 w-px bg-amber-200/20 shrink-0" />

        {/* 2. 牌桌 */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(760);
            hapticEngine.tap();
            onOpenRooms();
          }}
          className="group relative flex flex-1 items-center justify-center py-1 transition-transform duration-100 active:scale-95 cursor-pointer"
          title="公开牌桌"
        >
          <div className="relative inline-flex items-center justify-center">
            <img
              src="/assets/ui/nav_rooms.png"
              alt="牌桌"
              className={`${
                isMobileLandscape ? 'h-7.5 sm:h-8.5' : 'h-9 sm:h-10 md:h-10.5'
              } w-auto object-contain transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-106 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`}
            />
            {roomsCount > 0 && (
              <span className="absolute -top-1 -right-2 rounded-full border border-emerald-200 bg-emerald-500 px-1.5 py-0.2 font-mono text-[9px] font-black text-black shadow">
                {roomsCount}
              </span>
            )}
          </div>
        </button>

        <div className="h-5 w-px bg-amber-200/20 shrink-0" />

        {/* 3. 排行 */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(760);
            hapticEngine.tap();
            onOpenLeaderboard();
          }}
          className="group relative flex flex-1 items-center justify-center py-1 transition-transform duration-100 active:scale-95 cursor-pointer"
          title="富豪排行"
        >
          <img
            src="/assets/ui/nav_rank.png"
            alt="排行"
            className={`${
              isMobileLandscape ? 'h-7.5 sm:h-8.5' : 'h-9 sm:h-10 md:h-10.5'
            } w-auto object-contain transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-106 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`}
          />
        </button>

        <div className="h-5 w-px bg-amber-200/20 shrink-0" />

        {/* 4. 战绩 */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(760);
            hapticEngine.tap();
            onOpenRecords();
          }}
          className="group relative flex flex-1 items-center justify-center py-1 transition-transform duration-100 active:scale-95 cursor-pointer"
          title="战绩复盘"
        >
          <img
            src="/assets/ui/nav_records.png"
            alt="战绩"
            className={`${
              isMobileLandscape ? 'h-7.5 sm:h-8.5' : 'h-9 sm:h-10 md:h-10.5'
            } w-auto object-contain transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-106 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`}
          />
        </button>

        <div className="h-5 w-px bg-amber-200/20 shrink-0" />

        {/* 5. 福利 */}
        <button
          type="button"
          onClick={() => {
            soundEngine.playTap(800);
            hapticEngine.tap();
            onOpenSignIn();
          }}
          className="group relative flex flex-1 items-center justify-center py-1 transition-transform duration-100 active:scale-95 cursor-pointer"
          title="每日福利"
        >
          <div className="relative inline-flex items-center justify-center">
            <img
              src="/assets/ui/nav_fuli.png"
              alt="福利"
              className={`${
                isMobileLandscape ? 'h-7.5 sm:h-8.5' : 'h-9 sm:h-10 md:h-10.5'
              } w-auto object-contain transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-106 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]`}
            />
            {!signedInToday && (
              <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-amber-100 animate-pulse" />
            )}
          </div>
        </button>
      </div>
    </footer>
  );
};

