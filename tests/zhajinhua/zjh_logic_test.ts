import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callCost,
  canCompareNow,
  compareCost,
  compareHands,
  createZjhDeck,
  evaluateHand,
  handPercentile,
  raiseOptions,
  resolveShowdown,
} from '../../src/games/zhajinhua/algorithms/ZjhLogic.js';
import { ZjhCategory, type ZjhCard, type ZjhSuit } from '../../src/games/zhajinhua/types.js';

const S: Record<string, ZjhSuit> = { s: 'spade', h: 'heart', c: 'club', d: 'diamond' };
const RANKS: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };

/** 'As Kh 2d' -> cards */
const hand = (text: string): ZjhCard[] =>
  text.split(' ').map((token) => {
    const suit = S[token[token.length - 1]];
    const r = token.slice(0, -1);
    const rank = RANKS[r] ?? Number(r);
    return { id: `${suit}_${rank}`, suit, rank };
  });

test('category detection', () => {
  assert.equal(evaluateHand(hand('As Ah Ad')).category, ZjhCategory.TRIPLE);
  assert.equal(evaluateHand(hand('4h 5h 6h')).category, ZjhCategory.STRAIGHT_FLUSH);
  assert.equal(evaluateHand(hand('2h 9h Kh')).category, ZjhCategory.FLUSH);
  assert.equal(evaluateHand(hand('4h 5s 6h')).category, ZjhCategory.STRAIGHT);
  assert.equal(evaluateHand(hand('4h 4s 9h')).category, ZjhCategory.PAIR);
  assert.equal(evaluateHand(hand('4h 7s 9h')).category, ZjhCategory.HIGH_CARD);
});

test('category order: triple > straight flush > flush > straight > pair > high', () => {
  const order = ['2s 2h 2d', 'As Ks Qs', 'As 9s 4s', 'As Kh Qd', 'As Ah 2d', 'As Kh 9d'].map(hand);
  for (let i = 0; i < order.length - 1; i++) {
    assert.equal(compareHands(order[i], order[i + 1]), 1, `index ${i}`);
    assert.equal(compareHands(order[i + 1], order[i]), -1, `index ${i} reversed`);
  }
});

test('A-2-3 is the smallest straight, A-K-Q the biggest, 2-3-4 above A-2-3', () => {
  assert.equal(evaluateHand(hand('As 2h 3d')).category, ZjhCategory.STRAIGHT);
  assert.equal(compareHands(hand('As Kh Qd'), hand('Ks Qh Jd')), 1);
  assert.equal(compareHands(hand('2s 3h 4d'), hand('As 2h 3d')), 1);
  // Q-K-2 is just a high card, below even the smallest straight
  assert.equal(compareHands(hand('Qs Kh 2d'), hand('As 2h 3d')), -1);
});

test('Q-K-2 is not a straight (no wrap-around)', () => {
  assert.equal(evaluateHand(hand('Qs Kh 2d')).category, ZjhCategory.HIGH_CARD);
  assert.equal(evaluateHand(hand('Ks Ah 2d')).category, ZjhCategory.HIGH_CARD);
});

test('suits never break a tie', () => {
  assert.equal(compareHands(hand('As Kh 9d'), hand('Ah Kd 9s')), 0);
  assert.equal(compareHands(hand('4s 5s 6s'), hand('4h 5h 6h')), 0);
});

test('pair compares pair rank first, then kicker', () => {
  assert.equal(compareHands(hand('5s 5h 2d'), hand('4s 4h Ad')), 1);
  assert.equal(compareHands(hand('5s 5h Kd'), hand('5d 5c Qd')), 1);
  assert.equal(compareHands(hand('2s Ah Ad'), hand('As Ac 3d')), -1);
});

test('high card / flush compare rank by rank', () => {
  assert.equal(compareHands(hand('As 9h 5d'), hand('Ks Qh 9d')), 1);
  assert.equal(compareHands(hand('As 9h 5d'), hand('As 9d 4h')), 1);
  assert.equal(compareHands(hand('As 9s 5s'), hand('Ks Qs 9s')), 1);
});

