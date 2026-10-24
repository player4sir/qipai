import {
  FourCardOddsAnalysis,
  NiuniuCard,
  NiuniuDynamicPotOddsSnapshot,
  NiuniuHandResult,
  NiuniuPlayMode,
  NiuniuSettlement,
} from '../types';
import { RANK_NAMES, SUIT_NAMES } from '../algorithms/NiuniuLogic';

function formatCard(c: NiuniuCard): string {
  if (!c || c.rank <= 0) return '[暗牌]';
  return `${SUIT_NAMES[c.suit] || c.suit}${RANK_NAMES[c.rank] || c.rank}(${c.value}点)`;
}

function formatCardList(cards: readonly NiuniuCard[]): string {
  return cards.map(formatCard).join(' ');
}

export class NiuniuDebugLogger {
  /**
   * 输出看牌抢庄前4张牌的48张未知牌精确组合分布与推荐策略
   */
  static logFourCardOdds(
    seatIndex: number,
    nickname: string,
    first4Cards: readonly NiuniuCard[],
    odds: FourCardOddsAnalysis,
    playMode: NiuniuPlayMode
  ): void {
    const title = `[Niuniu-Odds] 座位#${seatIndex}(${nickname}) | 模式:${playMode} | 成牛率:${odds.niuProb}% | 牛七+:${odds.highNiuProb}% | 建议抢:${odds.recommendedCall}倍/注:${odds.recommendedBet}倍`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#f59e0b;font-weight:bold;');
      console.log('前4张明牌:', formatCardList(first4Cards));
      console.table({
        成牛概率: `${odds.niuProb}%`,
        牛七及以上概率: `${odds.highNiuProb}%`,
        牛牛及特殊牛概率: `${odds.niuNiuPlusProb}%`,
        预估对局胜率: `${odds.multiWinProb}%`,
        期望等级: odds.expectedLevel,
        期望倍数: `${odds.expectedMultiplier}x`,
        最高可成牌型: odds.bestPossibleName,
        推荐抢庄: odds.recommendedCall === 0 ? '不抢' : `抢${odds.recommendedCall}倍`,
        推荐闲注: `${odds.recommendedBet}倍`,
      });
      console.log(
        '48张未知牌落点分布:',
        `无牛:${odds.distribution.noNiu}张 | 牛一~牛六:${odds.distribution.lowNiu}张 | 牛七~牛九:${odds.distribution.highNiu}张 | 牛牛+:${odds.distribution.niuNiuPlus}张`
      );
      console.groupEnd();
    } else {
      console.log(
        `${title} | 明牌: ${formatCardList(first4Cards)} | 期望倍数: ${odds.expectedMultiplier}x`
      );
    }
  }

  /**
   * 输出5张完整手牌的 3+2 最优算牛拆解与比牌主牌
   */
  static logHandEvaluation(
    seatIndex: number,
    nickname: string,
    cards: readonly NiuniuCard[],
    result: NiuniuHandResult,
    playMode: NiuniuPlayMode
  ): void {
    const title = `[Niuniu-Eval] 座位#${seatIndex}(${nickname}) | ${result.name}(Lv.${result.level} / x${result.multiplier}倍) | 主牌:${formatCard(result.maxCard)}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#10b981;font-weight:bold;');
      console.log('完整5张手牌:', formatCardList(cards));
      console.log(
        '3+2最优拆解:',
        result.tenGroup.length === 3
          ? `凑十组[${formatCardList(result.tenGroup)}] + 牛数组[${formatCardList(result.bullGroup)}]`
          : '无凑十组合'
      );
      if (result.optimalReason) {
        console.log('择优依据:', result.optimalReason);
      }
      console.log('模式与倍率:', `${playMode} -> x${result.multiplier}倍`);
      console.groupEnd();
    } else {
      console.log(`${title} | 手牌: ${formatCardList(cards)}`);
    }
  }

  /**
   * 输出本局比牌结算全表
   */
  static logRoundSettlement(
    roomId: string,
    playMode: NiuniuPlayMode,
    dealerSeat: number,
    settlement: NiuniuSettlement
  ): void {
    const title = `[Niuniu-Settle] 房间#${roomId} | 模式:${playMode} | 庄家座位:#${dealerSeat} | 底分:${settlement.baseScore}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#38bdf8;font-weight:bold;');
      console.table(
        settlement.players.map((p) => ({
          座位: `#${p.seatIndex}`,
          昵称: p.nickname,
          身份: p.isDealer
            ? `庄家(抢${p.callMultiplier || 1}倍)`
            : `闲家(下${p.betMultiplier || 1}倍)`,
          牌型: `${p.handName}(x${p.handMultiplier}倍)`,
          手牌: formatCardList(p.cards),
          本局盈亏: p.scoreDelta > 0 ? `+${p.scoreDelta}` : `${p.scoreDelta}`,
          当前豆数: p.balance,
        }))
      );
      console.groupEnd();
    } else {
      console.log(
        `${title} | 结算明细: ` +
          settlement.players
            .map((p) => `#${p.seatIndex}(${p.handName}:${p.scoreDelta >= 0 ? '+' : ''}${p.scoreDelta})`)
            .join(', ')
      );
    }
  }

  /**
   * 输出每轮抢庄/下注动作后的多人底池赔率与胜率动态偏移日志
   */
  static logDynamicPotOddsShift(
    seatIndex: number,
    nickname: string,
    snap: NiuniuDynamicPotOddsSnapshot
  ): void {
    const deltaSign = snap.winProbDelta >= 0 ? `+${snap.winProbDelta}%` : `${snap.winProbDelta}%`;
    const evSign = snap.expectedEv >= 0 ? `+${snap.expectedEv}` : `${snap.expectedEv}`;
    const title = `[Niuniu-PotOdds] 座位#${seatIndex}(${nickname}) | 阶段:${snap.phase} | 动态胜率:${snap.dynamicWinProb}%(${deltaSign}) | 底池赔率:${snap.potOddsPct}% | EV:${evSign}`;
    if (typeof window !== 'undefined' && typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${title}`, 'color:#ec4899;font-weight:bold;');
      console.table({
        当前阶段: snap.phase,
        在局人数与庄位: `${snap.activeSeats}人局 / 庄家座位#${snap.dealerSeatId}(抢${snap.dealerCallMult}倍)`,
        闲家总注倍与预估底池: `总注 ${snap.totalBetMultiplierSum}倍 / 预估底池 ${snap.estimatedTotalPot}`,
        自身风险敞口: snap.selfCommittedRisk,
        先验基准胜率: `${snap.baseWinProb}%`,
        实时动态胜率: `${snap.dynamicWinProb}% (较上轮偏移 ${deltaSign})`,
        多人底池赔率门槛: `${snap.potOddsPct}%`,
        胜率赔率优势差: `${snap.equityEdgePct >= 0 ? '+' : ''}${snap.equityEdgePct}%`,
        期望净收益EV: evSign,
        动态推荐倍数: `${snap.optimalMultiplier}倍`,
      });
      console.groupEnd();
    } else {
      console.log(`${title} | 预估底池:${snap.estimatedTotalPot}`);
    }
  }
}
