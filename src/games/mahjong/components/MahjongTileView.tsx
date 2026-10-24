import React from 'react';
import { isWildcard } from '../algorithms/MahjongTile';
import { legacyIdToTileIndex, tileIndexToAssetCode } from '../algorithms/TileEngine';

export interface MahjongTileViewProps {
  tileId: number;
  perspective?: 1 | 2 | 3; // 1=left, 2=bottom/top, 3=right
  isBack?: boolean;
  isSmall?: boolean;
  isSelected?: boolean;
  isDingQue?: boolean;
  isNewDraw?: boolean;
  kind?: 'hand' | 'ming';
  mode?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function getTileAssetCode(tileId: number): string {
  const idx = legacyIdToTileIndex(tileId);
  return tileIndexToAssetCode(idx);
}

export const MahjongTileView: React.FC<MahjongTileViewProps> = ({
  tileId,
  perspective = 2,
  isBack = false,
  isSmall = false,
  isSelected = false,
  isDingQue = false,
  isNewDraw = false,
  kind = 'hand',
  mode,
  onClick,
  onDoubleClick,
}) => {
  const isWild = isWildcard(tileId, mode);
  const tileCode = getTileAssetCode(tileId);

  // Cocos official perspective 1, 2, 3 assets
  const actualKind = isSmall ? 'ming' : kind;
  let imgSrc = '';
  if (perspective === 1) {
    imgSrc = isBack
      ? '/assets/mahjong/tiles/perspectives/1/mingmah_00.png'
      : `/assets/mahjong/tiles/perspectives/1/mingmah_${tileCode}.png`;
  } else if (perspective === 3) {
    imgSrc = isBack
      ? '/assets/mahjong/tiles/perspectives/3/mingmah_00.png'
      : `/assets/mahjong/tiles/perspectives/3/mingmah_${tileCode}.png`;
  } else {
    // Note: handmah_00 does not exist, mingmah_00 is the universal perspective 2 flat/back tile
    imgSrc = isBack
      ? '/assets/mahjong/tiles/perspectives/2/mingmah_00.png'
      : `/assets/mahjong/tiles/perspectives/2/${actualKind}mah_${tileCode}.png`;
  }

  // Exact physical pixel ratios:
  // Perspective 1 & 3: 120x114 -> aspect-[120/114]
  // Perspective 2: 76x118 (both handmah and mingmah) -> aspect-[76/118]
  const aspectClass =
    perspective === 1 || perspective === 3
      ? 'aspect-[120/114]'
      : 'aspect-[76/118]';

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`
        relative select-none cursor-pointer transition-all duration-150
        ${
          perspective === 1 || perspective === 3
            ? isSmall
              ? 'w-6'
              : 'w-7.5'
            : isSmall
            ? 'w-[24px]'
            : 'w-[42px]'
        }
        ${aspectClass}
        ${
          isSelected
            ? '-translate-y-4 brightness-105 drop-shadow-[0_12px_24px_rgba(251,191,36,0.9)] z-20'
            : 'hover:-translate-y-1.5'
        }
        ${isDingQue ? 'brightness-50 grayscale-40 opacity-60' : ''}
        ${isNewDraw ? 'ml-3 sm:ml-5' : ''}
      `}
    >
      {/* Authentic High-Res 3D Mahjong Tile Face */}
      <img
        src={imgSrc}
        alt={String(tileId)}
        className="h-full w-full object-contain pointer-events-none drop-shadow-md rounded-md"
        draggable={false}
      />

      {/* DingQue Forbidden Mark */}
      {isDingQue && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-6 w-6 rounded-full bg-red-600/90 flex items-center justify-center shadow-md border border-white/50">
            <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        </div>
      )}

      {/* HongZhong Wildcard Badge */}
      {isWild && !isBack && (
        <span className="absolute -top-1.5 -right-1 z-10 rounded-full border border-amber-300 bg-gradient-to-r from-amber-400 to-rose-600 px-1 py-0.2 font-mono text-[9px] font-black text-black shadow-md animate-pulse">
          百搭
        </span>
      )}
    </div>
  );
};
