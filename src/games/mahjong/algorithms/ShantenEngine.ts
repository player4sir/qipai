/**
 * ShantenEngine.ts
 * 商业级麻将含赖子向听数 (Shanten) 与有效进张 (Ukeire) 评估引擎
 *
 * 核心升级：
 * 1. 纯 34 维频次向量运算 (`calculateShantenFromCounts`)：彻底隔离外部 LegacyTileId 与内部 TileIndex (0~33)，杜绝二次转换错乱
 * 2. 原生赖子抵扣支持 (`wildcardIndex`)：在红中赖子模式下，自动提取赖子数量并动态抵扣面子/搭子/雀头与七对单张
 *
 * 定义：
 * -1 向听：已达成胡牌
 *  0 向听：听牌 (差 1 张胡牌)
 *  1 向听：一向听 (差 1 张听牌)
 *  2+ 向听：二向听及以上
 */

import {
  createCountsVector,
  legacyIdToTileIndex,
  TileIndex,
  tileIndexToLegacyId,
  TIAO_END,
  TIAO_START,
  TONG_END,
  TONG_START,
  TOTAL_TILE_TYPES,
  WAN_END,
  WAN_START,
} from './TileEngine';
import { evaluateHuFromCounts, EvaluatorOptions } from './HandEvaluator';

export interface ShantenOptions {
  allowQiDui?: boolean;
  allowShiSanYao?: boolean;
  wildcardIndex?: number;
}

/**
 * 递归计算常规面子向听数 (4 面子 + 1 雀头)，原生支持赖子动态抵扣
 */
function calculateStandardShantenWithWild(
  rawCounts: number[],
  meldCount: number,
  wildCount = 0
): number {
  const counts = [...rawCounts];
  let minShanten = 8 - 2 * meldCount;

  const evaluateState = (completeSets: number, partialSets: number, hasEye: boolean) => {
    let w = wildCount;
    let cSets = meldCount + completeSets;
    let pSets = partialSets;
    let eye = hasEye;

    // 3 张赖子可直接构成 1 组完整面子
    while (w >= 3 && cSets < 4) {
      w -= 3;
      cSets++;
    }

    // 1 张赖子可将 1 个搭子升级为完整面子
    while (w >= 1 && pSets > 0 && cSets < 4) {
      w--;
      pSets--;
      cSets++;
    }

    // 若尚无雀头且剩余 2 张赖子，可合成雀头或面子
    if (w >= 2 && cSets < 4) {
      w -= 2;
      cSets++;
    }

    // 若尚无雀头且剩余 1 张赖子，可与任意孤张配成雀头
    if (!eye && w >= 1) {
      w--;
      eye = true;
    }

    // 剩余 1 张赖子可与任意孤张配成搭子
    while (w >= 1 && cSets + pSets < 4) {
      w--;
      pSets++;
    }

    if (cSets + pSets > 4) {
      pSets = Math.max(0, 4 - cSets);
    }

    const currentShanten = 8 - 2 * cSets - pSets - (eye ? 1 : 0);
    if (currentShanten < minShanten) {
      minShanten = currentShanten;
    }
  };

  const search = (
    pos: number,
    completeSets: number,
    partialSets: number,
    hasEye: boolean
  ) => {
    evaluateState(completeSets, partialSets, hasEye);
    if (minShanten <= -1) return;
    if (pos >= TOTAL_TILE_TYPES) return;

    if (counts[pos] === 0) {
      search(pos + 1, completeSets, partialSets, hasEye);
      return;
    }

    // 1. 雀头尝试
    if (!hasEye && counts[pos] >= 2) {
      counts[pos] -= 2;
      search(pos, completeSets, partialSets, true);
      counts[pos] += 2;
    }

    // 2. 刻子尝试 (AAA)
    if (counts[pos] >= 3) {
      counts[pos] -= 3;
      search(pos, completeSets + 1, partialSets, hasEye);
      counts[pos] += 3;
    }

    // 3. 顺子尝试 (ABC，仅数牌)
    const isWan = pos >= WAN_START && pos <= WAN_END - 2;
    const isTiao = pos >= TIAO_START && pos <= TIAO_END - 2;
    const isTong = pos >= TONG_START && pos <= TONG_END - 2;

    if ((isWan || isTiao || isTong) && counts[pos + 1] > 0 && counts[pos + 2] > 0) {
      counts[pos]--;
      counts[pos + 1]--;
      counts[pos + 2]--;
      search(pos, completeSets + 1, partialSets, hasEye);
      counts[pos]++;
      counts[pos + 1]++;
      counts[pos + 2]++;
    }

    // 4. 搭子尝试 (对子视为搭子)
    if (counts[pos] >= 2) {
      counts[pos] -= 2;
      search(pos, completeSets, partialSets + 1, hasEye);
      counts[pos] += 2;
    }

    // 5. 两面/边张搭子 (AB)
    const canSeq2 =
      (pos >= WAN_START && pos <= WAN_END - 1) ||
      (pos >= TIAO_START && pos <= TIAO_END - 1) ||
      (pos >= TONG_START && pos <= TONG_END - 1);
    if (canSeq2 && counts[pos + 1] > 0) {
      counts[pos]--;
      counts[pos + 1]--;
      search(pos, completeSets, partialSets + 1, hasEye);
      counts[pos]++;
      counts[pos + 1]++;
    }

    // 6. 嵌张搭子 (AC)
    const canSeq3 =
      (pos >= WAN_START && pos <= WAN_END - 2) ||
      (pos >= TIAO_START && pos <= TIAO_END - 2) ||
      (pos >= TONG_START && pos <= TONG_END - 2);
    if (canSeq3 && counts[pos + 2] > 0) {
      counts[pos]--;
      counts[pos + 2]--;
      search(pos, completeSets, partialSets + 1, hasEye);
      counts[pos]++;
      counts[pos + 2]++;
    }

    // 7. 跳过当前孤张
    search(pos + 1, completeSets, partialSets, hasEye);
  };

  search(0, 0, 0, false);
  return minShanten;
}

