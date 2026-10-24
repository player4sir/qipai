import React, { useState } from 'react';
import {
  Coins,
  Maximize2,
  Mic,
  Music,
  Puzzle,
  RefreshCw,
  Settings,
  Smartphone,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine, VoicePersona } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';

export interface SettingsModalProps {
  onClose: () => void;
  onOpenProfile?: () => void;
  onOpenPuzzle?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  myBeans?: number;
  onClaimSupply?: () => void;
  inTableMode?: boolean;
  onSwitchTable?: () => void;
}

const PERSONA_OPTIONS: Array<{
  id: VoicePersona;
  label: string;
}> = [
  { id: 'female', label: '温婉女声' },
  { id: 'male', label: '浑厚男声' },
  { id: 'yunnan', label: '地方方言' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  onClose,
  onOpenProfile,
  onOpenPuzzle,
  isFullscreen,
  onToggleFullscreen,
  myBeans = 100000,
  onClaimSupply,
  inTableMode = false,
  onSwitchTable,
}) => {
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    soundEngine.isEnabled()
  );
  const [bgmVolume, setBgmVolume] = useState<number>(() =>
    soundEngine.getBgmVolume()
  );
  const [sfxVolume, setSfxVolume] = useState<number>(() =>
    soundEngine.getSfxVolume()
  );
  const [voiceVolume, setVoiceVolume] = useState<number>(() =>
    soundEngine.getVoiceVolume()
  );
  const [voicePersona, setVoicePersona] = useState<VoicePersona>(() =>
    soundEngine.getVoicePersona()
  );
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() =>
    hapticEngine.isEnabled()
  );

  const handleToggleMaster = () => {
    const next = soundEngine.toggle();
    setSoundEnabled(next);
  };

  const handleBgmChange = (val: number) => {
    setBgmVolume(val);
    soundEngine.setBgmVolume(val);
    setSoundEnabled(soundEngine.isEnabled());
  };

  const handleSfxChange = (val: number) => {
    setSfxVolume(val);
    soundEngine.setSfxVolume(val);
    setSoundEnabled(soundEngine.isEnabled());
  };

  const handleVoiceChange = (val: number) => {
    setVoiceVolume(val);
    soundEngine.setVoiceVolume(val);
    setSoundEnabled(soundEngine.isEnabled());
  };

  const handleSelectPersona = (persona: VoicePersona) => {
    setVoicePersona(persona);
    soundEngine.setVoicePersona(persona, true);
  };

  const handleToggleHaptic = () => {
    const next = hapticEngine.toggle();
    setHapticEnabled(next);
    soundEngine.playTap(next ? 780 : 620);
  };

  return (
    <CommercialModalShell
      title="游戏设置"
      subtitle="音量调节 · 报牌音色 · 触感反馈"
      icon={<Settings className="h-4.5 w-4.5" />}
      size="sm"
      zIndexClass="z-[95]"
      onClose={onClose}
    >
      <div className="space-y-3">
        {/* 1. Compact Audio Volume Sliders */}
        <div className="space-y-2.5 rounded-xl border border-[#E8E1D0] bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[#2C1E10]">声音控制</span>
            <button
              type="button"
              onClick={handleToggleMaster}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-black transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                soundEnabled
                  ? 'border-[#0D9488]/40 bg-[#F0FDFA] text-[#0F766E]'
                  : 'border-rose-300 bg-rose-50 text-rose-700'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-[#0D9488]" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-rose-600" />
              )}
              <span>{soundEnabled ? '声音已开启' : '全部静音'}</span>
            </button>
          </div>

          {/* BGM Row */}
          <div className="flex items-center gap-2.5 text-xs">
            <span className="flex w-20 shrink-0 items-center gap-1.5 font-bold text-[#334155]">
              <Music className="h-3.5 w-3.5 text-[#D97706] shrink-0" />
              <span>背景音乐</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={soundEnabled ? bgmVolume : 0}
              onChange={(e) => handleBgmChange(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[#EAE3D5] accent-[#D97706]"
            />
            <span className="w-9 shrink-0 text-right font-mono font-black text-[#B45309] tabular-nums">
              {soundEnabled ? `${Math.round(bgmVolume * 100)}%` : '0%'}
            </span>
          </div>

          {/* SFX Row */}
          <div className="flex items-center gap-2.5 text-xs">
            <span className="flex w-20 shrink-0 items-center gap-1.5 font-bold text-[#334155]">
              <Volume2 className="h-3.5 w-3.5 text-[#0D9488] shrink-0" />
              <span>游戏音效</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={soundEnabled ? sfxVolume : 0}
              onChange={(e) => handleSfxChange(Number(e.target.value))}
              onMouseUp={() => soundEngine.playTap(760)}
              onTouchEnd={() => soundEngine.playTap(760)}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[#EAE3D5] accent-[#0D9488]"
            />
            <span className="w-9 shrink-0 text-right font-mono font-black text-[#0F766E] tabular-nums">
              {soundEnabled ? `${Math.round(sfxVolume * 100)}%` : '0%'}
            </span>
          </div>

          {/* Voice Row */}
          <div className="flex items-center gap-2.5 text-xs">
            <span className="flex w-20 shrink-0 items-center gap-1.5 font-bold text-[#334155]">
              <Mic className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
              <span>报牌语音</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={soundEnabled ? voiceVolume : 0}
              onChange={(e) => handleVoiceChange(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-lg bg-[#EAE3D5] accent-[#0284C7]"
            />
            <span className="w-9 shrink-0 text-right font-mono font-black text-[#0369A1] tabular-nums">
              {soundEnabled ? `${Math.round(voiceVolume * 100)}%` : '0%'}
            </span>
          </div>
        </div>

        {/* 2. Voice Persona & Haptic Feedback */}
        <div className="space-y-2.5 rounded-xl border border-[#E8E1D0] bg-white p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold text-[#2C1E10]">报牌语音音色</span>
            <button
              type="button"
              onClick={handleToggleHaptic}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hapticEnabled
                  ? 'border-[#0284C7]/40 bg-[#F0F9FF] text-[#0369A1]'
                  : 'border-[#E8E1D0] bg-[#FAF8F3] text-[#5A6572]'
              }`}
            >
              <Smartphone className="h-3 w-3 text-[#0284C7]" />
              <span>震动: {hapticEnabled ? '开' : '关'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {PERSONA_OPTIONS.map((item) => {
              const active = voicePersona === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectPersona(item.id)}
                  className={`flex h-9 items-center justify-center rounded-xl border text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#F59E0B] bg-[#FFFBEB] text-[#B45309] shadow-2xs'
                      : 'border-[#E8E1D0] bg-[#FAF8F3] text-[#5A6572] hover:bg-[#F3EFE6] hover:text-[#1E242B]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Compact Action Row */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-3.5 text-xs font-extrabold text-[#334155] shadow-2xs hover:bg-[#FAF8F3] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Maximize2 className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>{isFullscreen ? '退出全屏' : '全屏显示'}</span>
            </button>
          )}

          {inTableMode ? (
            onSwitchTable && (
              <button
                type="button"
                onClick={() => {
                  onSwitchTable();
                  onClose();
                }}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-4 text-xs font-black text-[#B45309] hover:bg-[#FEF3C7] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#D97706]" />
                <span>换桌重配</span>
              </button>
            )
          ) : (
            <>
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProfile();
                  }}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-3.5 text-xs font-extrabold text-[#334155] shadow-2xs hover:bg-[#FAF8F3] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <User className="h-3.5 w-3.5 text-[#D97706]" />
                  <span>形象设置</span>
                </button>
              )}

              {onOpenPuzzle && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPuzzle();
                  }}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#D8CEB8] bg-white px-3.5 text-xs font-extrabold text-[#334155] shadow-2xs hover:bg-[#FAF8F3] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Puzzle className="h-3.5 w-3.5 text-[#0D9488]" />
                  <span>残局闯关</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </CommercialModalShell>
  );
};
