import type { Texture } from 'pixi.js';
import {
  DDZ_PNG_FRAME_SEQUENCES,
  DDZ_SPRITE_ATLAS_MANIFEST,
  spriteSheetManager,
  type DdzSpriteAtlasKey,
  type ParsedSpriteAtlas,
  type SlicedSpriteFrame,
} from './SpriteSheetManager';

/**
 * All supported Dou Dizhu competitive VFX Action IDs that `SpriteAnimationEngine`
 * can query and play directly via `SpriteSheetRegistry`.
 */
export type DdzVfxActionId =
  | 'deal_cards'
  | 'call_landlord'
  | 'grab_landlord'
  | 'landlord_confirmed'
  | 'hole_card_bonus'
  | 'double_score'
  | 'super_double'
  | 'open_hand'
  | 'bomb'
  | 'laizi_bomb'
  | 'super_bomb'
  | 'rocket'
  | 'airplane'
  | 'straight'
  | 'consecutive_pairs'
  | 'three_with_wing'
  | 'four_with_two'
  | 'spring'
  | 'anti_spring'
  | 'alarm_single'
  | 'alarm_double'
  | 'victory'
  | 'defeat'
  | 'prop_flower'
  | 'prop_bomb_cup'
  | 'prop_tea'
  | 'prop_like'
  | 'prop_ingot';

/**
 * Single animation layer descriptor within a composite competitive VFX action.
 */
export interface ActionAnimationLayerSpec {
  /** Atlas key in `DDZ_SPRITE_ATLAS_MANIFEST` or sequence key in `DDZ_PNG_FRAME_SEQUENCES` */
  sheetKey: DdzSpriteAtlasKey | 'classic_bomb' | 'joker_bomb' | 'escort_plane' | string;
  /** Named animation inside the JSON descriptor (defaults to `'default'`) */
  animationName: string;
  /** Playback rate in frames per second */
  fps: number;
  /** Default uniform render scale */
  scale: number;
  /** Default opacity (0..1) */
  alpha: number;
  /** Optional relative X offset in virtual stage pixels */
  offsetX?: number;
  /** Optional relative Y offset in virtual stage pixels */
  offsetY?: number;
  /** Optional stagger delay in milliseconds before this layer starts */
  delayMs?: number;
  /** Whether the animation loops continuously */
  loop?: boolean;
}

/**
 * Complete registry entry mapping a competitive `DdzVfxActionId` to its primary
 * and composite JSON+PNG SpriteSheet layers.
 */
export interface DdzActionRegistryEntry {
  actionId: DdzVfxActionId;
  label: string;
  /** Whether this action's atlases must be preloaded on table entry */
  preloadOnEntry: boolean;
  /** Primary animation layer used when calling `playByActionId` or `getTexturesByActionId` */
  primary: ActionAnimationLayerSpec;
  /** Additional synchronized SpriteSheet layers for multi-layer Canvas2D / PixiJS bursts */
  layers: ActionAnimationLayerSpec[];
}

/**
 * Predefined JSON + PNG Atlas Index mapping every SpriteSheet key to its JSON descriptor,
 * PNG texture atlas path, and default animation sequences.
 */
export const SPRITESHEET_JSON_INDEX: Record<
  DdzSpriteAtlasKey,
  {
    key: DdzSpriteAtlasKey;
    jsonUrl: string;
    imageUrl: string;
    core: boolean;
    animations: readonly string[];
  }
> = {
  bomb: {
    key: 'bomb',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.bomb.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.bomb.imageUrl,
    core: false,
    animations: ['default', 'explode'],
  },
  zd: {
    key: 'zd',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.zd.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.zd.imageUrl,
    core: true,
    animations: ['default', 'shockwave', 'explode'],
  },
  baodian: {
    key: 'baodian',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.baodian.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.baodian.imageUrl,
    core: true,
    animations: ['default', 'burst'],
  },
  guang: {
    key: 'guang',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.guang.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.guang.imageUrl,
    core: true,
    animations: ['default', 'gold_sweep', 'sweep'],
  },
  air: {
    key: 'air',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.air.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.air.imageUrl,
    core: false,
    animations: ['default', 'fly'],
  },
  alarm: {
    key: 'alarm',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.alarm.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.alarm.imageUrl,
    core: false,
    animations: ['default', 'siren'],
  },
  texiaozi: {
    key: 'texiaozi',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.texiaozi.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.texiaozi.imageUrl,
    core: true,
    animations: ['default'],
  },
  emoji: {
    key: 'emoji',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.emoji.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.emoji.imageUrl,
    core: false,
    animations: ['default'],
  },
  expression: {
    key: 'expression',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.expression.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.expression.imageUrl,
    core: false,
    animations: ['default'],
  },
  ds: {
    key: 'ds',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.ds.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.ds.imageUrl,
    core: false,
    animations: ['default'],
  },
  sld: {
    key: 'sld',
    jsonUrl: DDZ_SPRITE_ATLAS_MANIFEST.sld.jsonUrl,
    imageUrl: DDZ_SPRITE_ATLAS_MANIFEST.sld.imageUrl,
    core: false,
    animations: ['default'],
  },
};

