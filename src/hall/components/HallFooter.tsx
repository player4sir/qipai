import React from 'react';

export interface HallFooterProps {
  roomsCount: number;
  signedInToday: boolean;
  isMobileLandscape?: boolean;
  onOpenFriendRoom: () => void;
  onOpenRooms: () => void;
  onOpenLeaderboard: () => void;
  onOpenRecords: () => void;
  onOpenSignIn: () => void;
}

export const HallFooter: React.FC<HallFooterProps> = ({
  roomsCount,
  signedInToday,
  isMobileLandscape = false,
  onOpenFriendRoom,
  onOpenRooms,
  onOpenLeaderboard,
  onOpenRecords,
  onOpenSignIn,
}) => {
  const items = [
    {
      id: 'friend',
      label: '好友',
      icon: '/assets/ui/zjm_icon_haoyou.png',
      onClick: onOpenFriendRoom,
    },
    {
      id: 'rooms',
      label: '背包',
      icon: '/assets/ui/zjm_icon_beibao.png',
      badgeCount: roomsCount > 0 ? roomsCount : undefined,
      onClick: onOpenRooms,
    },
    {
      id: 'rank',
      label: '排行榜',
      icon: '/assets/ui/nav_rank.png',
      onClick: onOpenLeaderboard,
    },
    {
      id: 'records',
      label: '任务',
      icon: '/assets/ui/zjm_icon_renwu.png',
      onClick: onOpenRecords,
    },
    {
      id: 'signin',
      label: '领奖',
      icon: '/assets/ui/zjm_icon_lingjiang.png',
      showRedDot: !signedInToday,
      onClick: onOpenSignIn,
    },
  ];

  return (
    <footer
      className="relative z-20 flex w-full shrink-0 items-center justify-center border-t border-white/10 bg-[#161924]/95 px-2 py-1 sm:py-1.5 backdrop-blur-md"
      style={{
        paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="mx-auto flex w-full max-w-xl items-center justify-between">
        {items.map((item, idx) => (
          <React.Fragment key={item.id}>
            {idx > 0 && <div className="h-5 w-px shrink-0 bg-white/10" />}
            <button
              type="button"
              onClick={item.onClick}
              className={`group relative flex flex-1 items-center justify-center ${
                isMobileLandscape ? 'flex-row gap-1.5 py-0.5' : 'flex-col gap-0.5 py-0.5'
              } transition-transform duration-150 hover:brightness-110 active:scale-95 cursor-pointer`}
            >
              <div className="relative flex items-center justify-center">
                <img
                  src={item.icon}
                  alt={item.label}
                  draggable={false}
                  className={`${
                    isMobileLandscape ? 'h-4.5 w-4.5' : 'h-5 w-5 sm:h-6 sm:w-6'
                  } object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-transform duration-150 group-hover:scale-105`}
                />
                {item.showRedDot && (
                  <span className="absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full border border-[#161924] bg-rose-500 shadow" />
                )}
                {item.badgeCount !== undefined && (
                  <span className="absolute -top-1 -right-2.5 rounded-full bg-emerald-500 px-1 text-[9px] font-black leading-tight text-white shadow">
                    {item.badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs font-bold tracking-wide text-white/90 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </footer>
  );
};
