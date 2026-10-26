import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from 'pixi.js';
import gsap from 'gsap';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { PropType, Rank } from '../types';
import { spriteAnimationEngine } from './SpriteAnimationEngine';

export interface SpritesheetAnimationOptions {
  x: number;
  y: number;
  fps?: number;
  scale?: number;
  loop?: boolean;
  rotation?: number;
  tint?: number;
  alpha?: number;
  onComplete?: () => void;
}

/**
 * TexturePacker `.plist` / Spine `.atlas` frame descriptor.
 * `rotated: true` in TexturePacker format 2 means the upright sprite `(w, h)` was rotated
 * 90 degrees clockwise when packed into the atlas (so its pixel footprint in the atlas is `h` wide by `w` tall).
 */
interface AtlasFrameDef {
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  trimX: number;
  trimY: number;
  sourceW: number;
  sourceH: number;
}

// Exact frame coordinates from `/assets/vfx/air.plist` (Golden 3D Poker Biplane, 3 frames)
const AIR_PLIST_FRAMES: AtlasFrameDef[] = [
  { x: 2, y: 2, w: 425, h: 310, rotated: false, trimX: 14, trimY: 22, sourceW: 455, sourceH: 332 },
  { x: 2, y: 314, w: 421, h: 298, rotated: false, trimX: 14, trimY: 12, sourceW: 455, sourceH: 332 },
  { x: 2, y: 614, w: 421, h: 288, rotated: false, trimX: 14, trimY: 22, sourceW: 455, sourceH: 332 },
];

// Exact frame coordinates from `/assets/vfx/bomb.plist` (Skull Bomb & Mushroom Cloud Smoke, 12 frames)
const BOMB_PLIST_FRAMES: AtlasFrameDef[] = [
  { x: 902, y: 738, w: 198, h: 202, rotated: false, trimX: 233, trimY: 25, sourceW: 666, sourceH: 478 },
  { x: 1030, y: 494, w: 182, h: 148, rotated: true, trimX: 216, trimY: 176, sourceW: 666, sourceH: 478 },
  { x: 1102, y: 678, w: 158, h: 144, rotated: true, trimX: 170, trimY: 249, sourceW: 666, sourceH: 478 },
  { x: 1180, y: 494, w: 130, h: 134, rotated: false, trimX: 249, trimY: 304, sourceW: 666, sourceH: 478 },
  { x: 902, y: 494, w: 242, h: 126, rotated: true, trimX: 195, trimY: 313, sourceW: 666, sourceH: 478 },
  { x: 286, y: 580, w: 400, h: 308, rotated: true, trimX: 107, trimY: 113, sourceW: 666, sourceH: 478 },
  { x: 2, y: 580, w: 416, h: 282, rotated: true, trimX: 91, trimY: 126, sourceW: 666, sourceH: 478 },
  { x: 596, y: 542, w: 458, h: 304, rotated: true, trimX: 91, trimY: 117, sourceW: 666, sourceH: 478 },
  { x: 888, y: 2, w: 490, h: 302, rotated: true, trimX: 74, trimY: 119, sourceW: 666, sourceH: 478 },
  { x: 304, y: 2, w: 540, h: 288, rotated: true, trimX: 73, trimY: 118, sourceW: 666, sourceH: 478 },
  { x: 594, y: 2, w: 538, h: 292, rotated: true, trimX: 75, trimY: 114, sourceW: 666, sourceH: 478 },
  { x: 2, y: 2, w: 576, h: 300, rotated: true, trimX: 56, trimY: 106, sourceW: 666, sourceH: 478 },
];

// Exact frame coordinates from `/assets/vfx/alarm.plist` (Red Police Siren Alarm Lamp, 2 frames)
const ALARM_PLIST_FRAMES: AtlasFrameDef[] = [
  { x: 2, y: 109, w: 55, h: 68, rotated: true, trimX: 27, trimY: 38, sourceW: 115, sourceH: 106 },
  { x: 2, y: 2, w: 105, h: 106, rotated: true, trimX: 0, trimY: 0, sourceW: 115, sourceH: 106 },
];

