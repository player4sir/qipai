import {
  FourCardOddsAnalysis,
  NiuniuCard,
  NiuniuDynamicPotOddsSnapshot,
  NiuniuHandResult,
  NiuniuHandType,
  NiuniuPlayerInfo,
  NiuniuPlayMode,
  NiuniuSuit,
  NiuniuTableSnapshot,
} from '../types';

export const SUIT_ORDER: Record<NiuniuSuit, number> = {
  spade: 4, // 黑桃最大
  heart: 3, // 红桃次之
  club: 2, // 梅花
  diamond: 1, // 方块最小
};

export const SUIT_NAMES: Record<NiuniuSuit, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

export const RANK_NAMES: Record<number, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

/**
 * 扑克牌算牛点数映射规则：
 * A=1点，2~9为牌面点数，10/J/Q/K统一计为10点
 */
export function getCardValue(rank: number): number {
  if (rank >= 10) return 10;
  return rank;
}

/**
 * 创建一副标准52张扑克牌（不含大小王）
 */
export function createStandardNiuniuDeck(): NiuniuCard[] {
  const suits: NiuniuSuit[] = ['spade', 'heart', 'club', 'diamond'];
  const deck: NiuniuCard[] = [];
  let id = 0;

  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: id++,
        suit,
        rank,
        value: getCardValue(rank),
      });
    }
  }

  return deck;
}

/**
 * Fisher-Yates 无偏随机洗牌算法
 */
