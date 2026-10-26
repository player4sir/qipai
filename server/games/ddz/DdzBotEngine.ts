import {
  CardData,
  ClassifiedPattern,
  DdzRules,
  PatternType,
  Rank,
} from './DdzRules.js';

export interface HandPartition {
  rockets: CardData[][];
  bombs: CardData[][];
  airplanes: CardData[][];
  straights: CardData[][];
  consecutivePairs: CardData[][];
  triples: CardData[][];
  pairs: CardData[][];
  singles: CardData[][];
  netTurns: number;
  controlScore: number;
  structuralScore: number;
}

export interface BotContext {
  myCards: CardData[];
  mySeat: number;
  landlordSeat: number;
  lastPlayed: {
    seat: number;
    pattern: ClassifiedPattern;
  } | null;
  seatCardCounts: Record<number, number>;
  wildRanks?: Rank[];
}

interface SequenceSearchState {
  airplanes: CardData[][];
  consecutivePairs: CardData[][];
  straights: CardData[][];
  triples: CardData[][];
  pairs: CardData[][];
  singles: CardData[][];
  netTurns: number;
  structuralScore: number;
}

/**
 * Commercial-grade Dou Dizhu Core Hand Decomposition & Priority-Queue Decision Engine:
 * 1. DFS Branch-and-Bound Optimal Hand Partitioning Tree with Triple/Pair Preservation Sub-Window Splitting
 * 2. 4-Tier Zero-Breakage Priority Queue Hint Engine (零损提牌 -> 无损修剪/赖子合成 -> 最小损拆牌 -> 炸弹/王炸兜底)
 * 3. Role-aware Peasant Cooperation (Gatekeeper vs Feeder) & Endgame Suppression
 */
export class DdzBotEngine {
  /**
   * Formats a `HandPartition` into a human-readable structured summary for console debugging.
   */
  static formatPartitionSummary(part: HandPartition): Record<string, string | number> {
    const fmtGroup = (groups: CardData[][]) =>
      groups.length === 0 ? '无' : groups.map((g) => DdzRules.formatCards(g)).join(' | ');
    return {
      王炸: fmtGroup(part.rockets),
      炸弹: fmtGroup(part.bombs),
      飞机: fmtGroup(part.airplanes),
      顺子: fmtGroup(part.straights),
      连对: fmtGroup(part.consecutivePairs),
      三张: fmtGroup(part.triples),
      对子: fmtGroup(part.pairs),
      单张: fmtGroup(part.singles),
      预估手数_netTurns: part.netTurns,
      控制分_controlScore: Number(part.controlScore.toFixed(1)),
      结构分_structuralScore: Number(part.structuralScore.toFixed(1)),
    };
  }

