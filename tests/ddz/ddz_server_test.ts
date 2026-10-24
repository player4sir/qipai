import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CardData,
  DdzRules,
  PatternType,
  RANK_VALUES,
  Rank,
} from '../../server/games/ddz/DdzRules.js';
import { DdzStateMachine } from '../../server/games/ddz/DdzStateMachine.js';
import { DdzBotEngine } from '../../server/games/ddz/DdzBotEngine.js';

const SUITS = ['spade', 'heart', 'club', 'diamond'] as const;
let uid = 0;

/** Build a card; `wild` marks it as laizi. Unique id per call. */
function card(rank: Rank, wild = false, suitIdx = uid++ % 4): CardData {
  const isJoker = rank === 'small_joker' || rank === 'big_joker';
  return {
    id: isJoker ? rank : `${SUITS[suitIdx]}_${rank}_${uid++}`,
    rank,
    suit: isJoker ? null : SUITS[suitIdx],
    value: RANK_VALUES[rank],
    isWild: wild || undefined,
  };
}
const many = (ranks: Rank[], wild = false) => ranks.map((r) => card(r, wild));

test('identifyPatternFor: 44445555 beats a lower AIRPLANE_SINGLE_WINGS (was rejected before)', () => {
  const target = DdzRules.identifyPattern(many(['3', '3', '3', '4', '4', '4', '7', '8']))!;
  assert.equal(target.type, PatternType.AIRPLANE_SINGLE_WINGS);

  const cards = many(['6', '6', '6', '6', '7', '7', '7', '7']);
  const primary = DdzRules.identifyPattern(cards)!;
  assert.equal(primary.type, PatternType.FOUR_WITH_TWO_PAIRS);
  assert.equal(DdzRules.canBeat(primary, target), false); // primary alone cannot beat

  const resolved = DdzRules.identifyPatternFor(cards, [], target)!;
  assert.equal(resolved.type, PatternType.AIRPLANE_SINGLE_WINGS);
  assert.ok(DdzRules.canBeat(resolved, target));
});

test('identifyPatternFor: 12 cards 333444555666 can follow a 3-chain airplane with wings', () => {
  const target = DdzRules.identifyPattern(
    many(['3', '3', '3', '4', '4', '4', '5', '5', '5', '7', '8', '9'])
  )!;
  assert.equal(target.type, PatternType.AIRPLANE_SINGLE_WINGS);
  const cards = many(['9', '9', '9', '10', '10', '10', 'J', 'J', 'J', 'Q', 'Q', 'Q']);
  const resolved = DdzRules.identifyPatternFor(cards, [], target)!;
  assert.ok(DdzRules.canBeat(resolved, target));
});

test('identifyPatternFor: laizi 5 cards can follow a TRIPLE_PAIR (not only read as straight)', () => {
  const wildRanks: Rank[] = ['K'];
  const target = DdzRules.identifyPattern(many(['4', '4', '4', '9', '9']))!;
  assert.equal(target.type, PatternType.TRIPLE_PAIR);

  // 7 7 7 + 3 + wild(K as 3)  -> triple-pair 777 33 ; also looks like nothing straight-ish
  const cards = [card('7'), card('7'), card('7'), card('3'), card('K', true)];
  const resolved = DdzRules.identifyPatternFor(cards, wildRanks, target)!;
  assert.equal(resolved.type, PatternType.TRIPLE_PAIR);
  assert.ok(DdzRules.canBeat(resolved, target));
});

test('identifyPattern: laizi 5-chain pure airplane (15 cards) is recognised', () => {
  const wildRanks: Rank[] = ['K'];
  const cards = [
    ...many(['3', '3', '3', '4', '4', '4', '5', '5', '5', '6', '6', '7', '7']),
    card('K', true),
    card('K', true),
  ];
  const p = DdzRules.identifyPattern(cards, wildRanks)!;
  assert.equal(p.type, PatternType.AIRPLANE);
  assert.equal(p.chainCount, 5);
});

test('wouldBreakStraightSkeleton: trimming the END of a long straight is not a break', () => {
  const hist = new Int32Array(15);
  for (let i = 0; i < 8; i++) hist[i] = 1; // 3..10
  assert.equal(DdzRules.wouldBreakStraightSkeleton(hist, 0, 1), false); // low end
  assert.equal(DdzRules.wouldBreakStraightSkeleton(hist, 7, 1), false); // high end
  assert.equal(DdzRules.wouldBreakStraightSkeleton(hist, 3, 1), true); // middle splits 3|4
});

test('wouldBreakConsecutivePairs: end pair of a 4-pair run is not a break', () => {
  const hist = new Int32Array(15);
  for (let i = 0; i < 4; i++) hist[i] = 2;
  assert.equal(DdzRules.wouldBreakConsecutivePairs(hist, 0, 2), false);
  assert.equal(DdzRules.wouldBreakConsecutivePairs(hist, 1, 2), true);
});

test('state machine: 3rd pass redeals immediately and rejects late bidding messages', () => {
  const sm = new DdzStateMachine();
  sm.startDealing('classic');
  const first = sm.currentTurnSeat;
  assert.equal(sm.handleCallLandlord(first, false).valid, true);
  assert.equal(sm.handleCallLandlord((first + 1) % 3, false).valid, true);
  const third = sm.handleCallLandlord((first + 2) % 3, false);
  assert.equal(third.nextPhase, 'redeal');
  assert.equal(sm.phase, 'DEALING');

  // duplicate click / late message inside the redeal delay
  const dup = sm.handleCallLandlord((first + 2) % 3, false);
  assert.equal(dup.valid, false);
  const late = sm.handleCallLandlord((first + 2) % 3, true);
  assert.equal(late.valid, false);
  assert.equal(sm.redealCount, 1);
});

test('bot: facing an enemy with 1 card left plays the HIGHEST single', () => {
  const myCards = many(['4', '9', 'K', '7', '7']);
  const target = DdzRules.identifyPattern([card('3')])!;
  const move = DdzBotEngine.chooseBestMove({
    myCards,
    mySeat: 0,
    landlordSeat: 1,
    lastPlayed: { seat: 1, pattern: target },
    seatCardCounts: { 0: 5, 1: 1, 2: 10 },
    wildRanks: [],
  });
  assert.equal(move.length, 1);
  assert.equal(move[0].rank, 'K');
});

test('hints: every returned move is accepted by the authoritative rules', () => {
  for (let i = 0; i < 40; i++) {
    const hand = DdzRules.sortCardsDesc(DdzRules.dealHands('classic').seat0);
    const targets = [null, DdzRules.identifyPattern([card('5')])!, DdzRules.identifyPattern(many(['6', '6']))!];
    for (const target of targets) {
      for (const mv of DdzBotEngine.findAllPlayableMoves(hand, target, [])) {
        const p = DdzRules.identifyPatternFor(mv, [], target);
        assert.ok(p && DdzRules.canBeat(p, target));
      }
    }
  }
});
