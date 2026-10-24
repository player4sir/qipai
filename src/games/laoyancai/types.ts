export type LaoYanCaiSuit = 'spade' | 'heart' | 'club' | 'diamond';

export interface LaoYanCaiCard {
  id: number;
  suit: LaoYanCaiSuit;
  /** 1=A, 2..10, 11=J, 12=Q, 13=K; <=0 means face-down masked card */
  rank: number;
  /** Point value in Lao Yan Cai: A=1, 2..9=2..9, 10/J/Q/K=0 */
  point: number;
}

export type LaoYanCaiPlayMode = 'kunming' | 'yuxi' | 'crazy';

export type LaoYanCaiPhase =
  | 'WAITING'
  | 'CALL_BANKER'
  | 'BETTING'
  | 'DEAL_2'
  | 'BANKER_NATURAL'
  | 'PLAYER_DECISION'
  | 'BANKER_DECISION'
  | 'SHOWDOWN'
  | 'ROUND_RESULT';

export type LaoYanCaiDecision = 'PENDING' | 'ZHAKAI' | 'LAO' | 'BULAO';

export type LaoYanCaiHandCategory =
  | 'BAOZI'          // 3张同点（豹子/炸弹）
  | 'STRAIGHT_FLUSH' // 3张同花顺（顺金）
  | 'SANGONG'        // 3张公牌 J/Q/K（三公）
  | 'NATURAL_9'      // 2张天牌9点（炸开9点）
  | 'NATURAL_8'      // 2张天牌8点（炸开8点）
  | 'SANYAN'         // 3张同花（三腌）
  | 'SHUANGYAN'      // 2张同花（双腌）
  | 'PAIR'           // 2张对子
  | 'NORMAL';        // 普通点数（0~9点）

export interface LaoYanCaiHandResult {
  cards: LaoYanCaiCard[];
  cardCount: number;
  /** Total points mod 10 (0 ~ 9) */
  points: number;
  category: LaoYanCaiHandCategory;
  /** Display name e.g. '九点·双腌', '豹子K', '三公', '八点炸开', '七点·三腌', '瘪十(0点)' */
  name: string;
  /** Badge tag e.g. '双腌×2', '三腌×3', '三公×3', '顺金×4', '豹子×5', '天牌炸开' */
  badgeText: string;
  /** Multiplier (1x ~ 8x depending on mode) */
  multiplier: number;
  /** Whether initial 2-card hand is eligible for 炸开 (8 or 9 points with 2 cards) */
  canZhaKai: boolean;
  /** Whether this hand was locked via 炸开 */
  isZhaKai: boolean;
  isSuited: boolean;
  isPair: boolean;
  isBaozi: boolean;
  isSanGong: boolean;
  isStraightFlush: boolean;
  /** Numeric weight for deterministic comparison */
  weight: number;
}

export interface LaoYanCaiDrawOdds {
  currentPoints: number;
  currentName: string;
  currentMultiplier: number;
  canZhaKai: boolean;
  remainingDeckCount: number;
  /** Number of cards in remaining deck that strictly improve points or form Baozi/SanGong/StraightFlush */
  improveCardCount: number;
  /** Percentage [0..100] */
  improveProbability: number;
  /** Probability of hitting >= 7 points or special 3-card hand after drawing [0..100] */
  highHandProbability: number;
  /** Probability of hitting 3x+ multiplier (三腌/三公/同花顺/豹子) [0..100] */
  specialMultiplierProbability: number;
  expectedPointsAfterDraw: number;
  expectedMultiplierAfterDraw: number;
  recommendation: 'ZHAKAI' | 'LAO' | 'BULAO';
  adviceText: string;
}

export interface LaoYanCaiPlayerInfo {
  playerId: string;
  nickname: string;
  avatarId: string;
  seatIndex: number;
  beans: number;
  ready: boolean;
  isBot: boolean;
  disconnected: boolean;
  isDealer: boolean;
  callMultiplier: number; // -1: not decided, 0: 不抢, 1/2/3: 抢庄倍数
  betMultiplier: number;  // 0: not bet, 5/10/15/20: 闲家下注倍数
  decision: LaoYanCaiDecision;
  cards: LaoYanCaiCard[];
  hasRevealed: boolean;
  handResult?: LaoYanCaiHandResult;
  drawOdds?: LaoYanCaiDrawOdds;
  scoreDelta?: number;
}

export interface LaoYanCaiSettlementPlayer {
  seatIndex: number;
  playerId: string;
  nickname: string;
  avatarId: string;
  isDealer: boolean;
  callMultiplier: number;
  betMultiplier: number;
  decision: LaoYanCaiDecision;
  cards: LaoYanCaiCard[];
  handName: string;
  badgeText: string;
  points: number;
  multiplier: number;
  scoreDelta: number;
  balance: number;
  isWinner: boolean;
}

export interface LaoYanCaiSettlement {
  baseScore: number;
  playMode: LaoYanCaiPlayMode;
  dealerSeatIndex: number;
  bankerZhaKaiAll: boolean;
  players: LaoYanCaiSettlementPlayer[];
}

export interface LaoYanCaiTableSnapshot {
  roomId: string;
  baseScore: number;
  playMode: LaoYanCaiPlayMode;
  phase: LaoYanCaiPhase;
  countdown: number;
  dealerSeatId: number;
  remainingDeckCount: number;
  bankerZhaKaiAll: boolean;
  seats: Array<LaoYanCaiPlayerInfo | null>;
  settlement?: LaoYanCaiSettlement;
}

export interface LaoYanCaiTierConfig {
  id: string;
  title: string;
  baseScore: number;
  minBeans: number;
  capLabel: string;
  onlineBase: number;
  emblemIcon: string;
  theme: {
    bgGradient: string;
    borderColor: string;
    glowColor: string;
    titleColor: string;
    titleStroke: string;
    titleShadow: string;
    pillBg: string;
  };
}
