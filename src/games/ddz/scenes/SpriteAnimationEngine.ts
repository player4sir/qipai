import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { spriteSheetManager } from '../assets/SpriteSheetManager';
import {
  spriteSheetRegistry,
  type ActionAnimationLayerSpec,
  type DdzActionRegistryEntry,
  type DdzVfxActionId,
} from '../assets/SpriteSheetRegistry';

export { spriteSheetRegistry, type DdzVfxActionId, type DdzActionRegistryEntry };

/**
 * Standard TexturePacker JSON Frame Entry (`JSON + PNG` SpriteSheet specification)
 */
export interface SpriteSheetJsonFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
}

/**
 * Standard TexturePacker JSON SpriteSheet Descriptor
 */
export interface SpriteSheetJsonData {
  frames: Record<string, SpriteSheetJsonFrame>;
  animations?: Record<string, string[]>;
  meta?: {
    app?: string;
    version?: string;
    image: string;
    format?: string;
    size?: { w: number; h: number };
    scale?: string | number;
  };
}

export interface SpritePlayOptions {
  x: number;
  y: number;
  fps?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  loop?: boolean;
  rotation?: number;
  tint?: number;
  alpha?: number;
  onComplete?: () => void;
}

export interface DecodedCanvasFrame {
  name: string;
  canvas: HTMLCanvasElement;
  texture: Texture;
  width: number;
  height: number;
}

export interface ParsedSpriteSheet {
  key: string;
  jsonUrl: string;
  imageUrl: string;
  frames: Map<string, DecodedCanvasFrame>;
  animations: Map<string, DecodedCanvasFrame[]>;
  orderedFrames: DecodedCanvasFrame[];
}

export type DdzDynamicEffectType = DdzVfxActionId;

export interface DdzDynamicEffectEvent {
  id: string;
  type: DdzDynamicEffectType;
  x: number; // Normalized 0..1 or virtual stage coordinate
  y: number;
  label?: string;
  seat?: 'bottom' | 'left' | 'right' | 'center';
  durationMs?: number;
  timestamp: number;
}

/**
 * Commercial Dou Dizhu SpriteSheet Manifest (`JSON + PNG` pairs in `/public/assets/vfx/`)
 */
export const DDZ_SPRITESHEET_MANIFEST = {
  bomb: {
    jsonUrl: '/assets/vfx/bomb.json',
    imageUrl: '/assets/vfx/bomb.png',
  },
  zd: {
    jsonUrl: '/assets/vfx/zd.json',
    imageUrl: '/assets/vfx/zd.png',
  },
  baodian: {
    jsonUrl: '/assets/vfx/baodian.json',
    imageUrl: '/assets/vfx/baodian.png',
  },
  guang: {
    jsonUrl: '/assets/vfx/guang.json',
    imageUrl: '/assets/vfx/guang.png',
  },
  air: {
    jsonUrl: '/assets/vfx/air.json',
    imageUrl: '/assets/vfx/air.png',
  },
  alarm: {
    jsonUrl: '/assets/vfx/alarm.json',
    imageUrl: '/assets/vfx/alarm.png',
  },
  texiaozi: {
    jsonUrl: '/assets/vfx/texiaozi.json',
    imageUrl: '/assets/vfx/texiaozi.png',
  },
  emoji: {
    jsonUrl: '/assets/vfx/emoji.json',
    imageUrl: '/assets/vfx/emoji.png',
  },
  expression: {
    jsonUrl: '/assets/vfx/expression.json',
    imageUrl: '/assets/vfx/expression.png',
  },
} as const;

export type DdzSpriteSheetKey = keyof typeof DDZ_SPRITESHEET_MANIFEST;

/**
 * SpriteAnimationEngine — Commercial JSON + PNG SpriteSheet Parser & High-Dynamic VFX Renderer
 */
export class SpriteAnimationEngine {
  private sheetCache: Map<string, ParsedSpriteSheet> = new Map();
  private loadingSheets: Map<string, Promise<ParsedSpriteSheet | null>> = new Map();
  private sequenceCache: Map<string, DecodedCanvasFrame[]> = new Map();
  private loadingSequences: Map<string, Promise<DecodedCanvasFrame[]>> = new Map();
  private preloadPromise: Promise<void> | null = null;

  private listeners: Set<(evt: DdzDynamicEffectEvent) => void> = new Set();

  /**
   * Fast-path preload for the entry deal & bidding SpriteSheets (`baodian`, `guang`, `zd`)
   * with a 450ms timeout guard so table entry never blocks on secondary assets, while kicking off
   * full background preload of all remaining sheets.
   */
  public async preloadCoreDdzSpriteSheets(): Promise<void> {
    await spriteSheetManager.preloadCoreAtlases();
  }

