import React, { useState } from 'react';
import { Sparkles, Volume2, X } from 'lucide-react';
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90dvh,580px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-amber-400/45 bg-[#1b0e07] p-4 text-white shadow-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 pb-2.5">
          <span className="font-display text-base font-extrabold text-amber-200">
            玩家形象与国潮角色出战管理
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-amber-200/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3.5 flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
          {/* Nickname Input */}
          <div>
            <label className="text-xs font-semibold text-amber-200">修改玩家昵称：</label>
            <input
              type="text"
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              maxLength={14}
              placeholder="输入新昵称"
              className="mt-1 w-full rounded-xl border border-amber-400/35 bg-[#0f0703] px-3 py-2 text-xs text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Character selection */}
          <div>
            <label className="text-xs font-semibold text-amber-200">出战国潮角色（点击试听台词语音）：</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {SPINE_CHARACTER_LIST.map((ch) => {
                const active = avatarDraft === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleSelectChar(ch.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-2xl border p-2 transition-all active:scale-95 ${
                      active
                        ? 'border-amber-400 bg-amber-500/25 ring-2 ring-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                        : 'border-white/10 bg-black/35 opacity-75 hover:opacity-100 hover:border-white/25'
                    }`}
                  >
                    {/* Rarity Badge */}
                    <span
                      className={`absolute top-1 left-1.5 rounded-full px-1.5 py-0.2 font-mono text-[9px] font-black shadow-xs ${
                        ch.rarity === 'SSR'
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {ch.rarity}
                    </span>

                    <AvatarSvg avatarId={ch.id} size={38} animState={active ? 'win' : 'idle'} />
                    <span className="text-xs font-bold text-white">{ch.name}</span>
                    <span className="text-[10px] text-amber-300/80 truncate max-w-full">
                      {ch.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected character voice & skill spotlight banner */}
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs">
            <div className="flex items-center justify-between text-amber-300 font-bold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>绝技：{selectedCharMeta.signatureSkill}</span>
              </span>
              <button
                type="button"
                onClick={() => soundEngine.speak(selectedCharMeta.voiceLine)}
                className="flex items-center gap-1 text-[11px] text-amber-200/80 hover:text-amber-200 underline"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>重听</span>
              </button>
            </div>
            <p className="mt-1 text-[11px] text-white/75 italic">
              “{selectedCharMeta.voiceLine}”
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-4 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-amber-400/25 px-4 py-2 text-xs font-semibold text-amber-200/80 hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(nicknameDraft.trim() || initialNickname, avatarDraft);
              onClose();
            }}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-xs font-black text-[#18181B] shadow hover:brightness-105 active:scale-95"
          >
            保存出战形象
          </button>
        </div>
      </div>
    </div>
  );
};
