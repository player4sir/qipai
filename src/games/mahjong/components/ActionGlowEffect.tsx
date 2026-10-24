import React, { useEffect, useState } from 'react';

export interface ActionGlowEffectProps {
  action: 'peng' | 'gang' | 'hu' | 'zimo';
  seatId?: number;
  onComplete?: () => void;
}

const ACTION_MAP: Record<string, { emblem: string; glow: string; text: string }> = {
  hu: {
    emblem: '/assets/mahjong/effects/Hu.png',
    glow: '/assets/mahjong/actions/hu_fangshe.png',
    text: '胡',
  },
  zimo: {
    emblem: '/assets/mahjong/effects/Zm.png',
    glow: '/assets/mahjong/actions/zimo_fangshe.png',
    text: '自摸',
  },
  gang: {
    emblem: '/assets/mahjong/effects/Gang.png',
    glow: '/assets/mahjong/actions/gang_fangshe.png',
    text: '杠',
  },
  peng: {
    emblem: '/assets/mahjong/effects/Peng.png',
    glow: '/assets/mahjong/actions/peng_fangshe.png',
    text: '碰',
  },
};

export const ActionGlowEffect: React.FC<ActionGlowEffectProps> = ({
  action,
  onComplete,
}) => {
  const [visible, setVisible] = useState(true);
  const config = ACTION_MAP[action] || ACTION_MAP.hu;

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 1400);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center animate-in fade-in duration-150">
      <div className="relative flex items-center justify-center">
        {/* 1. Radial Rotating Golden Ray Burst */}
        <img
          src={config.glow}
          alt="Glow Burst"
          className="h-72 w-72 sm:h-96 sm:w-96 object-contain animate-[spin_6s_linear_infinite] opacity-90 drop-shadow-[0_0_35px_rgba(251,191,36,0.8)]"
        />

        {/* 2. Concentric Golden Halo */}
        <div className="absolute h-40 w-40 sm:h-56 sm:w-56 rounded-full bg-amber-400/25 blur-2xl animate-pulse" />

        {/* 3. Popping Action Emblem */}
        <div className="absolute flex flex-col items-center animate-in zoom-in-50 duration-300 ease-out">
          <img
            src={config.emblem}
            alt={config.text}
            className="h-28 sm:h-36 w-auto object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.85)] scale-110 active:scale-125 transition-transform"
          />
        </div>
      </div>
    </div>
  );
};
