export type Rank =
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'
  | '2'
  | 'small_joker'
  | 'big_joker';

export type Suit = 'spade' | 'heart' | 'club' | 'diamond' | null;

export interface CardData {
  id: string;
  rank: Rank;
  suit: Suit;
  value: number;
  isWild?: boolean;
  mappedRank?: Rank;
}

export type DdzPhase =
  | 'WAITING'
  | 'DEALING'
  | 'SWAPPING'
  | 'BIDDING'
  | 'GRABBING'
  | 'LANDLORD_REVEAL'
  | 'DOUBLING'
  | 'PLAYING'
  | 'SETTLEMENT';

export type DealMode = 'classic' | 'no_shuffle' | 'laizi' | 'tiandi_laizi' | 'swap_three';
export type SwapDirection = 'clockwise' | 'counter_clockwise';
export type HandSortMode = 'rank' | 'count';
export type PropType = 'flower' | 'bomb_cup' | 'tea' | 'like' | 'ingot';

export type RoomTier = 'rookie' | 'primary' | 'middle' | 'high';

export interface RoomTierConfig {
  tier: RoomTier;
  name: string;
  badge: string;
  baseScore: number;
  minBeans: number;
  roomCardCost?: number;
  initialScore?: number;
  maxMultiplier: number;
  fee: number;
  accentColor: string;
}

export const ROOM_TIER_CONFIGS: RoomTierConfig[] = [
  {
    tier: 'rookie',
    name: '新手积分房',
    badge: '1卡准入 · 2000初始分',
    baseScore: 100,
    minBeans: 1,
    roomCardCost: 1,
    initialScore: 2000,
    maxMultiplier: 32,
    fee: 0,
    accentColor: 'from-emerald-500 to-teal-700',
  },
  {
    tier: 'primary',
    name: '进阶竞技房',
    badge: '2卡准入 · 10000初始分',
    baseScore: 500,
    minBeans: 2,
    roomCardCost: 2,
    initialScore: 10000,
    maxMultiplier: 64,
    fee: 0,
    accentColor: 'from-blue-500 to-indigo-700',
  },
  {
    tier: 'middle',
    name: '精英尊享房',
    badge: '4卡准入 · 50000初始分',
    baseScore: 2000,
    minBeans: 4,
    roomCardCost: 4,
    initialScore: 50000,
    maxMultiplier: 128,
    fee: 0,
    accentColor: 'from-purple-500 to-violet-800',
  },
  {
    tier: 'high',
    name: '宗师巅峰房',
    badge: '8卡准入 · 200000初始分',
    baseScore: 10000,
    minBeans: 8,
    roomCardCost: 8,
    initialScore: 200000,
    maxMultiplier: 256,
    fee: 0,
    accentColor: 'from-amber-500 to-red-700',
  },
];

export function getRoomTierByBaseScore(baseScore: number): RoomTierConfig {
  if (baseScore >= 10000) return ROOM_TIER_CONFIGS[3];
  if (baseScore >= 2000) return ROOM_TIER_CONFIGS[2];
  if (baseScore >= 500) return ROOM_TIER_CONFIGS[1];
  return ROOM_TIER_CONFIGS[0];
}

export interface SeatPlayerInfo {
  playerId: string;
  nickname: string;
  avatarId: string;
  seatIndex: number;
  beans: number;
  initialScore?: number;
  ready: boolean;
  isBot: boolean;
  disconnected: boolean;
  trusteeship: boolean;
  doubleFactor?: 1 | 2 | 4;
}

export interface ChatBubbleInfo {
  id: string;
  seatIndex: number;
  text: string;
  emoji?: string;
}

export interface SeatActionRecord {
  seat: number;
  type:
    | 'call'
    | 'no_call'
    | 'grab'
    | 'no_grab'
    | 'swap_three'
    | 'double_1'
    | 'double_2'
    | 'double_4'
    | 'play'
    | 'pass';
  cards?: CardData[];
  patternLabel?: string;
}

export interface ReplayStep {
  stepIndex: number;
  seat: number;
  actionType:
    | 'call'
    | 'no_call'
    | 'grab'
    | 'no_grab'
    | 'landlord_reveal'
    | 'swap_three'
    | 'double_1'
    | 'double_2'
    | 'double_4'
    | 'play'
    | 'pass';
  cards?: CardData[];
  patternLabel?: string;
  multiplierAfter: number;
  wildRanksAfter: Rank[];
}

export interface MatchReplayRecord {
  matchId: string;
  roomId: string;
  dealMode: DealMode;
  wildRanks: Rank[];
  baseScore: number;
  finalMultiplier: number;
  landlordSeat: number;
  winnerSeat: number;
  isSpring: boolean;
  isAntiSpring: boolean;
  timestamp: number;
  seats: Array<{
    seatIndex: number;
    playerId: string;
    nickname: string;
    avatarId: string;
    role: 'landlord' | 'peasant';
    scoreDelta: number;
    isWinner: boolean;
  }>;
  initialHands: Record<number, CardData[]>;
  landlordCards: CardData[];
  steps: ReplayStep[];
}

export interface SettlementData {
  matchId?: string;
  winnerId: string;
  winnerSeat: number;
  isLandlordWin: boolean;
  baseScore: number;
  grabMultiplier: number;
  doubleMultiplier: number;
  bombMultiplier: number;
  springMultiplier: number;
  totalMultiplier: number;
  maxMultiplier?: number;
  effectiveMultiplier?: number;
  isCapped?: boolean;
  bankruptProtectedIds?: string[];
  isSpring: boolean;
  isAntiSpring: boolean;
  scoreChanges: Record<string, number>;
  remainingHands: Record<string, CardData[]>;
  wildRanks?: Rank[];
  replay?: MatchReplayRecord;
}

export interface GameSnapshotPayload {
  roomId: string;
  dealMode: DealMode;
  wildRanks?: Rank[];
  baseScore: number;
  maxMultiplier?: number;
  isPrivate: boolean;
  hostId: string;
  phase: DdzPhase;
  players: Array<SeatPlayerInfo | null>;
  mySeat: number;
  currentSeat: number;
  timeoutAt: number;
  serverTime?: number;
  isFreeLead: boolean;
  landlordId: string | null;
  landlordSeat: number | null;
  multiplier: number;
  myCards?: CardData[];
  othersCount?: Record<string, number>;
  landlordCards?: CardData[];
  bottomCardsTag?: string | null;
  cardRecorder?: Record<Rank, number>;
  seatLastActions?: SeatActionRecord[];
  swapDirection?: SwapDirection;
  swappedInCardIds?: string[];
  swapSubmittedSeats?: number[];
}
