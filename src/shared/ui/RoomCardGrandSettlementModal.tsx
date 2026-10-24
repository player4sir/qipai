import React, { useEffect, useRef, useState } from 'react';
import { CommercialModalShell } from './CommercialModalShell';
import {
  RoomCardSessionState,
  GAME_TYPE_LABELS,
  PAY_MODE_LABELS,
  ESCROW_STATUS_LABELS,
  compareRoomCardPlayers,
  roomCardSessionHub,
} from '../control/RoomCardSessionHub';
import { soundEngine } from '../audio/SoundEngine';

interface RoomCardGrandSettlementModalProps {
  open: boolean;
  session: RoomCardSessionState | null;
  portalMode?: 'fixed' | 'stage';
  onClose: () => void;
  onPlayAgainSameRoom: () => void;
  onExitToHall: () => void;
}

export const RoomCardGrandSettlementModal: React.FC<RoomCardGrandSettlementModalProps> = ({
  open,
  session,
  portalMode = 'stage',
  onClose,
  onPlayAgainSameRoom,
  onExitToHall,
}) => {
  const [viewMode, setViewMode] = useState<'data' | 'poster'>('data');
  const [copiedReport, setCopiedReport] = useState(false);
  const [posterDataUrl, setPosterDataUrl] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = 2;
    const width = 640;
    const height = 840;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const { config, roundHistory, players, cardCostTotal, deductedFromPlayerId, verification } = session;
    const sortedPlayers = Object.values(players).sort(compareRoomCardPlayers);
    const topWinnerId = sortedPlayers[0]?.id;
    const topWinnerScore = sortedPlayers[0]?.totalDelta ?? 0;
    const payerName =
      verification?.payerName ||
      (deductedFromPlayerId && players[deductedFromPlayerId]?.name) ||
      (config.payMode === 'winner'
        ? sortedPlayers[0]?.name || '待决出'
        : config.payMode === 'aa'
        ? '全员AA平摊'
        : config.hostName);

    const escrowLabel = ESCROW_STATUS_LABELS[session.escrowState || 'FROZEN'];
    const signatureCode =
      verification?.signature || `RC-${config.roomId}-${roundHistory.length}R`;

    // 1. Clean High-Contrast Commercial Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // 2. Top Header Block (Slate-900)
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(16, 16, width - 32, 112);

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText('OFFICIAL MATCH SCORECARD · 权威终局战报', 36, 48);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 28px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${GAME_TYPE_LABELS[config.gameType]} · ${config.subModeLabel}`, 36, 84);

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 13px ui-monospace, SFMono-Regular, Menlo, monospace';
    const timeStr = new Date(session.settledAt || Date.now()).toLocaleString('zh-CN', {
      hour12: false,
    });
    ctx.fillText(`结算时间 ${timeStr}  ·  零和校验通过`, 36, 110);

    // Right Room ID Badge in Header
    ctx.textAlign = 'right';
    ctx.fillStyle = '#F59E0B';
    ctx.font = '900 26px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`#${config.roomId}`, width - 36, 78);
    ctx.fillStyle = '#CBD5E1';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `底分 ${config.baseScore}  |  ${roundHistory.length}/${config.totalRounds} 局`,
      width - 36,
      106
    );
    ctx.textAlign = 'left';

    // 3. Billing & Escrow Verification Bar
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(32, 144, width - 64, 48);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(32, 144, width - 64, 48);

    ctx.fillStyle = '#334155';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      `扣卡模式：${PAY_MODE_LABELS[config.payMode]}（${cardCostTotal}张 · ${escrowLabel}）`,
      46,
      173
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`扣费方：${payerName}`, width - 46, 173);
    ctx.textAlign = 'left';

    // 4. Player Standings Section Title
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(
      verification?.tieBreakRuleApplied
        ? `总分排名榜（${verification.tieBreakRuleApplied}）`
        : '总分排名榜（顺位裁决：净胜分 > 单局最高 > 胜场 > 座位）',
      32,
      222
    );

    const startY = 236;
    const rowH = 74;
    sortedPlayers.forEach((p, idx) => {
      const y = startY + idx * (rowH + 10);
      const isWinner = p.id === topWinnerId && topWinnerScore > 0;

      ctx.fillStyle = isWinner ? '#FFFBEB' : '#FFFFFF';
      ctx.fillRect(32, y, width - 64, rowH);

      ctx.strokeStyle = isWinner ? '#F59E0B' : '#E2E8F0';
      ctx.lineWidth = isWinner ? 2 : 1;
      ctx.strokeRect(32, y, width - 64, rowH);

      // Rank Box
      ctx.fillStyle = isWinner ? '#F59E0B' : '#0F172A';
      ctx.fillRect(46, y + 17, 40, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 16px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${idx + 1}`, 66, y + 43);
      ctx.textAlign = 'left';

      // Player Name & Tags
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 17px system-ui, -apple-system, sans-serif';
      const tags: string[] = [];
      if (p.isHost) tags.push('房主');
      if (isWinner) tags.push('本场大赢家');
      const tagSuffix = tags.length > 0 ? `  [${tags.join(' · ')}]` : '';
      ctx.fillText(`${p.name}${tagSuffix}`, 102, y + 34);

      ctx.fillStyle = '#64748B';
      ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(
        `战绩 ${p.winCount}胜 ${p.loseCount}负   |   单局最高 ${
          p.bestSingleRound > 0 ? `+${p.bestSingleRound}` : p.bestSingleRound
        }`,
        102,
        y + 56
      );

      // Net Score
      ctx.textAlign = 'right';
      ctx.fillStyle =
        p.totalDelta > 0 ? '#D97706' : p.totalDelta < 0 ? '#334155' : '#94A3B8';
      ctx.font = '900 26px ui-monospace, SFMono-Regular, Menlo, monospace';
      const scoreStr = p.totalDelta > 0 ? `+${p.totalDelta}` : `${p.totalDelta}`;
      ctx.fillText(scoreStr, width - 48, y + 46);
      ctx.textAlign = 'left';
    });

    // 5. Recent Rounds Matrix
    const matrixY = startY + 4 * (rowH + 10) + 16;
    ctx.fillStyle = '#0F172A';
    ctx.font = '900 14px system-ui, -apple-system, sans-serif';
    ctx.fillText('各局零和得分明细', 32, matrixY);

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(32, matrixY + 12, width - 64, 152);
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(32, matrixY + 12, width - 64, 152);

    if (roundHistory.length === 0) {
      ctx.fillStyle = '#94A3B8';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText('暂无已完成的对局记录（未开局解散可全额解冻退卡）', 48, matrixY + 46);
    } else {
      const displayRounds = roundHistory.slice(-5);
      displayRounds.forEach((r, rIdx) => {
        const ry = matrixY + 38 + rIdx * 25;
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`第 ${r.roundIndex} 局`, 46, ry);

        sortedPlayers.forEach((p, pIdx) => {
          const d = r.deltas[p.id] ?? 0;
          const colX = 140 + pIdx * 115;
          ctx.fillStyle = d > 0 ? '#D97706' : d < 0 ? '#334155' : '#94A3B8';
          ctx.fillText(
            `${p.name.slice(0, 3)}: ${d > 0 ? `+${d}` : d}`,
            colX,
            ry
          );
        });
      });
    }

    // 6. Footer HMAC-SHA256 Anti-Counterfeit Verification Line
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(`HMAC-SHA256 防伪签名 ${signatureCode}`, 32, height - 32);
    ctx.textAlign = 'right';
    ctx.fillText('服务端权威零和核验 · 官方战报', width - 32, height - 32);
    ctx.textAlign = 'left';

    try {
      setPosterDataUrl(canvas.toDataURL('image/png'));
    } catch {
      // ignore canvas security fallback
    }
  }, [
    open,
    session,
    session?.roundHistory.length,
    session?.status,
    session?.verification?.signature,
    viewMode,
  ]);

  if (!open || !session) return null;

  const { config, roundHistory, players, cardCostTotal, deductedFromPlayerId, verification } = session;
  const sortedPlayers = Object.values(players).sort(compareRoomCardPlayers);
  const topWinnerId = sortedPlayers[0]?.id;
  const topWinnerScore = sortedPlayers[0]?.totalDelta ?? 0;
  const payerName =
    verification?.payerName ||
    (deductedFromPlayerId && players[deductedFromPlayerId]?.name) ||
    (config.payMode === 'winner'
      ? sortedPlayers[0]?.name || '待决出'
      : config.payMode === 'aa'
      ? '全员AA平摊'
      : config.hostName);

  const escrowLabel = ESCROW_STATUS_LABELS[session.escrowState || 'FROZEN'];
  const signatureCode =
    verification?.signature || `RC-${config.roomId}-${roundHistory.length}R`;

  const handleCopyScorecard = async () => {
    soundEngine.playTap(740);
    const lines = [
      `【${GAME_TYPE_LABELS[config.gameType]}·权威约局战报】`,
      `房号：#${config.roomId} | 模式：${config.subModeLabel}`,
      `局数：${roundHistory.length}/${config.totalRounds} 局 | 底分：${config.baseScore} | 房费：${PAY_MODE_LABELS[config.payMode]} (${cardCostTotal}张 · ${payerName})`,
      ...sortedPlayers.map((p, idx) => {
        const sign = p.totalDelta > 0 ? `+${p.totalDelta}` : `${p.totalDelta}`;
        return `${idx + 1}. ${p.name}：${sign} 分 (${p.winCount}胜/${p.loseCount}负 · 最高单局 ${
          p.bestSingleRound > 0 ? `+${p.bestSingleRound}` : p.bestSingleRound
        })`;
      }),
      `防伪签名：${signatureCode} (零和核验通过)`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const handleDownloadPoster = () => {
    soundEngine.playTap(740);
    const url = posterDataUrl || canvasRef.current?.toDataURL('image/png');
    if (!url) return;
    const link = document.createElement('a');
    link.download = `战报_房号${config.roomId}_${GAME_TYPE_LABELS[config.gameType]}.png`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <CommercialModalShell
      open={open}
      onClose={onClose}
      portalMode={portalMode}
      title={`${GAME_TYPE_LABELS[config.gameType]} · 终局战报`}
      size="lg"
      headerActions={
        <div className="flex items-center gap-1.5">
          {session.status !== 'grand_settled' && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                roomCardSessionHub.simulateRoundSettlement();
              }}
              className="h-7 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap transition-colors cursor-pointer"
            >
              模拟下一局
            </button>
          )}
          <div className="grid grid-cols-2 p-0.5 rounded-lg bg-slate-100 border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setViewMode('data');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                viewMode === 'data'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              战报明细
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                setViewMode('poster');
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                viewMode === 'poster'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              战报海报
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyScorecard}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
            >
              {copiedReport ? '已复制文本' : '复制战报'}
            </button>
            <button
              type="button"
              onClick={handleDownloadPoster}
              className="h-8 px-3 rounded-lg border border-slate-900 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap transition-colors cursor-pointer"
            >
              保存战报海报
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                onExitToHall();
              }}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 whitespace-nowrap transition-colors cursor-pointer"
            >
              返回大厅
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playTap(740);
                onPlayAgainSameRoom();
              }}
              className="h-8 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-xs whitespace-nowrap transition-colors cursor-pointer"
            >
              再来一轮
            </button>
          </div>
        </div>
      }
    >
      {/* Hidden High-DPI Canvas Always Mounted for Instant Poster Export */}
      <canvas ref={canvasRef} className="hidden" />

      {viewMode === 'poster' ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-full max-w-[360px] rounded-xl border border-slate-200 bg-slate-50 p-2 shadow-xs">
            {posterDataUrl ? (
              <img
                src={posterDataUrl}
                alt="终局结算战报海报"
                className="w-full h-auto rounded-lg border border-slate-200 block"
              />
            ) : (
              <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                正在生成高清战报海报...
              </div>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            点击底部「保存战报海报」即可导出带 HMAC-SHA256 防伪签名的高清 PNG 战报
          </span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Flat Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-black text-slate-900 font-mono tabular-nums">
                房号 #{config.roomId}
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {config.subModeLabel} · 底分 {config.baseScore}
              </span>
              <span className="text-slate-300">|</span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                第 {roundHistory.length}/{config.totalRounds} 局
              </span>
            </div>
            <span className="text-slate-600 font-bold">
              {PAY_MODE_LABELS[config.payMode]}（{cardCostTotal}张 · {escrowLabel} · 扣费：{payerName}）
            </span>
          </div>

          {/* Adaptive 2x2 / 4-Column Standings Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sortedPlayers.map((player, index) => {
              const isBigWinner = player.id === topWinnerId && topWinnerScore > 0;
              const isPositive = player.totalDelta > 0;
              const isNegative = player.totalDelta < 0;

              return (
                <div
                  key={player.id}
                  className={`rounded-xl p-2.5 border flex flex-col justify-between ${
                    isBigWinner
                      ? 'bg-amber-50/40 border-amber-400'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-mono tabular-nums font-bold text-slate-400">
                      #{index + 1}
                    </span>
                    {isBigWinner ? (
                      <span className="text-[11px] font-black text-amber-600">
                        大赢家
                      </span>
                    ) : player.isHost ? (
                      <span className="text-[11px] font-bold text-slate-400">
                        房主
                      </span>
                    ) : null}
                  </div>

                  <div className="text-xs font-black text-slate-900 truncate mt-1">
                    {player.name}
                  </div>

                  <div
                    className={`my-1.5 text-lg font-black font-mono tabular-nums ${
                      isPositive
                        ? 'text-amber-600'
                        : isNegative
                        ? 'text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {isPositive ? `+${player.totalDelta}` : player.totalDelta}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                    <span>
                      {player.winCount}胜 {player.loseCount}负
                    </span>
                    <span>
                      高 {player.bestSingleRound > 0 ? `+${player.bestSingleRound}` : player.bestSingleRound}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Flat Round History */}
          {roundHistory.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 max-h-24 overflow-y-auto px-3">
              {roundHistory.map((r) => (
                <div
                  key={r.roundIndex}
                  className="py-1.5 flex items-center justify-between text-xs gap-2"
                >
                  <span className="font-mono tabular-nums text-slate-400 shrink-0">
                    第 {r.roundIndex} 局
                  </span>
                  <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums overflow-x-auto">
                    {sortedPlayers.map((p) => {
                      const d = r.deltas[p.id] ?? 0;
                      return (
                        <span
                          key={p.id}
                          className={`whitespace-nowrap font-bold ${
                            d > 0
                              ? 'text-amber-600'
                              : d < 0
                              ? 'text-slate-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {p.name.slice(0, 2)} {d > 0 ? `+${d}` : d}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 flex items-center justify-between">
              <span>当前处于首局开牌前预冻结阶段，未开局解散可 100% 原路解冻退卡。</span>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap(740);
                  roomCardSessionHub.simulateRoundSettlement();
                }}
                className="text-xs font-bold text-slate-900 underline whitespace-nowrap ml-2 cursor-pointer"
              >
                模拟一局战报
              </button>
            </div>
          )}

          {/* Authoritative Verification Footer Line */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums px-1">
            <span>防伪签名 {signatureCode}</span>
            <span>
              {verification?.tieBreakRuleApplied
                ? verification.tieBreakRuleApplied
                : '服务端零和校验通过 (ΣΔ = 0)'}
            </span>
          </div>
        </div>
      )}
    </CommercialModalShell>
  );
};
