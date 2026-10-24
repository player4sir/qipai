import React, { useEffect, useMemo, useState } from 'react';
import { soundEngine } from '../shared/audio/SoundEngine';
import { hapticEngine } from '../shared/haptics/HapticEngine';
import { GamePreviewModal, GameKey } from './components/modals/GamePreviewModal';
import type { RoomSummary } from './HallView';

export interface RegionalGamePortalProps {
  onEnterDdzHall: () => void;
  onEnterMahjongHall: () => void;
  onEnterNiuniuHall?: () => void;
  onEnterZjhHall?: () => void;
  onEnterLaoYanCaiHall?: () => void;
  onQuickStartDdz: () => void;
  onQuickStartMahjong?: () => void;
  onQuickStartGame?: (gameKey: GameKey, baseScore: number) => void;
  myBeans?: number;
  rooms?: RoomSummary[];
}

type PortalCardId = 'puer' | 'ddz' | 'niuniu' | 'zhajinhua' | 'laoyancai' | 'shuangko';

interface PortalGameCardSpec {
  id: PortalCardId;
  gameTypeKey: string;
  title: string;
  baseOnline: number;
  heroImg: string;
  cardGradient: string;
  borderClass: string;
  titleShadowColor: string;
  titleDeepShadow: string;
}

const PORTAL_GAMES_CONFIG: PortalGameCardSpec[] = [
  {
    id: 'puer',
    gameTypeKey: 'mahjong',
    title: '普洱麻将',
    baseOnline: 3820,
    heroImg: '/assets/hall/hero-puer.png',
    cardGradient: 'from-[#34c395] to-[#1a825f]',
    borderClass: 'border-[#7ce8c3]/75',
    titleShadowColor: '#126146',
    titleDeepShadow: '#093827',
  },
  {
    id: 'ddz',
    gameTypeKey: 'ddz',
    title: '斗地主',
    baseOnline: 9680,
    heroImg: '/assets/hall/hero-ddz.png',
    cardGradient: 'from-[#f89259] to-[#df5b22]',
    borderClass: 'border-[#ffc299]/80',
    titleShadowColor: '#9e360b',
    titleDeepShadow: '#5e1c03',
  },
  {
    id: 'niuniu',
    gameTypeKey: 'niuniu',
    title: '抢庄斗牛',
    baseOnline: 6840,
    heroImg: '/assets/hall/hero-niuniu.png',
    cardGradient: 'from-[#f46b45] to-[#c92a22]',
    borderClass: 'border-[#ffb8a6]/80',
    titleShadowColor: '#851812',
    titleDeepShadow: '#4d0b07',
  },
  {
    id: 'zhajinhua',
    gameTypeKey: 'zhajinhua',
    title: '经典金花',
    baseOnline: 8260,
    heroImg: '/assets/hall/hero-zhajinhua.png',
    cardGradient: 'from-[#9370f8] to-[#5e2ec8]',
    borderClass: 'border-[#dcd0ff]/80',
    titleShadowColor: '#3f1899',
    titleDeepShadow: '#230b5c',
  },
  {
    id: 'laoyancai',
    gameTypeKey: 'laoyancai',
    title: '捞腌菜',
    baseOnline: 1580,
    heroImg: '/assets/hall/hero-laoyancai.png',
    cardGradient: 'from-[#b88ef0] to-[#8350d1]',
    borderClass: 'border-[#e2cbfc]/75',
    titleShadowColor: '#56299c',
    titleDeepShadow: '#311363',
  },
  {
    id: 'shuangko',
    gameTypeKey: 'shuangko',
    title: '双扣',
    baseOnline: 2890,
    heroImg: '/assets/hall/hero-shuangko.png',
    cardGradient: 'from-[#e67552] to-[#cf4d35]',
    borderClass: 'border-[#ffb8a1]/75',
    titleShadowColor: '#8c2715',
    titleDeepShadow: '#4f1207',
  },
];

