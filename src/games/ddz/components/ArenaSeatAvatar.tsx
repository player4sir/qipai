import React, { useEffect, useRef, useState } from 'react';
import { AvatarSvg, type SpineAnimState } from '../../../shared/ui/AvatarSvg';

export type PlayerLivePresenceState = 'online' | 'trusteeship' | 'offline';

export interface ArenaSeatAvatarProps {
  playerId: string;
  avatarId: string;
  size?: 'md' | 'sm';
  hasRoleAssigned: boolean;
  isLandlord: boolean;
  isCurrentTurn: boolean;
  presenceState: PlayerLivePresenceState;
  animState?: SpineAnimState;
  seatIndex?: number;
}

/**
 * Resolve authentic commercial role portrait sprite once Landlord is determined.
 */
function getRolePortraitSrc(avatarId: string, isLandlord: boolean): string {
  const isFemale = avatarId === 'heroine' || avatarId === 'beier';
  if (isLandlord) {
    return isFemale ? '/assets/ui/avatar_dizhupo.png' : '/assets/ui/avatar_dizhu.png';
  }
  return isFemale ? '/assets/ui/avatar_nongminmei.png' : '/assets/ui/avatar_nongmin.png';
}

/**
 * High-Stakes Arena Seat Avatar with:
 * 1. Real-Player Live Presence Masking (`online` | `trusteeship` | `offline`)
 * 2. Ceremonial Match-Entry Transition Animation when a player takes a seat
 * 3. Smooth Role-Confirmation Shimmer when transitioning from Challenger to Landlord/Peasant
 */
