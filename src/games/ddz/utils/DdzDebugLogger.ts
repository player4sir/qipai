import { CardData, DealMode, Rank } from '../types';

export interface ClientPatternCandidate {
  patternType: string;
  label: string;
  mainValue: number;
  mainRankLabel: string;
  length: number;
  chainCount: number;
  priority: number;
  voiceFile: string;
  orderedCards: CardData[];
}

export interface ClientHandDecomposition {
  rockets: CardData[][];
  bombs: CardData[][];
  airplanes: CardData[][];
  straights: CardData[][];
  consecutivePairs: CardData[][];
  triples: CardData[][];
  pairs: CardData[][];
  singles: CardData[][];
  netTurns: number;
}

const SUIT_SYMBOLS: Record<string, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

const VALUE_TO_LABEL: Record<number, string> = {
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
  14: 'A',
  15: '2',
  16: '小王',
  17: '大王',
};

const PATTERN_PRIORITY_MAP: Record<string, number> = {
  ROCKET: 1000,
  BOMB: 900,
  AIRPLANE_PAIR_WINGS: 820,
  AIRPLANE_SINGLE_WINGS: 810,
  AIRPLANE: 800,
  CONSECUTIVE_PAIRS: 700,
  STRAIGHT: 600,
  TRIPLE_PAIR: 520,
  TRIPLE_SINGLE: 510,
  TRIPLE: 500,
  FOUR_WITH_TWO_PAIRS: 420,
  FOUR_WITH_TWO_SINGLES: 410,
  PAIR: 300,
  SINGLE: 200,
};

/**
 * Commercial Dou Dizhu Core Pattern Priority Queue, Hand Decomposition Analyzer,
 * and Real-Time Console Debug Logger (`[DDZ-DEBUG]`).
 */
export class DdzDebugLogger {
  private static enabled: boolean = true;

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static formatCard(card: CardData): string {
    if (card.rank === 'big_joker') return '大王';
    if (card.rank === 'small_joker') return '小王';
    const suit = card.suit ? (SUIT_SYMBOLS[card.suit] ?? '') : '';
    const wild = card.isWild ? '(赖)' : '';
    return `${suit}${card.rank}${wild}`;
  }

  static formatCards(cards: CardData[]): string {
    if (!cards || cards.length === 0) return '[]';
    return `[${cards.map((c) => this.formatCard(c)).join(' ')}]`;
  }

  static valueToLabel(val: number): string {
    return VALUE_TO_LABEL[val] ?? String(val);
  }

  /**
   * Standard Poker Audio Index Mapping:
   * - 14 ('A') -> 1 (1.wav / dui1.wav / tuple1.wav)
   * - 15 ('2') -> 2 (2.wav / dui2.wav / tuple2.wav)
   * - 3..13 ('3'..'K') -> 3..13
   * - 16 ('small_joker') -> 14 (14.wav)
   * - 17 ('big_joker') -> 15 (15.wav)
   */
  static valueToAudioIndex(mainValue: number): number {
    if (mainValue === 14) return 1;
    if (mainValue === 15) return 2;
    if (mainValue === 16) return 14;
    if (mainValue === 17) return 15;
    return Math.max(3, Math.min(13, Math.round(mainValue)));
  }

  static resolveVoiceFile(patternType: string, mainValue: number): string {
    const audioIdx = this.valueToAudioIndex(mainValue);
    switch (patternType) {
      case 'SINGLE':
        return `${audioIdx}.wav`;
      case 'PAIR':
        return `dui${Math.min(13, audioIdx)}.wav`;
      case 'TRIPLE':
        return `tuple${Math.min(13, audioIdx)}.wav`;
      case 'TRIPLE_SINGLE':
        return 'sandaiyi.wav';
      case 'TRIPLE_PAIR':
        return 'sandaiyidui.wav';
      case 'STRAIGHT':
        return 'shunzi.wav';
      case 'CONSECUTIVE_PAIRS':
        return 'liandui.wav';
      case 'AIRPLANE':
      case 'AIRPLANE_SINGLE_WINGS':
      case 'AIRPLANE_PAIR_WINGS':
        return 'feiji.wav';
      case 'FOUR_WITH_TWO_SINGLES':
        return 'sidaier.wav';
      case 'FOUR_WITH_TWO_PAIRS':
        return 'sidailiangdui.wav';
      case 'BOMB':
        return 'zhadan.wav';
      case 'ROCKET':
        return 'wangzha.wav';
      case 'PASS':
        return 'buyao1~4.wav';
      default:
        return 'unknown.wav';
    }
  }

