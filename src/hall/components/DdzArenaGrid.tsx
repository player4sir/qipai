import React from 'react';
import { ROOM_TIER_CONFIGS, RoomTierConfig } from '../../games/ddz/types';
import { DdzArenaMode } from '../HallView';
import { CommercialTierCardSpec, TIER_CARD_SPECS, TierCard } from './TierCard';

export interface DdzArenaGridProps {
  ddzArenaMode: DdzArenaMode;
  myBeans: number;
  onSelectMode: (mode: DdzArenaMode) => void;
  onClickTier: (tierCfg: RoomTierConfig, spec: CommercialTierCardSpec) => void;
}

const DDZ_MODES: Array<{ id: DdzArenaMode; label: string }> = [
  { id: 'classic', label: '经典斗地主' },
  { id: 'tiandi_laizi', label: '天地赖子' },
  { id: 'no_shuffle', label: '不洗牌' },
  { id: 'puzzle', label: '残局闯关' },
];

export const DdzArenaGrid: React.FC<DdzArenaGridProps> = ({
  ddzArenaMode,
  myBeans,
  onSelectMode,
  onClickTier,
}) => {
  return (
    <div className="my-auto mx-auto flex w-full max-w-[760px] flex-col items-center justify-center gap-4 py-2 sm:gap-6">
      <div className="mx-auto grid w-full max-w-[480px] grid-cols-4 gap-2">
        {DDZ_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectMode(m.id)}
            className={`flex h-9 sm:h-10 items-center justify-center rounded-xl px-2 text-xs sm:text-sm font-black transition-all cursor-pointer whitespace-nowrap truncate ${
              ddzArenaMode === m.id
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-[#1e0d04] shadow-lg'
                : 'border border-amber-200/25 bg-black/50 text-amber-100 hover:bg-black/70'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid w-full max-w-[740px] grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
        {ROOM_TIER_CONFIGS.slice(0, 4).map((tierCfg, idx) => {
          const spec = TIER_CARD_SPECS[idx] || TIER_CARD_SPECS[0];
          const isRecommended = idx === 1;
          return (
            <TierCard
              key={tierCfg.tier}
              tierCfg={tierCfg}
              spec={spec}
              isRecommended={isRecommended}
              onClick={() => onClickTier(tierCfg, spec)}
            />
          );
        })}
      </div>
    </div>
  );
};
