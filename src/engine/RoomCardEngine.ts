import { socketClient } from '../shared/network/SocketClient';
import {
  calculateRoomCardCost,
  calculateStakeTierRoomCardCost,
  COMMERCIAL_STAKE_PRESETS,
  computeRebuyOptions,
  CUSTOM_STAKES_LIMITS,
  type CommercialStakePreset,
  type CustomStakesValidationResult,
  type EscrowPhaseStatus,
  type RebuyOptionSpec,
  type RoomCardCostEvaluation,
  type RoomCardPayMode,
  type RoomRoundCount,
  validateCustomStakes,
} from '../shared/roomcard/RoomCardSystem';

export {
  calculateRoomCardCost,
  calculateStakeTierRoomCardCost,
  COMMERCIAL_STAKE_PRESETS,
  computeRebuyOptions,
  CUSTOM_STAKES_LIMITS,
  validateCustomStakes,
  type CommercialStakePreset,
  type CustomStakesValidationResult,
  type EscrowPhaseStatus,
  type RebuyOptionSpec,
  type RoomCardCostEvaluation,
  type RoomCardPayMode,
  type RoomRoundCount,
};

export interface ClientRoomCardEscrowSummary {
  roomId: string;
  gameType: string;
  baseScore: number;
  initialScore: number;
  totalRounds: number;
  currentRound: number;
  payMode: RoomCardPayMode;
  cardCostTotal: number;
  escrowState: EscrowPhaseStatus;
  status: 'waiting_first_round' | 'in_progress' | 'grand_settled' | 'disbanded_refunded';
}

/**
 * Client-side RoomCardEngine helper for Two-Phase Escrow (PRE_FREEZE -> COMMIT_DEDUCT / REFUND)
 * and Bankruptcy Protection Rebuy.
 */
export const clientRoomCardEngine = {
  validateCustomStakes,
  calculateRoomCardCost,
  calculateStakeTierRoomCardCost,
  computeRebuyOptions,

  /**
   * Triggers formal deduction (COMMIT_DEDUCT) of pre-frozen room cards upon starting Round 1 deal.
   */
  commitFirstRoundDeal(roomId: string): void {
    if (!roomId) return;
    socketClient.emit('c2s_rc_commit_deal', { roomId });
  },

  /**
   * Triggers pre-deal refund (REFUND) when leaving or disbanding before Round 1 cards are dealt,
   * or early Grand Settlement if rounds have already been played.
   */
  refundOrSettleRoom(roomId: string): void {
    if (!roomId) return;
    socketClient.emit('c2s_rc_disband_or_settle', { roomId });
  },

  /**
   * Executes commercial Bankruptcy Protection Rebuy: consumes room cards to replenish table score.
   */
  rebuyTableScore(roomId: string, multiplier: 1 | 2 = 1): void {
    if (!roomId) return;
    socketClient.emit('c2s_rc_rebuy', { roomId, multiplier });
  },
};
