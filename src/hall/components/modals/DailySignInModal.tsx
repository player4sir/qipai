import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
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
}

const SIGN_IN_LADDER: SignInDayItem[] = [
  { day: 1, label: '第1天', beans: 1500 },
  { day: 2, label: '第2天', beans: 2500, roomCards: 2 },
  { day: 3, label: '第3天', beans: 3500 },
  { day: 4, label: '第4天', beans: 5000, roomCards: 3 },
  { day: 5, label: '第5天', beans: 6888 },
  { day: 6, label: '第6天', beans: 8888 },
  { day: 7, label: '第7天', beans: 18888, roomCards: 5 },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="relative flex max-h-[84dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">每日签到</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 7-Day Progressive Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {SIGN_IN_LADDER.map((item) => {
              const isCompleted = signedToday ? item.day <= streak : item.day < streak;
              const isCurrent = item.day === streak && !signedToday;

              return (
                <div
                  key={item.day}
                  className={`relative flex flex-col items-center justify-between rounded-xl border p-2.5 text-center transition-all ${
                    item.day === 7 ? 'col-span-2 sm:col-span-1' : ''
                  } ${
                    isCurrent
                      ? 'border-[#D4AF37]/45 bg-[#D4AF37]/[0.10] ring-1 ring-[#D4AF37]/35'
                      : isCompleted
                      ? 'border-white/[0.05] bg-white/[0.02] opacity-60'
                      : 'border-white/[0.07] bg-white/[0.03]'
                  }`}
                >
                  <span className="text-[11px] font-semibold text-[#9CA3AF]">{item.label}</span>

                  <div className="my-2 flex flex-col items-center gap-0.5">
                    <span className="font-mono text-xs font-bold text-[#FBBF24] whitespace-nowrap tabular-nums">
                      +{item.beans.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF]">积分</span>
                    {item.roomCards && (
                      <span className="mt-0.5 rounded border border-[#D4AF37]/30 bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#FBBF24] whitespace-nowrap">
                        +{item.roomCards}房卡
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-semibold ${
                      isCompleted
                        ? 'text-[#6B7280]'
                        : isCurrent
                        ? 'text-[#FBBF24]'
                        : 'text-[#6B7280]'
                    }`}
                  >
                    {isCompleted ? '已领取' : isCurrent ? '可领取' : '待解锁'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 min-w-[76px] rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleSignIn}
            className="h-8.5 min-w-[132px] rounded-lg bg-[#D49B35] hover:bg-[#E0A842] px-5 text-xs font-bold text-[#111315] transition-colors active:scale-98 cursor-pointer"
          >
            {signedToday ? '再次领取补给' : `领取第 ${streak} 天奖励`}
          </button>
        </div>
      </div>
    </div>
  );
};