  /**
   * Canonically orders played cards so core main cards appear on the left
   * and kickers/wings appear on the right.
   */
  static orderCardsForDisplay(
    cards: CardData[],
    patternType?: string,
    mainValue?: number,
    wildRanks: Rank[] = []
  ): CardData[] {
    if (!cards || cards.length <= 1) return [...(cards ?? [])];

    const wildSet = new Set<Rank>(wildRanks);
    const isWild = (c: CardData) => Boolean(c.isWild || wildSet.has(c.rank));
    const sortedDesc = [...cards].sort((a, b) => b.value - a.value);

    // If single/pair/triple/bomb/rocket or straight/consecutive_pairs/pure airplane
    if (
      patternType === 'SINGLE' ||
      patternType === 'PAIR' ||
      patternType === 'TRIPLE' ||
      patternType === 'BOMB' ||
      patternType === 'ROCKET'
    ) {
      const nats = sortedDesc.filter((c) => !isWild(c));
      const wilds = sortedDesc.filter((c) => isWild(c));
      return [...nats, ...wilds];
    }

    if (
      (patternType === 'TRIPLE_SINGLE' ||
        patternType === 'TRIPLE_PAIR' ||
        patternType === 'FOUR_WITH_TWO_SINGLES' ||
        patternType === 'FOUR_WITH_TWO_PAIRS') &&
      typeof mainValue === 'number' &&
      mainValue >= 3
    ) {
      const coreSize =
        patternType === 'FOUR_WITH_TWO_SINGLES' || patternType === 'FOUR_WITH_TWO_PAIRS' ? 4 : 3;
      const core: CardData[] = [];
      const used = new Set<string>();

      for (const c of sortedDesc) {
        if (core.length < coreSize && !isWild(c) && c.value === mainValue) {
          core.push(c);
          used.add(c.id);
        }
      }
      for (const c of sortedDesc) {
        if (core.length < coreSize && !used.has(c.id) && c.value === mainValue) {
          core.push(c);
          used.add(c.id);
        }
      }
      for (const c of sortedDesc) {
        if (core.length < coreSize && !used.has(c.id) && isWild(c)) {
          core.push(c);
          used.add(c.id);
        }
      }
      const wings = sortedDesc.filter((c) => !used.has(c.id));
      return [...core, ...wings];
    }

    // General frequency-first fallback (places Triples/Quads on left, kickers on right)
    const freqMap = new Map<number, number>();
    for (const c of sortedDesc) {
      freqMap.set(c.value, (freqMap.get(c.value) ?? 0) + 1);
    }
    const maxFreq = Math.max(0, ...Array.from(freqMap.values()));
    if (maxFreq >= 3 && sortedDesc.length > maxFreq) {
      return [...sortedDesc].sort((a, b) => {
        const fa = freqMap.get(a.value) ?? 0;
        const fb = freqMap.get(b.value) ?? 0;
        const groupA = fa >= 3 ? 2 : fa === 2 ? 1 : 0;
        const groupB = fb >= 3 ? 2 : fb === 2 ? 1 : 0;
        if (groupB !== groupA) return groupB - groupA;
        return b.value - a.value;
      });
    }

    return sortedDesc;
  }