/**
 * Authoritative Action-ID -> SpriteSheet Animation Registry (`DDZ_ACTION_ANIMATION_REGISTRY`)
 * Maps every competitive Dou Dizhu action to high-definition JSON+PNG SpriteSheet sequences.
 */
export const DDZ_ACTION_ANIMATION_REGISTRY: Record<DdzVfxActionId, DdzActionRegistryEntry> = {
  deal_cards: {
    actionId: 'deal_cards',
    label: '发牌流光',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 24,
      scale: 1.18,
      alpha: 0.92,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.18,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 24,
        scale: 0.92,
        alpha: 0.88,
      },
    ],
  },
  call_landlord: {
    actionId: 'call_landlord',
    label: '叫地主',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 22,
      scale: 1.15,
      alpha: 0.92,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.15,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.95,
        alpha: 0.9,
      },
    ],
  },
  grab_landlord: {
    actionId: 'grab_landlord',
    label: '抢地主 ×2',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'zd',
      animationName: 'shockwave',
      fps: 24,
      scale: 0.58,
      alpha: 0.88,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 24,
        scale: 0.58,
        alpha: 0.88,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.25,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.1,
        alpha: 0.92,
      },
    ],
  },
  landlord_confirmed: {
    actionId: 'landlord_confirmed',
    label: '地主确认',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'zd',
      animationName: 'shockwave',
      fps: 22,
      scale: 0.72,
      alpha: 0.9,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 0.72,
        alpha: 0.9,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 20,
        scale: 1.35,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.0,
        alpha: 0.9,
        offsetX: -70,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.0,
        alpha: 0.9,
        offsetX: 70,
      },
    ],
  },
  hole_card_bonus: {
    actionId: 'hole_card_bonus',
    label: '底牌奇牌暴击',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 24,
      scale: 1.35,
      alpha: 0.96,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 24,
        scale: 0.72,
        alpha: 0.9,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.35,
        alpha: 0.96,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.15,
        alpha: 0.92,
      },
    ],
  },
  double_score: {
    actionId: 'double_score',
    label: '加倍 ×2',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 22,
      scale: 1.1,
      alpha: 0.9,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.1,
        alpha: 0.9,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.95,
        alpha: 0.88,
      },
    ],
  },
  super_double: {
    actionId: 'super_double',
    label: '超级加倍 ×4',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'zd',
      animationName: 'shockwave',
      fps: 24,
      scale: 0.68,
      alpha: 0.92,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 24,
        scale: 0.68,
        alpha: 0.92,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.3,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.15,
        alpha: 0.92,
      },
    ],
  },
  open_hand: {
    actionId: 'open_hand',
    label: '明牌高倍博弈',
    preloadOnEntry: true,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 24,
      scale: 1.32,
      alpha: 0.95,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 24,
        scale: 0.65,
        alpha: 0.9,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.32,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.12,
        alpha: 0.92,
      },
    ],
  },
  bomb: {
    actionId: 'bomb',
    label: '炸弹 ×2',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'classic_bomb',
      animationName: 'default',
      fps: 22,
      scale: 1.55,
      alpha: 0.98,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 0.95,
        alpha: 0.88,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.35,
        alpha: 0.92,
      },
    ],
  },
  laizi_bomb: {
    actionId: 'laizi_bomb',
    label: '癞子炸弹 ×2',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'classic_bomb',
      animationName: 'default',
      fps: 22,
      scale: 1.6,
      alpha: 0.98,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 1.0,
        alpha: 0.9,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.4,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.35,
        alpha: 0.92,
      },
    ],
  },
  super_bomb: {
    actionId: 'super_bomb',
    label: '天罡八张炸 ×4',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'joker_bomb',
      animationName: 'default',
      fps: 22,
      scale: 1.75,
      alpha: 1.0,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 1.2,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.4,
        alpha: 0.94,
      },
    ],
  },
  rocket: {
    actionId: 'rocket',
    label: '王炸 ×2',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'joker_bomb',
      animationName: 'default',
      fps: 20,
      scale: 1.85,
      alpha: 1.0,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 1.25,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.3,
        alpha: 0.9,
        offsetX: -85,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.3,
        alpha: 0.9,
        offsetX: 85,
      },
    ],
  },
  airplane: {
    actionId: 'airplane',
    label: '飞机掠过',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'air',
      animationName: 'fly',
      fps: 24,
      scale: 1.15,
      alpha: 0.96,
    },
    layers: [
      {
        sheetKey: 'air',
        animationName: 'fly',
        fps: 24,
        scale: 1.15,
        alpha: 0.96,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.35,
        alpha: 0.9,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.1,
        alpha: 0.88,
      },
    ],
  },
  straight: {
    actionId: 'straight',
    label: '顺子流光',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 22,
      scale: 1.45,
      alpha: 0.94,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.45,
        alpha: 0.94,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.15,
        alpha: 0.9,
      },
    ],
  },
  consecutive_pairs: {
    actionId: 'consecutive_pairs',
    label: '连对星芒',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'baodian',
      animationName: 'default',
      fps: 22,
      scale: 1.2,
      alpha: 0.92,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.3,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.15,
        alpha: 0.9,
        offsetX: -80,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.15,
        alpha: 0.9,
        offsetX: 80,
      },
    ],
  },
  three_with_wing: {
    actionId: 'three_with_wing',
    label: '三带一/对',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'baodian',
      animationName: 'default',
      fps: 22,
      scale: 0.9,
      alpha: 0.88,
    },
    layers: [
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.9,
        alpha: 0.88,
      },
    ],
  },
  four_with_two: {
    actionId: 'four_with_two',
    label: '四带二',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'zd',
      animationName: 'shockwave',
      fps: 24,
      scale: 0.65,
      alpha: 0.9,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 24,
        scale: 0.65,
        alpha: 0.9,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.1,
        alpha: 0.9,
      },
    ],
  },
  spring: {
    actionId: 'spring',
    label: '春天 ×2',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 20,
      scale: 1.65,
      alpha: 0.96,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 20,
        scale: 1.15,
        alpha: 0.88,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 20,
        scale: 1.65,
        alpha: 0.96,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.35,
        alpha: 0.92,
      },
    ],
  },
  anti_spring: {
    actionId: 'anti_spring',
    label: '反春 ×2',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 20,
      scale: 1.65,
      alpha: 0.96,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 20,
        scale: 1.15,
        alpha: 0.88,
      },
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 20,
        scale: 1.65,
        alpha: 0.96,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 20,
        scale: 1.35,
        alpha: 0.92,
      },
    ],
  },
  alarm_single: {
    actionId: 'alarm_single',
    label: '报单警报',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'alarm',
      animationName: 'siren',
      fps: 18,
      scale: 0.95,
      alpha: 0.95,
    },
    layers: [
      {
        sheetKey: 'alarm',
        animationName: 'siren',
        fps: 18,
        scale: 0.95,
        alpha: 0.95,
      },
    ],
  },
  alarm_double: {
    actionId: 'alarm_double',
    label: '报双警报',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'alarm',
      animationName: 'siren',
      fps: 18,
      scale: 0.92,
      alpha: 0.95,
    },
    layers: [
      {
        sheetKey: 'alarm',
        animationName: 'siren',
        fps: 18,
        scale: 0.92,
        alpha: 0.95,
      },
    ],
  },
  victory: {
    actionId: 'victory',
    label: '胜利庆典',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 22,
      scale: 1.45,
      alpha: 0.95,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 1.45,
        alpha: 0.95,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 1.25,
        alpha: 0.92,
      },
    ],
  },
  defeat: {
    actionId: 'defeat',
    label: '惜败',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'zd',
      animationName: 'shockwave',
      fps: 20,
      scale: 0.65,
      alpha: 0.75,
    },
    layers: [
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 20,
        scale: 0.65,
        alpha: 0.75,
      },
    ],
  },
  prop_flower: {
    actionId: 'prop_flower',
    label: '鲜花互动',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'baodian',
      animationName: 'default',
      fps: 22,
      scale: 0.95,
      alpha: 0.9,
    },
    layers: [
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.95,
        alpha: 0.9,
      },
    ],
  },
  prop_bomb_cup: {
    actionId: 'prop_bomb_cup',
    label: '炸弹互动',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'bomb',
      animationName: 'explode',
      fps: 22,
      scale: 0.95,
      alpha: 0.95,
    },
    layers: [
      {
        sheetKey: 'bomb',
        animationName: 'explode',
        fps: 22,
        scale: 0.95,
        alpha: 0.95,
      },
      {
        sheetKey: 'zd',
        animationName: 'shockwave',
        fps: 22,
        scale: 0.55,
        alpha: 0.85,
      },
    ],
  },
  prop_tea: {
    actionId: 'prop_tea',
    label: '敬茶互动',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 22,
      scale: 0.9,
      alpha: 0.88,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 22,
        scale: 0.9,
        alpha: 0.88,
      },
    ],
  },
  prop_like: {
    actionId: 'prop_like',
    label: '点赞互动',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'baodian',
      animationName: 'default',
      fps: 22,
      scale: 0.95,
      alpha: 0.9,
    },
    layers: [
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.95,
        alpha: 0.9,
      },
    ],
  },
  prop_ingot: {
    actionId: 'prop_ingot',
    label: '金元宝互动',
    preloadOnEntry: false,
    primary: {
      sheetKey: 'guang',
      animationName: 'gold_sweep',
      fps: 24,
      scale: 1.05,
      alpha: 0.92,
    },
    layers: [
      {
        sheetKey: 'guang',
        animationName: 'gold_sweep',
        fps: 24,
        scale: 1.05,
        alpha: 0.92,
      },
      {
        sheetKey: 'baodian',
        animationName: 'default',
        fps: 22,
        scale: 0.95,
        alpha: 0.9,
      },
    ],
  },
};

