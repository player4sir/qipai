import React from 'react';
import { TingCandidateInfo } from '../types';
import { MahjongTileView } from './MahjongTileView';

export interface TingPromptPanelProps {
  tingList?: TingCandidateInfo[];
  candidates?: TingCandidateInfo[];
}

export const TingPromptPanel: React.FC<TingPromptPanelProps> = ({
  tingList,
  candidates,
}) => {
  const items = tingList || candidates || [];

  if (!items || items.length === 0) return null;

  return (
    <div className="relative flex flex-col items-start select-none pointer-events-auto">
      <div className="relative flex min-w-[190px] max-w-[240px] flex-col rounded-xl border border-[#E5DAC3] bg-[#FAF7F0]/98 p-2.5 text-[#1E242B] shadow-lg">
        <div className="mb-1.5 flex items-center justify-between border-b border-[#EAE2D3] pb-1">
          <span className="text-xs font-black text-[#B47B00]">
            听 {items.length} 门
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto pr-0.5">
          {items.map((cand) => (
            <div
              key={cand.tileId}
              className="flex items-center gap-1 rounded-lg border border-[#E5DAC3] bg-white p-1"
            >
              <MahjongTileView tileId={cand.tileId} isSmall perspective={2} kind="ming" />
              <div className="flex flex-col leading-none">
                <span className="font-mono text-[10px] font-black text-[#1E242B]">
                  剩{cand.remainCount}张
                </span>
                <span className="font-mono text-[9px] font-bold text-[#B47B00] mt-0.5">
                  ×{cand.factor}番
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
