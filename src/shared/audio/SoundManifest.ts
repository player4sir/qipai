/**
 * SoundManifest — Commercial Audio Asset Registry & Mapping Layer
 *
 * Centralizes all background music (BGM), table sound effects (SFX), and male/female character
 * voice mappings for Dou Dizhu (斗地主), Mahjong (麻将), NiuNiu (抢庄牛牛), ZJH (诈金花), and Hall UI.
 * All paths point to authentic pre-recorded .mp3 / .wav assets in `/public/assets/`.
 */

export type VoiceGender = 'male' | 'female';

export type BgmMode = 'lobby' | 'table' | 'exciting';

export type DdzActionVoiceType =
  | 'pass'
  | 'jiabei'
  | 'bujiabei'
  | 'chaojijiabei'
  | 'baojing1'
  | 'baojing2'
  | 'call'
  | 'no_call'
  | 'grab'
  | 'no_grab'
  | 'share';

export type DdzSfxType =
  | 'deal'
  | 'discard'
  | 'bomb'
  | 'long_bomb'
  | 'rocket'
  | 'plane'
  | 'shunzi'
  | 'liandui'
  | 'chuntian'
  | 'spring'
  | 'alert'
  | 'landlord'
  | 'chaojijiabei'
  | 'multiply';

export type MahjongActionVoiceType = 'peng' | 'gang' | 'hu' | 'zimo';

export interface SoundAssetEntry {
  path: string;
  volume?: number;
  cooldownMs?: number;
}

/**
 * Commercial Audio Manifest mapping every game action & pattern to verified `.mp3` / `.wav` paths.
 */
export const SOUND_MANIFEST = {
  /**
   * Background Music Tracks
   */
  bgm: {
    lobby: '/assets/audio/ddz/MusicEx_Welcome.mp3',
    table: '/assets/audio/ddz/MusicEx_Normal.mp3',
    tableAlt: '/assets/audio/ddz/MusicEx_Normal2.mp3',
    exciting: '/assets/audio/ddz/MusicEx_Exciting.mp3',
    winStinger: '/assets/audio/ddz/MusicEx_Win.mp3',
    loseStinger: '/assets/audio/ddz/MusicEx_Lose.mp3',
  },

  /**
   * Global UI & Hall Sound Effects
   */
  ui: {
    tap: '/assets/audio/ddz/SpecOk.mp3',
    cancel: '/assets/audio/ddz/SpecCancelOrReturn.mp3',
    invalid: '/assets/audio/ddz/SpecDisable.mp3',
    cardSelect: '/assets/audio/ddz/SpecSelectCard.mp3',
    cardPlace: '/assets/audio/ddz/Special_Discard.wav',
    cardFlip: '/assets/audio/ddz/Common_fanpai.mp3',
    beanFly: '/assets/audio/ddz/SpecBeanFly.mp3',
    beanWin: '/assets/audio/ddz/SpecBeanMore.mp3',
    beanLose: '/assets/audio/ddz/SpecBeanLess.mp3',
    chestOpen: '/assets/audio/sfx_chest_open.wav',
    countdownTick: '/assets/audio/ddz/Special_Remind.mp3',
  },

  /**
   * Dou Dizhu (斗地主) Table & VFX Sound Effects
   */
  ddzSfx: {
    deal: '/assets/audio/ddz/Special_Dispatch.mp3',
    cardTick: '/assets/audio/ddz/Common_click_cards.mp3',
    cardFan: '/assets/audio/ddz/Common_fanpai.mp3',
    discard: '/assets/audio/ddz/Special_Discard.wav',
    remind: '/assets/audio/ddz/Special_Remind.mp3',
    multiply: '/assets/audio/ddz/Special_Multiply.mp3',
    landlordConfirm: '/assets/audio/ddz/Special_querendizhu.wav',
    chaojijiabei: '/assets/audio/ddz/Special_Chaojijiabei.wav',
    alert: '/assets/audio/ddz/Special_alert.mp3',
    shunzi: '/assets/audio/ddz/Common_shunzi.mp3',
    liandui: '/assets/audio/ddz/Common_continuous_pair.mp3',
    plane: '/assets/audio/ddz/Special_plane.mp3',
    bomb: '/assets/audio/ddz/Special_Bomb.mp3',
    bombNew: '/assets/audio/ddz/Special_Bomb_New.wav',
    longBomb: '/assets/audio/ddz/Special_Long_Bomb.wav',
    rocket: '/assets/audio/ddz/Common_rocket.mp3',
    spring: '/assets/audio/ddz/Special_Chuntian.wav',
    star: '/assets/audio/ddz/Special_star.mp3',
    flower: '/assets/audio/ddz/Special_flower.mp3',
    egg: '/assets/audio/ddz/Special_egg.mp3',
  },

  /**
   * Dou Dizhu Rank Value (3..17) to Voice File Index (1..15)
   * In commercial Huanle Dou Dizhu audio packs:
   * 1 = A (14), 2 = 2 (15), 3..13 = 3..K, 14 = Small Joker (16), 15 = Big Joker (17)
   */
  ddzRankToVoiceIndex: {
    14: 1, // A
    15: 2, // 2
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 11, // J
    12: 12, // Q
    13: 13, // K
    16: 14, // Small Joker
    17: 15, // Big Joker
  } as Record<number, number>,

  /**
   * NiuNiu (抢庄牛牛) Sound Effects
   */
  niuniu: {
    bankerTick: '/assets/audio/niuniu/banker_tick.wav',
    bankerLock: '/assets/audio/niuniu/banker_lock.wav',
    chipBet: '/assets/audio/niuniu/chip_bet.wav',
    cardReveal: '/assets/audio/niuniu/card_reveal.wav',
    highNiuFanfare: '/assets/audio/niuniu/high_niu_fanfare.wav',
  },

  /**
   * ZJH (诈金花) Sound Effects
   */
  zjh: {
    cardPeek: '/assets/audio/zjh/card_peek.wav',
    chipToss: '/assets/audio/zjh/chip_toss.wav',
    chipAllIn: '/assets/audio/zjh/chip_allin.wav',
    foldSlide: '/assets/audio/zjh/fold_slide.wav',
    vsLightning: '/assets/audio/zjh/vs_lightning.wav',
  },

  /**
   * Mahjong (麻将) Sound Effects
   */
  mahjong: {
    deal: '/assets/mahjong/audio/Sepcial_Mahjong_Deal.wav',
    draw: '/assets/mahjong/audio/Sepcial_Mahjong_DrawCard.wav',
    give: '/assets/mahjong/audio/Sepcial_Mahjong_GiveCard.wav',
    insert: '/assets/mahjong/audio/Sepcial_Mahjong_InsertCard.wav',
    wild: '/assets/mahjong/audio/Sepcial_Mahjong_DrawGiveWild.wav',
    beanFly: '/assets/mahjong/audio/Sepcial_Mahjong_BeanFly.wav',
    win: '/assets/mahjong/audio/Sepcial_Mahjong_Win.wav',
    zimo: '/assets/mahjong/audio/Sepcial_Mahjong_Win_Zimo.wav',
    goldCard: '/assets/mahjong/audio/SoundGoldCardShow.wav',
    diceRoll: '/assets/mahjong/audio/Sepcial_Mahjong_P1.wav',
  },
} as const;

