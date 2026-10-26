import { Assets, Rectangle, Spritesheet, Texture, type SpritesheetData } from 'pixi.js';

/**
 * Standard TexturePacker / PixiJS v8 JSON Frame Entry
 */
export interface AtlasFrameEntry {
  frame: { x: number; y: number; w: number; h: number };
  rotated?: boolean;
  trimmed?: boolean;
  spriteSourceSize?: { x: number; y: number; w: number; h: number };
  sourceSize?: { w: number; h: number };
  anchor?: { x: number; y: number };
}

/**
 * Standard TexturePacker / PixiJS v8 JSON SpriteSheet Descriptor
 */
export interface AtlasJsonDescriptor {
  frames: Record<string, AtlasFrameEntry>;
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

/**
 * Sliced frame containing both a PixiJS v8 GPU `Texture` and an upright,
 * trim-restored `HTMLCanvasElement` for hybrid WebGL / Canvas2D rendering in `DdzTableView`.
 */
export interface SlicedSpriteFrame {
  name: string;
  canvas: HTMLCanvasElement;
  texture: Texture;
  width: number;
  height: number;
  rect: Rectangle;
  rotated: boolean;
}

/**
 * Parsed PixiJS v8 Texture Atlas & Auto-Sliced SpriteSheet Entry
 */
export interface ParsedSpriteAtlas {
  key: string;
  imageUrl: string;
  jsonUrl?: string;
  baseTexture: Texture;
  pixiSpritesheet?: Spritesheet;
  frames: Map<string, SlicedSpriteFrame>;
  animations: Map<string, SlicedSpriteFrame[]>;
  orderedFrames: SlicedSpriteFrame[];
}

/**
 * Options for automatic grid / strip PNG slicing when no external JSON descriptor is used
 */
export interface AutoSliceGridOptions {
  cols?: number;
  rows?: number;
  frameWidth?: number;
  frameHeight?: number;
  skipEmptyFrames?: boolean;
  alphaThreshold?: number;
  animationName?: string;
}

/**
 * Master manifest of commercial Dou Dizhu SpriteSheet atlases (`JSON + PNG`),
 * standalone strip PNGs, and numbered frame sequences in `/public/assets/vfx/`.
 */
export const DDZ_SPRITE_ATLAS_MANIFEST = {
  bomb: {
    jsonUrl: '/assets/vfx/bomb.json',
    imageUrl: '/assets/vfx/bomb.png',
    core: false,
  },
  zd: {
    jsonUrl: '/assets/vfx/zd.json',
    imageUrl: '/assets/vfx/zd.png',
    core: true,
  },
  baodian: {
    jsonUrl: '/assets/vfx/baodian.json',
    imageUrl: '/assets/vfx/baodian.png',
    core: true,
  },
  guang: {
    jsonUrl: '/assets/vfx/guang.json',
    imageUrl: '/assets/vfx/guang.png',
    core: true,
  },
  air: {
    jsonUrl: '/assets/vfx/air.json',
    imageUrl: '/assets/vfx/air.png',
    core: false,
  },
  alarm: {
    jsonUrl: '/assets/vfx/alarm.json',
    imageUrl: '/assets/vfx/alarm.png',
    core: false,
  },
  texiaozi: {
    jsonUrl: '/assets/vfx/texiaozi.json',
    imageUrl: '/assets/vfx/texiaozi.png',
    core: true,
  },
  emoji: {
    jsonUrl: '/assets/vfx/emoji.json',
    imageUrl: '/assets/vfx/emoji.png',
    core: false,
  },
  expression: {
    jsonUrl: '/assets/vfx/expression.json',
    imageUrl: '/assets/vfx/expression.png',
    core: false,
  },
  ds: {
    jsonUrl: '/assets/vfx/ds.json',
    imageUrl: '/assets/vfx/ds.png',
    core: false,
  },
  sld: {
    jsonUrl: '/assets/vfx/sld.json',
    imageUrl: '/assets/vfx/sld.png',
    core: false,
  },
} as const;

export type DdzSpriteAtlasKey = keyof typeof DDZ_SPRITE_ATLAS_MANIFEST;

/**
 * High-quality numbered PNG frame sequences in `/public/assets/vfx/landlords/`
 */
export const DDZ_PNG_FRAME_SEQUENCES: Record<string, string[]> = {
  classic_bomb: Array.from({ length: 12 }, (_, i) => `/assets/vfx/landlords/bomb_${i + 1}.png`),
  joker_bomb: Array.from({ length: 8 }, (_, i) => `/assets/vfx/landlords/joker_bomb_${i + 1}.png`),
  escort_plane: Array.from({ length: 5 }, (_, i) => `/assets/vfx/landlords/plane_${i + 1}.png`),
};

/**
 * SpriteSheetManager — Automatic PNG Frame Slicer & PixiJS v8 Texture Atlas Parser
 *
 * Responsibilities:
 * 1. Parses TexturePacker / PixiJS v8 JSON + PNG texture atlases into native PixiJS v8 `Spritesheet`
 *    and sub-`Texture` instances (`new Texture({ source, frame, orig, trim, rotate })`), while simultaneously
 *    generating upright, trim-restored `HTMLCanvasElement` slices for high-FPS Canvas2D overlays.
 * 2. Automatically slices standalone PNG sprite sheets (uniform grids, horizontal strips, or
 *    alpha-island regions) with transparent-frame filtering.
 * 3. Aggregates high-resolution numbered PNG sequences (`bomb_1..12.png`, `joker_bomb_1..8.png`, `plane_1..5.png`).
 * 4. Provides a unified, cached API consumed directly by `DdzTableView`, `SpriteAnimationEngine`, and `DdzVfxEngine`.
 */
export class SpriteSheetManager {
  private atlasCache: Map<string, ParsedSpriteAtlas> = new Map();
  private inFlightAtlases: Map<string, Promise<ParsedSpriteAtlas | null>> = new Map();
  private sequenceCache: Map<string, SlicedSpriteFrame[]> = new Map();
  private inFlightSequences: Map<string, Promise<SlicedSpriteFrame[]>> = new Map();
  private fullPreloadPromise: Promise<void> | null = null;

