/**
 * 炸金花 pure game logic (isomorphic, no I/O, no randomness).
 *
 * Hand encoding: score = category * 1e6 + base-15 packed ranks (see meta/facts/zjh_rules.md).
 * Suits never decide a comparison; equal score = tie.
 */
import {
  ZJH_MIN_COMPARE_ROUND,
  ZJH_STAKE_LEVELS,
  ZjhCategory,
  type ZjhActionType,
  type ZjhCard,
  type ZjhDynamicPotOddsSnapshot,
  type ZjhEquityAnalysis,
  type ZjhHandValue,
  type ZjhMode,
  type ZjhRaiseOption,
  type ZjhSeatSnapshot,
  type ZjhSnapshot,
  type ZjhSuit,
} from '../types.js';

export const ZJH_SUITS: ZjhSuit[] = ['spade', 'heart', 'club', 'diamond'];

const CATEGORY_UNIT = 1_000_000;

const CATEGORY_LABEL: Record<ZjhCategory, string> = {
  [ZjhCategory.HIGH_CARD]: '单张',
  [ZjhCategory.PAIR]: '对子',
  [ZjhCategory.STRAIGHT]: '顺子',
  [ZjhCategory.FLUSH]: '金花',
  [ZjhCategory.STRAIGHT_FLUSH]: '顺金',
  [ZjhCategory.TRIPLE]: '豹子',
};

export const createZjhDeck = (): ZjhCard[] => {
  const deck: ZjhCard[] = [];
  for (const suit of ZJH_SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ id: `${suit}_${rank}`, suit, rank });
    }
  }
  return deck;
};

export const rankText = (rank: number): string => {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
};

/** Top card used to rank a straight. A-2-3 is the smallest straight (top = 3). */
const straightTop = (ranksDesc: number[]): number | null => {
  const [a, b, c] = ranksDesc;
  if (a - b === 1 && b - c === 1) return a;
  if (a === 14 && b === 3 && c === 2) return 3;
  return null;
};

export const evaluateHand = (cards: readonly ZjhCard[]): ZjhHandValue => {
  if (cards.length !== 3) {
    throw new Error(`ZJH hand needs exactly 3 cards, got ${cards.length}`);
  }
  const ranks = cards.map((c) => c.rank).sort((x, y) => y - x);
  const flush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const [a, b, c] = ranks;

  let category: ZjhCategory;
  let packed: number;

  if (a === b && b === c) {
    category = ZjhCategory.TRIPLE;
    packed = a;
  } else {
    const top = straightTop(ranks);
    if (top !== null) {
      category = flush ? ZjhCategory.STRAIGHT_FLUSH : ZjhCategory.STRAIGHT;
      packed = top;
    } else if (flush) {
      category = ZjhCategory.FLUSH;
      packed = a * 225 + b * 15 + c;
    } else if (a === b || b === c) {
      category = ZjhCategory.PAIR;
      const pair = a === b ? a : b;
      const kicker = a === b ? c : a;
      packed = pair * 15 + kicker;
    } else {
      category = ZjhCategory.HIGH_CARD;
      packed = a * 225 + b * 15 + c;
    }
  }

  const is235 = category === ZjhCategory.HIGH_CARD && a === 5 && b === 3 && c === 2;
  return {
    category,
    score: category * CATEGORY_UNIT + packed,
    label: is235 ? '235' : CATEGORY_LABEL[category],
    is235,
  };
};

/**
 * Compare two hands.
 * @returns 1 if a wins, -1 if b wins, 0 on tie.
 * In 'special' mode an off-suit 235 beats a triple (and nothing else).
 */
export const compareHands = (
  a: readonly ZjhCard[],
  b: readonly ZjhCard[],
  mode: ZjhMode = 'classic',
): 1 | -1 | 0 => {
  const va = evaluateHand(a);
  const vb = evaluateHand(b);
  if (mode === 'special') {
    if (va.is235 && vb.category === ZjhCategory.TRIPLE) return 1;
    if (vb.is235 && va.category === ZjhCategory.TRIPLE) return -1;
  }
  if (va.score === vb.score) return 0;
  return va.score > vb.score ? 1 : -1;
};

/**
 * Best hands among several (pairwise king-of-the-hill, so special-mode 235 keeps its
 * pairwise meaning). Returns the contenders tied for best. 235 > triple > straight-flush > 235
 * is non-transitive by design of the house rule; the result is still deterministic.
 */
