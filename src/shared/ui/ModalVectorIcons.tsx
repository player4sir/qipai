import React from 'react';
import { Suit } from '../../games/ddz/types';

export interface RankMedalSvgProps {
  rank: number;
  className?: string;
}

/**
 * Commercial SVG Rank Medal for Leaderboard (1st Gold, 2nd Silver, 3rd Bronze)
 * Strictly replaces any emoji crown/trophy characters with crisp vector geometry.
 */
export const RankMedalSvg: React.FC<RankMedalSvgProps> = ({ rank, className = 'h-7 w-7' }) => {
  if (rank === 1) {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="第1名">
        <circle cx="16" cy="16" r="14" fill="url(#goldGrad)" stroke="#B45309" strokeWidth="1.5" />
        <path
          d="M9.5 20.5L8 12.5L12.5 15.5L16 10.5L19.5 15.5L24 12.5L22.5 20.5H9.5Z"
          fill="#FFFBEB"
          stroke="#92400E"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="goldGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDE68A" />
            <stop offset="0.5" stopColor="#F59E0B" />
            <stop offset="1" stopColor="#D97706" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (rank === 2) {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="第2名">
        <circle cx="16" cy="16" r="14" fill="url(#silverGrad)" stroke="#64748B" strokeWidth="1.5" />
        <path
          d="M10 20.5L8.5 13L12.8 15.8L16 11L19.2 15.8L23.5 13L22 20.5H10Z"
          fill="#F8FAFC"
          stroke="#475569"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="silverGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F1F5F9" />
            <stop offset="0.5" stopColor="#CBD5E1" />
            <stop offset="1" stopColor="#94A3B8" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (rank === 3) {
    return (
      <svg viewBox="0 0 32 32" fill="none" className={className} aria-label="第3名">
        <circle cx="16" cy="16" r="14" fill="url(#bronzeGrad)" stroke="#9A3412" strokeWidth="1.5" />
        <path
          d="M10 20.5L8.8 13.5L13 16L16 11.5L19 16L23.2 13.5L22 20.5H10Z"
          fill="#FFF7ED"
          stroke="#7C2D12"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="bronzeGrad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FED7AA" />
            <stop offset="0.5" stopColor="#EA580C" />
            <stop offset="1" stopColor="#9A3412" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#E2D8C5] bg-[#F5F1E7] font-mono text-xs font-black text-[#5A6572] tabular-nums">
      {rank}
    </span>
  );
};

export interface PokerSuitSvgProps {
  suit: Suit;
  isRedJoker?: boolean;
  className?: string;
}

/**
 * Pure SVG vector poker suit icon — prevents mobile OS browsers from rendering
 * text suit symbols as glossy system emojis.
 */
export const PokerSuitSvg: React.FC<PokerSuitSvgProps> = ({
  suit,
  isRedJoker = false,
  className = 'h-3.5 w-3.5',
}) => {
  if (suit === 'heart') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-rose-600 ${className}`}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  if (suit === 'diamond') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-rose-600 ${className}`}>
        <path d="M12 2L20 12L12 22L4 12L12 2Z" />
      </svg>
    );
  }
  if (suit === 'spade') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${className}`}>
        <path d="M12 2C7 8 4 11.5 4 14.5C4 17.2 6.2 19 8.8 19C10.2 19 11.2 18.3 11.6 17.5C11.4 19.3 10.6 20.8 9 22H15C13.4 20.8 12.6 19.3 12.4 17.5C12.8 18.3 13.8 19 15.2 19C17.8 19 20 17.2 20 14.5C20 11.5 17 8 12 2Z" />
      </svg>
    );
  }
  if (suit === 'club') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${className}`}>
        <path d="M12 3a4 4 0 0 0-3.6 5.7A4.2 4.2 0 0 0 4 12.8a4.2 4.2 0 0 0 6.8 3.3c-.3 1.9-1.1 3.7-2.8 4.9h8c-1.7-1.2-2.5-3-2.8-4.9A4.2 4.2 0 0 0 20 12.8a4.2 4.2 0 0 0-4.4-4.1A4 4 0 0 0 12 3z" />
      </svg>
    );
  }
  // Joker Crown Star
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`${isRedJoker ? 'text-rose-600' : 'text-slate-800'} ${className}`}
    >
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
    </svg>
  );
};