/**
 * Resolves the Dou Dizhu voice prefix ('Man' | 'Woman') based on gender flag.
 */
export function getDdzVoicePrefix(isFemale: boolean): 'Man' | 'Woman' {
  return isFemale ? 'Woman' : 'Man';
}

/**
 * Resolves the exact `.mp3` / `.wav` path for a Dou Dizhu card pattern play.
 */
export function resolveDdzCardVoicePath(
  patternType: string,
  mainValue: number,
  isFemale: boolean,
  useBeatingInterjection: boolean = false,
  variantSeed: number = Math.random()
): string | null {
  const prefix = getDdzVoicePrefix(isFemale);
  const idx = SOUND_MANIFEST.ddzRankToVoiceIndex[mainValue] || 0;

  if (
    useBeatingInterjection &&
    [
      'TRIPLE_WITH_ONE',
      'TRIPLE_WITH_PAIR',
      'STRAIGHT',
      'CONSECUTIVE_PAIRS',
      'FOUR_WITH_TWO_SINGLES',
      'FOUR_WITH_TWO_PAIRS',
    ].includes(patternType)
  ) {
    const daniIdx = (Math.floor(variantSeed * 3) % 3) + 1;
    return `/assets/audio/ddz/${prefix}_dani${daniIdx}.mp3`;
  }

  switch (patternType) {
    case 'SINGLE':
      return idx >= 1 && idx <= 15 ? `/assets/audio/ddz/${prefix}_${idx}.mp3` : null;
    case 'PAIR':
      return idx >= 1 && idx <= 13 ? `/assets/audio/ddz/${prefix}_dui${idx}.mp3` : null;
    case 'TRIPLE':
      return idx >= 1 && idx <= 13 ? `/assets/audio/ddz/${prefix}_tuple${idx}.mp3` : null;
    case 'TRIPLE_WITH_ONE':
      return `/assets/audio/ddz/${prefix}_sandaiyi.mp3`;
    case 'TRIPLE_WITH_PAIR':
      return `/assets/audio/ddz/${prefix}_sandaiyidui.mp3`;
    case 'STRAIGHT':
      return `/assets/audio/ddz/${prefix}_shunzi.mp3`;
    case 'CONSECUTIVE_PAIRS':
      return `/assets/audio/ddz/${prefix}_liandui.mp3`;
    case 'AIRPLANE':
    case 'AIRPLANE_WITH_WINGS':
    case 'AIRPLANE_SINGLE_WINGS':
    case 'AIRPLANE_PAIR_WINGS':
      return `/assets/audio/ddz/${prefix}_feiji.mp3`;
    case 'FOUR_WITH_TWO':
    case 'FOUR_WITH_TWO_SINGLES':
      return `/assets/audio/ddz/${prefix}_sidaier.mp3`;
    case 'FOUR_WITH_TWO_PAIRS':
      return `/assets/audio/ddz/${prefix}_sidailiangdui.mp3`;
    case 'BOMB':
    case 'LAIZI_BOMB':
    case 'PURE_LAIZI_BOMB':
    case 'SUPER_BOMB':
      return `/assets/audio/ddz/${prefix}_zhadan.mp3`;
    case 'ROCKET':
      return `/assets/audio/ddz/${prefix}_wangzha.mp3`;
    default:
      return null;
  }
}