  /**
   * Partition a hand into structural combos using DFS Branch-and-Bound search
   * to globally minimize `netTurns` and maximize `structuralScore`.
   * Evaluates candidate sub-straights that preserve internal Triples and Pairs.
   */
  static partitionHand(cards: CardData[], wildRanks: Rank[] = []): HandPartition {
    const wildSet = new Set<Rank>(wildRanks);
    const valMap = DdzRules.countByValue(cards);

    const rockets: CardData[][] = [];
    const bombs: CardData[][] = [];

    // 1. Extract Rocket (undisputed)
    if (valMap.has(16) && valMap.has(17)) {
      rockets.push([...(valMap.get(16) ?? []), ...(valMap.get(17) ?? [])]);
      valMap.delete(16);
      valMap.delete(17);
    }

    // 2. Extract 4-of-a-kind Bombs (Hard Bombs or Pure 4-Wild Bombs)
    const sortedValsAsc = Array.from(valMap.keys()).sort((a, b) => a - b);
    for (const val of sortedValsAsc) {
      const group = valMap.get(val);
      if (group && group.length === 4) {
        bombs.push([...group]);
        valMap.delete(val);
      }
    }

    // Separate high non-sequence cards (2, Small Joker, Big Joker) from sequence-eligible cards (3..A, val 3..14)
    const highTriples: CardData[][] = [];
    const highPairs: CardData[][] = [];
    const highSingles: CardData[][] = [];

    for (const highVal of [15, 16, 17]) {
      const grp = valMap.get(highVal);
      if (!grp || grp.length === 0) continue;
      if (grp.length === 3) highTriples.push([...grp]);
      else if (grp.length === 2) highPairs.push([...grp]);
      else if (grp.length === 1) highSingles.push([...grp]);
      valMap.delete(highVal);
    }

    // Build pools for sequence-eligible ranks (3..14)
    const seqPool = new Map<number, CardData[]>();
    for (const [v, grp] of valMap.entries()) {
      if (v <= 14 && grp.length > 0) {
        seqPool.set(v, [...grp]);
      }
    }

    // 3. Run DFS Branch-and-Bound search over 3..14 to find optimal sequence extraction
    let nodesVisited = 0;
    const MAX_DFS_NODES = 240;
    let bestState: SequenceSearchState | null = null;

    const evaluateLeaf = (
      pool: Map<number, CardData[]>,
      airplanes: CardData[][],
      consecutivePairs: CardData[][],
      straights: CardData[][]
    ): SequenceSearchState => {
      const triples: CardData[][] = [];
      const pairs: CardData[][] = [];
      const singles: CardData[][] = [];

      const remVals = Array.from(pool.keys()).sort((a, b) => a - b);
      for (const v of remVals) {
        const grp = pool.get(v)!;
        if (grp.length === 3) triples.push([...grp]);
        else if (grp.length === 2) pairs.push([...grp]);
        else if (grp.length === 1) singles.push([...grp]);
      }

      const allTriples = [...triples, ...highTriples];
      const allPairs = [...pairs, ...highPairs];
      const allSingles = [...singles, ...highSingles];

      const wingCapacity =
        allTriples.length + airplanes.reduce((acc, p) => acc + p.length / 3, 0);
      const lowWingCandidates =
        allSingles.filter((s) => s[0].value <= 14).length +
        allPairs.filter((p) => p[0].value <= 13).length;
      const absorbedWings = Math.min(wingCapacity, lowWingCandidates);

      const totalCombos =
        airplanes.length +
        consecutivePairs.length +
        straights.length +
        allTriples.length +
        allPairs.length +
        allSingles.length;

      const wildBonusTurns = cards.filter((c) => c.isWild || wildSet.has(c.rank)).length;

      const netTurns = Math.max(
        1,
        totalCombos - absorbedWings - bombs.length - rockets.length - Math.floor(wildBonusTurns / 2)
      );

      const structuralScore =
        airplanes.length * 18 +
        consecutivePairs.reduce((acc, cp) => acc + cp.length * 2.5, 0) +
        straights.reduce((acc, st) => acc + st.length * 2.2, 0) +
        allTriples.length * 9 +
        allPairs.length * 3 -
        allSingles.filter((s) => s[0].value <= 10).length * 4.5 -
        allSingles.filter((s) => s[0].value > 10 && s[0].value <= 14).length * 2.2;

      return {
        airplanes: airplanes.map((a) => [...a]),
        consecutivePairs: consecutivePairs.map((c) => [...c]),
        straights: straights.map((s) => [...s]),
        triples: allTriples,
        pairs: allPairs,
        singles: allSingles,
        netTurns,
        structuralScore,
      };
    };

    const isBetterState = (cand: SequenceSearchState, curr: SequenceSearchState | null): boolean => {
      if (!curr) return true;
      if (cand.netTurns !== curr.netTurns) {
        return cand.netTurns < curr.netTurns;
      }
      return cand.structuralScore > curr.structuralScore;
    };

    const dfs = (
      pool: Map<number, CardData[]>,
      airplanes: CardData[][],
      consecutivePairs: CardData[][],
      straights: CardData[][]
    ): void => {
      nodesVisited++;
      const currentEval = evaluateLeaf(pool, airplanes, consecutivePairs, straights);
      if (isBetterState(currentEval, bestState)) {
        bestState = currentEval;
      }

      if (nodesVisited >= MAX_DFS_NODES) return;

      const extractedCount = airplanes.length + consecutivePairs.length + straights.length;
      if (bestState && extractedCount > bestState.netTurns + 2) {
        return;
      }

      // Candidate 1: Extract an Airplane (consecutive triples, length >= 2)
      const tripleVals = Array.from(pool.entries())
        .filter(([, g]) => g.length >= 3)
        .map(([v]) => v)
        .sort((a, b) => a - b);

      for (let i = 0; i < tripleVals.length; i++) {
        let j = i;
        while (j + 1 < tripleVals.length && tripleVals[j + 1] === tripleVals[j] + 1) {
          j++;
        }
        const runLen = j - i + 1;
        if (runLen >= 2) {
          const nextPool = this.clonePool(pool);
          const planeCards: CardData[] = [];
          for (let k = i; k <= j; k++) {
            const v = tripleVals[k];
            const grp = nextPool.get(v)!;
            planeCards.push(...grp.splice(0, 3));
            if (grp.length === 0) nextPool.delete(v);
          }
          dfs(
            nextPool,
            [...airplanes, DdzRules.sortCardsDesc(planeCards)],
            consecutivePairs,
            straights
          );
        }
        i = j;
      }

      // Candidate 2: Extract Consecutive Pairs (length >= 3 pairs)
      const pairVals = Array.from(pool.entries())
        .filter(([, g]) => g.length >= 2)
        .map(([v]) => v)
        .sort((a, b) => a - b);

      for (let i = 0; i < pairVals.length; i++) {
        let j = i;
        while (j + 1 < pairVals.length && pairVals[j + 1] === pairVals[j] + 1) {
          j++;
        }
        const runLen = j - i + 1;
        if (runLen >= 3) {
          const lengthsToTry = runLen >= 4 ? [runLen, 3] : [runLen];
          for (const len of lengthsToTry) {
            const nextPool = this.clonePool(pool);
            const cpCards: CardData[] = [];
            for (let k = i; k < i + len; k++) {
              const v = pairVals[k];
              const grp = nextPool.get(v)!;
              cpCards.push(...grp.splice(0, 2));
              if (grp.length === 0) nextPool.delete(v);
            }
            dfs(
              nextPool,
              airplanes,
              [...consecutivePairs, DdzRules.sortCardsDesc(cpCards)],
              straights
            );
          }
        }
        i = j;
      }

      // Candidate 3: Extract Straight (length >= 5 consecutive singles)
      // Generates candidate sub-windows: full span, edge-trimmed spans, and triple-preserving sub-spans
      const singleVals = Array.from(pool.entries())
        .filter(([, g]) => g.length >= 1)
        .map(([v]) => v)
        .sort((a, b) => a - b);

      for (let i = 0; i < singleVals.length; i++) {
        let j = i;
        while (j + 1 < singleVals.length && singleVals[j + 1] === singleVals[j] + 1) {
          j++;
        }
        const runLen = j - i + 1;
        if (runLen >= 5) {
          const candidateWindows: Array<[number, number]> = [[i, j]];
          const seenWin = new Set<string>([`${i}_${j}`]);
          const addWindow = (s: number, e: number) => {
            if (e - s + 1 < 5) return;
            const key = `${s}_${e}`;
            if (!seenWin.has(key)) {
              seenWin.add(key);
              candidateWindows.push([s, e]);
            }
          };

          // Trim edges if endpoints hold Pairs or Triples
          if (runLen >= 6) {
            if ((pool.get(singleVals[i])?.length ?? 0) >= 2) addWindow(i + 1, j);
            if ((pool.get(singleVals[j])?.length ?? 0) >= 2) addWindow(i, j - 1);
          }
          if (runLen >= 7) {
            if (
              (pool.get(singleVals[i])?.length ?? 0) >= 2 &&
              (pool.get(singleVals[j])?.length ?? 0) >= 2
            ) {
              addWindow(i + 1, j - 1);
            }
          }

          // Split around internal Triples (e.g. 3-4-5-6-7-888-9 -> test 3-4-5-6-7 keeping 888 intact)
          for (let k = i; k <= j; k++) {
            if ((pool.get(singleVals[k])?.length ?? 0) === 3) {
              addWindow(i, k - 1);
              addWindow(k + 1, j);
            }
          }

          for (const [wStart, wEnd] of candidateWindows) {
            const nextPool = this.clonePool(pool);
            const stCards: CardData[] = [];
            for (let k = wStart; k <= wEnd; k++) {
              const v = singleVals[k];
              const grp = nextPool.get(v)!;
              stCards.push(grp.pop()!);
              if (grp.length === 0) nextPool.delete(v);
            }
            dfs(
              nextPool,
              airplanes,
              consecutivePairs,
              [...straights, DdzRules.sortCardsDesc(stCards)]
            );
          }
        }
        i = j;
      }
    };

    dfs(seqPool, [], [], []);

    const chosen = bestState ?? evaluateLeaf(seqPool, [], [], []);

    let controlScore = 0;
    controlScore += rockets.length * 8;
    controlScore += bombs.length * 6;
    for (const c of cards) {
      if (c.isWild || wildSet.has(c.rank)) controlScore += 3.5;
      else if (c.value === 17) controlScore += 4;
      else if (c.value === 16) controlScore += 3;
      else if (c.value === 15) controlScore += 2;
      else if (c.value === 14) controlScore += 1;
    }

    return {
      rockets,
      bombs,
      airplanes: chosen.airplanes,
      straights: chosen.straights,
      consecutivePairs: chosen.consecutivePairs,
      triples: chosen.triples,
      pairs: chosen.pairs,
      singles: chosen.singles,
      netTurns: chosen.netTurns,
      controlScore,
      structuralScore: chosen.structuralScore,
    };
  }

