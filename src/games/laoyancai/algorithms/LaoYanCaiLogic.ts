import {
  LaoYanCaiCard,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandCategory,
  LaoYanCaiHandResult,
  LaoYanCaiPlayMode,
  LaoYanCaiSuit,
} from '../types';

const SUITS: LaoYanCaiSuit[] = ['spade', 'heart', 'club', 'diamond'];

const SUIT_WEIGHT: Record<LaoYanCaiSuit, number> = {
  spade: 4,
  heart: 3,
  club: 2,
  diamond: 1,
};

const POINT_CN_NAMES: Record<number, string> = {
  0: '瘪十(0点)',
  1: '一点',
  2: '二点',
  3: '三点',
  4: '四点',
  5: '五点',
  6: '六点',
  7: '七点',
  8: '八点',
  9: '九点',
};

const RANK_LABELS: Record<number, string> = {
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

export function formatCardLabel(card: LaoYanCaiCard): string {
  if (!card || card.rank <= 0) return '🂠';
  const suitSymbols: Record<LaoYanCaiSuit, string> = {
    spade: '♠',
    heart: '♥',
    club: '♣',
    diamond: '♦',
  };
  return `${suitSymbols[card.suit] || '♠'}${RANK_LABELS[card.rank] || card.rank}`;
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
        point: rank >= 10 ? 0 : rank,
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

function computeHighCardTieBreaker(cards: LaoYanCaiCard[]): number {
  const valid = cards.filter((c) => c.rank > 0);
  if (valid.length === 0) return 0;
  // In Lao Yan Cai tie-breaking, K(13) > Q(12) > J(11) > 10 > 9 ... > A(1)
  const sorted = [...valid].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return SUIT_WEIGHT[b.suit] - SUIT_WEIGHT[a.suit];
  });
  const top = sorted[0];
  return top.rank * 10 + SUIT_WEIGHT[top.suit];
}

/**
 * Evaluates a 2-card or 3-card Lao Yan Cai hand according to authentic Kunming/Yuxi rules.
 */
