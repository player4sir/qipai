import {
  LaoYanCaiCard,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandCategory,
  LaoYanCaiHandResult,
  LaoYanCaiPlayMode,
  LaoYanCaiSuit,
} from '../types.js';

const SUITS: LaoYanCaiSuit[] = ['spade', 'heart', 'club', 'diamond'];

const SUIT_WEIGHT: Record<LaoYanCaiSuit, number> = {
  spade: 4,
  heart: 3,
  club: 2,
  diamond: 1,
};

const CATEGORY_PRIORITY: Record<LaoYanCaiHandCategory, number> = {
  BAOZI: 900,
  STRAIGHT_FLUSH: 800,
  SANGONG: 700,
  ZHAKAI_9: 650,
  ZHAKAI_8: 600,
  SANYAN: 400,
  SHUANGYAN: 350,
  PAIR_2: 320,
  NORMAL: 100,
};

export function getCardPoint(rank: number): number {
  if (rank <= 0 || rank >= 10) return 0;
  return rank;
}

export function createStandardLaoYanCaiDeck(): LaoYanCaiCard[] {
  const deck: LaoYanCaiCard[] = [];
  let id = 1;
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        id: id++,
        suit,
        rank,
        point: getCardPoint(rank),
      });
    }
  }
  return deck;
}