export const ArenaSeatAvatar: React.FC<ArenaSeatAvatarProps> = ({
  playerId,
  avatarId,
  size = 'md',
  hasRoleAssigned,
  isLandlord,
  isCurrentTurn,
  presenceState,
  animState = 'idle',
  seatIndex = 0,
}) => {
  const [isEntering, setIsEntering] = useState(true);
  const [isEntrySweepActive, setIsEntrySweepActive] = useState(true);
  const [isRoleRevealing, setIsRoleRevealing] = useState(false);
  const prevPlayerIdRef = useRef<string | null>(null);
  const prevRoleAssignedRef = useRef<boolean>(hasRoleAssigned);

  // Trigger ceremonial match-entry transition whenever a new playerId takes this seat
  useEffect(() => {
    if (prevPlayerIdRef.current !== playerId) {
      prevPlayerIdRef.current = playerId;
      setIsEntering(true);
      setIsEntrySweepActive(true);
      const enterTimer = window.setTimeout(() => {
        setIsEntering(false);
      }, 35 + seatIndex * 75);
      const sweepTimer = window.setTimeout(() => {
        setIsEntrySweepActive(false);
      }, 720 + seatIndex * 75);
      return () => {
        window.clearTimeout(enterTimer);
        window.clearTimeout(sweepTimer);
      };
    }
  }, [playerId, seatIndex]);

  // Trigger role-reveal golden shimmer when landlord is crowned
  useEffect(() => {
    if (!prevRoleAssignedRef.current && hasRoleAssigned) {
      setIsRoleRevealing(true);
      const timer = window.setTimeout(() => {
        setIsRoleRevealing(false);
      }, 620);
      prevRoleAssignedRef.current = hasRoleAssigned;
      return () => window.clearTimeout(timer);
    }
    prevRoleAssignedRef.current = hasRoleAssigned;
  }, [hasRoleAssigned]);

  const isMd = size === 'md';
  const boxClass = isMd ? 'h-12 w-12' : 'h-10 w-10';
  const svgSize = isMd ? 46 : 38;

  return (
    <div
      data-presence={presenceState}
      className={`relative ${boxClass} shrink-0 select-none transition-all duration-500 ease-out ${
        isEntering
          ? 'scale-90 opacity-0 translate-y-2'
          : isRoleRevealing
            ? 'scale-105 opacity-100 translate-y-0'
            : 'scale-100 opacity-100 translate-y-0'
      }`}
    >
      {/* Active-Turn Ceremonial Golden Halo */}
      {isCurrentTurn && presenceState !== 'offline' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-2xl border border-[#F3E5AB]/85 shadow-[0_0_18px_rgba(212,175,55,0.55)] animate-pulse"
        />
      )}

      {/* Main Medallion Frame */}
      <div
        className={`relative h-full w-full overflow-hidden rounded-xl border transition-all duration-300 ${
          presenceState === 'offline'
            ? 'border-rose-500/50 bg-[#090D12]'
            : presenceState === 'trusteeship'
              ? 'border-amber-400/75 bg-gradient-to-b from-[#1E1910] to-[#0B1116]'
              : isCurrentTurn
                ? 'border-[#F3E5AB] bg-gradient-to-b from-[#2E2012] to-[#0D1318]'
                : isLandlord
                  ? 'border-[#D4AF37]/75 bg-gradient-to-b from-[#2A1C11] to-[#0D1318]'
                  : 'border-white/20 bg-gradient-to-b from-[#16222B] to-[#0B1116]'
        } shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_4px_12px_rgba(0,0,0,0.6)]`}
      >
        {/* Portrait Layer (Pre-bidding Spine SVG vs Assigned Role Portrait) */}
        <div
          className={`flex h-full w-full items-center justify-center transition-all duration-300 ${
            presenceState === 'offline'
              ? 'grayscale contrast-75 brightness-75'
              : presenceState === 'trusteeship'
                ? 'brightness-90 saturate-75'
                : ''
          }`}
        >
          {hasRoleAssigned ? (
            <img
              src={getRolePortraitSrc(avatarId, isLandlord)}
              alt={isLandlord ? '地主' : '农民'}
              className="h-full w-full object-cover object-top"
              draggable={false}
            />
          ) : (
            <AvatarSvg
              avatarId={avatarId}
              size={svgSize}
              isLandlord={false}
              animState={animState}
            />
          )}
        </div>

        {/* Gilded Frame Overlay Texture (/assets/ui/head_frame.png) */}
        <img
          src="/assets/ui/head_frame.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-75 mix-blend-screen"
          draggable={false}
        />

        {/* Match-Entry / Role-Reveal Golden Light Sweep */}
        {(isEntrySweepActive || isRoleRevealing) && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-[#F3E5AB]/55 to-transparent animate-pulse"
          />
        )}

        {/* LIVE STATE MASK 1: TRUSTEESHIP (托管实时蒙版) */}
        {presenceState === 'trusteeship' && (
          <div
            aria-label="托管状态蒙版"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between bg-[#070B0E]/72 pt-1.5 backdrop-blur-[1.5px] transition-opacity duration-200"
          >
            {/* Animated AI Tactical Visor Icon */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-[#F3E5AB] drop-shadow-[0_0_6px_rgba(212,175,55,0.8)]"
              fill="none"
            >
              <rect
                x="3.5"
                y="6.5"
                width="17"
                height="11"
                rx="3.5"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="9" cy="12" r="1.6" fill="#FBBF24" className="animate-ping" />
              <circle cx="9" cy="12" r="1.6" fill="#F3E5AB" />
              <circle cx="15" cy="12" r="1.6" fill="#FBBF24" className="animate-ping" />
              <circle cx="15" cy="12" r="1.6" fill="#F3E5AB" />
              <path
                d="M12 3V6.5M7 17.5L5.5 20M17 17.5L18.5 20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>

            <span className="w-full bg-gradient-to-r from-amber-600/95 via-amber-500/95 to-amber-600/95 py-0.5 text-center text-[9px] font-extrabold leading-none tracking-tighter text-[#12171B]">
              托管中
            </span>
          </div>
        )}

        {/* LIVE STATE MASK 2: OFFLINE / RECONNECTING (离线断线重连实时蒙版) */}
        {presenceState === 'offline' && (
          <div
            aria-label="离线状态蒙版"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between bg-[#06090D]/82 pt-1.5 backdrop-blur-[2px] transition-opacity duration-200"
          >
            {/* Animated Reconnecting Radar Arc */}
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 animate-spin text-rose-400"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="7.5"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2"
              />
              <path
                d="M12 4.5A7.5 7.5 0 0 1 19.5 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>

            <span className="w-full bg-rose-600/95 py-0.5 text-center text-[9px] font-extrabold leading-none tracking-tighter text-white">
              断线中
            </span>
          </div>
        )}
      </div>

      {/* Official Landlord / Peasant Role Emblem Badge on Top-Left Corner */}
      {hasRoleAssigned && (
        <img
          src={isLandlord ? '/assets/ui/csr_dizhu.png' : '/assets/ui/csr_nongmin.png'}
          alt={isLandlord ? '地主' : '农民'}
          className={`pointer-events-none absolute -top-1.5 -left-1.5 ${
            isMd ? 'h-5.5 w-5.5' : 'h-4.5 w-4.5'
          } object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] transition-transform duration-300 ${
            isRoleRevealing ? 'scale-125' : 'scale-100'
          }`}
          draggable={false}
        />
      )}

      {/* Real-Time Live Status Indicator Dot on Bottom-Right Corner */}
      <span
        title={
          presenceState === 'offline'
            ? '信号中断 · 正在重连'
            : presenceState === 'trusteeship'
              ? '智能托管代打中'
              : isCurrentTurn
                ? '思考出牌中'
                : '真人实时在线'
        }
        className="pointer-events-none absolute -right-0.5 -bottom-0.5 flex h-3 w-3 items-center justify-center"
      >
        {presenceState === 'offline' ? (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-[#0B1116] bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
        ) : presenceState === 'trusteeship' ? (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-[#0B1116] bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.85)]" />
        ) : isCurrentTurn ? (
          <>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-[#0B1116] bg-[#FBBF24]" />
          </>
        ) : (
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-[#0B1116] bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.75)]" />
        )}
      </span>
    </div>
  );
};

/**
 * Derive canonical live presence state from seat player info.
 */
export function resolvePlayerPresenceState(player: {
  disconnected?: boolean;
  trusteeship?: boolean;
}): PlayerLivePresenceState {
  if (player.disconnected) return 'offline';
  if (player.trusteeship) return 'trusteeship';
  return 'online';
}

/**
 * Ceremonial Matching Placeholder Pod rendered when an opponent seat is awaiting a player.
 */
export const ArenaMatchingSeatPod: React.FC<{
  side: 'left' | 'right';
  onAddBot: () => void;
}> = ({ side, onAddBot }) => {
  return (
    <button
      type="button"
      onClick={onAddBot}
      className={`group flex items-center gap-2.5 rounded-2xl border border-dashed border-[#D4AF37]/45 bg-[#0B1116]/88 px-2.5 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.5)] backdrop-blur-md hover:border-[#D4AF37] hover:bg-[#121A21]/95 active:scale-95 transition-all cursor-pointer ${
        side === 'right' ? 'flex-row-reverse text-right' : 'flex-row text-left'
      }`}
      title="点击立即匹配对手入座"
    >
      {/* Pulsing Radar Medallion */}
      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D4AF37]/40 bg-[#070B0E]">
        <span className="absolute h-7 w-7 animate-ping rounded-full border border-[#D4AF37]/40" />
        <svg
          viewBox="0 0 24 24"
          className="relative h-5 w-5 text-[#D4AF37] group-hover:scale-110 transition-transform"
          fill="none"
        >
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.5 19.5C6.8 16.2 9.2 14.5 12 14.5C14.8 14.5 17.2 16.2 18.5 19.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="min-w-0 pr-1">
        <div className="text-xs font-extrabold text-[#F3E5AB] group-hover:text-white transition-colors whitespace-nowrap">
          虚位待诏 · 匹配中
        </div>
        <div className="mt-0.5 text-[10px] font-bold text-[#D4AF37]/85 whitespace-nowrap">
          + 点击立即入座
        </div>
      </div>
    </button>
  );
};

