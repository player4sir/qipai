import { MahjongMeld, MahjongSuit } from '../types';
import {
  createCountsVector,
  getTileDisplayName,
  HONG_ZHONG_INDEX,
  legacyIdToTileIndex,
  tileIndexToLegacyId,
  TOTAL_TILE_TYPES,
} from '../algorithms/TileEngine';
import { calculateShantenFromCounts } from '../algorithms/ShantenEngine';
import { evaluateAIDiscardCandidates } from '../algorithms/MahjongAI';
import { analyzeTing, evaluateHu } from '../algorithms/MahjongRules';
import { isHongZhongWildMode } from '../algorithms/MahjongTile';

export interface MahjongSeatSnapshotLog {
  seat: number;
  name: string;
  isBot?: boolean;
  hand: number[];
  melds: MahjongMeld[];
  discards: number[];
}

/**
 * 商业级麻将实时控制台调试日志层 (`[MJ-DEBUG]`)
 * 参照斗地主 `DdzDebugLogger` 标准，实时输出：
 * 1. 开局发牌快照与各家向听数 (`logDealSnapshot`)
 * 2. 摸牌/回合分析：34 维频次向量、当前向听数、听牌口与余牌、AI 候选出牌攻防评分表 (`logTurnAnalysis`)
 * 3. 出牌与读牌映射：十进制协议牌 ID -> 34 维索引 -> 中文牌名 -> 语音资源路径 (`logDiscardAction`)
 * 4. 吃/碰/杠/胡动作响应与全解最高番裁定明细 (`logActionAndSettlement`)
 */
export class MahjongDebugLogger {
  private static enabled: boolean = true;

  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  static formatTile(tileId: number): string {
    const idx = legacyIdToTileIndex(tileId);
    const name = getTileDisplayName(idx);
    return `${name}(id:${tileId}->idx:${idx})`;
  }

  static formatTiles(tiles: number[] | undefined): string {
    if (!tiles || tiles.length === 0) return '[]';
    return `[${tiles.map((t) => getTileDisplayName(legacyIdToTileIndex(t))).join(' ')}]`;
  }

