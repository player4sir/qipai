export type RoomCardPayMode = 'host' | 'aa' | 'winner';
export type RoomRoundCount = 4 | 8 | 16;
export type RoomEntryActionKind = 'quick_match' | 'create_room' | 'join_room';
export type EscrowPhaseStatus = 'FROZEN' | 'CAPTURED' | 'RELEASED' | 'ELIGIBILITY_LOCKED';

export interface CommercialStakePreset {
  id: 'rookie' | 'primary' | 'middle' | 'high';
  title: string;
  label: string;
  badge: string;
  baseScore: number;
  initialScore: number;
  roomCardCost: number;
  minRatio: number;
  maxMultiplier: number;
}

/**
 * Standard Commercial Preset Tiers (预设档位)
 */
export const COMMERCIAL_STAKE_PRESETS: CommercialStakePreset[] = [
  {
    id: 'rookie',
    title: '标准场',
    label: '标准场',
    badge: '1卡准入 · 2000初始分',
    baseScore: 100,
    initialScore: 2000,
    roomCardCost: 1,
    minRatio: 20,
    maxMultiplier: 32,
  },
  {
    id: 'primary',
    title: '精英场',
    label: '精英场',
    badge: '2卡准入 · 10000初始分',
    baseScore: 500,
    initialScore: 10000,
    roomCardCost: 2,
    minRatio: 20,
    maxMultiplier: 64,
  },
  {
    id: 'middle',
    title: '大师场',
    label: '大师场',
    badge: '4卡准入 · 50000初始分',
    baseScore: 2000,
    initialScore: 50000,
    roomCardCost: 4,
    minRatio: 25,
    maxMultiplier: 128,
  },
  {
    id: 'high',
    title: '至尊场',
    label: '至尊场',
    badge: '8卡准入 · 200000初始分',
    baseScore: 10000,
    initialScore: 200000,
    roomCardCost: 8,
    minRatio: 20,
    maxMultiplier: 256,
  },
];

export const CUSTOM_STAKES_LIMITS = {
  MIN_BASE_SCORE: 10,
  MAX_BASE_SCORE: 50000,
  MIN_INITIAL_SCORE: 500,
  MAX_INITIAL_SCORE: 1000000,
  MIN_SAFETY_RATIO: 10,
  RECOMMENDED_RATIO: 20,
} as const;

export interface CustomStakesValidationResult {
  valid: boolean;
  baseScore: number;
  initialScore: number;
  normalizedBaseScore: number;
  normalizedInitialScore: number;
  ratio: number;
  minRequiredInitialScore: number;
  recommendedInitialScore: number;
  roomCardCost: number;
  errorReason?: string;
  errorMessage?: string;
}

/**
 * Dynamically calculates single-session Quick Match Room Card cost from baseScore and initialScore.
 * - 标准场 (< 500 底分 & < 10,000 初始分): 1 张
 * - 精英场 (500 ~ 1,999 底分 or 10,000 ~ 39,999 初始分): 2 张
 * - 大师场 (2,000 ~ 9,999 底分 or 40,000 ~ 199,999 初始分): 4 张
 * - 至尊场 (>= 10,000 底分 or >= 200,000 初始分): 8 张
 */
export function calculateStakeTierRoomCardCost(
  baseScore: number,
  initialScore: number
): number {
  const cleanBase = Math.max(10, Math.round(Number(baseScore) || 100));
  const cleanInit = Math.max(500, Math.round(Number(initialScore) || cleanBase * 20));

  if (cleanBase >= 10000 || cleanInit >= 200000) return 8;
  if (cleanBase >= 2000 || cleanInit >= 40000) return 4;
  if (cleanBase >= 500 || cleanInit >= 10000) return 2;
  return 1;
}

/**
 * Validates user-configured custom or preset `baseScore` and `initialScore`.
 * Enforces commercial anti-bust ratio (`initialScore >= baseScore * 10`).
 */
export function validateCustomStakes(
  rawBaseScore: number,
  rawInitialScore: number
): CustomStakesValidationResult {
  const baseScore = Math.round(Number(rawBaseScore) || 0);
  const initialScore = Math.round(Number(rawInitialScore) || 0);
  const normalizedBaseScore = Math.min(
    CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE,
    Math.max(CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE, baseScore || 100)
  );
  const minRequiredInitialScore = Math.max(
    CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE,
    baseScore * CUSTOM_STAKES_LIMITS.MIN_SAFETY_RATIO
  );
  const normalizedInitialScore = Math.min(
    CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE,
    Math.max(
      CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE,
      normalizedBaseScore * CUSTOM_STAKES_LIMITS.MIN_SAFETY_RATIO,
      initialScore || normalizedBaseScore * CUSTOM_STAKES_LIMITS.RECOMMENDED_RATIO
    )
  );
  const recommendedInitialScore = Math.min(
    CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE,
    Math.max(
      CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE,
      baseScore * CUSTOM_STAKES_LIMITS.RECOMMENDED_RATIO
    )
  );
  const ratio = baseScore > 0 ? Number((initialScore / baseScore).toFixed(1)) : 0;
  const roomCardCost = calculateStakeTierRoomCardCost(baseScore, initialScore);

  if (
    baseScore < CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE ||
    baseScore > CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE
  ) {
    const msg = `底分须在 ${CUSTOM_STAKES_LIMITS.MIN_BASE_SCORE.toLocaleString()} ~ ${CUSTOM_STAKES_LIMITS.MAX_BASE_SCORE.toLocaleString()} 之间`;
    return {
      valid: false,
      baseScore,
      initialScore,
      normalizedBaseScore,
      normalizedInitialScore,
      ratio,
      minRequiredInitialScore,
      recommendedInitialScore,
      roomCardCost,
      errorReason: msg,
      errorMessage: msg,
    };
  }

  if (
    initialScore < CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE ||
    initialScore > CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE
  ) {
    const msg = `初始积分须在 ${CUSTOM_STAKES_LIMITS.MIN_INITIAL_SCORE.toLocaleString()} ~ ${CUSTOM_STAKES_LIMITS.MAX_INITIAL_SCORE.toLocaleString()} 之间`;
    return {
      valid: false,
      baseScore,
      initialScore,
      normalizedBaseScore,
      normalizedInitialScore,
      ratio,
      minRequiredInitialScore,
      recommendedInitialScore,
      roomCardCost,
      errorReason: msg,
      errorMessage: msg,
    };
  }

  if (initialScore < minRequiredInitialScore) {
    const msg = `风控校验：初始积分须至少为底分的 ${CUSTOM_STAKES_LIMITS.MIN_SAFETY_RATIO} 倍（≥ ${minRequiredInitialScore.toLocaleString()}）`;
    return {
      valid: false,
      baseScore,
      initialScore,
      normalizedBaseScore,
      normalizedInitialScore,
      ratio,
      minRequiredInitialScore,
      recommendedInitialScore,
      roomCardCost,
      errorReason: msg,
      errorMessage: msg,
    };
  }

  return {
    valid: true,
    baseScore,
    initialScore,
    normalizedBaseScore: baseScore,
    normalizedInitialScore: initialScore,
    ratio,
    minRequiredInitialScore,
    recommendedInitialScore,
    roomCardCost,
  };
}