test('235: only wins vs triple in special mode', () => {
  const t235 = hand('2s 3h 5d');
  const triple = hand('Ks Kh Kd');
  assert.equal(evaluateHand(t235).is235, true);
  assert.equal(compareHands(t235, triple, 'classic'), -1);
  assert.equal(compareHands(t235, triple, 'special'), 1);
  assert.equal(compareHands(triple, t235, 'special'), -1);
  // never beats anything else
  assert.equal(compareHands(t235, hand('4s 3h 2d'), 'special'), -1);
  assert.equal(compareHands(t235, hand('4s 4h 2d'), 'special'), -1);
  // same-suit 235 is a flush, not the special hand
  assert.equal(evaluateHand(hand('2s 3s 5s')).is235, false);
});

test('bet maths: blind vs seen, compare, raise options', () => {
  const blind = { baseScore: 100, stakeLevel: 0, seen: false };
  const seen = { baseScore: 100, stakeLevel: 0, seen: true };
  assert.equal(callCost(blind), 100);
  assert.equal(callCost(seen), 200);
  assert.equal(compareCost(blind), 200);
  assert.equal(compareCost(seen), 400);
  assert.deepEqual(
    raiseOptions({ baseScore: 100, stakeLevel: 1, seen: true }).map((o) => [o.level, o.stake, o.cost]),
    [
      [2, 500, 1000],
      [3, 1000, 2000],
    ],
  );
  assert.deepEqual(raiseOptions({ baseScore: 100, stakeLevel: 3, seen: false }), []);
});

test('compare gate: round >= 2 or heads-up', () => {
  assert.equal(canCompareNow(1, 4), false);
  assert.equal(canCompareNow(2, 4), true);
  assert.equal(canCompareNow(1, 2), true);
});

test('showdown: single winner takes whole pot', () => {
  const res = resolveShowdown(
    [
      { seat: 0, contribution: 300, folded: false, cards: hand('As Ah Ad') },
      { seat: 1, contribution: 300, folded: false, cards: hand('Ks Qh 9d') },
      { seat: 2, contribution: 100, folded: true, cards: hand('2s 4h 9d') },
    ],
    'classic',
  );
  assert.equal(res.payouts.get(0), 700);
  assert.equal(res.payouts.get(1), undefined);
  assert.deepEqual(res.winners, [0]);
});

test('showdown: side pot when short stack wins', () => {
  // seat 0 all-in for 100 with best hand; seats 1/2 put 300 each
  const res = resolveShowdown(
    [
      { seat: 0, contribution: 100, folded: false, allIn: true, cards: hand('As Ah Ad') },
      { seat: 1, contribution: 300, folded: false, cards: hand('Ks Kh 9d') },
      { seat: 2, contribution: 300, folded: false, cards: hand('Qs Qh 9d') },
    ],
    'classic',
  );
  // main pot 3*100 -> seat 0; side pot 2*200 -> seat 1 (KK > QQ)
  assert.equal(res.payouts.get(0), 300);
  assert.equal(res.payouts.get(1), 400);
  assert.equal(res.payouts.get(2), undefined);
  const total = Array.from(res.payouts.values()).reduce((a, b) => a + b, 0);
  assert.equal(total, 700);
});

test('showdown: tie splits, odd chip to earliest seat in order', () => {
  const res = resolveShowdown(
    [
      { seat: 0, contribution: 101, folded: false, cards: hand('As Kh 9d') },
      { seat: 1, contribution: 101, folded: false, cards: hand('Ah Kd 9s') },
    ],
    'classic',
    [1, 0],
  );
  assert.equal(res.payouts.get(1), 101);
  assert.equal(res.payouts.get(0), 101);
  const odd = resolveShowdown(
    [
      { seat: 0, contribution: 50, folded: false, cards: hand('As Kh 9d') },
      { seat: 1, contribution: 50, folded: false, cards: hand('Ah Kd 9s') },
      { seat: 2, contribution: 1, folded: true, cards: hand('2s 3h 9d') },
    ],
    'classic',
    [1, 0, 2],
  );
  assert.equal(odd.payouts.get(1), 51);
  assert.equal(odd.payouts.get(0), 50);
});

