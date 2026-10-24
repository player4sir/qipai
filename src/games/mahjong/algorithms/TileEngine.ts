/**
 * TileEngine.ts
 * 商业级 34 维连续索引麻将牌型引擎 (参考 xiyoufang/mahjong 架构)
 *
 * 编码规范：
 * 0 ~ 8:   一万 ~ 九万 (Wan, 0)
 * 9 ~ 17:  一条 ~ 九条 (Tiao, 1)
 * 18 ~ 26: 一筒 ~ 九筒 (Tong, 2)
 * 27 ~ 30: 东、南、西、北 (Winds, 3)
 * 31 ~ 33: 红中、发财、白板 (Dragons, 4)
 */

export type TileIndex = number; // 0 ~ 33

export const TOTAL_TILE_TYPES = 34;

// 花色索引区间定义
export const WAN_START = 0;
export const WAN_END = 8;

export const TIAO_START = 9;
export const TIAO_END = 17;

export const TONG_START = 18;
export const TONG_END = 26;

export const WIND_START = 27;
export const WIND_END = 30;

export const DRAGON_START = 31;
export const DRAGON_END = 33;

export const HONG_ZHONG_INDEX = 31;
export const FA_CAI_INDEX = 32;
export const BAI_BAN_INDEX = 33;

export const TILE_NAMES_34: string[] = [
  '一万', '二万', '三万', '四万', '五万', '六万', '七万', '八万', '九万',
  '一条', '二条', '三条', '四条', '五条', '六条', '七条', '八条', '九条',
  '一筒', '二筒', '三筒', '四筒', '五筒', '六筒', '七筒', '八筒', '九筒',
  '东风', '南风', '西风', '北风',
  '红中', '发财', '白板',
];

export const TILE_SHORT_NAMES_34: string[] = [
  '1万', '2万', '3万', '4万', '5万', '6万', '7万', '8万', '9万',
  '1条', '2条', '3条', '4条', '5条', '6条', '7条', '8条', '9条',
  '1筒', '2筒', '3筒', '4筒', '5筒', '6筒', '7筒', '8筒', '9筒',
  '东', '南', '西', '北',
  '中', '发', '白',
];

/**
 * 获取牌所属花色:
 * 0: 万, 1: 条, 2: 筒, 3: 风牌 (东南西北), 4: 箭牌 (中发白)
 */
export function getTileSuit(tile: TileIndex): number {
  if (tile >= WAN_START && tile <= WAN_END) return 0;
  if (tile >= TIAO_START && tile <= TIAO_END) return 1;
  if (tile >= TONG_START && tile <= TONG_END) return 2;
  if (tile >= WIND_START && tile <= WIND_END) return 3;
  if (tile >= DRAGON_START && tile <= DRAGON_END) return 4;
  return -1;
}

/**
 * 获取数牌的点数 (1 ~ 9), 字牌返回 0
 */
export function getTileRank(tile: TileIndex): number {
  if (tile >= WAN_START && tile <= WAN_END) return tile - WAN_START + 1;
  if (tile >= TIAO_START && tile <= TIAO_END) return tile - TIAO_START + 1;
  if (tile >= TONG_START && tile <= TONG_END) return tile - TONG_START + 1;
  return 0;
}

/**
 * 判断是否为字牌 (风牌或箭牌)
 */
export function isHonorTile(tile: TileIndex): boolean {
  return tile >= WIND_START && tile <= DRAGON_END;
}

/**
 * 判断是否为数牌 (万条筒)
 */
export function isSuitTile(tile: TileIndex): boolean {
  return tile >= WAN_START && tile <= TONG_END;
}

/**
 * 判断是否为幺九牌 (1万9万、1条9条、1筒9筒、东南西北中发白)
 */
export function isOrphanTile(tile: TileIndex): boolean {
  if (isHonorTile(tile)) return true;
  const rank = getTileRank(tile);
  return rank === 1 || rank === 9;
}

/**
 * 转换为 Cocos 官方切图 AssetCode
 * 万: 21~29, 条: 31~39, 筒: 11~19, 风牌: 41~44, 箭牌: 45~47
 */
export function tileIndexToAssetCode(tile: TileIndex): string {
  if (tile >= WAN_START && tile <= WAN_END) {
    return `2${tile - WAN_START + 1}`;
  }
  if (tile >= TIAO_START && tile <= TIAO_END) {
    return `3${tile - TIAO_START + 1}`;
  }
  if (tile >= TONG_START && tile <= TONG_END) {
    return `1${tile - TONG_START + 1}`;
  }
  if (tile >= WIND_START && tile <= WIND_END) {
    return `4${tile - WIND_START + 1}`;
  }
  if (tile >= DRAGON_START && tile <= DRAGON_END) {
    return `4${tile - DRAGON_START + 5}`;
  }
  return '21';
}

/**
 * 兼容旧版十进制 ID (1~9 万, 11~19 条, 21~29 筒, 31 红中, 41~44 东南西北, 45~47 中发白) 到 34 维连续索引
 */