export function evaluateLaoYanCaiHand(
  cards: LaoYanCaiCard[],
  playMode: LaoYanCaiPlayMode = 'kunming',
  isZhaKai: boolean = false
): LaoYanCaiHandResult {
  const validCards = cards.filter((c) => c && c.rank > 0);
  const count = validCards.length;

  if (count === 0) {
    return {
      cards: [],
      cardCount: 0,
      points: 0,
      category: 'NORMAL',
      name: '等待发牌',
      badgeText: '1倍',
      multiplier: 1,
      canZhaKai: false,
      isZhaKai: false,
      isSuited: false,
      isPair: false,
      isBaozi: false,
      isSanGong: false,
      isStraightFlush: false,
      weight: 0,
    };
  }

  const rawSum = validCards.reduce((acc, c) => acc + c.point, 0);
  const points = rawSum % 10;
  const firstSuit = validCards[0].suit;
  const isSuited = count >= 2 && validCards.every((c) => c.suit === firstSuit);
  const isPair = count === 2 && validCards[0].rank === validCards[1].rank;
  const isBaozi =
    count === 3 &&
    validCards[0].rank === validCards[1].rank &&
    validCards[1].rank === validCards[2].rank;
  const isSanGong = count === 3 && validCards.every((c) => c.rank >= 11);
  const isStraightFlush =
    count === 3 && isSuited && isThreeCardStraight(validCards.map((c) => c.rank));

  const canZhaKai = count === 2 && (points === 8 || points === 9);
  const effectiveZhaKai = canZhaKai && isZhaKai;
  const tieBreaker = computeHighCardTieBreaker(validCards);

  let category: LaoYanCaiHandCategory = 'NORMAL';
  let multiplier = 1;
  let name = POINT_CN_NAMES[points] || `${points}点`;
  let badgeText = '1倍';
  let majorTier = 100 + points * 10;

  if (count === 3) {
    if (isBaozi) {
      category = 'BAOZI';
      multiplier = playMode === 'crazy' ? 8 : 5;
      const rLabel = RANK_LABELS[validCards[0].rank] || String(validCards[0].rank);
      name = `豹子${rLabel}`;
      badgeText = `豹子×${multiplier}`;
      majorTier = 700 + validCards[0].rank;
    } else if (isStraightFlush) {
      category = 'STRAIGHT_FLUSH';
      multiplier = playMode === 'crazy' ? 6 : 4;
      name = `同花顺(${points}点)`;
      badgeText = `顺金×${multiplier}`;
      majorTier = 600 + points;
    } else if (isSanGong) {
      category = 'SANGONG';
      multiplier = playMode === 'crazy' ? 4 : 3;
      name = '三公';
      badgeText = `三公×${multiplier}`;
      majorTier = 500;
    } else if (isSuited) {
      category = 'SANYAN';
      multiplier = playMode === 'crazy' && points >= 8 ? 4 : 3;
      name = `${POINT_CN_NAMES[points]}·三腌`;
      badgeText = `三腌×${multiplier}`;
      majorTier = 100 + points * 10 + 3;
    } else {
      category = 'NORMAL';
      multiplier = playMode === 'crazy' && points === 9 ? 2 : 1;
      name = POINT_CN_NAMES[points];
      badgeText = `${multiplier}倍`;
      majorTier = 100 + points * 10;
    }
  } else {
    // 2-card hand
    const suitedOrPairMult = isSuited && isPair ? 3 : isSuited || isPair ? 2 : 1;

    if (effectiveZhaKai) {
      category = points === 9 ? 'NATURAL_9' : 'NATURAL_8';
      multiplier =
        playMode === 'crazy' && isSuited
          ? 3
          : Math.max(suitedOrPairMult, playMode === 'crazy' && points === 9 ? 2 : 1);
      const suffix = isSuited ? '·双腌炸开' : isPair ? '·对子炸开' : '·天牌炸开';
      name = `${POINT_CN_NAMES[points]}${suffix}`;
      badgeText = multiplier > 1 ? `炸开×${multiplier}` : '天牌炸开';
      majorTier = (points === 9 ? 490 : 480) + (isSuited ? 3 : isPair ? 2 : 0);
    } else if (isSuited) {
      category = 'SHUANGYAN';
      multiplier = 2;
      name = `${POINT_CN_NAMES[points]}·双腌`;
      badgeText = '双腌×2';
      majorTier = 100 + points * 10 + 2;
    } else if (isPair) {
      category = 'PAIR';
      multiplier = 2;
      name = `${POINT_CN_NAMES[points]}·对子`;
      badgeText = '对子×2';
      majorTier = 100 + points * 10 + 1;
    } else {
      category = 'NORMAL';
      multiplier = 1;
      name = POINT_CN_NAMES[points];
      badgeText = '1倍';
      majorTier = 100 + points * 10 + 0.5; // 2-card hand slightly outranks 3-card at equal points
    }
  }

  const weight = majorTier * 1000 + tieBreaker;

  return {
    cards: validCards,
    cardCount: count,
    points,
    category,
    name,
    badgeText,
    multiplier,
    canZhaKai,
    isZhaKai: effectiveZhaKai,
    isSuited,
    isPair,
    isBaozi,
    isSanGong,
    isStraightFlush,
    weight,
  };
}

/**
 * Returns > 0 if handA > handB, < 0 if handA < handB
 */
export function compareLaoYanCaiHands(
  handA: LaoYanCaiHandResult,
  handB: LaoYanCaiHandResult
): number {
  return handA.weight - handB.weight;
}

/**
 * Exact 50-card combinatorial analyzer for 捞牌 (drawing a 3rd card) vs 不捞 / 炸开.
 */