export function shuffleDeck(deck: NiuniuCard[]): NiuniuCard[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 找出牌组中单张最大的牌（先比点数 K>Q>...>A，再比花色 黑桃>红桃>梅花>方块）
 */
export function findMaxCard(cards: NiuniuCard[]): NiuniuCard {
  if (cards.length === 0) {
    throw new Error('手牌不能为空');
  }

  let maxCard = cards[0];
  for (let i = 1; i < cards.length; i++) {
    const current = cards[i];
    if (current.rank > maxCard.rank) {
      maxCard = current;
    } else if (current.rank === maxCard.rank) {
      if (SUIT_ORDER[current.suit] > SUIT_ORDER[maxCard.suit]) {
        maxCard = current;
      }
    }
  }
  return maxCard;
}

/**
 * 根据玩法模式（经典抢庄/通比/经典算牛 vs 疯狂加倍）映射牌型倍数
 */
export function getModeMultiplier(
  handType: NiuniuHandType,
  level: number,
  playMode: NiuniuPlayMode = 'qiangzhuang'
): number {
  if (playMode === 'crazy') {
    // 疯狂加倍商业倍率表：牛五起翻倍，牛牛6倍，五小牛10倍，同花顺牛12倍
    switch (handType) {
      case 'STRAIGHT_FLUSH_NIU':
        return 12;
      case 'FIVE_SMALL_NIU':
        return 10;
      case 'BOMB_NIU':
        return 9;
      case 'GOLD_NIU':
        return 8;
      case 'SILVER_NIU':
      case 'FULL_HOUSE_NIU':
      case 'FLUSH_NIU':
      case 'STRAIGHT_NIU':
        return 7;
      case 'NIU_NIU':
        return 6;
      case 'NIU_9':
        return 5;
      case 'NIU_8':
        return 4;
      case 'NIU_7':
        return 3;
      case 'NIU_6':
      case 'NIU_5':
        return 2;
      default:
        return 1;
    }
  }

  // 标准商业抢庄/通比/经典倍率表
  switch (handType) {
    case 'STRAIGHT_FLUSH_NIU':
    case 'FIVE_SMALL_NIU':
      return 10;
    case 'BOMB_NIU':
      return 8;
    case 'GOLD_NIU':
      return 6;
    case 'SILVER_NIU':
    case 'FULL_HOUSE_NIU':
    case 'FLUSH_NIU':
    case 'STRAIGHT_NIU':
      return 5;
    case 'NIU_NIU':
      return 4;
    case 'NIU_9':
      return 3;
    case 'NIU_8':
    case 'NIU_7':
      return 2;
    default:
      return level >= 0 ? 1 : 1;
  }
}

/**
 * 计算 2 张牛数组合的优选权重（用于同牛数多解 3+2 组合择优：对子优先 > 最大单牌优先）
 */
function scoreBullGroupPreference(bullPair: NiuniuCard[]): number {
  if (bullPair.length !== 2) return 0;
  const [a, b] = bullPair;
  const isPair = a.rank === b.rank ? 10000 : 0;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  const highSuit = a.rank >= b.rank ? SUIT_ORDER[a.suit] : SUIT_ORDER[b.suit];
  return isPair + high * 100 + low * 5 + highSuit;
}

/**
 * 商业化牛牛全牌型综合判定与最优 3+2 分牌求解算法
 * 判定等级：同花顺牛(18) > 五小牛(17) > 炸弹牛(16) > 五花牛(15) > 四花牛(14) > 葫芦牛(13) > 同花牛(12) > 顺子牛(11) > 牛牛(10) > 牛9(9)..牛1(1) > 无牛(0)
 */
export function evaluateNiuniuHand(
  cards: NiuniuCard[],
  playMode: NiuniuPlayMode = 'qiangzhuang'
): NiuniuHandResult {
  if (cards.length !== 5) {
    throw new Error('牛牛算牌必须为严格 5 张牌');
  }

  const sortedCards = [...cards].sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    return SUIT_ORDER[b.suit] - SUIT_ORDER[a.suit];
  });
  const maxCard = findMaxCard(sortedCards);

  // 遍历 C(5,3)=10 种 3+2 组合，同牛数下按对子/最大余牌择优
  let bestBullLevel = -1;
  let bestBullPref = -1;
  let bestTenGroup: NiuniuCard[] = [];
  let bestBullGroup: NiuniuCard[] = [];

  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      for (let k = j + 1; k < 5; k++) {
        const sum3 = cards[i].value + cards[j].value + cards[k].value;
        if (sum3 % 10 === 0) {
          const remainIndices = [0, 1, 2, 3, 4].filter(
            (idx) => idx !== i && idx !== j && idx !== k
          );
          const cRemain1 = cards[remainIndices[0]];
          const cRemain2 = cards[remainIndices[1]];
          const sum2 = (cRemain1.value + cRemain2.value) % 10;
          const bullCount = sum2 === 0 ? 10 : sum2;
          const bullPref = scoreBullGroupPreference([cRemain1, cRemain2]);

          if (
            bullCount > bestBullLevel ||
            (bullCount === bestBullLevel && bullPref > bestBullPref)
          ) {
            bestBullLevel = bullCount;
            bestBullPref = bullPref;
            bestTenGroup = [cards[i], cards[j], cards[k]];
            bestBullGroup = [cRemain1, cRemain2];
          }
        }
      }
    }
  }

  const defaultTen = bestTenGroup.length === 3 ? bestTenGroup : sortedCards.slice(0, 3);
  const defaultBull = bestBullGroup.length === 2 ? bestBullGroup : sortedCards.slice(3, 5);

  // 检查是否同花与是否顺子
  const isFlush = sortedCards.every((c) => c.suit === sortedCards[0].suit);
  const uniqueRanks = new Set(sortedCards.map((c) => c.rank));
  let isStraight = false;
  let straightMaxCard = maxCard;

  if (uniqueRanks.size === 5) {
    const ranksAsc = [...sortedCards].map((c) => c.rank).reverse();
    const isNormalStraight = ranksAsc[4] - ranksAsc[0] === 4;
    const isRoyalStraight =
      ranksAsc[0] === 1 &&
      ranksAsc[1] === 10 &&
      ranksAsc[2] === 11 &&
      ranksAsc[3] === 12 &&
      ranksAsc[4] === 13;
    if (isNormalStraight || isRoyalStraight) {
      isStraight = true;
      if (isRoyalStraight) {
        // 10-J-Q-K-A 皇家顺子中 A 视作最高牌
        const aceCard = sortedCards.find((c) => c.rank === 1)!;
        straightMaxCard = { ...aceCard, rank: 14 };
      } else {
        straightMaxCard = sortedCards[0];
      }
    }
  }

  // 0. 同花顺牛 / 一条龙 (Level 18)：既是同花又是顺子
  if (isFlush && isStraight) {
    return {
      handType: 'STRAIGHT_FLUSH_NIU',
      level: 18,
      multiplier: getModeMultiplier('STRAIGHT_FLUSH_NIU', 18, playMode),
      name: '同花顺牛',
      tenGroup: defaultTen,
      bullGroup: defaultBull,
      maxCard: straightMaxCard,
      optimalReason: '五张同花且点数连续，至尊特殊牌型',
    };
  }

  // 1. 五小牛 (Level 17)：5张牌点数均 <= 4 且总点数 <= 10
  const isFiveSmall =
    sortedCards.every((c) => c.rank <= 4) &&
    sortedCards.reduce((acc, c) => acc + c.value, 0) <= 10;
  if (isFiveSmall) {
    return {
      handType: 'FIVE_SMALL_NIU',
      level: 17,
      multiplier: getModeMultiplier('FIVE_SMALL_NIU', 17, playMode),
      name: '五小牛',
      tenGroup: defaultTen,
      bullGroup: defaultBull,
      maxCard,
      optimalReason: '五张点数均小于5且总和不超过10',
    };
  }

  // 2. 炸弹牛 / 四炸 (Level 16)：4张相同点数
  const rankCountMap: Record<number, NiuniuCard[]> = {};
  for (const c of sortedCards) {
    if (!rankCountMap[c.rank]) rankCountMap[c.rank] = [];
    rankCountMap[c.rank].push(c);
  }
  const fourOfKind = Object.values(rankCountMap).find((group) => group.length === 4);
  if (fourOfKind) {
    const singleCard = sortedCards.find((c) => c.rank !== fourOfKind[0].rank)!;
    return {
      handType: 'BOMB_NIU',
      level: 16,
      multiplier: getModeMultiplier('BOMB_NIU', 16, playMode),
      name: '炸弹牛',
      tenGroup: fourOfKind.slice(0, 3),
      bullGroup: [fourOfKind[3], singleCard],
      maxCard: fourOfKind[0], // 炸弹牛比四张炸弹牌的点数
      optimalReason: '四张同点炸弹牛',
    };
  }

  // 3. 五花牛 / 金牛 (Level 15)：5张牌全部为 J/Q/K
  const isGoldNiu = sortedCards.every((c) => c.rank >= 11);
  if (isGoldNiu) {
    return {
      handType: 'GOLD_NIU',
      level: 15,
      multiplier: getModeMultiplier('GOLD_NIU', 15, playMode),
      name: '五花牛',
      tenGroup: sortedCards.slice(0, 3),
      bullGroup: sortedCards.slice(3, 5),
      maxCard,
      optimalReason: '五张全为J/Q/K花牌',
    };
  }

  // 4. 四花牛 / 银牛 (Level 14)：4张 J/Q/K + 1张 10
  const faceCards = sortedCards.filter((c) => c.rank >= 11);
  const tenCards = sortedCards.filter((c) => c.rank === 10);
  if (faceCards.length === 4 && tenCards.length === 1) {
    return {
      handType: 'SILVER_NIU',
      level: 14,
      multiplier: getModeMultiplier('SILVER_NIU', 14, playMode),
      name: '四花牛',
      tenGroup: faceCards.slice(0, 3),
      bullGroup: [faceCards[3], tenCards[0]],
      maxCard,
      optimalReason: '四张花牌配一张10',
    };
  }

  // 5. 葫芦牛 (Level 13)：3张相同 + 1对相同
  const threeOfKind = Object.values(rankCountMap).find((g) => g.length === 3);
  const pairOfKind = Object.values(rankCountMap).find((g) => g.length === 2);
  if (threeOfKind && pairOfKind) {
    return {
      handType: 'FULL_HOUSE_NIU',
      level: 13,
      multiplier: getModeMultiplier('FULL_HOUSE_NIU', 13, playMode),
      name: '葫芦牛',
      tenGroup: threeOfKind,
      bullGroup: pairOfKind,
      maxCard: threeOfKind[0], // 葫芦牛比三张同点牌的大小
      optimalReason: '三条配一对组成葫芦牛',
    };
  }

  // 6. 同花牛 (Level 12)：5张花色相同
  if (isFlush) {
    return {
      handType: 'FLUSH_NIU',
      level: 12,
      multiplier: getModeMultiplier('FLUSH_NIU', 12, playMode),
      name: '同花牛',
      tenGroup: defaultTen,
      bullGroup: defaultBull,
      maxCard,
      optimalReason: '五张同花色',
    };
  }

  // 7. 顺子牛 (Level 11)：5张点数连续
  if (isStraight) {
    return {
      handType: 'STRAIGHT_NIU',
      level: 11,
      multiplier: getModeMultiplier('STRAIGHT_NIU', 11, playMode),
      name: '顺子牛',
      tenGroup: defaultTen,
      bullGroup: defaultBull,
      maxCard: straightMaxCard,
      optimalReason: '五张点数连续成顺',
    };
  }

  // 8. 牛牛 (level = 10)
  if (bestBullLevel === 10) {
    return {
      handType: 'NIU_NIU',
      level: 10,
      multiplier: getModeMultiplier('NIU_NIU', 10, playMode),
      name: '牛牛',
      tenGroup: bestTenGroup,
      bullGroup: bestBullGroup,
      maxCard,
      optimalReason: '三张凑十且余二张之和亦为10的倍数',
    };
  }

  // 9. 牛一 ~ 牛九 (level = 1..9)
  if (bestBullLevel >= 1 && bestBullLevel <= 9) {
    const types: NiuniuHandType[] = [
      'NO_NIU',
      'NIU_1',
      'NIU_2',
      'NIU_3',
      'NIU_4',
      'NIU_5',
      'NIU_6',
      'NIU_7',
      'NIU_8',
      'NIU_9',
    ];
    const names = ['', '牛一', '牛二', '牛三', '牛四', '牛五', '牛六', '牛七', '牛八', '牛九'];
    const handType = types[bestBullLevel];
    return {
      handType,
      level: bestBullLevel,
      multiplier: getModeMultiplier(handType, bestBullLevel, playMode),
      name: names[bestBullLevel],
      tenGroup: bestTenGroup,
      bullGroup: bestBullGroup,
      maxCard,
      optimalReason:
        bestBullGroup[0]?.rank === bestBullGroup[1]?.rank
          ? '优选余牌成对3+2组合'
          : '优选最大余牌3+2组合',
    };
  }

  // 10. 无牛 (level = 0)
  return {
    handType: 'NO_NIU',
    level: 0,
    multiplier: 1,
    name: '无牛',
    tenGroup: [],
    bullGroup: sortedCards,
    maxCard,
    optimalReason: '无任意三张之和为10的倍数',
  };
}