/**
 * Resolves the exact `.mp3` / `.wav` path for a Dou Dizhu bidding/doubling/pass/alert action.
 */
export function resolveDdzActionVoicePath(
  action: DdzActionVoiceType,
  isFemale: boolean,
  grabCount: number = 1,
  variantSeed: number = Math.random()
): string {
  const prefix = getDdzVoicePrefix(isFemale);

  switch (action) {
    case 'pass': {
      const r = (Math.floor(variantSeed * 4) % 4) + 1;
      return `/assets/audio/ddz/${prefix}_buyao${r}.mp3`;
    }
    case 'call':
      return `/assets/audio/ddz/${prefix}_Order.mp3`;
    case 'no_call':
      return `/assets/audio/ddz/${prefix}_NoOrder.mp3`;
    case 'grab': {
      const robIdx = Math.max(1, Math.min(3, grabCount || (Math.floor(variantSeed * 3) % 3) + 1));
      return `/assets/audio/ddz/${prefix}_Rob${robIdx}.mp3`;
    }
    case 'no_grab':
      return `/assets/audio/ddz/${prefix}_NoRob.mp3`;
    case 'jiabei':
      return `/assets/audio/ddz/${prefix}_jiabei.mp3`;
    case 'bujiabei':
      return `/assets/audio/ddz/${prefix}_bujiabei.mp3`;
    case 'chaojijiabei':
      return isFemale ? '/assets/audio/ddz/Woman_chaojijiabei.mp3' : '/assets/audio/ddz/chaojijiabei.wav';
    case 'baojing1':
      return `/assets/audio/ddz/${prefix}_baojing1.mp3`;
    case 'baojing2':
      return `/assets/audio/ddz/${prefix}_baojing2.mp3`;
    case 'share':
      return `/assets/audio/ddz/${prefix}_Share.mp3`;
  }
}

/**
 * Resolves the `.mp3` path for a quick-chat message line (`Man_chat_1..9.mp3` / `Woman_chat_1..9.mp3`).
 */
export function resolveDdzQuickChatVoicePath(text: string, isFemale: boolean): string {
  const prefix = getDdzVoicePrefix(isFemale);
  let idx = 1;
  if (text.includes('快点') || text.includes('花儿')) idx = 1;
  else if (text.includes('打得真好') || text.includes('合作愉快') || text.includes('厉害')) idx = 2;
  else if (text.includes('不要走') || text.includes('决战到天亮')) idx = 3;
  else if (text.includes('你是MM') || text.includes('交个朋友')) idx = 4;
  else if (text.includes('炸') || text.includes('小心')) idx = 5;
  else if (text.includes('底牌') || text.includes('惊喜')) idx = 6;
  else if (text.includes('撤') || text.includes('下次')) idx = 7;
  else {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    idx = (Math.abs(hash) % 9) + 1;
  }
  return `/assets/audio/ddz/${prefix}_chat_${idx}.mp3`;
}

/**
 * Resolves Mahjong tile discard voice (`mjt1_1..9`, `mjt2_1..9`, `mjt3_1..9`, `mjt4_1..7`).
 */
