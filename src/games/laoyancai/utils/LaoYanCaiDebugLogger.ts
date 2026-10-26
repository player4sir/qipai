import {
  LaoYanCaiCard,
  LaoYanCaiDecision,
  LaoYanCaiDrawOdds,
  LaoYanCaiHandResult,
  LaoYanCaiPlayMode,
  LaoYanCaiSettlement,
} from '../types';
import { formatCardLabel } from '../algorithms/LaoYanCaiLogic';

export class LaoYanCaiDebugLogger {
  private static enabled = true;

  static setEnabled(flag: boolean): void {
    this.enabled = flag;
  }

  static logInitialDealAndOdds(
    seatIndex: number,
    nickname: string,
    isDealer: boolean,
    cards: LaoYanCaiCard[],
    evalResult: LaoYanCaiHandResult,
    odds: LaoYanCaiDrawOdds,
    mode: LaoYanCaiPlayMode
  ): void {
    if (!this.enabled) return;
    const cardStr = cards.map(formatCardLabel).join(' ');
    const roleTag = isDealer ? '庄家' : '闲家';
    console.log(
      `%c[LYC-DEBUG][首轮2张与捞牌期望] 座位${seatIndex}(${nickname}·${roleTag}) | 模式=${mode}`,
      'color:#10b981;font-weight:bold;',
      {
        cards: cardStr,
        initialPoints: `${evalResult.points}点 (${evalResult.name})`,
        initialMultiplier: `${evalResult.multiplier}x`,
        canZhaKai: evalResult.canZhaKai ? '可炸开(天牌8/9点)' : '不可炸开',
        improveProbability: `${odds.improveProbability}% (${odds.improveCardCount}/${odds.remainingDeckCount}张)`,
        highHandProbability: `${odds.highHandProbability}%`,
        specialMultiplierProbability: `${odds.specialMultiplierProbability}%`,
        expectedPointsAfterDraw: odds.expectedPointsAfterDraw,
        recommendation: odds.recommendation,
        advice: odds.adviceText,
      }
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
    if (!this.enabled) return;
    const roleTag = isDealer ? '庄家' : '闲家';
    const actionMap: Record<LaoYanCaiDecision, string> = {
      PENDING: '思考中',
      ZHAKAI: '炸开亮牌',
      LAO: `捞第3张牌 (${drawnCard ? formatCardLabel(drawnCard) : ''})`,
      BULAO: '不捞守牌',
    };
    console.log(
      `%c[LYC-DEBUG][博弈抉择] 座位${seatIndex}(${nickname}·${roleTag}) -> ${actionMap[decision]}`,
      'color:#f59e0b;font-weight:bold;',
      {
        finalCards: finalResult.cards.map(formatCardLabel).join(' '),
        finalHandName: finalResult.name,
        badge: finalResult.badgeText,
        points: finalResult.points,
        multiplier: `${finalResult.multiplier}x`,
        weight: finalResult.weight,
      }
    );
  }

  static logRoundSettlement(
    roomId: string,
    mode: LaoYanCaiPlayMode,
    dealerSeatIndex: number,
    settlement: LaoYanCaiSettlement
  ): void {
    if (!this.enabled) return;
    console.groupCollapsed(
      `%c[LYC-DEBUG][本局结算总表] 房间=${roomId} | 模式=${mode} | 庄家座位=${dealerSeatIndex}${
        settlement.bankerZhaKaiAll ? ' (庄家天牌炸开通杀局)' : ''
      }`,
      'color:#fbbf24;font-weight:bold;'
    );
    console.table(
      settlement.players.map((p) => ({
        座位: p.seatIndex,
        昵称: p.nickname,
        身份: p.isDealer ? `庄(${Math.max(1, p.callMultiplier)}x)` : `闲(下${p.betMultiplier}x)`,
        抉择: p.decision === 'ZHAKAI' ? '炸开' : p.decision === 'LAO' ? '捞牌(3张)' : '不捞(2张)',
        手牌: p.cards.map(formatCardLabel).join(' '),
        牌型: `${p.handName} (${p.badgeText})`,
        倍数: `${p.multiplier}x`,
        本局盈亏: p.scoreDelta > 0 ? `+${p.scoreDelta}` : String(p.scoreDelta),
        当前余额: p.balance,
      }))
    );
    console.groupEnd();
  }
}