  /**
   * Fast-path preloader for core entry & bidding atlases (`baodian`, `guang`, `zd`, `texiaozi`)
   * with a non-blocking timeout guard so `DdzTableView` entry dealing starts with zero lag.
   */
  public async preloadCoreAtlases(timeoutMs = 450): Promise<void> {
    void this.preloadAllAtlases();

    const coreEntries = (
      Object.entries(DDZ_SPRITE_ATLAS_MANIFEST) as Array<
        [DdzSpriteAtlasKey, (typeof DDZ_SPRITE_ATLAS_MANIFEST)[DdzSpriteAtlasKey]]
      >
    ).filter(([, cfg]) => cfg.core);

    try {
      await Promise.race([
        Promise.all(
          coreEntries.map(([key, cfg]) => this.loadAtlas(key, cfg.jsonUrl, cfg.imageUrl))
        ),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);
    } catch {
      // Non-fatal: individual sheets will resolve on demand
    }
  }

  /**
   * Preloads all registered Dou Dizhu JSON+PNG texture atlases and numbered PNG sequences.
   */
  public preloadAllAtlases(): Promise<void> {
    if (this.fullPreloadPromise) return this.fullPreloadPromise;

    this.fullPreloadPromise = (async () => {
      const atlasEntries = Object.entries(DDZ_SPRITE_ATLAS_MANIFEST) as Array<
        [DdzSpriteAtlasKey, (typeof DDZ_SPRITE_ATLAS_MANIFEST)[DdzSpriteAtlasKey]]
      >;
      const sequenceEntries = Object.entries(DDZ_PNG_FRAME_SEQUENCES);

      await Promise.all([
        ...atlasEntries.map(([key, cfg]) => this.loadAtlas(key, cfg.jsonUrl, cfg.imageUrl)),
        ...sequenceEntries.map(([seqKey, urls]) => this.loadPngSequence(seqKey, urls)),
      ]);
    })();

    return this.fullPreloadPromise;
  }

  /**
   * Loads and parses a JSON + PNG Texture Atlas using PixiJS v8 `Assets` & `Spritesheet` conventions,
   * slicing each frame into both a PixiJS v8 `Texture` and an unrotated `HTMLCanvasElement`.
   */
  public async loadAtlas(
    key: string,
    jsonUrl: string,
    explicitImageUrl?: string
  ): Promise<ParsedSpriteAtlas | null> {
    const cached = this.atlasCache.get(key);
    if (cached) return cached;

    const existingPromise = this.inFlightAtlases.get(key);
    if (existingPromise) return existingPromise;

    const loadTask = (async (): Promise<ParsedSpriteAtlas | null> => {
      try {
        const response = await fetch(jsonUrl);
        if (!response.ok) return null;
        const jsonData = (await response.json()) as AtlasJsonDescriptor;
        if (!jsonData || !jsonData.frames) return null;

        const baseDir = jsonUrl.substring(0, jsonUrl.lastIndexOf('/') + 1);
        const imageUrl =
          explicitImageUrl ||
          (jsonData.meta?.image
            ? `${baseDir}${jsonData.meta.image}`
            : jsonUrl.replace(/\.json$/i, '.png'));

        const baseTexture = await Assets.load<Texture>(imageUrl);
        if (!baseTexture) return null;

        // Parse native PixiJS v8 Spritesheet when compatible
        let pixiSpritesheet: Spritesheet | undefined;
        try {
          const sheetData: SpritesheetData = {
            frames: jsonData.frames,
            animations: jsonData.animations,
            meta: {
              scale: String(jsonData.meta?.scale ?? 1),
            },
          };
          const sheet = new Spritesheet(baseTexture, sheetData);
          await sheet.parse();
          pixiSpritesheet = sheet;
        } catch {
          // Fallback to manual per-frame slicing below if Spritesheet key collision occurs
        }

        const rawImage = baseTexture.source?.resource as CanvasImageSource | undefined;
        const framesMap = new Map<string, SlicedSpriteFrame>();

        for (const [frameName, frameDef] of Object.entries(jsonData.frames)) {
          const nativeTex = pixiSpritesheet?.textures?.[frameName];
          const sliced = this.sliceAtlasFrame(
            frameName,
            baseTexture,
            rawImage,
            frameDef,
            nativeTex
          );
          if (sliced) {
            framesMap.set(frameName, sliced);
          }
        }

        const sortedNames = Array.from(framesMap.keys()).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );
        const orderedFrames = sortedNames
          .map((n) => framesMap.get(n))
          .filter((f): f is SlicedSpriteFrame => Boolean(f));

        const animationsMap = new Map<string, SlicedSpriteFrame[]>();
        animationsMap.set('default', orderedFrames);

        if (jsonData.animations) {
          for (const [animName, frameNames] of Object.entries(jsonData.animations)) {
            const seq = frameNames
              .map((fn) => framesMap.get(fn))
              .filter((f): f is SlicedSpriteFrame => Boolean(f));
            if (seq.length > 0) {
              animationsMap.set(animName, seq);
            }
          }
        }

        const parsed: ParsedSpriteAtlas = {
          key,
          imageUrl,
          jsonUrl,
          baseTexture,
          pixiSpritesheet,
          frames: framesMap,
          animations: animationsMap,
          orderedFrames,
        };

        this.atlasCache.set(key, parsed);
        return parsed;
      } catch {
        return null;
      } finally {
        this.inFlightAtlases.delete(key);
      }
    })();

    this.inFlightAtlases.set(key, loadTask);
    return loadTask;
  }

