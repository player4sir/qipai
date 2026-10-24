import {
  LaoYanCaiCard,
  LaoYanCaiDecision,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandResult,
  LaoYanCaiPlayMode,
  LaoYanCaiSettlement,
} from '../types.js';

const SUIT_SYMBOLS: Record<string, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
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

export function formatLaoYanCaiCards(cards: LaoYanCaiCard[]): string {
  if (!cards || cards.length === 0) return '[]';
  return cards
    .map((c) => {
      if (!c || c.rank <= 0) return '[暗牌]';
      return `${SUIT_SYMBOLS[c.suit] || ''}${RANK_LABELS[c.rank] || c.rank}`;
    })
    .join(' ');
}

export class LaoYanCaiDebugLogger {
  static logInitialDealAndOdds(
    seatIndex: number,
    nickname: string,
    isDealer: boolean,
    cards: LaoYanCaiCard[],
    handResult: LaoYanCaiHandResult,
    drawOdds: LaoYanCaiDrawOdds,
    playMode: LaoYanCaiPlayMode
  ): void {
    const roleTag = isDealer ? '庄家' : '闲家';
    console.info(
      `[LaoYanCai][Deal2][${playMode}] 座位#${seatIndex} ${nickname}(${roleTag}) | 底牌: ${formatLaoYanCaiCards(
        cards
      )} -> ${handResult.name}(${handResult.badgeText}) | 捞牌提升率: ${
        drawOdds.improveProbability
      }% | 高点率(>=7): ${drawOdds.highPointsProbability}% | 特殊番率: ${
        drawOdds.specialHandProbability
      }% | 期望点数: ${drawOdds.expectedPointsAfterDraw} | AI建议: ${
        drawOdds.recommendedAction
      }`
    );
  }

  static logPlayerDecision(
    seatIndex: number,
    nickname: string,
    isDealer: boolean,
    decision: LaoYanCaiDecision,
    drawnCard: LaoYanCaiCard | null,
    finalResult: LaoYanCaiHandResult
  ): void {
    const roleTag = isDealer ? '庄家' : '闲家';
    const drawnText = drawnCard
      ? `摸入第3张 ${formatLaoYanCaiCards([drawnCard])}`
      : '未摸牌';
    console.info(
      `[LaoYanCai][Decision] 座位#${seatIndex} ${nickname}(${roleTag}) 动作=${decision} (${drawnText}) -> 终局牌型: ${formatLaoYanCaiCards(
        finalResult.cards
      )} [${finalResult.name} · ${finalResult.badgeText}]`
    );
  }

  static logRoundSettlement(
    roomId: string,
    playMode: LaoYanCaiPlayMode,
    dealerSeatIndex: number,
    settlement: LaoYanCaiSettlement
  ): void {
    const summary = settlement.players
      .map(
        (p) =>
          `#${p.seatIndex}${p.isDealer ? '(庄)' : '(闲)'}${p.nickname}: ${
            p.handName
          }(×${p.multiplier}) ${p.scoreDelta >= 0 ? '+' : ''}${p.scoreDelta}`
      )
      .join(' | ');
    console.info(
      `[LaoYanCai][Settlement] 房间=${roomId} 模式=${playMode} 庄家座位=#${dealerSeatIndex} | ${summary}`
    );
  }
}