  /**
   * Evaluates a set of cards using the client-side Priority Queue Pattern Classifier.
   * Returns all valid candidate interpretations ordered from highest priority to lowest.
   */
  static evaluatePriorityCandidates(
    cards: CardData[],
    wildRanks: Rank[] = []
  ): ClientPatternCandidate[] {
    const n = cards.length;
    if (n === 0) return [];

    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const valMap = new Map<number, CardData[]>();
    for (const c of sorted) {
      const list = valMap.get(c.value) ?? [];
      list.push(c);
      valMap.set(c.value, list);
    }
    const vals = Array.from(valMap.keys()).sort((a, b) => a - b);
    const cnt = (v: number) => valMap.get(v)?.length ?? 0;
    const candidates: ClientPatternCandidate[] = [];

    const addCandidate = (
      patternType: string,
      label: string,
      mainValue: number,
      chainCount: number,
      priorityBoost = 0
    ) => {
      const priority = (PATTERN_PRIORITY_MAP[patternType] ?? 100) + priorityBoost;
      candidates.push({
        patternType,
        label,
        mainValue,
        mainRankLabel: this.valueToLabel(mainValue),
        length: n,
        chainCount,
        priority,
        voiceFile: this.resolveVoiceFile(patternType, mainValue),
        orderedCards: this.orderCardsForDisplay(sorted, patternType, mainValue, wildRanks),
      });
    };

    if (n === 1) {
      addCandidate('SINGLE', '单张', sorted[0].value, 1);
    }
    if (n === 2) {
      if (cnt(16) === 1 && cnt(17) === 1) {
        addCandidate('ROCKET', '王炸', 17, 1);
      } else if (vals.length === 1) {
        addCandidate('PAIR', '对子', vals[0], 1);
      }
    }
    if (n === 3 && vals.length === 1) {
      addCandidate('TRIPLE', '三不带', vals[0], 1);
    }
    if (n === 4) {
      if (vals.length === 1) {
        addCandidate('BOMB', '硬炸弹', vals[0], 1, 30);
      } else {
        const t = vals.find((v) => cnt(v) === 3);
        if (t !== undefined) addCandidate('TRIPLE_SINGLE', '三带一', t, 1);
      }
    }
    if (n === 5) {
      const t = vals.find((v) => cnt(v) === 3);
      if (t !== undefined && vals.some((v) => cnt(v) === 2)) {
        addCandidate('TRIPLE_PAIR', '三带一对', t, 1);
      }
    }

    // Airplanes (evaluated with higher priority than Four-with-Two)
    const tripleVals = vals.filter((v) => v <= 14 && cnt(v) >= 3);
    for (let k = tripleVals.length; k >= 2; k--) {
      for (let s = tripleVals.length - k; s >= 0; s--) {
        const seq = tripleVals.slice(s, s + k);
        if (seq[k - 1] - seq[0] !== k - 1) continue;
        const top = seq[k - 1];
        if (n === 3 * k) addCandidate('AIRPLANE', '飞机', top, k);
        if (n === 4 * k) {
          const leftover = (v: number) => cnt(v) - (seq.includes(v) ? 3 : 0);
          if (!(leftover(16) > 0 && leftover(17) > 0)) {
            addCandidate('AIRPLANE_SINGLE_WINGS', '飞机带翅膀', top, k);
          }
        }
        if (n === 5 * k) {
          let pairs = 0;
          let ok = true;
          for (const v of vals) {
            const rem = cnt(v) - (seq.includes(v) ? 3 : 0);
            if (rem === 0) continue;
            if (rem % 2 === 0 && v < 16) pairs += rem / 2;
            else ok = false;
          }
          if (ok && pairs === k) {
            addCandidate('AIRPLANE_PAIR_WINGS', '飞机带双翼', top, k);
          }
        }
      }
    }

    if (n >= 6 && n % 2 === 0 && vals.length === n / 2 && vals.every((v) => cnt(v) === 2)) {
      if (vals[vals.length - 1] <= 14 && vals[vals.length - 1] - vals[0] === vals.length - 1) {
        addCandidate('CONSECUTIVE_PAIRS', '连对', vals[vals.length - 1], vals.length);
      }
    }

    if (n >= 5 && vals.length === n && vals[n - 1] <= 14 && vals[n - 1] - vals[0] === n - 1) {
      addCandidate('STRAIGHT', '顺子', vals[n - 1], n);
    }

    const quads = vals.filter((v) => cnt(v) === 4);
    if (quads.length > 0 && n === 6 && !(cnt(16) && cnt(17))) {
      addCandidate('FOUR_WITH_TWO_SINGLES', '四带二', quads[quads.length - 1], 1);
    }
    if (quads.length > 0 && n === 8) {
      for (let i = quads.length - 1; i >= 0; i--) {
        const q = quads[i];
        let pairs = 0;
        let ok = true;
        for (const v of vals) {
          if (v === q) continue;
          if (cnt(v) === 2) pairs += 1;
          else if (cnt(v) === 4) pairs += 2;
          else ok = false;
        }
        if (ok && pairs === 2) {
          addCandidate('FOUR_WITH_TWO_PAIRS', '四带两对', q, 1);
          break;
        }
      }
    }

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.chainCount !== a.chainCount) return b.chainCount - a.chainCount;
      return b.mainValue - a.mainValue;
    });

    return candidates;
  }

  /**
   * Decomposes a hand into structural groups (Rocket, Bombs, Airplanes, Straights,
   * Consecutive Pairs, Triples, Pairs, Singles) using the triple-preserving priority algorithm.
   */
  static analyzeHandDecomposition(
    cards: CardData[],
    wildRanks: Rank[] = []
  ): ClientHandDecomposition {
    const valMap = new Map<number, CardData[]>();
    for (const c of cards) {
      const list = valMap.get(c.value) ?? [];
      list.push(c);
      valMap.set(c.value, list);
    }

    const rockets: CardData[][] = [];
    const bombs: CardData[][] = [];

    if (valMap.has(16) && valMap.has(17)) {
      rockets.push([...(valMap.get(16) ?? []), ...(valMap.get(17) ?? [])]);
      valMap.delete(16);
      valMap.delete(17);
    }

    for (const [v, grp] of Array.from(valMap.entries()).sort((a, b) => a[0] - b[0])) {
      if (grp.length === 4) {
        bombs.push([...grp]);
        valMap.delete(v);
      }
    }

    const highTriples: CardData[][] = [];
    const highPairs: CardData[][] = [];
    const highSingles: CardData[][] = [];
    for (const hv of [15, 16, 17]) {
      const grp = valMap.get(hv);
      if (!grp || grp.length === 0) continue;
      if (grp.length === 3) highTriples.push([...grp]);
      else if (grp.length === 2) highPairs.push([...grp]);
      else if (grp.length === 1) highSingles.push([...grp]);
      valMap.delete(hv);
    }

    const pool = new Map<number, CardData[]>();
    for (const [v, grp] of valMap.entries()) {
      if (v <= 14 && grp.length > 0) pool.set(v, [...grp]);
    }

    const airplanes: CardData[][] = [];
    const consecutivePairs: CardData[][] = [];
    const straights: CardData[][] = [];

    // 1. Extract Airplanes
    const tripleVals = Array.from(pool.entries())
      .filter(([, g]) => g.length >= 3)
      .map(([v]) => v)
      .sort((a, b) => a - b);
    for (let i = 0; i < tripleVals.length; i++) {
      let j = i;
      while (j + 1 < tripleVals.length && tripleVals[j + 1] === tripleVals[j] + 1) j++;
      if (j - i + 1 >= 2) {
        const plane: CardData[] = [];
        for (let k = i; k <= j; k++) {
          const v = tripleVals[k];
          const g = pool.get(v)!;
          plane.push(...g.splice(0, 3));
          if (g.length === 0) pool.delete(v);
        }
        airplanes.push(plane);
      }
      i = j;
    }

    // 2. Extract Straights (while preserving internal Triples when sub-window >= 5 exists)
    const singleVals = Array.from(pool.entries())
      .filter(([, g]) => g.length >= 1)
      .map(([v]) => v)
      .sort((a, b) => a - b);
    for (let i = 0; i < singleVals.length; i++) {
      let j = i;
      while (j + 1 < singleVals.length && singleVals[j + 1] === singleVals[j] + 1) j++;
      const runLen = j - i + 1;
      if (runLen >= 5) {
        let sIdx = i;
        let eIdx = j;
        // Trim endpoints if they break a Triple
        while (eIdx - sIdx + 1 >= 6 && (pool.get(singleVals[sIdx])?.length ?? 0) === 3) {
          sIdx++;
        }
        while (eIdx - sIdx + 1 >= 6 && (pool.get(singleVals[eIdx])?.length ?? 0) === 3) {
          eIdx--;
        }
        const st: CardData[] = [];
        for (let k = sIdx; k <= eIdx; k++) {
          const v = singleVals[k];
          const g = pool.get(v)!;
          st.push(g.pop()!);
          if (g.length === 0) pool.delete(v);
        }
        straights.push(st);
      }
      i = j;
    }

    // 3. Extract Consecutive Pairs
    const pairVals = Array.from(pool.entries())
      .filter(([, g]) => g.length >= 2)
      .map(([v]) => v)
      .sort((a, b) => a - b);
    for (let i = 0; i < pairVals.length; i++) {
      let j = i;
      while (j + 1 < pairVals.length && pairVals[j + 1] === pairVals[j] + 1) j++;
      if (j - i + 1 >= 3) {
        const cp: CardData[] = [];
        for (let k = i; k <= j; k++) {
          const v = pairVals[k];
          const g = pool.get(v)!;
          cp.push(...g.splice(0, 2));
          if (g.length === 0) pool.delete(v);
        }
        consecutivePairs.push(cp);
      }
      i = j;
    }

    const triples: CardData[][] = [];
    const pairs: CardData[][] = [];
    const singles: CardData[][] = [];
    for (const v of Array.from(pool.keys()).sort((a, b) => a - b)) {
      const g = pool.get(v)!;
      if (g.length === 3) triples.push([...g]);
      else if (g.length === 2) pairs.push([...g]);
      else if (g.length === 1) singles.push([...g]);
    }

    const allTriples = [...triples, ...highTriples];
    const allPairs = [...pairs, ...highPairs];
    const allSingles = [...singles, ...highSingles];

    const wingCap = allTriples.length + airplanes.reduce((acc, a) => acc + a.length / 3, 0);
    const lowWings =
      allSingles.filter((s) => s[0].value <= 14).length +
      allPairs.filter((p) => p[0].value <= 13).length;
    const absorbed = Math.min(wingCap, lowWings);
    const wildSet = new Set<Rank>(wildRanks);
    const wildCount = cards.filter((c) => c.isWild || wildSet.has(c.rank)).length;
    const totalCombos =
      airplanes.length +
      straights.length +
      consecutivePairs.length +
      allTriples.length +
      allPairs.length +
      allSingles.length;
    const netTurns = Math.max(
      1,
      totalCombos - absorbed - bombs.length - rockets.length - Math.floor(wildCount / 2)
    );

    return {
      rockets,
      bombs,
      airplanes,
      straights,
      consecutivePairs,
      triples: allTriples,
      pairs: allPairs,
      singles: allSingles,
      netTurns,
    };
  }

  static formatRecorderSummary(recorder: Record<Rank, number>): string {
    const order: Array<{ rank: Rank; label: string }> = [
      { rank: 'big_joker', label: '大王' },
      { rank: 'small_joker', label: '小王' },
      { rank: '2', label: '2' },
      { rank: 'A', label: 'A' },
      { rank: 'K', label: 'K' },
      { rank: 'Q', label: 'Q' },
      { rank: 'J', label: 'J' },
      { rank: '10', label: '10' },
      { rank: '9', label: '9' },
      { rank: '8', label: '8' },
      { rank: '7', label: '7' },
      { rank: '6', label: '6' },
      { rank: '5', label: '5' },
      { rank: '4', label: '4' },
      { rank: '3', label: '3' },
    ];
    return order.map((o) => `${o.label}:${recorder[o.rank] ?? 0}`).join(' | ');
  }

  /**
   * Logs initial deal / snapshot state, player hand decomposition, and remaining card recorder.
   */
  static logDealSnapshot(params: {
    eventTag: string;
    roomId: string;
    dealMode: DealMode;
    mySeat: number;
    landlordSeat: number | null;
    wildRanks: Rank[];
    myCards: CardData[];
    landlordCards: CardData[];
    othersCount: Record<string, number>;
    cardRecorder: Record<Rank, number>;
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const decomp = this.analyzeHandDecomposition(params.myCards, params.wildRanks);
    const fmtGroup = (groups: CardData[][]) =>
      groups.length === 0 ? '无' : groups.map((g) => this.formatCards(g)).join(' , ');

    console.groupCollapsed(
      `%c[DDZ-DEBUG][${params.eventTag}] 房间:${params.roomId} | 模式:${params.dealMode} | 我的座位:Seat#${params.mySeat} | 手牌(${params.myCards.length}张)`,
      'color:#fbbf24;font-weight:bold;'
    );
    console.log('当前手牌 (按大小):', this.formatCards(params.myCards));
    if (params.landlordCards.length > 0) {
      console.log('三张底牌:', this.formatCards(params.landlordCards));
    }
    if (params.wildRanks.length > 0) {
      console.log('百搭赖子:', params.wildRanks.join(', '));
    }
    console.log('核心拆牌分析 (Priority-DFS):', {
      王炸: fmtGroup(decomp.rockets),
      炸弹: fmtGroup(decomp.bombs),
      飞机: fmtGroup(decomp.airplanes),
      顺子: fmtGroup(decomp.straights),
      连对: fmtGroup(decomp.consecutivePairs),
      三张: fmtGroup(decomp.triples),
      对子: fmtGroup(decomp.pairs),
      单张: fmtGroup(decomp.singles),
      预估净手数_netTurns: decomp.netTurns,
    });
    console.log('对手剩余牌数:', params.othersCount);
    console.log('记牌器剩余牌分布:', this.formatRecorderSummary(params.cardRecorder));
    console.groupEnd();
  }

  /**
   * Logs every card-play / pass event in real time, including Priority Queue pattern classification,
   * canonical card order, voice audio file resolution, player's remaining hand, and card recorder.
   */
  static logPlayAction(params: {
    seatIndex: number;
    mySeat: number;
    isLandlord: boolean;
    patternType: string;
    patternLabel: string;
    serverMainValue: number;
    resolvedMainValue: number;
    playedCards: CardData[];
    orderedCards: CardData[];
    myRemainingCards: CardData[];
    othersCount: Record<string, number>;
    cardRecorder: Record<Rank, number>;
    wildRanks: Rank[];
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const roleTag = params.isLandlord ? '地主' : '农民';
    const actorTag = params.seatIndex === params.mySeat ? '我方' : `座位#${params.seatIndex}`;
    const voiceFile = this.resolveVoiceFile(params.patternType, params.resolvedMainValue);
    const mainLabel =
      params.patternType === 'PASS' ? '不出' : this.valueToLabel(params.resolvedMainValue);

    const candidates =
      params.playedCards.length > 0
        ? this.evaluatePriorityCandidates(params.playedCards, params.wildRanks)
        : [];
    const decomp = this.analyzeHandDecomposition(params.myRemainingCards, params.wildRanks);

    console.groupCollapsed(
      `%c[DDZ-DEBUG][出牌/读牌] ${actorTag}(${roleTag}) -> ${params.patternLabel} [主牌:${mainLabel} | 语音:${voiceFile}] | 我方剩${params.myRemainingCards.length}张`,
      params.patternType === 'PASS'
        ? 'color:#94a3b8;font-weight:bold;'
        : 'color:#34d399;font-weight:bold;'
    );
    console.log('读牌判定详情:', {
      出牌方: `${actorTag} (${roleTag})`,
      权威牌型_PatternType: params.patternType,
      牌型名称_Label: params.patternLabel,
      服务端主牌值_serverMainValue: params.serverMainValue,
      最终主牌值_resolvedMainValue: `${params.resolvedMainValue} (${mainLabel})`,
      语音文件_VoiceAsset: `/assets/audio/ddz/${voiceFile}`,
      原始出牌: this.formatCards(params.playedCards),
      规范主从排序_CanonicalOrder: this.formatCards(params.orderedCards),
    });
    if (candidates.length > 0) {
      console.log(
        '优先级队列候选判定 (Priority Queue Candidates):',
        candidates.map(
          (c, i) =>
            `#${i + 1} [P=${c.priority}] ${c.label}(${c.patternType}, 主牌=${c.mainRankLabel}, 音频=${c.voiceFile})`
        )
      );
    }
    console.log(
      `我方剩余手牌 (${params.myRemainingCards.length}张 | 预估${decomp.netTurns}手):`,
      this.formatCards(params.myRemainingCards)
    );
    console.log('各家剩余牌数:', params.othersCount);
    console.log('记牌器剩余牌分布:', this.formatRecorderSummary(params.cardRecorder));
    console.groupEnd();
  }
}