/**
 * 严格全序无平局比牌算法：
 * 返回值 > 0: a 胜出
 * 返回值 < 0: b 胜出
 */
export function compareHands(
  a: NiuniuHandResult,
  b: NiuniuHandResult
): number {
  if (a.level !== b.level) {
    return a.level - b.level;
  }
  if (a.maxCard.rank !== b.maxCard.rank) {
    return a.maxCard.rank - b.maxCard.rank;
  }
  return SUIT_ORDER[a.maxCard.suit] - SUIT_ORDER[b.maxCard.suit];
}

/**
 * 玩家智能算牛 / 一键分牌辅助器
 */
export function solveOptimalPartition(
  cards: NiuniuCard[],
  playMode: NiuniuPlayMode = 'qiangzhuang'
): {
  hasNiu: boolean;
  handResult: NiuniuHandResult;
  tenGroup: NiuniuCard[];
  bullGroup: NiuniuCard[];
} {
  const handResult = evaluateNiuniuHand(cards, playMode);
  return {
    hasNiu: handResult.level > 0,
    handResult,
    tenGroup: handResult.tenGroup,
    bullGroup: handResult.bullGroup,
  };
}

/**
 * 验证玩家手动点选的 3 张牌是否凑成 10 的倍数，并计算对应的牛数
 */