export interface RoomCardCostEvaluation {
  totalCost: number;
  perPlayerCost: number;
  payMode: RoomCardPayMode;
  totalRounds: RoomRoundCount;
  baseScore: number;
  initialScore: number;
  stakeMultiplier: number;
  description: string;
}

/**
 * Unified Commercial Room Card Cost Algorithm:
 * 1. Quick Match (`actionType === 'quick_match'`):
 *    Charged strictly by single-match stake tier (1 / 2 / 4 / 8 cards), deducted immediately upon entry.
 * 2. Private Friend Room (`create_room` / `join_room`):
 *    Charged strictly by fixed round count (4局=1卡, 8局=2卡, 16局=4卡; AA平摊: 4/8局=1卡/人, 16局=2卡/人),
 *    independent of base score tier or seat count.
 */
export function calculateRoomCardCost(
  totalRounds: RoomRoundCount = 8,
  payMode: RoomCardPayMode = 'host',
  _seatCount = 3,
  baseScore = 100,
  initialScore = 2000,
  actionType: RoomEntryActionKind = 'create_room'
): RoomCardCostEvaluation {
  if (actionType === 'quick_match') {
    const tierCost = calculateStakeTierRoomCardCost(baseScore, initialScore);
    return {
      totalCost: tierCost,
      perPlayerCost: tierCost,
      payMode: 'host',
      totalRounds: 4,
      baseScore,
      initialScore,
      stakeMultiplier: 1,
      description: `快速场准入 · 入场即扣 ${tierCost} 张房卡`,
    };
  }

  // Friend room: fixed strictly by round count (4局=1卡, 8局=2卡, 16局=4卡)
  const roundFixedTotal = totalRounds === 4 ? 1 : totalRounds === 8 ? 2 : 4;

  if (payMode === 'aa') {
    const aaPerPlayer = totalRounds === 16 ? 2 : 1;
    return {
      totalCost: roundFixedTotal,
      perPlayerCost: aaPerPlayer,
      payMode: 'aa',
      totalRounds,
      baseScore,
      initialScore,
      stakeMultiplier: 1,
      description: `AA平摊 · 入场即扣 ${aaPerPlayer} 张/人（超时未开局自动退还）`,
    };
  }

  if (payMode === 'winner') {
    return {
      totalCost: roundFixedTotal,
      perPlayerCost: roundFixedTotal,
      payMode: 'winner',
      totalRounds,
      baseScore,
      initialScore,
      stakeMultiplier: 1,
      description: `大赢家支付 · 准入需持有 ${roundFixedTotal} 张（终局真人最高分实扣）`,
    };
  }

  const hostEntryCost = actionType === 'join_room' ? 0 : roundFixedTotal;
  return {
    totalCost: roundFixedTotal,
    perPlayerCost: hostEntryCost,
    payMode: 'host',
    totalRounds,
    baseScore,
    initialScore,
    stakeMultiplier: 1,
    description:
      actionType === 'join_room'
        ? `房主已付 (${roundFixedTotal}张) · 本次加入免扣房卡`
        : `房主支付 · 入场即扣 ${roundFixedTotal} 张（超时未开局自动退还）`,
  };
}

export interface RebuyOptionSpec {
  multiplier: 1 | 2;
  label: string;
  tag: string;
  cardCost: number;
  addedScore: number;
}

export function computeRebuyOptions(
  baseScore: number,
  initialScore: number
): [RebuyOptionSpec, RebuyOptionSpec] {
  const unitCardCost = calculateStakeTierRoomCardCost(baseScore, initialScore);
  const safeInit = Math.max(baseScore * 10, initialScore || baseScore * 20);
  return [
    {
      multiplier: 1,
      label: '标准补满初始分',
      tag: '推荐续战',
      cardCost: unitCardCost,
      addedScore: safeInit,
    },
    {
      multiplier: 2,
      label: '双倍超级加码',
      tag: '双倍筹码',
      cardCost: unitCardCost * 2,
      addedScore: safeInit * 2,
    },
  ];
}