const topSeats = (candidates: readonly ZjhContender[], mode: ZjhMode): ZjhContender[] => {
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    if (compareHands(c.cards, best.cards, mode) > 0) best = c;
  }
  return candidates.filter((c) => compareHands(c.cards, best.cards, mode) === 0);
};

// ---------------------------------------------------------------------------
// Betting maths
// ---------------------------------------------------------------------------

export interface ZjhBetContext {
  baseScore: number;
  stakeLevel: number;
  seen: boolean;
}

export const stakeOf = (baseScore: number, level: number): number =>
  baseScore * ZJH_STAKE_LEVELS[Math.max(0, Math.min(ZJH_STAKE_LEVELS.length - 1, level))];

export const callCost = ({ baseScore, stakeLevel, seen }: ZjhBetContext): number =>
  stakeOf(baseScore, stakeLevel) * (seen ? 2 : 1);

export const compareCost = (ctx: ZjhBetContext): number => callCost(ctx) * 2;

/** Raise options strictly above the current level. */
export const raiseOptions = ({ baseScore, stakeLevel, seen }: ZjhBetContext): ZjhRaiseOption[] => {
  const result: ZjhRaiseOption[] = [];
  for (let level = stakeLevel + 1; level < ZJH_STAKE_LEVELS.length; level++) {
    const stake = stakeOf(baseScore, level);
    result.push({ level, stake, cost: stake * (seen ? 2 : 1) });
  }
  return result;
};

export const canCompareNow = (
  round: number,
  activeCount: number,
  mode: ZjhMode = 'classic',
): boolean => {
  const minRound = mode === 'quick' ? 1 : ZJH_MIN_COMPARE_ROUND;
  return activeCount === 2 || round >= minRound;
};

// ---------------------------------------------------------------------------
// Showdown with side pots
// ---------------------------------------------------------------------------

export interface ZjhContender {
  seat: number;
  /** Total chips this seat put in (ante + all bets). */
  contribution: number;
  folded: boolean;
  cards: readonly ZjhCard[];
  /**
   * Seat went all-in: it can only win chips up to its own contribution from each opponent.
   * Seats that are not all-in compete for every layer (blind/seen price differences are NOT caps).
   */
  allIn?: boolean;
}

export interface ZjhPotResult {
  /** seat -> chips won (gross) */
  payouts: Map<number, number>;
  /** seats that won any share of any pot */
  winners: number[];
}

/**
 * Layered pot split. Folded seats feed pots but are never eligible.
 * Ties split evenly; the odd remainder goes to the earliest seat in `order`.
 * Chips from a layer nobody eligible covers are returned to their owner (cannot happen when
 * at least one non-folded seat exists, but guards against malformed input).
 */
