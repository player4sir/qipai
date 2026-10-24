import {
  LegacyTileId,
  HONG_ZHONG_INDEX,
  createCountsVector,
  getTileNameById,
  getTileNameByIndex,
  legacyIdToTileIndex,
} from '../algorithms/TileEngine';
import { isHongZhongWildMode, sortTiles } from '../algorithms/MahjongTile';
import { calculateShantenFromCounts } from '../algorithms/ShantenEngine';
import { analyzeTing, evaluateHu } from '../algorithms/MahjongRules';
import { evaluateAIDiscardCandidates } from '../algorithms/MahjongAI';
import { MahjongSuit } from '../types';
import {
  resolveMahjongTileVoiceUrl,
  resolveMahjongActionVoiceUrl,
} from '../../../shared/audio/SoundEngine';

export interface DebugSeatSnapshot {
  seat: number;
  name: string;
  isBot?: boolean;
  hand: LegacyTileId[];
  melds: Array<{ type: string; tiles: LegacyTileId[]; targetTile?: LegacyTileId }>;
  discards: LegacyTileId[];
  lackSuit?: 'wan' | 'tiao' | 'tong' | null;
}

function formatTileList(tiles: LegacyTileId[]): string {
  return tiles.map((id) => `${getTileNameById(id)}(${id})`).join(' ');
}

function lackSuitToMahjongSuit(lackSuit?: 'wan' | 'tiao' | 'tong' | null): MahjongSuit | null {
  if (lackSuit === 'wan') return 0;
  if (lackSuit === 'tiao') return 1;
  if (lackSuit === 'tong') return 2;
  return null;
}

function buildDiscardsCountMap(visibleTiles?: LegacyTileId[]): Record<number, number> {
  const map: Record<number, number> = {};
  if (!visibleTiles) return map;
  for (const t of visibleTiles) {
    map[t] = (map[t] || 0) + 1;
  }
  return map;
}

function formatSuitDistribution(hand: LegacyTileId[], mode?: string): string {
  let wan = 0;
  let tiao = 0;
  let tong = 0;
  let winds = 0;
  let wild = 0;

  for (const id of hand) {
    if (id === 31 && isHongZhongWildMode(mode)) {
      wild++;
    } else if (id >= 1 && id <= 9) {
      wan++;
    } else if (id >= 11 && id <= 19) {
      tiao++;
    } else if (id >= 21 && id <= 29) {
      tong++;
    } else {
      winds++;
    }
  }

  return `万:${wan} 条:${tiao} 筒:${tong} 字:${winds}${isHongZhongWildMode(mode) ? ` 红中百搭:${wild}` : ''}`;
}

export class MahjongDebugLogger {
  private static enabled = true;

  public static setEnabled(flag: boolean): void {
    this.enabled = flag;
  }

