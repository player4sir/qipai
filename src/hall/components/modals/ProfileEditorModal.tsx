import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AvatarSvg, SPINE_CHARACTER_LIST } from '../../../shared/ui/AvatarSvg';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';

export interface ProfileEditorModalProps {
  initialNickname: string;
  initialAvatarId: string;
  onClose: () => void;
  onSave: (nickname: string, avatarId: string) => void;
}

export const ProfileEditorModal: React.FC<ProfileEditorModalProps> = ({
  initialNickname,
  initialAvatarId,
  onClose,
  onSave,
}) => {
  const [nicknameDraft, setNicknameDraft] = useState<string>(initialNickname);
  const [avatarDraft, setAvatarDraft] = useState<string>(initialAvatarId);

  const selectedCharMeta =
    SPINE_CHARACTER_LIST.find((c) => c.id === avatarDraft) ?? SPINE_CHARACTER_LIST[0];

  const handleSelectChar = (charId: string) => {
    soundEngine.playTap(780);
    hapticEngine.tap();
    setAvatarDraft(charId);

    const char = SPINE_CHARACTER_LIST.find((c) => c.id === charId);
    if (char) {
      soundEngine.speak(char.voiceLine);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] animate-in fade-in duration-150 select-none">
      <div
        className="flex max-h-[84dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <h3 className="text-sm sm:text-base font-bold text-[#F3F4F6]">个人资料设置</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭面板"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto overscroll-contain p-4 sm:p-5">
          {/* Nickname Input */}
          <div>
            <label className="text-xs font-medium text-[#9CA3AF]">玩家昵称</label>
            <input
              type="text"
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              maxLength={14}
              placeholder="输入昵称"
              className="mt-1.5 h-9 w-full rounded-lg border border-white/12 bg-black/40 px-3 text-xs font-semibold text-[#F3F4F6] placeholder:text-[#6B7280] focus:border-[#D49B35] focus:outline-none"
            />
          </div>

          {/* Character selection */}
          <div>
            <label className="text-xs font-medium text-[#9CA3AF]">选择出战形象</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SPINE_CHARACTER_LIST.map((ch) => {
                const active = avatarDraft === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChar(ch.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-xl border p-2.5 transition-all active:scale-98 cursor-pointer ${
                      active
                        ? 'border-[#D4AF37]/45 bg-[#D4AF37]/[0.10] ring-1 ring-[#D4AF37]/35'
                        : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <AvatarSvg avatarId={ch.id} size={38} animState={active ? 'win' : 'idle'} />
                    <span className="text-xs font-bold text-[#F3F4F6]">{ch.name}</span>
                    <span className="text-[10px] text-[#9CA3AF] truncate max-w-full">
                      {ch.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected character voice line preview */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5 text-xs">
            <span className="text-[#D1D5DB] truncate">
              台词：“{selectedCharMeta.voiceLine}”
            </span>
            <button
              type="button"
              onClick={() => soundEngine.speak(selectedCharMeta.voiceLine)}
              className="ml-2 shrink-0 font-semibold text-[#FBBF24] hover:text-[#FDE68A] cursor-pointer"
            >
              试听语音
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2.5 border-t border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="h-8.5 min-w-[80px] rounded-lg border border-white/12 bg-white/[0.06] hover:bg-white/[0.11] px-3.5 text-xs font-semibold text-[#E5E7EB] transition-colors active:scale-98 cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(nicknameDraft.trim() || initialNickname, avatarDraft);
              onClose();
            }}
            className="h-8.5 min-w-[96px] rounded-lg bg-[#D49B35] hover:bg-[#E0A842] px-4 text-xs font-bold text-[#111315] transition-colors active:scale-98 cursor-pointer"
          >
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};