/**
 * 计算七对向听数 (支持赖子补对与龙七对四张算两对)
 */
function calculateQiDuiShanten(counts: number[], wildCount = 0): number {
  let pairs = 0;
  let singles = 0;

  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] === 4) {
      pairs += 2;
    } else if (counts[i] === 3) {
      pairs += 1;
      singles += 1;
    } else if (counts[i] === 2) {
      pairs += 1;
    } else if (counts[i] === 1) {
      singles += 1;
    }
  }

  const wildPaired = Math.min(singles, wildCount);
  pairs += wildPaired;
  const remWild = wildCount - wildPaired;
  pairs += Math.floor(remWild / 2);

  return Math.max(-1, 6 - pairs);
}

/**
 * 计算十三幺向听数 (国标模式专用)
 */
function calculateShiSanYaoShanten(counts: number[], wildCount = 0): number {
  const orphanIndices = [
    WAN_START, WAN_END,
    TIAO_START, TIAO_END,
    TONG_START, TONG_END,
    27, 28, 29, 30, // 东南西北
    31, 32, 33,     // 中发白
  ];

  let uniqueOrphans = 0;
  let hasPair = false;

  for (const idx of orphanIndices) {
    if (counts[idx] >= 1) uniqueOrphans++;
    if (counts[idx] >= 2) hasPair = true;
  }

  return Math.max(-1, 13 - uniqueOrphans - (hasPair ? 1 : 0) - wildCount);
}

/**
 * 直接在 34 维频次向量 counts[34] 上计算向听数（零二次 ID 转换）
 */
export function calculateShantenFromCounts(
  rawCounts34: number[],
  meldCount = 0,
  options: ShantenOptions = {}
): number {
  const counts = [...rawCounts34];
  let handTileCount = 0;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    handTileCount += counts[i] || 0;
  }
  const total = handTileCount + meldCount * 3;

  let wildCount = 0;
  if (
    options.wildcardIndex !== undefined &&
    options.wildcardIndex >= 0 &&
    options.wildcardIndex < TOTAL_TILE_TYPES
  ) {
    wildCount = counts[options.wildcardIndex] || 0;
    counts[options.wildcardIndex] = 0;
  }

  // 1. 常规标准型向听数
  let minShanten = calculateStandardShantenWithWild(counts, meldCount, wildCount);

  // 2. 门清七对向听数
  if (options.allowQiDui && meldCount === 0 && (total === 13 || total === 14)) {
    const qiduiShanten = calculateQiDuiShanten(counts, wildCount);
    if (qiduiShanten < minShanten) {
      minShanten = qiduiShanten;
    }
  }

  // 3. 门清十三幺向听数
  if (options.allowShiSanYao && meldCount === 0 && (total === 13 || total === 14)) {
    const yaoShanten = calculateShiSanYaoShanten(counts, wildCount);
    if (yaoShanten < minShanten) {
      minShanten = yaoShanten;
    }
  }

  return minShanten;
}

/**
 * 综合评估手牌向听数 (接收外部十进制牌 ID 数组，单次转换至 counts[34])
 */
