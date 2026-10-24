/**
 * 炸金花 shared types (client + server). Pure data only, no runtime deps.
 */

export type ZjhSuit = 'spade' | 'heart' | 'club' | 'diamond';

/** rank: 2..10, J=11, Q=12, K=13, A=14 */
export interface ZjhCard {
  id: string;
  suit: ZjhSuit;
  rank: number;
}

/** Ascending strength. */
export enum ZjhCategory {
  HIGH_CARD = 1,
  PAIR = 2,
  STRAIGHT = 3,
  FLUSH = 4,
  STRAIGHT_FLUSH = 5,
  TRIPLE = 6,
}

export type ZjhMode = 'classic' | 'special' | 'bloody' | 'quick';

export interface ZjhHandValue {
  category: ZjhCategory;
  /** Single comparable integer (higher = stronger). Suits never participate. */
  score: number;
  label: string;
  /** Hand is an off-suit 2-3-5 (only meaningful in 'special' mode). */
  is235: boolean;
}

export interface ZjhEquityAnalysis {
  category: ZjhCategory;
  label: string;
  score: number;
  is235: boolean;
  /** Exact 1v1 win probability (0..100) after removing own 3 dead cards from 52-card deck (18,424 opponent combos). */
  headsUpEquity: number;
  /** Estimated multi-way win probability (0..100) against (activeCount - 1) opponents. */
  multiWayEquity: number;
  /** Required equity to break even on a call: callCost / (pot + callCost) in percentage (0..100). */
  potOdds: number;
  /** Expected value of calling in beans relative to pot. */
  callEv: number;
  /** Recommended optimal action ('fold' | 'call' | 'raise' | 'compare' | 'allin'). */
  recommendedAction: ZjhActionType;
  reasoning: string;
}

export interface ZjhDynamicPotOddsSnapshot {
  round: number;
  pot: number;
  callCost: number;
  compareCost: number;
  activeCount: number;
  seenOpponentCount: number;
  blindOpponentCount: number;
  handLabel: string;
  headsUpEquity: number;
  /** Multi-player dynamic win rate (0..100) adjusted per-opponent by seen/blind status, raises, and round depth. */
  dynamicWinRate: number;
  /** Win rate shift (Δ%) compared to the previous betting round or action. */
  winRateDelta: number;
  /** Direct pot odds threshold: callCost / (pot + callCost) in percentage (0..100). */
  potOddsPct: number;
  /** Implied pot odds considering remaining active opponents likely to call in the current round. */
  impliedOddsPct: number;
  /** Edge = dynamicWinRate - potOddsPct. */
  equityEdgePct: number;
  callEv: number;
  raiseEv: number;
  recommendedAction: ZjhActionType;
  opponentRangeSummary: string;
}

export type ZjhPhase = 'WAITING' | 'BETTING' | 'SHOWDOWN' | 'RESULT';

export type ZjhSeatStatus = 'waiting' | 'active' | 'folded' | 'lost' | 'allin';

export type ZjhActionType = 'look' | 'call' | 'raise' | 'compare' | 'fold' | 'allin';

export interface ZjhActionPayload {
  action: ZjhActionType;
  /** raise: index into ZJH_STAKE_LEVELS */
  level?: number;
  /** compare: target seat index */
  targetSeat?: number;
}

export interface ZjhSeatSnapshot {
  playerId: string;
  nickname: string;
  avatarId: string;
  seatIndex: number;
  beans: number;
  isBot: boolean;
  disconnected: boolean;
  status: ZjhSeatStatus;
  seen: boolean;
  /** Chips this seat has put into the pot this round (incl. ante). */
  totalBet: number;
  lastAction: string;
  /** Visible cards: own cards once seen, everyone's at showdown. null = hidden. */
  cards: ZjhCard[] | null;
  handLabel: string;
  isWinner: boolean;
  /** Net result for this round (RESULT phase only). */
  delta: number;
}

export interface ZjhRaiseOption {
  level: number;
  /** Chips this player pays for the raise. */
  cost: number;
  /** Stake the table moves to after the raise (blind-equivalent). */
  stake: number;
}

export interface ZjhCompareEvent {
  id: number;
  fromSeat: number;
  toSeat: number;
  loserSeat: number;
  /** true when initiator lost on tie / equal rank */
  tie: boolean;
}

export interface ZjhSnapshot {
  roomId: string;
  phase: ZjhPhase;
  mode: ZjhMode;
  baseScore: number;
  round: number;
  maxRounds: number;
  pot: number;
  /** Current blind stake (chips a blind player pays to call). */
  stake: number;
  stakeLevel: number;
  dealerSeat: number;
  currentTurnSeat: number;
  /** Seconds left on the acting seat's clock (0 when none). */
  turnSecondsLeft: number;
  countdown: number;
  mySeat: number;
  /** The server is playing for the viewer (AFK trusteeship). */
  myTrusteeship: boolean;
  seats: Array<ZjhSeatSnapshot | null>;
  /** Server-computed options for the viewing player (only when it is their turn). */
  my: {
    canAct: boolean;
    canLook: boolean;
    callCost: number;
    raiseOptions: ZjhRaiseOption[];
    compareCost: number;
    canCompare: boolean;
    compareTargets: number[];
    canAllIn: boolean;
    mustAllIn: boolean;
  };
  lastCompare: ZjhCompareEvent | null;
  message: string;
}

export interface ZjhTierConfig {
  id: string;
  name: string;
  badge: string;
  baseScore: number;
  minBeans: number;
  accentColor: string;
}

export const ZJH_MAX_SEATS = 5;
export const ZJH_MAX_ROUNDS = 10;
export const ZJH_MIN_COMPARE_ROUND = 2;
/** Stake multipliers (× baseScore) selectable when raising. */
export const ZJH_STAKE_LEVELS = [1, 2, 5, 10] as const;
export const ZJH_TURN_SECONDS = 15;

export const ZJH_TIERS: ZjhTierConfig[] = [
  { id: 'zjh_t1', name: '新手场', badge: '初', baseScore: 100, minBeans: 5000, accentColor: '#4ade80' },
  { id: 'zjh_t2', name: '平民场', badge: '平', baseScore: 500, minBeans: 25000, accentColor: '#38bdf8' },
  { id: 'zjh_t3', name: '富豪场', badge: '富', baseScore: 2000, minBeans: 100000, accentColor: '#c084fc' },
  { id: 'zjh_t4', name: '至尊场', badge: '尊', baseScore: 10000, minBeans: 500000, accentColor: '#fbbf24' },
];
