import React from 'react';
import { Coins, Play } from 'lucide-react';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';

export type PreviewGameKey = 'laoyancai' | 'shuangko' | 'sihepai' | 'niuniu' | 'zhajinhua' | string;
export type GameKey = PreviewGameKey;

export interface GamePreviewModalProps {
  gameKey: PreviewGameKey;
  myBeans?: number;
  onClose: () => void;
  onQuickStart: (gameKey: PreviewGameKey, baseScore: number) => void;
}

const TIER_LIST = [
  { baseScore: 100, label: '新手场' },
  { baseScore: 500, label: '进阶场' },
  { baseScore: 2000, label: '高手场' },
  { baseScore: 10000, label: '宗师场' },
];

export const GamePreviewModal: React.FC<GamePreviewModalProps> = ({
  gameKey,
  onClose,
  onQuickStart,
}) => {
  return (
    <CommercialModalShell
      title="选择场次快速开局"
      subtitle="点击任意底分场次即可秒配入座"
      icon={<Coins className="h-5 w-5" />}
      size="sm"
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        {TIER_LIST.map((item) => (
          <button
            key={item.baseScore}
            type="button"
            onClick={() => onQuickStart(gameKey, item.baseScore)}
            className="flex items-center justify-between rounded-xl border border-[#E8E1D0] bg-white px-4 py-3.5 text-left shadow-2xs transition-all hover:border-[#F59E0B] hover:bg-[#FFFBEB] active:scale-95 cursor-pointer"
          >
            <div>
              <div className="text-xs font-bold text-[#6E5A44]">{item.label}</div>
              <div className="mt-0.5 font-mono text-sm font-black text-[#1E242B] tabular-nums">
                底分 {item.baseScore.toLocaleString()}
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFBEB] text-[#D97706]">
              <Play className="h-4 w-4 fill-current" />
            </div>
          </button>
        ))}
      </div>
    </CommercialModalShell>
  );
};
