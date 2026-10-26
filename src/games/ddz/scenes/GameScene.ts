import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import gsap from 'gsap';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { effectCoordinator, EffectPriority } from '../../../shared/EffectCoordinator';
import { CARD_HEIGHT, CARD_WIDTH, getCardBackTexturePath } from '../assets/CardAtlasGenerator';
import { Card } from '../components/Card';
import { HandManager } from '../managers/HandManager';
import { CardData, DdzPhase, PropType, Rank } from '../types';
import { DdzVfxEngine } from './DdzVfxEngine';

export const DESIGN_WIDTH = 1334;
export const DESIGN_HEIGHT = 750;

export interface GameSceneCallbacks {
  onCallLandlord: (call: boolean) => void;
  onGrabLandlord: (grab: boolean) => void;
  onPlaySelectedCards: (cards: CardData[]) => void;
  onPassTurn: () => void;
  onRequestHint: () => void;
}

/**
 * PixiJS v8 Commercial 4.0 GameScene.
 * Features carved rosewood mahogany & royal emerald velvet table surface,
 * 3D horizontal flip hole-card tray, parabolic card play physics,
 * and 60fps commercial skill VFX (Rocket Missile Dive, Fuse Bomb Blast, 3D Biplane Flyby, Dragon Ribbon, Spring Blossom).
 */
export class GameScene extends Container {
  private tableBackground: Container = new Container();
  private playerAreas: Container = new Container();
  private bottomPlayer: Container = new Container();
  private leftPlayer: Container = new Container();
  private rightPlayer: Container = new Container();
  private playedCardsArea: Container = new Container();
  private landlordCardsArea: Container = new Container();
  private uiLayer: Container = new Container();
  private effectsLayer: Container = new Container();

  public handManager: HandManager;
  private vfxEngine: DdzVfxEngine;
  private callbacks: GameSceneCallbacks;
  public virtualWidth: number = DESIGN_WIDTH;

  private bottomThreeNodes: Container[] = [];
  private bottomTagBadge!: Container;
  private bottomTagText!: Text;

  private leftStackContainer!: Container;
  private leftCountText!: Text;
  private leftAlertBadge!: Container;
  private rightStackContainer!: Container;
  private rightCountText!: Text;
  private rightAlertBadge!: Container;

  private playedBottom: Container = new Container();
  private playedLeft: Container = new Container();
  private playedRight: Container = new Container();

  private turnTimerContainer: Container = new Container();
  private turnTimerText!: Text;
  private scoreDisplayText!: Text;

  private countdownInterval: number | null = null;
  private currentTimeoutAt: number = 0;
  private lastTickedSec: number = -1;
  private currentTurnRelativePos: 'bottom' | 'left' | 'right' | null = null;
  private lastSyncedUiScale: number = 1;

  private layoutPcts = {
    holeCardsTopPct: 7.6,
    scoreLineTopPct: 15.2,
    opponentDeckSideXPct: 6.9,
    opponentDeckTopPct: 29.6,
    turnClockSideXPct: 14.8,
    turnClockBottomTopPct: 47.2,
    playedSideXPct: 27.6,
    playedSideTopPct: 30.4,
    playedBottomTopPct: 40.5,
    handCenterYPct: 83.5,
    handWidthPct: 80,
    handCardScale: 1.0,
    comboBannerTopPct: 63.2,
    handBandTopPct: 69.3,
    handBandBottomPct: 98.7,
  };

  constructor(callbacks: GameSceneCallbacks, initialVirtualWidth = DESIGN_WIDTH) {
    super();
    this.callbacks = callbacks;
    this.virtualWidth = initialVirtualWidth;
    soundEngine.preloadDdzAudio();

    // Scene Graph hierarchy
    this.addChild(this.tableBackground);
    this.playerAreas.addChild(this.leftPlayer, this.rightPlayer, this.bottomPlayer);
    this.addChild(this.playerAreas);

    this.playedCardsArea.addChild(this.playedLeft, this.playedRight, this.playedBottom);
    this.addChild(this.playedCardsArea);

    this.addChild(this.landlordCardsArea);
    this.addChild(this.uiLayer);
    this.addChild(this.effectsLayer);

    this.handManager = new HandManager(this.bottomPlayer);
    this.vfxEngine = new DdzVfxEngine(
      this.effectsLayer,
      this,
      () => ({ x: this.virtualWidth / 2, y: DESIGN_HEIGHT / 2 }),
      () => ({ width: this.virtualWidth, height: DESIGN_HEIGHT })
    );

    this.buildTableBackground(this.virtualWidth, DESIGN_HEIGHT);
    this.buildOpponentDecks();
    this.buildLandlordCardsArea();
    this.buildUILayer();
    this.bindStageTouchSlideEvents();
  }

  public setVirtualDimensions(width: number, height: number): void {
    if (this.virtualWidth === width) return;
    this.virtualWidth = width;
    this.hitArea = new Rectangle(0, 0, width, height);
    this.buildTableBackground(width, height);
    this.applyLayoutPercentages(this.layoutPcts);
  }

