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
    accentGradient: 'from-[#6f2c1a] to-[#3f160c]',
    borderColor: 'border-amber-300/60',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-[#34c395] to-[#167a57]', border: 'border-[#8df5d1]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-[#4f86f7] to-[#2347b8]', border: 'border-[#9ec2ff]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-[#9b6bf2] to-[#5e2ca5]', border: 'border-[#d2b8ff]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#f47b4b] via-[#dc4726] to-[#991b1b]', border: 'border-[#fde047]' },
    ],
  },
  zhajinhua: {
    id: 'zhajinhua',
    title: '欢乐金花',
    heroImg: '/assets/ui/icon_3.png',
    accentGradient: 'from-[#6f2c1a] to-[#3f160c]',
    borderColor: 'border-amber-300/60',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-[#34c395] to-[#167a57]', border: 'border-[#8df5d1]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-[#4f86f7] to-[#2347b8]', border: 'border-[#9ec2ff]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-[#9b6bf2] to-[#5e2ca5]', border: 'border-[#d2b8ff]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#f47b4b] via-[#dc4726] to-[#991b1b]', border: 'border-[#fde047]' },
    ],
  },
  laoyancai: {
    id: 'laoyancai',
    title: '滇西捞腌菜',
    heroImg: '/assets/ui/btn_laizi_role.png',
    accentGradient: 'from-[#6f2c1a] to-[#3f160c]',
    borderColor: 'border-amber-300/60',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-[#34c395] to-[#167a57]', border: 'border-[#8df5d1]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-[#4f86f7] to-[#2347b8]', border: 'border-[#9ec2ff]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-[#9b6bf2] to-[#5e2ca5]', border: 'border-[#d2b8ff]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#f47b4b] via-[#dc4726] to-[#991b1b]', border: 'border-[#fde047]' },
    ],
  },
  shuangko: {
    id: 'shuangko',
    title: '千变双扣',
    heroImg: '/assets/ui/btn_tdlaizi_role.png',
    accentGradient: 'from-[#6f2c1a] to-[#3f160c]',
    borderColor: 'border-amber-300/60',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-[#34c395] to-[#167a57]', border: 'border-[#8df5d1]' },
      { id: 't2', name: '初级场', baseScore: 500, minBeans: 10000, color: 'from-[#4f86f7] to-[#2347b8]', border: 'border-[#9ec2ff]' },
      { id: 't3', name: '中级场', baseScore: 2000, minBeans: 50000, color: 'from-[#9b6bf2] to-[#5e2ca5]', border: 'border-[#d2b8ff]' },
      { id: 't4', name: '至尊场', baseScore: 10000, minBeans: 200000, color: 'from-[#f47b4b] via-[#dc4726] to-[#991b1b]', border: 'border-[#fde047]' },
    ],
  },
  sihepai: {
    id: 'sihepai',
    title: '传统四合牌',
    heroImg: '/assets/ui/icon_cs.png',
    accentGradient: 'from-[#6f2c1a] to-[#3f160c]',
    borderColor: 'border-amber-300/60',
    tiers: [
      { id: 't1', name: '新手场', baseScore: 100, minBeans: 2000, color: 'from-[#34c395] to-[#167a57]', border: 'border-[#8df5d1]' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200">
      <div
        onClick={() => {
          soundEngine.playTap(480);
          onClose();
        }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        className={`relative flex flex-col w-full max-w-lg rounded-3xl border-2 ${meta.borderColor} bg-gradient-to-b from-[#2a160c] via-[#1c0e07] to-[#140a05] shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden text-white z-10`}
      >
        {/* Clean Header */}
        <div className={`relative flex items-center justify-between px-4 py-3 bg-gradient-to-r ${meta.accentGradient} border-b border-amber-300/20 shrink-0`}>
          <div className="flex items-center gap-2.5">
            <img
              src={meta.heroImg}
              alt={meta.title}
              className="h-9 w-9 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] pointer-events-none"
            />
            <h3 className="font-display text-lg font-black text-amber-200 drop-shadow">
              {meta.title}
            </h3>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTap(520);
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/80 hover:text-white hover:bg-black/55 active:scale-95 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Clean Tier Grid */}
        <div className="p-4 grid grid-cols-2 gap-3">
          {meta.tiers.map((t, idx) => {
            const roomCardCost = idx === 0 ? 1 : idx === 1 ? 2 : idx === 2 ? 4 : 8;
            const canAfford = myBeans >= roomCardCost;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleStart(t)}
                className={`group relative flex flex-col items-center justify-between rounded-2xl border-2 ${t.border} bg-gradient-to-b ${t.color} p-3.5 text-center shadow-[0_8px_20px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.3)] transition-all hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer`}
              >
                <span className="font-display text-base sm:text-lg font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]">
                  {t.name}
                </span>

                <span className="mt-1.5 font-mono text-sm font-black text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                  底分 {t.baseScore.toLocaleString()}
                </span>

                <div className="mt-2 flex items-center justify-center gap-1 border-t border-white/20 pt-1.5 w-full">
                  <img
                    src="/assets/ui/icon_fangka.png"
                    alt=""
                    className="h-3.5 w-3.5 object-contain shrink-0"
                  />
                  <span className={`font-mono text-xs font-extrabold ${canAfford ? 'text-white/95' : 'text-rose-200'}`}>
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
