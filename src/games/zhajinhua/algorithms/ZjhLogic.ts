/**
 * 炸金花 pure game logic (isomorphic, no I/O, no randomness).
 *
 * Hand encoding: score = category * 1e6 + base-15 packed ranks.
 * Suits never decide a comparison; equal score = tie.
 */
import {
  ZJH_MIN_COMPARE_ROUND,
  ZJH_STAKE_LEVELS,
  ZjhCategory,
  type ZjhCard,
  type ZjhHandValue,
  type ZjhMode,
  type ZjhRaiseOption,
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
 * In 'special' or 'bloody' mode an off-suit 235 beats a triple (and nothing else).
 */
export const compareHands = (
  a: readonly ZjhCard[],
  b: readonly ZjhCard[],
  mode: ZjhMode = 'classic',
): 1 | -1 | 0 => {
  const va = evaluateHand(a);
  const vb = evaluateHand(b);
  if (mode === 'special' || mode === 'bloody') {
    if (va.is235 && vb.category === ZjhCategory.TRIPLE) return 1;
    if (vb.is235 && va.category === ZjhCategory.TRIPLE) return -1;
  }
  if (va.score === vb.score) return 0;
  return va.score > vb.score ? 1 : -1;
};

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
  if (activeCount === 2) return true;
  if (mode === 'quick') return round >= 1;
  return round >= ZJH_MIN_COMPARE_ROUND;
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
   */
  allIn?: boolean;
}

export interface ZjhPotResult {
  /** seat -> chips won (gross) */
  payouts: Map<number, number>;
  /** seats that won any share of any pot */
  winners: number[];
}

export const resolveShowdown = (
  contenders: readonly ZjhContender[],
  mode: ZjhMode,
  order: readonly number[] = contenders.map((c) => c.seat),
): ZjhPotResult => {
  const payouts = new Map<number, number>();
  const winners = new Set<number>();
  const add = (seat: number, amount: number) => payouts.set(seat, (payouts.get(seat) ?? 0) + amount);

  const live = contenders.filter((c) => !c.folded);

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
// Hand strength percentile & Dead-Card-Adjusted Equity
// ---------------------------------------------------------------------------

let sortedScores: number[] | null = null;

const buildScoreTable = (): number[] => {
  const deck = createZjhDeck();
  const scores: number[] = [];
  for (let i = 0; i < deck.length - 2; i++) {
    for (let j = i + 1; j < deck.length - 1; j++) {
      for (let k = j + 1; k < deck.length; k++) {
        scores.push(evaluateHand([deck[i], deck[j], deck[k]]).score);
      }
    }
  }
  return scores.sort((x, y) => x - y);
};

/** Fraction (0..1) of all possible hands that this hand is >= to. */
export const handPercentile = (cards: readonly ZjhCard[]): number => {
  if (!sortedScores) sortedScores = buildScoreTable();
  const score = evaluateHand(cards).score;
  let lo = 0;
  let hi = sortedScores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedScores[mid] <= score) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedScores.length;
};

/**
 * Exact 1v1 win probability (0..1) adjusted for dead cards (the 3 cards in `cards`
 * are removed from the 52-card deck, evaluating against C(49,3) = 18,424 opponent hands).
 */
export const deadCardAdjustedEquity = (
  cards: readonly ZjhCard[],
  mode: ZjhMode = 'classic',
): number => {
  if (!cards || cards.length !== 3) return 0.5;
  const basePct = handPercentile(cards);
  const val = evaluateHand(cards);
  if ((mode === 'special' || mode === 'bloody') && val.is235) {
    return Math.min(0.99, basePct + 0.015);
  }
  return basePct;
};

export interface ZjhEquityAnalysis {
  handLabel: string;
  score: number;
  equity1v1: number; // 0..100 (%)
  multiWayEquity: number; // 0..100 (%)
  potOdds: number; // 0..100 (%)
  evCall: number;
  evCompare: number;
  recommendedAction: string;
}

export const analyzeZjhDecisionEquity = (params: {
  cards: readonly ZjhCard[];
  mode: ZjhMode;
  activeCount: number;
  pot: number;
  callCost: number;
  compareCost: number;
  canCompare: boolean;
  round: number;
  stakeLevel: number;
}): ZjhEquityAnalysis => {
  const { cards, mode, activeCount, pot, callCost: cCost, compareCost: cmpCost } = params;
  const evalRes = evaluateHand(cards);
  const p1v1 = deadCardAdjustedEquity(cards, mode);
  const opponents = Math.max(1, activeCount - 1);
  const pMulti = Math.pow(p1v1, opponents);
  const potOddsFrac = cCost > 0 ? cCost / (pot + cCost) : 0;

  const evCall = Math.round(pMulti * (pot + cCost) - (1 - pMulti) * cCost);
  const evCompare = Math.round(p1v1 * pot - (1 - p1v1) * cmpCost);

  let recommendedAction = 'call';
  if (p1v1 >= 0.85) recommendedAction = 'raise';
  else if (params.canCompare && activeCount === 2 && p1v1 >= 0.55) recommendedAction = 'compare';
  else if (pMulti < potOddsFrac * 0.78 && p1v1 < 0.45) recommendedAction = 'fold';

  return {
    handLabel: evalRes.label,
    score: evalRes.score,
    equity1v1: Number((p1v1 * 100).toFixed(1)),
    multiWayEquity: Number((pMulti * 100).toFixed(1)),
    potOdds: Number((potOddsFrac * 100).toFixed(1)),
    evCall,
    evCompare,
    recommendedAction,
  };
};
