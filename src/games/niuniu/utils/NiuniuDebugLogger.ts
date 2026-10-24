import {
  FourCardOddsAnalysis,
  NiuniuCard,
  NiuniuHandResult,
  NiuniuPlayMode,
  NiuniuSettlement,
} from '../types';

const SUIT_SYMBOLS: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
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

/**
 * 商业级抢庄牛牛实时控制台调试日志层 (`[NIUNIU-DEBUG]`)
 */
export class NiuniuDebugLogger {
  private static enabled: boolean = true;

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static formatCard(c: NiuniuCard): string {
    if (!c || c.rank <= 0) return '🂠(暗)';
    return `${SUIT_SYMBOLS[c.suit] || ''}${RANK_LABELS[c.rank] || c.rank}(点:${c.value})`;
  }

  static formatCards(cards: NiuniuCard[]): string {
    if (!cards || cards.length === 0) return '[]';
    return `[${cards.map((c) => this.formatCard(c)).join(' ')}]`;
  }

  static logFourCardOdds(
    seatIndex: number,
    nickname: string,
    first4Cards: NiuniuCard[],
    odds: FourCardOddsAnalysis,
    mode: NiuniuPlayMode
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    console.groupCollapsed(
      `%c[NIUNIU-DEBUG][看四张抢庄胜率] Seat#${seatIndex}(${nickname}) | 模式:${mode} | 推荐抢庄:${odds.recommendedCall}倍`,
      'color:#fbbf24;font-weight:bold;'
    );
    console.log('前4张明牌:', this.formatCards(first4Cards));
    console.log('48张未知第5张穷举期望 (Exact 48-Card EV):', {
      有牛概率: `${odds.niuProb}%`,
      牛七及以上高倍概率: `${odds.highNiuProb}%`,
      牛牛及特殊牌型概率: `${odds.niuNiuPlusProb}%`,
      期望等级_expectedLevel: odds.expectedLevel,
      期望倍率_expectedMultiplier: `${odds.expectedMultiplier}x`,
      最高可成牌型: odds.bestPossibleName,
      推荐抢庄倍数: `${odds.recommendedCall}x`,
      推荐闲家下注: `${odds.recommendedBet}x`,
    });
    console.groupEnd();
  }

  static logHandEvaluation(
    seatIndex: number,
    nickname: string,
    cards: NiuniuCard[],
    result: NiuniuHandResult,
    mode: NiuniuPlayMode
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    console.groupCollapsed(
      `%c[NIUNIU-DEBUG][3+2算牛判定] Seat#${seatIndex}(${nickname}) -> 【${result.name}】(${result.multiplier}倍) | 最大单张:${this.formatCard(result.maxCard)}`,
      'color:#34d399;font-weight:bold;'
    );
    console.log('五张完整手牌:', this.formatCards(cards));
    console.log('最优 3+2 凑十拆解:', {
      牌型代码_handType: result.handType,
      牌型名称_name: result.name,
      等级_level: result.level,
      结算倍数_multiplier: `${result.multiplier}x (${mode})`,
      三张凑十组_tenGroup: this.formatCards(result.tenGroup),
      两张算牛组_bullGroup: this.formatCards(result.bullGroup),
      比牌最大单张_maxCard: this.formatCard(result.maxCard),
    });
    console.groupEnd();
  }

  static logRoundSettlement(
    roomId: string,
    mode: NiuniuPlayMode,
    dealerSeatIndex: number,
    settlement: NiuniuSettlement
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    console.groupCollapsed(
      `%c[NIUNIU-DEBUG][本局结算] 房间:${roomId} | 模式:${mode} | 庄家:Seat#${dealerSeatIndex}`,
      'color:#38bdf8;font-weight:bold;'
    );
    console.table(
      settlement.players.map((p) => ({
        座位: `Seat#${p.seatIndex}`,
        昵称: p.nickname,
        身份: p.isDealer ? `庄家(${p.callMultiplier || 1}x)` : `闲家(下${p.betMultiplier || 5}x)`,
        牌型: `${p.handName} (${p.handMultiplier}x)`,
        手牌: this.formatCards(p.cards),
        盈亏豆子: p.scoreDelta >= 0 ? `+${p.scoreDelta}` : String(p.scoreDelta),
        当前余额: p.balance,
      }))
    );
    console.groupEnd();
  }
}
