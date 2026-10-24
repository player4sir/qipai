import React, { useEffect, useState } from 'react';
import { Layers, LogOut, Maximize2, Minimize2 } from 'lucide-react';
import type { ViewportMetrics } from '../../App';
import { soundEngine } from '../../shared/audio/SoundEngine';
import { AutoLandscapeContainer } from '../../shared/components/AutoLandscapeContainer';
import { socketClient } from '../../shared/network/SocketClient';
import { LaoYanCaiTableSnapshot } from './types';
import { LaoYanCaiPlayerSeat } from './components/LaoYanCaiPlayerSeat';
import { LaoYanCaiActionBar } from './components/LaoYanCaiActionBar';
import { LaoYanCaiSettlementModal } from './components/LaoYanCaiSettlementModal';

export interface LaoYanCaiTableViewProps {
  viewport?: ViewportMetrics;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onLeaveRoom: () => void;
}

const MODE_LABELS: Record<string, string> = {
  kunming: '昆明抢庄双腌',
  yuxi: '玉溪坐庄轮庄',
  crazy: '血战高倍三公',
};

export const LaoYanCaiTableView: React.FC<LaoYanCaiTableViewProps> = ({
  isFullscreen = false,
  onToggleFullscreen,
  onLeaveRoom,
}) => {
  const [snapshot, setSnapshot] = useState<LaoYanCaiTableSnapshot | null>(null);

  useEffect(() => {
    const unsub = socketClient.on<LaoYanCaiTableSnapshot>('s2c_lyc_snapshot', (data) => {
      setSnapshot(data);
    });
    socketClient.emit('c2s_request_snapshot');
    return () => {
      unsub();
    };
  }, []);

  if (!snapshot) {
    return (
      <AutoLandscapeContainer>
        {() => (
          <div className="flex h-full w-full items-center justify-center bg-[#071914] text-[#f5efe2]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f3c86b] border-t-transparent" />
              <span className="text-sm font-bold tracking-widest text-[#9ec2b8]">
                正在同步捞腌菜牌局数据...
              </span>
            </div>
          </div>
        )}
      </AutoLandscapeContainer>
    );
  }

  const myPlayerId = socketClient.getPlayerId();
  const foundMySeat = snapshot.seats.findIndex((s) => s?.playerId === myPlayerId);
  const mySeatIdx = foundMySeat !== -1 ? foundMySeat : 0;
  const selfPlayer = snapshot.seats[mySeatIdx] ?? null;

  const getRelSeat = (offset: number) => {
    const idx = (mySeatIdx + offset) % 5;
    return { seatIndex: idx, player: snapshot.seats[idx] ?? null };
  };

  const seatBottom = getRelSeat(0);
  const seatRight = getRelSeat(1);
  const seatTopRight = getRelSeat(2);
  const seatTopLeft = getRelSeat(3);
  const seatLeft = getRelSeat(4);

  return (
    <AutoLandscapeContainer>
      {() => (
        <div className="relative h-full w-full overflow-hidden bg-gradient-to-b from-[#09221b] via-[#0c2e25] to-[#061712] select-none text-[#f5efe2]">
          {/* Table Felt Frame */}
          <div className="pointer-events-none absolute inset-4 rounded-[44px] border-2 border-[#f3c86b]/25 bg-[radial-gradient(ellipse_at_center,rgba(20,76,62,0.45)_0%,rgba(6,23,18,0.88)_100%)] shadow-[inset_0_0_80px_rgba(0,0,0,0.75)]" />

        {/* Top Left Leave & Fullscreen Bar (Auto-hidden during settlement) */}
        {!(snapshot.phase === 'ROUND_RESULT' && snapshot.settlement) && (
          <div className="absolute top-3 left-4 z-30 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(640);
                onLeaveRoom();
              }}
              className="flex h-8 items-center gap-1.5 rounded-xl border border-amber-300/30 bg-black/55 px-3 text-xs font-extrabold text-amber-100 backdrop-blur-md transition-colors hover:border-amber-300/70 hover:bg-black/75 active:scale-95 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 text-amber-300" />
              <span>返回大厅</span>
            </button>

            {onToggleFullscreen && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap(720);
                  onToggleFullscreen();
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-300/25 bg-black/50 text-amber-200 hover:bg-black/75 active:scale-95 cursor-pointer"
                title={isFullscreen ? '退出全屏' : '全屏模式'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Center Info Banner */}
        <div className="pointer-events-none absolute top-[38%] left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <div className="flex items-center gap-3 rounded-xl border border-[#f3c86b]/30 bg-black/50 px-4 py-1.5 backdrop-blur-md">
            <span className="text-xs font-black tracking-widest text-[#f3c86b]">
              {MODE_LABELS[snapshot.playMode] || '经典捞腌菜'}
            </span>
            <span className="text-white/25">|</span>
            <span className="text-xs font-bold text-[#9ec2b8]">
              底注{' '}
              <strong className="font-mono text-white">
                {snapshot.baseScore.toLocaleString()}
              </strong>{' '}
              积分
            </span>
            <span className="text-white/25">|</span>
            <span className="flex items-center gap-1 text-xs font-bold text-[#9ec2b8]">
              <Layers className="h-3.5 w-3.5 text-[#f3c86b]" />
              余牌 <strong className="font-mono text-white">{snapshot.remainingDeckCount}</strong>
            </span>
          </div>
        </div>

        {/* 5 Player Seats */}
        <div className="absolute top-12 left-24 z-20">
          <LaoYanCaiPlayerSeat
            player={seatTopLeft.player}
            seatIndex={seatTopLeft.seatIndex}
            isSelf={false}
            phase={snapshot.phase}
          />
        </div>

        <div className="absolute top-12 right-24 z-20">
          <LaoYanCaiPlayerSeat
            player={seatTopRight.player}
            seatIndex={seatTopRight.seatIndex}
            isSelf={false}
            phase={snapshot.phase}
          />
        </div>

        <div className="absolute top-1/2 left-6 z-20 -translate-y-1/2">
          <LaoYanCaiPlayerSeat
            player={seatLeft.player}
            seatIndex={seatLeft.seatIndex}
            isSelf={false}
            phase={snapshot.phase}
          />
        </div>

        <div className="absolute top-1/2 right-6 z-20 -translate-y-1/2">
          <LaoYanCaiPlayerSeat
            player={seatRight.player}
            seatIndex={seatRight.seatIndex}
            isSelf={false}
            phase={snapshot.phase}
          />
        </div>

        <div className="absolute bottom-22 left-1/2 z-20 -translate-x-1/2">
          <LaoYanCaiPlayerSeat
            player={seatBottom.player}
            seatIndex={seatBottom.seatIndex}
            isSelf={true}
            phase={snapshot.phase}
          />
        </div>

        {/* Bottom Action Bar (Auto-hidden during settlement) */}
        {!(snapshot.phase === 'ROUND_RESULT' && snapshot.settlement) && (
          <div className="absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <LaoYanCaiActionBar
              phase={snapshot.phase}
              playMode={snapshot.playMode}
              countdown={snapshot.countdown}
              selfPlayer={selfPlayer}
              handResult={selfPlayer?.handResult}
              drawOdds={selfPlayer?.drawOdds}
              onCallBanker={(multiplier) => {
                soundEngine.playTap(760);
                socketClient.emit('c2s_lyc_call_banker', { multiplier });
              }}
              onBet={(multiplier) => {
                soundEngine.playTap(780);
                socketClient.emit('c2s_lyc_bet', { multiplier });
              }}
              onBankerNatural={(zhaKai) => {
                soundEngine.playTap(820);
                socketClient.emit('c2s_lyc_banker_natural', { zhaKai });
              }}
              onPlayerDecision={(decision) => {
                soundEngine.playTap(800);
                socketClient.emit('c2s_lyc_player_decision', { decision });
              }}
              onBankerDecision={(decision) => {
                soundEngine.playTap(800);
                socketClient.emit('c2s_lyc_banker_decision', { decision });
              }}
              onReady={() => {
                soundEngine.playTap(760);
                socketClient.emit('c2s_lyc_ready');
              }}
            />
          </div>
        )}

        {/* Settlement Modal */}
        {snapshot.phase === 'ROUND_RESULT' && snapshot.settlement && (
          <LaoYanCaiSettlementModal
            settlement={snapshot.settlement}
            countdown={snapshot.countdown}
            selfPlayerId={myPlayerId}
            onReadyNext={() => {
              soundEngine.playTap(760);
              socketClient.emit('c2s_lyc_ready');
            }}
            onLeaveRoom={onLeaveRoom}
          />
        )}
        </div>
      )}
    </AutoLandscapeContainer>
  );
};
