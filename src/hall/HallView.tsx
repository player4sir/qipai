import React, { useEffect, useMemo, useState } from 'react';
import { soundEngine } from '../shared/audio/SoundEngine';
import { hapticEngine } from '../shared/haptics/HapticEngine';
import {
  DealMode,
  MatchReplayRecord,
  Rank,
  ROOM_TIER_CONFIGS,
  RoomTierConfig,
} from '../games/ddz/types';
import { PuzzleChallengeModal } from '../games/ddz/components/PuzzleChallengeModal';
import { ReplayViewerModal } from '../games/ddz/components/ReplayViewerModal';
import { RegionalGamePortal } from './RegionalGamePortal';
import { AmbientParticles } from './components/AmbientParticles';
import { HallHeader } from './components/HallHeader';
import { HallFooter } from './components/HallFooter';
import { DdzArenaGrid } from './components/DdzArenaGrid';
import { MahjongArenaGrid } from './components/MahjongArenaGrid';
import { NiuniuArenaGrid } from './components/NiuniuArenaGrid';
import { ZjhArenaGrid } from './components/ZjhArenaGrid';
import { CommercialTierCardSpec } from './components/TierCard';
import { FriendRoomModal, CreateRoomCardOptions } from './components/modals/FriendRoomModal';
import { RoomCardCenterModal } from './components/modals/RoomCardCenterModal';
import { DailySignInModal } from './components/modals/DailySignInModal';
import { LeaderboardModal } from './components/modals/LeaderboardModal';
import { MatchRecordsModal } from './components/modals/MatchRecordsModal';
import { PublicRoomsModal } from './components/modals/PublicRoomsModal';
import { ProfileEditorModal } from './components/modals/ProfileEditorModal';
import { SettingsModal } from './components/modals/SettingsModal';
import {
  RoomCardGameType,
  useRoomCardSession,
} from '../shared/control/RoomCardSessionHub';
import type { ViewportMetrics } from '../App';

export interface UserProfile {
  playerId: string;
  nickname: string;
  avatarId: string;
  roomCards: number;
  beans: number;
  gamesPlayed: number;
  gamesWon: number;
}

export interface RoomSummary {
  roomId: string;
  gameType: string;
  mode?: string;
  hostId: string;
  baseScore: number;
  isPrivate: boolean;
  status: string;
  playerCount: number;
  maxPlayers: number;
  players: Array<{ nickname: string; avatarId: string; isBot: boolean }>;
}

export interface MatchRecord {
  id: string;
  roomId: string;
  gameType: string;
  dealMode?: DealMode;
  wildRanks?: Rank[];
  timestamp: number;
  baseScore: number;
  multiplier: number;
  winnerSide: string;
  players: Array<{
    playerId: string;
    nickname: string;
    role: string;
    scoreDelta: number;
    isWinner: boolean;
  }>;
  replay?: MatchReplayRecord;
}

export interface HallViewProps {
  profile: UserProfile | null;
  rooms: RoomSummary[];
  leaderboard: UserProfile[];
  matches: MatchRecord[];
  notice: string | null;
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onQuickMatch: (
    baseScore: number,
    fillBots: boolean,
    mode?: DealMode
  ) => void;
  onQuickMatchMahjong?: (baseScore?: number, mode?: string) => void;
  onQuickMatchNiuniu?: (baseScore?: number, mode?: string) => void;
  onQuickMatchZhajinhua?: (baseScore?: number, mode?: string) => void;
  onQuickMatchLaoYanCai?: (baseScore?: number, mode?: string) => void;
  onCreateRoom: (
    baseScore: number,
    isPrivate: boolean,
    autoFillBots: boolean,
    mode?: string,
    gameType?: string,
    totalRounds?: number,
    payMode?: 'host' | 'aa' | 'winner',
    roomId?: string
  ) => void;
  onJoinRoom: (roomId: string, gameType?: string) => void;
  onExchangeRoomCards?: (cardCount: number, beanCost: number) => void;
  onRefreshLobby: () => void;
  onClaimSupply: () => void;
  onUpdateProfile: (nickname: string, avatarId: string) => void;
}