export const resolveShowdown = (
  contenders: readonly ZjhContender[],
  mode: ZjhMode,
  order: readonly number[] = contenders.map((c) => c.seat),
): ZjhPotResult => {
  const payouts = new Map<number, number>();
  const winners = new Set<number>();
  const add = (seat: number, amount: number) => payouts.set(seat, (payouts.get(seat) ?? 0) + amount);

  const live = contenders.filter((c) => !c.folded);

  // Layer boundaries: every all-in contribution plus the biggest contribution (top layer).
  const maxContribution = Math.max(0, ...contenders.map((c) => c.contribution));
  const levels = Array.from(
    new Set([...contenders.filter((c) => c.allIn).map((c) => c.contribution), maxContribution]),
  )
    .filter((v) => v > 0)
    .sort((x, y) => x - y);

  const slice = (c: ZjhContender, from: number, to: number) =>
    Math.max(0, Math.min(c.contribution, to) - Math.min(c.contribution, from));

  let previous = 0;
  for (const level of levels) {
    const from = previous;
    previous = level;

    const layerPot = contenders.reduce((sum, c) => sum + slice(c, from, level), 0);
    if (layerPot === 0) continue;

    const eligible = live.filter((c) => !c.allIn || c.contribution >= level);

    if (eligible.length === 0) {
      // Nobody left can claim this layer: refund to contributors (defensive).
      for (const c of contenders) {
        const back = slice(c, from, level);
        if (back > 0) add(c.seat, back);
      }
      continue;
    }

    const top = topSeats(eligible, mode)
      .map((c) => c.seat)
      .sort((x, y) => order.indexOf(x) - order.indexOf(y));

    const share = Math.floor(layerPot / top.length);
    let remainder = layerPot - share * top.length;
    for (const seat of top) {
      add(seat, share + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder--;
      winners.add(seat);
    }
  }

  return { payouts, winners: Array.from(winners) };
};

// ---------------------------------------------------------------------------
// Precomputed 22,100 3-Card Combination Table & Dead-Card-Adjusted Equity
// ---------------------------------------------------------------------------

interface ComboEntry {
  i: number;
  j: number;
  k: number;
  score: number;
  category: ZjhCategory;
  is235: boolean;
}

let sortedScores: number[] | null = null;
let comboTable: ComboEntry[] | null = null;
let cardIdToIndex: Map<string, number> | null = null;

const ensureComboTable = (): ComboEntry[] => {
  if (comboTable && cardIdToIndex && sortedScores) return comboTable;
  const deck = createZjhDeck();
  cardIdToIndex = new Map<string, number>();
  deck.forEach((c, idx) => cardIdToIndex!.set(`${c.suit}_${c.rank}`, idx));

  const entries: ComboEntry[] = [];
  const scores: number[] = [];

  for (let i = 0; i < deck.length - 2; i++) {
    for (let j = i + 1; j < deck.length - 1; j++) {
      for (let k = j + 1; k < deck.length; k++) {
        const val = evaluateHand([deck[i], deck[j], deck[k]]);
        entries.push({
          i,
          j,
          k,
          score: val.score,
          category: val.category,
          is235: val.is235,
        });
        scores.push(val.score);
      }
    }
  }

  comboTable = entries;
  sortedScores = scores.sort((x, y) => x - y);
  return comboTable;
};

/** Fraction (0..1) of all possible 22,100 hands that this hand is >= to. */
export const handPercentile = (cards: readonly ZjhCard[]): number => {
  ensureComboTable();
  const score = evaluateHand(cards).score;
  let lo = 0;
  let hi = sortedScores!.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedScores![mid] <= score) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedScores!.length;
};

/**
 * Exact 1v1 win probability (0..1) after removing `cards` (3 dead cards) from the 52-card deck,
 * enumerating all C(49, 3) = 18,424 possible opponent 3-card combinations.
 */
export const deadCardAdjustedEquity = (
  cards: readonly ZjhCard[],
  mode: ZjhMode = 'classic',
): number => {
  if (cards.length !== 3) return 0.5;
  const table = ensureComboTable();
  const val = evaluateHand(cards);
  const dead0 = cardIdToIndex!.get(`${cards[0].suit}_${cards[0].rank}`) ?? -1;
  const dead1 = cardIdToIndex!.get(`${cards[1].suit}_${cards[1].rank}`) ?? -1;
  const dead2 = cardIdToIndex!.get(`${cards[2].suit}_${cards[2].rank}`) ?? -1;

  let wins = 0;
  let ties = 0;
  let total = 0;

  for (let idx = 0; idx < table.length; idx++) {
    const entry = table[idx];
    if (
      entry.i === dead0 ||
      entry.i === dead1 ||
      entry.i === dead2 ||
      entry.j === dead0 ||
      entry.j === dead1 ||
      entry.j === dead2 ||
      entry.k === dead0 ||
      entry.k === dead1 ||
      entry.k === dead2
    ) {
      continue;
    }
    total++;

    if (mode === 'special') {
      if (val.is235 && entry.category === ZjhCategory.TRIPLE) {
        wins++;
        continue;
      }
      if (entry.is235 && val.category === ZjhCategory.TRIPLE) {
        continue;
      }
    }

    if (val.score > entry.score) {
      wins++;
    } else if (val.score === entry.score) {
      ties++;
    }
  }

  if (total === 0) return handPercentile(cards);
  return (wins + ties * 0.5) / total;
};

/**
 * Full commercial multi-opponent win equity & Pot Odds EV analyzer for ZhaJinhua.
 */