/**
 * Alias map normalizing server pattern types (`BOMB`, `ROCKET`, `AIRPLANE_SINGLE_WINGS`, etc.)
 * and UI event names into canonical `DdzVfxActionId` keys.
 */
const ACTION_ID_ALIASES: Record<string, DdzVfxActionId> = {
  BOMB: 'bomb',
  LAIZI_BOMB: 'laizi_bomb',
  PURE_LAIZI_BOMB: 'laizi_bomb',
  SUPER_BOMB: 'super_bomb',
  ROCKET: 'rocket',
  AIRPLANE: 'airplane',
  AIRPLANE_SINGLE_WINGS: 'airplane',
  AIRPLANE_PAIR_WINGS: 'airplane',
  STRAIGHT: 'straight',
  CONSECUTIVE_PAIRS: 'consecutive_pairs',
  THREE_WITH_SINGLE: 'three_with_wing',
  THREE_WITH_PAIR: 'three_with_wing',
  FOUR_WITH_TWO_SINGLES: 'four_with_two',
  FOUR_WITH_TWO_PAIRS: 'four_with_two',
  SPRING: 'spring',
  ANTI_SPRING: 'anti_spring',
};

/**
 * SpriteSheetRegistry — Predefined Competitive VFX JSON Index & Automatic PNG Atlas Loader
 *
 * Bridges competitive Dou Dizhu Action IDs (`deal_cards`, `call_landlord`, `grab_landlord`,
 * `hole_card_bonus`, `open_hand`, `bomb`, `rocket`, `airplane`, `spring`, etc.) with
 * `SpriteSheetManager`'s parsed PixiJS v8 `Texture` and Canvas2D frame slices.
 */
