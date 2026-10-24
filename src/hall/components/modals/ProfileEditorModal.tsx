import React, { useState } from 'react';
import { Check, UserCheck } from 'lucide-react';
import { AVATAR_OPTIONS, AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';

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
  const [nickname, setNickname] = useState(initialNickname);
  const [avatarId, setAvatarId] = useState(initialAvatarId);

  return (
    <CommercialModalShell
      title="个人形象设置"
      subtitle="自定义牌桌昵称与专属角色头像"
      icon={<UserCheck className="h-4.5 w-4.5" />}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              if (nickname.trim()) {
                onSave(nickname.trim(), avatarId);
                onClose();
              }
            }}
            className="flex h-10 min-w-[180px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-8 text-xs sm:text-sm font-black text-white shadow-xs hover:brightness-105 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>保存形象</span>
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
          <label className="mb-1.5 block text-xs font-extrabold text-[#2C1E10]">
            玩家昵称（最多 12 个字）
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
            className="h-9 w-full rounded-xl border border-[#D8CEB8] bg-[#FAF8F3] px-3 text-xs sm:text-sm font-bold text-[#1E242B] focus:border-[#D97706] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="rounded-xl border border-[#E8E1D0] bg-white p-3 shadow-2xs">
          <label className="mb-2 block text-xs font-extrabold text-[#2C1E10]">
            选择专属形象头像
          </label>
          <div className="grid grid-cols-4 gap-2">
            {AVATAR_OPTIONS.map((opt) => {
              const active = avatarId === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAvatarId(opt.id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2 transition-all cursor-pointer ${
                    active
                      ? 'border-[#F59E0B] bg-[#FFFBEB] ring-2 ring-[#F59E0B]/30 shadow-2xs'
                      : 'border-[#E8E1D0] bg-[#FAF8F3] hover:bg-white'
                  }`}
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[#DEC99A] bg-white">
                    <AvatarSvg avatarId={opt.id} />
                  </div>
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap ${
                      active ? 'text-[#B45309]' : 'text-[#5A6572]'
                    }`}
                  >
                    {opt.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </CommercialModalShell>
  );
};