export const analyzeZjhDecisionEquity = (params: {
  cards: readonly ZjhCard[];
  mode?: ZjhMode;
  activeCount: number;
  pot: number;
  callCost: number;
  compareCost: number;
  canCompare: boolean;
  round: number;
  stakeLevel: number;
}): ZjhEquityAnalysis => {
  const mode = params.mode ?? 'classic';
  const handVal = evaluateHand(params.cards);
  const raw1v1 = deadCardAdjustedEquity(params.cards, mode);
  const opponents = Math.max(1, params.activeCount - 1);

  // In later rounds or higher stake levels, surviving opponents have a narrower, stronger range.
  const rangeTightening = Math.min(0.22, (params.round - 1) * 0.025 + params.stakeLevel * 0.035);
  const effective1v1 = Math.max(
    0.02,
    Math.min(0.995, (raw1v1 - rangeTightening * 0.5) / (1 - rangeTightening * 0.45)),
  );
  const multiWayRaw = Math.pow(effective1v1, opponents);

  const headsUpEquity = Number((raw1v1 * 100).toFixed(1));
  const multiWayEquity = Number((multiWayRaw * 100).toFixed(1));

  const totalPotAfterCall = Math.max(1, params.pot + params.callCost);
  const potOddsFrac = params.callCost / totalPotAfterCall;
  const potOdds = Number((potOddsFrac * 100).toFixed(1));
  const callEv = Math.round(multiWayRaw * (params.pot + params.callCost) - params.callCost);

  let recommendedAction: ZjhActionType = 'call';
  let reasoning = '';

  if (raw1v1 >= 0.92 || handVal.category >= ZjhCategory.STRAIGHT) {
    recommendedAction = 'raise';
    reasoning = `强牌(${handVal.label}，单挑胜率${headsUpEquity}%)，远超底池赔率${potOdds}%，建议价值加注扩大底池`;
  } else if (params.canCompare && params.activeCount === 2 && raw1v1 >= 0.58) {
    recommendedAction = 'compare';
    reasoning = `单挑阶段胜率${headsUpEquity}%占优，建议主动发起比牌锁定胜局`;
  } else if (multiWayRaw >= potOddsFrac * 0.92 || raw1v1 >= 0.52) {
    recommendedAction = 'call';
    reasoning = `多人胜率${multiWayEquity}%匹配底池赔率${potOdds}%(EV:${callEv >= 0 ? '+' : ''}${callEv})，建议稳健跟注`;
  } else {
    recommendedAction = 'fold';
    reasoning = `多人胜率${multiWayEquity}%低于底池赔率门槛${potOdds}%(EV:${callEv})，建议弃牌止损`;
  }

  return {
    category: handVal.category,
    label: handVal.label,
    score: handVal.score,
    is235: handVal.is235,
    headsUpEquity,
    multiWayEquity,
    potOdds,
    callEv,
    recommendedAction,
    reasoning,
  };
};

/**
 * 炸金花多人底池赔率与动态胜率偏移核心算法
 * 针对每位在局对手的【看牌/闷牌状态】、【加注动作】、【当前轮数】与【注码档位】建立异构贝叶斯手牌范围模型，
 * 精确计算多人存活胜率(dynamicWinRate)、单轮胜率变化量(winRateDelta)、直接底池赔率(potOddsPct)、隐含赔率(impliedOddsPct)与EV期望。
 */