export class SpriteSheetRegistry {
  private autoLoadStarted = false;

  constructor() {
    // Automatically kick off background loading of core JSON+PNG atlases in browser runtime
    if (typeof window !== 'undefined') {
      this.triggerAutoPreload();
    }
  }

  /**
   * Automatically triggers core and background PNG texture atlas loading via `spriteSheetManager`.
   */
  public triggerAutoPreload(): void {
    if (this.autoLoadStarted) return;
    this.autoLoadStarted = true;
    void spriteSheetManager.preloadCoreAtlases();
  }

  /**
   * Preloads all core entry-phase JSON + PNG texture atlases (`baodian`, `guang`, `zd`, `texiaozi`).
   */
  public async preloadCoreActionAtlases(timeoutMs = 450): Promise<void> {
    await spriteSheetManager.preloadCoreAtlases(timeoutMs);
  }

  /**
   * Preloads every registered JSON + PNG texture atlas and numbered PNG sequence in the registry.
   */
  public async preloadAllRegisteredAtlases(): Promise<void> {
    await spriteSheetManager.preloadAllAtlases();
  }

  /**
   * Resolves any action ID or server pattern string (`'bomb'`, `'ROCKET'`, `'AIRPLANE_SINGLE_WINGS'`, etc.)
   * to its canonical `DdzActionRegistryEntry`.
   */
  public resolveActionEntry(actionOrPatternId: DdzVfxActionId | string): DdzActionRegistryEntry | null {
    if (actionOrPatternId in DDZ_ACTION_ANIMATION_REGISTRY) {
      return DDZ_ACTION_ANIMATION_REGISTRY[actionOrPatternId as DdzVfxActionId];
    }
    const upper = actionOrPatternId.toUpperCase();
    const mapped = ACTION_ID_ALIASES[upper] ?? ACTION_ID_ALIASES[actionOrPatternId];
    if (mapped && mapped in DDZ_ACTION_ANIMATION_REGISTRY) {
      return DDZ_ACTION_ANIMATION_REGISTRY[mapped];
    }
    return null;
  }