  /**
   * Automatically slices a standalone PNG SpriteSheet into uniform grid cells or horizontal strip frames,
   * optionally discarding empty/transparent cells and constructing PixiJS v8 sub-textures.
   */
  public async autoSlicePngSheet(
    key: string,
    imageUrl: string,
    options: AutoSliceGridOptions = {}
  ): Promise<ParsedSpriteAtlas | null> {
    const cached = this.atlasCache.get(key);
    if (cached) return cached;

    const existingPromise = this.inFlightAtlases.get(key);
    if (existingPromise) return existingPromise;

    const task = (async (): Promise<ParsedSpriteAtlas | null> => {
      try {
        const baseTexture = await Assets.load<Texture>(imageUrl);
        if (!baseTexture) return null;

        const sheetW = Math.max(1, baseTexture.width);
        const sheetH = Math.max(1, baseTexture.height);
        const rawImage = baseTexture.source?.resource as CanvasImageSource | undefined;

        // Determine grid dimensions automatically if not explicitly provided
        let cols = options.cols ?? 0;
        let rows = options.rows ?? 0;
        if (cols <= 0 || rows <= 0) {
          if (options.frameWidth && options.frameHeight) {
            cols = Math.max(1, Math.floor(sheetW / options.frameWidth));
            rows = Math.max(1, Math.floor(sheetH / options.frameHeight));
          } else {
            const inferred = this.inferBestGridDimensions(sheetW, sheetH, rawImage);
            cols = inferred.cols;
            rows = inferred.rows;
          }
        }

        const cellW = options.frameWidth ?? Math.floor(sheetW / cols);
        const cellH = options.frameHeight ?? Math.floor(sheetH / rows);
        const skipEmpty = options.skipEmptyFrames ?? true;
        const alphaThreshold = options.alphaThreshold ?? 8;

        const framesMap = new Map<string, SlicedSpriteFrame>();
        const orderedFrames: SlicedSpriteFrame[] = [];

        let index = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = c * cellW;
            const y = r * cellH;
            if (x + cellW > sheetW || y + cellH > sheetH) continue;

            const canvas = document.createElement('canvas');
            canvas.width = cellW;
            canvas.height = cellH;
            const ctx = canvas.getContext('2d');
            if (ctx && rawImage) {
              ctx.drawImage(rawImage, x, y, cellW, cellH, 0, 0, cellW, cellH);
              if (skipEmpty && this.isCanvasRegionEmpty(ctx, cellW, cellH, alphaThreshold)) {
                continue;
              }
            }

            const rect = new Rectangle(x, y, cellW, cellH);
            const subTexture = new Texture({
              source: baseTexture.source,
              frame: rect,
            });

            const frameName = `${key}_${index}`;
            const sliced: SlicedSpriteFrame = {
              name: frameName,
              canvas,
              texture: subTexture,
              width: cellW,
              height: cellH,
              rect,
              rotated: false,
            };

            framesMap.set(frameName, sliced);
            orderedFrames.push(sliced);
            index++;
          }
        }

        const animationsMap = new Map<string, SlicedSpriteFrame[]>();
        animationsMap.set('default', orderedFrames);
        if (options.animationName) {
          animationsMap.set(options.animationName, orderedFrames);
        }

        const parsed: ParsedSpriteAtlas = {
          key,
          imageUrl,
          baseTexture,
          frames: framesMap,
          animations: animationsMap,
          orderedFrames,
        };

        this.atlasCache.set(key, parsed);
        return parsed;
      } catch {
        return null;
      } finally {
        this.inFlightAtlases.delete(key);
      }
    })();