export function verifyManualThreeCards(
  all5Cards: NiuniuCard[],
  selectedIds: number[]
): {
  selectedCards: NiuniuCard[];
  remainCards: NiuniuCard[];
  sum3: number;
  isValidTenMultiple: boolean;
  bullNumber: number; // 0: 无牛, 1..9: 牛一..牛九, 10: 牛牛
} {
  const validFive = all5Cards.filter((c) => c.rank > 0);
  const selectedCards = validFive.filter((c) => selectedIds.includes(c.id)).slice(0, 3);
  const remainCards = validFive.filter((c) => !selectedIds.includes(c.id));
  const sum3 = selectedCards.reduce((acc, c) => acc + c.value, 0);
  const isValidTenMultiple = selectedCards.length === 3 && sum3 % 10 === 0;
  let bullNumber = 0;
  if (isValidTenMultiple && remainCards.length === 2) {
    const rem = (remainCards[0].value + remainCards[1].value) % 10;
    bullNumber = rem === 0 ? 10 : rem;
  }
  return {
    selectedCards,
    remainCards,
    sum3,
    isValidTenMultiple,
    bullNumber,
  };
}

/**
 * 商业化看牌抢庄：基于前 4 张明牌的 48 张未知牌全组合精确概率与期望分析器
 * 遍历牌堆剩余全部 48 张牌，精确计算成牛率、高倍牛率、5人局预估胜率、期望倍数与最优抢庄/下注策略
 */