test('showdown conserves chips for every layout', () => {
  const deck = createZjhDeck();
  const pick = (i: number): ZjhCard[] => [deck[i], deck[(i + 17) % 52], deck[(i + 31) % 52]];
  for (let i = 0; i < 40; i++) {
    const contenders = [0, 1, 2, 3].map((seat) => ({
      seat,
      contribution: 50 + ((i * 7 + seat * 13) % 5) * 100,
      folded: seat === 3 && i % 2 === 0,
      allIn: seat === 0 && i % 3 === 0,
      cards: pick(i + seat * 3),
    }));
    const live = contenders.filter((c) => !c.folded);
    if (live.length === 0) continue;
    const res = resolveShowdown(contenders, 'special');
    const paid = Array.from(res.payouts.values()).reduce((a, b) => a + b, 0);
    assert.equal(
      paid,
      contenders.reduce((a, c) => a + c.contribution, 0),
      `iteration ${i}`,
    );
  }
});

test('showdown: blind/seen price differences are not caps (no all-in => winner takes all)', () => {
  const res = resolveShowdown(
    [
      { seat: 0, contribution: 300, folded: false, cards: hand('As Ah Ad') }, // blind, paid less
      { seat: 1, contribution: 700, folded: false, cards: hand('Ks Kh 9d') }, // seen, paid more
    ],
    'classic',
  );
  assert.equal(res.payouts.get(0), 1000);
  assert.equal(res.payouts.get(1), undefined);
});

test('showdown: uncovered top layer is refunded when every live seat is all-in short', () => {
  const res = resolveShowdown(
    [
      { seat: 0, contribution: 100, folded: false, allIn: true, cards: hand('As Ah Ad') },
      { seat: 1, contribution: 400, folded: true, cards: hand('Ks Kh 9d') },
    ],
    'classic',
  );
  assert.equal(res.payouts.get(0), 200); // 100 from each, only up to its cap
  assert.equal(res.payouts.get(1), 300); // excess refunded
});

test('hand percentile is monotonic and spans (0,1]', () => {
  const low = handPercentile(hand('2s 4h 7d'));
  const pair = handPercentile(hand('9s 9h 4d'));
  const flush = handPercentile(hand('As 9s 4s'));
  const triple = handPercentile(hand('2s 2h 2d'));
  assert.ok(low > 0 && low < pair && pair < flush && flush < triple && triple < 1);
  assert.ok(handPercentile(hand('As Ah Ad')) === 1);
});

test('exhaustive category probabilities match known values', () => {
  const deck = createZjhDeck();
  const counts: Record<number, number> = {};
  let total = 0;
  for (let i = 0; i < deck.length - 2; i++)
    for (let j = i + 1; j < deck.length - 1; j++)
      for (let k = j + 1; k < deck.length; k++) {
        const c = evaluateHand([deck[i], deck[j], deck[k]]).category;
        counts[c] = (counts[c] ?? 0) + 1;
        total++;
      }
  assert.equal(total, 22100);
  assert.equal(counts[ZjhCategory.TRIPLE], 52);
  assert.equal(counts[ZjhCategory.STRAIGHT_FLUSH], 48);
  assert.equal(counts[ZjhCategory.FLUSH], 1096);
  assert.equal(counts[ZjhCategory.STRAIGHT], 720);
  assert.equal(counts[ZjhCategory.PAIR], 3744);
  assert.equal(counts[ZjhCategory.HIGH_CARD], 16440);
});
