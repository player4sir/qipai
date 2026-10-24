export type NiuniuSuit = 'spade' | 'heart' | 'club' | 'diamond';

export type NiuniuPlayMode = 'qiangzhuang' | 'tongbi' | 'crazy' | 'classic';

export interface NiuniuCard {
  id: number; // 0..51
  suit: NiuniuSuit;
  rank: number; // 1 (A) .. 13 (K)
  value: number; // 1..10 (A=1, 2=2, ..., 9=9, 10/J/Q/K=10)
}

export type NiuniuHandType =
  | 'NO_NIU' // 无牛 (0)
  | 'NIU_1' // 牛一 (1)
  | 'NIU_2' // 牛二 (2)
  | 'NIU_3' // 牛三 (3)
  | 'NIU_4' // 牛四 (4)
  | 'NIU_5' // 牛五 (5)
  | 'NIU_6' // 牛六 (6)
  | 'NIU_7' // 牛七 (7)
  | 'NIU_8' // 牛八 (8)
  | 'NIU_9' // 牛九 (9)
  | 'NIU_NIU' // 牛牛 (10)
  | 'STRAIGHT_NIU' // 顺子牛 (11)
  | 'FLUSH_NIU' // 同花牛 (12)
  | 'FULL_HOUSE_NIU' // 葫芦牛 (13)
  | 'SILVER_NIU' // 银牛 / 四花牛 (14)
  | 'GOLD_NIU' // 金牛 / 五花牛 (15)
  | 'BOMB_NIU' // 炸弹牛 / 四炸 (16)
  | 'FIVE_SMALL_NIU' // 五小牛 (17)
  | 'STRAIGHT_FLUSH_NIU'; // 同花顺牛 / 一条龙 (18)

export interface NiuniuHandResult {
  handType: NiuniuHandType;
  level: number; // 0..18
  multiplier: number; // 1..12
  name: string; // 牌型中文名
  tenGroup: NiuniuCard[]; // 凑十的 3 张牌
  bullGroup: NiuniuCard[]; // 算牛的 2 张牌
  maxCard: NiuniuCard; // 牌面主比较单张（用于同等级比牌）
  optimalReason?: string; // 3+2 组合择优说明
}

export interface FourCardOddsAnalysis {
  niuProb: number; // 成牛概率 (0..100)
  highNiuProb: number; // 牛七及以上高倍概率 (0..100)
  niuNiuPlusProb: number; // 牛牛及特殊牌型概率 (0..100)
  multiWinProb: number; // 5人局预估胜率 (0..100)
  expectedLevel: number; // 期望牌型等级
  expectedMultiplier: number; // 期望牌型倍数
  bestPossibleName: string; // 第5张可成最大牌型
  recommendedCall: number; // 推荐抢庄倍数 (0/1/2/3/4)
  recommendedBet: number; // 推荐闲家下注倍数 (5/10/15/20)
  distribution: {
    noNiu: number;
    lowNiu: number; // 牛一~牛六
    highNiu: number; // 牛七~牛九
    niuNiuPlus: number; // 牛牛及特殊牛
  };
}

export interface NiuniuDynamicPotOddsSnapshot {
  phase: NiuniuPhase;
  activeSeats: number;
  dealerSeatId: number;
  dealerCallMult: number;
  totalBetMultiplierSum: number;
  estimatedTotalPot: number; // 预估桌面总风险底池
  selfCommittedRisk: number; // 自身当前投入风险筹码
  baseWinProb: number; // 初始4张牌基准胜率 (0..100%)
  dynamicWinProb: number; // 结合对手抢庄/下注范围修正后的动态胜率 (0..100%)
  winProbDelta: number; // 相较上一阶段/轮次的胜率动态变化量 (百分点)
  potOddsPct: number; // 多人底池赔率门槛 (0..100%)
  equityEdgePct: number; // 胜率相对底池赔率优势 (dynamicWinProb - potOddsPct)
  expectedEv: number; // 当前决策期望收益 (豆)
  optimalMultiplier: number; // 动态推荐倍数
}

export type NiuniuPhase =
  | 'WAITING' // 等待准备 / 补齐玩家
  | 'DEAL_FIRST_4' // 发前4张手牌 (看牌抢庄4明1暗)
  | 'CALL_BANKER' // 抢庄阶段 (不抢/1/2/3/4倍)
  | 'DETERMINE_BANKER' // 光圈闪烁定庄
  | 'BETTING' // 闲家下注加倍阶段 (5/10/15/20倍)
  | 'DEAL_5TH' // 发第5张牌
  | 'SHOWDOWN' // 算牛 / 摊牌阶段 (3+2凑十算牛)
  | 'COMPARE_AND_SETTLE' // 比牌与筹码飞行结算动画
  | 'ROUND_RESULT'; // 本局结算面板

export interface NiuniuPlayerInfo {
  playerId: string;
  nickname: string;
  avatarId: string;
  seatIndex: number;
  beans: number;
  ready: boolean;
  isBot: boolean;
  disconnected: boolean;
  callMultiplier: number; // -1: 未操作, 0: 不抢, 1~4: 抢对应倍数
  betMultiplier: number; // 0: 未下注, 5/10/15/20: 下注倍数
  isDealer: boolean;
  cards: NiuniuCard[];
  hasShownHand: boolean;
  handResult?: NiuniuHandResult;
  scoreDelta?: number;
}

export interface NiuniuTableSnapshot {
  roomId: string;
  baseScore: number;
  playMode: NiuniuPlayMode;
  phase: NiuniuPhase;
  countdown: number;
  dealerSeatId: number;
  seats: Array<NiuniuPlayerInfo | null>;
  candidateDealerSeats?: number[];
  settlement?: NiuniuSettlement;
}

export interface NiuniuPlayerSettlement {
  seatIndex: number;
  playerId: string;
  nickname: string;
  avatarId?: string;
  isDealer: boolean;
  callMultiplier?: number;
  betMultiplier?: number;
  handType: NiuniuHandType;
  handName: string;
  handMultiplier: number;
  cards: NiuniuCard[];
  scoreDelta: number;
  balance: number;
  isWinner: boolean;
}

export interface NiuniuSettlement {
  baseScore: number;
  playMode?: NiuniuPlayMode;
  dealerSeatIndex: number;
  players: NiuniuPlayerSettlement[];
}

export interface NiuniuTierConfig {
  id: string;
  title: string;
  baseScore: number;
  minBeans: number;
  capLabel: string;
  onlineBase: number;
  emblemIcon: string;
  bgTexture: string;
  theme: {
    bgGradient: string;
    borderColor: string;
    glowColor: string;
    titleColor: string;
    titleStroke: string;
    titleShadow: string;
    pillBg: string;
    ribbonBg: string;
  };
}
