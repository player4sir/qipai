import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';

export interface RollingScoreCounterProps {
  /** Target signed score delta (e.g. +1200 or -600) or absolute number */
  value: number;
  /** Optional starting value (defaults to 0 for deltas) */
  fromValue?: number;
  /** Animation duration in ms (defaults to 880ms) */
  durationMs?: number;
  /** Whether to show explicit '+' prefix for positive numbers (defaults to true) */
  showPlusSign?: boolean;
  /** Optional unit suffix (e.g. " 分" or " 积分") */
  suffix?: string;
  /** Optional prefix label */
  prefix?: string;
  /** Size preset */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether to play subtle counting ticks on roll */
  enableSoundTicks?: boolean;
  /** Alias for enableSoundTicks */
  playTickSound?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * High-precision commercial rolling score counter.
 * Strictly differentiates winners vs losers by color:
 * - Winner (value > 0): Radiant Gold (#FFD700 with golden luminance)
 * - Loser (value < 0): Warm Amber (#D97706 / amber-500)
 * - Draw (value === 0): Muted Warm Gold (amber-200/70)
 */
export const RollingScoreCounter: React.FC<RollingScoreCounterProps> = ({
  value,
  fromValue = 0,
  durationMs = 880,
  showPlusSign = true,
  suffix = '',
  prefix = '',
  size = 'md',
  enableSoundTicks = false,
  playTickSound = false,
  className = '',
}) => {
  const [displayValue, setDisplayValue] = useState<number>(fromValue);
  const [isSettled, setIsSettled] = useState<boolean>(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const shouldTick = enableSoundTicks || playTickSound;

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const startVal = fromValue;
    const targetVal = Number(value) || 0;
    if (startVal === targetVal) {
      setDisplayValue(targetVal);
      setIsSettled(true);
      return;
    }

    setIsSettled(false);
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / Math.max(120, durationMs));
      // Ease-out quintic for snappy start and smooth high-score landing
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(startVal + (targetVal - startVal) * eased);

      setDisplayValue(current);

      if (shouldTick && now - lastTickRef.current > 85 && progress < 0.94) {
        lastTickRef.current = now;
        soundEngine.playTap(targetVal >= 0 ? 880 + Math.round(progress * 240) : 540);
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetVal);
        setIsSettled(true);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, fromValue, durationMs, shouldTick]);

  const isWinner = value > 0;
  const isLoser = value < 0;

  // Winner = Radiant Gold (#FFD700); Loser = Warm Amber (#D97706)
  const colorClass = isWinner
    ? 'text-[#FFD700] drop-shadow-[0_2px_10px_rgba(255,215,0,0.45)]'
    : isLoser
    ? 'text-[#D97706] drop-shadow-[0_1px_6px_rgba(217,119,6,0.3)]'
    : 'text-amber-200/75';

  const sizeClass =
    size === 'xl'
      ? 'text-2xl sm:text-3xl font-black tracking-tight'
      : size === 'lg'
      ? 'text-lg sm:text-xl font-black'
      : size === 'sm'
      ? 'text-xs sm:text-sm font-extrabold'
      : 'text-sm sm:text-base font-black';

  const formattedNumber =
    displayValue > 0 && showPlusSign
      ? `+${displayValue.toLocaleString()}`
      : displayValue.toLocaleString();

  return (
    <span
      className={`inline-flex items-baseline font-mono tabular-nums transition-transform duration-150 ${sizeClass} ${colorClass} ${
        isSettled && isWinner ? 'scale-105' : 'scale-100'
      } ${className}`}
    >
      {prefix && <span className="mr-0.5 text-[0.8em] opacity-85">{prefix}</span>}
      <span>{formattedNumber}</span>
      {suffix && <span className="ml-0.5 text-[0.78em] font-bold opacity-90">{suffix}</span>}
    </span>
  );
};

export interface SettlementHeroHeaderProps {
  selfScoreDelta: number;
  isWin?: boolean;
  titleWin?: string;
  titleLose?: string;
  subtitle?: string;
  suffix?: string;
  modeTitle?: string;
  baseScore?: number;
  extraBadgeText?: string;
}

const WIN_FLIPBOOK_FRAMES = [
  '/assets/mahjong/effects/Zm1.png',
  '/assets/mahjong/effects/Zm2.png',
  '/assets/mahjong/effects/Zm3.png',
  '/assets/mahjong/effects/Zm4.png',
  '/assets/mahjong/effects/Zm5.png',
  '/assets/mahjong/effects/Zm6.png',
  '/assets/mahjong/effects/Zm7.png',
  '/assets/mahjong/effects/Zm8.png',
];

/**
 * Clean commercial settlement header with properly sequenced flipbook burst,
 * radial golden light aura, and hero rolling score counter.
 */
export const SettlementHeroHeader: React.FC<SettlementHeroHeaderProps> = ({
  selfScoreDelta,
  isWin,
  titleWin = '旗开得胜 · 本局结算',
  titleLose = '再接再厉 · 本局结算',
  subtitle,
  suffix = ' 分',
  modeTitle,
  baseScore,
  extraBadgeText,
}) => {
  const effectiveWin = typeof isWin === 'boolean' ? isWin : selfScoreDelta >= 0;
  const [frameIdx, setFrameIdx] = useState<number>(0);
  const [showBurst, setShowBurst] = useState<boolean>(effectiveWin);

  useEffect(() => {
    if (!effectiveWin) {
      setShowBurst(false);
      return;
    }
    setShowBurst(true);
    setFrameIdx(0);
    const interval = window.setInterval(() => {
      setFrameIdx((prev) => {
        if (prev < WIN_FLIPBOOK_FRAMES.length - 1) return prev + 1;
        return prev;
      });
    }, 65);
    const hideTimer = window.setTimeout(() => {
      setShowBurst(false);
    }, 950);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(hideTimer);
    };
  }, [effectiveWin]);

