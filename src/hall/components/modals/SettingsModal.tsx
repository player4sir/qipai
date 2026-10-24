import React, { useState } from 'react';
import {
  Brain,
  Edit3,
  Maximize2,
  Minimize2,
  Music,
  Plus,
  Settings,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,580px)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border-2 border-amber-300/40 bg-gradient-to-b from-[#331e12] via-[#24140b] to-[#170c06] p-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.75)] sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-amber-200/15 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-500/20 text-amber-300">
              <Settings className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-display text-base font-extrabold text-amber-100">
                游戏系统设置
              </h3>
              <p className="text-[11px] text-amber-200/60">
                音量调节、全屏显示与角色档案管理
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Setting Items */}
        <div className="mt-3 flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain pr-0.5">
          {/* Universal Room Card Account Balance & Supply */}
          {typeof myBeans === 'number' && (
            <div className="flex items-center justify-between rounded-2xl border border-amber-300/25 bg-black/40 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <img
                  src="/assets/ui/icon_fangka.png"
                  alt="房卡"
                  className="h-5 w-5 shrink-0 object-contain drop-shadow"
                />
                <div>
                  <div className="text-xs font-bold text-amber-100">账户通用房卡</div>
                  <div className="font-mono text-xs font-black text-amber-300 tabular-nums">
                    {myBeans.toLocaleString()} 张
                  </div>
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
                  className="flex items-center gap-1 rounded-full border border-amber-200/80 bg-gradient-to-b from-[#ffe082] via-[#f59e0b] to-[#d97706] px-3 py-1 text-xs font-extrabold text-[#1f0f05] shadow hover:brightness-110 active:scale-95 cursor-pointer"
                >
                  <Plus className="h-3 w-3 stroke-[3]" />
                  <span>免费领卡</span>
                </button>
              )}
            </div>
          )}

          {/* BGM Row + Slider */}
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-amber-300" />
                <div>
                  <div className="text-xs font-bold text-white">背景音乐</div>
                  <div className="text-[10px] text-white/50">大厅迎宾与对局国风配乐</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleBgm}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors cursor-pointer ${
                  bgmEnabled ? 'bg-emerald-500 text-[#0f172a]' : 'bg-white/10 text-white/60'
                }`}
              >
                {bgmEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            {bgmEnabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[10px] text-white/60">音量</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={bgmVolume}
                  onChange={(e) => handleChangeBgmVol(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-amber-400 rounded-lg cursor-pointer bg-white/20"
                />
                <span className="font-mono text-xs font-bold text-amber-300 w-8 text-right">
                  {bgmVolume}%
                </span>
              </div>
            )}
          </div>

          {/* SFX Row + Slider */}
          <div className="rounded-2xl border border-white/10 bg-black/35 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {sfxEnabled ? (
                  <Volume2 className="h-4 w-4 text-amber-300" />
                ) : (
                  <VolumeX className="h-4 w-4 text-rose-400" />
                )}
                <div>
                  <div className="text-xs font-bold text-white">游戏音效与语音</div>
                  <div className="text-[10px] text-white/50">出牌声响与角色真人配音</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleSfx}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors cursor-pointer ${
                  sfxEnabled ? 'bg-emerald-500 text-[#0f172a]' : 'bg-white/10 text-white/60'
                }`}
              >
                {sfxEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            {sfxEnabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-[10px] text-white/60">音量</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sfxVolume}
                  onChange={(e) => handleChangeSfxVol(Number(e.target.value))}
                  className="h-1.5 flex-1 accent-amber-400 rounded-lg cursor-pointer bg-white/20"
                />
                <span className="font-mono text-xs font-bold text-amber-300 w-8 text-right">
                  {sfxVolume}%
                </span>
              </div>
            )}
          </div>

          {/* Haptics & Fullscreen Row */}
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-amber-300" />
                <div>
                  <div className="text-xs font-bold text-white">触感震动反馈</div>
                  <div className="text-[10px] text-white/50">选牌与炸弹触感特效</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleHaptic}
                className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors cursor-pointer ${
                  hapticEnabled ? 'bg-emerald-500 text-[#0f172a]' : 'bg-white/10 text-white/60'
                }`}
              >
                {hapticEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            {onToggleFullscreen && (
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/35 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4 text-amber-300" />
                  ) : (
                    <Maximize2 className="h-4 w-4 text-amber-300" />
                  )}
                  <div>
                    <div className="text-xs font-bold text-white">沉浸全屏显示</div>
                    <div className="text-[10px] text-white/50">最大化棋牌大厅视野</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTap(720);
                    hapticEngine.tap();
                    onToggleFullscreen();
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors cursor-pointer ${
                    isFullscreen
                      ? 'bg-amber-400 text-[#18181B]'
                      : 'bg-white/10 text-amber-200 hover:bg-white/20'
                  }`}
                >
                  {isFullscreen ? '退出全屏' : '开启全屏'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenProfile();
            }}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-amber-400/40 bg-amber-500/15 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25 active:scale-95 cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>角色资料</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPuzzle();
            }}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-sky-400/40 bg-sky-500/15 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25 active:scale-95 cursor-pointer"
          >
            <Brain className="h-3.5 w-3.5" />
            <span>残局闯关</span>
          </button>
        </div>

        <div className="mt-3 flex justify-center">
          <PWAInstallButton />
        </div>
      </div>
    </div>
  );
};

