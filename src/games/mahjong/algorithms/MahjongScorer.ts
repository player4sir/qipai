/**
 * MahjongScorer.ts
 * 商业级麻将多解择优番种与计分结算引擎
 *
 * 核心升级：
 * 1. 全解最高番优先级队列裁定：遍历 HandEvaluator 产出的所有合法面子拆解分支、七对分支与十三幺分支，
 *    自动对比并锁定总番数最高 (totalFan 最大) 的权威拆解方案。
 * 2. 完整覆盖：
 *    - 基础与特殊番：十三幺 (16番)、清七对 (16番)、双龙七对 (16番)、龙七对 (8番)、清大对 (8番)、
 *      大三元 (8番)、小三元 (4番)、七对 (4番)、清一色 (4番)、金钩钓 (4番)、对对胡 (2番)、混一色 (2番)、平胡 (1番)
 *    - 普洱特色加番：茶山根 (手牌/副露中未杠出的4张同牌，每组 ×2)
 *    - 状态乘番：门清 (×2)、自摸 (×2)、杠上开花 (×2)、杠上炮 (×2)、海底捞月 (×2)、抢杠胡 (×2)
 */

import {
  createCountsVector,
  DRAGON_END,
  DRAGON_START,
  HONG_ZHONG_INDEX,
  isHonorTile,
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
import {
  evaluateHuFromCounts,
  HuDecomposition,
  HuValidationResult,
} from './HandEvaluator';

export interface MeldSnapshot {
  type: 'peng' | 'gang' | 'chi' | string;
  card?: number;
  tiles?: number[];
}

export interface ScoreContext {
  mode: 'puer' | 'xuezhan' | 'guobiao' | 'hongzhong' | string;
  isZimo: boolean; // 是否自摸
  isGangShangHua?: boolean; // 杠上开花
  isGangShangPao?: boolean; // 杠上炮
  isHaiDiLaoYue?: boolean; // 海底捞月
  isQiangGangHu?: boolean; // 抢杠胡
  melds?: MeldSnapshot[]; // 已副露的牌组
  isMenQing?: boolean; // 是否门清 (无吃碰明杠)
}

export interface CandidateScoreBreakdown {
  patternType: 'standard' | 'qidui' | 'shisanyao';
  baseFan: number;
  totalFan: number;
  fanNames: string[];
  decomposition?: HuDecomposition;
}

export interface ScoreResult {
  baseFan: number; // 牌型基础番
  totalFan: number; // 最终综合总番数 (含自摸、根、门清等乘数)
  totalMultiplier: number; // 倍率
  fanNames: string[]; // 番型名称列表
  details: { name: string; fanOrMult: string }[];
  puerGenCount: number; // 普洱茶山根数量
  winningDecomposition?: HuDecomposition;
  candidateBreakdowns?: CandidateScoreBreakdown[];
}

/**
 * 检查清一色 (全为同一种数牌: 纯万、纯条或纯筒；红中赖子模式下红中视为百搭不破坏清一色)
 */
export function isQingYiSe(allTiles: number[], wildcardIndex?: number): boolean {
  let hasWan = false;
  let hasTiao = false;
  let hasTong = false;
  let hasHonor = false;

  for (const t of allTiles) {
    const idx = legacyIdToTileIndex(t);
    if (wildcardIndex !== undefined && idx === wildcardIndex) continue;
    if (idx >= WAN_START && idx <= WAN_END) hasWan = true;
    else if (idx >= TIAO_START && idx <= TIAO_END) hasTiao = true;
    else if (idx >= TONG_START && idx <= TONG_END) hasTong = true;
    else if (isHonorTile(idx)) hasHonor = true;
  }

  if (hasHonor) return false;
  const suits = (hasWan ? 1 : 0) + (hasTiao ? 1 : 0) + (hasTong ? 1 : 0);
  return suits === 1;
}

/**
 * 检查混一色 (一种数牌 + 字牌)
 */
export function isHunYiSe(allTiles: number[], wildcardIndex?: number): boolean {
  let hasWan = false;
  let hasTiao = false;
  let hasTong = false;
  let hasHonor = false;

  for (const t of allTiles) {
    const idx = legacyIdToTileIndex(t);
    if (wildcardIndex !== undefined && idx === wildcardIndex) continue;
    if (idx >= WAN_START && idx <= WAN_END) hasWan = true;
    else if (idx >= TIAO_START && idx <= TIAO_END) hasTiao = true;
    else if (idx >= TONG_START && idx <= TONG_END) hasTong = true;
    else if (isHonorTile(idx)) hasHonor = true;
  }

  if (!hasHonor) return false;
  const suits = (hasWan ? 1 : 0) + (hasTiao ? 1 : 0) + (hasTong ? 1 : 0);
  return suits === 1;
}

/**
 * 检查大对子 / 对对胡 (全部面子均为刻子/杠，无顺子)
 */
export function isDuiDuiHu(huRes: HuValidationResult, melds: MeldSnapshot[] = []): boolean {
  for (const m of melds) {
    if (m.type === 'chi') return false;
  }
  if (huRes.allDecompositions && huRes.allDecompositions.length > 0) {
    return huRes.allDecompositions.some((d) => d.sequences.length === 0);
  }
  if (huRes.huPattern === 'standard' && huRes.decomposition) {
    return huRes.decomposition.sequences.length === 0;
  }
  return false;
}

/**
 * 检查金钩钓 (全副露，手牌仅留 1 张牌单钓将胡牌，胡牌瞬间手牌为 2 张)
 */
export function isJinGouDiao(handTilesCount: number): boolean {
  return handTilesCount === 1 || handTilesCount === 2;
}

/**
 * 基于具体面子拆解或频次检查大三元 (中、发、白 全部成刻/杠) 与小三元 (2组刻子 + 1对将)
 */
export function checkSanYuan(
  counts: number[],
  melds: MeldSnapshot[] = [],
  decomp?: HuDecomposition
): { isDaSanYuan: boolean; isXiaoSanYuan: boolean } {
  let dragonKeCount = 0;
  let dragonPairCount = 0;

  for (let d = DRAGON_START; d <= DRAGON_END; d++) {
    let isKe = false;
    let isPair = false;

    for (const m of melds) {
      const c = m.card ?? m.tiles?.[0] ?? 0;
      if (legacyIdToTileIndex(c) === d && (m.type === 'peng' || m.type?.includes('gang'))) {
        isKe = true;
      }
    }

    if (!isKe && decomp) {
      if (decomp.triplets.includes(d)) isKe = true;
      else if (decomp.eye === d) isPair = true;
    } else if (!isKe) {
      const count = counts[d] || 0;
      if (count >= 3) isKe = true;
      else if (count >= 2) isPair = true;
    }

    if (isKe) dragonKeCount++;
    else if (isPair) dragonPairCount++;
  }

  return {
    isDaSanYuan: dragonKeCount === 3,
    isXiaoSanYuan: dragonKeCount === 2 && dragonPairCount >= 1,
  };
}

/**
 * 计算手牌与副露中所有「四张相同牌」（包含暗坎四张）
 * 普洱麻将独创「茶山根」：手牌中有4张同牌即使未开杠也计 1 根 (×2)
 */
export function countChaShanGen(handTiles: TileIndex[], melds: MeldSnapshot[] = []): number {
  const counts = createCountsVector(handTiles);
  let gen = 0;

  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    if (counts[i] === 4) {
      gen++;
    }
  }

  // 手牌 1 张 + 副露碰牌 3 张 (形成事实上的 4 张同牌未杠)
  for (const m of melds) {
    if (m.type === 'peng') {
      const c = m.card ?? m.tiles?.[0] ?? 0;
      const idx = legacyIdToTileIndex(c);
      if (counts[idx] >= 1) {
        gen++;
      }
    }
  }

  return gen;
}

