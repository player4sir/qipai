export type LaoYanCaiSuit = 'spade' | 'heart' | 'club' | 'diamond';

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
  | 'BAOZI'
  | 'STRAIGHT_FLUSH'
  | 'SANGONG'
  | 'ZHAKAI_9'
  | 'ZHAKAI_8'
  | 'SANYAN'
  | 'SHUANGYAN'
  | 'PAIR_2'
  | 'NORMAL';

export interface LaoYanCaiCard {
  id: number;
  suit: LaoYanCaiSuit;
  rank: number; // 1 (A) ~ 13 (K), 0 = hidden card back
  point: number; // A=1, 2~9=2~9, 10/J/Q/K=0
}

export interface LaoYanCaiHandResult {
  category: LaoYanCaiHandCategory;
  name: string;
  badgeText: string;
  points: number; // 0 ~ 9 (sum of card points mod 10)
  multiplier: number;
  cardCount: number;
  isBaozi: boolean;
  isStraightFlush: boolean;
  isSanGong: boolean;
  isSuited: boolean;
  isPair: boolean;
  isZhaKai: boolean;
  canZhaKai: boolean; // true if 2-card hand is 8 or 9 points
  highRank: number;
  highSuitWeight: number;
  cards: LaoYanCaiCard[];
}

export interface LaoYanCaiDrawOdds {
  currentPoints: number;
  remainingDeckSize: number;
  improveProbability: number; // 0 ~ 100 (%)
  highPointsProbability: number; // probability of landing on 7, 8, 9 or special hand (%)
  specialHandProbability: number; // probability of hitting Baozi / StraightFlush / SanGong / SanYan (%)
  bustOrDropProbability: number; // probability of points dropping below currentPoints (%)
  expectedPointsAfterDraw: number;
  expectedMultiplierAfterDraw: number;
  recommendedAction: 'ZHAKAI' | 'LAO' | 'BULAO';
  recommendationReason: string;
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
  callMultiplier: number; // -1: pending, 0: pass, 1~3: call multiplier
  betMultiplier: number; // 0: pending, 5/10/15/20
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