  /**
   * 1. 开局发牌快照日志
   */
  public static logDealSnapshot(params: {
    roomId: string;
    mode: string;
    dealerSeat: number;
    wallRemaining: number;
    seats: DebugSeatSnapshot[];
    source?: 'CLIENT' | 'SERVER';
  }): void {
    if (!this.enabled) return;
    const tag = `[MJ-DEBUG][${params.source || 'ENGINE'}][开局发牌] 房间:${params.roomId} | 模式:${params.mode} | 庄家:座位${params.dealerSeat} | 余牌:${params.wallRemaining}`;

    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${tag}`, 'color: #06b6d4; font-weight: bold;');
    } else {
      console.log(tag);
    }

    for (const s of params.seats) {
      const sorted = sortTiles([...s.hand], params.mode);
      const counts = createCountsVector(sorted);
      const shanten = calculateShantenFromCounts(counts, s.melds.length, {
        wildcardIndex: isHongZhongWildMode(params.mode) ? HONG_ZHONG_INDEX : undefined,
        allowQiDui: s.melds.length === 0,
      });
      console.log(
        `  [座位${s.seat} ${s.name}${s.isBot ? '(AI)' : ''}] 手牌(${sorted.length}张): ${formatTileList(sorted)} | 分布:[${formatSuitDistribution(sorted, params.mode)}] | 初始向听:${shanten}${s.lackSuit ? ` | 定缺:${s.lackSuit}` : ''}`
      );
    }

    if (typeof console.groupEnd === 'function') {
      console.groupEnd();
    }
  }

  /**
   * 2. 摸牌与回合听牌/向听分析日志
   */
  public static logTurnAnalysis(params: {
    seat: number;
    playerName: string;
    mode: string;
    drawnTile?: LegacyTileId | null;
    hand: LegacyTileId[];
    melds: Array<{ type: string; tiles: LegacyTileId[]; targetTile?: LegacyTileId }>;
    visibleTiles?: LegacyTileId[];
    lackSuit?: 'wan' | 'tiao' | 'tong' | null;
    wallRemaining?: number;
    isBot?: boolean;
    source?: 'CLIENT' | 'SERVER';
  }): void {
    if (!this.enabled) return;
    const sorted = sortTiles([...params.hand], params.mode);
    const counts = createCountsVector(sorted);
    const shanten = calculateShantenFromCounts(counts, params.melds.length, {
      wildcardIndex: isHongZhongWildMode(params.mode) ? HONG_ZHONG_INDEX : undefined,
      allowQiDui: params.melds.length === 0,
    });
    const drawnText = params.drawnTile
      ? `摸入:${getTileNameById(params.drawnTile)}(${params.drawnTile})`
      : '副露/切牌回合';

    const tag = `[MJ-DEBUG][${params.source || 'ENGINE'}][回合分析] 座位${params.seat}(${params.playerName}) | ${drawnText} | 向听数:${shanten} | 余牌:${params.wallRemaining ?? '-'}`;

    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(`%c${tag}`, 'color: #f59e0b; font-weight: bold;');
    } else {
      console.log(tag);
    }

    console.log(`  当前手牌(${sorted.length}张): ${formatTileList(sorted)}`);

    const dingQueSuit = lackSuitToMahjongSuit(params.lackSuit);
    const discardsCount = buildDiscardsCountMap(params.visibleTiles);

    // 检查是否已自摸胡牌
    if (sorted.length % 3 === 2) {
      const huEval = evaluateHu(
        sorted,
        undefined,
        params.melds as any,
        dingQueSuit,
        true,
        false,
        false,
        false,
        false,
        256,
        params.mode
      );
      if (huEval.canHu) {
        console.log(
          `  [已满足自摸胡牌] 最高番:${huEval.totalFactor}倍 | 番型:${huEval.fanName}`
        );
        if (huEval.winningDecomposition) {
          const dec = huEval.winningDecomposition;
          const pairName = dec.eye >= 0 ? getTileNameByIndex(dec.eye) : '百搭雀头';
          console.log(
            `  [最优胡牌拆解] 雀头:${pairName} | 刻子:[${dec.triplets.map(getTileNameByIndex).join(',')}] | 顺子起点:[${dec.sequences.map(getTileNameByIndex).join(',')}]`
          );
        }
      }
    }

    // 听牌分析（当手牌为 3N+1 张时）
    if (sorted.length % 3 === 1) {
      const waits = analyzeTing(
        sorted,
        params.melds as any,
        dingQueSuit,
        discardsCount,
        params.mode
      );
      if (waits.length > 0) {
        console.log(
          `  [听牌口列表] 共${waits.length}门: ${waits
            .map((w) => `${getTileNameById(w.tileId)}(${w.tileId})[余${w.remainCount}张/${w.factor}倍:${w.fanName}]`)
            .join(' | ')}`
        );
      }
    }

    // AI 候选出牌评分 Top 3
    if (sorted.length % 3 === 2) {
      const candidates = evaluateAIDiscardCandidates({
        handTiles: sorted,
        melds: params.melds as any,
        dingQueSuit: dingQueSuit ?? -1,
        riverTiles: params.visibleTiles || [],
        opponentsMeldsCount: [0, 0, 0],
        wallRemaining: params.wallRemaining ?? 60,
        mode: params.mode,
      }).slice(0, 3);

      if (candidates.length > 0) {
        console.log(
          `  [AI候选出牌Top3] ${candidates
            .map(
              (c, idx) =>
                `#${idx + 1} 打${getTileNameById(c.tileId)}(${c.tileId}) -> 向听:${c.shantenAfter} 进张:${c.ukeireTilesCount} 危险度:${c.dangerScore} 综合分:${c.totalScore.toFixed(1)}`
            )
            .join(' || ')}`
        );
      }
    }

    if (typeof console.groupEnd === 'function') {
      console.groupEnd();
    }
  }

  /**
   * 3. 出牌与语音映射日志
   */
  public static logDiscardAction(params: {
    seat: number;
    playerName: string;
    tileId: LegacyTileId;
    gender: 'male' | 'female';
    mode: string;
    handAfter?: LegacyTileId[];
    melds?: Array<{ type: string; tiles: LegacyTileId[]; targetTile?: LegacyTileId }>;
    lackSuit?: 'wan' | 'tiao' | 'tong' | null;
    visibleTiles?: LegacyTileId[];
    source?: 'CLIENT' | 'SERVER';
  }): void {
    if (!this.enabled) return;
    const tileIdx = legacyIdToTileIndex(params.tileId);
    const tileName = getTileNameById(params.tileId);
    const voiceUrl = resolveMahjongTileVoiceUrl(params.tileId, params.gender);

    let tingSummary = '';
    if (params.handAfter && params.handAfter.length % 3 === 1) {
      const dingQueSuit = lackSuitToMahjongSuit(params.lackSuit);
      const discardsCount = buildDiscardsCountMap(params.visibleTiles);
      const waits = analyzeTing(
        params.handAfter,
        (params.melds || []) as any,
        dingQueSuit,
        discardsCount,
        params.mode
      );
      if (waits.length > 0) {
        tingSummary = ` | 听牌:[${waits.map((w) => `${getTileNameById(w.tileId)}(余${w.remainCount}/${w.factor}倍)`).join(', ')}]`;
      }
    }

    console.log(
      `%c[MJ-DEBUG][${params.source || 'ENGINE'}][出牌播报] 座位${params.seat}(${params.playerName}) 打出 ${tileName}(协议ID:${params.tileId} -> 内部索引:${tileIdx}) | 语音:${voiceUrl || 'N/A'}${tingSummary}`,
      'color: #10b981; font-weight: bold;'
    );
  }

  /**
   * 4. 碰/杠/胡动作响应与多解番型结算日志
   */
  public static logActionAndSettlement(params: {
    action: 'peng' | 'gang' | 'hu' | 'zimo';
    seat: number;
    playerName: string;
    gender: 'male' | 'female';
    targetTile?: LegacyTileId;
    fromSeat?: number;
    mode: string;
    hand?: LegacyTileId[];
    melds?: Array<{ type: string; tiles: LegacyTileId[]; targetTile?: LegacyTileId }>;
    lackSuit?: 'wan' | 'tiao' | 'tong' | null;
    scoreDelta?: number;
    source?: 'CLIENT' | 'SERVER';
  }): void {
    if (!this.enabled) return;
    const voiceUrl = resolveMahjongActionVoiceUrl(params.action, params.gender);
    const targetText = params.targetTile
      ? ` 目标牌:${getTileNameById(params.targetTile)}(${params.targetTile})`
      : '';

    const tag = `[MJ-DEBUG][${params.source || 'ENGINE'}][动作响应] 座位${params.seat}(${params.playerName}) 触发 [${params.action.toUpperCase()}]${targetText} | 语音:${voiceUrl}`;

    if (params.action === 'hu' || params.action === 'zimo') {
      if (typeof console.groupCollapsed === 'function') {
        console.groupCollapsed(`%c${tag}`, 'color: #a855f7; font-weight: bold;');
      } else {
        console.log(tag);
      }

      if (params.hand && params.hand.length > 0) {
        const dingQueSuit = lackSuitToMahjongSuit(params.lackSuit);
        const evalRes = evaluateHu(
          params.hand,
          params.action === 'hu' ? params.targetTile : undefined,
          (params.melds || []) as any,
          dingQueSuit,
          params.action === 'zimo',
          false,
          false,
          false,
          false,
          256,
          params.mode
        );
        console.log(
          `  [最高番裁定结果] 总倍率:${evalRes.totalFactor}倍 | 分数变动:${params.scoreDelta ?? '-'} | 番型明细:${evalRes.fanName}`
        );
        if (evalRes.candidateBreakdowns && evalRes.candidateBreakdowns.length > 0) {
          console.log(
            `  [全解枚举对比(共${evalRes.candidateBreakdowns.length}种拆解)]`,
            evalRes.candidateBreakdowns.map((b, i) => ({
              rank: i + 1,
              patternType: b.patternType,
              totalFan: b.totalFan,
              fans: b.fanNames.join('+'),
              pair:
                b.decomposition && b.decomposition.eye >= 0
                  ? getTileNameByIndex(b.decomposition.eye)
                  : '特殊/百搭',
              triplets: b.decomposition
                ? b.decomposition.triplets.map(getTileNameByIndex).join(',')
                : '-',
              sequences: b.decomposition
                ? b.decomposition.sequences.map(getTileNameByIndex).join(',')
                : '-',
            }))
          );
        }
      }

      if (typeof console.groupEnd === 'function') {
        console.groupEnd();
      }
    } else {
      console.log(`%c${tag}`, 'color: #34d399; font-weight: bold;');
    }
  }
}