  /**
   * Preloads all core Dou Dizhu JSON + PNG SpriteSheets (`bomb`, `zd`, `baodian`, `guang`, `air`, `alarm`, `texiaozi`)
   * and frame sequences (`classic_bomb`, `joker_bomb`, `escort_plane`).
   */
  public preloadAllDdzSpriteSheets(): Promise<void> {
    if (this.preloadPromise) return this.preloadPromise;

    this.preloadPromise = (async () => {
      await spriteSheetManager.preloadAllAtlases();
    })();

    return this.preloadPromise;
  }

  /**
   * Loads and parses a JSON + PNG SpriteSheet pair into unrotated, trim-restored `DecodedCanvasFrame` objects.
   */
  public async loadSpriteSheet(
    key: string,
    jsonUrl: string,
    explicitImageUrl?: string
  ): Promise<ParsedSpriteSheet | null> {
    const cached = this.sheetCache.get(key);
    if (cached) return cached;

    const inFlight = this.loadingSheets.get(key);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<ParsedSpriteSheet | null> => {
      try {
        const res = await fetch(jsonUrl);
        if (!res.ok) return null;
        const jsonData = (await res.json()) as SpriteSheetJsonData;
        if (!jsonData || !jsonData.frames) return null;

        const baseDir = jsonUrl.substring(0, jsonUrl.lastIndexOf('/') + 1);
        const imageUrl =
          explicitImageUrl ||
          (jsonData.meta?.image ? `${baseDir}${jsonData.meta.image}` : jsonUrl.replace(/\.json$/i, '.png'));

        const sheetTexture = await Assets.load<Texture>(imageUrl);
        if (!sheetTexture) return null;

        const rawImage = sheetTexture.source?.resource as CanvasImageSource | undefined;
        const framesMap = new Map<string, DecodedCanvasFrame>();

        const frameEntries = Object.entries(jsonData.frames);
        for (const [frameName, def] of frameEntries) {
          const decoded = this.sliceFrameFromSheet(frameName, sheetTexture, rawImage, def);
          if (decoded) {
            framesMap.set(frameName, decoded);
          }
        }

        const sortedKeys = Array.from(framesMap.keys()).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );
        const orderedFrames = sortedKeys
          .map((k) => framesMap.get(k))
          .filter((f): f is DecodedCanvasFrame => Boolean(f));

        const animationsMap = new Map<string, DecodedCanvasFrame[]>();
        animationsMap.set('default', orderedFrames);

        if (jsonData.animations) {
          for (const [animName, frameNames] of Object.entries(jsonData.animations)) {
            const seq = frameNames
              .map((fn) => framesMap.get(fn))
              .filter((f): f is DecodedCanvasFrame => Boolean(f));
            if (seq.length > 0) {
              animationsMap.set(animName, seq);
            }
          }
        }

        const parsed: ParsedSpriteSheet = {
          key,
          jsonUrl,
          imageUrl,
          frames: framesMap,
          animations: animationsMap,
          orderedFrames,
        };

        this.sheetCache.set(key, parsed);
        return parsed;
      } catch {
        return null;
      } finally {
        this.loadingSheets.delete(key);
      }
    })();

    this.loadingSheets.set(key, promise);
    return promise;
  }

  /**
   * Loads a numbered list of individual PNG files as a named frame sequence.
   */
  public async loadFrameSequence(
    sequenceKey: string,
    urls: string[]
  ): Promise<DecodedCanvasFrame[]> {
    const cached = this.sequenceCache.get(sequenceKey);
    if (cached) return cached;

    const inFlight = this.loadingSequences.get(sequenceKey);
    if (inFlight) return inFlight;

    const promise = (async (): Promise<DecodedCanvasFrame[]> => {
      const results: DecodedCanvasFrame[] = [];
      const textures = await Promise.all(
        urls.map(async (u) => {
          try {
            return await Assets.load<Texture>(u);
          } catch {
            return null;
          }
        })
      );

      textures.forEach((tex, idx) => {
        if (!tex) return;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, tex.width);
        canvas.height = Math.max(1, tex.height);
        const ctx = canvas.getContext('2d');
        const raw = tex.source?.resource as CanvasImageSource | undefined;
        if (ctx && raw) {
          try {
            ctx.drawImage(raw, 0, 0);
          } catch {}
        }
        results.push({
          name: `${sequenceKey}_${idx}`,
          canvas,
          texture: tex,
          width: tex.width,
          height: tex.height,
        });
      });

      if (results.length > 0) {
        this.sequenceCache.set(sequenceKey, results);
      }
      this.loadingSequences.delete(sequenceKey);
      return results;
    })();

    this.loadingSequences.set(sequenceKey, promise);
    return promise;
  }

  /**
   * Slices a single frame from a JSON+PNG SpriteSheet, automatically unrotating 90° CW
   * TexturePacker frames and restoring `spriteSourceSize` trim offsets.
   */
  private sliceFrameFromSheet(
    frameName: string,
    sheetTexture: Texture,
    rawImage: CanvasImageSource | undefined,
    def: SpriteSheetJsonFrame
  ): DecodedCanvasFrame | null {
    const { x, y, w, h } = def.frame;
    if (w <= 0 || h <= 0) return null;

    const rotated = Boolean(def.rotated);
    const trimX = def.spriteSourceSize?.x ?? 0;
    const trimY = def.spriteSourceSize?.y ?? 0;
    const sourceW = def.sourceSize?.w ?? w;
    const sourceH = def.sourceSize?.h ?? h;

    if (typeof document !== 'undefined' && rawImage) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = sourceW;
        canvas.height = sourceH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          if (!rotated) {
            ctx.drawImage(rawImage, x, y, w, h, trimX, trimY, w, h);
          } else {
            // TexturePacker rotated=true stores upright (w, h) rotated 90° CW as (h, w) in the atlas
            ctx.save();
            ctx.translate(trimX + w / 2, trimY + h / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.drawImage(rawImage, x, y, h, w, -h / 2, -w / 2, h, w);
            ctx.restore();
          }

          // Fast path for untrimmed, unrotated frames: share GPU texture source
          const texture =
            !rotated && trimX === 0 && trimY === 0 && w === sourceW && h === sourceH
              ? new Texture({
                  source: sheetTexture.source,
                  frame: new Rectangle(x, y, w, h),
                })
              : Texture.from(canvas);

          return {
            name: frameName,
            canvas,
            texture,
            width: sourceW,
            height: sourceH,
          };
        }
      } catch {
        // Fallback below
      }
    }

    const fallbackTex = new Texture({
      source: sheetTexture.source,
      frame: new Rectangle(x, y, rotated ? h : w, rotated ? w : h),
    });
    const dummyCanvas =
      typeof document !== 'undefined' ? document.createElement('canvas') : ({} as HTMLCanvasElement);
    return {
      name: frameName,
      canvas: dummyCanvas,
      texture: fallbackTex,
      width: sourceW,
      height: sourceH,
    };
  }

  /**
   * Returns PixiJS `Texture[]` for a loaded SpriteSheet animation or sequential frame set.
   */
  public getTextures(sheetOrSequenceKey: string, animationName: string = 'default'): Texture[] {
    const fromManager = spriteSheetManager.getAnimationTextures(sheetOrSequenceKey, animationName);
    if (fromManager.length > 0) return fromManager;

    const sheet = this.sheetCache.get(sheetOrSequenceKey);
    if (sheet) {
      const anim = sheet.animations.get(animationName) ?? sheet.orderedFrames;
      return anim.map((f) => f.texture);
    }
    const seq = this.sequenceCache.get(sheetOrSequenceKey);
    if (seq) {
      return seq.map((f) => f.texture);
    }
    return [];
  }

  /**
   * Returns Canvas 2D `DecodedCanvasFrame[]` for rendering directly onto an HTML5 `<canvas>` overlay in `DdzTableView`.
   */
  public getCanvasFrames(
    sheetOrSequenceKey: string,
    animationName: string = 'default'
  ): DecodedCanvasFrame[] {
    const fromManager = spriteSheetManager.getAnimationFrames(sheetOrSequenceKey, animationName);
    if (fromManager.length > 0) return fromManager;

    const sheet = this.sheetCache.get(sheetOrSequenceKey);
    if (sheet) {
      return sheet.animations.get(animationName) ?? sheet.orderedFrames;
    }
    return this.sequenceCache.get(sheetOrSequenceKey) ?? [];
  }

  /**
   * Plays a PixiJS `Texture[]` sequence inside any PixiJS `Container`.
   */
  public playTexturesInPixi(
    parentContainer: Container,
    textures: Texture[],
    opts: SpritePlayOptions
  ): Sprite | null {
    if (!textures || textures.length === 0 || parentContainer.destroyed) return null;

    const sprite = new Sprite(textures[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(opts.x, opts.y);
    const sx = opts.scaleX ?? opts.scale ?? 1;
    const sy = opts.scaleY ?? opts.scale ?? 1;
    sprite.scale.set(sx, sy);
    sprite.rotation = opts.rotation ?? 0;
    sprite.alpha = opts.alpha ?? 1;
    if (opts.tint !== undefined) {
      sprite.tint = opts.tint;
    }
    parentContainer.addChild(sprite);

    const fps = opts.fps ?? 22;
    const duration = textures.length / fps;
    const proxy = { frameIdx: 0 };

    gsap.to(proxy, {
      frameIdx: textures.length - 0.01,
      duration,
      ease: 'none',
      repeat: opts.loop ? -1 : 0,
      onUpdate: () => {
        if (sprite.destroyed) return;
        const idx = Math.min(textures.length - 1, Math.floor(proxy.frameIdx));
        if (sprite.texture !== textures[idx]) {
          sprite.texture = textures[idx];
        }
      },
      onComplete: () => {
        if (!opts.loop) {
          if (!sprite.destroyed) {
            sprite.destroy();
          }
          opts.onComplete?.();
        }
      },
    });

    return sprite;
  }

  /**
   * Plays a named JSON+PNG SpriteSheet animation inside a PixiJS `Container`.
   */
  public playPixiSheetAnimation(
    parentContainer: Container,
    sheetKey: DdzSpriteSheetKey | string,
    animationName: string = 'default',
    opts: SpritePlayOptions
  ): Sprite | null {
    const textures = this.getTextures(sheetKey, animationName);
    return this.playTexturesInPixi(parentContainer, textures, opts);
  }

  /**
   * Retrieves PixiJS v8 `Texture[]` directly by competitive Action ID (`bomb`, `rocket`, `call_landlord`, etc.)
   * via `SpriteSheetRegistry`.
   */
  public getTexturesByActionId(actionId: DdzVfxActionId | string): Texture[] {
    return spriteSheetRegistry.getTexturesByActionId(actionId);
  }

  /**
   * Retrieves Canvas2D `DecodedCanvasFrame[]` directly by competitive Action ID via `SpriteSheetRegistry`.
   */
  public getCanvasFramesByActionId(actionId: DdzVfxActionId | string): DecodedCanvasFrame[] {
    return spriteSheetRegistry.getFramesByActionId(actionId);
  }

  /**
   * Retrieves all composite animation layers configured in `SpriteSheetRegistry` for a given `actionId`.
   */
  public getActionLayers(actionId: DdzVfxActionId | string): Array<{
    spec: ActionAnimationLayerSpec;
    frames: DecodedCanvasFrame[];
    textures: Texture[];
  }> {
    return spriteSheetRegistry.getResolvedLayersByActionId(actionId);
  }

  /**
   * Plays a high-definition animation sequence inside a PixiJS `Container` directly by Action ID
   * (`deal_cards`, `call_landlord`, `grab_landlord`, `hole_card_bonus`, `open_hand`, `bomb`, `rocket`, `airplane`, etc.).
   */
  public playByActionId(
    parentContainer: Container,
    actionId: DdzVfxActionId | string,
    opts: SpritePlayOptions
  ): Sprite | null {
    const entry = spriteSheetRegistry.resolveActionEntry(actionId);
    const textures = spriteSheetRegistry.getTexturesByActionId(actionId);
    if (textures.length === 0) return null;

    const mergedOpts: SpritePlayOptions = {
      ...opts,
      fps: opts.fps ?? entry?.primary.fps ?? 22,
      scale: opts.scale ?? entry?.primary.scale ?? 1,
      alpha: opts.alpha ?? entry?.primary.alpha ?? 1,
      loop: opts.loop ?? entry?.primary.loop ?? false,
    };
    return this.playTexturesInPixi(parentContainer, textures, mergedOpts);
  }

  /**
   * Subscribes `DdzTableView` to high-dynamic visual effect events (`call_landlord`, `grab_landlord`,
   * `landlord_confirmed`, `double_score`, `super_double`, `bomb`, `rocket`, `airplane`, `spring`).
   */
  public subscribe(listener: (evt: DdzDynamicEffectEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emits a high-dynamic SpriteSheet VFX event to subscribed table overlays.
   */
  public emitEffect(
    type: DdzDynamicEffectType,
    opts: {
      x?: number;
      y?: number;
      seat?: 'bottom' | 'left' | 'right' | 'center';
      durationMs?: number;
      label?: string;
    } = {}
  ): void {
    const evt: DdzDynamicEffectEvent = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      x: opts.x ?? 0.5,
      y: opts.y ?? 0.45,
      seat: opts.seat ?? 'center',
      durationMs: opts.durationMs,
      label: opts.label,
      timestamp: performance.now(),
    };
    for (const listener of this.listeners) {
      listener(evt);
    }
  }
}

export const spriteAnimationEngine = new SpriteAnimationEngine();