export function resolveMahjongTileVoicePath(tileId: string, gender: VoiceGender = 'male'): string | null {
  const clean = tileId.trim().toLowerCase();
  const folder = gender === 'female' ? 'female' : 'male';

  // Map standard mahjong tile IDs (e.g., wan_1..9, tong_1..9, tiao_1..9, wind/dragon)
  const matchSuit = clean.match(/^(wan|tong|bing|tiao|suo|zi|honor)[_-]?(\d)$/i);
  if (matchSuit) {
    const suit = matchSuit[1].toLowerCase();
    const num = parseInt(matchSuit[2], 10);
    if (suit === 'wan' && num >= 1 && num <= 9) {
      return `/assets/mahjong/audio/voice/${folder}/mjt1_${num}.mp3`;
    }
    if ((suit === 'tong' || suit === 'bing') && num >= 1 && num <= 9) {
      return `/assets/mahjong/audio/voice/${folder}/mjt2_${num}.mp3`;
    }
    if ((suit === 'tiao' || suit === 'suo') && num >= 1 && num <= 9) {
      return `/assets/mahjong/audio/voice/${folder}/mjt3_${num}.mp3`;
    }
    if ((suit === 'zi' || suit === 'honor') && num >= 1 && num <= 7) {
      return `/assets/mahjong/audio/voice/${folder}/mjt4_${num}.mp3`;
    }
  }

  // Direct mjt code (e.g., mjt1_3)
  if (/^mjt[1-4]_[1-9]$/.test(clean)) {
    return `/assets/mahjong/audio/voice/${folder}/${clean}.mp3`;
  }

  // Fallback deterministic tile voice
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) | 0;
  }
  const rank = (Math.abs(hash) % 9) + 1;
  return `/assets/mahjong/audio/voice/${folder}/mjt1_${rank}.mp3`;
}

/**
 * List of core Dou Dizhu audio paths preloaded when entering the Dou Dizhu arena.
 */
export const DDZ_PRELOAD_MANIFEST: readonly string[] = [
  SOUND_MANIFEST.ui.cardSelect,
  SOUND_MANIFEST.ui.tap,
  SOUND_MANIFEST.ui.cancel,
  SOUND_MANIFEST.ui.invalid,
  SOUND_MANIFEST.ui.cardFlip,
  SOUND_MANIFEST.ddzSfx.deal,
  SOUND_MANIFEST.ddzSfx.cardTick,
  SOUND_MANIFEST.ddzSfx.discard,
  SOUND_MANIFEST.ddzSfx.remind,
  SOUND_MANIFEST.ddzSfx.multiply,
  SOUND_MANIFEST.ddzSfx.landlordConfirm,
  SOUND_MANIFEST.ddzSfx.chaojijiabei,
  SOUND_MANIFEST.ddzSfx.alert,
  SOUND_MANIFEST.ddzSfx.plane,
  SOUND_MANIFEST.ddzSfx.bomb,
  SOUND_MANIFEST.ddzSfx.bombNew,
  SOUND_MANIFEST.ddzSfx.longBomb,
  SOUND_MANIFEST.ddzSfx.rocket,
  SOUND_MANIFEST.ddzSfx.shunzi,
  SOUND_MANIFEST.ddzSfx.liandui,
  SOUND_MANIFEST.ddzSfx.spring,
  '/assets/audio/ddz/Man_Order.mp3',
  '/assets/audio/ddz/Woman_Order.mp3',
  '/assets/audio/ddz/Man_NoOrder.mp3',
  '/assets/audio/ddz/Woman_NoOrder.mp3',
  '/assets/audio/ddz/Man_Rob1.mp3',
  '/assets/audio/ddz/Woman_Rob1.mp3',
  '/assets/audio/ddz/Man_NoRob.mp3',
  '/assets/audio/ddz/Woman_NoRob.mp3',
  '/assets/audio/ddz/Man_jiabei.mp3',
  '/assets/audio/ddz/Woman_jiabei.mp3',
  '/assets/audio/ddz/Man_bujiabei.mp3',
  '/assets/audio/ddz/Woman_bujiabei.mp3',
];

/**
 * List of core Mahjong audio paths preloaded when entering the Mahjong arena.
 */
export const MAHJONG_PRELOAD_MANIFEST: readonly string[] = [
  SOUND_MANIFEST.mahjong.deal,
  SOUND_MANIFEST.mahjong.draw,
  SOUND_MANIFEST.mahjong.give,
  SOUND_MANIFEST.mahjong.wild,
  SOUND_MANIFEST.mahjong.beanFly,
  SOUND_MANIFEST.mahjong.win,
  SOUND_MANIFEST.mahjong.zimo,
  SOUND_MANIFEST.mahjong.diceRoll,
  '/assets/mahjong/audio/voice/male/peng.mp3',
  '/assets/mahjong/audio/voice/male/gang.mp3',
  '/assets/mahjong/audio/voice/male/hu.mp3',
  '/assets/mahjong/audio/voice/male/zimo.mp3',
  '/assets/mahjong/audio/voice/female/peng.mp3',
  '/assets/mahjong/audio/voice/female/gang.mp3',
  '/assets/mahjong/audio/voice/female/hu.mp3',
  '/assets/mahjong/audio/voice/female/zimo.mp3',
];
