/**
 * MahjongScorer.ts
 * 商业级麻将番种与全解最高番结算引擎 (参考 xiyoufang/mahjong)
 *
 * 覆盖：
 * 1. 基础牌型番：平胡 (1番)、对对胡/大对子 (2番)、七对 (4番)、龙七对 (8番)、双龙七对 (16番)、十三幺 (16番)
 * 2. 花色番：清一色 (4番)、混一色 (2番)、清大对 (8番)、清七对 (16番)
 * 3. 普洱特色加番：茶山根 (手牌/副露中未杠出的4张相同牌，每组 ×2)
 * 4. 全解最高番选择 (Highest-Fan Decomposition Selection)：对 HandEvaluator 返回的所有合法面子拆解与七对/十三幺分别计番，取总番最高解
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
import { evaluateHuPattern, HuDecomposition, HuValidationResult } from './HandEvaluator';

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
 * 检查清一色 (全为同一种数牌: 纯万、纯条或纯筒，支持忽略万能赖子)
 */
export function isQingYiSe(allTiles: TileIndex[], wildcardIndex?: number): boolean {
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
 * 检查混一色 (一种数牌 + 字牌，支持忽略万能赖子)
 */
export function isHunYiSe(allTiles: TileIndex[], wildcardIndex?: number): boolean {
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
 * 检查金钩钓 (全副露，手牌仅留 1~2 张牌单钓将胡牌)
 */
export function isJinGouDiao(handTilesCount: number): boolean {
  return handTilesCount === 1 || handTilesCount === 2;
}

/**
 * 检查大三元 (中、发、白 全部成刻/杠) 与小三元 (2组刻子 + 1对将)
 */
export function checkSanYuan(
  counts: number[],
  melds: MeldSnapshot[] = []
): { isDaSanYuan: boolean; isXiaoSanYuan: boolean } {
  let dragonKeCount = 0;
  let dragonPairCount = 0;

  for (let d = DRAGON_START; d <= DRAGON_END; d++) {
    let count = counts[d] || 0;
    for (const m of melds) {
      const c = m.card ?? m.tiles?.[0] ?? 0;
      if (legacyIdToTileIndex(c) === d && (m.type === 'peng' || m.type.includes('gang'))) {
        count += 3;
      }
    }
    if (count >= 3) dragonKeCount++;
    else if (count >= 2) dragonPairCount++;
  }

  return {
    isDaSanYuan: dragonKeCount === 3,
    isXiaoSanYuan: dragonKeCount === 2 && dragonPairCount >= 1,
  };
}

/**
 * 计算手牌与副露中所有「四张相同牌」（包含暗坎四张与暗杠）
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

  for (const m of melds) {
    if (m.type === 'peng') {
      const c = m.card ?? m.tiles?.[0] ?? 0;
      const idx = legacyIdToTileIndex(c);
      if (counts[idx] === 1) {
        gen++;
      }
    }
  }

  return gen;
}

/**
 * 核心番数结算计算器入口（遍历全部候选拆解，锁定最高番解）
 */
export function calculateMahjongScore(
  handTiles: TileIndex[],
  _winCard: TileIndex,
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

  const fullHand = [...handTiles];
  const allTiles = [...fullHand];
  for (const m of melds) {
    if (m.tiles && m.tiles.length > 0) {
      allTiles.push(...m.tiles);
    } else {
      const c = m.card ?? 0;
      allTiles.push(c, c, c);
      if (m.type.includes('gang')) allTiles.push(c);
    }
  }

  const huRes = evaluateHuPattern(fullHand, {
    allowQiDui: melds.length === 0,
    allowShiSanYao: mode === 'guobiao' && melds.length === 0,
    wildcardIndex,
  });

  const isQing = isQingYiSe(allTiles, wildcardIndex);
  const isHun = isHunYiSe(allTiles, wildcardIndex);
  const isJinGou = isJinGouDiao(handTiles.length) && melds.length === 4;
  const sanYuan = checkSanYuan(createCountsVector(fullHand), melds);
  const genCount = countChaShanGen(fullHand, melds);

  // 计算通用状态乘数
  let statusMultiplier = Math.pow(2, genCount);
  const statusFanNames: string[] = [];
  const statusDetails: { name: string; fanOrMult: string }[] = [];

  if (genCount > 0) {
    const genName = mode === 'puer' ? `茶山根×${genCount}` : `根×${genCount}`;
    statusFanNames.push(genName);
    statusDetails.push({ name: genName, fanOrMult: `×${Math.pow(2, genCount)}` });
  }
  if (isZimo) {
    statusMultiplier *= 2;
    statusFanNames.push('自摸');
    statusDetails.push({ name: '自摸', fanOrMult: '×2' });
  }
  if (isMenQing && mode === 'puer') {
    statusMultiplier *= 2;
    statusFanNames.push('门清');
    statusDetails.push({ name: '门清', fanOrMult: '×2' });
  }
  if (isGangShangHua) {
    statusMultiplier *= 2;
    statusFanNames.push('杠上开花');
    statusDetails.push({ name: '杠上开花', fanOrMult: '×2' });
  }
  if (isGangShangPao) {
    statusMultiplier *= 2;
    statusFanNames.push('杠上炮');
    statusDetails.push({ name: '杠上炮', fanOrMult: '×2' });
  }
  if (isHaiDiLaoYue) {
    statusMultiplier *= 2;
    statusFanNames.push('海底捞月');
    statusDetails.push({ name: '海底捞月', fanOrMult: '×2' });
  }
  if (isQiangGangHu) {
    statusMultiplier *= 2;
    statusFanNames.push('抢杠胡');
    statusDetails.push({ name: '抢杠胡', fanOrMult: '×2' });
  }

  const candidateBreakdowns: CandidateScoreBreakdown[] = [];

  // 候选 1：十三幺
  if (huRes.isShiSanYaoValid || huRes.huPattern === 'shisanyao') {
    const baseFan = 16;
    candidateBreakdowns.push({
      patternType: 'shisanyao',
      baseFan,
      totalFan: baseFan * statusMultiplier,
      fanNames: ['十三幺', ...statusFanNames],
    });
  }

  // 候选 2：七对 / 龙七对 / 清七对
  if (huRes.isQiDuiValid || huRes.huPattern === 'qidui') {
    const qDragon = huRes.qiDuiDragonCount ?? huRes.dragonCount;
    let baseFan = 4;
    let qName = '七对';
    if (isQing && qDragon >= 1) {
      baseFan = 32;
      qName = '清龙七对';
    } else if (isQing) {
      baseFan = 16;
      qName = '清七对';
    } else if (qDragon >= 2) {
      baseFan = 16;
      qName = '双龙七对';
    } else if (qDragon === 1) {
      baseFan = 8;
      qName = '龙七对';
    }
    candidateBreakdowns.push({
      patternType: 'qidui',
      baseFan,
      totalFan: baseFan * statusMultiplier,
      fanNames: [qName, ...statusFanNames],
    });
  }

  // 候选 3：遍历全部标准面子拆解分支，评估每个拆解的番数
  const decomps =
    huRes.allDecompositions && huRes.allDecompositions.length > 0
      ? huRes.allDecompositions
      : huRes.decomposition
      ? [huRes.decomposition]
      : [];

  const hasChiMeld = melds.some((m) => m.type === 'chi');

  for (const decomp of decomps) {
    const isDecompDuiDui = !hasChiMeld && decomp.sequences.length === 0;
    let baseFan = 1;
    const names: string[] = [];

    if (isQing && isDecompDuiDui) {
      baseFan = 8;
      names.push('清大对');
    } else if (sanYuan.isDaSanYuan) {
      baseFan = 8;
      names.push('大三元');
    } else if (isQing) {
      baseFan = 4;
      names.push('清一色');
    } else if (sanYuan.isXiaoSanYuan) {
      baseFan = 4;
      names.push('小三元');
    } else if (isDecompDuiDui) {
      baseFan = 2;
      names.push('对对胡');
    } else if (isHun) {
      baseFan = 2;
      names.push('混一色');
    } else {
      baseFan = 1;
      names.push('平胡');
    }

    if (isJinGou) {
      baseFan = Math.max(baseFan, 4);
      if (!names.includes('金钩钓')) names.push('金钩钓');
    }

    candidateBreakdowns.push({
      patternType: 'standard',
      baseFan,
      totalFan: baseFan * statusMultiplier,
      fanNames: [...names, ...statusFanNames],
      decomposition: decomp,
    });
  }

  // 兜底：若没有任何拆解（防御性保底）
  if (candidateBreakdowns.length === 0) {
    const fallbackBase = isQing ? 4 : isHun ? 2 : 1;
    const fallbackName = isQing ? '清一色' : isHun ? '混一色' : '平胡';
    candidateBreakdowns.push({
      patternType: 'standard',
      baseFan: fallbackBase,
      totalFan: fallbackBase * statusMultiplier,
      fanNames: [fallbackName, ...statusFanNames],
    });
  }

  // 按 totalFan 降序排列，锁定最高番拆解
  candidateBreakdowns.sort((a, b) => b.totalFan - a.totalFan);
  const best = candidateBreakdowns[0];

  const primaryTypeName = best.fanNames[0] || '平胡';
  const details: { name: string; fanOrMult: string }[] = [
    { name: primaryTypeName, fanOrMult: `${best.baseFan}番` },
    ...statusDetails,
  ];

  return {
    baseFan: best.baseFan,
    totalFan: best.totalFan,
    totalMultiplier: statusMultiplier,
    fanNames: best.fanNames,
    details,
    puerGenCount: genCount,
    winningDecomposition: best.decomposition,
    candidateBreakdowns,
  };
}
