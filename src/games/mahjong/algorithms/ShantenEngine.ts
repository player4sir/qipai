/**
 * ShantenEngine.ts
 * 商业级麻将向听数 (Shanten) 与有效进张 (Ukeire) 评估引擎 (参考 xiyoufang/mahjong)
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
  TIAO_END,
  TIAO_START,
  TONG_END,
  TONG_START,
  TOTAL_TILE_TYPES,
  WAN_END,
  WAN_START,
} from './TileEngine';
import { evaluateHuPattern, EvaluatorOptions } from './HandEvaluator';

/**
 * 递归计算常规面子向听数 (4 面子 + 1 雀头)
 * 标准向听公式：8 - 2*面子数 - 坎/搭子数 - (有对子? 1 : 0)
 */
function calculateStandardShanten(counts: number[], meldCount: number): number {
  let minShanten = 8 - 2 * meldCount;

  const search = (
    pos: number,
    completeSets: number,
    partialSets: number,
    hasEye: boolean
  ) => {
    const totalSets = meldCount + completeSets;
    if (totalSets + partialSets > 4) {
      partialSets = 4 - totalSets;
    }

    const currentShanten = 8 - 2 * (meldCount + completeSets) - partialSets - (hasEye ? 1 : 0);
    if (currentShanten < minShanten) {
      minShanten = currentShanten;
    }

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

    // 7. 不成面子直接跳过孤张
    search(pos + 1, completeSets, partialSets, hasEye);
  };

  search(0, 0, 0, false);
  return minShanten;
}

/**
 * 计算七对向听数 (手牌总数必须为 13 或 14 张)
 * 公式：6 - 对子数 + 种类不足惩罚
 */
function calculateQiDuiShanten(counts: number[], wildCount = 0): number {
  let pairs = 0;
  let uniqueCount = 0;

  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] > 0) uniqueCount++;
  }

  let shanten = 6 - pairs - wildCount;
  if (uniqueCount + wildCount < 7) {
    shanten += 7 - (uniqueCount + wildCount);
  }
  return Math.max(-1, shanten);
}

/**
 * 计算十三幺向听数 (国标模式专用)
 * 公式：13 - 拥有幺九种数 - (是否有幺九雀头 ? 1 : 0) - 赖子数
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
 * 直接基于 34 维频次向量 counts[34] 综合评估向听数（零二次 ID 转换）
 */
export function calculateShantenFromCounts(
  rawCounts: number[],
  meldCount = 0,
  options: { allowQiDui?: boolean; allowShiSanYao?: boolean; wildcardIndex?: number } = {}
): number {
  const counts = [...rawCounts];
  let total = meldCount * 3;
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    total += counts[i] || 0;
  }

  let wildCount = 0;
  if (
    options.wildcardIndex !== undefined &&
    options.wildcardIndex >= 0 &&
    options.wildcardIndex < TOTAL_TILE_TYPES
  ) {
    wildCount = counts[options.wildcardIndex] || 0;
    counts[options.wildcardIndex] = 0;
  }

  // 1. 常规标准型向听数 (每张赖子可减少 1 向听)
  let minShanten = Math.max(-1, calculateStandardShanten(counts, meldCount) - wildCount);

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
 * 综合评估手牌向听数
 */
export function calculateShanten(
  handTiles: TileIndex[],
  meldCount = 0,
  options: { allowQiDui?: boolean; allowShiSanYao?: boolean; wildcardIndex?: number } = {}
): number {
  const counts = createCountsVector(handTiles);
  return calculateShantenFromCounts(counts, meldCount, options);
}

/**
 * 听牌待牌与有效进张分析结果
 */
export interface TingWaitInfo {
  waitTile: TileIndex; // 能胡的待牌 (0..33)
  remainingCount: number; // 全桌未现剩余张数 (0 ~ 4)
  fan: number; // 预期胡牌基础番数
  fanNames: string[]; // 番型明细
}

export interface DiscardTingRecommendation {
  discardTile: TileIndex; // 建议打出的牌
  shantenAfterDiscard: number; // 打出后的向听数 (0 代表成功听牌)
  waits: TingWaitInfo[]; // 能胡的待牌列表
  totalRemainingWaits: number; // 所有待牌的全桌剩余张数总和
}

/**
 * 听牌分析器 (针对 13 张手牌或 14 张摸牌打牌阶段)
 */
export function analyzeTingWaits(
  handTiles: TileIndex[],
  visibleCounts: number[],
  evalOptions: EvaluatorOptions = {}
): DiscardTingRecommendation[] {
  const total = handTiles.length;
  const recommendations: DiscardTingRecommendation[] = [];

  if ((total - 1) % 3 === 0) {
    const waits: TingWaitInfo[] = [];
    let totalRemaining = 0;

    for (let w = 0; w < TOTAL_TILE_TYPES; w++) {
      const testHand = [...handTiles, w];
      const res = evaluateHuPattern(testHand, evalOptions);
      if (res.canHu) {
        const visible = visibleCounts[w] || 0;
        const remain = Math.max(0, 4 - visible);
        totalRemaining += remain;
        waits.push({
          waitTile: w,
          remainingCount: remain,
          fan: 1,
          fanNames: [
            res.huPattern === 'qidui' ? '七对' : res.huPattern === 'shisanyao' ? '十三幺' : '平胡',
          ],
        });
      }
    }

    if (waits.length > 0) {
      recommendations.push({
        discardTile: -1,
        shantenAfterDiscard: 0,
        waits,
        totalRemainingWaits: totalRemaining,
      });
    }
    return recommendations;
  }

  const uniqueDiscards = Array.from(new Set(handTiles.map((t) => legacyIdToTileIndex(t))));

  for (const d of uniqueDiscards) {
    const idx = handTiles.findIndex((t) => legacyIdToTileIndex(t) === d);
    if (idx === -1) continue;

    const remainingHand = [...handTiles];
    remainingHand.splice(idx, 1);

    const waits: TingWaitInfo[] = [];
    let totalRemaining = 0;

    for (let w = 0; w < TOTAL_TILE_TYPES; w++) {
      const testHand = [...remainingHand, w];
      const res = evaluateHuPattern(testHand, evalOptions);
      if (res.canHu) {
        let inHandCount = 0;
        for (const t of remainingHand) {
          if (legacyIdToTileIndex(t) === w) inHandCount++;
        }
        const visibleOnTable = visibleCounts[w] || 0;
        const remain = Math.max(0, 4 - (visibleOnTable + inHandCount));

        totalRemaining += remain;
        waits.push({
          waitTile: w,
          remainingCount: remain,
          fan: 1,
          fanNames: [
            res.huPattern === 'qidui' ? '七对' : res.huPattern === 'shisanyao' ? '十三幺' : '平胡',
          ],
        });
      }
    }

    if (waits.length > 0) {
      recommendations.push({
        discardTile: d,
        shantenAfterDiscard: 0,
        waits,
        totalRemainingWaits: totalRemaining,
      });
    }
  }

  return recommendations.sort((a, b) => b.totalRemainingWaits - a.totalRemainingWaits);
}
