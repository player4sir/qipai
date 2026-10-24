import React, { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { MahjongSuit, MahjongMeld } from '../types';
import { MahjongTileView } from './MahjongTileView';
import { MeldsZone } from './MeldsZone';
import { getLegalDiscards } from '../algorithms/MahjongRules';
import { getTileName } from '../algorithms/MahjongTile';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface HandTilesZoneProps {
  handTiles: number[];
  drawnTile?: number | null;
  dingQueSuit: MahjongSuit | null;
  isMyTurn: boolean;
  onDiscard: (tileId: number) => void;
  otherHandCounts: number[]; // [right, top, left]
  melds?: MahjongMeld[];
  optimalDiscardTile?: number;
  optimalDiscardReason?: string;
  discardHints?: Array<{ card: number; waits: number[] }>;
  mode?: string;
}

export const HandTilesZone: React.FC<HandTilesZoneProps> = ({
  handTiles,
  drawnTile,
  dingQueSuit,
  isMyTurn,
  onDiscard,
  otherHandCounts,
  melds,
  optimalDiscardTile,
  optimalDiscardReason,
  discardHints = [],
  mode = 'puer',
}) => {
  const [selectedTileIdx, setSelectedTileIdx] = useState<number | null>(null);

  const legalDiscards = getLegalDiscards(handTiles, dingQueSuit);

  const handleTileClick = (tileId: number, idx: number) => {
    if (!isMyTurn) {
      soundEngine.playTap(520);
      return;
    }

    const isLegal = legalDiscards.includes(tileId);
    if (!isLegal) {
      soundEngine.playTap(400);
      return;
    }

    if (selectedTileIdx === idx) {
      // Click again on selected tile -> discard
      executeDiscard(tileId);
    } else {
      // First click -> lift tile
      soundEngine.playMahjongDraw();
      hapticEngine.selectCard();
      setSelectedTileIdx(idx);
    }
  };

  const executeDiscard = (tileId: number) => {
    soundEngine.playMahjongGive();
    hapticEngine.playCard();
    setSelectedTileIdx(null);
    onDiscard(tileId);
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* ===================================================================
          1. TOP OPPONENT (Seat 2) STANDING TILES
         =================================================================== */}
      <div className="absolute top-[54px] left-1/2 -translate-x-1/2 flex items-center -space-x-1 drop-shadow-lg z-10">
        {Array.from({ length: otherHandCounts[1] || 13 }).map((_, i) => (
          <div key={i} className="transition-transform hover:-translate-y-1">
            <img
              src="/assets/mahjong/tiles/hand_top.png"
              alt="Top Opponent Hand"
              className="h-[38px] aspect-[79/120] object-contain drop-shadow"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* ===================================================================
          2. LEFT OPPONENT (Seat 3) STANDING TILES (Compact 3D Rack on Table)
         =================================================================== */}
      <div
        className="absolute left-[130px] flex flex-col items-center -space-y-[34px] drop-shadow-xl z-10"
        style={{ top: '310px', transform: 'translateY(-50%)' }}
      >
        {Array.from({ length: Math.min(otherHandCounts[2] || 13, 13) }).map((_, i) => (
          <div key={i} className="transition-transform hover:-translate-x-1" style={{ zIndex: i }}>
            <img
              src="/assets/mahjong/tiles/hand_left.png"
              alt="Left Opponent Hand"
              className="w-5.5 aspect-[50/120] object-contain drop-shadow"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* ===================================================================
          3. RIGHT OPPONENT (Seat 1) STANDING TILES (Compact 3D Rack on Table)
         =================================================================== */}
      <div
        className="absolute right-[130px] flex flex-col items-center -space-y-[34px] drop-shadow-xl z-10"
        style={{ top: '310px', transform: 'translateY(-50%)' }}
      >
        {Array.from({ length: Math.min(otherHandCounts[0] || 13, 13) }).map((_, i) => (
          <div key={i} className="transition-transform hover:translate-x-1" style={{ zIndex: i }}>
            <img
              src="/assets/mahjong/tiles/hand_right.png"
              alt="Right Opponent Hand"
              className="w-5.5 aspect-[50/120] object-contain drop-shadow"
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* ===================================================================
          4. BOTTOM (SELF) INTERACTIVE 3D HAND + MELDS
         =================================================================== */}
      <div className="absolute bottom-[10px] left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center z-20">
        {/* Floating Quick Discard Button above Selected Tile */}
        {isMyTurn && selectedTileIdx !== null && handTiles[selectedTileIdx] !== undefined && (
          <div className="flex flex-col items-center mb-1.5">
            <button
              type="button"
              onClick={() => executeDiscard(handTiles[selectedTileIdx])}
              className="flex items-center gap-1.5 rounded-full border-2 border-amber-300 bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-4 py-1 font-display text-xs font-black text-[#18181B] shadow-[0_4px_16px_rgba(251,191,36,0.85)] active:scale-95 cursor-pointer"
            >
              <ArrowUp className="h-3.5 w-3.5" />
              <span>出牌: {getTileName(handTiles[selectedTileIdx])}</span>
            </button>
          </div>
        )}

        {/* Hand Tiles Row (Accommodates Melds to Left + 14 Hand Tiles) */}
        <div className="flex items-end gap-1 px-2.5 py-1 rounded-2xl bg-black/40 backdrop-blur-xs border border-white/10 shadow-2xl">
          {melds && melds.length > 0 && (
            <div className="mr-2 flex items-end">
              <MeldsZone melds={melds} isSmall perspective={2} />
            </div>
          )}
          {handTiles.map((t, idx) => {
            const isSelected = selectedTileIdx === idx;
            const isIllegal = isMyTurn && !legalDiscards.includes(t);
            const isNew = drawnTile !== null && t === drawnTile && idx === handTiles.length - 1;
            const tingHint = discardHints.find((h) => h.card === t);

            return (
              <div key={`${t}_${idx}`} className="relative">
                {tingHint && !isSelected && (
                  <span className="absolute -top-2.5 right-0 z-30 flex items-center justify-center rounded-sm border border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 px-1 py-0 text-[8px] font-black text-[#18181B] shadow-md pointer-events-none">
                    听
                  </span>
                )}
                <MahjongTileView
                  tileId={t}
                  isSelected={isSelected}
                  isDingQue={isIllegal}
                  isNewDraw={isNew}
                  kind="hand"
                  mode={mode}
                  onClick={() => handleTileClick(t, idx)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
