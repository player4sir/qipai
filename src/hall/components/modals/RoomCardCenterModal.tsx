import React, { useState } from 'react';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import {
  roomCardSessionHub,
  useRoomCardSession,
} from '../../../shared/control/RoomCardSessionHub';
import { soundEngine } from '../../../shared/audio/SoundEngine';

interface RoomCardCenterModalProps {
  open: boolean;
  onClose: () => void;
  onClaimPack?: (cardCount: number) => void;
  onOpenFriendRoom: () => void;
}

const SUPPLY_PACKS = [
  { id: 'pack_5', cards: 5, label: '轻量约局包', desc: '4~8局好友体验' },
  { id: 'pack_15', cards: 15, label: '标准约局包', desc: '多局连打畅玩' },
  { id: 'pack_50', cards: 50, label: '俱乐部尊享包', desc: '五款游戏通用' },
];

export const RoomCardCenterModal: React.FC<RoomCardCenterModalProps> = ({
  open,
  onClose,
  onClaimPack,
  onOpenFriendRoom,
}) => {
  const { store, balance, frozenBalance } = useRoomCardSession();
  const canClaimDaily = roomCardSessionHub.canClaimDailyGift();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const showFeedback = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => {
      setNotice((prev) => (prev?.text === text ? null : prev));
    }, 2400);
  };

  const handleClaimDaily = () => {
    soundEngine.playTap(740);
    const res = roomCardSessionHub.claimDailyRoomCards();
    if (res.ok && res.added > 0) {
      onClaimPack?.(res.added);
    }
    showFeedback(res.ok, res.message);
  };

  const handleClaimSupplyPackage = (cardCount: number, label: string) => {
    soundEngine.playTap(740);
    const res = roomCardSessionHub.claimCardSupplyPack(cardCount, label);
    if (res.ok) {
      onClaimPack?.(cardCount);
    }
    showFeedback(res.ok, res.message);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`;
  };

  return (
    <CommercialModalShell
      open={open}
      onClose={onClose}
      title="我的房卡"
      size="md"
    >
      <div className="space-y-3">
        {notice && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-between ${
              notice.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className="truncate">{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[11px] underline shrink-0 ml-3 cursor-pointer"
            >
              关闭
            </button>
          </div>
        )}

        {/* 1. Adaptive Top Balance & Action Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
          <div className="sm:col-span-6 flex items-baseline justify-between sm:justify-start gap-2.5">
            <div className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-xs font-bold text-slate-500">可用</span>
              <span className="text-2xl font-black font-mono tabular-nums text-slate-900">
                {balance}
              </span>
              <span className="text-xs font-bold text-slate-500">张</span>
            </div>
            {frozenBalance > 0 ? (
              <span className="text-xs text-amber-600 font-bold font-mono tabular-nums whitespace-nowrap">
                托管冻结 {frozenBalance} 张
              </span>
            ) : (
              <span className="text-xs text-slate-400 whitespace-nowrap">
                积分计分 · 零和结算
              </span>
            )}
          </div>

          <div className="sm:col-span-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!canClaimDaily}
              onClick={handleClaimDaily}
              className={`h-8 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                !canClaimDaily
                  ? 'bg-slate-200/80 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {!canClaimDaily ? '今日已领' : '每日领 3 张'}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                onClose();
                onOpenFriendRoom();
              }}
              className="h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
            >
              好友约局
            </button>
          </div>
        </div>

        {/* 2. Flat 3-Column Room Card Supply Grid */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-xs font-bold text-slate-700">房卡补给礼盒</span>
            <span className="text-[11px] text-slate-400">五款游戏通用</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SUPPLY_PACKS.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-xl p-2.5 border border-slate-200 bg-white flex flex-col items-center justify-between gap-1.5"
              >
                <div className="text-center">
                  <div className="text-sm font-black font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    +{pkg.cards} 张房卡
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {pkg.label}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleClaimSupplyPackage(pkg.cards, pkg.label)}
                  className="w-full h-7 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
                >
                  免费申领
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Flat Single-Line Ledger */}
        <div>
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-xs font-bold text-slate-700">最近明细</span>
            <span className="text-[11px] text-slate-400">未开局解散退卡</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-32 overflow-y-auto px-3">
            {store.ledger.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">
                暂无房卡记录
              </div>
            ) : (
              store.ledger.slice(0, 10).map((entry) => {
                const isPlus = entry.deltaCards > 0;
                const isCapture = entry.reason === 'ESCROW_CAPTURE' || entry.deltaCards === 0;
                return (
                  <div
                    key={entry.id}
                    className="py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-slate-700 truncate">{entry.note}</span>
                    <div className="flex items-center gap-2.5 shrink-0 font-mono tabular-nums whitespace-nowrap">
                      <span className="text-[11px] text-slate-400">
                        {formatTime(entry.timestamp)}
                      </span>
                      <span
                        className={`w-14 text-right font-bold ${
                          isPlus
                            ? 'text-emerald-600'
                            : isCapture
                            ? 'text-amber-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {isCapture
                          ? '已划扣'
                          : isPlus
                          ? `+${entry.deltaCards}`
                          : entry.deltaCards}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </CommercialModalShell>
  );
};