  private static clonePool(pool: Map<number, CardData[]>): Map<number, CardData[]> {
    const next = new Map<number, CardData[]>();
    for (const [k, v] of pool.entries()) {
      next.set(k, [...v]);
    }
    return next;
  }

  static shouldCallOrGrab(
    cards: CardData[],
    isGrabPhase: boolean,
    currentMultiplier: number,
    wildRanks: Rank[] = []
  ): boolean {
    const part = this.partitionHand(cards, wildRanks);
    if (!isGrabPhase) {
      return part.controlScore >= 7 || (part.controlScore >= 5 && part.netTurns <= 6);
    }
    if (currentMultiplier >= 4) {
      return part.controlScore >= 11 && part.netTurns <= 5;
    }
    return part.controlScore >= 9 || (part.controlScore >= 7 && part.netTurns <= 5);
  }

  static chooseDoubleFactor(
    cards: CardData[],
    isLandlord: boolean,
    currentMultiplier: number,
    wildRanks: Rank[] = []
  ): 1 | 2 | 4 {
    const part = this.partitionHand(cards, wildRanks);
    const thresholdBonus = isLandlord ? 1 : 0;
    if (
      part.controlScore >= 11 + thresholdBonus &&
      part.netTurns <= 4 &&
      currentMultiplier <= 8
    ) {
      return 4;
    }
    if (part.controlScore >= 7 + thresholdBonus && part.netTurns <= 6) {
      return 2;
    }
    return 1;
  }

