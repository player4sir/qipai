import React from 'react';
import { Suit } from '../../games/ddz/types';

export interface PokerSuitSvgProps {
  suit: Suit | 'joker';
  isRedJoker?: boolean;
  className?: string;
}

export const PokerSuitSvg: React.FC<PokerSuitSvgProps> = ({
  suit,
  isRedJoker = false,
  className = 'w-4 h-4',
}) => {
  if (suit === 'heart') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-red-500 ${className}`}>
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
      </svg>
    );
  }
  if (suit === 'diamond') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-red-500 ${className}`}>
        <path d="M12 2L22 12L12 22L2 12L12 2Z" />
      </svg>
    );
  }
  if (suit === 'club') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${className}`}>
        <path d="M12 3a4 4 0 0 0-3.87 5.02A4 4 0 1 0 6.5 15.5c1.2 0 2.27-.53 3-1.36V19H7v2h10v-2h-2.5v-4.86c.73.83 1.8 1.36 3 1.36a4 4 0 1 0-1.63-7.48A4 4 0 0 0 12 3z" />
      </svg>
    );
  }
  if (suit === 'joker') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className={`${isRedJoker ? 'text-red-600' : 'text-slate-900'} ${className}`}
      >
        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`text-slate-900 ${className}`}>
      <path d="M12 2C7 8 4 11.5 4 14.5A4.5 4.5 0 0 0 8.5 19c1.14 0 2.18-.42 2.97-1.12L10 22h4l-1.47-4.12c.79.7 1.83 1.12 2.97 1.12a4.5 4.5 0 0 0 4.5-4.5C20 11.5 17 8 12 2z" />
    </svg>
  );
};
