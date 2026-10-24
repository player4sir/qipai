import { Assets, Graphics, Text } from 'pixi.js';
import { CardData, Rank, Suit } from '../types';

export const CARD_WIDTH = 96;
export const CARD_HEIGHT = 126;
export const CARD_RADIUS = 10;

/**
 * Returns all 55 Dou Dizhu poker card texture URLs for preloading.
 */
export function getAllCardTexturePaths(): string[] {
  const paths: string[] = ['/assets/ddz/cards/Card_Back_Default.png'];
  const suits = ['Spade', 'Heart', 'Club', 'Diamond'];
  const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

  for (const suit of suits) {
    for (const rank of ranks) {
      paths.push(`/assets/ddz/cards/Card_${suit}_${rank}.png`);
    }
  }
  paths.push('/assets/ddz/cards/Card_Joker_Black_SmallKing.png');
  paths.push('/assets/ddz/cards/Card_Joker_Red_BigKing.png');
  paths.push('/assets/ui/fx_light_burst.png');
  paths.push('/assets/ui/csr_zha.png');
  paths.push('/assets/ui/csr_huo.png');
  paths.push('/assets/ui/csr_huoxing.png');
  paths.push('/assets/ui/sy_chuntian.png');
  paths.push('/assets/ui/sy_shengli.png');
  paths.push('/assets/ui/sy_shibai.png');
  paths.push('/assets/ui/csr_yuanbao_xiao.png');
  return paths;
}

let cardTexturesPreloadPromise: Promise<void> | null = null;

/**
 * Batch-preload all 55 HD poker card textures into PixiJS Assets cache.
 * Prevents asynchronous hydration pop and layout distortions.
 */
export async function preloadAllCardTextures(): Promise<void> {
  if (cardTexturesPreloadPromise) {
    return cardTexturesPreloadPromise;
  }
  const paths = getAllCardTexturePaths();
  cardTexturesPreloadPromise = (async () => {
    try {
      await Assets.load(paths);
    } catch (e) {
      console.warn('Failed to preload some card textures:', e);
    }
  })();
  return cardTexturesPreloadPromise;
}

/**
 * Maps card suit and rank to official Tencent HLDDZ HD asset paths.
 */
export function getCardTexturePath(cardData: CardData, faceUp = true): string {
  if (!faceUp) {
    return '/assets/ddz/cards/Card_Back_Default.png';
  }
  const { rank, suit } = cardData;
  if (rank === 'small_joker') {
    return '/assets/ddz/cards/Card_Joker_Black_SmallKing.png';
  }
  if (rank === 'big_joker') {
    return '/assets/ddz/cards/Card_Joker_Red_BigKing.png';
  }
  const suitMap: Record<string, string> = {
    spade: 'Spade',
    heart: 'Heart',
    club: 'Club',
    diamond: 'Diamond',
  };
  const suitKey = suit ? String(suit).toLowerCase() : 'spade';
  const suitName = suitMap[suitKey] || 'Spade';
  return `/assets/ddz/cards/Card_${suitName}_${rank}.png`;
}

export function getCardBackTexturePath(): string {
  return '/assets/ddz/cards/Card_Back_Default.png';
}

export const SUIT_CONFIG: Record<
  Exclude<Suit, null>,
  { symbol: string; color: number }
> = {
  spade: { symbol: 'S', color: 0x18181b },
  heart: { symbol: 'H', color: 0xdc2626 },
  club: { symbol: 'C', color: 0x18181b },
  diamond: { symbol: 'D', color: 0xdc2626 },
};

/**
 * Commercial 4.0 Vector Playing Card Engine (aligned with open-source Vector-Playing-Cards / svg-cards geometry).
 * Provides crisp Bezier suit pips (Spade, Heart, Club, Diamond), J/Q/K royal court illustrations, Dragon Joker totems,
 * and dual-theme ornate card backs (Crimson Cloud Brocade & Imperial Gold Dragon Scale).
 */
