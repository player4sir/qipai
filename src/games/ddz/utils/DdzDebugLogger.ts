import { CardData, DealMode, Rank } from '../types';

export interface PriorityCandidate {
  patternType: string;
  mainValue: number;
  label: string;
}

export class DdzDebugLogger {
  public static formatCards(cards: CardData[]): string {
    if (!cards || cards.length === 0) return '[]';
    return cards
      .map((c) => {
        if (c.rank === 'big_joker') return '大王';
        if (c.rank === 'small_joker') return '小王';
        return c.rank;
      })
      .join(' ');
  }

  public static logDealSnapshot(_params: {
    eventTag?: string;
    roomId?: string;
    dealMode?: DealMode;
    mySeat?: number;
    landlordSeat?: number | null;
    wildRanks?: Rank[];
    myCards?: CardData[];
    landlordCards?: CardData[];
    othersCount?: Record<string, number>;
    cardRecorder?: Record<Rank, number>;
  }): void {
    // Telemetry suppressed for clean commercial console
  }

  public static logPlayAction(_params: {
    seatIndex: number;
    mySeat?: number;
    isLandlord?: boolean;
    patternType: string;
    patternLabel?: string;
    serverMainValue?: number;
    resolvedMainValue?: number;
    playedCards?: CardData[];
    orderedCards?: CardData[];
    myRemainingCards?: CardData[];
    othersCount?: Record<string, number>;
    cardRecorder?: Record<Rank, number>;
    wildRanks?: Rank[];
  }): void {
    // Telemetry suppressed for clean commercial console
  }

  public static evaluatePriorityCandidates(
    cards: CardData[],
    wildRanks: Rank[] = []
  ): PriorityCandidate[] {
    if (!cards || cards.length === 0) return [];
    const wildSet = new Set<Rank>(wildRanks);
    const nonWild = cards.filter((c) => !c.isWild && !wildSet.has(c.rank));
    const src = nonWild.length > 0 ? nonWild : cards;
    const freq = new Map<number, number>();
    for (const c of src) {
      freq.set(c.value, (freq.get(c.value) || 0) + 1);
    }
    let mainValue = src[0]?.value ?? 3;
    let bestCount = 0;
    for (const [val, cnt] of freq.entries()) {
      if (cnt > bestCount || (cnt === bestCount && val > mainValue)) {
        bestCount = cnt;
        mainValue = val;
      }
    }
    let patternType = 'SINGLE';
    let label = '单张';
    if (cards.length === 2 && cards.some((c) => c.rank === 'big_joker') && cards.some((c) => c.rank === 'small_joker')) {
      patternType = 'ROCKET';
      label = '王炸';
    } else if (cards.length === 4 && bestCount + (cards.length - nonWild.length) >= 4) {
      patternType = 'BOMB';
      label = '炸弹';
    } else if (cards.length === 2) {
      patternType = 'PAIR';
      label = '对子';
    } else if (cards.length >= 5) {
      patternType = 'STRAIGHT';
      label = '组合牌';
    }
    return [{ patternType, mainValue, label }];
  }

  public static orderCardsForDisplay(
    cards: CardData[],
    _patternType: string,
    _mainValue: number,
    wildRanks: Rank[] = []
  ): CardData[] {
    const wildSet = new Set<Rank>(wildRanks);
    const copy = cards.map((c) => ({
      ...c,
      isWild: Boolean(c.isWild || wildSet.has(c.rank)),
    }));

    const freqMap = new Map<number, number>();
    for (const c of copy) {
      freqMap.set(c.value, (freqMap.get(c.value) || 0) + 1);
    }

    return copy.sort((a, b) => {
      const countA = freqMap.get(a.value) || 0;
      const countB = freqMap.get(b.value) || 0;
      if (countB !== countA) return countB - countA;
      return b.value - a.value;
    });
  }
}