  /**
   * 4-Tier Zero-Breakage Priority Queue Hint Engine (`findAllPlayableMoves`) with Laizi Wild Synthesis:
   * - Tier 1 (Zero Breakage): Pure isolated combos from DFS optimal partition.
   * - Tier 2 (Zero-Turn-Penalty Edge Trimming & Laizi Combos): Trimming 6+ straights or using wild cards to complete pairs/triples/straights.
   * - Tier 3 (Minimal Net-Turn Loss Splitting): Splitting pairs/triples/sequences ordered by smallest post-move `netTurns` increase.
   * - Tier 4 (Bomb & Rocket Fallback): Soft Bombs -> Hard Bombs -> Pure Laizi Bomb -> Rocket last.
   */
  static findAllPlayableMoves(
    cards: CardData[],
    target: ClassifiedPattern | null,
    wildRanks: Rank[] = []
  ): CardData[][] {
    const sorted = DdzRules.sortCardsDesc(cards);
    const wildSet = new Set<Rank>(wildRanks);
    const wildPool = sorted.filter((c) => Boolean(c.isWild || wildSet.has(c.rank)));
    const wildIds = new Set(wildPool.map((c) => c.id));
    const naturals = sorted.filter((c) => !wildIds.has(c.id));

    const valMap = DdzRules.countByValue(sorted);
    const natMap = DdzRules.countByValue(naturals);
    const distinctAsc = Array.from(valMap.keys()).sort((a, b) => a - b);
    const natDistinctAsc = Array.from(natMap.keys()).sort((a, b) => a - b);

    // If whole hand is a single valid pattern that beats target, prioritize it immediately!
    const fullHandPattern = DdzRules.identifyPatternFor(sorted, wildRanks, target);
    if (fullHandPattern && DdzRules.canBeat(fullHandPattern, target)) {
      if (!target) {
        return [fullHandPattern.cards];
      }
    }

    const part = this.partitionHand(sorted, wildRanks);

    // Case A: Free Lead (target === null) — Commercial Priority Queue Lead Ordering
    if (!target) {
      const leadResults: CardData[][] = [];
      if (fullHandPattern) {
        leadResults.push(fullHandPattern.cards);
      }

      // 1. Airplanes (with optimal wings first, then pure airplane)
      for (const plane of part.airplanes) {
        const k = plane.length / 3;
        const planeIds = new Set(plane.map((c) => c.id));
        const planeRanks = new Set(plane.map((c) => c.value));
        const optSingleWings = DdzRules.selectOptimalWings(
          sorted,
          planeIds,
          planeRanks,
          k,
          1,
          wildRanks
        );
        const optPairWings = DdzRules.selectOptimalWings(
          sorted,
          planeIds,
          planeRanks,
          k,
          2,
          wildRanks
        );
        if (optSingleWings) {
          leadResults.push([...plane, ...optSingleWings]);
        }
        if (optPairWings) {
          leadResults.push([...plane, ...optPairWings]);
        }
        leadResults.push(plane);
      }

      // 2. Straights & Consecutive Pairs
      for (const st of part.straights) leadResults.push(st);
      for (const cp of part.consecutivePairs) leadResults.push(cp);

      // 3. Low-to-mid Triples (3..K, value <= 13) with optimal wings
      const lowTriples = part.triples.filter((tr) => tr[0].value <= 13);
      const highTriples = part.triples.filter((tr) => tr[0].value > 13);

      const appendTripleLeads = (triplesList: CardData[][]) => {
        for (const tr of triplesList) {
          const trIds = new Set(tr.map((c) => c.id));
          const trRanks = new Set([tr[0].value]);
          const optSingleWing = DdzRules.selectOptimalWings(
            sorted,
            trIds,
            trRanks,
            1,
            1,
            wildRanks
          );
          const optPairWing = DdzRules.selectOptimalWings(
            sorted,
            trIds,
            trRanks,
            1,
            2,
            wildRanks
          );
          if (optSingleWing) {
            leadResults.push([...tr, ...optSingleWing]);
          }
          if (optPairWing) {
            leadResults.push([...tr, ...optPairWing]);
          }
          leadResults.push(tr);
        }
      };

      appendTripleLeads(lowTriples);

      // 4. Low-to-mid Pairs & Singles (value <= 14)
      for (const pr of part.pairs.filter((p) => p[0].value <= 14)) leadResults.push(pr);
      for (const sg of part.singles.filter((s) => s[0].value <= 14)) leadResults.push(sg);

      // 5. High Control Triples (AAA, 222) and High Pairs/Singles (2, Jokers)
      appendTripleLeads(highTriples);
      for (const pr of part.pairs.filter((p) => p[0].value > 14)) leadResults.push(pr);
      for (const sg of part.singles.filter((s) => s[0].value > 14)) leadResults.push(sg);

      // 6. Bombs & Rockets last
      for (const bm of part.bombs) leadResults.push(bm);
      for (const rk of part.rockets) leadResults.push(rk);

      return this.filterLegalMoves(this.dedupeMoves(leadResults), null, wildRanks);
    }

    // Case B: Following a target pattern
    if (target.type === PatternType.ROCKET) {
      return [];
    }

    const tier1ZeroBreakage: CardData[][] = [];
    const tier2EdgeTrim: CardData[][] = [];
    const tier3SplitCandidates: CardData[][] = [];

    if (
      fullHandPattern &&
      fullHandPattern.type !== PatternType.BOMB &&
      fullHandPattern.type !== PatternType.ROCKET &&
      DdzRules.canBeat(fullHandPattern, target)
    ) {
      tier1ZeroBreakage.push(fullHandPattern.cards);
    }

    const bombValues = new Set(part.bombs.map((b) => b[0].value));
    const hasRocket = part.rockets.length > 0;
    const nonBombVals = distinctAsc.filter(
      (v) => !bombValues.has(v) && !(hasRocket && (v === 16 || v === 17))
    );

    const isolatedSingleVals = part.singles.map((s) => s[0].value);
    const isolatedPairVals = part.pairs.map((p) => p[0].value);
    const isolatedTripleVals = part.triples.map((t) => t[0].value);

    switch (target.type) {
      case PatternType.SINGLE: {
        for (const sg of part.singles) {
          if (sg[0].value > target.mainValue) {
            tier1ZeroBreakage.push([sg[0]]);
          }
        }

        for (const st of part.straights) {
          if (st.length >= 6) {
            const asc = [...st].sort((a, b) => a.value - b.value);
            const lowEdge = asc[0];
            const highEdge = asc[asc.length - 1];
            if (lowEdge.value > target.mainValue) {
              tier2EdgeTrim.push([lowEdge]);
            }
            if (highEdge.value > target.mainValue) {
              tier2EdgeTrim.push([highEdge]);
            }
          }
        }

        for (const v of nonBombVals) {
          if (v > target.mainValue && !isolatedSingleVals.includes(v)) {
            tier3SplitCandidates.push([valMap.get(v)![0]]);
          }
        }
        break;
      }

      case PatternType.PAIR: {
        for (const pr of part.pairs) {
          if (pr[0].value > target.mainValue) {
            tier1ZeroBreakage.push(pr.slice(0, 2));
          }
        }

        for (const cp of part.consecutivePairs) {
          if (cp.length >= 8) {
            const asc = [...cp].sort((a, b) => a.value - b.value);
            const lowPair = asc.slice(0, 2);
            const highPair = asc.slice(asc.length - 2);
            if (lowPair[0].value > target.mainValue) tier2EdgeTrim.push(lowPair);
            if (highPair[0].value > target.mainValue) tier2EdgeTrim.push(highPair);
          }
        }

        for (const v of nonBombVals) {
          if (
            v > target.mainValue &&
            (valMap.get(v)?.length ?? 0) >= 2 &&
            !isolatedPairVals.includes(v)
          ) {
            tier3SplitCandidates.push(valMap.get(v)!.slice(0, 2));
          }
        }

        if (wildPool.length >= 1) {
          for (const v of natDistinctAsc) {
            if (v > target.mainValue && v <= 15 && (natMap.get(v)?.length ?? 0) === 1) {
              tier2EdgeTrim.push([natMap.get(v)![0], wildPool[wildPool.length - 1]]);
            }
          }
        }
        break;
      }

      case PatternType.TRIPLE: {
        for (const tr of part.triples) {
          if (tr[0].value > target.mainValue) {
            tier1ZeroBreakage.push(tr.slice(0, 3));
          }
        }
        for (const v of nonBombVals) {
          if (
            v > target.mainValue &&
            (valMap.get(v)?.length ?? 0) >= 3 &&
            !isolatedTripleVals.includes(v)
          ) {
            tier3SplitCandidates.push(valMap.get(v)!.slice(0, 3));
          }
        }
        if (wildPool.length >= 1) {
          for (const v of natDistinctAsc) {
            if (v > target.mainValue && v <= 15 && (natMap.get(v)?.length ?? 0) === 2) {
              tier2EdgeTrim.push([
                ...natMap.get(v)!.slice(0, 2),
                wildPool[wildPool.length - 1],
              ]);
            }
          }
        }
        break;
      }

      case PatternType.TRIPLE_SINGLE: {
        for (const tr of part.triples) {
          if (tr[0].value > target.mainValue) {
            const core = tr.slice(0, 3);
            const optWing = DdzRules.selectOptimalWings(
              sorted,
              new Set(core.map((c) => c.id)),
              new Set([tr[0].value]),
              1,
              1,
              wildRanks
            );
            if (optWing) {
              tier1ZeroBreakage.push([...core, ...optWing]);
            }
          }
        }
        for (const v of nonBombVals) {
          if (v > target.mainValue && (valMap.get(v)?.length ?? 0) >= 3) {
            const core = valMap.get(v)!.slice(0, 3);
            const optWing = DdzRules.selectOptimalWings(
              sorted,
              new Set(core.map((c) => c.id)),
              new Set([v]),
              1,
              1,
              wildRanks
            );
            if (optWing) {
              tier3SplitCandidates.push([...core, ...optWing]);
            }
          }
        }
        if (wildPool.length >= 1) {
          const wCard = wildPool[wildPool.length - 1];
          for (const v of natDistinctAsc) {
            if (v > target.mainValue && v <= 15 && (natMap.get(v)?.length ?? 0) === 2) {
              const core = [...natMap.get(v)!.slice(0, 2), wCard];
              const optWing = DdzRules.selectOptimalWings(
                sorted,
                new Set(core.map((c) => c.id)),
                new Set([v]),
                1,
                1,
                wildRanks
              );
              if (optWing) {
                tier2EdgeTrim.push([...core, ...optWing]);
              }
            }
          }
        }
        break;
      }

      case PatternType.TRIPLE_PAIR: {
        for (const tr of part.triples) {
          if (tr[0].value > target.mainValue) {
            const core = tr.slice(0, 3);
            const optPairWing = DdzRules.selectOptimalWings(
              sorted,
              new Set(core.map((c) => c.id)),
              new Set([tr[0].value]),
              1,
              2,
              wildRanks
            );
            if (optPairWing) {
              tier1ZeroBreakage.push([...core, ...optPairWing]);
            }
          }
        }
        for (const v of nonBombVals) {
          if (v > target.mainValue && (valMap.get(v)?.length ?? 0) >= 3) {
            const core = valMap.get(v)!.slice(0, 3);
            const optPairWing = DdzRules.selectOptimalWings(
              sorted,
              new Set(core.map((c) => c.id)),
              new Set([v]),
              1,
              2,
              wildRanks
            );
            if (optPairWing) {
              tier3SplitCandidates.push([...core, ...optPairWing]);
            }
          }
        }
        break;
      }

      case PatternType.STRAIGHT: {
        const len = target.length;
        for (const st of part.straights) {
          if (st.length === len) {
            const maxVal = Math.max(...st.map((c) => c.value));
            if (maxVal > target.mainValue) {
              tier1ZeroBreakage.push(st);
            }
          } else if (st.length > len) {
            const asc = [...st].sort((a, b) => a.value - b.value);
            for (let i = 0; i <= asc.length - len; i++) {
              const win = asc.slice(i, i + len);
              if (win[win.length - 1].value > target.mainValue) {
                tier2EdgeTrim.push(win);
              }
            }
          }
        }

        const availVals = nonBombVals.filter((v) => v <= 14);
        for (let i = 0; i <= availVals.length - len; i++) {
          const window = availVals.slice(i, i + len);
          const maxV = window[window.length - 1];
          if (maxV - window[0] === len - 1 && maxV > target.mainValue) {
            tier3SplitCandidates.push(window.map((v) => valMap.get(v)![0]));
          }
        }

        if (wildPool.length >= 1) {
          for (
            let maxV = Math.max(target.mainValue + 1, 3 + len - 1);
            maxV <= 14;
            maxV++
          ) {
            const minV = maxV - len + 1;
            const picked: CardData[] = [];
            let missing = 0;
            for (let v = minV; v <= maxV; v++) {
              const natGrp = natMap.get(v);
              if (natGrp && natGrp.length > 0) {
                picked.push(natGrp[0]);
              } else {
                missing++;
              }
            }
            if (missing > 0 && missing <= wildPool.length) {
              picked.push(...wildPool.slice(wildPool.length - missing));
              tier2EdgeTrim.push(picked);
            }
          }
        }
        break;
      }

      case PatternType.CONSECUTIVE_PAIRS: {
        const pairCount = target.chainCount;
        for (const cp of part.consecutivePairs) {
          const cpPairs = cp.length / 2;
          if (cpPairs === pairCount) {
            const maxVal = Math.max(...cp.map((c) => c.value));
            if (maxVal > target.mainValue) {
              tier1ZeroBreakage.push(cp);
            }
          } else if (cpPairs > pairCount) {
            const asc = [...cp].sort((a, b) => a.value - b.value);
            for (let i = 0; i <= cpPairs - pairCount; i++) {
              const win = asc.slice(i * 2, (i + pairCount) * 2);
              if (win[win.length - 1].value > target.mainValue) {
                tier2EdgeTrim.push(win);
              }
            }
          }
        }

        const availVals = nonBombVals.filter(
          (v) => v <= 14 && (valMap.get(v)?.length ?? 0) >= 2
        );
        for (let i = 0; i <= availVals.length - pairCount; i++) {
          const window = availVals.slice(i, i + pairCount);
          const maxV = window[window.length - 1];
          if (maxV - window[0] === pairCount - 1 && maxV > target.mainValue) {
            tier3SplitCandidates.push(
              window.flatMap((v) => valMap.get(v)!.slice(0, 2))
            );
          }
        }

        if (wildPool.length >= 1) {
          for (
            let maxV = Math.max(target.mainValue + 1, 3 + pairCount - 1);
            maxV <= 14;
            maxV++
          ) {
            const minV = maxV - pairCount + 1;
            const picked: CardData[] = [];
            let missing = 0;
            for (let v = minV; v <= maxV; v++) {
              const natGrp = natMap.get(v) ?? [];
              const take = Math.min(2, natGrp.length);
              picked.push(...natGrp.slice(0, take));
              missing += 2 - take;
            }
            if (missing > 0 && missing <= wildPool.length) {
              picked.push(...wildPool.slice(wildPool.length - missing));
              tier2EdgeTrim.push(picked);
            }
          }
        }
        break;
      }

      case PatternType.AIRPLANE:
      case PatternType.AIRPLANE_SINGLE_WINGS:
      case PatternType.AIRPLANE_PAIR_WINGS: {
        const k = target.chainCount;
        const availTriples = nonBombVals.filter(
          (v) => v <= 14 && (valMap.get(v)?.length ?? 0) >= 3
        );
        for (let i = 0; i <= availTriples.length - k; i++) {
          const seq = availTriples.slice(i, i + k);
          const maxV = seq[seq.length - 1];
          if (maxV - seq[0] === k - 1 && maxV > target.mainValue) {
            const core = seq.flatMap((v) => valMap.get(v)!.slice(0, 3));
            const coreIds = new Set(core.map((c) => c.id));
            const coreRanks = new Set(seq);
            if (target.type === PatternType.AIRPLANE) {
              tier1ZeroBreakage.push(core);
            } else if (target.type === PatternType.AIRPLANE_SINGLE_WINGS) {
              const optWings = DdzRules.selectOptimalWings(
                sorted,
                coreIds,
                coreRanks,
                k,
                1,
                wildRanks
              );
              if (optWings) {
                tier1ZeroBreakage.push([...core, ...optWings]);
              }
            } else if (target.type === PatternType.AIRPLANE_PAIR_WINGS) {
              const optWings = DdzRules.selectOptimalWings(
                sorted,
                coreIds,
                coreRanks,
                k,
                2,
                wildRanks
              );
              if (optWings) {
                tier1ZeroBreakage.push([...core, ...optWings]);
              }
            }
          }
        }
        break;
      }

      case PatternType.FOUR_WITH_TWO_SINGLES:
      case PatternType.FOUR_WITH_TWO_PAIRS: {
        const wingSize: 1 | 2 =
          target.type === PatternType.FOUR_WITH_TWO_SINGLES ? 1 : 2;
        for (const v of distinctAsc) {
          if (v > target.mainValue && (valMap.get(v)?.length ?? 0) === 4) {
            const core = valMap.get(v)!.slice(0, 4);
            const optWings = DdzRules.selectOptimalWings(
              sorted,
              new Set(core.map((c) => c.id)),
              new Set([v]),
              2,
              wingSize,
              wildRanks
            );
            if (optWings) {
              tier3SplitCandidates.push([...core, ...optWings]);
            }
          }
        }
        break;
      }

      default:
        break;
    }

    const scoredTier3 = tier3SplitCandidates.map((cand) => {
      const usedIds = new Set(cand.map((c) => c.id));
      const rem = sorted.filter((c) => !usedIds.has(c.id));
      const remPart = this.partitionHand(rem, wildRanks);
      const mainVal = DdzRules.identifyPatternFor(cand, wildRanks, target)?.mainValue ?? 0;
      return {
        cards: cand,
        postNetTurns: remPart.netTurns,
        mainVal,
      };
    });

    scoredTier3.sort((a, b) => {
      if (a.postNetTurns !== b.postNetTurns) return a.postNetTurns - b.postNetTurns;
      return a.mainVal - b.mainVal;
    });

    // Tier 4: Soft Bombs (ascending) -> Hard Bombs (ascending) -> Pure Laizi Bomb -> Rocket last
    const tier4BombsAndRocket: CardData[][] = [];

    if (wildPool.length >= 1) {
      for (const v of natDistinctAsc) {
        if (v > 15) continue;
        const natGrp = natMap.get(v) ?? [];
        if (natGrp.length >= 2 && natGrp.length < 4) {
          const needed = 4 - natGrp.length;
          if (needed <= wildPool.length) {
            const softBomb = [...natGrp, ...wildPool.slice(wildPool.length - needed)];
            const sbPat = DdzRules.identifyPattern(softBomb, wildRanks);
            if (sbPat && DdzRules.canBeat(sbPat, target)) {
              tier4BombsAndRocket.push(softBomb);
            }
          }
        }
      }
    }

    const sortedBombs = [...part.bombs].sort((a, b) => a[0].value - b[0].value);
    for (const bm of sortedBombs) {
      const bmPat = DdzRules.identifyPattern(bm, wildRanks);
      if (bmPat && DdzRules.canBeat(bmPat, target)) {
        tier4BombsAndRocket.push(bm);
      }
    }

    if (wildPool.length >= 4) {
      const pureWildBomb = wildPool.slice(0, 4);
      const pwPat = DdzRules.identifyPattern(pureWildBomb, wildRanks);
      if (pwPat && DdzRules.canBeat(pwPat, target)) {
        tier4BombsAndRocket.push(pureWildBomb);
      }
    }

    for (const rk of part.rockets) {
      tier4BombsAndRocket.push(rk);
    }

    return this.filterLegalMoves(
      this.dedupeMoves([
        ...tier1ZeroBreakage,
        ...tier2EdgeTrim,
        ...scoredTier3.map((item) => item.cards),
        ...tier4BombsAndRocket,
      ]),
      target,
      wildRanks
    );
  }