  /**
   * Ensures all JSON + PNG texture atlases required by a specific `actionId` are loaded and sliced.
   */
  public async ensureActionLoaded(
    actionOrPatternId: DdzVfxActionId | string
  ): Promise<DdzActionRegistryEntry | null> {
    const entry = this.resolveActionEntry(actionOrPatternId);
    if (!entry) return null;

    const allSpecs = [entry.primary, ...entry.layers];
    const uniqueSheetKeys = Array.from(new Set(allSpecs.map((s) => s.sheetKey)));

    await Promise.all(
      uniqueSheetKeys.map(async (key) => {
        if (key in SPRITESHEET_JSON_INDEX) {
          const meta = SPRITESHEET_JSON_INDEX[key as DdzSpriteAtlasKey];
          await spriteSheetManager.loadAtlas(meta.key, meta.jsonUrl, meta.imageUrl);
        } else if (key in DDZ_PNG_FRAME_SEQUENCES) {
          await spriteSheetManager.loadPngSequence(key, DDZ_PNG_FRAME_SEQUENCES[key]);
        }
      })
    );

    return entry;
  }

  /**
   * Retrieves the primary PixiJS v8 `Texture[]` sequence for a given `actionId`.
   */
  public getTexturesByActionId(actionOrPatternId: DdzVfxActionId | string): Texture[] {
    const entry = this.resolveActionEntry(actionOrPatternId);
    if (!entry) return [];

    const primaryTex = spriteSheetManager.getAnimationTextures(
      entry.primary.sheetKey,
      entry.primary.animationName
    );
    if (primaryTex.length > 0) return primaryTex;

    for (const layer of entry.layers) {
      const fallbackTex = spriteSheetManager.getAnimationTextures(
        layer.sheetKey,
        layer.animationName
      );
      if (fallbackTex.length > 0) return fallbackTex;
    }
    return [];
  }

  /**
   * Retrieves the primary `SlicedSpriteFrame[]` sequence for a given `actionId`.
   */
  public getFramesByActionId(actionOrPatternId: DdzVfxActionId | string): SlicedSpriteFrame[] {
    const entry = this.resolveActionEntry(actionOrPatternId);
    if (!entry) return [];

    const primaryFrames = spriteSheetManager.getAnimationFrames(
      entry.primary.sheetKey,
      entry.primary.animationName
    );
    if (primaryFrames.length > 0) return primaryFrames;

    for (const layer of entry.layers) {
      const fallbackFrames = spriteSheetManager.getAnimationFrames(
        layer.sheetKey,
        layer.animationName
      );
      if (fallbackFrames.length > 0) return fallbackFrames;
    }
    return [];
  }

  /**
   * Returns all resolved composite animation layers (with their decoded `SlicedSpriteFrame[]`)
   * for a given competitive `actionId`, ready for `SpriteAnimationEngine` or `DdzTableView` playback.
   */
  public getResolvedLayersByActionId(
    actionOrPatternId: DdzVfxActionId | string
  ): Array<{
    spec: ActionAnimationLayerSpec;
    frames: SlicedSpriteFrame[];
    textures: Texture[];
  }> {
    const entry = this.resolveActionEntry(actionOrPatternId);
    if (!entry) return [];

    return entry.layers
      .map((spec) => {
        const frames = spriteSheetManager.getAnimationFrames(spec.sheetKey, spec.animationName);
        return {
          spec,
          frames,
          textures: frames.map((f) => f.texture),
        };
      })
      .filter((item) => item.frames.length > 0);
  }

  /**
   * Direct access to a loaded `ParsedSpriteAtlas` by its atlas key.
   */
  public async getAtlas(key: DdzSpriteAtlasKey): Promise<ParsedSpriteAtlas | null> {
    const meta = SPRITESHEET_JSON_INDEX[key];
    if (!meta) return null;
    return spriteSheetManager.loadAtlas(meta.key, meta.jsonUrl, meta.imageUrl);
  }
}

export const spriteSheetRegistry = new SpriteSheetRegistry();