export const calculateZjhMultiPotOdds = (params: {
  snapshot: ZjhSnapshot;
  cards: readonly ZjhCard[];
  previousWinRate?: number;
}): ZjhDynamicPotOddsSnapshot => {
  const { snapshot, cards, previousWinRate } = params;
  const mode = snapshot.mode ?? 'classic';
  const handVal = evaluateHand(cards);
  const raw1v1 = deadCardAdjustedEquity(cards, mode);
  const headsUpEquity = Number((raw1v1 * 100).toFixed(1));

  const mySeatIdx = snapshot.mySeat;
  const liveSeats = snapshot.seats.filter(
    (s): s is ZjhSeatSnapshot => Boolean(s && (s.status === 'active' || s.status === 'allin'))
  );
  const opponents = liveSeats.filter((s) => s.seatIndex !== mySeatIdx);
  const activeCount = Math.max(1, liveSeats.length);

  let seenOpponentCount = 0;
  let blindOpponentCount = 0;
  let combinedWinProb = 1.0;
  const oppDescList: string[] = [];

  for (const opp of opponents) {
    if (opp.seen) {
      seenOpponentCount++;
    } else {
      blindOpponentCount++;
    }

    // 异构对手手牌范围收紧系数 (Range Threshold)
    // 已看牌且继续跟注/加注的对手，弃掉了底端散牌，手牌下限随轮数与注码显著抬升；
    // 闷牌对手虽未看牌，但承受多轮暗注压力后仍有小幅存活筛选。
    const isAggressor =
      opp.lastAction.includes('加') || opp.lastAction.includes('全押') || opp.status === 'allin';

    let rangeFloor = 0;
    if (opp.seen) {
      rangeFloor = Math.min(
        0.52,
        0.16 + (snapshot.round - 1) * 0.042 + snapshot.stakeLevel * 0.055 + (isAggressor ? 0.09 : 0)
      );
    } else {
      rangeFloor = Math.min(
        0.24,
        0.03 + (snapshot.round - 1) * 0.018 + snapshot.stakeLevel * 0.025 + (isAggressor ? 0.05 : 0)
      );
    }

    // 对手手牌分布在 [rangeFloor, 1.0] 区间内时，我方击败该对手的条件概率
    let beatOppProb = 0.5;
    if (raw1v1 <= rangeFloor) {
      beatOppProb = Math.max(0.03, (raw1v1 / Math.max(0.01, rangeFloor)) * 0.18);
    } else {
      beatOppProb = 0.18 + ((raw1v1 - rangeFloor) / Math.max(0.01, 1 - rangeFloor)) * 0.815;
    }
    beatOppProb = Math.max(0.03, Math.min(0.992, beatOppProb));
    combinedWinProb *= beatOppProb;

    oppDescList.push(
      `#${opp.seatIndex}(${opp.seen ? '明' : '闷'}${isAggressor ? '·加注' : ''}:击败率${Math.round(
        beatOppProb * 100
      )}%)`
    );
  }

  const dynamicWinRate = Number((combinedWinProb * 100).toFixed(1));
  const baselineWinRate =
    previousWinRate !== undefined
      ? previousWinRate
      : Number((Math.pow(raw1v1, Math.max(1, opponents.length)) * 100).toFixed(1));
  const winRateDelta = Number((dynamicWinRate - baselineWinRate).toFixed(1));

  const currentCallCost = Math.max(
    1,
    snapshot.my.callCost || callCost({
      baseScore: snapshot.baseScore,
      stakeLevel: snapshot.stakeLevel,
      seen: Boolean(snapshot.seats[mySeatIdx]?.seen),
    })
  );
  const currentCompareCost = snapshot.my.compareCost || currentCallCost * 2;

  // 直接底池赔率 = 跟注成本 / (当前底池 + 跟注成本)
  const totalPotAfterCall = Math.max(1, snapshot.pot + currentCallCost);
  const potOddsFrac = currentCallCost / totalPotAfterCall;
  const potOddsPct = Number((potOddsFrac * 100).toFixed(1));

  // 多人隐含底池赔率：考虑本轮后续尚有活跃对手大概率跟注投入底池
  const expectedTrailingCalls = Math.max(0, opponents.length * 0.55) * snapshot.stake * 1.35;
  const impliedPot = Math.max(totalPotAfterCall, snapshot.pot + currentCallCost + expectedTrailingCalls);
  const impliedOddsPct = Number(((currentCallCost / impliedPot) * 100).toFixed(1));

  const equityEdgePct = Number((dynamicWinRate - potOddsPct).toFixed(1));
  const callEv = Math.round(combinedWinProb * totalPotAfterCall - currentCallCost);

  // 加注期望收益估算
  const nextRaiseCost = snapshot.my.raiseOptions[0]?.cost ?? currentCallCost * 2;
  const foldEquityBonus = opponents.length >= 2 ? 0.08 : 0.05;
  const raiseWinProb = Math.min(0.99, combinedWinProb + foldEquityBonus);
  const raiseEv = Math.round(
    raiseWinProb * (snapshot.pot + nextRaiseCost * (1 + opponents.length * 0.6)) - nextRaiseCost
  );

  let recommendedAction: ZjhActionType = 'call';
  if (raw1v1 >= 0.9 || (equityEdgePct >= 22 && raiseEv > callEv)) {
    recommendedAction = 'raise';
  } else if (snapshot.my.canCompare && activeCount === 2 && dynamicWinRate >= 56) {
    recommendedAction = 'compare';
  } else if (dynamicWinRate >= potOddsPct * 0.9 || dynamicWinRate >= impliedOddsPct) {
    recommendedAction = 'call';
  } else {
    recommendedAction = 'fold';
  }

  return {
    round: snapshot.round,
    pot: snapshot.pot,
    callCost: currentCallCost,
    compareCost: currentCompareCost,
    activeCount,
    seenOpponentCount,
    blindOpponentCount,
    handLabel: handVal.label,
    headsUpEquity,
    dynamicWinRate,
    winRateDelta,
    potOddsPct,
    impliedOddsPct,
    equityEdgePct,
    callEv,
    raiseEv,
    recommendedAction,
    opponentRangeSummary: oppDescList.length > 0 ? oppDescList.join(' | ') : '无在局对手',
  };
};


