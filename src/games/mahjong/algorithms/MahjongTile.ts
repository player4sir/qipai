import { MahjongSuit } from '../types';
import {
  buildDeckForMode,
  getTileNameById,
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

// 当前活跃牌桌玩法模式上下文（默认 'puer' 普洱麻将，仅在 'hongzhong' / 'hongzhong_xueliu' 下红中作为百搭）
let currentActiveMahjongMode = 'puer';

export function setCurrentMahjongMode(mode?: string): void {
  if (mode) {
    currentActiveMahjongMode = mode;
  }
}

export function getCurrentMahjongMode(): string {
  return currentActiveMahjongMode;
}

export function isHongZhongWildMode(mode?: string): boolean {
  const effectiveMode = mode ?? currentActiveMahjongMode;
  return effectiveMode === 'hongzhong' || effectiveMode === 'hongzhong_xueliu';
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

/**
 * 判断某张牌在指定模式下是否为百搭赖子
 * 严格遵循 Confirmed Decision 2：仅在红中赖子模式 (hongzhong / hongzhong_xueliu) 下红中才作为百搭！
 */
export function isWildcard(tileId: number, mode?: string): boolean {
  if (!isHongZhongWildMode(mode)) {
    return false;
  }
  const idx = legacyIdToTileIndex(tileId);
  return idx === HONG_ZHONG_INDEX;
}

/**
 * 获取十进制牌 ID 对应的标准中文名称（修复原先二次调用 legacyIdToTileIndex 导致的跨花色名称错乱）
 */
export function getTileName(tileId: number): string {
  return getTileNameById(tileId);
}

export function sortTiles(tiles: number[], modeOrWild?: string | boolean): number[] {
  const hongzhongWild =
    typeof modeOrWild === 'boolean' ? modeOrWild : isHongZhongWildMode(modeOrWild);
  return [...tiles].sort((a, b) => {
    const idxA = legacyIdToTileIndex(a);
    const idxB = legacyIdToTileIndex(b);
    if (hongzhongWild) {
      const isWildA = idxA === HONG_ZHONG_INDEX;
      const isWildB = idxB === HONG_ZHONG_INDEX;
      if (isWildA && !isWildB) return 1;
      if (!isWildA && isWildB) return -1;
    }
    return idxA - idxB;
  });
}

/**
 * 按玩法模式生成十进制协议牌库
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