export function analyzeFourCardOdds(
  first4Cards: NiuniuCard[],
  playMode: NiuniuPlayMode = 'qiangzhuang'
): FourCardOddsAnalysis {
  const knownCards = first4Cards.filter((c) => c && c.rank >= 1 && c.rank <= 13);
  if (knownCards.length < 4) {
    return {
      niuProb: 65,
      highNiuProb: 32,
      niuNiuPlusProb: 12,
      multiWinProb: 45,
      expectedLevel: 4.8,
      expectedMultiplier: 1.6,
      bestPossibleName: '牛牛',
      recommendedCall: 1,
      recommendedBet: 10,
      distribution: {
        noNiu: 17,
        lowNiu: 16,
        highNiu: 10,
        niuNiuPlus: 5,
      },
    };
  }

  const fullDeck = createStandardNiuniuDeck();
  const knownKeySet = new Set(knownCards.map((c) => `${c.suit}_${c.rank}`));
  const remainingDeck = fullDeck.filter((c) => !knownKeySet.has(`${c.suit}_${c.rank}`));

  let noNiuCount = 0;
  let lowNiuCount = 0;
  let highNiuOnlyCount = 0;
  let niuNiuPlusCount = 0;
  let totalLevel = 0;
  let totalMultiplier = 0;
  let bestResult: NiuniuHandResult | null = null;

  for (const fifthCard of remainingDeck) {
    const res = evaluateNiuniuHand([...knownCards.slice(0, 4), fifthCard], playMode);
    if (res.level === 0) {
      noNiuCount++;
    } else if (res.level <= 6) {
      lowNiuCount++;
    } else if (res.level <= 9) {
      highNiuOnlyCount++;
    } else {
      niuNiuPlusCount++;
    }
    totalLevel += res.level;
    totalMultiplier += res.multiplier;
    if (!bestResult || compareHands(res, bestResult) > 0) {
      bestResult = res;
    }
  }

  const n = remainingDeck.length || 48;
  const niuCount = lowNiuCount + highNiuOnlyCount + niuNiuPlusCount;
  const highNiuCount = highNiuOnlyCount + niuNiuPlusCount;

  const niuProb = Math.round((niuCount / n) * 100);
  const highNiuProb = Math.round((highNiuCount / n) * 100);
  const niuNiuPlusProb = Math.round((niuNiuPlusCount / n) * 100);
  const expectedLevel = Number((totalLevel / n).toFixed(2));
  const expectedMultiplier = Number((totalMultiplier / n).toFixed(2));

  // 单挑基准期望等级约为 4.55，映射为对庄/多人对抗胜率 (12%..96%)
  const singleWinProb = Math.max(0.15, Math.min(0.95, 0.5 + (expectedLevel - 4.55) * 0.068));
  const multiWinProb = Math.round(singleWinProb * 100);

  // 根据期望牌型等级与高倍概率推导最优抢庄倍数 (0, 1, 2, 3, 4)
  let recommendedCall = 0;
  if (expectedLevel >= 7.8 || highNiuProb >= 65 || niuNiuPlusProb >= 30) {
    recommendedCall = 4;
  } else if (expectedLevel >= 6.4 || highNiuProb >= 48 || niuProb === 100) {
    recommendedCall = 3;
  } else if (expectedLevel >= 5.2 || niuProb >= 75) {
    recommendedCall = 2;
  } else if (expectedLevel >= 4.2 || niuProb >= 60) {
    recommendedCall = 1;
  } else {
    recommendedCall = 0;
  }

  // 根据期望牌型等级推导闲家最优下注倍数 (5, 10, 15, 20)
  let recommendedBet = 5;
  if (recommendedCall >= 4) {
    recommendedBet = 20;
  } else if (recommendedCall === 3) {
    recommendedBet = 15;
  } else if (recommendedCall === 2) {
    recommendedBet = 10;
  } else {
    recommendedBet = 5;
  }

  return {
    niuProb,
    highNiuProb,
    niuNiuPlusProb,
    multiWinProb,
    expectedLevel,
    expectedMultiplier,
    bestPossibleName: bestResult?.name || '牛牛',
    recommendedCall,
    recommendedBet,
    distribution: {
      noNiu: noNiuCount,
      lowNiu: lowNiuCount,
      highNiu: highNiuOnlyCount,
      niuNiuPlus: niuNiuPlusCount,
    },
  };
}