  /**
   * Final safety net: only keep moves the authoritative server rules accept,
   * and normalize each move's card order to the canonical pattern order.
   */
  private static filterLegalMoves(
    moves: CardData[][],
    target: ClassifiedPattern | null,
    wildRanks: Rank[]
  ): CardData[][] {
    const validMoves: CardData[][] = [];
    for (const m of moves) {
      if (m.length === 0) continue;
      const pattern = DdzRules.identifyPatternFor(m, wildRanks, target);
      if (pattern !== null && DdzRules.canBeat(pattern, target)) {
        validMoves.push(pattern.cards);
      }
    }
    return validMoves;
  }

  /**
   * Two-Turn Checkmate Solver (二步必胜前瞻搜索):
   * Checks if there is a playable move `m1` such that:
   * 1) `m1` is an unstoppable control play (Rocket, Bomb, top-rank play, or multi-card combo when enemies cannot beat it), AND
   * 2) The remaining cards `myCards - m1` form a single valid pattern `m2` (1-turn clear), OR
   * 3) `m1` is any valid move and `myCards - m1` is a Rocket or Bomb (guaranteed regain control & instant win).
   */
  static solveTwoTurnCheckmate(
    myCards: CardData[],
    target: ClassifiedPattern | null,
    moves: CardData[][],
    enemyMaxCards: number,
    wildRanks: Rank[] = []
  ): CardData[] | null {
    if (moves.length === 0 || myCards.length <= 1) return null;

    for (const m1 of moves) {
      if (m1.length >= myCards.length) continue;
      const p1 = DdzRules.identifyPatternFor(m1, wildRanks, target);
      if (!p1) continue;

      const usedIds = new Set(m1.map((c) => c.id));
      const remCards = myCards.filter((c) => !usedIds.has(c.id));
      const p2 = DdzRules.identifyPattern(remCards, wildRanks);
      if (!p2) continue;

      // Case A: Remaining hand is a Rocket or Bomb -> playing m1 leaves an unstoppable bomb/rocket to finish!
      if (p2.type === PatternType.ROCKET || p2.type === PatternType.BOMB) {
        return m1;
      }

      // Case B: m1 itself is a Rocket, Bomb, or high commanding play that forces pass, and remCards is a single valid combo
      const isCommandingMove =
        p1.type === PatternType.ROCKET ||
        p1.type === PatternType.BOMB ||
        (p1.type === PatternType.SINGLE && p1.mainValue >= 16) ||
        (p1.type === PatternType.PAIR && p1.mainValue >= 15) ||
        (p1.type === PatternType.AIRPLANE ||
          p1.type === PatternType.AIRPLANE_SINGLE_WINGS ||
          p1.type === PatternType.AIRPLANE_PAIR_WINGS) ||
        (p1.length > enemyMaxCards && enemyMaxCards <= 4);

      if (isCommandingMove) {
        return m1;
      }
    }

    return null;
  }