export function legacyIdToTileIndex(id: number): TileIndex {
  // 1. 优先匹配十进制数牌 (万: 1~9, 条: 11~19, 筒: 21~29)
  if (id >= 1 && id <= 9) return id - 1; // 1~9 万 -> 0~8
  if (id >= 11 && id <= 19) return id - 11 + 9; // 11~19 条 -> 9~17
  if (id >= 21 && id <= 29) return id - 21 + 18; // 21~29 筒 -> 18~26

  // 2. 特殊字牌与风箭牌 (31:红中, 41~44:东南西北, 45:中, 46:发, 47:白)
  if (id === 31 || id === 45) return HONG_ZHONG_INDEX; // 31
  if (id === 46) return FA_CAI_INDEX; // 32
  if (id === 47) return BAI_BAN_INDEX; // 33
  if (id >= 41 && id <= 44) return WIND_START + (id - 41); // 27~30

  // 3. 16 进制兼容 (0x01..0x09 筒, 0x11..0x19 万, 0x21..0x29 条, 0x31..0x37 风箭)
  const hexSuit = (id & 0xf0) >> 4;
  const hexRank = id & 0x0f;
  if (hexSuit === 0 && hexRank >= 1 && hexRank <= 9) return 18 + hexRank - 1; // 筒
  if (hexSuit === 1 && hexRank >= 1 && hexRank <= 9) return 0 + hexRank - 1; // 万
  if (hexSuit === 2 && hexRank >= 1 && hexRank <= 9) return 9 + hexRank - 1; // 条
  if (hexSuit === 3 && hexRank >= 1 && hexRank <= 7) return 27 + hexRank - 1; // 风箭

  // 4. 若为 0 (一万连续索引) 或未被上述十进制拦截的 0..33 索引
  if (id >= 0 && id <= 33) return id;

  return 0;
}

/**
 * 34 维连续索引转换为旧版十进制 ID (为了兼容网络协议与存储)
 */
export function tileIndexToLegacyId(index: TileIndex): number {
  if (index >= WAN_START && index <= WAN_END) return index - WAN_START + 1; // 1~9
  if (index >= TIAO_START && index <= TIAO_END) return index - TIAO_START + 11; // 11~19
  if (index >= TONG_START && index <= TONG_END) return index - TONG_START + 21; // 21~29
  if (index === HONG_ZHONG_INDEX) return 31; // 红中
  if (index >= WIND_START && index <= WIND_END) return 41 + (index - WIND_START); // 41~44 (东南西北)
  if (index === FA_CAI_INDEX) return 46; // 发财
  if (index === BAI_BAN_INDEX) return 47; // 白板
  return index;
}

/**
 * 构建 34 维频次向量 counts[34]
 */
export function createCountsVector(tiles: TileIndex[]): number[] {
  const counts = new Array<number>(TOTAL_TILE_TYPES).fill(0);
  for (const t of tiles) {
    const idx = legacyIdToTileIndex(t);
    if (idx >= 0 && idx < TOTAL_TILE_TYPES) {
      counts[idx]++;
    }
  }
  return counts;
}

/**
 * 从 counts[34] 向量还原手牌数组
 */
export function countsToTiles(counts: number[]): TileIndex[] {
  const tiles: TileIndex[] = [];
  for (let i = 0; i < TOTAL_TILE_TYPES; i++) {
    for (let c = 0; c < counts[i]; c++) {
      tiles.push(i);
    }
  }
  return tiles;
}

/**
 * 四大玩法模式专用洗牌与牌库生成器
 * 1. puer (普洱麻将): 136 张全副 (万/条/筒各36张, 东南西北中发白各4张)
 * 2. xuezhan (血战到底): 108 张数字牌 (万/条/筒各36张)
 * 3. guobiao (大众国标): 136 张标准全副 (万/条/筒各36张, 风箭牌各4张)
 * 4. hongzhong (红中血流/赖子): 112 张 (万/条/筒 108 张 + 4 张红中)
 */
export function buildDeckForMode(mode: 'puer' | 'xuezhan' | 'guobiao' | 'hongzhong' | string): TileIndex[] {
  const deck: TileIndex[] = [];

  // 1. 基础 108 张数牌 (万 0~8, 条 9~17, 筒 18~26 各4张)
  for (let i = 0; i <= TONG_END; i++) {
    deck.push(i, i, i, i);
  }

  // 2. 根据模式追加字牌
  if (mode === 'puer' || mode === 'guobiao') {
    // 普洱麻将与国标: 补齐 28 张字牌 (东南西北 27~30, 中发白 31~33 各4张) => 共 136 张
    for (let i = WIND_START; i <= DRAGON_END; i++) {
      deck.push(i, i, i, i);
    }
  } else if (mode === 'hongzhong' || mode === 'hongzhong_xueliu') {
    // 红中赖子: 仅追加 4 张红中 => 共 112 张
    deck.push(HONG_ZHONG_INDEX, HONG_ZHONG_INDEX, HONG_ZHONG_INDEX, HONG_ZHONG_INDEX);
  }
  // xuezhan (血战到底) 保持纯 108 张数牌

  // 3. Fisher-Yates 洗牌算法
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }

  return deck;
}

/**
 * 格式化牌名称
 */
export function getTileDisplayName(tile: TileIndex): string {
  const idx = legacyIdToTileIndex(tile);
  return TILE_NAMES_34[idx] || `未知牌(${tile})`;
}

/**
 * 手牌理牌排序 (按 万、条、筒、风、箭 升序，红中百搭若有可排在最右侧或最左侧)
 */
export function sortHandTiles(tiles: TileIndex[], hongzhongAsWild = false): TileIndex[] {
  return [...tiles].sort((a, b) => {
    const idxA = legacyIdToTileIndex(a);
    const idxB = legacyIdToTileIndex(b);
    if (hongzhongAsWild) {
      if (idxA === HONG_ZHONG_INDEX && idxB !== HONG_ZHONG_INDEX) return 1;
      if (idxA !== HONG_ZHONG_INDEX && idxB === HONG_ZHONG_INDEX) return -1;
    }
    return idxA - idxB;
  });
}