/**
 * AI 抢庄期望估值决策算法（基于 48 张剩余牌精确期望 + 微小博弈扰动）
 * 返回推荐抢庄倍数：0 (不抢), 1, 2, 3, 4
 */
export function evaluateCallBankerExpected(
  first4Cards: NiuniuCard[],
  playMode: NiuniuPlayMode = 'qiangzhuang'
): number {
  const odds = analyzeFourCardOdds(first4Cards, playMode);
  // 赋予 AI 15% 的博弈微调，避免完全机械化但保持高商业智商
  if (Math.random() < 0.15) {
    return Math.max(0, Math.min(4, odds.recommendedCall + (Math.random() < 0.5 ? 1 : -1)));
  }
  return odds.recommendedCall;
}

/**
 * AI 闲家下注加倍估值决策（结合自身前 4 张牌精确期望与庄家抢庄气势）
 * 返回下注倍数：5, 10, 15, 20
 */
export function evaluateBetMultiplier(
  first4Cards: NiuniuCard[],
  playMode: NiuniuPlayMode = 'qiangzhuang',
  dealerCallMultiplier: number = 1
): number {
  const odds = analyzeFourCardOdds(first4Cards, playMode);
  // 若庄家高倍抢庄(4倍)且自身期望偏低，保守下 5 倍
  if (dealerCallMultiplier >= 4 && odds.expectedLevel < 6.0) {
    return 5;
  }
  return odds.recommendedBet;
}

/**
 * 抢庄牛牛多人底池赔率与动态胜率偏移核心算法
 * 根据牌桌各座位实时抢庄倍数(callMultiplier)、闲家下注倍数(betMultiplier)与阶段进程，
 * 利用贝叶斯手牌强度信号修正玩家实时动态胜率(dynamicWinProb)，并计算多人底池赔率(potOddsPct)与期望收益(EV)
 */