export function shuffleLaoYanCaiDeck(deck: LaoYanCaiCard[]): LaoYanCaiCard[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function isThreeCardStraight(ranks: number[]): boolean {
  if (ranks.length !== 3) return false;
  const sorted = [...ranks].sort((a, b) => a - b);
  if (sorted[0] + 1 === sorted[1] && sorted[1] + 1 === sorted[2]) {
    return true;
  }
  // Q-K-A straight (1, 12, 13)
  if (sorted[0] === 1 && sorted[1] === 12 && sorted[2] === 13) {
    return true;
  }
  return false;
}

export function evaluateLaoYanCaiHand(
  rawCards: LaoYanCaiCard[],
  playMode: LaoYanCaiPlayMode = 'kunming',
  declaredZhaKai: boolean = false
): LaoYanCaiHandResult {
  const validCards = (rawCards || []).filter((c) => c && c.rank >= 1 && c.rank <= 13);
  const cardCount = validCards.length;

  if (cardCount === 0) {
    return {
      category: 'NORMAL',
      name: '未发牌',
      badgeText: '1倍',
      points: 0,
      multiplier: 1,
      cardCount: 0,
      isBaozi: false,
      isStraightFlush: false,
      isSanGong: false,
      isSuited: false,
      isPair: false,
      isZhaKai: false,
      canZhaKai: false,
      highRank: 0,
      highSuitWeight: 0,
      cards: [],
    };
  }

  const rawSum = validCards.reduce((acc, c) => acc + getCardPoint(c.rank), 0);
  const points = rawSum % 10;

  // High card sorting (K=13 > Q=12 > ... > A=1, then Spade > Heart > Club > Diamond)
  const sortedByPower = [...validCards].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return (SUIT_WEIGHT[b.suit] || 0) - (SUIT_WEIGHT[a.suit] || 0);
  });
  const highCard = sortedByPower[0];
  const highRank = highCard ? highCard.rank : 0;
  const highSuitWeight = highCard ? SUIT_WEIGHT[highCard.suit] || 0 : 0;

  const isSuited =
    cardCount >= 2 && validCards.every((c) => c.suit === validCards[0].suit);
  const isPair =
    cardCount === 2 && validCards[0].rank === validCards[1].rank;
  const isBaozi =
    cardCount === 3 &&
    validCards[0].rank === validCards[1].rank &&
    validCards[1].rank === validCards[2].rank;
  const isSanGong =
    cardCount === 3 &&
    validCards.every((c) => c.rank >= 11 && c.rank <= 13) &&
    !isBaozi;
  const isStraightFlush =
    cardCount === 3 &&
    isSuited &&
    isThreeCardStraight(validCards.map((c) => c.rank));

  const canZhaKai = cardCount === 2 && (points === 8 || points === 9);
  const isZhaKai = canZhaKai && declaredZhaKai;

  const isCrazy = playMode === 'crazy';

  // 1. 豹子 (Three of a Kind)
  if (isBaozi) {
    const mult = isCrazy ? 8 : 5;
    const rankLabels: Record<number, string> = {
      1: 'A',
      11: 'J',
      12: 'Q',
      13: 'K',
    };
    const rLabel = rankLabels[validCards[0].rank] || String(validCards[0].rank);
    return {
      category: 'BAOZI',
      name: `${rLabel}豹子`,
      badgeText: `豹子·${mult}倍`,
      points,
      multiplier: mult,
      cardCount,
      isBaozi: true,
      isStraightFlush: false,
      isSanGong: false,
      isSuited: false,
      isPair: false,
      isZhaKai: false,
      canZhaKai: false,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 2. 同花顺 (Straight Flush)
  if (isStraightFlush) {
    const mult = isCrazy ? 6 : 4;
    return {
      category: 'STRAIGHT_FLUSH',
      name: '同花顺',
      badgeText: `顺金·${mult}倍`,
      points,
      multiplier: mult,
      cardCount,
      isBaozi: false,
      isStraightFlush: true,
      isSanGong: false,
      isSuited: true,
      isPair: false,
      isZhaKai: false,
      canZhaKai: false,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 3. 三公 (Three Face Cards J/Q/K)
  if (isSanGong) {
    const mult = isCrazy ? 4 : 3;
    return {
      category: 'SANGONG',
      name: '三公',
      badgeText: `三公·${mult}倍`,
      points: 9, // Treated as top tier above normal points
      multiplier: mult,
      cardCount,
      isBaozi: false,
      isStraightFlush: false,
      isSanGong: true,
      isSuited,
      isPair: false,
      isZhaKai: false,
      canZhaKai: false,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 4. 2-Card Natural ZhaKai (天牌炸开 8点 / 9点)
  if (cardCount === 2 && isZhaKai) {
    const mult = isSuited || isPair ? (isCrazy ? 3 : 2) : 1;
    const suffix = isSuited ? '双腌' : isPair ? '对子' : '';
    const cat: LaoYanCaiHandCategory = points === 9 ? 'ZHAKAI_9' : 'ZHAKAI_8';
    return {
      category: cat,
      name: `天牌${points}点${suffix}炸开`,
      badgeText: `炸开·${mult}倍`,
      points,
      multiplier: mult,
      cardCount,
      isBaozi: false,
      isStraightFlush: false,
      isSanGong: false,
      isSuited,
      isPair,
      isZhaKai: true,
      canZhaKai: true,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 5. 3-Card Suited (三腌 / 同花三张)
  if (cardCount === 3 && isSuited) {
    const mult = 3;
    const ptName = points === 0 ? '瘪十' : `${points}点`;
    return {
      category: 'SANYAN',
      name: `三腌·${ptName}`,
      badgeText: `三腌·${mult}倍`,
      points,
      multiplier: mult,
      cardCount,
      isBaozi: false,
      isStraightFlush: false,
      isSanGong: false,
      isSuited: true,
      isPair: false,
      isZhaKai: false,
      canZhaKai: false,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 6. 2-Card Suited (双腌) or Pair (对子)
  if (cardCount === 2 && (isSuited || isPair)) {
    const mult = 2;
    const ptName = points === 0 ? '瘪十' : `${points}点`;
    const tag = isSuited ? '双腌' : '对子';
    return {
      category: isSuited ? 'SHUANGYAN' : 'PAIR_2',
      name: `${tag}·${ptName}`,
      badgeText: `${tag}·${mult}倍`,
      points,
      multiplier: mult,
      cardCount,
      isBaozi: false,
      isStraightFlush: false,
      isSanGong: false,
      isSuited,
      isPair,
      isZhaKai: false,
      canZhaKai,
      highRank,
      highSuitWeight,
      cards: validCards,
    };
  }

  // 7. Standard Point Hand (0 ~ 9 points)
  const pointLabel = points === 0 ? '瘪十 (0点)' : `${points}点`;
  return {
    category: 'NORMAL',
    name: pointLabel,
    badgeText: '1倍',
    points,
    multiplier: 1,
    cardCount,
    isBaozi: false,
    isStraightFlush: false,
    isSanGong: false,
    isSuited,
    isPair,
    isZhaKai: false,
    canZhaKai,
    highRank,
    highSuitWeight,
    cards: validCards,
  };
}

/**
 * Compares two evaluated LaoYanCai hands.
 * Returns > 0 if handA beats handB, < 0 if handB beats handA.
 */
export function compareLaoYanCaiHands(
  handA: LaoYanCaiHandResult,
  handB: LaoYanCaiHandResult
): number {
  const isSpecialTier = (cat: LaoYanCaiHandCategory) =>
    cat === 'BAOZI' ||
    cat === 'STRAIGHT_FLUSH' ||
    cat === 'SANGONG' ||
    cat === 'ZHAKAI_9' ||
    cat === 'ZHAKAI_8';

  const specA = isSpecialTier(handA.category);
  const specB = isSpecialTier(handB.category);

  if (specA || specB) {
    const prioA = CATEGORY_PRIORITY[handA.category];
    const prioB = CATEGORY_PRIORITY[handB.category];
    if (prioA !== prioB) return prioA - prioB;
  }

  // Compare modulo-10 points (0 ~ 9)
  if (handA.points !== handB.points) {
    return handA.points - handB.points;
  }

  // Same points: 2-card natural beats 3-card drawn hand of the same point value
  if (handA.cardCount !== handB.cardCount) {
    return handB.cardCount - handA.cardCount;
  }

  // Same points & card count: higher multiplier category wins (三腌 > 双腌 > 普通)
  if (handA.multiplier !== handB.multiplier) {
    return handA.multiplier - handB.multiplier;
  }

  // Tie-breaker 1: Highest single card rank (K=13 > ... > A=1)
  if (handA.highRank !== handB.highRank) {
    return handA.highRank - handB.highRank;
  }

  // Tie-breaker 2: Highest card suit (Spade > Heart > Club > Diamond)
  return handA.highSuitWeight - handB.highSuitWeight;
}

/**
 * Exact 50-card Combinatorial Draw-3rd-Card Odds Engine for Yunnan LaoYanCai.
 * Evaluates all remaining cards in the shoe (or standard 50-card complement) to
 * compute exact probabilities of point improvement, 7/8/9 high points, 3x/5x special hands, and busting.
 */
export function analyzeLaoYanCaiDrawOdds(
  twoCards: LaoYanCaiCard[],
  playMode: LaoYanCaiPlayMode = 'kunming',
  remainingDeck?: LaoYanCaiCard[]
): LaoYanCaiDrawOdds {
  const validTwo = (twoCards || []).filter((c) => c && c.rank >= 1 && c.rank <= 13);
  const currentEval = evaluateLaoYanCaiHand(validTwo, playMode, false);

  let pool: LaoYanCaiCard[];
  if (remainingDeck && remainingDeck.length > 0) {
    pool = remainingDeck;
  } else {
    const full = createStandardLaoYanCaiDeck();
    const usedIds = new Set(validTwo.map((c) => c.id));
    pool = full.filter((c) => !usedIds.has(c.id));
  }

  const total = Math.max(1, pool.length);
  let improveCount = 0;
  let highPointsCount = 0;
  let specialHandCount = 0;
  let dropCount = 0;
  let sumPoints = 0;
  let sumMultipliers = 0;

  for (const cand of pool) {
    const nextHand = [...validTwo, cand];
    const res = evaluateLaoYanCaiHand(nextHand, playMode, false);
    const effectivePts =
      res.isBaozi || res.isStraightFlush || res.isSanGong ? 9.5 : res.points;

    sumPoints += effectivePts;
    sumMultipliers += res.multiplier;

    if (
      res.isBaozi ||
      res.isStraightFlush ||
      res.isSanGong ||
      res.category === 'SANYAN'
    ) {
      specialHandCount++;
    }

    if (
      res.isBaozi ||
      res.isStraightFlush ||
      res.isSanGong ||
      res.points > currentEval.points
    ) {
      improveCount++;
    } else if (res.points < currentEval.points) {
      dropCount++;
    }

    if (
      res.isBaozi ||
      res.isStraightFlush ||
      res.isSanGong ||
      res.points >= 7
    ) {
      highPointsCount++;
    }
  }

  const improveProbability = Number(((improveCount / total) * 100).toFixed(1));
  const highPointsProbability = Number(((highPointsCount / total) * 100).toFixed(1));
  const specialHandProbability = Number(((specialHandCount / total) * 100).toFixed(1));
  const bustOrDropProbability = Number(((dropCount / total) * 100).toFixed(1));
  const expectedPointsAfterDraw = Number((sumPoints / total).toFixed(2));
  const expectedMultiplierAfterDraw = Number((sumMultipliers / total).toFixed(2));

  let recommendedAction: 'ZHAKAI' | 'LAO' | 'BULAO' = 'BULAO';
  let recommendationReason = '当前点数稳健，建议【不捞】守牌';

  if (currentEval.canZhaKai) {
    recommendedAction = 'ZHAKAI';
    recommendationReason = `首轮天牌 ${currentEval.points} 点，强烈建议直接【炸开】锁定胜局`;
  } else if (currentEval.points <= 4) {
    recommendedAction = 'LAO';
    recommendationReason = `当前仅 ${currentEval.points} 点，捞牌提升率 ${improveProbability}% (期望 ${expectedPointsAfterDraw} 点)，建议果断【捞腌菜】`;
  } else if (currentEval.points === 5) {
    if (currentEval.isSuited || expectedPointsAfterDraw >= 5.0) {
      recommendedAction = 'LAO';
      recommendationReason = currentEval.isSuited
        ? `同花 5 点可搏【三腌 3倍】，改善率 ${improveProbability}%，建议【捞腌菜】`
        : `5 点进退皆可，捞牌期望 ${expectedPointsAfterDraw} 点，可搏高点`;
    } else {
      recommendedAction = 'BULAO';
      recommendationReason = `5 点中庸，捞牌有 ${bustOrDropProbability}% 概率变小，建议稳守【不捞】`;
    }
  } else {
    recommendedAction = 'BULAO';
    recommendationReason = `当前已有 ${currentEval.points} 点高分，捞牌掉点率高达 ${bustOrDropProbability}%，切勿贪牌`;
  }

  return {
    currentPoints: currentEval.points,
    remainingDeckSize: total,
    improveProbability,
    highPointsProbability,
    specialHandProbability,
    bustOrDropProbability,
    expectedPointsAfterDraw,
    expectedMultiplierAfterDraw,
    recommendedAction,
    recommendationReason,
  };
}
