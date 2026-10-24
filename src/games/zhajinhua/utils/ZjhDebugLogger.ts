import { evaluateHand, rankText, ZjhContender, ZjhEquityAnalysis, ZjhPotResult } from '../algorithms/ZjhLogic';
import { ZjhActionPayload, ZjhCard, ZjhMode } from '../types';

const SUIT_SYMBOLS: Record<string, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
};

/**
 * 商业级炸金花实时控制台调试日志层 (`[ZJH-DEBUG]`)
 */
export class ZjhDebugLogger {
  private static enabled: boolean = true;

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static formatCard(c: ZjhCard): string {
    return `${SUIT_SYMBOLS[c.suit] || ''}${rankText(c.rank)}`;
  }

  static formatCards(cards: readonly ZjhCard[]): string {
    if (!cards || cards.length === 0) return '[]';
    return `[${cards.map((c) => this.formatCard(c)).join(' ')}]`;
  }

  static logBotDecision(
    seatIndex: number,
    nickname: string,
    cards: readonly ZjhCard[],
    seen: boolean,
    personality: { aggression: number; bluff: number },
    equity: ZjhEquityAnalysis,
    chosenAction: ZjhActionPayload
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    console.groupCollapsed(
      `%c[ZJH-DEBUG][AI决策] Seat#${seatIndex}(${nickname}) [${seen ? '已看牌' : '闷牌'}] -> 动作:${chosenAction.action} | 牌型:${equity.handLabel} | 1v1胜率:${equity.equity1v1}%`,
      'color:#fbbf24;font-weight:bold;'
    );
    console.log('AI手牌与胜率评估:', {
      手牌: this.formatCards(cards),
      牌型_handLabel: equity.handLabel,
      牌力绝对分_score: equity.score,
      单挑胜率_equity1v1: `${equity.equity1v1}%`,
      多人存活胜率_multiWayEquity: `${equity.multiWayEquity}%`,
      底池赔率阈值_potOdds: `${equity.potOdds}%`,
      跟注期望_evCall: equity.evCall,
      比牌期望_evCompare: equity.evCompare,
      性格参数: `侵略性:${personality.aggression.toFixed(2)} | 诈唬率:${personality.bluff.toFixed(2)}`,
      最终决策: chosenAction,
    });
    console.groupEnd();
  }

  static logCompareDuel(
    fromSeat: number,
    fromName: string,
    fromCards: readonly ZjhCard[],
    toSeat: number,
    toName: string,
    toCards: readonly ZjhCard[],
    loserSeat: number,
    mode: ZjhMode
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const evalA = evaluateHand(fromCards);
    const evalB = evaluateHand(toCards);
    console.groupCollapsed(
      `%c[ZJH-DEBUG][比牌对决] Seat#${fromSeat}(${fromName}:${evalA.label}) VS Seat#${toSeat}(${toName}:${evalB.label}) -> 败者:Seat#${loserSeat}`,
      'color:#f43f5e;font-weight:bold;'
    );
    console.log('比牌详情:', {
      模式: mode,
      发起方: `Seat#${fromSeat} ${fromName} ${this.formatCards(fromCards)} (${evalA.label}, score=${evalA.score})`,
      应战方: `Seat#${toSeat} ${toName} ${this.formatCards(toCards)} (${evalB.label}, score=${evalB.score})`,
      淘汰座位: `Seat#${loserSeat}`,
    });
    console.groupEnd();
  }

  static logShowdownResult(
    roomId: string,
    mode: ZjhMode,
    contenders: readonly ZjhContender[],
    result: ZjhPotResult
  ): void {
    if (!this.enabled || typeof console === 'undefined') return;
    console.groupCollapsed(
      `%c[ZJH-DEBUG][开牌边池结算] 房间:${roomId} | 模式:${mode} | 赢家:${result.winners.map((w) => `Seat#${w}`).join(',')}`,
      'color:#34d399;font-weight:bold;'
    );
    console.table(
      contenders.map((c) => {
        const ev = c.cards.length === 3 ? evaluateHand(c.cards) : null;
        const payout = result.payouts.get(c.seat) ?? 0;
        return {
          座位: `Seat#${c.seat}`,
          状态: c.folded ? '已弃牌/出局' : c.allIn ? '全押(All-In)' : '存活',
          手牌: this.formatCards(c.cards),
          牌型: ev ? ev.label : '-',
          总投入: c.contribution,
          分得彩池: payout,
          净盈亏: payout - c.contribution,
        };
      })
    );
    console.groupEnd();
  }
}