  static formatCounts34Summary(tiles: number[]): string {
    const counts = createCountsVector(tiles);
    const entries: string[] = [];
    for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
      if (counts[i] > 0) {
        entries.push(`${getTileDisplayName(i)}×${counts[i]}`);
      }
    }
    return entries.join(' | ') || '空';
  }

  static resolveTileVoiceAsset(tileId: number, gender: 'female' | 'male' = 'female'): string {
    const idx = legacyIdToTileIndex(tileId);
    let file = '';
    if (idx >= 0 && idx <= 8) file = `mjt2_${idx + 1}.mp3`;
    else if (idx >= 9 && idx <= 17) file = `mjt3_${idx - 9 + 1}.mp3`;
    else if (idx >= 18 && idx <= 26) file = `mjt1_${idx - 18 + 1}.mp3`;
    else if (idx >= 27 && idx <= 30) file = `mjt4_${idx - 27 + 1}.mp3`;
    else if (idx === 31) file = 'mjt4_5.mp3';
    else if (idx === 32) file = 'mjt4_6.mp3';
    else if (idx === 33) file = 'mjt4_7.mp3';
    return `/assets/mahjong/audio/voice/${gender}/${file}`;
  }

  static resolveActionVoiceAsset(
    action: 'peng' | 'gang' | 'hu' | 'zimo',
    gender: 'female' | 'male' = 'female'
  ): string {
    return `/assets/mahjong/audio/voice/${gender}/${action}.mp3`;
  }

  /**
   * 1. 开局发牌与全局快照日志
   */
  static logDealSnapshot(params: {
    roomId: string;
    mode: string;
    dealerSeat: number;
    wallRemaining: number;
    seats: MahjongSeatSnapshotLog[];
    source?: 'SERVER' | 'CLIENT';
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const tag = params.source || 'CLIENT';
    const isWild = isHongZhongWildMode(params.mode);

    console.groupCollapsed(
      `%c[MJ-DEBUG][${tag}][发牌快照] 房间:${params.roomId} | 模式:${params.mode}${isWild ? '(红中赖子)' : '(标准字牌)'} | 庄家:Seat#${params.dealerSeat} | 牌墙余:${params.wallRemaining}张`,
      'color:#fbbf24;font-weight:bold;'
    );
    for (const s of params.seats) {
      if (!s.hand || s.hand.length === 0) continue;
      const counts = createCountsVector(s.hand);
      const shanten = calculateShantenFromCounts(counts, s.melds.length, {
        allowQiDui: s.melds.length === 0,
        allowShiSanYao: params.mode === 'guobiao' && s.melds.length === 0,
        wildcardIndex: isWild ? HONG_ZHONG_INDEX : undefined,
      });
      console.log(
        `Seat#${s.seat} ${s.name}${s.isBot ? '(AI)' : '(玩家)'} [向听数:${shanten}]:`,
        this.formatTiles(s.hand),
        `| 34维频次: ${this.formatCounts34Summary(s.hand)}`
      );
    }
    console.groupEnd();
  }

  /**
   * 2. 摸牌与回合向听/听牌/AI攻防评分日志
   */
  static logTurnAnalysis(params: {
    seat: number;
    playerName: string;
    mode: string;
    drawnTile?: number | null;
    hand: number[];
    melds: MahjongMeld[];
    visibleTiles: number[];
    lackSuit?: 'wan' | 'tiao' | 'tong' | null;
    wallRemaining: number;
    isBot?: boolean;
    source?: 'SERVER' | 'CLIENT';
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const tag = params.source || 'CLIENT';
    const isWild = isHongZhongWildMode(params.mode);
    const counts = createCountsVector(params.hand);
    const shanten = calculateShantenFromCounts(counts, params.melds.length, {
      allowQiDui: params.melds.length === 0,
      allowShiSanYao: params.mode === 'guobiao' && params.melds.length === 0,
      wildcardIndex: isWild ? HONG_ZHONG_INDEX : undefined,
    });

    const suitMap: Record<string, MahjongSuit> = { wan: 0, tiao: 1, tong: 2 };
    const dqSuit: MahjongSuit | null = params.lackSuit ? suitMap[params.lackSuit] : null;

    const topCandidates = evaluateAIDiscardCandidates({
      handTiles: params.hand,
      melds: params.melds,
      dingQueSuit: dqSuit ?? -1,
      riverTiles: params.visibleTiles,
      opponentsMeldsCount: [params.melds.length],
      wallRemaining: params.wallRemaining,
      mode: params.mode,
    }).slice(0, 5);

    console.groupCollapsed(
      `%c[MJ-DEBUG][${tag}][回合分析] Seat#${params.seat}(${params.playerName}) | 摸牌:${params.drawnTile ? this.formatTile(params.drawnTile) : '无'} | 当前向听:${shanten} | 余牌:${params.wallRemaining}`,
      'color:#38bdf8;font-weight:bold;'
    );
    console.log('当前手牌:', this.formatTiles(params.hand));
    console.log('34维频次向量:', this.formatCounts34Summary(params.hand));
    if (topCandidates.length > 0) {
      console.log(
        'Top-5 候选舍牌攻防评估 (Ukeire & Danger):',
        topCandidates.map(
          (c, i) =>
            `#${i + 1} 打[${getTileDisplayName(c.tileIndex)}(id:${c.tileId})] -> 打后向听:${c.shantenAfter} | 有效进张余:${c.ukeireTilesCount}张 | 危险度:${c.dangerScore} | 综合分:${c.totalScore}`
        )
      );
    }
    console.groupEnd();
  }

  /**
   * 3. 出牌与读牌语音映射日志
   */
  static logDiscardAction(params: {
    seat: number;
    playerName: string;
    tileId: number;
    gender: 'female' | 'male';
    mode: string;
    handAfter?: number[];
    melds?: MahjongMeld[];
    lackSuit?: 'wan' | 'tiao' | 'tong' | null;
    visibleTiles?: number[];
    source?: 'SERVER' | 'CLIENT';
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const tag = params.source || 'CLIENT';
    const idx = legacyIdToTileIndex(params.tileId);
    const tileName = getTileDisplayName(idx);
    const voicePath = this.resolveTileVoiceAsset(params.tileId, params.gender);

    let tingSummary = '未计算';
    if (params.handAfter && params.handAfter.length > 0) {
      const suitMap: Record<string, MahjongSuit> = { wan: 0, tiao: 1, tong: 2 };
      const dqSuit: MahjongSuit | null = params.lackSuit ? suitMap[params.lackSuit] : null;
      const discardsCount: Record<number, number> = {};
      for (const vt of params.visibleTiles || []) {
        discardsCount[vt] = (discardsCount[vt] || 0) + 1;
      }
      const waits = analyzeTing(
        params.handAfter,
        params.melds || [],
        dqSuit,
        discardsCount,
        params.mode
      );
      if (waits.length > 0) {
        tingSummary = waits
          .map(
            (w) =>
              `${getTileDisplayName(legacyIdToTileIndex(w.tileId))}(${w.fanName}/${w.factor}倍/剩${w.remainCount}张)`
          )
          .join(' , ');
      } else {
        tingSummary = '未听牌';
      }
    }

    console.groupCollapsed(
      `%c[MJ-DEBUG][${tag}][出牌/读牌] Seat#${params.seat}(${params.playerName}) -> 打出【${tileName}】[id:${params.tileId}->idx:${idx}] | 语音:${voicePath}`,
      'color:#34d399;font-weight:bold;'
    );
    console.log('读牌映射详情:', {
      出牌方: `Seat#${params.seat} (${params.playerName})`,
      十进制协议ID_tileId: params.tileId,
      内部34维索引_tileIndex: idx,
      标准牌名_tileName: tileName,
      语音通道_gender: params.gender,
      语音文件_voiceAsset: voicePath,
      打后手牌: params.handAfter ? this.formatTiles(params.handAfter) : '对手暗牌',
      打后听牌口_tingWaits: tingSummary,
    });
    console.groupEnd();
  }

  /**
   * 4. 吃/碰/杠/胡动作响应与全解最高番裁定日志
   */
  static logActionAndSettlement(params: {
    action: 'peng' | 'gang' | 'hu' | 'zimo';
    seat: number;
    playerName: string;
    gender: 'female' | 'male';
    targetTile?: number;
    mode: string;
    hand?: number[];
    melds?: MahjongMeld[];
    scoreDelta?: number;
    source?: 'SERVER' | 'CLIENT';
  }): void {
    if (!this.enabled || typeof console === 'undefined') return;
    const tag = params.source || 'CLIENT';
    const voicePath = this.resolveActionVoiceAsset(params.action, params.gender);

    console.groupCollapsed(
      `%c[MJ-DEBUG][${tag}][动作/胡牌] Seat#${params.seat}(${params.playerName}) -> 触发【${params.action.toUpperCase()}】| 语音:${voicePath}`,
      'color:#f43f5e;font-weight:bold;'
    );
    console.log('动作播报详情:', {
      动作类型: params.action,
      触发玩家: `Seat#${params.seat} (${params.playerName})`,
      目标牌: params.targetTile ? this.formatTile(params.targetTile) : '自摸/暗杠',
      高优语音资源: voicePath,
      分数变动_scoreDelta: params.scoreDelta ?? 0,
    });

    if ((params.action === 'hu' || params.action === 'zimo') && params.hand && params.hand.length > 0) {
      const huEval = evaluateHu(
        params.hand,
        params.targetTile,
        params.melds || [],
        null,
        params.action === 'zimo',
        false,
        false,
        false,
        false,
        256,
        params.mode
      );
      if (huEval.canHu) {
        console.log('全解最高番裁定结果:', {
          最终番型: huEval.fanName,
          结算倍数: huEval.totalFactor,
          茶山根数: huEval.genCount,
          最佳拆解_winningDecomposition: huEval.winningDecomposition
            ? {
                雀头: getTileDisplayName(huEval.winningDecomposition.eye),
                刻子: huEval.winningDecomposition.triplets.map((t) => getTileDisplayName(t)),
                顺子首张: huEval.winningDecomposition.sequences.map((s) =>
                  getTileDisplayName(tileIndexToLegacyId(s))
                ),
              }
            : '特殊牌型(七对/十三幺)',
          全部候选拆解得分表_candidateBreakdowns: huEval.candidateBreakdowns,
        });
      }
    }
    console.groupEnd();
  }
}