// Exact frame coordinates from `/assets/vfx/baodian.plist` (Golden Starlight Burst, 10 frames)
const BAODIAN_PLIST_FRAMES: AtlasFrameDef[] = [
  { x: 2, y: 2, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 193, y: 2, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 384, y: 2, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 575, y: 2, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 766, y: 2, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 2, y: 149, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 193, y: 149, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 384, y: 149, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 575, y: 149, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
  { x: 766, y: 149, w: 189, h: 145, rotated: false, trimX: 0, trimY: 0, sourceW: 189, sourceH: 145 },
];

// Exact frame coordinates from `/assets/vfx/zd.atlas` (Radial Golden-Orange Shockwave Ring, 10 frames)
const ZD_SHOCKWAVE_FRAMES: AtlasFrameDef[] = [
  { x: 778, y: 67, w: 153, h: 153, rotated: false, trimX: 133, trimY: 135, sourceW: 419, sourceH: 430 },
  { x: 630, y: 222, w: 279, h: 274, rotated: false, trimX: 67, trimY: 75, sourceW: 419, sourceH: 430 },
  { x: 2, y: 89, w: 299, h: 284, rotated: false, trimX: 52, trimY: 70, sourceW: 419, sourceH: 430 },
  { x: 2, y: 698, w: 308, h: 322, rotated: false, trimX: 49, trimY: 55, sourceW: 419, sourceH: 430 },
  { x: 312, y: 717, w: 316, h: 303, rotated: false, trimX: 45, trimY: 60, sourceW: 419, sourceH: 430 },
  { x: 2, y: 375, w: 321, h: 307, rotated: true, trimX: 42, trimY: 58, sourceW: 419, sourceH: 430 },
  { x: 311, y: 229, w: 311, h: 238, rotated: false, trimX: 39, trimY: 88, sourceW: 419, sourceH: 430 },
  { x: 312, y: 469, w: 316, h: 246, rotated: false, trimX: 37, trimY: 83, sourceW: 419, sourceH: 430 },
  { x: 630, y: 498, w: 318, h: 256, rotated: false, trimX: 37, trimY: 78, sourceW: 419, sourceH: 430 },
  { x: 630, y: 756, w: 318, h: 264, rotated: false, trimX: 37, trimY: 74, sourceW: 419, sourceH: 430 },
];

/**
 * DdzVfxEngine — Commercial Spritesheet Slicing & Particle VFX Engine for Dou Dizhu
 *
 * Uses authentic TexturePacker `.plist` + `.png` atlases and frame sequences in `/assets/vfx/`:
 * - `air.png` + `air.plist`: 3-frame Golden 3D Poker Biplane spritesheet
 * - `bomb.png` + `bomb.plist`: 12-frame Skull Bomb & Mushroom Cloud Smoke spritesheet
 * - `alarm.png` + `alarm.plist`: 2-frame Red Police Siren Alarm Lamp spritesheet
 * - `baodian.png` + `baodian.plist`: 10-frame Golden Starlight Burst spritesheet
 * - `zd.png` + `zd.atlas`: 10-frame Radial Golden-Orange Shockwave spritesheet
 * - `landlords/bomb_1.png`..`bomb_12.png`: 12-frame Glossy Bomb Fuse & Shell Shatter sequence
 * - `landlords/joker_bomb_1.png`..`joker_bomb_8.png`: 8-frame Rocket (`王炸`) Plasma -> Beam -> Nuclear Cloud sequence
 * - `landlords/plane_1.png`..`plane_5.png`: 5-frame Escort Bomber Plane sequence
 * - `landlords/shunzi.png` & `landlords/liandui.png`: Authentic `顺子` and `连对` emblems
 */
export class DdzVfxEngine {
  private layer: Container;
  private stageToShake: Container;
  private getCenter: () => { x: number; y: number };
  private getDimensions: () => { width: number; height: number };

  // Sliced TexturePacker JSON+PNG frame sequences via SpriteAnimationEngine
  private airBiplaneFrames: Texture[] = [];
  private skullBombFrames: Texture[] = [];
  private alarmLampFrames: Texture[] = [];
  private baodianStarFrames: Texture[] = [];
  private zdShockwaveFrames: Texture[] = [];
  private guangGoldFrames: Texture[] = [];
  private guangSilverFrames: Texture[] = [];

  // Sequential frame arrays from `/assets/vfx/landlords/`
  private classicBombFrames: Texture[] = [];
  private jokerBombFrames: Texture[] = [];
  private escortPlaneFrames: Texture[] = [];

  // Single high-res transparent textures
  private texSpringTitle: Texture | null = null;
  private texStarFlare: Texture | null = null;
  private texShunziEmblem: Texture | null = null;
  private texShunziGold: Texture | null = null;
  private texShunziParticles: Texture | null = null;
  private texLianduiEmblem: Texture | null = null;
  private texNuclearCloud: Texture | null = null;
  private texNuclearPillar: Texture | null = null;
  private texBlastBg: Texture | null = null;
  private texBlastRing: Texture | null = null;
  private texBlastCore: Texture | null = null;
  private texBlastScorch: Texture | null = null;
  private texPlaneSmoke: Texture | null = null;
  private texPropFlower: Texture | null = null;
  private texPropEgg: Texture | null = null;
  private texPropShoe: Texture | null = null;
  private texPropBomb: Texture | null = null;

  constructor(
    layer: Container,
    stageToShake: Container,
    getCenter: () => { x: number; y: number },
    getDimensions: () => { width: number; height: number }
  ) {
    this.layer = layer;
    this.stageToShake = stageToShake;
    this.getCenter = getCenter;
    this.getDimensions = getDimensions;

    void this.preloadAllVfxAssets();
  }

  /**
   * Standard rectangular grid spritesheet slicer (`new Texture({ source, frame: new Rectangle(...) })`).
   */
  public sliceSpritesheetFrames(
    sheetTexture: Texture,
    cols: number,
    rows: number,
    totalFrames: number = cols * rows
  ): Texture[] {
    const frames: Texture[] = [];
    const frameW = Math.floor(sheetTexture.width / cols);
    const frameH = Math.floor(sheetTexture.height / rows);
    if (frameW <= 0 || frameH <= 0) return [sheetTexture];

    for (let i = 0; i < totalFrames; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rect = new Rectangle(col * frameW, row * frameH, frameW, frameH);
      frames.push(
        new Texture({
          source: sheetTexture.source,
          frame: rect,
        })
      );
    }
    return frames;
  }

  /**
   * Unpacks a TexturePacker `.plist` or Spine `.atlas` spritesheet into individual full-frame `Texture[]`.
   * Automatically handles:
   * - Non-rotated sub-rectangles via `new Texture({ source, frame: new Rectangle(...) })` when untrimmed
   * - `rotated: true` (90° clockwise TexturePacker rotation) and `trimX/trimY` restoration onto an offscreen canvas
   */
  public sliceAtlasFrames(sheetTexture: Texture, defs: AtlasFrameDef[]): Texture[] {
    const rawResource = sheetTexture.source?.resource as CanvasImageSource | undefined;
    const frames: Texture[] = [];

    for (const def of defs) {
      // Fast-path: if not rotated and no trim offset, slice directly using PixiJS Rectangle
      if (
        !def.rotated &&
        def.trimX === 0 &&
        def.trimY === 0 &&
        def.w === def.sourceW &&
        def.h === def.sourceH
      ) {
        frames.push(
          new Texture({
            source: sheetTexture.source,
            frame: new Rectangle(def.x, def.y, def.w, def.h),
          })
        );
        continue;
      }

      if (typeof document !== 'undefined' && rawResource) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = def.sourceW;
          canvas.height = def.sourceH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (!def.rotated) {
              ctx.drawImage(
                rawResource,
                def.x,
                def.y,
                def.w,
                def.h,
                def.trimX,
                def.trimY,
                def.w,
                def.h
              );
            } else {
              // TexturePacker rotated=true stores upright (w, h) rotated 90° CW as (h, w) in the atlas.
              // Rotate -90° (-Math.PI / 2) around the trimmed center to restore upright orientation.
              ctx.save();
              ctx.translate(def.trimX + def.w / 2, def.trimY + def.h / 2);
              ctx.rotate(-Math.PI / 2);
              ctx.drawImage(
                rawResource,
                def.x,
                def.y,
                def.h,
                def.w,
                -def.h / 2,
                -def.w / 2,
                def.h,
                def.w
              );
              ctx.restore();
            }
            frames.push(Texture.from(canvas));
            continue;
          }
        } catch {
          // Fallback to direct Rectangle below
        }
      }

      frames.push(
        new Texture({
          source: sheetTexture.source,
          frame: new Rectangle(
            def.x,
            def.y,
            def.rotated ? def.h : def.w,
            def.rotated ? def.w : def.h
          ),
        })
      );
    }

    return frames;
  }

  private async loadTextureSafe(path: string): Promise<Texture | null> {
    try {
      return await Assets.load<Texture>(path);
    } catch {
      return null;
    }
  }

  private async preloadAllVfxAssets(): Promise<void> {
    // 1. Load all JSON + PNG SpriteSheets and sequential animations via SpriteAnimationEngine
    await spriteAnimationEngine.preloadAllDdzSpriteSheets();

    this.airBiplaneFrames = spriteAnimationEngine.getTextures('air', 'default');
    this.skullBombFrames = spriteAnimationEngine.getTextures('bomb', 'default');
    this.alarmLampFrames = spriteAnimationEngine.getTextures('alarm', 'default');
    this.baodianStarFrames = spriteAnimationEngine.getTextures('baodian', 'default');
    this.zdShockwaveFrames = spriteAnimationEngine.getTextures('zd', 'shockwave');
    this.guangGoldFrames = spriteAnimationEngine.getTextures('guang', 'gold_sweep');
    this.guangSilverFrames = spriteAnimationEngine.getTextures('guang', 'silver_sweep');

    this.classicBombFrames = spriteAnimationEngine.getTextures('classic_bomb');
    this.jokerBombFrames = spriteAnimationEngine.getTextures('joker_bomb');
    this.escortPlaneFrames = spriteAnimationEngine.getTextures('escort_plane');

    // Fallback if any sheet was not yet populated
    if (this.airBiplaneFrames.length === 0) {
      const airSheet = await this.loadTextureSafe('/assets/vfx/air.png');
      if (airSheet) this.airBiplaneFrames = this.sliceAtlasFrames(airSheet, AIR_PLIST_FRAMES);
    }
    if (this.skullBombFrames.length === 0) {
      const bombSheet = await this.loadTextureSafe('/assets/vfx/bomb.png');
      if (bombSheet) this.skullBombFrames = this.sliceAtlasFrames(bombSheet, BOMB_PLIST_FRAMES);
    }
    if (this.alarmLampFrames.length === 0) {
      const alarmSheet = await this.loadTextureSafe('/assets/vfx/alarm.png');
      if (alarmSheet) this.alarmLampFrames = this.sliceAtlasFrames(alarmSheet, ALARM_PLIST_FRAMES);
    }
    if (this.baodianStarFrames.length === 0) {
      const baodianSheet = await this.loadTextureSafe('/assets/vfx/baodian.png');
      if (baodianSheet) this.baodianStarFrames = this.sliceAtlasFrames(baodianSheet, BAODIAN_PLIST_FRAMES);
    }
    if (this.zdShockwaveFrames.length === 0) {
      const zdSheet = await this.loadTextureSafe('/assets/vfx/zd.png');
      if (zdSheet) this.zdShockwaveFrames = this.sliceAtlasFrames(zdSheet, ZD_SHOCKWAVE_FRAMES);
    }

    // 3. Load single high-res transparent VFX textures
    const [
      springTitle,
      starFlare,
      shunziEmblem,
      shunziGold,
      shunziParticles,
      lianduiEmblem,
      nuclearCloud,
      nuclearPillar,
      blastBg,
      blastRing,
      blastCore,
      blastScorch,
      planeSmoke,
      propFlower,
      propEgg,
      propShoe,
      propBomb,
    ] = await Promise.all([
      this.loadTextureSafe('/assets/ui/title_chuntian_js.png'),
      this.loadTextureSafe('/assets/ui/csr_huo.png'),
      this.loadTextureSafe('/assets/vfx/landlords/shunzi.png'),
      this.loadTextureSafe('/assets/vfx/shunzi_gold.png'),
      this.loadTextureSafe('/assets/vfx/shunzi_particles.png'),
      this.loadTextureSafe('/assets/vfx/landlords/liandui.png'),
      this.loadTextureSafe('/assets/vfx/nuclear_cloud.png'),
      this.loadTextureSafe('/assets/vfx/nuclear_pillar.png'),
      this.loadTextureSafe('/assets/vfx/blast_bg.png'),
      this.loadTextureSafe('/assets/vfx/blast_ring.png'),
      this.loadTextureSafe('/assets/vfx/blast_core.png'),
      this.loadTextureSafe('/assets/vfx/blast_scorch.png'),
      this.loadTextureSafe('/assets/vfx/huojianyan.png'),
      this.loadTextureSafe('/assets/vfx/effect_emoji_flower.png'),
      this.loadTextureSafe('/assets/vfx/effect_emoji_egg.png'),
      this.loadTextureSafe('/assets/vfx/effect_emoji_shoe.png'),
      this.loadTextureSafe('/assets/vfx/effect_emoji_bomb.png'),
    ]);

    this.texSpringTitle = springTitle;
    this.texStarFlare = starFlare;
    this.texShunziEmblem = shunziEmblem;
    this.texShunziGold = shunziGold;
    this.texShunziParticles = shunziParticles;
    this.texLianduiEmblem = lianduiEmblem;
    this.texNuclearCloud = nuclearCloud;
    this.texNuclearPillar = nuclearPillar;
    this.texBlastBg = blastBg;
    this.texBlastRing = blastRing;
    this.texBlastCore = blastCore;
    this.texBlastScorch = blastScorch;
    this.texPlaneSmoke = planeSmoke;
    this.texPropFlower = propFlower;
    this.texPropEgg = propEgg;
    this.texPropShoe = propShoe;
    this.texPropBomb = propBomb;
  }

  /**
   * Plays a sliced `Texture[]` frame sequence at a target FPS.
   */
  public playFrameSequence(
    frames: Texture[],
    opts: SpritesheetAnimationOptions,
    parentContainer: Container = this.layer
  ): Sprite | null {
    if (!frames || frames.length === 0) return null;

    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.position.set(opts.x, opts.y);
    sprite.scale.set(opts.scale ?? 1);
    sprite.rotation = opts.rotation ?? 0;
    sprite.alpha = opts.alpha ?? 1;
    if (opts.tint !== undefined) {
      sprite.tint = opts.tint;
    }
    parentContainer.addChild(sprite);

    const fps = opts.fps ?? 24;
    const duration = frames.length / fps;
    const proxy = { frameIdx: 0 };

    gsap.to(proxy, {
      frameIdx: frames.length - 0.01,
      duration,
      ease: 'none',
      repeat: opts.loop ? -1 : 0,
      onUpdate: () => {
        const idx = Math.min(frames.length - 1, Math.floor(proxy.frameIdx));
        if (sprite.texture !== frames[idx]) {
          sprite.texture = frames[idx];
        }
      },
      onComplete: () => {
        if (!opts.loop) {
          sprite.destroy();
          opts.onComplete?.();
        }
      },
    });

    return sprite;
  }

  /**
   * Plays the 2-frame Red Police Siren Alarm Lamp (`alarm.png` + `alarm.plist`) when a player
   * drops to 1 or 2 remaining cards (`报单` / `报双`).
   */
  public playSeatAlarmLamp(x: number, y: number, remainingCount: 1 | 2): void {
    const fx = new Container();
    fx.position.set(x, y);
    this.layer.addChild(fx);

    // Red emergency pulse ring
    const ring = new Graphics();
    ring.circle(0, 0, 44).stroke({ color: 0xff2a2a, width: 3, alpha: 0.9 });
    fx.addChild(ring);
    gsap.fromTo(
      ring.scale,
      { x: 0.5, y: 0.5 },
      { x: 1.65, y: 1.65, duration: 0.55, repeat: 4, ease: 'power2.out' }
    );
    gsap.to(ring, { alpha: 0, duration: 0.55, repeat: 4 });

    // Sliced 2-frame Police Siren Lamp (`alarm0.png` <-> `alarm1.png`)
    if (this.alarmLampFrames.length >= 2) {
      const lamp = this.playFrameSequence(
        this.alarmLampFrames,
        {
          x: 0,
          y: -6,
          fps: 8,
          scale: 0.72,
          loop: true,
        },
        fx
      );
      if (lamp) {
        gsap.fromTo(
          lamp.scale,
          { x: 0.2, y: 0.2 },
          { x: 0.76, y: 0.76, duration: 0.24, ease: 'back.out(2.2)' }
        );
      }
    }

    // Badge text ("报单! 仅剩1张" or "报双! 仅剩2张")
    const tag = new Text({
      text: remainingCount === 1 ? '报单 · 剩1张' : '报双 · 剩2张',
      style: new TextStyle({
        fontFamily: '"Noto Serif SC", "PingFang SC", serif',
        fontSize: 15,
        fontWeight: '900',
        fill: '#FFF3B0',
        stroke: { color: '#7F1D1D', width: 4 },
      }),
    });
    tag.anchor.set(0.5);
    tag.position.set(0, 34);
    fx.addChild(tag);

    gsap.to(fx, {
      alpha: 0,
      delay: 2.3,
      duration: 0.35,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * Plays high-dynamic JSON+PNG SpriteSheet burst (`guang.json` + `baodian.json` + `zd.json`)
   * when a player calls Landlord (`叫地主`), grabs Landlord (`抢地主`), or doubles (`加倍` / `超级加倍`).
   */
  public playSeatActionBurst(
    x: number,
    y: number,
    actionType: string,
    seatRel: 'bottom' | 'left' | 'right' = 'bottom'
  ): void {
    const fx = new Container();
    fx.position.set(x, y);
    this.layer.addChild(fx);

    const isHighPower =
      actionType === 'call' ||
      actionType === 'grab' ||
      actionType === 'double_2' ||
      actionType === 'double_4';

    if (isHighPower) {
      if (
        (actionType === 'grab' || actionType === 'double_4') &&
        this.zdShockwaveFrames.length > 0
      ) {
        this.playFrameSequence(
          this.zdShockwaveFrames,
          { x: 0, y: 0, fps: 24, scale: actionType === 'double_4' ? 0.68 : 0.56 },
          fx
        );
      }

      const sweepFrames =
        this.guangGoldFrames.length > 0 ? this.guangGoldFrames : this.baodianStarFrames;
      if (sweepFrames.length > 0) {
        this.playFrameSequence(
          sweepFrames,
          { x: 0, y: 0, fps: 22, scale: 1.15 },
          fx
        );
      }

      if (this.baodianStarFrames.length > 0) {
        this.playFrameSequence(
          this.baodianStarFrames,
          { x: 0, y: 0, fps: 22, scale: 0.95 },
          fx
        );
      }

      const { width: vw, height: vh } = this.getDimensions();
      const normX = vw > 0 ? x / vw : 0.5;
      const normY = vh > 0 ? y / vh : 0.5;

      if (actionType === 'call') {
        spriteAnimationEngine.emitEffect('call_landlord', {
          x: normX,
          y: normY,
          seat: seatRel,
          label: '叫地主',
        });
      } else if (actionType === 'grab') {
        spriteAnimationEngine.emitEffect('grab_landlord', {
          x: normX,
          y: normY,
          seat: seatRel,
          label: '抢地主 ×2',
        });
      } else if (actionType === 'double_2') {
        spriteAnimationEngine.emitEffect('double_score', {
          x: normX,
          y: normY,
          seat: seatRel,
          label: '加倍 ×2',
        });
      } else if (actionType === 'double_4') {
        spriteAnimationEngine.emitEffect('super_double', {
          x: normX,
          y: normY,
          seat: seatRel,
          label: '超级加倍 ×4',
        });
      }
    } else if (this.guangSilverFrames.length > 0) {
      this.playFrameSequence(
        this.guangSilverFrames,
        { x: 0, y: 0, fps: 24, scale: 0.72, alpha: 0.75 },
        fx
      );
    }

    gsap.to(fx, {
      alpha: 0,
      delay: 0.72,
      duration: 0.2,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * Plays Landlord Confirmation coronation burst (`zd.json` + `guang.json` + `baodian.json`)
   * when Landlord identity & 3 hole cards are revealed.
   */
  public playLandlordConfirmedBurst(x: number, y: number): void {
    const fx = new Container();
    fx.position.set(x, y);
    this.layer.addChild(fx);

    if (this.zdShockwaveFrames.length > 0) {
      this.playFrameSequence(
        this.zdShockwaveFrames,
        { x: 0, y: 0, fps: 22, scale: 0.78 },
        fx
      );
    }
    if (this.guangGoldFrames.length > 0) {
      this.playFrameSequence(
        this.guangGoldFrames,
        { x: 0, y: 0, fps: 20, scale: 1.35 },
        fx
      );
    }
    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: -75, y: 0, fps: 22, scale: 1.05 },
        fx
      );
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: 75, y: 0, fps: 22, scale: 1.05 },
        fx
      );
    }

    const { width: vw, height: vh } = this.getDimensions();
    spriteAnimationEngine.emitEffect('landlord_confirmed', {
      x: vw > 0 ? x / vw : 0.5,
      y: vh > 0 ? y / vh : 0.14,
      seat: 'center',
      label: '地主确认',
    });

    gsap.to(fx, {
      alpha: 0,
      delay: 0.85,
      duration: 0.25,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * Main dispatcher for Dou Dizhu pattern animations.
   */
  public playPatternEffect(patternType: string, patternLabel: string): void {
    switch (patternType) {
      case 'STRAIGHT':
        spriteAnimationEngine.emitEffect('straight', { label: patternLabel || '顺子' });
        this.playStraightEffect(patternLabel || '顺子');
        break;
      case 'CONSECUTIVE_PAIRS':
        spriteAnimationEngine.emitEffect('consecutive_pairs', { label: patternLabel || '连对' });
        this.playConsecutivePairsEffect(patternLabel || '连对');
        break;
      case 'AIRPLANE':
      case 'AIRPLANE_WITH_WINGS':
      case 'AIRPLANE_SINGLE_WINGS':
      case 'AIRPLANE_PAIR_WINGS':
        spriteAnimationEngine.emitEffect('airplane', { label: patternLabel || '飞机' });
        this.playAirplaneEffect(patternLabel || '飞机');
        break;
      case 'FOUR_WITH_TWO':
      case 'FOUR_WITH_TWO_SINGLES':
      case 'FOUR_WITH_TWO_PAIRS':
        this.playFourWithTwoEffect(patternLabel || '四带二');
        break;
      case 'BOMB':
      case 'LAIZI_BOMB':
      case 'PURE_LAIZI_BOMB':
      case 'SUPER_BOMB':
        spriteAnimationEngine.emitEffect('bomb', { label: patternLabel || '炸弹 ×2' });
        this.playBombEffect(patternLabel || '炸弹 ×2');
        break;
      case 'ROCKET':
        spriteAnimationEngine.emitEffect('rocket', { label: '王炸 ×2' });
        this.playRocketEffect();
        break;
      case 'SPRING':
      case 'ANTI_SPRING':
        spriteAnimationEngine.emitEffect('spring', { label: patternLabel || '春天 ×2' });
        this.playSpringEffect(patternLabel || '春天 ×2');
        break;
      default:
        break;
    }
  }

  /**
   * 1. STRAIGHT (`顺子`) — Uses authentic `/assets/vfx/landlords/shunzi.png` emblem,
   * `/assets/vfx/shunzi_gold.png` 3D sweep, and 10-frame `baodian.png` golden starburst spritesheet!
   */
  private playStraightEffect(label: string): void {
    soundEngine.playDdzSfx('shunzi');
    const { x: cx, y: cy } = this.getCenter();
    const fx = new Container();
    fx.position.set(cx, cy - 28);
    this.layer.addChild(fx);

    // 10-frame golden starlight burst sliced from `/assets/vfx/baodian.png`
    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: -110, y: -10, fps: 18, scale: 1.35 },
        fx
      );
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: 110, y: -10, fps: 18, scale: 1.35 },
        fx
      );
    }

    // Authentic particle overlay (`/assets/vfx/shunzi_particles.png`)
    if (this.texShunziParticles) {
      const pSprite = new Sprite(this.texShunziParticles);
      pSprite.anchor.set(0.5);
      pSprite.scale.set(1.1);
      fx.addChild(pSprite);
      gsap.fromTo(
        pSprite,
        { alpha: 0, scale: 0.6 },
        { alpha: 0.95, scale: 1.35, duration: 0.6, ease: 'power2.out' }
      );
    }

    // Sweeping emerald-gold arc ribbon
    const ribbon = new Graphics();
    ribbon
      .moveTo(-270, 14)
      .quadraticCurveTo(0, -34, 270, 14)
      .stroke({ color: 0xfbbf24, width: 6, alpha: 0.92 })
      .moveTo(-235, 22)
      .quadraticCurveTo(0, -20, 235, 22)
      .stroke({ color: 0x34d399, width: 3, alpha: 0.78 });
    ribbon.scale.set(0.2, 1);
    fx.addChild(ribbon);
    gsap.to(ribbon.scale, { x: 1.08, y: 1, duration: 0.34, ease: 'expo.out' });

    // Authentic `/assets/vfx/landlords/shunzi.png` emblem
    if (this.texShunziEmblem) {
      const emblem = new Sprite(this.texShunziEmblem);
      emblem.anchor.set(0.5);
      emblem.position.set(0, -6);
      emblem.scale.set(0.25);
      fx.addChild(emblem);
      gsap.to(emblem.scale, {
        x: 1.18,
        y: 1.18,
        duration: 0.36,
        ease: 'back.out(2.1)',
      });
    } else {
      const badge = this.createCalloutBadge(label, '#FFFBEB', '#D97706', '#451A03');
      fx.addChild(badge);
    }

    gsap.to(fx, {
      alpha: 0,
      y: cy - 52,
      delay: 0.92,
      duration: 0.28,
      ease: 'power2.in',
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 2. CONSECUTIVE PAIRS (`连对`) — Uses authentic `/assets/vfx/landlords/liandui.png` emblem
   * + dual-wave ribbon + 10-frame `baodian.png` starlight spritesheet!
   */
  private playConsecutivePairsEffect(label: string): void {
    soundEngine.playDdzSfx('liandui');
    const { x: cx, y: cy } = this.getCenter();
    const fx = new Container();
    fx.position.set(cx, cy - 28);
    this.layer.addChild(fx);

    // 10-frame golden starlight burst sliced from `/assets/vfx/baodian.png`
    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: -130, y: 0, fps: 20, scale: 1.3 },
        fx
      );
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: 130, y: 0, fps: 20, scale: 1.3 },
        fx
      );
    }

    // Symmetrical twin-wave ribbons
    const twinWave = new Graphics();
    twinWave
      .roundRect(-210, -24, 420, 48, 24)
      .fill({ color: 0x064e3b, alpha: 0.72 })
      .stroke({ color: 0x34d399, width: 2.5, alpha: 0.9 });
    twinWave.scale.set(0.25, 0.8);
    fx.addChild(twinWave);
    gsap.to(twinWave.scale, { x: 1.05, y: 1, duration: 0.34, ease: 'back.out(1.8)' });

    // Authentic `/assets/vfx/landlords/liandui.png` emblem
    if (this.texLianduiEmblem) {
      const emblem = new Sprite(this.texLianduiEmblem);
      emblem.anchor.set(0.5);
      emblem.position.set(0, -6);
      emblem.scale.set(0.25);
      fx.addChild(emblem);
      gsap.to(emblem.scale, {
        x: 1.18,
        y: 1.18,
        duration: 0.36,
        ease: 'back.out(2.1)',
      });
    } else {
      const badge = this.createCalloutBadge(label, '#ECFDF5', '#059669', '#022C22');
      fx.addChild(badge);
    }

    gsap.to(fx, {
      alpha: 0,
      y: cy - 52,
      delay: 0.92,
      duration: 0.28,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 3. AIRPLANE (`飞机` / `飞机带翅膀`) — Uses authentic 3-frame TexturePacker Golden Poker Biplane
   * (`/assets/vfx/air.png` + `air.plist`) + 5-frame Escort Bomber (`plane_1..5.png`) + cloud puffs (`huojianyan.png`).
   */
  private playAirplaneEffect(label: string): void {
    soundEngine.playDdzSfx('plane');
    const { x: cx, y: cy } = this.getCenter();
    const { width: vw } = this.getDimensions();

    const fx = new Container();
    this.layer.addChild(fx);

    // Center callout banner with starlight burst
    const banner = this.createCalloutBadge(label, '#F0F9FF', '#0284C7', '#082F49');
    banner.position.set(cx, cy - 115);
    banner.scale.set(0.3);
    fx.addChild(banner);
    gsap.to(banner.scale, { x: 1.05, y: 1.05, duration: 0.34, ease: 'back.out(2.0)' });

    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: cx, y: cy - 115, fps: 18, scale: 1.45 },
        fx
      );
    }

    // Main Plane Craft Container (flies right-to-left because `air.png` faces bottom-right/left)
    const craft = new Container();
    const startX = vw + 220;
    const endX = -260;
    const startY = cy - 45;
    const endY = cy + 15;
    craft.position.set(startX, startY);
    fx.addChild(craft);

    if (this.airBiplaneFrames.length > 0) {
      // Authentic 3-frame Golden 3D Poker Biplane from `air.png` + `air.plist`
      // Note: `air.png` nose points to the right (+X), so flip scale.x = -0.68 to fly right-to-left across the table
      const biplane = this.playFrameSequence(
        this.airBiplaneFrames,
        {
          x: 0,
          y: 0,
          fps: 24,
          scale: 0.68,
          loop: true,
        },
        craft
      );
      if (biplane) {
        biplane.scale.x = -0.68;
      }
    } else if (this.escortPlaneFrames.length > 0) {
      this.playFrameSequence(
        this.escortPlaneFrames,
        { x: 0, y: 0, fps: 20, scale: 1.15, loop: true },
        craft
      );
    }

    // Wingman escort plane when playing Airplane with Wings (`飞机带翅膀`)
    if (this.escortPlaneFrames.length > 0) {
      this.playFrameSequence(
        this.escortPlaneFrames,
        { x: 115, y: -58, fps: 20, scale: 0.88, loop: true },
        craft
      );
    }

    // Contrail smoke puffs (`/assets/vfx/huojianyan.png`) & sliced starlight sparks
    let tick = 0;
    gsap.to(craft, {
      x: endX,
      y: endY,
      duration: 1.28,
      ease: 'power1.inOut',
      onUpdate: () => {
        tick++;
        if (tick % 3 === 0) {
          if (this.texPlaneSmoke) {
            const puff = new Sprite(this.texPlaneSmoke);
            puff.anchor.set(0.5);
            puff.position.set(craft.x + 95, craft.y - 8 + (Math.random() - 0.5) * 20);
            puff.scale.set(0.32);
            puff.alpha = 0.85;
            fx.addChild(puff);
            gsap.to(puff, {
              x: puff.x + 48,
              alpha: 0,
              rotation: (Math.random() - 0.5) * 1.2,
              duration: 0.48,
              onComplete: () => puff.destroy(),
            });
            gsap.to(puff.scale, { x: 0.72, y: 0.72, duration: 0.48 });
          }
          if (tick % 6 === 0 && this.baodianStarFrames.length > 0) {
            this.playFrameSequence(
              this.baodianStarFrames,
              {
                x: craft.x + 80,
                y: craft.y + (Math.random() - 0.5) * 30,
                fps: 22,
                scale: 0.7,
              },
              fx
            );
          }
        }
      },
      onComplete: () => {
        gsap.to(fx, {
          alpha: 0,
          duration: 0.22,
          onComplete: () => fx.destroy({ children: true }),
        });
      },
    });
  }

  /**
   * 4. FOUR WITH TWO (`四带二`) — Uses 10-frame `zd.png` radial shockwave (`30001`..`30010`)
   * + 10-frame `baodian.png` golden sparkles + metallic callout badge.
   */
  private playFourWithTwoEffect(label: string): void {
    soundEngine.playDdzSfx('multiply');
    const { x: cx, y: cy } = this.getCenter();
    const fx = new Container();
    fx.position.set(cx, cy - 24);
    this.layer.addChild(fx);

    if (this.zdShockwaveFrames.length > 0) {
      this.playFrameSequence(
        this.zdShockwaveFrames,
        { x: 0, y: 0, fps: 22, scale: 0.85 },
        fx
      );
    }
    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: 0, y: 0, fps: 20, scale: 1.45 },
        fx
      );
    }

    const badge = this.createCalloutBadge(label, '#FEF3C7', '#D97706', '#451A03');
    badge.scale.set(0.25);
    fx.addChild(badge);
    gsap.to(badge.scale, { x: 1.06, y: 1.06, duration: 0.34, ease: 'back.out(2.1)' });

    gsap.to(fx, {
      alpha: 0,
      delay: 0.9,
      duration: 0.25,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 5. BOMB (`炸弹 ×2`) — Uses authentic 12-frame `landlords/bomb_1..12.png` sequence
   * + 12-frame TexturePacker Skull Bomb & Mushroom Cloud Smoke (`bomb.png` + `bomb.plist`)
   * + 10-frame `zd.png` radial shockwave (`30001..30010`) + ground scorch mark (`blast_scorch.png`).
   */
  private playBombEffect(label: string): void {
    const { x: cx, y: cy } = this.getCenter();
    const fx = new Container();
    this.layer.addChild(fx);

    const dropStartX = cx - 220;
    const dropStartY = cy - 230;
    const targetX = cx;
    const targetY = cy - 22;

    // Thrown Bomb Sprite (animated with `bomb_1..7` burning fuse frames during flight)
    const bombFlightNode = new Container();
    bombFlightNode.position.set(dropStartX, dropStartY);
    fx.addChild(bombFlightNode);

    const fuseFrames =
      this.classicBombFrames.length >= 7
        ? this.classicBombFrames.slice(0, 7)
        : this.skullBombFrames.slice(0, 4);

    if (fuseFrames.length > 0) {
      this.playFrameSequence(
        fuseFrames,
        { x: 0, y: 0, fps: 18, scale: 1.05, loop: true },
        bombFlightNode
      );
    }

    // Parabolic toss to center table
    const arcProxy = { t: 0 };
    gsap.to(arcProxy, {
      t: 1,
      duration: 0.42,
      ease: 'power1.in',
      onUpdate: () => {
        const t = arcProxy.t;
        bombFlightNode.x = dropStartX + (targetX - dropStartX) * t;
        bombFlightNode.y =
          dropStartY + (targetY - dropStartY) * t - Math.sin(t * Math.PI) * 115;
        bombFlightNode.rotation = t * 5.2;
      },
      onComplete: () => {
        bombFlightNode.destroy({ children: true });
        soundEngine.playBombExplosion(false);
        this.shakeTable(14, 0.46);

        // Ground scorch mark (`/assets/vfx/blast_scorch.png`)
        if (this.texBlastScorch) {
          const scorch = new Sprite(this.texBlastScorch);
          scorch.anchor.set(0.5);
          scorch.position.set(targetX, targetY + 28);
          scorch.scale.set(0.95);
          scorch.alpha = 0.85;
          fx.addChild(scorch);
        }

        // Expanding shockwave ring (`/assets/vfx/blast_ring.png`)
        if (this.texBlastRing) {
          const ring = new Sprite(this.texBlastRing);
          ring.anchor.set(0.5);
          ring.position.set(targetX, targetY + 12);
          ring.scale.set(0.3);
          fx.addChild(ring);
          gsap.to(ring.scale, { x: 2.1, y: 1.6, duration: 0.48, ease: 'expo.out' });
          gsap.to(ring, { alpha: 0, duration: 0.48, onComplete: () => ring.destroy() });
        }

        // Layer 1: 10-frame Radial Golden-Orange Shockwave from `zd.png` (`30001`..`30010`)
        if (this.zdShockwaveFrames.length > 0) {
          this.playFrameSequence(
            this.zdShockwaveFrames,
            { x: targetX, y: targetY, fps: 22, scale: 1.15 },
            fx
          );
        }

        // Layer 2: Authentic Mushroom Cloud Smoke frames (`bomb5`..`bomb11` from `bomb.png` + `bomb.plist`)
        if (this.skullBombFrames.length >= 12) {
          this.playFrameSequence(
            this.skullBombFrames.slice(4),
            { x: targetX, y: targetY - 26, fps: 16, scale: 0.88 },
            fx
          );
        }

        // Layer 3: Shatter & Comic Explosion frames (`bomb_8`..`bomb_12` from `landlords/bomb_*.png`)
        if (this.classicBombFrames.length >= 12) {
          this.playFrameSequence(
            this.classicBombFrames.slice(7),
            { x: targetX, y: targetY, fps: 16, scale: 1.25 },
            fx
          );
        }

        // Layer 4: 10-frame Starburst Sparks (`baodian.png`)
        if (this.baodianStarFrames.length > 0) {
          this.playFrameSequence(
            this.baodianStarFrames,
            { x: targetX, y: targetY - 15, fps: 20, scale: 1.6 },
            fx
          );
        }

        // Callout badge
        const badge = this.createCalloutBadge(label, '#FFFBEB', '#EA580C', '#431407');
        badge.position.set(targetX, targetY - 78);
        badge.scale.set(0.25);
        fx.addChild(badge);
        gsap.to(badge.scale, { x: 1.14, y: 1.14, duration: 0.36, ease: 'back.out(2.2)' });

        gsap.to(fx, {
          alpha: 0,
          delay: 0.92,
          duration: 0.28,
          onComplete: () => fx.destroy({ children: true }),
        });
      },
    });
  }

  /**
   * 6. ROCKET / JOKER BOMB (`王炸 ×2`) — Uses authentic 8-frame `landlords/joker_bomb_1..8.png`
   * + `/assets/vfx/nuclear_pillar.png` & `/assets/vfx/nuclear_cloud.png` + 12-frame `bomb.png` smoke
   * + 10-frame `zd.png` radial shockwave + 10-frame `baodian.png` starlight!
   */
  private playRocketEffect(): void {
    soundEngine.playBombExplosion(true);
    const { x: cx, y: cy } = this.getCenter();
    const { width: vw, height: vh } = this.getDimensions();

    const fx = new Container();
    this.layer.addChild(fx);

    // Subtle dark-crimson screen vignette flash
    const flash = new Graphics();
    flash.rect(0, 0, vw, vh).fill({ color: 0x3b0707, alpha: 0.34 });
    fx.addChild(flash);
    gsap.to(flash, { alpha: 0, duration: 0.72, ease: 'power2.out' });

    // Full 8-frame `joker_bomb_1..8.png` sequence (Plasma Core -> Sky Beam -> Nuclear Mushroom Cloud)
    if (this.jokerBombFrames.length > 0) {
      this.playFrameSequence(
        this.jokerBombFrames,
        {
          x: cx,
          y: cy - 28,
          fps: 12,
          scale: 1.55,
        },
        fx
      );
    }

    // Secondary high-res Nuclear Pillar & Mushroom Cloud (`/assets/vfx/nuclear_pillar.png` + `nuclear_cloud.png`)
    gsap.delayedCall(0.22, () => {
      this.shakeTable(20, 0.65);

      if (this.texBlastRing) {
        const ring = new Sprite(this.texBlastRing);
        ring.anchor.set(0.5);
        ring.position.set(cx, cy + 10);
        ring.scale.set(0.35);
        fx.addChild(ring);
        gsap.to(ring.scale, { x: 2.6, y: 1.9, duration: 0.58, ease: 'expo.out' });
        gsap.to(ring, { alpha: 0, duration: 0.58, onComplete: () => ring.destroy() });
      }

      if (this.texNuclearPillar) {
        const pillar = new Sprite(this.texNuclearPillar);
        pillar.anchor.set(0.5, 1);
        pillar.position.set(cx, cy + 30);
        pillar.scale.set(0.4, 0.2);
        fx.addChild(pillar);
        gsap.to(pillar.scale, { x: 1.4, y: 1.7, duration: 0.38, ease: 'expo.out' });
        gsap.to(pillar, {
          alpha: 0,
          delay: 0.38,
          duration: 0.35,
          onComplete: () => pillar.destroy(),
        });
      }

      if (this.texNuclearCloud) {
        const cloud = new Sprite(this.texNuclearCloud);
        cloud.anchor.set(0.5, 0.85);
        cloud.position.set(cx, cy + 16);
        cloud.scale.set(0.3);
        fx.addChild(cloud);
        gsap.to(cloud.scale, { x: 1.48, y: 1.48, duration: 0.48, ease: 'back.out(1.7)' });
        gsap.to(cloud, {
          y: cy - 28,
          alpha: 0,
          delay: 0.55,
          duration: 0.42,
          onComplete: () => cloud.destroy(),
        });
      }

      // 10-frame Radial Shockwave from `zd.png`
      if (this.zdShockwaveFrames.length > 0) {
        this.playFrameSequence(
          this.zdShockwaveFrames,
          { x: cx, y: cy - 18, fps: 22, scale: 1.4 },
          fx
        );
      }

      // 10-frame Starburst Sparks from `baodian.png`
      if (this.baodianStarFrames.length > 0) {
        this.playFrameSequence(
          this.baodianStarFrames,
          { x: cx - 90, y: cy - 40, fps: 20, scale: 1.5 },
          fx
        );
        this.playFrameSequence(
          this.baodianStarFrames,
          { x: cx + 90, y: cy - 40, fps: 20, scale: 1.5 },
          fx
        );
      }

      // Tournament-grade "王 炸 ×2" callout badge
      const badge = this.createCalloutBadge('王 炸 ×2', '#FFFBEB', '#DC2626', '#450A0A', 40);
      badge.position.set(cx, cy - 102);
      badge.scale.set(0.25);
      fx.addChild(badge);
      gsap.to(badge.scale, { x: 1.18, y: 1.18, duration: 0.4, ease: 'back.out(2.2)' });
    });

    gsap.to(fx, {
      alpha: 0,
      delay: 1.35,
      duration: 0.32,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 7. SPRING / ANTI-SPRING (`春天` / `反春`) — Uses `/assets/ui/title_chuntian_js.png`
   * + 10-frame `zd.png` radial golden aura + 10-frame `baodian.png` starlight + falling petals.
   */
  private playSpringEffect(label: string): void {
    soundEngine.playSpringCelebration();
    const { x: cx, y: cy } = this.getCenter();
    const { width: vw, height: vh } = this.getDimensions();

    const fx = new Container();
    this.layer.addChild(fx);

    if (this.zdShockwaveFrames.length > 0) {
      this.playFrameSequence(
        this.zdShockwaveFrames,
        { x: cx, y: cy - 30, fps: 18, scale: 1.35 },
        fx
      );
    }

    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: cx - 120, y: cy - 50, fps: 18, scale: 1.5 },
        fx
      );
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: cx + 120, y: cy - 50, fps: 18, scale: 1.5 },
        fx
      );
    }

    // Authentic SpriteSheet blossoms & starlight bursts (replacing legacy simple Graphics ellipses)
    const blossomTex = this.texPropFlower || this.texStarFlare;
    if (blossomTex) {
      for (let i = 0; i < 18; i++) {
        const useStar = i % 3 === 0 && this.texStarFlare;
        const sp = new Sprite(useStar ? this.texStarFlare! : blossomTex);
        sp.anchor.set(0.5);
        sp.scale.set(useStar ? 0.36 : 0.42 + (i % 3) * 0.08);
        sp.position.set(Math.random() * vw, -20 - Math.random() * 120);
        sp.rotation = Math.random() * Math.PI;
        fx.addChild(sp);

        gsap.to(sp, {
          y: vh + 40,
          x: sp.x + (Math.random() - 0.5) * 200,
          rotation: sp.rotation + (Math.random() - 0.5) * 6,
          duration: 1.45 + Math.random() * 0.65,
          ease: 'sine.inOut',
        });
      }
    }
    if (this.guangGoldFrames.length > 0) {
      this.playFrameSequence(
        this.guangGoldFrames,
        { x: cx, y: cy - 30, fps: 18, scale: 1.65 },
        fx
      );
    }

    if (this.texSpringTitle && !label.includes('反春')) {
      const titleSprite = new Sprite(this.texSpringTitle);
      titleSprite.anchor.set(0.5);
      titleSprite.position.set(cx, cy - 30);
      titleSprite.scale.set(0.2);
      fx.addChild(titleSprite);
      gsap.to(titleSprite.scale, { x: 1.08, y: 1.08, duration: 0.44, ease: 'back.out(2.0)' });
    } else {
      const badge = this.createCalloutBadge(label, '#FFFBEB', '#10B981', '#064E3B', 38);
      badge.position.set(cx, cy - 30);
      badge.scale.set(0.2);
      fx.addChild(badge);
      gsap.to(badge.scale, { x: 1.12, y: 1.12, duration: 0.44, ease: 'back.out(2.0)' });
    }

    gsap.to(fx, {
      alpha: 0,
      delay: 1.65,
      duration: 0.35,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 8. LAIZI REVEAL (`癞子亮牌`) — Uses 10-frame `baodian.png` golden starlight spritesheet.
   */
  public playLaiziRevealEffect(wildRanks: Rank[]): void {
    if (!wildRanks || wildRanks.length === 0) return;
    soundEngine.playPowerChime(2);

    const { x: cx, y: cy } = this.getCenter();
    const fx = new Container();
    fx.position.set(cx, cy - 60);
    this.layer.addChild(fx);

    if (this.baodianStarFrames.length > 0) {
      this.playFrameSequence(
        this.baodianStarFrames,
        { x: 0, y: 0, fps: 20, scale: 1.55 },
        fx
      );
    }

    const labelStr =
      wildRanks.length >= 2
        ? `天地癞子 [ ${wildRanks[0]} · ${wildRanks[1]} ]`
        : `本局癞子 [ ${wildRanks[0]} ]`;

    const badge = this.createCalloutBadge(labelStr, '#FEF3C7', '#D97706', '#451A03', 28);
    badge.scale.set(0.25);
    fx.addChild(badge);
    gsap.to(badge.scale, { x: 1, y: 1, duration: 0.36, ease: 'back.out(1.9)' });

    gsap.to(fx, {
      alpha: 0,
      y: cy - 86,
      delay: 1.15,
      duration: 0.28,
      onComplete: () => fx.destroy({ children: true }),
    });
  }

  /**
   * 9. INTERACTIVE PROP THROW (`互动道具投掷`) — Uses authentic `/assets/vfx/effect_emoji_*.png`
   * sprites and multi-frame impact bursts (`bomb_8..12.png`, `baodian.png` starlight, `zd.png` shockwave).
   */
  public playInteractivePropThrow(
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    propType: PropType
  ): void {
    const fx = new Container();
    this.layer.addChild(fx);

    const propTexMap: Record<PropType, Texture | null> = {
      flower: this.texPropFlower,
      bomb_cup: this.texPropBomb,
      tea: this.texPropEgg,
      like: this.texPropShoe,
      ingot: this.texStarFlare,
    };

    const propLabels: Record<PropType, string> = {
      flower: '赠送鲜花',
      bomb_cup: '投掷炸弹',
      tea: '清茶一盏',
      like: '点赞喝彩',
      ingot: '招财进宝',
    };

    const projectile = new Container();
    projectile.position.set(startPos.x, startPos.y);
    fx.addChild(projectile);

    const propTex = propTexMap[propType];
    if (propType === 'ingot') {
      try {
        const sp = Sprite.from('/assets/ui/csr_yuanbao_xiao.png');
        sp.anchor.set(0.5);
        sp.width = 48;
        sp.height = 38;
        projectile.addChild(sp);
      } catch {
        const fallback = new Graphics();
        fallback.circle(0, 0, 18).fill({ color: 0xfbbf24 });
        projectile.addChild(fallback);
      }
    } else if (propTex) {
      const sp = new Sprite(propTex);
      sp.anchor.set(0.5);
      sp.scale.set(0.95);
      projectile.addChild(sp);
    } else {
      const fallback = new Graphics();
      fallback.circle(0, 0, 18).fill({ color: 0xfbbf24 });
      projectile.addChild(fallback);
    }

    const proxy = { t: 0 };
    gsap.to(proxy, {
      t: 1,
      duration: 0.58,
      ease: 'power1.inOut',
      onUpdate: () => {
        const t = proxy.t;
        projectile.x = startPos.x + (endPos.x - startPos.x) * t;
        projectile.y =
          startPos.y + (endPos.y - startPos.y) * t - Math.sin(t * Math.PI) * 115;
        projectile.rotation = t * Math.PI * 3;
      },
      onComplete: () => {
        projectile.rotation = 0;

        if (propType === 'bomb_cup') {
          this.shakeTable(9, 0.34);
          if (this.zdShockwaveFrames.length > 0) {
            this.playFrameSequence(
              this.zdShockwaveFrames,
              { x: endPos.x, y: endPos.y, fps: 22, scale: 0.72 },
              fx
            );
          }
          if (this.classicBombFrames.length >= 12) {
            this.playFrameSequence(
              this.classicBombFrames.slice(7),
              { x: endPos.x, y: endPos.y, fps: 18, scale: 0.92 },
              fx
            );
          }
        } else if (this.baodianStarFrames.length > 0) {
          this.playFrameSequence(
            this.baodianStarFrames,
            { x: endPos.x, y: endPos.y, fps: 22, scale: 1.25 },
            fx
          );
        }

        const labelText = new Text({
          text: propLabels[propType] ?? '互动道具',
          style: new TextStyle({
            fontFamily: '"Noto Serif SC", "PingFang SC", serif',
            fontSize: 15,
            fontWeight: '900',
            fill: '#FEF08A',
            stroke: { color: '#451A03', width: 4 },
          }),
        });
        labelText.anchor.set(0.5);
        labelText.position.set(endPos.x, endPos.y - 38);
        fx.addChild(labelText);

        gsap.to(projectile.scale, {
          x: 1.45,
          y: 1.45,
          duration: 0.18,
          yoyo: true,
          repeat: 1,
        });
        gsap.to(fx, {
          alpha: 0,
          delay: 0.48,
          duration: 0.25,
          onComplete: () => fx.destroy({ children: true }),
        });
      },
    });
  }

  private createCalloutBadge(
    text: string,
    fillHex: string,
    accentHex: string,
    strokeHex: string,
    fontSize: number = 32
  ): Container {
    const c = new Container();

    const plateW = Math.max(180, text.length * (fontSize * 0.9) + 56);
    const plateH = fontSize + 24;
    const plate = new Graphics();
    plate
      .roundRect(-plateW / 2, -plateH / 2, plateW, plateH, plateH / 2)
      .fill({ color: 0x12171b, alpha: 0.88 })
      .stroke({ color: accentHex, width: 2.5, alpha: 0.92 });
    c.addChild(plate);

    if (this.texStarFlare) {
      const leftStar = new Sprite(this.texStarFlare);
      leftStar.anchor.set(0.5);
      leftStar.position.set(-plateW / 2 + 18, 0);
      leftStar.scale.set(0.28);
      c.addChild(leftStar);

      const rightStar = new Sprite(this.texStarFlare);
      rightStar.anchor.set(0.5);
      rightStar.position.set(plateW / 2 - 18, 0);
      rightStar.scale.set(0.28);
      c.addChild(rightStar);
    }

    const label = new Text({
      text,
      style: new TextStyle({
        fontFamily: '"Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif',
        fontSize,
        fontWeight: '900',
        fill: fillHex,
        stroke: { color: strokeHex, width: 5 },
        dropShadow: {
          color: 0x000000,
          blur: 8,
          distance: 2,
          alpha: 0.75,
        },
      }),
    });
    label.anchor.set(0.5);
    c.addChild(label);

    return c;
  }

  private shakeTable(intensity: number = 12, duration: number = 0.45): void {
    gsap.killTweensOf(this.stageToShake.position);
    this.stageToShake.position.set(0, 0);

    const steps = Math.max(6, Math.floor(duration / 0.035));
    const tl = gsap.timeline({
      onComplete: () => {
        this.stageToShake.position.set(0, 0);
      },
    });

    for (let i = 0; i < steps; i++) {
      const decay = 1 - i / steps;
      const dx = (Math.random() - 0.5) * 2 * intensity * decay;
      const dy = (Math.random() - 0.5) * 2 * intensity * decay;
      tl.to(this.stageToShake.position, {
        x: dx,
        y: dy,
        duration: 0.032,
        ease: 'none',
      });
    }
  }
}