/**
 * 核心番数结算计算器入口（遍历所有候选拆解并锁定最高番解）
 */
export function calculateMahjongScore(
  handTiles: number[],
  winCard: number,
  context: ScoreContext
): ScoreResult {
  const {
    mode,
    isZimo,
    isGangShangHua = false,
    isGangShangPao = false,
    isHaiDiLaoYue = false,
    isQiangGangHu = false,
    melds = [],
    isMenQing = melds.filter((m) => m.type !== 'an_gang' && m.type !== 'hongzhong_gang').length === 0,
  } = context;

  const isHongZhongWild = mode === 'hongzhong' || mode === 'hongzhong_xueliu';
  const wildcardIndex = isHongZhongWild ? HONG_ZHONG_INDEX : undefined;

  // 1. 组合完整获胜手牌与全部牌张
  const fullHand = [...handTiles];
  const allTiles = [...fullHand];
  for (const m of melds) {
    if (m.tiles && m.tiles.length > 0) {
      allTiles.push(...m.tiles);
    } else {
      const c = m.card ?? 0;
      allTiles.push(c, c, c);
      if (m.type?.includes('gang')) allTiles.push(c);
    }
  }

  const handCounts34 = createCountsVector(fullHand);
  const huRes = evaluateHuFromCounts(handCounts34, {
    allowQiDui: melds.length === 0,
    allowShiSanYao: mode === 'guobiao' && melds.length === 0,
    wildcardIndex,
  });

  const isQing = isQingYiSe(allTiles, wildcardIndex);
  const isHun = isHunYiSe(allTiles, wildcardIndex);
  const isJinGou = isJinGouDiao(fullHand.length);
  const hasChiMeld = melds.some((m) => m.type === 'chi');

  // 2. 构建所有候选牌型分支 (Priority Queue Candidates)
  const candidates: Array<{
    patternType: 'standard' | 'qidui' | 'shisanyao';
    baseFan: number;
    baseNames: string[];
    baseDetails: { name: string; fanOrMult: string }[];
    decomposition?: HuDecomposition;
  }> = [];

  // 候选分支 A: 十三幺
  if (huRes.isShiSanYaoValid) {
    candidates.push({
      patternType: 'shisanyao',
      baseFan: 16,
      baseNames: ['十三幺'],
      baseDetails: [{ name: '十三幺', fanOrMult: '16番' }],
    });
  }

  // 候选分支 B: 七对 / 龙七对 / 清七对
  if (huRes.isQiDuiValid && melds.length === 0) {
    const dCount = huRes.qiDuiDragonCount ?? huRes.dragonCount ?? 0;
    if (isQing) {
      const fan = dCount >= 1 ? 32 : 16;
      const name = dCount >= 1 ? '清龙七对' : '清七对';
      candidates.push({
        patternType: 'qidui',
        baseFan: fan,
        baseNames: [name],
        baseDetails: [{ name, fanOrMult: `${fan}番` }],
      });
    } else if (dCount >= 2) {
      candidates.push({
        patternType: 'qidui',
        baseFan: 16,
        baseNames: ['双龙七对'],
        baseDetails: [{ name: '双龙七对', fanOrMult: '16番' }],
      });
    } else if (dCount === 1) {
      candidates.push({
        patternType: 'qidui',
        baseFan: 8,
        baseNames: ['龙七对'],
        baseDetails: [{ name: '龙七对', fanOrMult: '8番' }],
      });
    } else {
      candidates.push({
        patternType: 'qidui',
        baseFan: 4,
        baseNames: ['七对'],
        baseDetails: [{ name: '七对', fanOrMult: '4番' }],
      });
    }
  }

  // 候选分支 C: 遍历所有标准面子拆解 (4面子 + 1雀头)
  const decomps =
    huRes.allDecompositions && huRes.allDecompositions.length > 0
      ? huRes.allDecompositions
      : huRes.decomposition
      ? [huRes.decomposition]
      : [];

  for (const decomp of decomps) {
    const isDecompDuiDui = !hasChiMeld && decomp.sequences.length === 0;
    const sanYuan = checkSanYuan(handCounts34, melds, decomp);
    let bFan = 1;
    const bNames: string[] = [];
    const bDetails: { name: string; fanOrMult: string }[] = [];

    if (isQing && isDecompDuiDui) {
      bFan = 8;
      bNames.push('清大对');
      bDetails.push({ name: '清大对', fanOrMult: '8番' });
    } else if (sanYuan.isDaSanYuan) {
      bFan = 8;
      bNames.push('大三元');
      bDetails.push({ name: '大三元', fanOrMult: '8番' });
    } else if (isQing) {
      bFan = 4;
      bNames.push('清一色');
      bDetails.push({ name: '清一色', fanOrMult: '4番' });
    } else if (sanYuan.isXiaoSanYuan) {
      bFan = 4;
      bNames.push('小三元');
      bDetails.push({ name: '小三元', fanOrMult: '4番' });
    } else if (isDecompDuiDui) {
      bFan = 2;
      bNames.push('对对胡');
      bDetails.push({ name: '对对胡', fanOrMult: '2番' });
      if (isHun) {
        bFan = 4;
        bNames.push('混一色');
        bDetails.push({ name: '混一色', fanOrMult: '×2' });
      }
    } else if (isHun) {
      bFan = 2;
      bNames.push('混一色');
      bDetails.push({ name: '混一色', fanOrMult: '2番' });
    } else {
      bFan = 1;
      bNames.push('平胡');
      bDetails.push({ name: '平胡', fanOrMult: '1番' });
    }

    if (isJinGou) {
      bFan = Math.max(bFan, isQing ? 16 : 4);
      bNames.push('金钩钓');
      bDetails.push({ name: '金钩钓', fanOrMult: '4番' });
    }

    candidates.push({
      patternType: 'standard',
      baseFan: bFan,
      baseNames: bNames,
      baseDetails: bDetails,
      decomposition: decomp,
    });
  }

  // 兜底候选（若无拆解命中时）
  if (candidates.length === 0) {
    candidates.push({
      patternType: 'standard',
      baseFan: 1,
      baseNames: ['平胡'],
      baseDetails: [{ name: '平胡', fanOrMult: '1番' }],
    });
  }

  // 3. 计算普洱特色「茶山根」与全局状态乘子
  const genCount = countChaShanGen(fullHand, melds);

  // 对每个候选分支计算最终总番数并按高番优先排序
  const evaluatedCandidates = candidates.map((cand) => {
    // 若牌型本身已是龙七对/双龙七对，不再重复叠加手牌四张的根乘数，避免同组四张双计
    const effectiveGen =
      cand.patternType === 'qidui' && (huRes.qiDuiDragonCount ?? 0) > 0 ? 0 : genCount;
    let mult = Math.pow(2, effectiveGen);
    if (isZimo) mult *= 2;
    if (isMenQing && mode === 'puer') mult *= 2;
    if (isGangShangHua) mult *= 2;
    if (isGangShangPao) mult *= 2;
    if (isHaiDiLaoYue) mult *= 2;
    if (isQiangGangHu) mult *= 2;

    const totalFan = cand.baseFan * mult;
    return {
      ...cand,
      effectiveGen,
      mult,
      totalFan,
    };
  });

  evaluatedCandidates.sort((a, b) => {
    if (b.totalFan !== a.totalFan) return b.totalFan - a.totalFan;
    if (b.baseFan !== a.baseFan) return b.baseFan - a.baseFan;
    return (b.decomposition?.triplets.length ?? 0) - (a.decomposition?.triplets.length ?? 0);
  });

  const best = evaluatedCandidates[0];
  const fanNames = [...best.baseNames];
  const details = [...best.baseDetails];

  if (best.effectiveGen > 0) {
    const genName = mode === 'puer' ? `茶山根×${best.effectiveGen}` : `根×${best.effectiveGen}`;
    fanNames.push(genName);
    details.push({ name: genName, fanOrMult: `×${Math.pow(2, best.effectiveGen)}` });
  }

  if (isZimo) {
    fanNames.push('自摸');
    details.push({ name: '自摸', fanOrMult: '×2' });
  }
  if (isMenQing && mode === 'puer') {
    fanNames.push('门清');
    details.push({ name: '门清', fanOrMult: '×2' });
  }
  if (isGangShangHua) {
    fanNames.push('杠上开花');
    details.push({ name: '杠上开花', fanOrMult: '×2' });
  }
  if (isGangShangPao) {
    fanNames.push('杠上炮');
    details.push({ name: '杠上炮', fanOrMult: '×2' });
  }
  if (isHaiDiLaoYue) {
    fanNames.push('海底捞月');
    details.push({ name: '海底捞月', fanOrMult: '×2' });
  }
  if (isQiangGangHu) {
    fanNames.push('抢杠胡');
    details.push({ name: '抢杠胡', fanOrMult: '×2' });
  }

  return {
    baseFan: best.baseFan,
    totalFan: best.totalFan,
    totalMultiplier: best.mult,
    fanNames,
    details,
    puerGenCount: best.effectiveGen,
    winningDecomposition: best.decomposition,
    candidateBreakdowns: evaluatedCandidates.map((c) => ({
      patternType: c.patternType,
      baseFan: c.baseFan,
      totalFan: c.totalFan,
      fanNames: c.baseNames,
      decomposition: c.decomposition,
    })),
  };
}
