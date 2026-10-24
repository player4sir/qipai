import {
  type ZjhActionPayload,
  type ZjhCard,
  type ZjhDynamicPotOddsSnapshot,
  type ZjhEquityAnalysis,
  type ZjhMode,
  type ZjhSuit,
} from '../types.js';
import {
  evaluateHand,
  rankText,
  type ZjhContender,
  type ZjhPotResult,
} from '../algorithms/ZjhLogic.js';

const SUIT_LABEL: Record<ZjhSuit, string> = {
  spade: '黑桃',
  heart: '红桃',
  club: '梅花',
  diamond: '方块',
};

function formatCard(c: ZjhCard): string {
  return `${SUIT_LABEL[c.suit] || c.suit}${rankText(c.rank)}`;
}

function formatHand(cards: readonly ZjhCard[]): string {
  if (!cards || cards.length === 0) return '[暗牌]';
  return cards.map(formatCard).join(' ');
}

export class ZjhDebugLogger {
  /**
   * 输出玩家或AI的手牌死牌修正胜率、底池赔率与EV期望分析
   */
  static logHandEquity(
    seatIndex: number,
    nickname: string,
    cards: readonly ZjhCard[],
    analysis: ZjhEquityAnalysis,
    meta: { round: number; pot: number; callCost: number; activeCount: number; mode: ZjhMode }
  ): void {
    const title = `[ZJH-Equity] 座位#${seatIndex}(${nickname}) | 第${meta.round}轮 | ${analysis.label} | 单挑胜率:${analysis.headsUpEquity}% | 多人(${meta.activeCount}人):${analysis.multiWayEquity}% | 底池赔率:${analysis.potOdds}% | 推荐:${analysis.recommendedAction}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#f59e0b;font-weight:bold;');
      console.log('三张手牌:', formatHand(cards), `(分值:${analysis.score})`);
      console.table({
        牌型类别: analysis.label,
        死牌修正单挑胜率: `${analysis.headsUpEquity}% (基于18424种未知对手组合)`,
        当前多人存活胜率: `${analysis.multiWayEquity}% (${meta.activeCount}人在局)`,
        当前底池与跟注额: `底池 ${meta.pot} / 跟注 ${meta.callCost}`,
        底池赔率门槛: `${analysis.potOdds}%`,
        跟注期望收益EV: analysis.callEv >= 0 ? `+${analysis.callEv}` : `${analysis.callEv}`,
        最优推荐动作: analysis.recommendedAction,
      });
      console.log('策略推导:', analysis.reasoning);
      console.groupEnd();
    } else {
      console.log(`${title} | 手牌:${formatHand(cards)} | EV:${analysis.callEv}`);
    }
  }

  /**
   * 输出AI机器人的性格参数、胜率赔率权衡与最终决策
   */
  static logBotDecision(
    seatIndex: number,
    nickname: string,
    cards: readonly ZjhCard[],
    seen: boolean,
    personality: { aggression: number; bluff: number },
    analysis: ZjhEquityAnalysis,
    decision: ZjhActionPayload
  ): void {
    const actStr =
      decision.action === 'raise'
        ? `raise(档位#${decision.level})`
        : decision.action === 'compare'
        ? `compare(目标座位#${decision.targetSeat})`
        : decision.action;
    const title = `[ZJH-AI] 座位#${seatIndex}(${nickname}) | ${seen ? '已看牌' : '闷牌'} | ${analysis.label}(多人胜率:${analysis.multiWayEquity}% vs 赔率:${analysis.potOdds}%) -> 决策:${actStr}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#a855f7;font-weight:bold;');
      console.log('手牌:', formatHand(cards));
      console.log(
        'AI性格特征:',
        `激进度(Aggression): ${(personality.aggression * 100).toFixed(0)}% | 诈唬率(Bluff): ${(personality.bluff * 100).toFixed(0)}%`
      );
      console.log('数学分析:', analysis.reasoning);
      console.log('最终执行动作:', actStr);
      console.groupEnd();
    } else {
      console.log(`${title} | 手牌:${formatHand(cards)}`);
    }
  }

  /**
   * 输出双人比牌对决日志
   */
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
    const va = evaluateHand(fromCards);
    const vb = evaluateHand(toCards);
    const winnerSeat = loserSeat === fromSeat ? toSeat : fromSeat;
    const title = `[ZJH-Compare] 座位#${fromSeat}(${fromName}:${va.label}) VS 座位#${toSeat}(${toName}:${vb.label}) -> 胜者:#${winnerSeat}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#ec4899;font-weight:bold;');
      console.log(`发起方 #${fromSeat}(${fromName}):`, formatHand(fromCards), `[${va.label}, score=${va.score}]`);
      console.log(`应战方 #${toSeat}(${toName}):`, formatHand(toCards), `[${vb.label}, score=${vb.score}]`);
      console.log(`模式: ${mode} | 淘汰出局: 座位#${loserSeat}`);
      console.groupEnd();
    } else {
      console.log(
        `${title} | #${fromSeat}[${formatHand(fromCards)}] vs #${toSeat}[${formatHand(toCards)}]`
      );
    }
  }

