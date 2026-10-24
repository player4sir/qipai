import React, { useState } from 'react';
import { CalendarCheck, CheckCircle2, Gift, Ticket } from 'lucide-react';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { roomCardSessionHub } from '../../../shared/control/RoomCardSessionHub';

export interface DailySignInModalProps {
  onClose: () => void;
  onClaimSupply: () => void;
}

const DAILY_CARD_REWARDS = [2, 3, 3, 5, 5, 8, 12];

export const DailySignInModal: React.FC<DailySignInModalProps> = ({
  onClose,
  onClaimSupply,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [claimed, setClaimed] = useState<boolean>(
    () => localStorage.getItem('h5_signin_last_date') === today
  );

  return (
    <CommercialModalShell
      title="每日签到领房卡"
      subtitle="每日登录即可免费领取通用约局房卡"
      icon={<CalendarCheck className="h-4.5 w-4.5" />}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            disabled={claimed}
            onClick={() => {
              localStorage.setItem('h5_signin_last_date', today);
              setClaimed(true);
              roomCardSessionHub.claimCardSupplyPack(3, '每日签到福利');
              onClaimSupply();
            }}
            className={`flex h-10 min-w-[180px] items-center justify-center gap-2 rounded-xl px-8 text-xs sm:text-sm font-black shadow-xs transition-all whitespace-nowrap shrink-0 ${
              claimed
                ? 'border border-[#E2D8C5] bg-[#EAE3D5] text-[#8C96A4] cursor-not-allowed'
                : 'bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-white hover:brightness-105 active:scale-95 cursor-pointer'
            }`}
          >
            {claimed ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Gift className="h-4 w-4" />
            )}
            <span>{claimed ? '今日已签到' : '立即签到领房卡'}</span>
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-4 gap-2">
        {DAILY_CARD_REWARDS.map((cards, idx) => {
          const isGrandDay = idx === 6;
          return (
            <div
              key={idx}
              className={`flex h-16 flex-col items-center justify-center rounded-xl border px-2 transition-all ${
                isGrandDay
                  ? 'col-span-2 border-[#F59E0B] bg-gradient-to-b from-[#FFFBEB] to-[#FEF3C7] shadow-2xs'
                  : 'border-[#E8E1D0] bg-white shadow-2xs'
              }`}
            >
              <span className="text-[11px] font-bold text-[#6E5A44] whitespace-nowrap">
                第 {idx + 1} 天{isGrandDay ? ' · 豪华礼' : ''}
              </span>
              <div className="mt-1 flex items-center gap-1 font-mono text-xs sm:text-sm font-black text-[#D97706] tabular-nums">
                <Ticket className="h-3.5 w-3.5 text-[#F59E0B] shrink-0" />
                <span>+{cards} 张房卡</span>
              </div>
            </div>
          );
        })}
      </div>
    </CommercialModalShell>
  );
};