export const RegionalGamePortal: React.FC<RegionalGamePortalProps> = ({
  onEnterDdzHall,
  onEnterMahjongHall,
  onEnterNiuniuHall,
  onEnterZjhHall,
  onEnterLaoYanCaiHall,
  onQuickStartDdz,
  onQuickStartGame,
  myBeans = 12000,
  rooms = [],
}) => {
  const [activePreview, setActivePreview] = useState<GameKey | null>(null);
  const [livePulseSeed, setLivePulseSeed] = useState<number>(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLivePulseSeed((prev) => (prev + 1) % 60);
    }, 8000);
    return () => window.clearInterval(timer);
  }, []);

  const dynamicOnlineByGame = useMemo(() => {
    const map: Record<PortalCardId, string> = {
      puer: '0',
      ddz: '0',
      niuniu: '0',
      zhajinhua: '0',
      laoyancai: '0',
      shuangko: '0',
    };

    PORTAL_GAMES_CONFIG.forEach((cfg, idx) => {
      const matchingRoomPlayers = rooms
        .filter((r) => r.gameType === cfg.gameTypeKey)
        .reduce((acc, r) => acc + r.playerCount * 35, 0);
      const jitter = Math.round(Math.sin(livePulseSeed * 0.7 + idx * 1.9) * 28);
      const total = Math.max(120, cfg.baseOnline + matchingRoomPlayers + jitter);
      map[cfg.id] = total >= 9999 ? '9,999+' : total.toLocaleString();
    });

    return map;
  }, [rooms, livePulseSeed]);

  const handleOpenPreview = (gameKey: GameKey) => {
    soundEngine.playTap(760);
    hapticEngine.tap();
    setActivePreview(gameKey);
  };

  const handleCardSelect = (cardId: PortalCardId) => {
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();

    switch (cardId) {
      case 'puer':
        onEnterMahjongHall();
        break;
      case 'ddz':
        onEnterDdzHall();
        break;
      case 'niuniu':
        if (onEnterNiuniuHall) {
          onEnterNiuniuHall();
        } else {
          handleOpenPreview('niuniu');
        }
        break;
      case 'zhajinhua':
        if (onEnterZjhHall) {
          onEnterZjhHall();
        } else {
          handleOpenPreview('zhajinhua');
        }
        break;
      case 'laoyancai':
        if (onEnterLaoYanCaiHall) {
          onEnterLaoYanCaiHall();
        } else {
          handleOpenPreview('laoyancai');
        }
        break;
      case 'shuangko':
        handleOpenPreview('shuangko');
        break;
    }
  };

  const handleStartGame = (gameKey: GameKey, baseScore: number) => {
    if (onQuickStartGame) {
      onQuickStartGame(gameKey, baseScore);
    } else {
      soundEngine.playCardPlace(true);
      hapticEngine.playCard();
      onQuickStartDdz();
    }
  };

  return (
    <div className="relative flex h-full w-full flex-1 flex-col items-center justify-center overflow-hidden select-none px-1">
      {/* =====================================================================
          CLEAN COMMERCIAL GAME PORTAL GRID (2 COLUMNS x 3 ROWS)
          - Harmonious single-subject illustrations + 3D title + online pill
          - Zero meaningless text descriptions or cluttered multi-element stacks
         ===================================================================== */}
      <div
        className="
          mx-auto my-auto grid min-h-0 w-full place-items-center
          max-w-[min(440px,calc((100dvh-148px)*0.82))] sm:max-w-[500px]
          max-h-[min(100%,620px)]
          grid-cols-2 grid-rows-3
          gap-2.5 sm:gap-3.5
          landscape:max-w-[min(620px,calc((100dvh-124px)*2.15))] landscape:max-h-[min(100%,360px)] landscape:grid-cols-3 landscape:grid-rows-2 landscape:gap-3
        "
      >
        {PORTAL_GAMES_CONFIG.map((cfg) => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => handleCardSelect(cfg.id)}
            className={`
              group relative flex h-full max-h-[200px] min-h-0 w-full max-w-[210px] aspect-[4/3.6]
              landscape:max-h-[168px] landscape:max-w-[192px] landscape:aspect-[4/3.35]
              flex-col items-center justify-between
              overflow-hidden rounded-[20px] sm:rounded-[24px] border-2 ${cfg.borderClass}
              bg-gradient-to-b ${cfg.cardGradient}
              px-2.5 pt-2 pb-2.5 sm:px-3 sm:pt-2.5 sm:pb-3
              shadow-[0_10px_22px_rgba(25,12,4,0.32),inset_0_1.5px_1px_rgba(255,255,255,0.45)]
              transition-all duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:brightness-105 cursor-pointer
            `}
          >
            {/* Soft Top Radial Highlight */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.22),transparent_70%)]" />

            {/* Top-Right Compact Online Counter Pill */}
            <div className="relative z-20 flex w-full shrink-0 items-center justify-end">
              <div
                className="flex items-center gap-1 rounded-full bg-black/22 px-2.5 py-0.5 text-[10px] sm:text-xs font-bold text-white/95 backdrop-blur-xs"
                title="实时在线人数"
              >
                <img
                  src="/assets/ui/icon_online.png"
                  alt=""
                  className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 object-contain brightness-0 invert opacity-95"
                />
                <span className="font-mono tabular-nums">
                  {dynamicOnlineByGame[cfg.id]}
                </span>
              </div>
            </div>

            {/* Center Single Clean Illustration */}
            <div className="relative z-10 flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden py-0.5">
              <img
                src={cfg.heroImg}
                alt={cfg.title}
                draggable={false}
                className="max-h-full w-auto max-w-[84%] object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.22)] transition-transform duration-300 [@media(hover:hover)]:group-hover:scale-105"
              />
            </div>

            {/* Bottom Clean 3D Game Title (No meaningless extra text) */}
            <div className="relative z-20 flex w-full shrink-0 items-center justify-center pt-0.5">
              <span
                className="font-display text-[clamp(1.15rem,4vw,1.6rem)] leading-none font-black tracking-wider text-white whitespace-nowrap landscape:text-[clamp(1.05rem,2.5vw,1.4rem)]"
                style={{
                  textShadow: `0 1.5px 0 ${cfg.titleShadowColor}, 0 -1px 0 ${cfg.titleShadowColor}, 1.5px 0 0 ${cfg.titleShadowColor}, -1.5px 0 0 ${cfg.titleShadowColor}, 0 3px 0 ${cfg.titleDeepShadow}, 0 4px 8px rgba(0,0,0,0.38)`,
                }}
              >
                {cfg.title}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* =====================================================================
          COMMERCIAL GAME PREVIEW & TIER MODAL
         ===================================================================== */}
      {activePreview && (
        <GamePreviewModal
          gameKey={activePreview}
          myBeans={myBeans}
          onClose={() => setActivePreview(null)}
          onQuickStart={(k, baseScore) => {
            setActivePreview(null);
            handleStartGame(k, baseScore);
          }}
        />
      )}
    </div>
  );
};