  /**
   * 输出开牌结算与多层边池（Side Pot）分配详情
   */
  static logShowdownResult(
    roomId: string,
    mode: ZjhMode,
    contenders: readonly ZjhContender[],
    potResult: ZjhPotResult
  ): void {
    const totalPot = contenders.reduce((s, c) => s + c.contribution, 0);
    const title = `[ZJH-Showdown] 房间#${roomId} | 模式:${mode} | 总底池:${totalPot} | 赢家座位:${potResult.winners.map((w) => `#${w}`).join(',')}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#10b981;font-weight:bold;');
      console.table(
        contenders.map((c) => {
          const val = c.cards.length === 3 ? evaluateHand(c.cards) : null;
          const payout = potResult.payouts.get(c.seat) ?? 0;
          return {
            座位: `#${c.seat}`,
            状态: c.folded ? '弃牌/出局' : c.allIn ? '全押(All-In)' : '比牌开牌',
            牌型: val ? val.label : '-',
            手牌: formatHand(c.cards),
            总投入: c.contribution,
            分池派彩: payout,
            净盈亏: payout - c.contribution,
          };
        })
      );
      console.groupEnd();
    } else {
      console.log(
        `${title} | 派彩: ` +
          Array.from(potResult.payouts.entries())
            .map(([seat, amount]) => `#${seat}:+${amount}`)
            .join(', ')
      );
    }
  }

  /**
   * 输出每轮下注后的多人底池赔率与动态胜率变化日志
   */
  static logDynamicPotOddsShift(
    seatIndex: number,
    nickname: string,
    cards: readonly ZjhCard[],
    snap: ZjhDynamicPotOddsSnapshot
  ): void {
    const deltaSign = snap.winRateDelta >= 0 ? `+${snap.winRateDelta}%` : `${snap.winRateDelta}%`;
    const evSign = snap.callEv >= 0 ? `+${snap.callEv}` : `${snap.callEv}`;
    const raiseEvSign = snap.raiseEv >= 0 ? `+${snap.raiseEv}` : `${snap.raiseEv}`;
    const title = `[ZJH-PotOdds] 座位#${seatIndex}(${nickname}) | 第${snap.round}轮·底池${snap.pot} | 动态胜率:${snap.dynamicWinRate}%(${deltaSign}) | 底池赔率:${snap.potOddsPct}% | 跟注EV:${evSign}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#38bdf8;font-weight:bold;');
      console.log('当前手牌:', formatHand(cards), `[${snap.handLabel}]`);
      console.table({
        当前轮数与底池: `第 ${snap.round} 轮 / 底池 ${snap.pot} / 跟注额 ${snap.callCost}`,
        在局对手结构: `${snap.activeCount}人在局 (对手: ${snap.seenOpponentCount}明牌 / ${snap.blindOpponentCount}闷牌)`,
        死牌修正单挑胜率: `${snap.headsUpEquity}%`,
        多人动态存活胜率: `${snap.dynamicWinRate}% (本轮变化 ${deltaSign})`,
        直接底池赔率门槛: `${snap.potOddsPct}%`,
        多人隐含赔率门槛: `${snap.impliedOddsPct}%`,
        胜率赔率净优势: `${snap.equityEdgePct >= 0 ? '+' : ''}${snap.equityEdgePct}%`,
        跟注与加注期望EV: `跟注EV ${evSign} / 加注EV ${raiseEvSign}`,
        最优动作建议: snap.recommendedAction,
      });
      console.log('各座位对手贝叶斯范围拆解:', snap.opponentRangeSummary);
      console.groupEnd();
    } else {
      console.log(`${title} | 对手范围:${snap.opponentRangeSummary}`);
    }
  }
}
