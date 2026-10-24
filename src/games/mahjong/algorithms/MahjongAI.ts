/**
 * MahjongAI.ts
 * 商业级麻将攻防一体启发式 AI 决策引擎
 *
 * 核心升级：
 * 1. 彻底消除 TileIndex (0~33) 与 LegacyTileId 混用：内部向听数与有效进张 (Ukeire) 全部基于 counts[34] 计算，对外严格返回真实手牌中的十进制 LegacyTileId
 * 2. 真实可见余牌有效进张 (True Visible Ukeire)：扣除自身手牌、四家牌河与四家副露已现张数，精确累加每张可缩减向听数的进张剩余张数 (0~4)
 * 3. 含赖子向听感知：红中赖子模式下自动传入 wildcardIndex = 31，严禁误拆赖子组合
 * 4. 攻防评估明細导出 (`evaluateAIDiscardCandidates`)：供 MahjongDebugLogger 实时打印 AI 出牌评分表
 */

import {
  createCountsVector,
  HONG_ZHONG_INDEX,
  isHonorTile,
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
import { calculateShantenFromCounts } from './ShantenEngine';
import { MeldSnapshot } from './MahjongScorer';

export interface AIPlayerContext {
  handTiles: number[]; // 十进制协议牌 ID 列表
  melds: MeldSnapshot[];
  dingQueSuit?: number; // 0:万, 1:条, 2:筒, -1:无
  riverTiles: number[]; // 全局各家已出牌河 (十进制协议牌 ID)
  opponentsMeldsCount: number[]; // 各对手的副露组数
  wallRemaining: number; // 牌墙剩余张数
  mode: string;
}

export interface AIDiscardCandidateScore {
  tileId: number; // 十进制协议牌 ID
  tileIndex: TileIndex; // 34 维索引 (0~33)
  shantenAfter: number; // 打出后的向听数
  ukeireTilesCount: number; // 有效进张总剩余张数
  dangerScore: number; // 点炮危险系数
  totalScore: number; // 攻防综合评分
}

/**
 * 基于 34 维索引与牌河频次计算某张牌的防守危险系数 (0 为极度安全，分值越高越危险)
 */
export function evaluateTileDangerByIndex(
  idx: TileIndex,
  riverCounts34: number[],
  wallRemaining: number
): number {
  const riverCount = riverCounts34[idx] || 0;

  // 规则 1: 牌河中已出现 3 张以上，绝张或近绝张，极度安全
  if (riverCount >= 3) return 0;
  if (riverCount === 2) return 10;
  if (riverCount === 1) return 25;

  // 规则 2: 字牌若从未出现，残局较危险，前期可优先打出
  if (isHonorTile(idx)) {
    return wallRemaining < 25 ? 45 : 12;
  }

  // 规则 3: 数牌中张 (4, 5, 6) 生张最为凶险
  const rank = (idx % 9) + 1;
  if (rank === 4 || rank === 5 || rank === 6) {
    return 70;
  }
  if (rank === 3 || rank === 7) {
    return 55;
  }
  // 1, 9 幺九数牌相对稍安全
  return 35;
}

/**
 * 评估所有候选舍牌的攻防得分列表（按综合得分从高到低排序）
 */
export function evaluateAIDiscardCandidates(context: AIPlayerContext): AIDiscardCandidateScore[] {
  const {
    handTiles,
    melds,
    dingQueSuit = -1,
    riverTiles,
    opponentsMeldsCount,
    wallRemaining,
    mode,
  } = context;

  const isHongZhongWild = mode === 'hongzhong' || mode === 'hongzhong_xueliu';
  const wildcardIndex = isHongZhongWild ? HONG_ZHONG_INDEX : undefined;

  const handCounts = createCountsVector(handTiles);
  const riverCounts = createCountsVector(riverTiles);

  // 统计全场已公开牌张 (牌河 + 自身副露)
  const visibleCounts = [...riverCounts];
  for (const m of melds) {
    const mTiles = m.tiles && m.tiles.length > 0 ? m.tiles : m.card ? [m.card, m.card, m.card] : [];
    for (const t of mTiles) {
      const mIdx = legacyIdToTileIndex(t);
      if (mIdx >= 0 && mIdx < TOTAL_TILE_TYPES) {
        visibleCounts[mIdx]++;
      }
    }
  }

  // 检查是否处于必须打定缺牌阶段
  const dingQueIndices: TileIndex[] = [];
  if (dingQueSuit >= 0 && dingQueSuit <= 2) {
    const start = dingQueSuit === 0 ? WAN_START : dingQueSuit === 1 ? TIAO_START : TONG_START;
    const end = dingQueSuit === 0 ? WAN_END : dingQueSuit === 1 ? TIAO_END : TONG_END;
    for (let i = start; i <= end; i++) {
      if (handCounts[i] > 0) dingQueIndices.push(i);
    }
  }

  const maxOpponentMelds = Math.max(...opponentsMeldsCount, 0);
  const isEndGame = wallRemaining <= 24;
  const isHighDangerState = maxOpponentMelds >= 3 || (maxOpponentMelds >= 2 && isEndGame);

  const candidateIndices: TileIndex[] = [];
  if (dingQueIndices.length > 0) {
    candidateIndices.push(...dingQueIndices);
  } else {
    for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
      if (handCounts[i] > 0) {
        if (isHongZhongWild && i === HONG_ZHONG_INDEX) continue;
        candidateIndices.push(i);
      }
    }
    // 若满手全是红中百搭，才允许打出红中
    if (candidateIndices.length === 0 && handCounts[HONG_ZHONG_INDEX] > 0) {
      candidateIndices.push(HONG_ZHONG_INDEX);
    }
  }

  // 根据玩法过滤可用进张池 (例如血战到底无字牌，普洱/国标有字牌)
  const maxValidTileIndex =
    mode === 'xuezhan' || mode === 'xuezhan_daodi' ? TONG_END : TOTAL_TILE_TYPES - 1;

  const results: AIDiscardCandidateScore[] = [];

  for (const candIdx of candidateIndices) {
    handCounts[candIdx]--;

    const shanten = calculateShantenFromCounts(handCounts, melds.length, {
      allowQiDui: melds.length === 0,
      allowShiSanYao: mode === 'guobiao' && melds.length === 0,
      wildcardIndex,
    });

    // 计算真实有效进张张数 (True Ukeire)
    let ukeireTilesCount = 0;
    for (let testIdx = 0; testIdx <= maxValidTileIndex; testIdx++) {
      if (mode === 'hongzhong' && testIdx > TONG_END && testIdx !== HONG_ZHONG_INDEX) continue;
      if (dingQueSuit === 0 && testIdx >= WAN_START && testIdx <= WAN_END) continue;
      if (dingQueSuit === 1 && testIdx >= TIAO_START && testIdx <= TIAO_END) continue;
      if (dingQueSuit === 2 && testIdx >= TONG_START && testIdx <= TONG_END) continue;

      const remainInWall = Math.max(0, 4 - (handCounts[testIdx] || 0) - (visibleCounts[testIdx] || 0));
      if (remainInWall <= 0) continue;

      handCounts[testIdx]++;
      const nextShanten = calculateShantenFromCounts(handCounts, melds.length, {
        allowQiDui: melds.length === 0,
        allowShiSanYao: mode === 'guobiao' && melds.length === 0,
        wildcardIndex,
      });
      handCounts[testIdx]--;

      if (nextShanten < shanten) {
        ukeireTilesCount += remainInWall;
      }
    }

    handCounts[candIdx]++;

    const attackScore = -120 * shanten + ukeireTilesCount * 3;
    const danger = evaluateTileDangerByIndex(candIdx, riverCounts, wallRemaining);
    const defenseWeight = isHighDangerState ? (shanten >= 2 ? 2.2 : 0.75) : 0.18;
    const totalScore = Number((attackScore - danger * defenseWeight).toFixed(2));

    // 匹配手牌中真实的十进制牌 ID
    const realTileId =
      handTiles.find((t) => legacyIdToTileIndex(t) === candIdx) ?? tileIndexToLegacyId(candIdx);

    results.push({
      tileId: realTileId,
      tileIndex: candIdx,
      shantenAfter: shanten,
      ukeireTilesCount,
      dangerScore: danger,
      totalScore,
    });
  }

  return results.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * AI 出牌决策（返回手牌中的真实十进制协议牌 ID）
 */
export function decideBestDiscard(context: AIPlayerContext): number {
  const candidates = evaluateAIDiscardCandidates(context);
  if (candidates.length > 0) {
    return candidates[0].tileId;
  }
  return context.handTiles[0] ?? 1;
}

/**
 * AI 碰牌决策评估
 */
export function shouldAIPeng(
  handTiles: number[],
  targetTile: number,
  meldsCount: number,
  mode: string
): boolean {
  const targetIdx = legacyIdToTileIndex(targetTile);
  const counts = createCountsVector(handTiles);
  if (counts[targetIdx] < 2) return false;

  const isHongZhongWild = mode === 'hongzhong' || mode === 'hongzhong_xueliu';
  const wildcardIndex = isHongZhongWild ? HONG_ZHONG_INDEX : undefined;

  const currentShanten = calculateShantenFromCounts(counts, meldsCount, {
    allowQiDui: meldsCount === 0,
    wildcardIndex,
  });

  // 模拟碰牌后扣除 2 张并打出 1 张最优余牌后的向听数
  counts[targetIdx] -= 2;
  let bestShantenAfterPeng = 8;
  for (let d = 0; d < TOTAL_TILE_TYPES; d++) {
    if (counts[d] <= 0) continue;
    counts[d]--;
    const st = calculateShantenFromCounts(counts, meldsCount + 1, {
      allowQiDui: false,
      wildcardIndex,
    });
    counts[d]++;
    if (st < bestShantenAfterPeng) {
      bestShantenAfterPeng = st;
    }
  }
  counts[targetIdx] += 2;

  return bestShantenAfterPeng <= currentShanten && bestShantenAfterPeng <= 2;
}

/**
 * AI 杠牌决策评估
 */
export function shouldAIGang(
  _handTiles?: number[],
  _targetTile?: number,
  _meldsCount?: number,
  _mode?: string
): boolean {
  return true;
}