export function calculateNiuniuMultiPotOdds(params: {
  snapshot: NiuniuTableSnapshot;
  selfPlayer: NiuniuPlayerInfo;
  fourCardOdds?: FourCardOddsAnalysis;
  handResult?: NiuniuHandResult;
  previousWinProb?: number;
}): NiuniuDynamicPotOddsSnapshot {
  const { snapshot, selfPlayer, fourCardOdds, handResult, previousWinProb } = params;
  const baseScore = snapshot.baseScore || 100;
  const activePlayers = snapshot.seats.filter((s): s is NiuniuPlayerInfo => Boolean(s));
  const activeSeats = activePlayers.length || 1;

  const dealerPlayer =
    activePlayers.find((s) => s.isDealer) ||
    (snapshot.dealerSeatId >= 0 ? snapshot.seats[snapshot.dealerSeatId] : null);
  const dealerCallMult = Math.max(1, dealerPlayer?.callMultiplier && dealerPlayer.callMultiplier > 0 ? dealerPlayer.callMultiplier : 1);

  // 1. 计算先验基准胜率 (Base Win Prob)
  let baseWinProb = fourCardOdds?.multiWinProb ?? 50;
  if (handResult && (snapshot.phase === 'SHOWDOWN' || snapshot.phase === 'COMPARE_AND_SETTLE' || snapshot.phase === 'ROUND_RESULT')) {
    // 5张牌揭晓后根据精确牌型等级修正基础胜率 (Level 0..18)
    baseWinProb = Math.round(Math.max(8, Math.min(98, 16 + handResult.level * 5.2)));
  }

  // 2. 统计全场对手的抢庄与下注压力信号，执行贝叶斯动态胜率修正
  const opponents = activePlayers.filter((p) => p.seatIndex !== selfPlayer.seatIndex);
  let opponentSignalPressure = 0;
  let totalBetMultiplierSum = 0;

  for (const opp of opponents) {
    const callM = opp.callMultiplier >= 0 ? opp.callMultiplier : 1;
    const betM = opp.betMultiplier > 0 ? opp.betMultiplier : 5;

    // 抢庄倍数信号：0倍(-1.8%), 1倍(-0.3%), 2倍(+1.0%), 3倍(+2.6%), 4倍(+4.5%)
    if (opp.callMultiplier >= 0) {
      const callPressure = (callM - 1.25) * 1.45;
      opponentSignalPressure += opp.isDealer ? callPressure * 1.55 : callPressure * 0.75;
    }

    // 闲家下注倍数信号：5倍基准，10倍(+1.2%), 15倍(+2.5%), 20倍(+4.0%)
    if (!opp.isDealer && opp.betMultiplier > 0) {
      const betPressure = ((betM - 8.5) / 5) * 1.35;
      opponentSignalPressure += selfPlayer.isDealer ? betPressure * 1.15 : betPressure * 0.55;
    }

    if (!opp.isDealer) {
      totalBetMultiplierSum += betM;
    }
  }

  const selfExpectedMult = handResult?.multiplier ?? fourCardOdds?.expectedMultiplier ?? 1.6;
  const avgHandMult = Math.max(1.4, (selfExpectedMult + 1.85) / 2);

  // 计算自身投入风险与多人总底池规模
  const selfBetMult = selfPlayer.isDealer
    ? Math.max(5, Math.round(totalBetMultiplierSum / Math.max(1, opponents.length)))
    : selfPlayer.betMultiplier > 0
    ? selfPlayer.betMultiplier
    : fourCardOdds?.recommendedBet ?? 5;

  if (!selfPlayer.isDealer) {
    totalBetMultiplierSum += selfBetMult;
  }

  const estimatedTotalPot = Math.round(
    baseScore * dealerCallMult * Math.max(5, totalBetMultiplierSum) * avgHandMult
  );

  const selfCommittedRisk = selfPlayer.isDealer
    ? Math.round(baseScore * dealerCallMult * Math.max(5, totalBetMultiplierSum) * 1.35)
    : Math.round(baseScore * dealerCallMult * selfBetMult * 1.35);

  // 动态胜率 = 先验胜率 - 对手高倍信号压缩
  const dynamicWinProb = Number(
    Math.max(5, Math.min(97, baseWinProb - opponentSignalPressure)).toFixed(1)
  );
  const refPrev = previousWinProb !== undefined ? previousWinProb : baseWinProb;
  const winProbDelta = Number((dynamicWinProb - refPrev).toFixed(1));

  // 多人底池赔率门槛 = 自身风险敞口 / (预估总底池 + 自身风险敞口)
  const potOddsFrac = selfCommittedRisk / Math.max(1, estimatedTotalPot + selfCommittedRisk);
  const potOddsPct = Number((potOddsFrac * 100).toFixed(1));
  const equityEdgePct = Number((dynamicWinProb - potOddsPct).toFixed(1));

  // 计算期望净收益 EV (豆)
  const winRateFrac = dynamicWinProb / 100;
  const potentialGain = selfPlayer.isDealer
    ? Math.round(baseScore * dealerCallMult * Math.max(5, totalBetMultiplierSum) * selfExpectedMult)
    : Math.round(baseScore * dealerCallMult * selfBetMult * selfExpectedMult);
  const expectedEv = Math.round(winRateFrac * potentialGain - (1 - winRateFrac) * selfCommittedRisk);

  // 推导动态最优下注倍数建议
  let optimalMultiplier = fourCardOdds?.recommendedBet ?? 5;
  if (snapshot.phase === 'CALL_BANKER') {
    optimalMultiplier = fourCardOdds?.recommendedCall ?? 1;
  } else {
    if (dynamicWinProb >= 68 && equityEdgePct >= 18) optimalMultiplier = 20;
    else if (dynamicWinProb >= 55 && equityEdgePct >= 8) optimalMultiplier = 15;
    else if (dynamicWinProb >= 44 && equityEdgePct >= 0) optimalMultiplier = 10;
    else optimalMultiplier = 5;
  }

  return {
    phase: snapshot.phase,
    activeSeats,
    dealerSeatId: snapshot.dealerSeatId,
    dealerCallMult,
    totalBetMultiplierSum,
    estimatedTotalPot,
    selfCommittedRisk,
    baseWinProb,
    dynamicWinProb,
    winProbDelta,
    potOddsPct,
    equityEdgePct,
    expectedEv,
    optimalMultiplier,
  };
}


