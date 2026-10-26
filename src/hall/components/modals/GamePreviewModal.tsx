import React from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export type GameKey = 'niuniu' | 'zhajinhua' | 'laoyancai' | 'shuangko' | 'sihepai';

export interface GameTierInfo {
  id: string;
  name: string;
  baseScore: number;
  minBeans: number;
  color: string;
  border: string;
}

export interface GameDetailMeta {
  id: GameKey;
  title: string;
  heroImg: string;
  accentGradient: string;
  borderColor: string;
  tiers: GameTierInfo[];
}

export const GAME_DETAILS: Record<GameKey, GameDetailMeta> = {
  niuniu: {
    id: 'niuniu',
    title: '抢庄斗牛',
    heroImg: '/assets/ui/icon_2.png',
    accentGradient: 'from-[#F5EFE4] to-[#FAF7F0]',
    borderColor: 'border-[#E5DAC3]',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#FFFBEB] to-[#FEF3C7]', border: 'border-[#E6C675]' },
    ],
  },
  zhajinhua: {
    id: 'zhajinhua',
    title: '欢乐金花',
    heroImg: '/assets/ui/icon_3.png',
    accentGradient: 'from-[#F5EFE4] to-[#FAF7F0]',
    borderColor: 'border-[#E5DAC3]',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#FFFBEB] to-[#FEF3C7]', border: 'border-[#E6C675]' },
    ],
  },
  laoyancai: {
    id: 'laoyancai',
    title: '滇西捞腌菜',
    heroImg: '/assets/ui/btn_laizi_role.png',
    accentGradient: 'from-[#F5EFE4] to-[#FAF7F0]',
    borderColor: 'border-[#E5DAC3]',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#FFFBEB] to-[#FEF3C7]', border: 'border-[#E6C675]' },
    ],
  },
  shuangko: {
    id: 'shuangko',
    title: '千变双扣',
    heroImg: '/assets/ui/btn_tdlaizi_role.png',
    accentGradient: 'from-[#F5EFE4] to-[#FAF7F0]',
    borderColor: 'border-[#E5DAC3]',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#FFFBEB] to-[#FEF3C7]', border: 'border-[#E6C675]' },
    ],
  },
  sihepai: {
    id: 'sihepai',
    title: '传统四合牌',
    heroImg: '/assets/ui/icon_cs.png',
    accentGradient: 'from-[#F5EFE4] to-[#FAF7F0]',
    borderColor: 'border-[#E5DAC3]',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-white to-[#FAF7F0]', border: 'border-[#E5DAC3]' },
    ],
  },
};

export interface GamePreviewModalProps {
  gameKey: GameKey;
  myBeans: number;
  onClose: () => void;
  onQuickStart: (gameKey: GameKey, baseScore: number) => void;
}

export const GamePreviewModal: React.FC<GamePreviewModalProps> = ({
  gameKey,
  myBeans,
  onClose,
  onQuickStart,
}) => {
  const meta = GAME_DETAILS[gameKey];

  const handleStart = (tier: GameTierInfo) => {
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    onQuickStart(gameKey, tier.baseScore);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] select-none animate-in fade-in duration-150">
      <div
        className="relative flex flex-col w-full max-w-[420px] max-h-[84dvh] rounded-2xl border border-white/10 bg-[#12171B]/95 shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md overflow-hidden text-[#F3F4F6]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-white/[0.02] border-b border-white/[0.08] shrink-0">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">
            {meta.title}
          </h3>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(520);
              onClose();
            }}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tier Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 grid grid-cols-2 gap-2.5">
          {meta.tiers.map((t, idx) => {
            const roomCardCost = idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 4 : 8;
            const canAfford = myBeans >= roomCardCost;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleStart(t)}
                className="flex flex-col items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-center transition-all hover:border-[#D4AF37]/40 hover:bg-white/[0.06] active:scale-[0.98] cursor-pointer"
              >
                <span className="text-sm font-bold text-[#F3F4F6]">
                  {t.name}
                </span>

                <span className="mt-1.5 font-mono text-xs sm:text-sm font-bold text-[#FBBF24] tabular-nums">
                  底分 {t.baseScore.toLocaleString()}
                </span>

                <div className="mt-2 border-t border-white/[0.07] pt-1.5 w-full">
                  <span className={`font-mono text-[11px] font-medium tabular-nums ${canAfford ? 'text-[#9CA3AF]' : 'text-[#F87171]'}`}>
                    {roomCardCost}卡 · {t.minBeans >= 10000 ? `${t.minBeans / 10000}万` : t.minBeans.toLocaleString()}初始分
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