export class CardAtlasGenerator {
  /**
   * Draw precision vector suit pip centered at (cx, cy) with radius `size`.
   */
  static drawSuitPip(
    g: Graphics,
    suit: Exclude<Suit, null>,
    cx: number,
    cy: number,
    size: number
  ): void {
    const color = SUIT_CONFIG[suit].color;

    if (suit === 'diamond') {
      // Slightly concave curve diamond pip
      g.moveTo(cx, cy - size * 1.08)
        .quadraticCurveTo(cx + size * 0.22, cy - size * 0.22, cx + size * 0.88, cy)
        .quadraticCurveTo(cx + size * 0.22, cy + size * 0.22, cx, cy + size * 1.08)
        .quadraticCurveTo(cx - size * 0.22, cy + size * 0.22, cx - size * 0.88, cy)
        .quadraticCurveTo(cx - size * 0.22, cy - size * 0.22, cx, cy - size * 1.08)
        .fill({ color });
      return;
    }

    if (suit === 'heart') {
      const topY = cy - size * 0.35;
      const botY = cy + size * 1.02;
      g.moveTo(cx, topY)
        .bezierCurveTo(
          cx - size * 0.15,
          cy - size * 1.05,
          cx - size * 1.08,
          cy - size * 0.9,
          cx - size * 0.95,
          cy - size * 0.15
        )
        .bezierCurveTo(cx - size * 0.85, cy + size * 0.35, cx - size * 0.25, cy + size * 0.65, cx, botY)
        .bezierCurveTo(
          cx + size * 0.25,
          cy + size * 0.65,
          cx + size * 0.85,
          cy + size * 0.35,
          cx + size * 0.95,
          cy - size * 0.15
        )
        .bezierCurveTo(
          cx + size * 1.08,
          cy - size * 0.9,
          cx + size * 0.15,
          cy - size * 1.05,
          cx,
          topY
        )
        .fill({ color });
      return;
    }

    if (suit === 'spade') {
      const tipY = cy - size * 1.06;
      const baseTopY = cy + size * 0.36;
      g.moveTo(cx, tipY)
        .bezierCurveTo(
          cx - size * 0.25,
          cy - size * 0.55,
          cx - size * 0.98,
          cy - size * 0.15,
          cx - size * 0.92,
          cy + size * 0.35
        )
        .bezierCurveTo(
          cx - size * 0.86,
          cy + size * 0.78,
          cx - size * 0.22,
          cy + size * 0.72,
          cx,
          baseTopY
        )
        .bezierCurveTo(
          cx + size * 0.22,
          cy + size * 0.72,
          cx + size * 0.86,
          cy + size * 0.78,
          cx + size * 0.92,
          cy + size * 0.35
        )
        .bezierCurveTo(
          cx + size * 0.98,
          cy - size * 0.15,
          cx + size * 0.25,
          cy - size * 0.55,
          cx,
          tipY
        )
        .fill({ color });

      // Spade stem
      g.moveTo(cx - size * 0.12, cy + size * 0.25)
        .quadraticCurveTo(cx - size * 0.16, cy + size * 0.85, cx - size * 0.42, cy + size * 1.05)
        .lineTo(cx + size * 0.42, cy + size * 1.05)
        .quadraticCurveTo(cx + size * 0.16, cy + size * 0.85, cx + size * 0.12, cy + size * 0.25)
        .closePath()
        .fill({ color });
      return;
    }

    // Club — 3 trefoil leaves + stem
    const leafR = size * 0.44;
    g.circle(cx, cy - size * 0.48, leafR).fill({ color });
    g.circle(cx - size * 0.46, cy + size * 0.12, leafR).fill({ color });
    g.circle(cx + size * 0.46, cy + size * 0.12, leafR).fill({ color });
    g.circle(cx, cy - size * 0.05, size * 0.25).fill({ color });

    g.moveTo(cx - size * 0.12, cy + size * 0.12)
      .quadraticCurveTo(cx - size * 0.16, cy + size * 0.85, cx - size * 0.42, cy + size * 1.05)
      .lineTo(cx + size * 0.42, cy + size * 1.05)
      .quadraticCurveTo(cx + size * 0.16, cy + size * 0.85, cx + size * 0.12, cy + size * 0.12)
      .closePath()
      .fill({ color });
  }

