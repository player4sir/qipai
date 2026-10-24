import React, { useEffect, useState } from 'react';
import { CheckCircle2, Gift, X } from 'lucide-react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface DailySignInModalProps {
  onClose: () => void;
  onClaimSupply: () => void;
}

interface SignInDayItem {
  day: number;
  label: string;
  beans: number;
  roomCards?: number;
  specialChest?: boolean;
}

const SIGN_IN_LADDER: SignInDayItem[] = [
  { day: 1, label: '第1天', beans: 1500 },
  { day: 2, label: '第2天', beans: 2500, roomCards: 2 },
  { day: 3, label: '第3天', beans: 3500 },
  { day: 4, label: '第4天', beans: 5000, roomCards: 3 },
  { day: 5, label: '第5天', beans: 6888 },
  { day: 6, label: '第6天', beans: 8888 },
  { day: 7, label: '第7天', beans: 18888, specialChest: true },
];

export const DailySignInModal: React.FC<DailySignInModalProps> = ({
  onClose,
  onClaimSupply,
}) => {
  const [streak, setStreak] = useState<number>(1);
  const [signedToday, setSignedToday] = useState<boolean>(false);

  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastDate = localStorage.getItem('h5_signin_last_date');
    const savedStreak = parseInt(localStorage.getItem('h5_signin_streak') || '1', 10);

    if (lastDate === todayStr) {
      setSignedToday(true);
      setStreak(savedStreak);
    } else if (lastDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      if (lastDate === yesterdayStr) {
        setStreak(savedStreak < 7 ? savedStreak + 1 : 1);
      } else {
        setStreak(1);
      }
      setSignedToday(false);
    } else {
      setStreak(1);
      setSignedToday(false);
    }
  }, []);

  const handleSignIn = () => {
    soundEngine.playChestOpen();
    hapticEngine.tap();
    const todayStr = new Date().toISOString().slice(0, 10);
    localStorage.setItem('h5_signin_last_date', todayStr);
    localStorage.setItem('h5_signin_streak', String(streak));
    setSignedToday(true);
    onClaimSupply();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(90dvh,580px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-[#2e1507] via-[#1b0c04] to-[#120703] p-4 text-white shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative Golden Ambient Burst */}
        <div
          className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-amber-500/15 blur-2xl"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(245,158,11,0.2) 0%, transparent 70%)' }}
        />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-amber-400/20 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/25 text-amber-300">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-black text-amber-200 sm:text-lg">
                每日福禄签到
              </h3>
              <p className="text-[11px] text-amber-100/60">
                连续签到 7 天升级大礼包，通用房卡与初始积分福利每日赠送
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 7-Day Progressive Grid */}
        <div className="mt-3.5 grid flex-1 min-h-0 grid-cols-4 gap-2 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-7 sm:gap-2">
          {SIGN_IN_LADDER.map((item) => {
            const isCompleted = signedToday ? item.day <= streak : item.day < streak;
            const isCurrent = item.day === streak && !signedToday;

            return (
              <div
                key={item.day}
                className={`relative flex flex-col items-center justify-between rounded-2xl border p-2 text-center transition-all ${
                  item.day === 7 ? 'col-span-2 sm:col-span-1' : ''
                } ${
                  isCurrent
                    ? 'border-amber-300 bg-amber-500/25 ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.35)] scale-102'
                    : isCompleted
                    ? 'border-white/10 bg-black/40 opacity-70'
                    : 'border-white/10 bg-black/30'
                }`}
              >
                <span className="text-[10px] font-bold text-amber-200/90">{item.label}</span>

                <div className="my-1 flex flex-col items-center">
                  <Gift className="h-5 w-5 text-amber-300" />
                  <span className="font-mono text-[10px] font-extrabold text-amber-300 whitespace-nowrap">
                    +{item.beans.toLocaleString()}
                  </span>
                  {item.roomCards && (
                    <span className="rounded bg-amber-400/20 px-1 text-[8px] font-bold text-amber-200">
                      房卡×{item.roomCards}
                    </span>
                  )}
                </div>

                {/* Claimed Official Stamp */}
                {isCompleted && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <img
                      src="/assets/ui/stamp_claimed.png"
                      alt="已领取"
                      className="h-10 w-10 object-contain rotate-[-15deg] opacity-90 drop-shadow"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 py-2.5 font-display text-sm font-black text-[#18181B] shadow-lg hover:brightness-105 active:scale-95"
          >
            <CheckCircle2 className="h-4.5 w-4.5" />
            <span>
              {signedToday
                ? `今日第 ${streak} 天已签 · 点击再次领取免费补给`
                : `立即签到领取第 ${streak} 天奖励`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