    this.inFlightAtlases.set(key, task);
    return task;
  }

  /**
   * Loads a sequence of individual PNG files (`bomb_1..12.png`, etc.) into cached `SlicedSpriteFrame[]`.
   */
  public async loadPngSequence(
    sequenceKey: string,
    urls: string[]
  ): Promise<SlicedSpriteFrame[]> {
    const cached = this.sequenceCache.get(sequenceKey);
    if (cached) return cached;

    const inFlight = this.inFlightSequences.get(sequenceKey);
    if (inFlight) return inFlight;

    const task = (async (): Promise<SlicedSpriteFrame[]> => {
      const results: SlicedSpriteFrame[] = [];
      const textures = await Promise.all(
        urls.map(async (url) => {
          try {
            return await Assets.load<Texture>(url);
          } catch {
            return null;
          }
        })
      );

      textures.forEach((tex, idx) => {
        if (!tex) return;
        const w = Math.max(1, tex.width);
        const h = Math.max(1, tex.height);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const raw = tex.source?.resource as CanvasImageSource | undefined;
        if (ctx && raw) {
          try {
            ctx.drawImage(raw, 0, 0);
          } catch {
            // Ignore cross-origin or disposed image draw errors
          }
        }
        results.push({
          name: `${sequenceKey}_${idx}`,
          canvas,
          texture: tex,
          width: w,
          height: h,
          rect: new Rectangle(0, 0, w, h),
          rotated: false,
        });
      });

      if (results.length > 0) {
        this.sequenceCache.set(sequenceKey, results);
      }
      this.inFlightSequences.delete(sequenceKey);
      return results;
    })();

    this.inFlightSequences.set(sequenceKey, task);
    return task;
  }

  /**
   * Returns a single named frame from a loaded atlas.
   */
  public getFrame(sheetKey: string, frameName: string): SlicedSpriteFrame | null {
    const sheet = this.atlasCache.get(sheetKey);
    if (!sheet) return null;
    return sheet.frames.get(frameName) ?? sheet. frames.get(`${frameName}.png`) ?? null;
  }

  /**
   * Returns an ordered array of `SlicedSpriteFrame` objects for a sheet animation or PNG sequence.
   */
  public getAnimationFrames(
    sheetOrSequenceKey: string,
    animationName = 'default'
  ): SlicedSpriteFrame[] {
    const seq = this.sequenceCache.get(sheetOrSequenceKey);
    if (seq && seq.length > 0) return seq;

    const sheet = this.atlasCache.get(sheetOrSequenceKey);
    if (!sheet) return [];

    const anim = sheet.animations.get(animationName);
    if (anim && anim.length > 0) return anim;

    const prefixMatches = sheet.orderedFrames.filter((f) => f.name.startsWith(animationName));
    if (prefixMatches.length > 0) return prefixMatches;

    return sheet.orderedFrames;
  }

  /**
   * Returns PixiJS v8 `Texture[]` for a given SpriteSheet animation or frame sequence.
   */
  public getAnimationTextures(
    sheetOrSequenceKey: string,
    animationName = 'default'
  ): Texture[] {
    return this.getAnimationFrames(sheetOrSequenceKey, animationName).map((f) => f.texture);
  }

  /**
   * Checks whether a given SpriteSheet or sequence is already parsed and ready in memory.
   */
  public isReady(sheetOrSequenceKey: string): boolean {
    return (
      this.atlasCache.has(sheetOrSequenceKey) || this.sequenceCache.has(sheetOrSequenceKey)
    );
  }

  /**
   * Slices a single frame from a JSON+PNG TexturePacker atlas, handling 90° CW rotation
   * (`rotated: true`) and `spriteSourceSize` trim offsets for both Canvas2D and PixiJS v8 `Texture`.
   */
  private sliceAtlasFrame(
    frameName: string,
    baseTexture: Texture,
    rawImage: CanvasImageSource | undefined,
    def: AtlasFrameEntry,
    nativeSpritesheetTexture?: Texture
  ): SlicedSpriteFrame | null {
    const { x, y, w, h } = def.frame;
    if (w <= 0 || h <= 0) return null;

    const rotated = Boolean(def.rotated);
    const trimX = def.spriteSourceSize?.x ?? 0;
    const trimY = def.spriteSourceSize?.y ?? 0;
    const sourceW = def.sourceSize?.w ?? w;
    const sourceH = def.sourceSize?.h ?? h;
    const rect = new Rectangle(x, y, rotated ? h : w, rotated ? w : h);

    if (typeof document !== 'undefined' && rawImage) {
      const canvas = document.createElement('canvas');
      canvas.width = sourceW;
      canvas.height = sourceH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (!rotated) {
          ctx.drawImage(rawImage, x, y, w, h, trimX, trimY, w, h);
        } else {
          // TexturePacker stores rotated=true frames rotated 90° clockwise in the atlas
          ctx.save();
          ctx.translate(trimX + w / 2, trimY + h / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.drawImage(rawImage, x, y, h, w, -h / 2, -w / 2, h, w);
          ctx.restore();
        }

        const texture =
          !rotated && trimX === 0 && trimY === 0 && w === sourceW && h === sourceH
            ? (nativeSpritesheetTexture ??
              new Texture({
                source: baseTexture.source,
                frame: new Rectangle(x, y, w, h),
              }))
            : Texture.from(canvas);

        return {
          name: frameName,
          canvas,
          texture,
          width: sourceW,
          height: sourceH,
          rect,
          rotated,
        };
      }
    }

    const fallbackTexture =
      nativeSpritesheetTexture ??
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(x, y, w, h),
      });
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = sourceW;
    fallbackCanvas.height = sourceH;

    return {
      name: frameName,
      canvas: fallbackCanvas,
      texture: fallbackTexture,
      width: sourceW,
      height: sourceH,
      rect,
      rotated,
    };
  }

  /**
   * Infers optimal `(cols, rows)` grid subdivisions for a standalone PNG sprite sheet
   * based on aspect ratio and alpha-gutter scanning.
   */
  private inferBestGridDimensions(
    width: number,
    height: number,
    rawImage?: CanvasImageSource
  ): { cols: number; rows: number } {
    const aspect = width / Math.max(1, height);
    if (aspect >= 3.5) {
      const approxCols = Math.max(2, Math.round(aspect));
      return { cols: approxCols, rows: 1 };
    }
    if (aspect <= 0.3) {
      const approxRows = Math.max(2, Math.round(1 / aspect));
      return { cols: 1, rows: approxRows };
    }

    // Try detecting transparent vertical/horizontal gutters on an offscreen sample
    if (typeof document !== 'undefined' && rawImage) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(rawImage, 0, 0);
          const imgData = ctx.getImageData(0, 0, width, height).data;

          const countSegments = (length: number, isCol: boolean): number => {
            let segments = 0;
            let inOpaque = false;
            const crossLen = isCol ? height : width;
            for (let i = 0; i < length; i++) {
              let maxAlpha = 0;
              for (let j = 0; j < crossLen; j += 2) {
                const px = isCol ? i : j;
                const py = isCol ? j : i;
                const alpha = imgData[(py * width + px) * 4 + 3];
                if (alpha > maxAlpha) maxAlpha = alpha;
                if (maxAlpha > 16) break;
              }
              if (maxAlpha > 16 && !inOpaque) {
                inOpaque = true;
                segments++;
              } else if (maxAlpha <= 16 && inOpaque) {
                inOpaque = false;
              }
            }
            return segments;
          };

          const detectedCols = countSegments(width, true);
          const detectedRows = countSegments(height, false);
          if (detectedCols >= 1 && detectedCols <= 16 && detectedRows >= 1 && detectedRows <= 16) {
            return { cols: detectedCols, rows: detectedRows };
          }
        }
      } catch {
        // Fallback to square heuristic
      }
    }

    return { cols: 4, rows: 4 };
  }

  /**
   * Checks whether a sliced canvas cell contains only transparent pixels.
   */
  private isCanvasRegionEmpty(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    alphaThreshold: number
  ): boolean {
    try {
      const data = ctx.getImageData(0, 0, width, height).data;
      for (let i = 3; i < data.length; i += 16) {
        if (data[i] > alphaThreshold) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const spriteSheetManager = new SpriteSheetManager();

export const preloadCoreSpriteSheets = (timeoutMs?: number): Promise<void> =>
  spriteSheetManager.preloadCoreAtlases(timeoutMs);

export const preloadAllSpriteSheets = (): Promise<void> =>
  spriteSheetManager.preloadAllAtlases();