  private bindStageTouchSlideEvents(): void {
    this.eventMode = 'static';
    this.hitArea = new Rectangle(0, 0, this.virtualWidth, DESIGN_HEIGHT);

    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (this.destroyed) return;
      const localPos = this.toLocal(e.global);
      this.handManager.handleScenePointerMove(localPos);
    });

    this.on('pointerup', () => {
      if (this.destroyed) return;
      this.handManager.handleScenePointerUp();
    });

    this.on('pointerupoutside', () => {
      if (this.destroyed) return;
      this.handManager.handleScenePointerUp();
    });
  }

  /**
   * Build 3D-perspective VIP Arena Table:
   * - Multi-layered carved rosewood mahogany outer rail with brushed brass corner inlays
   * - Deep emerald-jade velvet felt with layered radial overhead spotlighting
   * - Sculpted inner arena ring & authentic center emblem (`/assets/ui/Table_logo.png`)
   */
  private buildTableBackground(w = this.virtualWidth, h = DESIGN_HEIGHT): void {
    while (this.tableBackground.children.length > 0) {
      const ch = this.tableBackground.children[0];
      this.tableBackground.removeChild(ch);
      ch.destroy({ children: true });
    }

    // 1. Deep ambient room backdrop
    const backdrop = new Graphics();
    backdrop.rect(0, 0, w, h).fill({ color: 0x03130d });

    // 2. Outer Drop Shadow & Carved Rosewood Mahogany Rail (3D beveled wood Cushion)
    const railShadow = new Graphics();
    railShadow
      .roundRect(8, 6, w - 16, h - 12, 48)
      .fill({ color: 0x000000, alpha: 0.55 });

    const mahoganyOuter = new Graphics();
    mahoganyOuter
      .roundRect(12, 8, w - 24, h - 16, 44)
      .fill({ color: 0x2c0f08 })
      .stroke({ color: 0x160603, width: 3 });

    const mahoganyBevel = new Graphics();
    mahoganyBevel
      .roundRect(20, 15, w - 40, h - 30, 38)
      .fill({ color: 0x481a0f })
      .stroke({ color: 0xd4af37, width: 1.6, alpha: 0.55 });

    // Subtle top-rail specular highlight
    const railHighlight = new Graphics();
    railHighlight
      .roundRect(24, 18, w - 48, h - 36, 35)
      .stroke({ color: 0xfde68a, width: 0.8, alpha: 0.22 });

    // 3. Recessed Leather Cushion & Royal Emerald Velvet Felt Surface
    const cushionRecess = new Graphics();
    cushionRecess
      .roundRect(28, 22, w - 56, h - 44, 33)
      .fill({ color: 0x041e15 });

    const felt = new Graphics();
    felt
      .roundRect(34, 27, w - 68, h - 54, 29)
      .fill({ color: 0x083827 })
      .stroke({ color: 0x041f15, width: 5 });

    // Layered overhead casino spotlight ovals for 3D table depth
    const spotW = Math.min(620, w * 0.42);
    felt
      .ellipse(w / 2, 332, spotW, 245)
      .fill({ color: 0x0d4f38, alpha: 0.55 });
    felt
      .ellipse(w / 2, 322, spotW * 0.72, 175)
      .fill({ color: 0x126347, alpha: 0.38 });
    felt
      .ellipse(w / 2, 314, spotW * 0.44, 110)
      .fill({ color: 0x197a58, alpha: 0.22 });

    // 4. Sculpted Brass Hairline Inner Frame & Arena Betting Ring
    const goldInlay = new Graphics();
    goldInlay
      .roundRect(48, 39, w - 96, h - 78, 22)
      .stroke({ color: 0xd4af37, width: 1.2, alpha: 0.28 });
    goldInlay
      .roundRect(54, 45, w - 108, h - 90, 18)
      .stroke({ color: 0xd4af37, width: 0.6, alpha: 0.14 });

    // Center Arena Ring & Cardinal Compass Ticks
    const arenaRing = new Graphics();
    const ringRx = Math.min(340, w * 0.25);
    const ringRy = 128;
    const centerY = 304;
    arenaRing
      .ellipse(w / 2, centerY, ringRx, ringRy)
      .stroke({ color: 0xd4af37, width: 1.2, alpha: 0.16 });
    arenaRing
      .ellipse(w / 2, centerY, ringRx - 8, ringRy - 6)
      .stroke({ color: 0xfde68a, width: 0.6, alpha: 0.09 });

    // 4 Brushed Brass Corner Ornaments
    const corners = [
      { x: 64, y: 55, dx: 1, dy: 1 },
      { x: w - 64, y: 55, dx: -1, dy: 1 },
      { x: 64, y: h - 55, dx: 1, dy: -1 },
      { x: w - 64, y: h - 55, dx: -1, dy: -1 },
    ];
    for (const c of corners) {
      goldInlay
        .moveTo(c.x, c.y + c.dy * 18)
        .lineTo(c.x, c.y)
        .lineTo(c.x + c.dx * 18, c.y)
        .stroke({ color: 0xd4af37, width: 2, alpha: 0.45 });
      goldInlay
        .circle(c.x + c.dx * 5, c.y + c.dy * 5, 2)
        .fill({ color: 0xfde68a, alpha: 0.45 });
    }

    // 5. Authentic Center Table Emblem Sprite (/assets/ui/Table_logo.png)
    const centerEmblemHolder = new Container();
    centerEmblemHolder.position.set(w / 2, centerY - 6);
    const emblemSprite = Sprite.from('/assets/ui/Table_logo.png');
    emblemSprite.anchor.set(0.5);
    emblemSprite.alpha = 0.18;
    const syncEmblemSize = () => {
      const tex = emblemSprite.texture;
      if (tex && tex.width > 1 && tex.height > 1) {
        const targetW = 196;
        const scale = targetW / tex.width;
        emblemSprite.scale.set(scale);
      }
    };
    syncEmblemSize();
    if (emblemSprite.texture && emblemSprite.texture.width <= 1) {
      emblemSprite.texture.source?.once('update', () => {
        if (!this.destroyed && !emblemSprite.destroyed) {
          syncEmblemSize();
        }
      });
    }
    centerEmblemHolder.addChild(emblemSprite);

    felt.eventMode = 'static';
    felt.on('pointerdown', (e: FederatedPointerEvent) => {
      if (this.destroyed) return;
      const localPos = this.toLocal(e.global);
      const startedHandSlide = this.handManager.handleScenePointerDown(localPos);
      if (!startedHandSlide) {
        this.handManager.clearSelection();
      }
    });

    this.tableBackground.addChild(
      backdrop,
      railShadow,
      mahoganyOuter,
      mahoganyBevel,
      railHighlight,
      cushionRecess,
      felt,
      goldInlay,
      arenaRing,
      centerEmblemHolder
    );
  }

  private buildOpponentDecks(): void {
    const leftX = Math.round((this.virtualWidth * this.layoutPcts.opponentDeckSideXPct) / 100);
    const deckY = Math.round((DESIGN_HEIGHT * this.layoutPcts.opponentDeckTopPct) / 100);
    const leftStack = this.createCardBackStack(leftX, deckY);
    this.leftStackContainer = leftStack.container;
    this.leftCountText = leftStack.countText;
    this.leftAlertBadge = leftStack.alertBadge;
    this.leftPlayer.addChild(leftStack.container);

    const rightStack = this.createCardBackStack(this.virtualWidth - leftX, deckY);
    this.rightStackContainer = rightStack.container;
    this.rightCountText = rightStack.countText;
    this.rightAlertBadge = rightStack.alertBadge;
    this.rightPlayer.addChild(rightStack.container);
  }

  private createCardBackStack(
    x: number,
    y: number
  ): { container: Container; countText: Text; alertBadge: Container } {
    const container = new Container();
    container.position.set(x, y);

    // 1. Sculpted Dark-Obsidian & Brass Deck Pedestal
    const stackPedestal = new Graphics();
    stackPedestal
      .roundRect(-31, -38, 62, 80, 12)
      .fill({ color: 0x061510, alpha: 0.82 })
      .stroke({ color: 0xd4af37, width: 1.2, alpha: 0.42 });
    container.addChild(stackPedestal);

    // 2. Cascaded 3D Back Card Layers with Subtle Fan Rotation
    for (let i = 0; i < 3; i++) {
      const w = CARD_WIDTH * 0.52;
      const h = CARD_HEIGHT * 0.52;

      const layerNode = new Container();
      layerNode.position.set((i - 1) * 3.5, (i - 1) * 1.5 - 4);
      layerNode.rotation = (i - 1) * 0.045;

      const vectorBack = new Graphics();
      vectorBack
        .roundRect(-w / 2, -h / 2, w, h, 6)
        .fill({ color: 0x1e3a5f })
        .stroke({ color: 0x93c5fd, width: 1.2 });
      layerNode.addChild(vectorBack);

      const backSprite = Sprite.from(getCardBackTexturePath());
      const applySize = () => {
        const tex = backSprite.texture;
        if (tex && tex.width > 1 && tex.height > 1) {
          backSprite.width = w;
          backSprite.height = h;
          backSprite.pivot.set(w / 2, h / 2);
        }
      };
      applySize();
      const tex = backSprite.texture;
      if (tex && (tex.width <= 1 || tex.height <= 1)) {
        tex.source?.once('update', () => {
          if (!container.destroyed && !backSprite.destroyed) {
            applySize();
          }
        });
      }
      layerNode.addChild(backSprite);
      container.addChild(layerNode);
    }

    // 3. High-Contrast Tabular Card Count Plate
    const countBg = new Graphics();
    countBg
      .roundRect(-25, 13, 50, 24, 8)
      .fill({ color: 0x0b1116, alpha: 0.96 })
      .stroke({ color: 0xd4af37, width: 1.5, alpha: 0.85 });
    container.addChild(countBg);

    const countText = new Text({
      text: '17',
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 15,
        fontWeight: '800',
        fill: 0xfef08a,
      },
    });
    countText.anchor.set(0.5);
    countText.position.set(0, 25);
    container.addChild(countText);

    // 4. Siren Alert Lamp when Opponent has 1~2 Cards Left
    const alertBadge = new Container();
    alertBadge.position.set(0, -48);
    const alertBg = new Graphics();
    alertBg
      .roundRect(-30, -11, 60, 22, 11)
      .fill({ color: 0xdc2626 })
      .stroke({ color: 0xfef08a, width: 1.6 });
    const alertText = new Text({
      text: '警报',
      style: {
        fontFamily: 'PingFang SC, sans-serif',
        fontSize: 10,
        fontWeight: 'bold',
        fill: 0xffffff,
      },
    });
    alertText.anchor.set(0.5);
    alertBadge.addChild(alertBg, alertText);
    alertBadge.visible = false;
    container.addChild(alertBadge);

    return { container, countText, alertBadge };
  }

  private baseScoreValueText!: Text;
  private multiplierValueText!: Text;

  /**
   * Build Sculpted Top-Center 3-Card Hole-Card Pedestal (三张底牌鎏金底座).
   * Eliminates redundant left/right score text wings so the 3 hole cards sit cleanly at top-center.
   */
  private buildLandlordCardsArea(): void {
    this.landlordCardsArea.position.set(this.virtualWidth / 2, 52);

    const tray = new Graphics();
    // Outer dark-obsidian & brushed-gold bezel
    tray
      .roundRect(-118, -38, 236, 76, 16)
      .fill({ color: 0x0b1116, alpha: 0.9 })
      .stroke({ color: 0xd4af37, width: 1.5, alpha: 0.62 });
    // Inner recessed velvet slot well
    tray
      .roundRect(-110, -32, 220, 64, 12)
      .fill({ color: 0x050a0e, alpha: 0.85 })
      .stroke({ color: 0xffffff, width: 0.8, alpha: 0.08 });
    // Subtle decorative brass side studs
    tray.circle(-113, 0, 2).fill({ color: 0xfde68a, alpha: 0.65 });
    tray.circle(113, 0, 2).fill({ color: 0xfde68a, alpha: 0.65 });
    this.landlordCardsArea.addChild(tray);

    this.bottomTagBadge = new Container();
    this.bottomTagBadge.position.set(0, 40);
    const tagBg = new Graphics();
    tagBg
      .roundRect(-42, -11, 84, 22, 11)
      .fill({ color: 0xd97706 })
      .stroke({ color: 0xfef08a, width: 1.5 });
    this.bottomTagText = new Text({
      text: '特殊底牌',
      style: {
        fontFamily: 'PingFang SC, sans-serif',
        fontSize: 10,
        fontWeight: 'bold',
        fill: 0x18181b,
      },
    });
    this.bottomTagText.anchor.set(0.5);
    this.bottomTagBadge.addChild(tagBg, this.bottomTagText);
    this.bottomTagBadge.visible = false;
    this.landlordCardsArea.addChild(this.bottomTagBadge);

    this.resetBottomThreeCards();
  }

  resetBottomThreeCards(): void {
    if (this.destroyed || this.landlordCardsArea.destroyed) return;
    for (const node of this.bottomThreeNodes) {
      if (!node.destroyed) {
        this.killTweensRecursively(node);
        this.landlordCardsArea.removeChild(node);
        node.destroy({ children: true });
      }
    }
    this.bottomThreeNodes = [];
    if (this.bottomTagBadge && !this.bottomTagBadge.destroyed) {
      this.bottomTagBadge.visible = false;
    }

    for (let i = 0; i < 3; i++) {
      const slotNode = new Container();
      slotNode.position.set((i - 1) * 66, 0);

      const w = CARD_WIDTH;
      const h = CARD_HEIGHT;

      const vectorBack = new Graphics();
      vectorBack
        .roundRect(-w / 2, -h / 2, w, h, 8)
        .fill({ color: 0x1e3a5f })
        .stroke({ color: 0x93c5fd, width: 2 });
      slotNode.addChild(vectorBack);

      const backSprite = Sprite.from(getCardBackTexturePath());
      const applySize = () => {
        const tex = backSprite.texture;
        if (tex && tex.width > 1 && tex.height > 1) {
          backSprite.width = w;
          backSprite.height = h;
          backSprite.pivot.set(w / 2, h / 2);
        }
      };
      applySize();
      const tex = backSprite.texture;
      if (tex && (tex.width <= 1 || tex.height <= 1)) {
        tex.source?.once('update', () => {
          if (!this.destroyed && !slotNode.destroyed && !backSprite.destroyed) {
            applySize();
          }
        });
      }
      slotNode.addChild(backSprite);
      slotNode.scale.set(0.54);

      this.bottomThreeNodes.push(slotNode);
      this.landlordCardsArea.addChildAt(slotNode, 1 + i);
    }
  }

  /**
   * Reveal the 3 Landlord Hole Cards with 3D horizontal flip animation (`scaleX: 0.54 -> 0 -> 0.54`).
   */
  revealBottomThreeCards(
    cards: CardData[],
    animate = true,
    bonusTag: string | null = null
  ): void {
    if (this.destroyed || cards.length !== 3) return;

    cards.forEach((data, i) => {
      const slotNode = this.bottomThreeNodes[i];
      if (!slotNode || slotNode.destroyed) return;

      const swapToFace = () => {
        if (slotNode.destroyed) return;
        while (slotNode.children.length > 0) {
          const ch = slotNode.children[0];
          slotNode.removeChild(ch);
          ch.destroy({ children: true });
        }
        const faceCard = new Card(data, true, false);
        faceCard.pivot.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);

        // Gilded highlight frame on bottom card reveal
        const gildedGlow = new Graphics();
        gildedGlow
          .roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 8)
          .stroke({ color: 0xf59e0b, width: 2.2, alpha: 0.9 });
        faceCard.addChild(gildedGlow);
        gsap.fromTo(
          gildedGlow,
          { alpha: 0.2 },
          { alpha: 0.95, duration: 0.4, yoyo: true, repeat: 1, ease: 'sine.inOut' }
        );

        slotNode.addChild(faceCard);
      };

      gsap.killTweensOf(slotNode.scale);
      if (animate) {
        gsap.to(slotNode.scale, {
          x: 0,
          y: 0.6,
          duration: 0.14,
          delay: i * 0.07,
          ease: 'power2.in',
          onComplete: () => {
            swapToFace();
            if (!slotNode.destroyed && slotNode.scale) {
              gsap.to(slotNode.scale, {
                x: 0.54,
                y: 0.54,
                duration: 0.18,
                ease: 'back.out(1.8)',
              });
            }
          },
        });
      } else {
        swapToFace();
        slotNode.scale.set(0.54);
      }
    });

    if (animate && this.vfxEngine && this.landlordCardsArea) {
      this.vfxEngine.playLandlordConfirmedBurst(
        this.landlordCardsArea.x,
        this.landlordCardsArea.y
      );
    }

    if (this.bottomTagBadge && !this.bottomTagBadge.destroyed) {
      if (bonusTag) {
        this.bottomTagText.text = bonusTag;
        this.bottomTagBadge.visible = true;
        this.bottomTagBadge.scale.set(0.4);
        gsap.killTweensOf(this.bottomTagBadge.scale);
        gsap.to(this.bottomTagBadge.scale, {
          x: 1,
          y: 1,
          duration: 0.25,
          ease: 'back.out(2)',
        });
      } else {
        this.bottomTagBadge.visible = false;
      }
    }
  }

  private buildUILayer(): void {
    this.scoreDisplayText = new Text({
      text: '',
      style: {
        fontFamily: 'JetBrains Mono, PingFang SC, sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0xfde68a,
      },
    });
    this.scoreDisplayText.anchor.set(0.5);
    this.scoreDisplayText.visible = false;
    this.uiLayer.addChild(this.scoreDisplayText);

    this.buildTurnTimer();
    this.uiLayer.addChild(this.turnTimerContainer);
  }

  private buildTurnTimer(): void {
    const outerGlow = new Graphics();
    outerGlow.circle(0, 0, 29).fill({ color: 0xf59e0b, alpha: 0.18 });

    const circle = new Graphics();
    circle
      .circle(0, 0, 25)
      .fill({ color: 0x051f16, alpha: 0.95 })
      .stroke({ color: 0xfbbf24, width: 2.5 });

    this.turnTimerText = new Text({
      text: '18',
      style: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 18,
        fontWeight: '800',
        fill: 0xfef08a,
      },
    });
    this.turnTimerText.anchor.set(0.5);

    this.turnTimerContainer.addChild(outerGlow, circle, this.turnTimerText);
    this.turnTimerContainer.visible = false;
  }

  updateScoreAndMultiplier(baseScore: number, multiplier: number): void {
    if (this.destroyed) return;
    if (this.baseScoreValueText && !this.baseScoreValueText.destroyed) {
      this.baseScoreValueText.text = String(baseScore);
    }
    if (this.multiplierValueText && !this.multiplierValueText.destroyed) {
      this.multiplierValueText.text = `×${multiplier}`;
    }
  }

  updateOpponentCardCounts(leftCount: number, rightCount: number): void {
    if (this.destroyed) return;

    if (this.leftPlayer && !this.leftPlayer.destroyed) {
      this.leftPlayer.visible = leftCount > 0;
      if (this.leftCountText && !this.leftCountText.destroyed) {
        this.leftCountText.text = String(leftCount);
        this.leftCountText.style.fill = leftCount <= 2 ? 0xfca5a5 : 0xfef08a;
      }
      if (this.leftAlertBadge && !this.leftAlertBadge.destroyed) {
        const showLeftAlert = leftCount > 0 && leftCount <= 2;
        this.leftAlertBadge.visible = showLeftAlert;
      }
    }

    if (this.rightPlayer && !this.rightPlayer.destroyed) {
      this.rightPlayer.visible = rightCount > 0;
      if (this.rightCountText && !this.rightCountText.destroyed) {
        this.rightCountText.text = String(rightCount);
        this.rightCountText.style.fill = rightCount <= 2 ? 0xfca5a5 : 0xfef08a;
      }
      if (this.rightAlertBadge && !this.rightAlertBadge.destroyed) {
        const showRightAlert = rightCount > 0 && rightCount <= 2;
        this.rightAlertBadge.visible = showRightAlert;
      }
    }
  }

  /**
   * Triggers the sliced 2-frame Police Siren Alarm Lamp (`alarm.png` + `alarm.plist`)
   * at the specified player's seat when remaining cards drop to 1 or 2 (`报单` / `报双`).
   */
  public playSeatAlarm(relativePos: 'bottom' | 'left' | 'right', remainingCount: 1 | 2): void {
    if (this.destroyed || !this.effectsLayer || this.effectsLayer.destroyed) return;
    const deckX = Math.round((this.virtualWidth * this.layoutPcts.opponentDeckSideXPct) / 100);
    const deckY = Math.round((DESIGN_HEIGHT * this.layoutPcts.opponentDeckTopPct) / 100);

    const pos =
      relativePos === 'left'
        ? { x: deckX + 52, y: deckY - 12 }
        : relativePos === 'right'
          ? { x: this.virtualWidth - deckX - 52, y: deckY - 12 }
          : { x: Math.round(this.virtualWidth * 0.22), y: Math.round(DESIGN_HEIGHT * 0.68) };

    this.vfxEngine.playSeatAlarmLamp(pos.x, pos.y, remainingCount);
  }

  updateTurnState(
    phase: DdzPhase,
    relativePos: 'bottom' | 'left' | 'right' | null,
    timeoutAt: number,
    _isFreeLead: boolean
  ): void {
    if (this.destroyed || !this.turnTimerContainer || this.turnTimerContainer.destroyed) return;

    this.currentTurnRelativePos = relativePos;

    if (
      !relativePos ||
      (phase !== 'BIDDING' &&
        phase !== 'GRABBING' &&
        phase !== 'DOUBLING' &&
        phase !== 'PLAYING')
    ) {
      this.turnTimerContainer.visible = false;
      this.stopCountdown();
      return;
    }

    const sideClockX = Math.round((this.virtualWidth * this.layoutPcts.turnClockSideXPct) / 100);
    const sideClockY = Math.round((DESIGN_HEIGHT * this.layoutPcts.opponentDeckTopPct) / 100);
    const bottomClockY = Math.round((DESIGN_HEIGHT * this.layoutPcts.turnClockBottomTopPct) / 100);

    if (relativePos === 'bottom') {
      this.clearPlayedSlot(this.playedBottom);
      this.turnTimerContainer.position.set(this.virtualWidth / 2, bottomClockY);
    } else if (relativePos === 'left') {
      this.clearPlayedSlot(this.playedLeft);
      this.turnTimerContainer.position.set(sideClockX, sideClockY);
    } else if (relativePos === 'right') {
      this.clearPlayedSlot(this.playedRight);
      this.turnTimerContainer.position.set(this.virtualWidth - sideClockX, sideClockY);
    }

    this.turnTimerContainer.visible = true;
    this.startCountdown(timeoutAt);
  }

  /**
   * Synchronize PixiJS stage coordinates with resolution-tier percentage matrix.
   */
  public applyLayoutPercentages(pcts: {
    holeCardsTopPct: number;
    scoreLineTopPct: number;
    opponentDeckSideXPct: number;
    opponentDeckTopPct: number;
    turnClockSideXPct: number;
    turnClockBottomTopPct: number;
    playedSideXPct: number;
    playedSideTopPct: number;
    playedBottomTopPct: number;
    handCenterYPct: number;
    handWidthPct: number;
    handCardScale: number;
    comboBannerTopPct: number;
    handBandTopPct: number;
    handBandBottomPct: number;
  }): void {
    if (this.destroyed) return;
    this.layoutPcts = { ...pcts };

    if (this.landlordCardsArea && !this.landlordCardsArea.destroyed) {
      this.landlordCardsArea.position.set(
        this.virtualWidth / 2,
        Math.round((DESIGN_HEIGHT * pcts.holeCardsTopPct) / 100)
      );
    }

    if (this.scoreDisplayText && !this.scoreDisplayText.destroyed) {
      this.scoreDisplayText.position.set(
        this.virtualWidth / 2,
        Math.round((DESIGN_HEIGHT * pcts.scoreLineTopPct) / 100)
      );
    }

    const deckX = Math.round((this.virtualWidth * pcts.opponentDeckSideXPct) / 100);
    const deckY = Math.round((DESIGN_HEIGHT * pcts.opponentDeckTopPct) / 100);
    if (this.leftStackContainer && !this.leftStackContainer.destroyed) {
      this.leftStackContainer.position.set(deckX, deckY);
    }
    if (this.rightStackContainer && !this.rightStackContainer.destroyed) {
      this.rightStackContainer.position.set(this.virtualWidth - deckX, deckY);
    }

    const playedSideX = Math.round((this.virtualWidth * pcts.playedSideXPct) / 100);
    const playedSideY = Math.round((DESIGN_HEIGHT * pcts.playedSideTopPct) / 100);
    const playedBottomY = Math.round((DESIGN_HEIGHT * pcts.playedBottomTopPct) / 100);
    if (this.playedLeft && !this.playedLeft.destroyed) {
      this.playedLeft.position.set(playedSideX, playedSideY);
    }
    if (this.playedRight && !this.playedRight.destroyed) {
      this.playedRight.position.set(this.virtualWidth - playedSideX, playedSideY);
    }
    if (this.playedBottom && !this.playedBottom.destroyed) {
      this.playedBottom.position.set(this.virtualWidth / 2, playedBottomY);
    }

    if (this.turnTimerContainer && !this.turnTimerContainer.destroyed && this.currentTurnRelativePos) {
      const sideClockX = Math.round((this.virtualWidth * pcts.turnClockSideXPct) / 100);
      const bottomClockY = Math.round((DESIGN_HEIGHT * pcts.turnClockBottomTopPct) / 100);
      if (this.currentTurnRelativePos === 'bottom') {
        this.turnTimerContainer.position.set(this.virtualWidth / 2, bottomClockY);
      } else if (this.currentTurnRelativePos === 'left') {
        this.turnTimerContainer.position.set(sideClockX, deckY);
      } else if (this.currentTurnRelativePos === 'right') {
        this.turnTimerContainer.position.set(this.virtualWidth - sideClockX, deckY);
      }
    }

    this.handManager.configureResponsiveZone({
      centerX: this.virtualWidth / 2,
      baseY: Math.round((DESIGN_HEIGHT * pcts.handCenterYPct) / 100),
      availableWidth: Math.round((this.virtualWidth * pcts.handWidthPct) / 100),
      cardScale: pcts.handCardScale,
      comboBannerY: Math.round((DESIGN_HEIGHT * pcts.comboBannerTopPct) / 100),
      handBandTop: Math.round((DESIGN_HEIGHT * pcts.handBandTopPct) / 100),
      handBandBottom: Math.round((DESIGN_HEIGHT * pcts.handBandBottomPct) / 100),
    });
  }

  /**
   * Frame-synchronized scale modulation driven by `--ui-element-scale` inside requestAnimationFrame.
   * Uses a sub-pixel deadzone threshold (0.001) to prevent high-refresh-rate (90Hz/120Hz) matrix jitter.
   */
  public syncFrameUiScale(uiElementScale: number): void {
    if (this.destroyed) return;
    const clamped = Math.max(0.75, Math.min(1.05, uiElementScale));
    // Map --ui-element-scale [0.78..1.0] to a subtle PixiJS widget scale [0.90..1.0]
    const widgetScale = Number((0.9 + ((clamped - 0.78) / 0.22) * 0.1).toFixed(4));
    if (Math.abs(widgetScale - this.lastSyncedUiScale) < 0.001) {
      return;
    }
    this.lastSyncedUiScale = widgetScale;

    if (this.landlordCardsArea && !this.landlordCardsArea.destroyed) {
      this.landlordCardsArea.scale.set(widgetScale);
    }
    if (this.leftStackContainer && !this.leftStackContainer.destroyed) {
      this.leftStackContainer.scale.set(widgetScale);
    }
    if (this.rightStackContainer && !this.rightStackContainer.destroyed) {
      this.rightStackContainer.scale.set(widgetScale);
    }
    if (this.turnTimerContainer && !this.turnTimerContainer.destroyed) {
      this.turnTimerContainer.scale.set(widgetScale);
    }
    if (this.scoreDisplayText && !this.scoreDisplayText.destroyed) {
      this.scoreDisplayText.scale.set(widgetScale);
    }
  }

  /**
   * Render seat action badge or physical card-play trajectory onto the table.
   */
  showSeatAction(
    relativePos: 'bottom' | 'left' | 'right',
    action: {
      type:
        | 'call'
        | 'no_call'
        | 'grab'
        | 'no_grab'
        | 'swap_three'
        | 'double_1'
        | 'double_2'
        | 'double_4'
        | 'play'
        | 'pass';
      cards?: CardData[];
      patternLabel?: string;
      isLandlord?: boolean;
    }
  ): void {
    if (this.destroyed) return;
    const slot =
      relativePos === 'bottom'
        ? this.playedBottom
        : relativePos === 'left'
          ? this.playedLeft
          : this.playedRight;

    if (!slot || slot.destroyed) return;
    this.clearPlayedSlot(slot);

    const playedSideX = Math.round((this.virtualWidth * this.layoutPcts.playedSideXPct) / 100);
    const playedSideY = Math.round((DESIGN_HEIGHT * this.layoutPcts.playedSideTopPct) / 100);
    const playedBottomY = Math.round((DESIGN_HEIGHT * this.layoutPcts.playedBottomTopPct) / 100);

    const anchorPos =
      relativePos === 'bottom'
        ? { x: this.virtualWidth / 2, y: playedBottomY }
        : relativePos === 'left'
          ? { x: playedSideX, y: playedSideY }
          : { x: this.virtualWidth - playedSideX, y: playedSideY };

    slot.position.set(anchorPos.x, anchorPos.y);

    if (action.type !== 'play' || !action.cards || action.cards.length === 0) {
      const textMap: Record<string, { text: string; color: number }> = {
        call: { text: '叫地主', color: 0xfbbf24 },
        no_call: { text: '不 叫', color: 0xcbd5e1 },
        grab: { text: '抢地主!', color: 0xf87171 },
        no_grab: { text: '不 抢', color: 0xcbd5e1 },
        swap_three: { text: '已选三张', color: 0x38bdf8 },
        double_1: { text: '不加倍', color: 0xcbd5e1 },
        double_2: { text: '加倍 ×2', color: 0xfbbf24 },
        double_4: { text: '超级加倍 ×4', color: 0xf87171 },
        pass: { text: '不 出', color: 0x94a3b8 },
      };
      const item = textMap[action.type] ?? { text: '不 出', color: 0x94a3b8 };

      const badge = new Container();
      const w = action.type === 'double_4' ? 136 : 104;
      const bg = new Graphics();
      bg.roundRect(-w / 2, -18, w, 36, 18)
        .fill({ color: 0x051e15, alpha: 0.92 })
        .stroke({ color: item.color, width: 1.8, alpha: 0.85 });

      const label = new Text({
        text: item.text,
        style: {
          fontFamily: 'Outfit, PingFang SC, Microsoft YaHei, sans-serif',
          fontSize: 17,
          fontWeight: 'bold',
          fill: item.color,
        },
      });
      label.anchor.set(0.5);
      badge.addChild(bg, label);
      badge.scale.set(0.5);
      slot.addChild(badge);
      gsap.to(badge.scale, { x: 1, y: 1, duration: 0.18, ease: 'back.out(1.7)' });

      if (this.vfxEngine) {
        this.vfxEngine.playSeatActionBurst(
          anchorPos.x,
          anchorPos.y,
          action.type,
          relativePos
        );
      }
      return;
    }

    // Sort played cards canonically: main Triples/Quads on the left, kickers/wings on the right
    const freqMap = new Map<number, number>();
    for (const c of action.cards) {
      freqMap.set(c.value, (freqMap.get(c.value) ?? 0) + 1);
    }
    const hasTripleOrQuad = Array.from(freqMap.values()).some((cnt) => cnt >= 3);
    const cards = hasTripleOrQuad
      ? [...action.cards].sort((a, b) => {
          const ca = freqMap.get(a.value) ?? 1;
          const cb = freqMap.get(b.value) ?? 1;
          const ga = ca >= 3 ? ca : 0;
          const gb = cb >= 3 ? cb : 0;
          if (gb !== ga) return gb - ga;
          if (cb !== ca) return cb - ca;
          return b.value - a.value;
        })
      : [...action.cards];

    const count = cards.length;
    // Adaptive card fan step so 8~12 card straights/airplanes stay compact inside seat zone
    const step = count > 9 ? 22 : count > 6 ? 25 : 29;
    const totalW = (count - 1) * step;
    const startX =
      relativePos === 'left'
        ? Math.max(-90, -totalW * 0.35)
        : relativePos === 'right'
          ? Math.min(90 - totalW, -totalW * 0.65)
          : -totalW / 2;

    const originOffset =
      relativePos === 'bottom'
        ? { x: 0, y: 110 }
        : relativePos === 'left'
          ? { x: -115, y: -8 }
          : { x: 115, y: -8 };

    const impactRipple = new Graphics();
    impactRipple
      .ellipse(startX + totalW / 2, 0, Math.max(52, totalW * 0.52), 24)
      .stroke({ color: 0xfde68a, width: 1.4, alpha: 0.45 });
    slot.addChild(impactRipple);
    gsap.to(impactRipple.scale, { x: 1.3, y: 1.3, duration: 0.28, ease: 'power2.out' });
    gsap.to(impactRipple, { alpha: 0, duration: 0.28 });

    const playedScale = count > 8 ? 0.66 : 0.7;
    cards.forEach((cData, i) => {
      const isLandlordCard = Boolean(action.isLandlord && i === count - 1);
      const card = new Card(cData, true, isLandlordCard);
      card.pivot.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
      card.scale.set(0.5);
      card.position.set(originOffset.x, originOffset.y);
      card.rotation = (i - (count - 1) / 2) * 0.024;
      slot.addChild(card);

      const finalRot = ((i % 3) - 1) * 0.012;
      gsap.to(card, {
        x: startX + i * step,
        y: 0,
        rotation: finalRot,
        duration: 0.2,
        delay: i * 0.012,
        ease: 'back.out(1.35)',
      });
      gsap.to(card.scale, {
        x: playedScale,
        y: playedScale,
        duration: 0.2,
        delay: i * 0.012,
        ease: 'back.out(1.4)',
      });
    });

    if (action.patternLabel && action.patternLabel !== '单张' && action.patternLabel !== '对子') {
      const tagContainer = new Container();
      tagContainer.position.set(0, 62);
      const tagBg = new Graphics();
      tagBg
        .roundRect(-48, -12, 96, 24, 12)
        .fill({ color: 0x051e15, alpha: 0.9 })
        .stroke({ color: 0xf59e0b, width: 1.4 });
      const tag = new Text({
        text: action.patternLabel,
        style: {
          fontFamily: 'Outfit, PingFang SC, sans-serif',
          fontSize: 13,
          fontWeight: 'bold',
          fill: 0xfde68a,
        },
      });
      tag.anchor.set(0.5);
      tagContainer.addChild(tagBg, tag);
      slot.addChild(tagContainer);
    }
  }

  /**
   * Parabolic Interactive Prop Throw System (鲜花 / 炸弹茶杯 / 敬茶 / 点赞 / 元宝)
   */
  playPropThrowEffect(
    fromRel: 'bottom' | 'left' | 'right',
    toRel: 'bottom' | 'left' | 'right',
    propType: PropType
  ): void {
    if (this.destroyed || !this.effectsLayer || this.effectsLayer.destroyed) return;

    effectCoordinator.enqueue({
      sceneId: 'ddz',
      type: `ddz_prop_${propType}`,
      priority: EffectPriority.AMBIENT,
      channel: 'ambient',
      durationMs: 1400,
      onStart: () => {
        this.executePropThrowEffect(fromRel, toRel, propType);
      },
    });
  }

  private executePropThrowEffect(
    fromRel: 'bottom' | 'left' | 'right',
    toRel: 'bottom' | 'left' | 'right',
    propType: PropType
  ): void {
    if (this.destroyed || !this.effectsLayer || this.effectsLayer.destroyed) return;

    const coords: Record<'bottom' | 'left' | 'right', { x: number; y: number }> = {
      bottom: { x: 130, y: 690 },
      left: { x: 140, y: 140 },
      right: { x: this.virtualWidth - 140, y: 140 },
    };

    this.vfxEngine.playInteractivePropThrow(coords[fromRel], coords[toRel], propType);
  }

  clearAllPlayedAreas(): void {
    if (this.destroyed) return;
    this.clearPlayedSlot(this.playedBottom);
    this.clearPlayedSlot(this.playedLeft);
    this.clearPlayedSlot(this.playedRight);
  }

  private clearPlayedSlot(slot: Container): void {
    if (!slot || slot.destroyed) return;
    while (slot.children.length > 0) {
      const child = slot.children[0];
      slot.removeChild(child);
      this.killTweensRecursively(child);
      child.destroy({ children: true });
    }
  }

  private killTweensRecursively(node: Container): void {
    gsap.killTweensOf(node);
    if (node.scale) {
      gsap.killTweensOf(node.scale);
    }
    if (node.children) {
      for (const ch of node.children) {
        this.killTweensRecursively(ch as Container);
      }
    }
  }

  private triggerScreenShake(intensity = 12, duration = 0.48): void {
    if (this.destroyed) return;
    gsap.killTweensOf(this);
    gsap.fromTo(
      this,
      { x: -intensity, y: -intensity * 0.65 },
      {
        x: 0,
        y: 0,
        duration,
        ease: 'elastic.out(1.3, 0.18)',
      }
    );
  }

  /**
   * Commercial 4.0 60fps Skill & Pattern VFX Engine:
   * - ROCKET (王炸): Dragon Missile Launch -> Sky Dive -> Double Shockwave + Nuclear Flash + Authentic Fire/Burst Sprites
   * - BOMB (炸弹): 3D Bomb Sprite Throw (/assets/ui/csr_zha.png) -> Sizzling Sparks (/assets/ui/csr_huoxing.png) -> Shrapnel Explosion
   * - AIRPLANE* (飞机): 3D Twin-Wing Golden Biplane Flyby with Cloud Contrails + Light Burst
   * - STRAIGHT / CONSECUTIVE_PAIRS (顺子/连对): Golden Dragon Ribbon Sweep + Radial Burst
   * - SPRING (春天/反春): Authentic Spring Callout Sprite (/assets/ui/sy_chuntian.png) + Full-screen Peach Blossom Cascade
   */
  playPatternEffect(patternType: string, patternLabel: string): void {
    if (
      this.destroyed ||
      !this.effectsLayer ||
      this.effectsLayer.destroyed ||
      patternType === 'SINGLE' ||
      patternType === 'PAIR' ||
      patternType === 'TRIPLE' ||
      patternType === 'TRIPLE_SINGLE' ||
      patternType === 'TRIPLE_PAIR' ||
      patternType === 'PASS'
    ) {
      return;
    }

    if (patternType === 'ROCKET') {
      effectCoordinator.enqueue({
        sceneId: 'ddz',
        type: 'ddz_rocket',
        label: patternLabel,
        priority: EffectPriority.ULTIMATE,
        maskLevel: 'heavy',
        useGlobalMask: true,
        durationMs: 1650,
        preemptLowerPriority: true,
        onStart: () => {
          if (this.destroyed) return;
          hapticEngine.rocketBlast();
          this.vfxEngine.playPatternEffect('ROCKET', patternLabel);
        },
      });
      return;
    }
    if (
      patternType === 'BOMB' ||
      patternType === 'LAIZI_BOMB' ||
      patternType === 'PURE_LAIZI_BOMB' ||
      patternType === 'SUPER_BOMB'
    ) {
      effectCoordinator.enqueue({
        sceneId: 'ddz',
        type: 'ddz_bomb',
        label: patternLabel,
        priority: EffectPriority.CRITICAL,
        maskLevel: 'medium',
        useGlobalMask: true,
        durationMs: 1450,
        preemptLowerPriority: true,
        onStart: () => {
          if (this.destroyed) return;
          hapticEngine.bombBlast();
          this.vfxEngine.playPatternEffect(patternType, patternLabel);
        },
      });
      return;
    }
    if (patternType.startsWith('AIRPLANE')) {
      effectCoordinator.enqueue({
        sceneId: 'ddz',
        type: 'ddz_airplane',
        label: patternLabel,
        priority: EffectPriority.MAJOR,
        maskLevel: 'subtle',
        useGlobalMask: true,
        durationMs: 1250,
        onStart: () => {
          if (this.destroyed) return;
          this.vfxEngine.playPatternEffect(patternType, patternLabel);
        },
      });
      return;
    }
    if (patternType === 'SPRING' || patternType === 'ANTI_SPRING') {
      effectCoordinator.enqueue({
        sceneId: 'ddz',
        type: 'ddz_spring',
        label: patternLabel,
        priority: EffectPriority.ULTIMATE,
        maskLevel: 'medium',
        useGlobalMask: true,
        durationMs: 2200,
        preemptLowerPriority: true,
        onStart: () => {
          if (this.destroyed) return;
          this.vfxEngine.playPatternEffect(patternType, patternLabel);
        },
      });
      return;
    }

    // Default: Straight / Consecutive Pairs / Four-with-Two
    effectCoordinator.enqueue({
      sceneId: 'ddz',
      type: 'ddz_ribbon',
      label: patternLabel,
      priority: EffectPriority.MAJOR,
      maskLevel: 'none',
      useGlobalMask: false,
      durationMs: 920,
      onStart: () => {
        if (this.destroyed) return;
        this.vfxEngine.playPatternEffect(patternType, patternLabel);
      },
    });
  }

  private startCountdown(timeoutAt: number): void {
    this.stopCountdown();
    this.currentTimeoutAt = timeoutAt;
    this.lastTickedSec = -1;

    const tick = () => {
      if (
        this.destroyed ||
        !this.turnTimerText ||
        this.turnTimerText.destroyed ||
        !this.turnTimerText.style
      ) {
        this.stopCountdown();
        return;
      }
      const remSec = Math.max(0, Math.ceil((this.currentTimeoutAt - Date.now()) / 1000));
      this.turnTimerText.text = String(remSec);
      this.turnTimerText.tint = remSec <= 5 ? 0xf87171 : 0xfef08a;

      if (remSec > 0 && remSec <= 5 && remSec !== this.lastTickedSec) {
        this.lastTickedSec = remSec;
        soundEngine.playCountdownTick(remSec <= 3);
        if (remSec <= 3) {
          hapticEngine.urgentCountdown();
        }
      }
    };

    tick();
    this.countdownInterval = window.setInterval(tick, 250);
  }

  /**
   * 6. LAIZI REVEAL (星耀赖子揭晓特效) — Delegated to DdzVfxEngine
   */
  public playLaiziRevealEffect(wildRanks: Rank[]): void {
    if (this.destroyed || !this.effectsLayer || this.effectsLayer.destroyed || wildRanks.length === 0) {
      return;
    }
    this.vfxEngine.playLaiziRevealEffect(wildRanks);
  }

  private stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  destroyScene(): void {
    this.stopCountdown();
    effectCoordinator.clearScene('ddz');
    if (!this.destroyed) {
      this.killTweensRecursively(this);
      this.handManager.clearHand();
      this.destroy({ children: true });
    }
  }
}