  /**
   * Draw bespoke Royal Court illustration for J (Knight Halberd), Q (Imperial Rose), K (Sovereign Sword & Crown).
   */
  static drawRoyalCourtIllustration(
    g: Graphics,
    rank: Rank,
    suit: Exclude<Suit, null>,
    w: number,
    h: number
  ): void {
    const cx = w / 2 + 4;
    const cy = h / 2 + 8;
    const primaryColor = SUIT_CONFIG[suit].color;

    // Inner gilded court portrait frame
    g.roundRect(22, 34, w - 34, h - 54, 6)
      .fill({ color: 0xfef9eb, alpha: 0.92 })
      .stroke({ width: 1.5, color: 0xd97706, alpha: 0.65 });

    g.roundRect(25, 37, w - 40, h - 60, 4).stroke({
      width: 0.8,
      color: primaryColor,
      alpha: 0.28,
    });

    // Corner filigree dots inside court frame
    g.circle(28, 40, 1.5).fill({ color: 0xd97706 });
    g.circle(w - 16, 40, 1.5).fill({ color: 0xd97706 });
    g.circle(28, h - 24, 1.5).fill({ color: 0xd97706 });
    g.circle(w - 16, h - 24, 1.5).fill({ color: 0xd97706 });

    // Background watermark suit
    this.drawSuitPip(g, suit, cx, cy + 4, 17);

    // Royal Crown above the court emblem
    if (rank === 'K') {
      // 5-peak Sovereign Imperial Crown
      g.moveTo(cx - 16, cy - 12)
        .lineTo(cx - 18, cy - 26)
        .lineTo(cx - 9, cy - 18)
        .lineTo(cx, cy - 29)
        .lineTo(cx + 9, cy - 18)
        .lineTo(cx + 18, cy - 26)
        .lineTo(cx + 16, cy - 12)
        .closePath()
        .fill({ color: 0xf59e0b })
        .stroke({ width: 1.4, color: 0x92400e });
      g.circle(cx, cy - 29, 2.2).fill({ color: primaryColor });
      // Crossed Royal Scepter / Broadsword
      g.moveTo(cx, cy - 10)
        .lineTo(cx, cy + 22)
        .stroke({ width: 2.5, color: 0xb45309 });
      g.moveTo(cx - 9, cy - 4)
        .lineTo(cx + 9, cy - 4)
        .stroke({ width: 2.5, color: 0xf59e0b });
    } else if (rank === 'Q') {
      // Graceful Queen Tiara & Rose Halo
      g.moveTo(cx - 14, cy - 13)
        .quadraticCurveTo(cx - 12, cy - 25, cx - 6, cy - 18)
        .quadraticCurveTo(cx, cy - 28, cx + 6, cy - 18)
        .quadraticCurveTo(cx + 12, cy - 25, cx + 14, cy - 13)
        .closePath()
        .fill({ color: 0xfbbf24 })
        .stroke({ width: 1.3, color: 0xb45309 });
      g.circle(cx, cy - 24, 2.4).fill({ color: 0xe11d48 });
      g.circle(cx, cy + 4, 9).stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.85 });
    } else {
      // Jack Halberd & Cavalier Crest
      g.moveTo(cx - 12, cy - 14)
        .lineTo(cx - 10, cy - 23)
        .lineTo(cx, cy - 18)
        .lineTo(cx + 10, cy - 23)
        .lineTo(cx + 12, cy - 14)
        .closePath()
        .fill({ color: 0xd97706 })
        .stroke({ width: 1.2, color: 0x78350f });
      // Diagonal Halberd Spear
      g.moveTo(cx - 12, cy + 18)
        .lineTo(cx + 12, cy - 12)
        .stroke({ width: 2, color: 0xb45309 });
    }
  }

  /**
   * Draw Imperial Dragon & Taiji Totem for Small/Big Joker.
   */
  static drawJokerTotem(
    g: Graphics,
    isBigJoker: boolean,
    w: number,
    h: number
  ): void {
    const cx = w / 2 + 7;
    const cy = h / 2 + 4;
    const primary = isBigJoker ? 0xdc2626 : 0x1e293b;
    const gold = isBigJoker ? 0xf59e0b : 0x64748b;

    // Outer sunburst halo
    g.circle(cx, cy, 27)
      .fill({ color: primary, alpha: 0.08 })
      .stroke({ width: 1.8, color: gold, alpha: 0.75 });

    // 8-point star rays
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const r1 = 18;
      const r2 = 26;
      g.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1)
        .lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2)
        .stroke({ width: 1.5, color: gold, alpha: 0.65 });
    }

    // Inner medallion
    g.circle(cx, cy, 18)
      .fill({ color: primary, alpha: 0.16 })
      .stroke({ width: 2, color: primary, alpha: 0.85 });

    // Jester / Dragon Crown inside medallion
    g.moveTo(cx - 11, cy + 5)
      .lineTo(cx - 13, cy - 8)
      .lineTo(cx - 5, cy - 1)
      .lineTo(cx, cy - 11)
      .lineTo(cx + 5, cy - 1)
      .lineTo(cx + 13, cy - 8)
      .lineTo(cx + 11, cy + 5)
      .closePath()
      .fill({ color: primary })
      .stroke({ width: 1.2, color: 0xfef08a });

    g.circle(cx - 13, cy - 9, 2.2).fill({ color: gold });
    g.circle(cx, cy - 12, 2.6).fill({ color: gold });
    g.circle(cx + 13, cy - 9, 2.2).fill({ color: gold });
    g.circle(cx, cy + 1, 2.5).fill({ color: 0xfef08a });
  }

  /**
   * Draw dual-theme ornate card back:
   * - 'crimson': Classic Chinese Cinnabar & Gold Lattice Back
   * - 'imperial_gold': Landlord Exclusive Royal Purple-Gold Dragon Scale Back
   */
  static drawCardBack(
    g: Graphics,
    w = CARD_WIDTH,
    h = CARD_HEIGHT,
    theme: 'crimson' | 'imperial_gold' = 'crimson'
  ): void {
    const isGold = theme === 'imperial_gold';
    const outerFill = isGold ? 0xfffbeb : 0xfaf7f0;
    const mainFill = isGold ? 0x78350f : 0x881337;
    const innerFill = isGold ? 0x92400e : 0x9f1239;
    const goldStroke = isGold ? 0xfbbf24 : 0xf59e0b;

    // 3D drop shadow
    g.roundRect(2, 4, w, h, CARD_RADIUS).fill({ color: 0x000000, alpha: 0.36 });

    // Ivory border
    g.roundRect(0, 0, w, h, CARD_RADIUS)
      .fill({ color: outerFill })
      .stroke({ width: 1.5, color: 0xd6d3d1 });

    // Main brocade field
    g.roundRect(5, 5, w - 10, h - 10, CARD_RADIUS - 3)
      .fill({ color: mainFill })
      .stroke({ width: 1.5, color: goldStroke });

    // Inner framed lattice
    g.roundRect(9, 9, w - 18, h - 18, CARD_RADIUS - 5)
      .fill({ color: innerFill })
      .stroke({ width: 1, color: 0xfde68a, alpha: 0.7 });

    // Corner auspicious cloud knots
    const corners = [
      [14, 14],
      [w - 14, 14],
      [14, h - 14],
      [w - 14, h - 14],
    ];
    for (const [cx, cy] of corners) {
      g.circle(cx, cy, 2.5).fill({ color: 0xfde68a, alpha: 0.85 });
    }

    // Center Dragon / Medallion Rosette
    const midX = w / 2;
    const midY = h / 2;
    g.circle(midX, midY, 20)
      .fill({ color: goldStroke, alpha: 0.2 })
      .stroke({ width: 1.5, color: 0xfde68a, alpha: 0.85 });

    g.moveTo(midX, midY - 14)
      .lineTo(midX + 11, midY)
      .lineTo(midX, midY + 14)
      .lineTo(midX - 11, midY)
      .closePath()
      .fill({ color: 0xfde68a, alpha: 0.85 });

    g.circle(midX, midY, 4.5).fill({ color: mainFill });
    g.circle(midX, midY, 2).fill({ color: 0xfef08a });
  }

  /**
   * Build a mini card face for table hole cards or compact displays.
   */
  static createMiniCardFace(
    data: CardData,
    w = 48,
    h = 66
  ): Graphics {
    const g = new Graphics();
    g.roundRect(1, 2, w, h, 6).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(0, 0, w, h, 6)
      .fill({ color: 0xfffdf9 })
      .stroke({ width: 1.5, color: 0xd6d3d1 });

    g.roundRect(2.5, 2.5, w - 5, h - 5, 4).stroke({
      width: 1,
      color: 0xf59e0b,
      alpha: 0.3,
    });

    const isJoker = data.rank === 'small_joker' || data.rank === 'big_joker';
    const isRed =
      data.rank === 'big_joker' || data.suit === 'heart' || data.suit === 'diamond';
    const textColor = isRed ? '#DC2626' : '#18181B';

    const rankStr = isJoker
      ? data.rank === 'big_joker'
        ? '大王'
        : '小王'
      : data.rank;

    const rankText = new Text({
      text: rankStr,
      style: {
        fontFamily: 'Outfit, Plus Jakarta Sans, sans-serif',
        fontSize: isJoker ? 11 : 15,
        fontWeight: '800',
        fill: textColor,
      },
    });
    rankText.x = 5;
    rankText.y = 4;
    g.addChild(rankText);

    if (!isJoker && data.suit) {
      this.drawSuitPip(g, data.suit, w / 2 + 3, h / 2 + 8, 9);
    } else {
      g.circle(w / 2, h / 2 + 8, 8)
        .fill({ color: isRed ? 0xdc2626 : 0x334155, alpha: 0.2 })
        .stroke({ width: 1.5, color: isRed ? 0xdc2626 : 0x334155 });
    }

    return g;
  }
}
