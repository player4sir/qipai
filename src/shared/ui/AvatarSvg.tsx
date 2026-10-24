import React from 'react';

const AVATAR_IMAGE_MAP: Record<string, string> = {
  dizhu: '/assets/ui/avatar_dizhu.png',
  dizhupo: '/assets/ui/avatar_dizhupo.png',
  nongmin: '/assets/ui/avatar_nongmin.png',
  nongminmei: '/assets/ui/avatar_nongminmei.png',
  beier: '/assets/ui/avatar_nongminmei.png',
  heroine: '/assets/ui/avatar_dizhupo.png',
  kashen: '/assets/ui/avatar_dizhu.png',
  scholar: '/assets/ui/avatar_nongmin.png',
  noble: '/assets/ui/avatar_dizhu.png',
  warrior: '/assets/ui/avatar_nongmin.png',
};

export const AVATAR_OPTIONS = [
  { id: 'noble', name: '金百万' },
  { id: 'beier', name: '锦鲤贝儿' },
  { id: 'scholar', name: '柳如风' },
  { id: 'heroine', name: '红拂女' },
  { id: 'kashen', name: '雀圣陆九' },
  { id: 'warrior', name: '凌霄剑仙' },
  { id: 'dizhu', name: '老爷' },
  { id: 'dizhupo', name: '夫人' },
];

export interface AvatarSvgProps {
  avatarId?: string;
  size?: number | string;
  isLandlord?: boolean;
  animState?: 'idle' | 'think' | 'play' | 'win' | 'lose' | string;
  className?: string;
}

export const AvatarSvg: React.FC<AvatarSvgProps> = ({
  avatarId = 'noble',
  size = 40,
  isLandlord = false,
  className = '',
}) => {
  const src = isLandlord
    ? avatarId === 'beier' || avatarId === 'heroine' || avatarId === 'dizhupo'
      ? '/assets/ui/avatar_dizhupo.png'
      : '/assets/ui/avatar_dizhu.png'
    : AVATAR_IMAGE_MAP[avatarId] || '/assets/ui/avatar_nongmin.png';

  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1e120a] ${className}`}
    >
      <img
        src={src}
        alt={avatarId}
        className="h-full w-full object-cover pointer-events-none select-none"
        draggable={false}
      />
    </div>
  );
};
