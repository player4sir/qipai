import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
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
 * High-precision commercial rolling score counter for restrained dark frosted panels:
 * - Winner (value > 0): Warm Champagne Gold (#E5B85B)
 * - Loser (value < 0): Muted Cool Slate (#94A3B8)
 * - Draw (value === 0): Neutral Gray (#6B7280)
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

  const colorClass = isWinner
    ? 'text-[#E5B85B]'
    : isLoser
    ? 'text-[#94A3B8]'
    : 'text-[#6B7280]';

  const sizeClass =
    size === 'xl'
      ? 'text-xl sm:text-2xl font-bold tracking-tight'
      : size === 'lg'
      ? 'text-lg sm:text-xl font-bold tracking-tight'
      : size === 'sm'
      ? 'text-xs sm:text-sm font-semibold'
      : 'text-sm sm:text-base font-bold tracking-tight';

  const formattedNumber =
    displayValue > 0 && showPlusSign
      ? `+${displayValue.toLocaleString()}`
      : displayValue.toLocaleString();

  return (
    <span
      className={`inline-flex items-baseline font-mono tabular-nums transition-transform duration-150 ${sizeClass} ${colorClass} ${
        isSettled && isWinner ? 'scale-[1.02]' : 'scale-100'
      } ${className}`}
    >
      {prefix && <span className="mr-0.5 text-[0.78em] font-normal opacity-75">{prefix}</span>}
      <span>{formattedNumber}</span>
      {suffix && <span className="ml-1 text-[0.72em] font-semibold opacity-80">{suffix}</span>}
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
  onClose?: () => void;
}

/**
 * Restrained dark frosted commercial settlement header.
 * Clean typographic title and concise match metadata, with a subtle top-right close button.
 */
export const SettlementHeroHeader: React.FC<SettlementHeroHeaderProps> = ({
  selfScoreDelta,
  isWin,
  titleWin = '本局胜利',
  titleLose = '本局结算',
  subtitle,
  modeTitle,
  baseScore,
  extraBadgeText,
  onClose,
}) => {
  const effectiveWin = typeof isWin === 'boolean' ? isWin : selfScoreDelta > 0;
  const primaryTitle = effectiveWin ? titleWin : selfScoreDelta === 0 ? '本局平局' : titleLose;
  const resolvedSubtitle = [
    subtitle ||
      (modeTitle
        ? `${modeTitle}${typeof baseScore === 'number' ? ` · 底分 ${baseScore.toLocaleString()}` : ''}`
        : ''),
    extraBadgeText,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="relative flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2
          className={`text-sm sm:text-base font-bold tracking-wide ${
            effectiveWin ? 'text-[#E5B85B]' : 'text-[#F3F4F6]'
          }`}
        >
          {primaryTitle}
        </h2>
        {resolvedSubtitle && (
          <p className="mt-0.5 truncate font-sans text-xs text-[#9CA3AF] tabular-nums">
            {resolvedSubtitle}
          </p>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭结算面板"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
