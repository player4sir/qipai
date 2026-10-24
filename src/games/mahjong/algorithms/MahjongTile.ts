import { MahjongSuit } from '../types';
import {
  buildDeckForMode,
  getTileDisplayName,
  getTileRank as getTileRank34,
  getTileSuit as getTileSuit34,
  HONG_ZHONG_INDEX,
  legacyIdToTileIndex,
  tileIndexToLegacyId,
} from './TileEngine';

export const HONG_ZHONG_TILE = 31;

export const NORMAL_TILES = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, // 万 (Wan: 0)
  11, 12, 13, 14, 15, 16, 17, 18, 19, // 条 (Tiao: 1)
  21, 22, 23, 24, 25, 26, 27, 28, 29, // 筒 (Tong: 2)
];

// 风牌 (41:东, 42:南, 43:西, 44:北) 与 箭牌 (31:中, 46:发, 47:白)
export const HONOR_TILES = [
  41, 42, 43, 44, // 东南西北
  31, 46, 47,     // 中发白
];

let currentMahjongMode: string = 'puer';

export function setCurrentMahjongMode(mode: string): void {
  currentMahjongMode = mode || 'puer';
}

export function getCurrentMahjongMode(): string {
  return currentMahjongMode;
}

export function isHongZhongWildMode(mode?: string): boolean {
  const target = mode ?? currentMahjongMode;
  return target === 'hongzhong' || target === 'hongzhong_xueliu';
}

export function getSuit(tileId: number): MahjongSuit {
  const idx = legacyIdToTileIndex(tileId);
  const s = getTileSuit34(idx);
  if (s >= 0 && s <= 2) return s as MahjongSuit;
  return -1; // 字牌 / 风箭牌统一为 -1
}

export function getRank(tileId: number): number {
  const idx = legacyIdToTileIndex(tileId);
  return getTileRank34(idx);
}

export function isWildcard(tileId: number, mode?: string): boolean {
  // 只有红中赖子模式 (hongzhong / hongzhong_xueliu) 下红中才作为万能百搭牌
  if (!isHongZhongWildMode(mode)) {
    return false;
  }
  const idx = legacyIdToTileIndex(tileId);
  return idx === HONG_ZHONG_INDEX;
}

export function getTileName(tileId: number): string {
  const idx = legacyIdToTileIndex(tileId);
  return getTileDisplayName(idx);
}

export function sortTiles(tiles: number[], isHongzhongWildOrMode: boolean | string = true): number[] {
  const isWildMode =
    typeof isHongzhongWildOrMode === 'string'
      ? isHongZhongWildMode(isHongzhongWildOrMode)
      : isHongzhongWildOrMode;

  return [...tiles].sort((a, b) => {
    const idxA = legacyIdToTileIndex(a);
    const idxB = legacyIdToTileIndex(b);
    const isWildA = isWildMode && idxA === HONG_ZHONG_INDEX;
    const isWildB = isWildMode && idxB === HONG_ZHONG_INDEX;
    if (isWildA && !isWildB) return -1; // 红中百搭置左或置前便于识别
    if (!isWildA && isWildB) return 1;
    return idxA - idxB;
  });
}

/**
 * 按玩法模式生成牌库
 * 1. puer (普洱麻将): 136 张全副 (万条筒 + 东南西北中发白)
 * 2. xuezhan (血战到底): 108 张数字牌 (万条筒)
 * 3. guobiao (大众国标): 136 张标准全副 (万条筒 + 风箭)
 * 4. hongzhong (红中赖子): 112 张 (万条筒 + 4 红中)
 */
export function createDeckForPlayMode(mode: 'puer' | 'xuezhan' | 'guobiao' | 'hongzhong' | string): number[] {
  const deck34 = buildDeckForMode(mode);
  return deck34.map((idx) => tileIndexToLegacyId(idx));
}

/**
 * 遗留兼容生成标准牌库
 */
export function createStandardDeck(includeHongZhong = true): number[] {
  return createDeckForPlayMode(includeHongZhong ? 'hongzhong' : 'xuezhan');
}
