import React, { useState } from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { PWAInstallButton } from '../../../shared/pwa/PWAInstallButton';

export interface SettingsModalProps {
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenPuzzle: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  myBeans?: number;
  onClaimSupply?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onOpenProfile,
  onOpenPuzzle,
  isFullscreen = false,
  onToggleFullscreen,
  myBeans,
  onClaimSupply,
}) => {
  const [bgmEnabled, setBgmEnabled] = useState<boolean>(soundEngine.isBgmEnabled());
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(soundEngine.isEnabled());
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(hapticEngine.isEnabled());
  const [bgmVolume, setBgmVolume] = useState<number>(Math.round(soundEngine.getBgmVolume() * 100));
  const [sfxVolume, setSfxVolume] = useState<number>(Math.round(soundEngine.getSfxVolume() * 100));

  const handleToggleBgm = () => {
    setBgmEnabled(soundEngine.toggleBgm());
  };

  const handleToggleSfx = () => {
    setSfxEnabled(soundEngine.toggle());
  };

  const handleToggleHaptic = () => {
    setHapticEnabled(hapticEngine.toggle());
  };

  const handleChangeBgmVol = (val: number) => {
    setBgmVolume(val);
    soundEngine.setBgmVolume(val / 100);
  };

  const handleChangeSfxVol = (val: number) => {
    setSfxVolume(val);
    soundEngine.setSfxVolume(val / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex max-h-[84dvh] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">系统设置</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Setting Items */}
        <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {/* Room Card Balance */}
          {typeof myBeans === 'number' && (
            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5">
              <div>
                <div className="text-xs font-medium text-[#9CA3AF]">通用房卡余额</div>
                <div className="mt-0.5 font-mono text-sm font-bold text-[#FBBF24] tabular-nums">
                  {myBeans.toLocaleString()} 张
                </div>
              </div>
              {onClaimSupply && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playPowerChime(2);
                    hapticEngine.tap();
                    onClaimSupply();
                  }}
                  className="h-8 rounded-lg bg-[#D49B35] hover:bg-[#E0A842] px-3.5 text-xs font-bold text-[#111315] transition-colors active:scale-98 cursor-pointer"
                >
                  免费补充
                </button>
              )}
            </div>
          )}

          {/* BGM Row + Slider */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#E5E7EB]">背景音乐</span>
              <button
                type="button"
                onClick={handleToggleBgm}
                className={`h-7 min-w-[56px] rounded-lg px-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  bgmEnabled
                    ? 'bg-[#D49B35] text-[#111315]'
                    : 'border border-white/12 bg-white/[0.06] text-[#9CA3AF]'
                }`}
              >
                {bgmEnabled ? '开启' : '关闭'}
              </button>
            </div>

            {bgmEnabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[11px] text-[#9CA3AF]">音量</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgmVolume}
                  onChange={(e) => handleChangeBgmVol(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-[#D49B35] rounded-lg cursor-pointer bg-white/15"
                />
                <span className="font-mono text-xs font-semibold text-[#E5E7EB] w-8 text-right tabular-nums">
                  {bgmVolume}%
                </span>
              </div>
            )}
          </div>

          {/* SFX Row + Slider */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#E5E7EB]">游戏音效与语音</span>
              <button
                type="button"
                onClick={handleToggleSfx}
                className={`h-7 min-w-[56px] rounded-lg px-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  sfxEnabled
                    ? 'bg-[#D49B35] text-[#111315]'
                    : 'border border-white/12 bg-white/[0.06] text-[#9CA3AF]'
                }`}
              >
                {sfxEnabled ? '开启' : '关闭'}
              </button>
            </div>

            {sfxEnabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[11px] text-[#9CA3AF]">音量</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sfxVolume}
                  onChange={(e) => handleChangeSfxVol(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-[#D49B35] rounded-lg cursor-pointer bg-white/15"
                />
                <span className="font-mono text-xs font-semibold text-[#E5E7EB] w-8 text-right tabular-nums">
                  {sfxVolume}%
                </span>
              </div>
            )}
          </div>

          {/* Haptics & Fullscreen Row */}
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5">
              <span className="text-xs font-semibold text-[#E5E7EB]">触感震动</span>
              <button
                type="button"
                onClick={handleToggleHaptic}
                className={`h-7 min-w-[56px] rounded-lg px-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  hapticEnabled
                    ? 'bg-[#D49B35] text-[#111315]'
                    : 'border border-white/12 bg-white/[0.06] text-[#9CA3AF]'
                }`}
              >
                {hapticEnabled ? '开启' : '关闭'}
              </button>
            </div>

            {onToggleFullscreen && (
              <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-xs font-semibold text-[#E5E7EB]">全屏显示</span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTap(720);
                    hapticEngine.tap();
                    onToggleFullscreen();
                  }}
                  className="h-7 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors cursor-pointer"
                >
                  {isFullscreen ? '退出全屏' : '开启全屏'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Shortcuts */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProfile();
              }}
              className="h-8 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
            >
              个人资料
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPuzzle();
              }}
              className="h-8 rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
            >
              残局闯关
            </button>
          </div>

          <PWAInstallButton />
        </div>
      </div>
    </div>
  );
};