  const primaryTitle = effectiveWin ? titleWin : titleLose;
  const resolvedSubtitle =
    subtitle ||
    (modeTitle
      ? `${modeTitle}${typeof baseScore === 'number' ? ` · 底分 ${baseScore.toLocaleString()}` : ''}`
      : '');

  return (
    <div
      className={`relative flex items-center justify-between overflow-hidden border-b px-5 py-3.5 ${
        effectiveWin
          ? 'border-[#FFD700]/35 bg-gradient-to-r from-[#2e1906] via-[#452408] to-[#2e1906]'
          : 'border-amber-500/25 bg-gradient-to-r from-[#1f140b] via-[#2b1b0f] to-[#1f140b]'
      }`}
    >
      {/* Subtle Radial Light Burst behind Winner Emblem */}
      {effectiveWin && (
        <img
          src="/assets/mahjong/actions/hu_fangshe.png"
          alt=""
          className="pointer-events-none absolute -top-12 left-6 h-36 w-36 object-contain opacity-55 animate-[spin_10s_linear_infinite]"
        />
      )}

      {/* Multi-frame Flipbook Sparkle Burst on initial open */}
      {showBurst && (
        <img
          src={WIN_FLIPBOOK_FRAMES[frameIdx]}
          alt=""
          className="pointer-events-none absolute left-8 top-1/2 h-20 w-20 -translate-y-1/2 object-contain opacity-80"
        />
      )}

      {/* Left: Title Emblem + Game Mode & Base Score */}
      <div className="relative z-10 flex items-center gap-3">
        <img
          src={effectiveWin ? '/assets/ui/title_win_js.png' : '/assets/ui/title_lose_js.png'}
          alt={effectiveWin ? '胜利' : '惜败'}
          className="h-8 sm:h-9 w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.65)]"
        />
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-black tracking-wide text-[#FFD700]">
            <span>{primaryTitle}</span>
          </div>
          {resolvedSubtitle && (
            <span className="font-mono text-[11px] font-bold text-amber-200/80">
              {resolvedSubtitle}
            </span>
          )}
          {extraBadgeText && (
            <span className="text-[11px] font-bold text-amber-200/75">
              {extraBadgeText}
            </span>
          )}
        </div>
      </div>

      {/* Right: Hero Rolling Score Counter */}
      <div className="relative z-10 flex flex-col items-end">
        <span className="text-[10px] font-bold text-amber-200/65">
          {effectiveWin ? '本局净赢积分' : '本局积分变动'}
        </span>
        <RollingScoreCounter
          value={selfScoreDelta}
          size="xl"
          suffix={suffix}
          enableSoundTicks
        />
      </div>
    </div>
  );
};