export function analyzeLaoYanCaiDrawOdds(
  twoCards: LaoYanCaiCard[],
  playMode: LaoYanCaiPlayMode = 'kunming',
  remainingDeck?: LaoYanCaiCard[]
): LaoYanCaiDrawOdds {
  const validTwo = twoCards.filter((c) => c && c.rank > 0).slice(0, 2);
  const currentEval = evaluateLaoYanCaiHand(validTwo, playMode, false);

  if (validTwo.length < 2) {
    return {
      currentPoints: currentEval.points,
      currentName: currentEval.name,
      currentMultiplier: currentEval.multiplier,
      canZhaKai: false,
      remainingDeckCount: 50,
      improveCardCount: 0,
      improveProbability: 0,
      highHandProbability: 0,
      specialMultiplierProbability: 0,
      expectedPointsAfterDraw: currentEval.points,
      expectedMultiplierAfterDraw: 1,
      recommendation: 'BULAO',
      adviceText: '等待发齐2张底牌',
    };
  }

  // Construct unseen candidate pool if explicit deck is not provided
  const knownIds = new Set(validTwo.map((c) => c.id));
  const pool =
    remainingDeck && remainingDeck.length > 0
      ? remainingDeck
      : createStandardLaoYanCaiDeck().filter(
          (c) =>
            !knownIds.has(c.id) &&
            !validTwo.some((v) => v.suit === c.suit && v.rank === c.rank)
        );

  const total = Math.max(1, pool.length);
  let improveCount = 0;
  let highHandCount = 0;
  let specialMultCount = 0;
  let sumPoints = 0;
  let sumMult = 0;

  for (const nextCard of pool) {
    const threeEval = evaluateLaoYanCaiHand([...validTwo, nextCard], playMode, false);
    const isSpecialTop =
      threeEval.isBaozi || threeEval.isStraightFlush || threeEval.isSanGong;

    if (threeEval.points > currentEval.points || isSpecialTop) {
      improveCount += 1;
    }
    if (threeEval.points >= 7 || isSpecialTop) {
      highHandCount += 1;
    }
    if (threeEval.multiplier >= 3) {
      specialMultCount += 1;
    }
    sumPoints += isSpecialTop ? 9.5 : threeEval.points;
    sumMult += threeEval.multiplier;
  }

  const improveProbability = Number(((improveCount / total) * 100).toFixed(1));
  const highHandProbability = Number(((highHandCount / total) * 100).toFixed(1));
  const specialMultiplierProbability = Number(((specialMultCount / total) * 100).toFixed(1));
  const expectedPointsAfterDraw = Number((sumPoints / total).toFixed(2));
  const expectedMultiplierAfterDraw = Number((sumMult / total).toFixed(2));

  let recommendation: 'ZHAKAI' | 'LAO' | 'BULAO' = 'BULAO';
  let adviceText = '';

  if (currentEval.canZhaKai) {
    recommendation = 'ZHAKAI';
    adviceText = `天牌${currentEval.points}点${currentEval.isSuited ? '(双腌×2)' : ''}，强烈建议直接【炸开】锁胜！`;
  } else if (currentEval.points <= 4) {
    recommendation = 'LAO';
    adviceText = `当前${currentEval.points}点偏小，捞牌提升率 ${improveProbability}%${
      currentEval.isSuited ? '（且有23%概率博三腌×3）' : ''
    }，建议【捞牌】`;
  } else if (currentEval.points === 5) {
    if (currentEval.isSuited || expectedPointsAfterDraw >= 5.1) {
      recommendation = 'LAO';
      adviceText = `当前5点${currentEval.isSuited ? '双腌听三腌' : ''}，捞牌成大牌率 ${highHandProbability}%，可博【捞牌】`;
    } else {
      recommendation = 'BULAO';
      adviceText = `当前5点居中，捞牌提升率 ${improveProbability}%，稳健可【不捞】`;
    }
  } else if (currentEval.points === 6) {
    recommendation = 'BULAO';
    adviceText = `当前6点${currentEval.isSuited ? '(双腌×2)' : ''}已具优势，捞牌仅 ${improveProbability}% 提升，建议【不捞】`;
  } else {
    recommendation = 'BULAO';
    adviceText = `当前${currentEval.points}点高点${currentEval.isSuited ? '(双腌×2)' : ''}，切勿破坏牌型，建议【不捞】`;
  }

  return {
    currentPoints: currentEval.points,
    currentName: currentEval.name,
    currentMultiplier: currentEval.multiplier,
    canZhaKai: currentEval.canZhaKai,
    remainingDeckCount: total,
    improveCardCount: improveCount,
    improveProbability,
    highHandProbability,
    specialMultiplierProbability,
    expectedPointsAfterDraw,
    expectedMultiplierAfterDraw,
    recommendation,
    adviceText,
  };
}