export function calculateShanten(
  handTiles: number[],
  meldCount = 0,
  options: ShantenOptions = {}
): number {
  const counts = createCountsVector(handTiles);
  return calculateShantenFromCounts(counts, meldCount, options);
}

/**
 * 听牌待牌与有效进张分析结果
 */
export interface TingWaitInfo {
  waitTile: TileIndex; // 能胡的待牌 (0~33 索引)
  waitTileId: number; // 能胡的待牌 (十进制协议 ID)
  remainingCount: number; // 全桌未现剩余张数 (0 ~ 4)
  fan: number; // 预期胡牌基础番数
  fanNames: string[]; // 番型明细
}

export interface DiscardTingRecommendation {
  discardTile: TileIndex; // 建议打出的牌 (0~33 索引)
  discardTileId: number; // 建议打出的牌 (十进制协议 ID)
  shantenAfterDiscard: number; // 打出后的向听数 (0 代表成功听牌)
  waits: TingWaitInfo[]; // 能胡的待牌列表
  totalRemainingWaits: number; // 所有待牌的全桌剩余张数总和
}

/**
 * 听牌分析器 (全部在 counts[34] 空间内运算，彻底修复原先将 0~33 混入 handTiles 导致的二次转换错乱)
 */
export function analyzeTingWaits(
  handTiles: number[],
  visibleCounts: number[],
  evalOptions: EvaluatorOptions = {}
): DiscardTingRecommendation[] {
  const total = handTiles.length;
  const baseCounts = createCountsVector(handTiles);
  const recommendations: DiscardTingRecommendation[] = [];

  // 情况 A: 已经处于 13 张 (3N + 1) 手牌状态
  if ((total - 1) % 3 === 0) {
    const waits: TingWaitInfo[] = [];
    let totalRemaining = 0;

    for (let w = 0; w < TOTAL_TILE_TYPES; w++) {
      baseCounts[w]++;
      const res = evaluateHuFromCounts(baseCounts, evalOptions);
      baseCounts[w]--;

      if (res.canHu) {
        const inHand = baseCounts[w] || 0;
        const visible = visibleCounts[w] || 0;
        const remain = Math.max(0, 4 - inHand - visible);
        totalRemaining += remain;
        waits.push({
          waitTile: w,
          waitTileId: tileIndexToLegacyId(w),
          remainingCount: remain,
          fan: 1,
          fanNames: [
            res.huPattern === 'qidui'
              ? '七对'
              : res.huPattern === 'shisanyao'
              ? '十三幺'
              : '平胡',
          ],
        });
      }
    }

    if (waits.length > 0) {
      recommendations.push({
        discardTile: -1,
        discardTileId: -1,
        shantenAfterDiscard: 0,
        waits,
        totalRemainingWaits: totalRemaining,
      });
    }
    return recommendations;
  }

  // 情况 B: 摸牌后手握 14 张 (3N + 2) 手牌，在 counts[34] 上遍历打出每种有余量的牌 d
  for (let d = 0; d < TOTAL_TILE_TYPES; d++) {
    if (baseCounts[d] <= 0) continue;
    if (evalOptions.wildcardIndex !== undefined && d === evalOptions.wildcardIndex) continue;

    baseCounts[d]--;
    const waits: TingWaitInfo[] = [];
    let totalRemaining = 0;

    for (let w = 0; w < TOTAL_TILE_TYPES; w++) {
      baseCounts[w]++;
      const res = evaluateHuFromCounts(baseCounts, evalOptions);
      baseCounts[w]--;

      if (res.canHu) {
        const inHandCount = baseCounts[w] || 0;
        const visibleOnTable = visibleCounts[w] || 0;
        const remain = Math.max(0, 4 - (visibleOnTable + inHandCount));

        totalRemaining += remain;
        waits.push({
          waitTile: w,
          waitTileId: tileIndexToLegacyId(w),
          remainingCount: remain,
          fan: 1,
          fanNames: [
            res.huPattern === 'qidui'
              ? '七对'
              : res.huPattern === 'shisanyao'
              ? '十三幺'
              : '平胡',
          ],
        });
      }
    }
    baseCounts[d]++;

    if (waits.length > 0) {
      recommendations.push({
        discardTile: d,
        discardTileId: tileIndexToLegacyId(d),
        shantenAfterDiscard: 0,
        waits,
        totalRemainingWaits: totalRemaining,
      });
    }
  }

  return recommendations.sort((a, b) => b.totalRemainingWaits - a.totalRemainingWaits);
}