  /**
   * Tactical AI Decision Engine for playing cards or passing:
   * - Distinguishes Landlord Upper-Seat Peasant (顶牌手 Gatekeeper) vs Lower-Seat Peasant (送牌手 Feeder)
   * - Protects Bombs/Rockets unless intercepting an enemy endgame threat or executing a 2-turn checkmate
   */
  static chooseBestMove(ctx: BotContext): CardData[] {
    const { myCards, mySeat, landlordSeat, lastPlayed, seatCardCounts, wildRanks = [] } = ctx;
    const isMeLandlord = mySeat === landlordSeat;
    const nextSeat = (mySeat + 1) % 3;
    const isGatekeeper = !isMeLandlord && nextSeat === landlordSeat; // 地主上家（顶牌手）
    const isFeeder = !isMeLandlord && nextSeat !== landlordSeat; // 地主下家（顺牌/送牌手）

    const targetPattern =
      lastPlayed && lastPlayed.seat !== mySeat ? lastPlayed.pattern : null;

    const moves = this.findAllPlayableMoves(myCards, targetPattern, wildRanks);
    if (moves.length === 0) return [];

    // 1. Instant 1-Turn Win Check
    for (const m of moves) {
      if (m.length === myCards.length) {
        return m;
      }
    }

    const enemySeats = isMeLandlord
      ? [0, 1, 2].filter((s) => s !== landlordSeat)
      : [landlordSeat];
    const enemyMinCards = Math.min(...enemySeats.map((s) => seatCardCounts[s] ?? 17));
    const enemyMaxCards = Math.max(...enemySeats.map((s) => seatCardCounts[s] ?? 17));
    const landlordCardsLeft = seatCardCounts[landlordSeat] ?? 17;

    // 1.5 Two-Turn Checkmate Lookahead (二步必胜终局求解)
    const checkmateMove = this.solveTwoTurnCheckmate(
      myCards,
      targetPattern,
      moves,
      enemyMaxCards,
      wildRanks
    );
    if (checkmateMove) {
      return checkmateMove;
    }

    const part = this.partitionHand(myCards, wildRanks);

    // 2. Free Lead Logic (主动领出博弈)
    if (!targetPattern) {
      if (!isMeLandlord) {
        const teammateSeat = [0, 1, 2].find((s) => s !== mySeat && s !== landlordSeat)!;
        const teammateCount = seatCardCounts[teammateSeat] ?? 17;

        // Teammate 1-card alert (报单喂牌): feed lowest single in hand (even breaking a low pair/triple if needed)
        if (teammateCount === 1) {
          const allSingles = moves.filter((m) => {
            const p = DdzRules.identifyPattern(m, wildRanks);
            return p && p.type === PatternType.SINGLE;
          });
          if (allSingles.length > 0) {
            return allSingles.reduce((minM, m) => (m[0].value < minM[0].value ? m : minM));
          }
        }

        // Teammate 2-card alert (报双喂牌): feed lowest pair in hand
        if (teammateCount === 2) {
          const allPairs = moves.filter((m) => {
            const p = DdzRules.identifyPattern(m, wildRanks);
            return p && p.type === PatternType.PAIR;
          });
          if (allPairs.length > 0) {
            return allPairs.reduce((minM, m) => (m[0].value < minM[0].value ? m : minM));
          }
        }
      }

      // Enemy 1-card alert: avoid leading small singles; prefer multi-card combos or highest single
      if (enemyMinCards === 1) {
        const nonSingleMove = moves.find((m) => m.length > 1);
        if (nonSingleMove) return nonSingleMove;
        const singleMoves = moves.filter((m) => m.length === 1);
        if (singleMoves.length > 0) {
          return singleMoves.reduce((best, m) => (m[0].value > best[0].value ? m : best));
        }
        return moves[moves.length - 1];
      }

      // Enemy 2-card alert: avoid leading small pairs if multi-card sequences or singles exist
      if (enemyMinCards === 2) {
        const nonPairMove = moves.find((m) => m.length !== 2);
        if (nonPairMove) return nonPairMove;
      }

      // Gatekeeper (地主上家顶牌策略): if leading a single while Landlord has >= 3 cards,
      // prefer multi-card structural combos first; if leading a single, play a mid-high blocking single (10..A)
      if (isGatekeeper && landlordCardsLeft >= 3 && moves[0]?.length === 1) {
        const structuralLead = moves.find((m) => {
          const p = DdzRules.identifyPattern(m, wildRanks);
          return (
            p &&
            p.type !== PatternType.SINGLE &&
            p.type !== PatternType.BOMB &&
            p.type !== PatternType.ROCKET
          );
        });
        if (structuralLead) return structuralLead;

        const blockingSingle = part.singles.find(
          (s) => s[0].value >= 10 && s[0].value <= 14
        );
        if (blockingSingle) return blockingSingle;
      }

      return moves[0];
    }

    // 3. Following someone else's play (跟牌/压牌协同博弈)
    const lastSeat = lastPlayed!.seat;
    const isTeammatePlay = !isMeLandlord && lastSeat !== landlordSeat;
    const lastPlayerCardsLeft = seatCardCounts[lastSeat] ?? 17;

    if (isTeammatePlay) {
      // Never suppress a teammate who is about to win (<= 5 cards) or played a multi-card / high control pattern
      if (lastPlayerCardsLeft <= 5) return [];

      // Emergency interception: if Gatekeeper sees Landlord is at 1-card alert and Teammate played a small single (< 2),
      // Gatekeeper must block with a high single (>= A) so Landlord cannot win on this trick!
      if (
        isGatekeeper &&
        landlordCardsLeft === 1 &&
        targetPattern.type === PatternType.SINGLE &&
        targetPattern.mainValue < 14
      ) {
        const highSingle = moves
          .filter((m) => m.length === 1 && m[0].value >= 14)
          .sort((a, b) => b[0].value - a[0].value)[0];
        if (highSingle) return highSingle;
      }

      // Feeder (地主下家): Landlord ALREADY passed on Teammate's play!
      // Do NOT waste cards beating Teammate unless we have <= 2 turns left and Teammate played a tiny card (< 9)
      if (isFeeder) {
        if (part.netTurns <= 2 && targetPattern.length === 1 && targetPattern.mainValue <= 9) {
          const cleanFinishSingle = part.singles.find(
            (s) => s[0].value > targetPattern.mainValue && s[0].value <= 14
          );
          if (cleanFinishSingle) return cleanFinishSingle;
        }
        return [];
      }

      if (targetPattern.length >= 2 || targetPattern.mainValue >= 11) return [];

      // Gatekeeper (地主上家顶牌): if teammate led a small single (< J) and we hold an isolated mid-high single (J..A),
      // step up to block Landlord's cheap pass
      const cleanSingleFollow = part.singles.find(
        (s) => s[0].value > targetPattern.mainValue && s[0].value >= 11 && s[0].value <= 14
      );
      return cleanSingleFollow ?? [];
    }

    // 4. Following an Enemy Play (压制地主/敌方出牌)
    const firstMove = moves[0];
    const firstPattern = DdzRules.identifyPatternFor(firstMove, wildRanks, targetPattern);
    if (!firstPattern) return [];

    // Enemy 1-card alert on Single: block with our highest available single or Bomb/Rocket
    if (enemyMinCards === 1 && targetPattern.type === PatternType.SINGLE) {
      const nonBombSingles = moves.filter((m) => {
        const p = DdzRules.identifyPatternFor(m, wildRanks, targetPattern);
        return p && p.type === PatternType.SINGLE;
      });
      if (nonBombSingles.length > 0) {
        return nonBombSingles.reduce((best, m) => (m[0].value > best[0].value ? m : best));
      }
      // If we have no higher single and enemy is at 1 card, use Bomb/Rocket if available!
      if (firstPattern.type === PatternType.BOMB || firstPattern.type === PatternType.ROCKET) {
        return firstMove;
      }
    }

    // Enemy 2-card alert on Pair: block with a strong pair or bomb if enemy is about to run out
    if (enemyMinCards <= 2 && targetPattern.type === PatternType.PAIR) {
      const nonBombPairs = moves.filter((m) => {
        const p = DdzRules.identifyPatternFor(m, wildRanks, targetPattern);
        return p && p.type === PatternType.PAIR;
      });
      if (nonBombPairs.length > 0 && lastPlayerCardsLeft <= 2) {
        return nonBombPairs[nonBombPairs.length - 1];
      }
      if (
        lastPlayerCardsLeft <= 2 &&
        (firstPattern.type === PatternType.BOMB || firstPattern.type === PatternType.ROCKET)
      ) {
        return firstMove;
      }
    }

    // Bomb / Rocket discipline: only detonate when enemy is low on cards (<= 5), or we can finish in <= 2 turns
    if (firstPattern.type === PatternType.BOMB || firstPattern.type === PatternType.ROCKET) {
      if (lastPlayerCardsLeft <= 5 || enemyMinCards <= 3 || part.netTurns <= 2) {
        return firstMove;
      }
      return [];
    }

    const usedIds = new Set(firstMove.map((c) => c.id));
    const remCards = myCards.filter((c) => !usedIds.has(c.id));
    const remPart = this.partitionHand(remCards, wildRanks);
    if (remPart.netTurns > part.netTurns + 1 && lastPlayerCardsLeft > 6 && enemyMinCards > 3) {
      return [];
    }

    return firstMove;
  }

  private static dedupeMoves(moves: CardData[][]): CardData[][] {
    const seen = new Set<string>();
    const out: CardData[][] = [];
    for (const m of moves) {
      const key = m
        .map((c) => c.id)
        .sort()
        .join(',');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(m);
      }
    }
    return out;
  }
}