export type DdzArenaMode = 'classic' | 'tiandi_laizi' | 'no_shuffle' | 'puzzle';
type PlatformModalType = 'rooms' | 'leaderboard' | 'records' | 'signin' | null;

export const HallView: React.FC<HallViewProps> = ({
  profile,
  rooms,
  leaderboard,
  matches,
  notice,
  viewport,
  isFullscreen,
  onToggleFullscreen,
  onQuickMatch,
  onQuickMatchMahjong,
  onQuickMatchNiuniu,
  onQuickMatchZhajinhua,
  onQuickMatchLaoYanCai,
  onCreateRoom,
  onJoinRoom,
  onExchangeRoomCards,
  onRefreshLobby,
  onClaimSupply,
  onUpdateProfile,
}) => {
  const { balance: roomCardBalance } = useRoomCardSession();
  const isMobileLandscape = useMemo(() => {
    if (viewport) {
      return viewport.tier !== 'tablet_desktop' && viewport.aspectRatio > 1.25;
    }
    if (typeof window !== 'undefined') {
      return window.innerWidth > window.innerHeight && window.innerHeight < 550;
    }
    return false;
  }, [viewport]);
  const [portalStage, setPortalStage] = useState<'main_portal' | 'ddz_subhall' | 'mahjong_subhall' | 'niuniu_subhall' | 'zhajinhua_subhall'>('main_portal');
  const [ddzArenaMode, setDdzArenaMode] = useState<DdzArenaMode>('classic');
  const [, setSelectedBaseScore] = useState<number>(100);
  const [selectedDealMode, setSelectedDealMode] = useState<DealMode>('classic');

  // Modals state
  const [showFriendRoomModal, setShowFriendRoomModal] = useState<boolean>(false);
  const [showRoomCardCenterModal, setShowRoomCardCenterModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [platformModal, setPlatformModal] = useState<PlatformModalType>(null);
  const [showPuzzleModal, setShowPuzzleModal] = useState<boolean>(false);
  const [puzzleInitLevelIdx, setPuzzleInitLevelIdx] = useState<number>(0);
  const [activeReplay, setActiveReplay] = useState<MatchReplayRecord | null>(null);
  const [loadingReplayId, setLoadingReplayId] = useState<string | null>(null);
  const [roomCardToast, setRoomCardToast] = useState<string | null>(null);

  useEffect(() => {
    soundEngine.startBgm('lobby');
  }, []);

  const myBeans = profile?.beans ?? 0;
  const myRoomCards = roomCardBalance;
  const isBankruptAlert = false;

  const currentDefaultGameType: RoomCardGameType = useMemo(() => {
    if (portalStage === 'mahjong_subhall') return 'mahjong';
    if (portalStage === 'niuniu_subhall') return 'niuniu';
    if (portalStage === 'zhajinhua_subhall') return 'zhajinhua';
    return 'ddz';
  }, [portalStage]);

  const displayNumericId = useMemo(() => {
    const raw = profile?.playerId ?? '';
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 6) return digits.slice(0, 6);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 31 + raw.charCodeAt(i)) % 900000;
    }
    return String(100000 + Math.abs(hash || 768924));
  }, [profile?.playerId]);

  const recommendedTier = ROOM_TIER_CONFIGS[0];

  const showToastMessage = (msg: string) => {
    setRoomCardToast(msg);
    window.setTimeout(() => setRoomCardToast(null), 2400);
  };

  const handleClaimRoomCards = () => {
    soundEngine.playTap(760);
    hapticEngine.tap();
    setShowRoomCardCenterModal(true);
  };

  const handleOpenMatchReplay = async (match: MatchRecord) => {
    soundEngine.playTap(780);
    hapticEngine.selectCard();
    if (match.replay) {
      setActiveReplay(match.replay);
      return;
    }
    try {
      setLoadingReplayId(match.id);
      const resp = await fetch(`/api/replay/${encodeURIComponent(match.id)}`);
      if (!resp.ok) return;
      const data = (await resp.json()) as { replay?: MatchReplayRecord };
      if (data.replay) {
        setActiveReplay(data.replay);
      }
    } catch {
      // Ignore network error
    } finally {
      setLoadingReplayId(null);
    }
  };

  const handleClickTierCard = (tierCfg: RoomTierConfig, spec: CommercialTierCardSpec) => {
    if (ddzArenaMode === 'puzzle') {
      soundEngine.playCardPlace(true);
      hapticEngine.playCard();
      setPuzzleInitLevelIdx(spec.puzzleLevelIdx);
      setShowPuzzleModal(true);
      return;
    }

    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    setSelectedDealMode(ddzArenaMode);
    setSelectedBaseScore(tierCfg.baseScore);
    onQuickMatch(tierCfg.baseScore, true, ddzArenaMode);
  };

  const handleQuickStart = () => {
    soundEngine.playCardPlace(true);
    hapticEngine.playCard();
    setSelectedBaseScore(recommendedTier.baseScore);
    onQuickMatch(recommendedTier.baseScore, true, selectedDealMode);
  };

  const isMainPortal = portalStage === 'main_portal';

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[#e8d5b5] bg-cover bg-center select-none text-[#FAF8F5]"
      style={{
        backgroundImage: isMainPortal
          ? 'url(/assets/ui/lobby_bg.png)'
          : 'url(/assets/ui/lobby_bg.png)',
      }}
    >
      {/* Warm Sunlit Commercial Atmosphere Overlay (keeps background bright & scenic while ensuring card contrast) */}
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-300 ${
          isMainPortal
            ? 'bg-gradient-to-b from-[#2b180a]/15 via-transparent to-[#241307]/25'
            : 'bg-gradient-to-b from-[#1e120a]/35 via-[#1a1008]/20 to-[#1e120a]/40 backdrop-blur-[2px]'
        }`}
      />

      {/* Background Subtle Floating Micro-Particles */}
      <AmbientParticles />

      {/* Top Navigation Bar with Official Asset Badges */}
      <HallHeader
        profile={profile}
        displayNumericId={displayNumericId}
        isMainPortal={isMainPortal}
        myBeans={myBeans}
        myRoomCards={myRoomCards}
        isBankruptAlert={isBankruptAlert}
        isMobileLandscape={isMobileLandscape}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        onBackToPortal={() => setPortalStage('main_portal')}
        onOpenProfile={() => setShowProfileModal(true)}
        onClaimRoomCards={handleClaimRoomCards}
        onOpenFriendRoom={() => setShowFriendRoomModal(true)}
        onClaimSupply={onClaimSupply}
        onOpenSettings={() => setShowSettingsModal(true)}
        onCopyIdSuccess={(copiedId) => showToastMessage(`已复制玩家 ID: ${copiedId}`)}
      />

      {/* Floating Notice / Toast */}
      {(notice || roomCardToast) && (
        <div className="pointer-events-none fixed top-15 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-300/80 bg-[#291509]/95 px-4 py-1 text-xs font-extrabold text-amber-200 shadow-2xl whitespace-nowrap animate-in fade-in">
          {roomCardToast || notice}
        </div>
      )}

      {/* Main Stage Area */}
      <main
        className={`relative z-10 mx-auto flex h-full max-h-full min-h-0 w-full max-w-6xl flex-1 flex-col items-center justify-center overflow-hidden ${
          isMobileLandscape ? 'px-2 py-1' : 'px-2.5 py-2 sm:px-4 sm:py-3'
        }`}
        style={{
          paddingLeft: 'max(0.6rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.6rem, env(safe-area-inset-right, 0px))',
        }}
      >
        {/* STAGE A: MAIN CHESS & CARD PORTAL */}
        {portalStage === 'main_portal' && (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center animate-in fade-in zoom-in-[0.99] duration-200">
            <RegionalGamePortal
              myBeans={myBeans}
              rooms={rooms}
              onEnterDdzHall={() => {
                soundEngine.playCardPlace(true);
                setPortalStage('ddz_subhall');
              }}
              onEnterMahjongHall={() => {
                soundEngine.playCardPlace(true);
                setPortalStage('mahjong_subhall');
              }}
              onEnterNiuniuHall={() => {
                soundEngine.playCardPlace(true);
                setPortalStage('niuniu_subhall');
              }}
              onEnterZjhHall={() => {
                soundEngine.playCardPlace(true);
                setPortalStage('zhajinhua_subhall');
              }}
              onQuickStartDdz={handleQuickStart}
              onQuickStartMahjong={() => onQuickMatchMahjong?.(100)}
              onQuickStartGame={(gameKey, baseScore) => {
                soundEngine.playCardPlace(true);
                if (gameKey === 'niuniu') {
                  onQuickMatchNiuniu?.(baseScore, 'qiangzhuang');
                  return;
                }
                if (gameKey === 'zhajinhua') {
                  onQuickMatchZhajinhua?.(baseScore, 'classic');
                  return;
                }
                if (gameKey === 'laoyancai') {
                  onQuickMatchLaoYanCai?.(baseScore, 'kunming');
                  return;
                }
                const titleMap: Record<string, string> = {
                  laoyancai: '滇西捞腌菜',
                  shuangko: '千变双扣',
                  sihepai: '传统四合牌',
                };
                showToastMessage(`【${titleMap[gameKey] ?? '地方特色'}】专区即将开放，敬请期待！`);
              }}
            />
          </div>
        )}

        {/* STAGE B: DOU DIZHU ARENA SUB-HALL */}
        {portalStage === 'ddz_subhall' && (
          <div className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden animate-in fade-in zoom-in-[0.99] duration-200">
            <DdzArenaGrid
              ddzArenaMode={ddzArenaMode}
              myBeans={myBeans}
              onSelectMode={(mode) => {
                soundEngine.playTap(780);
                hapticEngine.selectCard();
                setDdzArenaMode(mode);
                if (mode !== 'puzzle') setSelectedDealMode(mode);
              }}
              onClickTier={handleClickTierCard}
            />
          </div>
        )}

        {/* STAGE C: MAHJONG ARENA SUB-HALL */}
        {portalStage === 'mahjong_subhall' && (
          <div className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden animate-in fade-in zoom-in-[0.99] duration-200">
            <MahjongArenaGrid
              myBeans={myBeans}
              isMobileLandscape={isMobileLandscape}
              onSelectTier={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchMahjong?.(baseScore, mode);
              }}
              onQuickStart={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchMahjong?.(baseScore || 100, mode);
              }}
              onInsufficientBeans={() => {}}
            />
          </div>
        )}

        {/* STAGE D: NIUNIU ARENA SUB-HALL */}
        {portalStage === 'niuniu_subhall' && (
          <div className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden animate-in fade-in zoom-in-[0.99] duration-200">
            <NiuniuArenaGrid
              myBeans={myBeans}
              isMobileLandscape={isMobileLandscape}
              onSelectTier={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchNiuniu?.(baseScore, mode);
              }}
              onQuickStart={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchNiuniu?.(baseScore || 100, mode);
              }}
              onInsufficientBeans={() => {}}
            />
          </div>
        )}

        {/* STAGE E: ZHAJINHUA ARENA SUB-HALL */}
        {portalStage === 'zhajinhua_subhall' && (
          <div className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden animate-in fade-in zoom-in-[0.99] duration-200">
            <ZjhArenaGrid
              myBeans={myBeans}
              isMobileLandscape={isMobileLandscape}
              onSelectTier={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchZhajinhua?.(baseScore, mode);
              }}
              onQuickStart={(baseScore, mode) => {
                soundEngine.playCardPlace(true);
                hapticEngine.playCard();
                onQuickMatchZhajinhua?.(baseScore, mode);
              }}
              onInsufficientBeans={() => {}}
            />
          </div>
        )}
      </main>

      {/* Bottom Navigation Dock (Visible in Main Portal) */}
      {isMainPortal && (
        <HallFooter
          roomsCount={rooms.length}
          signedInToday={localStorage.getItem('h5_signin_last_date') === new Date().toISOString().slice(0, 10)}
          isMobileLandscape={isMobileLandscape}
          onOpenFriendRoom={() => setShowFriendRoomModal(true)}
          onOpenRooms={() => {
            onRefreshLobby();
            setPlatformModal('rooms');
          }}
          onOpenLeaderboard={() => setPlatformModal('leaderboard')}
          onOpenRecords={() => setPlatformModal('records')}
          onOpenSignIn={() => setPlatformModal('signin')}
        />
      )}

      {/* Modals */}
      {showFriendRoomModal && (
        <FriendRoomModal
          open={showFriendRoomModal}
          initialGameType={currentDefaultGameType}
          roomCards={myRoomCards}
          rooms={rooms}
          hostId={profile?.playerId || 'local_host'}
          hostName={profile?.nickname || '本家牌手'}
          onClose={() => setShowFriendRoomModal(false)}
          onJoinRoom={(roomId, gameType) => {
            setShowFriendRoomModal(false);
            onJoinRoom(roomId, gameType);
          }}
          onCreateRoom={(opts: CreateRoomCardOptions) => {
            setShowFriendRoomModal(false);
            onCreateRoom(
              opts.baseScore,
              true,
              opts.autoFillBots,
              opts.subMode,
              opts.gameType,
              opts.totalRounds,
              opts.payMode,
              opts.roomId
            );
          }}
          onOpenRoomCardCenter={() => {
            setShowFriendRoomModal(false);
            setShowRoomCardCenterModal(true);
          }}
        />
      )}

      {showRoomCardCenterModal && (
        <RoomCardCenterModal
          open={showRoomCardCenterModal}
          onClose={() => setShowRoomCardCenterModal(false)}
          onClaimPack={(cardCount) => {
            onExchangeRoomCards?.(cardCount, 0);
            showToastMessage(`已补充 ${cardCount} 张通用约局房卡`);
          }}
          onOpenFriendRoom={() => {
            setShowRoomCardCenterModal(false);
            setShowFriendRoomModal(true);
          }}
        />
      )}

      {platformModal === 'rooms' && (
        <PublicRoomsModal
          rooms={rooms}
          onClose={() => setPlatformModal(null)}
          onRefresh={onRefreshLobby}
          onOpenFriendRoom={() => setShowFriendRoomModal(true)}
          onJoinRoom={onJoinRoom}
        />
      )}

      {platformModal === 'leaderboard' && (
        <LeaderboardModal
          leaderboard={leaderboard}
          myProfile={profile}
          onClose={() => setPlatformModal(null)}
        />
      )}

      {platformModal === 'records' && (
        <MatchRecordsModal
          matches={matches}
          myPlayerId={profile?.playerId}
          loadingReplayId={loadingReplayId}
          onClose={() => setPlatformModal(null)}
          onOpenReplay={handleOpenMatchReplay}
        />
      )}

      {platformModal === 'signin' && (
        <DailySignInModal
          onClose={() => setPlatformModal(null)}
          onClaimSupply={onClaimSupply}
        />
      )}

      {showProfileModal && profile && (
        <ProfileEditorModal
          initialNickname={profile.nickname}
          initialAvatarId={profile.avatarId}
          onClose={() => setShowProfileModal(false)}
          onSave={onUpdateProfile}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          onOpenProfile={() => setShowProfileModal(true)}
          onOpenPuzzle={() => setShowPuzzleModal(true)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          myBeans={myBeans}
          onClaimSupply={onClaimSupply}
        />
      )}

      {activeReplay && (
        <ReplayViewerModal
          replay={activeReplay}
          viewerPlayerId={profile?.playerId}
          onClose={() => setActiveReplay(null)}
        />
      )}

      {showPuzzleModal && (
        <PuzzleChallengeModal
          initialLevelIdx={puzzleInitLevelIdx}
          onClose={() => setShowPuzzleModal(false)}
          onClaimReward={onClaimSupply}
        />
      )}
    </div>
  );
};
