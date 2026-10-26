import { Container, FederatedPointerEvent, Graphics, Point, Text } from 'pixi.js';
import gsap from 'gsap';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { CARD_HEIGHT, CARD_WIDTH } from '../assets/CardAtlasGenerator';
import { Card } from '../components/Card';
import { spriteAnimationEngine } from '../scenes/SpriteAnimationEngine';
import { CardData, HandSortMode, Rank } from '../types';

export interface ExtractedComboResult {
  ids: Set<string>;
  patternType: 'STRAIGHT' | 'CONSECUTIVE_PAIRS' | 'AIRPLANE';
  shortTag: string;
  bannerText: string;
}

/**
 * HandManager 5.0 — Commercial Mobile Touch-Slide Marquee, Multi-Mode Smart Sorting & Laizi Pattern Extractor.
 * - Supports Dual Hand Sort Modes:
 *   1. `'rank'`: Standard descending rank order (with Laizi wild cards highlighted).
 *   2. `'count'`: Frequency-grouped sorting (Rocket / 4-card Bombs -> Triples -> Pairs -> Singles) with smooth GSAP transitions.
 * - Multi-level mobile haptic feedback (`hapticEngine`) on tap, marquee slide, combo lock, and sort shuffle.
 * - Automatic extraction of Straights (顺子), Consecutive Pairs (连对), and Airplanes (飞机), including Laizi wild gap completion.
 */
export class HandManager {
  cards: Card[] = [];
  private container: Container;
  private cardsLayer: Container = new Container();
  private overlayLayer: Container = new Container();

  private selectionMarquee: Graphics = new Graphics();
  private comboStatusBadge: Container = new Container();
  private comboStatusBg: Graphics = new Graphics();
  private comboStatusText!: Text;

  private isDragging = false;
  private dragStartIndex = -1;
  private dragCurrentIndex = -1;
  private dragStartPoint: Point | null = null;
  private dragCurrentPoint: Point | null = null;
  private onSelectionChange?: (selected: CardData[]) => void;

  private sortMode: HandSortMode = 'rank';
  private wildRanks: Rank[] = [];

  private centerX = 667;
  private baseY = 588;
  private availableWidth = 920;
  private cardScale = 1.08;
  private handBandTop = 478;
  private handBandBottom = 678;

  constructor(container: Container, onSelectionChange?: (selected: CardData[]) => void) {
    this.container = container;
    this.onSelectionChange = onSelectionChange;

    this.container.addChild(this.cardsLayer);
    this.container.addChild(this.overlayLayer);

    this.selectionMarquee.visible = false;
    this.overlayLayer.addChild(this.selectionMarquee);

    this.buildComboStatusBadge();
    this.overlayLayer.addChild(this.comboStatusBadge);
  }

  public getSortMode(): HandSortMode {
    return this.sortMode;
  }

  public setWildRanks(wildRanks: Rank[]): void {
    this.wildRanks = [...wildRanks];
    const wildSet = new Set<Rank>(wildRanks);
    for (const card of this.cards) {
      if (!card.destroyed) {
        card.setWildBadgeVisible(Boolean(card.cardData.isWild || wildSet.has(card.cardData.rank)));
      }
    }
  }

  /**
   * Toggle between `'rank'` (按大小排序) and `'count'` (按张数/炸弹聚合排序) with smooth GSAP animation and haptic pulse.
   */
  public toggleSortMode(): HandSortMode {
    this.sortMode = this.sortMode === 'rank' ? 'count' : 'rank';
    hapticEngine.sortShuffle();
    soundEngine.playGlissando();
    this.layoutCards(0.24, false);
    this.showComboStatusBanner(
      this.sortMode === 'count'
        ? '理牌：按牌型张数聚合'
        : '理牌：按牌点大小排序',
      false
    );
    return this.sortMode;
  }

  public configureResponsiveZone(opts: {
    centerX: number;
    baseY: number;
    availableWidth: number;
    cardScale: number;
    comboBannerY: number;
    handBandTop: number;
    handBandBottom: number;
  }): void {
    this.centerX = opts.centerX;
    this.baseY = opts.baseY;
    this.availableWidth = opts.availableWidth;
    this.cardScale = opts.cardScale;
    this.handBandTop = opts.handBandTop;
    this.handBandBottom = opts.handBandBottom;
    if (this.comboStatusBadge && !this.comboStatusBadge.destroyed) {
      this.comboStatusBadge.position.set(opts.centerX, opts.comboBannerY);
    }
    if (this.cards.length > 0 && performance.now() >= this.dealAnimatingUntil) {
      this.layoutCards(0.12, false);
    }
  }

  private dealAnimatingUntil: number = 0;

  private buildComboStatusBadge(): void {
    this.comboStatusBadge.position.set(this.centerX, 474);
    this.comboStatusBadge.visible = false;

    this.comboStatusBg.roundRect(-130, -16, 260, 32, 16);
    this.comboStatusBg.fill({ color: 0x062016, alpha: 0.92 });
    this.comboStatusBg.stroke({ color: 0xf59e0b, width: 1.8 });

    this.comboStatusText = new Text({
      text: '智能提牌：顺子',
      style: {
        fontFamily: 'Outfit, PingFang SC, Microsoft YaHei, sans-serif',
        fontSize: 13,
        fontWeight: 'bold',
        fill: 0xfef08a,
      },
    });
    this.comboStatusText.anchor.set(0.5);

    this.comboStatusBadge.addChild(this.comboStatusBg, this.comboStatusText);
  }

  private comboHideTimer: number | null = null;

  private showComboStatusBanner(text: string, isPreview = false): void {
    if (this.container.destroyed || this.comboStatusBadge.destroyed) return;
    if (this.comboHideTimer !== null) {
      window.clearTimeout(this.comboHideTimer);
      this.comboHideTimer = null;
    }

    this.comboStatusText.text = text;
    const width = Math.max(196, this.comboStatusText.width + 32);
    this.comboStatusBg.clear();
    this.comboStatusBg.roundRect(-width / 2, -14, width, 28, 14);
    this.comboStatusBg.fill({
      color: isPreview ? 0x0f172a : 0x05281c,
      alpha: 0.92,
    });
    this.comboStatusBg.stroke({
      color: isPreview ? 0x38bdf8 : 0xf59e0b,
      width: 1.5,
    });

    if (!this.comboStatusBadge.visible) {
      this.comboStatusBadge.visible = true;
      this.comboStatusBadge.scale.set(0.88);
      gsap.killTweensOf(this.comboStatusBadge.scale);
      gsap.to(this.comboStatusBadge.scale, {
        x: 1,
        y: 1,
        duration: 0.16,
        ease: 'back.out(1.6)',
      });
    }

    if (!isPreview) {
      this.comboHideTimer = window.setTimeout(() => {
        this.comboHideTimer = null;
        this.hideComboStatusBanner();
      }, 1500);
    }
  }

  private hideComboStatusBanner(): void {
    if (this.comboHideTimer !== null) {
      window.clearTimeout(this.comboHideTimer);
      this.comboHideTimer = null;
    }
    if (this.comboStatusBadge && !this.comboStatusBadge.destroyed) {
      gsap.killTweensOf(this.comboStatusBadge.scale);
      this.comboStatusBadge.visible = false;
    }
  }

  setHand(
    cardDataList: CardData[],
    isLandlord = false,
    animateDeal = false
  ): void {
    if (this.container.destroyed) return;

    const wildSet = new Set<Rank>(this.wildRanks);
    const enrichedList = cardDataList.map((d) => ({
      ...d,
      isWild: Boolean(d.isWild || wildSet.has(d.rank)),
    }));

    const currentIds = this.cards
      .map((c) => c.cardData.id)
      .sort()
      .join(',');
    const nextIds = enrichedList
      .map((c) => c.id)
      .sort()
      .join(',');

    if (currentIds === nextIds && this.cards.length > 0 && !animateDeal) {
      for (const card of this.cards) {
        card.setLandlordBadgeVisible(isLandlord);
        card.setWildBadgeVisible(
          Boolean(card.cardData.isWild || wildSet.has(card.cardData.rank))
        );
      }
      // Do not interrupt an in-flight staggered dealing animation with a snapshot re-layout
      if (performance.now() >= this.dealAnimatingUntil) {
        this.layoutCards(0.18, false);
      }
      return;
    }

    this.clearHand();

    enrichedList.forEach((data, index) => {
      const card = new Card(data, true, isLandlord);
      this.bindCardEvents(card, index);

      if (animateDeal) {
        card.position.set(this.centerX, 220);
        card.scale.set(0.32);
        card.rotation = (index - enrichedList.length / 2) * 0.04;
      } else {
        card.position.set(this.centerX, this.baseY);
        card.scale.set(this.cardScale);
        card.rotation = 0;
      }

      this.cards.push(card);
      this.cardsLayer.addChild(card);
    });

    this.layoutCards(animateDeal ? 0.34 : 0.18, animateDeal);
  }

  private bindCardEvents(card: Card, index: number): void {
    card.removeAllListeners();
    card.on('pointerdown', (e: FederatedPointerEvent) => this.onCardPointerDown(index, e));
    card.on('pointerover', (e: FederatedPointerEvent) => this.onCardPointerOver(index, e));
    card.on('pointerup', () => this.finishDragSelection());
    card.on('pointerupoutside', () => this.finishDragSelection());
  }

  sortCards(): void {
    if (this.container.destroyed || this.cardsLayer.destroyed) return;
    this.cards = this.cards.filter((c) => !c.destroyed);

    if (this.sortMode === 'count') {
      const freqMap = new Map<number, number>();
      let hasSmallJoker = false;
      let hasBigJoker = false;
      for (const c of this.cards) {
        const v = c.cardData.value;
        freqMap.set(v, (freqMap.get(v) ?? 0) + 1);
        if (v === 16) hasSmallJoker = true;
        if (v === 17) hasBigJoker = true;
      }
      const hasRocket = hasSmallJoker && hasBigJoker;

      const getBucketPriority = (c: Card): number => {
        const v = c.cardData.value;
        if (hasRocket && (v === 16 || v === 17)) return 5; // Rocket first
        if (c.cardData.isWild) return 4.5; // Wild cards right after Rocket/Bombs
        return freqMap.get(v) ?? 1;
      };

      this.cards.sort((a, b) => {
        const pa = getBucketPriority(a);
        const pb = getBucketPriority(b);
        if (pb !== pa) return pb - pa;
        if (b.cardData.value !== a.cardData.value) {
          return b.cardData.value - a.cardData.value;
        }
        return b.cardData.id.localeCompare(a.cardData.id);
      });
    } else {
      // Standard 'rank' mode: Wild cards (赖子) pinned at left after Jokers or sorted by rank descending
      this.cards.sort((a, b) => {
        const aWild = Boolean(a.cardData.isWild);
        const bWild = Boolean(b.cardData.isWild);
        if (aWild !== bWild) {
          return aWild ? -1 : 1;
        }
        if (b.cardData.value !== a.cardData.value) {
          return b.cardData.value - a.cardData.value;
        }
        return b.cardData.id.localeCompare(a.cardData.id);
      });
    }

    this.cards.forEach((c, idx) => {
      if (c.parent === this.cardsLayer) {
        this.cardsLayer.setChildIndex(c, idx);
      }
      this.bindCardEvents(c, idx);
    });
  }

  layoutCards(duration = 0.18, staggerDeal = false): void {
    if (this.container.destroyed) return;
    this.sortCards();
    const count = this.cards.length;
    if (count === 0) {
      this.hideComboStatusBanner();
      return;
    }

    const availableWidth = this.availableWidth;
    const centerX = this.centerX;
    const baseY = this.baseY;
    const cardScale = this.cardScale;
    const effectiveCardWidth = CARD_WIDTH * cardScale;

    const rawStep = count > 1 ? (availableWidth - effectiveCardWidth) / (count - 1) : 0;
    const step = Math.min(50 * cardScale, Math.max(26 * cardScale, rawStep));
    const startX = centerX - (step * (count - 1)) / 2;

    const staggerStepSec = 0.032;
    const totalDealMs = Math.round(((count - 1) * staggerStepSec + duration) * 1000);
    if (staggerDeal) {
      this.dealAnimatingUntil = performance.now() + totalDealMs + 80;
    }

    this.cards.forEach((card, i) => {
      const targetX = startX + i * step;
      if (staggerDeal) {
        const delaySec = i * staggerStepSec;
        gsap.killTweensOf(card);
        gsap.killTweensOf(card.scale);
        gsap.to(card, {
          x: targetX,
          y: baseY + (card.selected ? -26 : 0),
          rotation: 0,
          delay: delaySec,
          duration,
          ease: 'back.out(1.25)',
          onStart: () => {
            if (i === 0) {
              void soundEngine.startDealCascade(totalDealMs);
              spriteAnimationEngine.emitEffect('deal_cards', {
                x: 0.5,
                y: 0.34,
                seat: 'center',
                durationMs: totalDealMs,
                label: '发牌',
              });
            }
            if (i % 2 === 0) {
              soundEngine.playCardFly(i);
            }
          },
        });
        gsap.to(card.scale, {
          x: cardScale,
          y: cardScale,
          delay: delaySec,
          duration,
          ease: 'power2.out',
        });
      } else {
        card.rotation = 0;
        card.moveTo(targetX, baseY, duration, cardScale);
      }
    });
  }

  toggleSelect(card: Card): void {
    if (card.destroyed) return;
    card.setSelected(!card.selected, false);
    hapticEngine.tap();
    soundEngine.playCardSelect();
    this.refreshSelectedComboVisuals();
    this.notifySelectionChange();
  }

  getSelectedCards(): Card[] {
    return this.cards.filter((c) => !c.destroyed && c.selected);
  }

  getSelectedCardData(): CardData[] {
    return this.getSelectedCards().map((c) => c.cardData);
  }

  selectByIds(ids: string[]): void {
    const idSet = new Set(ids);
    for (const card of this.cards) {
      if (!card.destroyed) {
        card.setSelected(idSet.has(card.cardData.id), false);
      }
    }
    hapticEngine.tap();
    soundEngine.playCardSelect();
    this.refreshSelectedComboVisuals();
    this.notifySelectionChange();
  }

  clearSelection(): void {
    let changed = false;
    for (const card of this.cards) {
      if (!card.destroyed && (card.selected || card.comboHighlighted)) {
        card.setSelected(false, false);
        changed = true;
      }
    }
    this.hideComboStatusBanner();
    if (changed) {
      hapticEngine.tap();
      soundEngine.playTap(520);
      this.notifySelectionChange();
    }
  }

  removeCardsByIds(ids: string[]): void {
    if (this.container.destroyed) return;
    const idSet = new Set(ids);
    const remaining: Card[] = [];

    for (const card of this.cards) {
      if (idSet.has(card.cardData.id)) {
        if (card.parent === this.cardsLayer) {
          this.cardsLayer.removeChild(card);
        }
        card.destroy({ children: true });
      } else if (!card.destroyed) {
        remaining.push(card);
      }
    }

    this.cards = remaining;
    this.hideComboStatusBanner();
    this.layoutCards(0.2);
    this.notifySelectionChange();
  }

  clearHand(): void {
    for (const card of this.cards) {
      if (!card.destroyed) {
        if (card.parent === this.cardsLayer && !this.cardsLayer.destroyed) {
          this.cardsLayer.removeChild(card);
        }
        card.destroy({ children: true });
      }
    }
    this.cards = [];
    this.selectionMarquee.clear();
    this.selectionMarquee.visible = false;
    this.hideComboStatusBanner();
  }

  public handleScenePointerDown(localPoint: Point): boolean {
    if (this.cards.length === 0) return false;
    if (localPoint.y < this.handBandTop || localPoint.y > this.handBandBottom) {
      return false;
    }

    const hitIndex = this.findCardIndexAtX(localPoint.x, false);
    this.isDragging = true;
    this.dragStartPoint = new Point(localPoint.x, localPoint.y);
    this.dragCurrentPoint = new Point(localPoint.x, localPoint.y);
    this.dragStartIndex = hitIndex;
    this.dragCurrentIndex = hitIndex;
    this.updateDragHighlights();
    return true;
  }

  public handleScenePointerMove(localPoint: Point): void {
    if (!this.isDragging || this.cards.length === 0) return;
    this.dragCurrentPoint = new Point(localPoint.x, localPoint.y);

    const clampedIdx = this.findCardIndexAtX(localPoint.x, true);
    if (clampedIdx !== -1) {
      if (this.dragStartIndex === -1) {
        this.dragStartIndex = clampedIdx;
      }
      if (clampedIdx !== this.dragCurrentIndex) {
        this.dragCurrentIndex = clampedIdx;
        hapticEngine.slideTick();
        soundEngine.playCardSelect();
      }
    }
    this.updateDragHighlights();
  }

  public handleScenePointerUp(): void {
    if (this.isDragging) {
      this.finishDragSelection();
    }
  }

  private onCardPointerDown(index: number, e: FederatedPointerEvent): void {
    e.stopPropagation();
    const localPos = this.container.toLocal(e.global);
    this.isDragging = true;
    this.dragStartIndex = index;
    this.dragCurrentIndex = index;
    this.dragStartPoint = new Point(localPos.x, localPos.y);
    this.dragCurrentPoint = new Point(localPos.x, localPos.y);
    this.updateDragHighlights();
  }

  private onCardPointerOver(index: number, e: FederatedPointerEvent): void {
    if (!this.isDragging) return;
    if (index !== this.dragCurrentIndex) {
      this.dragCurrentIndex = index;
      hapticEngine.slideTick();
      soundEngine.playCardSelect();
    }
    this.dragCurrentPoint = this.container.toLocal(e.global);
    this.updateDragHighlights();
  }

  private findCardIndexAtX(x: number, clampToEdges: boolean): number {
    const n = this.cards.length;
    if (n === 0) return -1;

    const halfW = (CARD_WIDTH * this.cardScale) / 2;
    const firstLeft = this.cards[0].x - halfW;
    const lastRight = this.cards[n - 1].x + halfW;

    if (x < firstLeft) {
      return clampToEdges ? 0 : -1;
    }
    if (x > lastRight) {
      return clampToEdges ? n - 1 : -1;
    }

    for (let i = n - 1; i >= 0; i--) {
      const c = this.cards[i];
      const leftEdge = c.x - halfW;
      const rightEdge = c.x + halfW;
      if (x >= leftEdge && x <= rightEdge) {
        return i;
      }
    }
    return clampToEdges ? 0 : -1;
  }

  private getCoveredIndices(): { minIdx: number; maxIdx: number } | null {
    if (this.cards.length === 0) return null;

    if (this.dragStartIndex !== -1 && this.dragCurrentIndex !== -1) {
      return {
        minIdx: Math.min(this.dragStartIndex, this.dragCurrentIndex),
        maxIdx: Math.max(this.dragStartIndex, this.dragCurrentIndex),
      };
    }

    if (this.dragStartPoint && this.dragCurrentPoint) {
      const minX = Math.min(this.dragStartPoint.x, this.dragCurrentPoint.x);
      const maxX = Math.max(this.dragStartPoint.x, this.dragCurrentPoint.x);
      const halfW = (CARD_WIDTH * this.cardScale) / 2;
      let first = -1;
      let last = -1;
      for (let i = 0; i < this.cards.length; i++) {
        const c = this.cards[i];
        const cLeft = c.x - halfW;
        const cRight =
          i < this.cards.length - 1
            ? this.cards[i + 1].x - halfW
            : c.x + halfW;
        if (maxX >= cLeft && minX <= cRight) {
          if (first === -1) first = i;
          last = i;
        }
      }
      if (first !== -1 && last !== -1) {
        return { minIdx: first, maxIdx: last };
      }
    }

    return null;
  }

  private updateDragHighlights(): void {
    const range = this.getCoveredIndices();
    this.drawSelectionMarquee(range);

    if (!range) {
      for (const card of this.cards) {
        if (!card.destroyed) card.setDragHighlight('none');
      }
      return;
    }

    const { minIdx, maxIdx } = range;
    const slicedCards = this.cards.slice(minIdx, maxIdx + 1).filter((c) => !c.destroyed);

    const smartCombo = slicedCards.length >= 3 ? this.extractSmartCombo(slicedCards) : null;
    let isCleanSmartCombo = false;
    if (smartCombo) {
      const comboValues = new Set(
        Array.from(smartCombo.ids)
          .map((id) => this.cards.find((c) => c.cardData.id === id)?.cardData.value)
          .filter((v): v is number => v !== undefined)
      );
      isCleanSmartCombo =
        smartCombo.ids.size === slicedCards.length ||
        slicedCards.every((c) => comboValues.has(c.cardData.value));
    }

    if (smartCombo && isCleanSmartCombo) {
      this.cards.forEach((card, i) => {
        if (card.destroyed) return;
        const inRange = i >= minIdx && i <= maxIdx;
        if (smartCombo.ids.has(card.cardData.id)) {
          card.setDragHighlight('combo_pick');
        } else if (inRange) {
          card.setDragHighlight('combo_skip');
        } else {
          card.setDragHighlight('none');
        }
      });
      this.showComboStatusBanner(`智能识别：${smartCombo.bannerText}（松手自动提牌）`, true);
    } else {
      this.cards.forEach((card, i) => {
        if (card.destroyed) return;
        card.setDragHighlight(i >= minIdx && i <= maxIdx ? 'covered' : 'none');
      });
      if (slicedCards.length >= 2) {
        this.showComboStatusBanner(`滑动框选 ${slicedCards.length} 张牌`, true);
      }
    }
  }

  private drawSelectionMarquee(range: { minIdx: number; maxIdx: number } | null): void {
    this.selectionMarquee.clear();
    if (!this.isDragging || !this.dragStartPoint || !this.dragCurrentPoint) {
      this.selectionMarquee.visible = false;
      return;
    }

    const dx = Math.abs(this.dragCurrentPoint.x - this.dragStartPoint.x);
    if (dx < 14 && (!range || range.minIdx === range.maxIdx)) {
      this.selectionMarquee.visible = false;
      return;
    }

    const minX = Math.min(this.dragStartPoint.x, this.dragCurrentPoint.x);
    const maxX = Math.max(this.dragStartPoint.x, this.dragCurrentPoint.x);
    const topY = this.baseY - 40;
    const height = CARD_HEIGHT * 0.96;

    this.selectionMarquee.visible = true;
    this.selectionMarquee.roundRect(minX, topY, Math.max(18, maxX - minX), height, 12);
    this.selectionMarquee.fill({ color: 0xf59e0b, alpha: 0.14 });
    this.selectionMarquee.stroke({ color: 0xfef08a, width: 2, alpha: 0.85 });
  }

  /**
   * Core Commercial Smart Pattern Extractor with Priority Queue & Laizi Gap-Bridging:
   * Evaluates strictly within `slicedCards` (never reaching outside the user's dragged range)
   * and applies Priority Queue disambiguation:
   *   1. Airplane (飞机: >= 2 consecutive triples, value <= 14)
   *   2. Consecutive Pairs (连对: >= 3 consecutive pairs, only when all dragged ranks in run have >= 2 cards)
   *   3. Straight (顺子: >= 5 consecutive singles, value <= 14)
   *   4. Laizi Wild-Bridged Straight (赖子顺子)
   */
  public extractSmartCombo(slicedCards: Card[]): ExtractedComboResult | null {
    if (slicedCards.length < 3) return null;

    const sliceValMap = new Map<number, Card[]>();
    for (const c of slicedCards) {
      const v = c.cardData.value;
      if (v > 14) continue;
      const arr = sliceValMap.get(v) ?? [];
      arr.push(c);
      sliceValMap.set(v, arr);
    }

    const distinctAsc = Array.from(sliceValMap.keys()).sort((a, b) => a - b);
    if (distinctAsc.length < 2) return null;

    // Identify 4-of-a-kind Bombs in the full hand so slide-selection protects bombs whenever possible
    const fullHandCounts = new Map<number, number>();
    for (const c of this.cards) {
      if (!c.destroyed) {
        fullHandCounts.set(c.cardData.value, (fullHandCounts.get(c.cardData.value) ?? 0) + 1);
      }
    }
    const nonBombDistinctAsc = distinctAsc.filter((v) => (fullHandCounts.get(v) ?? 0) < 4);

    // Priority 1: Airplane (飞机: >= 2 consecutive triples, value <= 14)
    const nonBombTripleVals = nonBombDistinctAsc.filter(
      (v) => (sliceValMap.get(v)?.length ?? 0) >= 3
    );
    const allTripleVals = distinctAsc.filter(
      (v) => (sliceValMap.get(v)?.length ?? 0) >= 3
    );
    const cleanTripleRun = this.findLongestContiguousRun(nonBombTripleVals);
    const longestTripleRun =
      cleanTripleRun.length >= 2
        ? cleanTripleRun
        : this.findLongestContiguousRun(allTripleVals);

    if (longestTripleRun.length >= 2 && slicedCards.length >= 6) {
      const ids = new Set<string>();
      for (const v of longestTripleRun) {
        const grp = sliceValMap.get(v)!;
        ids.add(grp[0].cardData.id);
        ids.add(grp[1].cardData.id);
        ids.add(grp[2].cardData.id);
      }

      const planeLen = longestTripleRun.length;
      const leftover = slicedCards.filter((c) => !ids.has(c.cardData.id));
      let labelSuffix = `${planeLen * 3}张`;

      if (leftover.length === planeLen) {
        const hasBothJokers =
          leftover.some((c) => c.cardData.value === 16) &&
          leftover.some((c) => c.cardData.value === 17);
        const breaksBomb = leftover.some((c) => (fullHandCounts.get(c.cardData.value) ?? 0) === 4);
        if (!hasBothJokers && !breaksBomb) {
          leftover.forEach((c) => ids.add(c.cardData.id));
          labelSuffix = `带单 · ${ids.size}张`;
        }
      } else if (leftover.length === planeLen * 2) {
        const wingPairs = new Map<number, Card[]>();
        for (const c of leftover) {
          const arr = wingPairs.get(c.cardData.value) ?? [];
          arr.push(c);
          wingPairs.set(c.cardData.value, arr);
        }
        let totalPairs = 0;
        let valid = true;
        for (const [v, g] of wingPairs.entries()) {
          if (v >= 16 || g.length % 2 !== 0 || (fullHandCounts.get(v) ?? 0) === 4) {
            valid = false;
            break;
          }
          totalPairs += g.length / 2;
        }
        if (valid && totalPairs === planeLen) {
          leftover.forEach((c) => ids.add(c.cardData.id));
          labelSuffix = `带对 · ${ids.size}张`;
        }
      }

      const rankDesc = longestTripleRun
        .slice()
        .reverse()
        .map((v) => this.valueToLabel(v))
        .join('-');
      return {
        ids,
        patternType: 'AIRPLANE',
        shortTag: '飞机',
        bannerText: `飞机 (${rankDesc} · ${labelSuffix})`,
      };
    }

    // Priority 2: Consecutive Pairs (连对: >= 3 consecutive pairs, value <= 14, protecting bombs first)
    const nonBombPairVals = nonBombDistinctAsc.filter(
      (v) => (sliceValMap.get(v)?.length ?? 0) >= 2
    );
    const allPairVals = distinctAsc.filter(
      (v) => (sliceValMap.get(v)?.length ?? 0) >= 2
    );
    const cleanPairRun = this.findLongestContiguousRun(nonBombPairVals);
    const longestPairRun =
      cleanPairRun.length >= 3 ? cleanPairRun : this.findLongestContiguousRun(allPairVals);

    const cleanStraightRun = this.findLongestContiguousRun(nonBombDistinctAsc);
    const longestStraightRun =
      cleanStraightRun.length >= 5
        ? cleanStraightRun
        : this.findLongestContiguousRun(distinctAsc);

    // Prefer Consecutive Pairs when all dragged ranks form pairs OR when straight run < 5
    const allDraggedRanksArePairs = longestPairRun.length === distinctAsc.length;
    if (
      longestPairRun.length >= 3 &&
      (longestStraightRun.length < 5 || allDraggedRanksArePairs)
    ) {
      const ids = new Set<string>();
      for (const v of longestPairRun) {
        const grp = sliceValMap.get(v)!;
        ids.add(grp[0].cardData.id);
        ids.add(grp[1].cardData.id);
      }
      const rankDesc = longestPairRun
        .slice()
        .reverse()
        .map((v) => `${this.valueToLabel(v)}${this.valueToLabel(v)}`)
        .join('-');
      return {
        ids,
        patternType: 'CONSECUTIVE_PAIRS',
        shortTag: '连对',
        bannerText: `连对 (${rankDesc} · ${longestPairRun.length}对)`,
      };
    }

    // Priority 3: Straight (顺子: >= 5 consecutive singles, value <= 14, protecting bombs first)
    if (longestStraightRun.length >= 5) {
      const ids = new Set<string>();
      for (const v of longestStraightRun) {
        const grp = sliceValMap.get(v)!;
        ids.add(grp[grp.length - 1].cardData.id);
      }
      const rankDesc = longestStraightRun
        .slice()
        .reverse()
        .map((v) => this.valueToLabel(v))
        .join('-');
      return {
        ids,
        patternType: 'STRAIGHT',
        shortTag: '顺子',
        bannerText: `顺子 (${rankDesc} · ${longestStraightRun.length}张)`,
      };
    }

    // Priority 4: Laizi Wild-Bridged Straight (when user drags across 4+ naturals + 1~2 wild cards)
    const draggedWilds = slicedCards.filter((c) => Boolean(c.cardData.isWild));
    if (draggedWilds.length >= 1 && slicedCards.length >= 5) {
      const nonWildMap = new Map<number, Card[]>();
      for (const c of slicedCards) {
        if (c.cardData.isWild || c.cardData.value > 14) continue;
        const arr = nonWildMap.get(c.cardData.value) ?? [];
        arr.push(c);
        nonWildMap.set(c.cardData.value, arr);
      }
      for (let len = Math.min(12, nonWildMap.size + draggedWilds.length); len >= 5; len--) {
        for (let maxV = 14; maxV >= 3 + len - 1; maxV--) {
          const minV = maxV - len + 1;
          const pickedIds = new Set<string>();
          let missing = 0;
          for (let v = minV; v <= maxV; v++) {
            const grp = nonWildMap.get(v);
            if (grp && grp.length > 0) {
              pickedIds.add(grp[grp.length - 1].cardData.id);
            } else {
              missing++;
            }
          }
          if (missing > 0 && missing <= draggedWilds.length) {
            for (let w = 0; w < missing; w++) {
              pickedIds.add(draggedWilds[w].cardData.id);
            }
            return {
              ids: pickedIds,
              patternType: 'STRAIGHT',
              shortTag: '赖子顺',
              bannerText: `赖子顺子 (${this.valueToLabel(maxV)}~${this.valueToLabel(minV)} · ${len}张)`,
            };
          }
        }
      }
    }

    return null;
  }

  private valueToLabel(val: number): string {
    const map: Record<number, string> = {
      11: 'J',
      12: 'Q',
      13: 'K',
      14: 'A',
      15: '2',
      16: '小王',
      17: '大王',
    };
    return map[val] ?? String(val);
  }

  private findLongestContiguousRun(sortedValues: number[]): number[] {
    if (sortedValues.length === 0) return [];
    let bestRun: number[] = [];
    let currentRun: number[] = [sortedValues[0]];

    for (let i = 1; i < sortedValues.length; i++) {
      if (sortedValues[i] === sortedValues[i - 1] + 1) {
        currentRun.push(sortedValues[i]);
      } else {
        if (currentRun.length > bestRun.length) {
          bestRun = currentRun;
        }
        currentRun = [sortedValues[i]];
      }
    }
    if (currentRun.length > bestRun.length) {
      bestRun = currentRun;
    }
    return bestRun;
  }

  private finishDragSelection(): void {
    if (!this.isDragging) return;
    this.isDragging = false;

    const range = this.getCoveredIndices();
    this.selectionMarquee.clear();
    this.selectionMarquee.visible = false;

    for (const card of this.cards) {
      if (!card.destroyed) {
        card.setDragHighlight('none');
      }
    }

    this.dragStartIndex = -1;
    this.dragCurrentIndex = -1;
    this.dragStartPoint = null;
    this.dragCurrentPoint = null;

    if (!range) return;
    const { minIdx, maxIdx } = range;
    const slicedCards = this.cards.slice(minIdx, maxIdx + 1).filter((c) => !c.destroyed);
    if (slicedCards.length === 0) return;

    const hasOutsideSelection = this.cards.some(
      (c, idx) => !c.destroyed && c.selected && (idx < minIdx || idx > maxIdx)
    );

    if (slicedCards.length >= 5 && !hasOutsideSelection) {
      const smartCombo = this.extractSmartCombo(slicedCards);
      if (smartCombo && smartCombo.ids.size > 0) {
        const comboValues = new Set(
          Array.from(smartCombo.ids)
            .map((id) => this.cards.find((c) => c.cardData.id === id)?.cardData.value)
            .filter((v): v is number => v !== undefined)
        );
        const isCleanSmartCombo =
          smartCombo.ids.size === slicedCards.length ||
          slicedCards.every((c) => comboValues.has(c.cardData.value));

        if (isCleanSmartCombo) {
          for (const card of this.cards) {
            if (card.destroyed) continue;
            const isPicked = smartCombo.ids.has(card.cardData.id);
            card.setSelected(isPicked, isPicked, isPicked ? smartCombo.shortTag : undefined);
          }
          this.showComboStatusBanner(`智能选牌：${smartCombo.bannerText}`, false);
          hapticEngine.smartComboLock();
          soundEngine.playGlissando();
          this.notifySelectionChange();
          return;
        }
      }
    }

    for (const card of slicedCards) {
      card.setSelected(!card.selected, false);
    }

    hapticEngine.tap();
    soundEngine.playCardSelect();
    this.refreshSelectedComboVisuals();
    this.notifySelectionChange();
  }

  private refreshSelectedComboVisuals(): void {
    const selectedCards = this.getSelectedCards();
    if (selectedCards.length >= 5) {
      const combo = this.extractSmartCombo(selectedCards);
      if (combo && combo.ids.size === selectedCards.length) {
        for (const card of selectedCards) {
          card.setComboHighlight(true, combo.shortTag);
        }
        this.showComboStatusBanner(`提牌：${combo.bannerText}`, false);
        return;
      }
    }

    for (const card of this.cards) {
      if (!card.destroyed) {
        card.setComboHighlight(false);
      }
    }
    this.hideComboStatusBanner();
  }

  private notifySelectionChange(): void {
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedCardData());
    }
  }

  /**
   * ============================================================================
   * WHITEPAPER SECTION 2.1 & 2.3 (Client-Side HandManager):
   * 15-Rank Histogram (`Int32Array(15)`) & Heuristic Zero-Loss Wing Completion
   * ============================================================================
   * Automatically attaches or cycles the lowest-penalty single/pair wings for a selected
   * Triple, Airplane, or Quad—or automatically selects a Triple + Zero-Loss Wing if none selected.
   */
  private wingTogglePreference: 1 | 2 = 1;

  public autoCompleteWings(): { ok: boolean; message: string } {
    const activeCards = this.cards.filter((c) => !c.destroyed);
    if (activeCards.length < 4) {
      return { ok: false, message: '当前手牌不足4张，无需补翼' };
    }

    const selected = this.getSelectedCards();
    const byVal = new Map<number, Card[]>();
    for (const c of activeCards) {
      const v = c.cardData.value;
      const list = byVal.get(v) ?? [];
      list.push(c);
      byVal.set(v, list);
    }

    // Identify core Triple / Airplane / Quad from current selection (or auto-pick from hand)
    let coreCards: Card[] = [];
    let wingCount = 1;
    let coreLabel = '三带';

    const selByVal = new Map<number, Card[]>();
    for (const c of selected) {
      const v = c.cardData.value;
      const list = selByVal.get(v) ?? [];
      list.push(c);
      selByVal.set(v, list);
    }

    const selTripleVals = Array.from(selByVal.entries())
      .filter(([, g]) => g.length === 3)
      .map(([v]) => v)
      .sort((a, b) => a - b);

    const selQuadVals = Array.from(selByVal.entries())
      .filter(([, g]) => g.length === 4)
      .map(([v]) => v);

    if (selTripleVals.length >= 2) {
      const run = this.findLongestContiguousRun(selTripleVals.filter((v) => v <= 14));
      if (run.length >= 2) {
        coreCards = run.flatMap((v) => selByVal.get(v)!.slice(0, 3));
        wingCount = run.length;
        coreLabel = '飞机';
      }
    }

    if (coreCards.length === 0 && selTripleVals.length >= 1) {
      const v = selTripleVals[0];
      coreCards = selByVal.get(v)!.slice(0, 3);
      wingCount = 1;
      coreLabel = `三张${this.valueToLabel(v)}`;
    }

    if (coreCards.length === 0 && selQuadVals.length === 1 && selected.length >= 4) {
      const v = selQuadVals[0];
      coreCards = selByVal.get(v)!.slice(0, 4);
      wingCount = 2;
      coreLabel = `四带二(${this.valueToLabel(v)})`;
    }

    // If user selected 1~2 cards of a rank that has 3 cards in hand, promote to full triple!
    if (coreCards.length === 0 && selected.length >= 1 && selected.length <= 2) {
      const v = selected[0].cardData.value;
      const fullGrp = byVal.get(v) ?? [];
      if (fullGrp.length === 3) {
        coreCards = fullGrp.slice(0, 3);
        wingCount = 1;
        coreLabel = `三张${this.valueToLabel(v)}`;
      }
    }

    // If still no core, find the lowest isolated 3-of-a-kind in hand
    if (coreCards.length === 0) {
      const handTriples = Array.from(byVal.entries())
        .filter(([, g]) => g.length === 3)
        .map(([v]) => v)
        .sort((a, b) => a - b);
      if (handTriples.length === 0) {
        return { ok: false, message: '手牌中暂无三张或飞机可补翼' };
      }
      const v = handTriples[0];
      coreCards = byVal.get(v)!.slice(0, 3);
      wingCount = 1;
      coreLabel = `三张${this.valueToLabel(v)}`;
    }

    const coreIds = new Set(coreCards.map((c) => c.cardData.id));
    const coreRanks = new Set(coreCards.map((c) => c.cardData.value));

    const firstTrySize: 1 | 2 = this.wingTogglePreference;
    const secondTrySize: 1 | 2 = firstTrySize === 1 ? 2 : 1;
    this.wingTogglePreference = secondTrySize;

    let wings = this.pickHistogramZeroLossWings(
      activeCards,
      coreIds,
      coreRanks,
      wingCount,
      firstTrySize
    );
    let chosenSize: 1 | 2 = firstTrySize;

    if (!wings) {
      wings = this.pickHistogramZeroLossWings(
        activeCards,
        coreIds,
        coreRanks,
        wingCount,
        secondTrySize
      );
      chosenSize = secondTrySize;
    }

    if (!wings) {
      return { ok: false, message: '手牌中没有可安全附带的零损散牌' };
    }

    const finalIds = new Set<string>([
      ...coreCards.map((c) => c.cardData.id),
      ...wings.map((c) => c.cardData.id),
    ]);

    const wingTag = chosenSize === 1 ? '带单' : '带对';
    for (const card of this.cards) {
      if (card.destroyed) continue;
      const isPicked = finalIds.has(card.cardData.id);
      const isWing = isPicked && !coreIds.has(card.cardData.id);
      card.setSelected(isPicked, isWing, isWing ? wingTag : undefined);
    }

    const wingNames = wings.map((w) => this.valueToLabel(w.cardData.value)).join('/');
    const msg = `推荐补翼：${coreLabel} + ${chosenSize === 1 ? '单翼' : '对翼'}[${wingNames}]`;
    this.showComboStatusBanner(msg, false);
    hapticEngine.smartComboLock();
    soundEngine.playGlissando();
    this.notifySelectionChange();
    return { ok: true, message: msg };
  }

  private pickHistogramZeroLossWings(
    allCards: Card[],
    excludedIds: Set<string>,
    excludedRanks: Set<number>,
    wingCount: number,
    wingSize: 1 | 2
  ): Card[] | null {
    const pool = allCards.filter(
      (c) => !excludedIds.has(c.cardData.id) && !excludedRanks.has(c.cardData.value)
    );
    const hist = new Int32Array(15);
    const byIdx = new Map<number, Card[]>();

    for (const c of pool) {
      const idx = Math.max(0, Math.min(14, c.cardData.value - 3));
      hist[idx] += 1;
      const list = byIdx.get(idx) ?? [];
      if (c.cardData.isWild) list.push(c);
      else list.unshift(c);
      byIdx.set(idx, list);
    }

    const scored: Array<{ idx: number; penalty: number }> = [];
    for (let idx = 0; idx < 15; idx++) {
      if (wingSize === 2 && idx >= 13) continue;
      const count = hist[idx];
      if (count < wingSize) continue;
      // Never break Rocket or 4-of-a-kind Bomb
      if ((idx === 13 || idx === 14) && hist[13] >= 1 && hist[14] >= 1) continue;
      if (count === 4) continue;

      let penalty = idx * 1.5;
      if (byIdx.get(idx)?.some((c) => c.cardData.isWild)) penalty += 800;
      if (idx === 14) penalty += 220;
      else if (idx === 13) penalty += 180;
      else if (idx === 12) penalty += 120;
      else if (idx === 11) penalty += 38;

      if (count === 3) penalty += 260;
      if (count === 2 && wingSize === 1) penalty += 55;

      // Check 5+ Straight skeleton preservation (indices 0..11)
      if (idx <= 11 && count - wingSize === 0) {
        let l = idx;
        while (l - 1 >= 0 && hist[l - 1] >= 1) l--;
        let r = idx;
        while (r + 1 <= 11 && hist[r + 1] >= 1) r++;
        if (r - l + 1 >= 5 && (idx - l < 5 || r - idx < 5)) {
          penalty += 145;
        }
      }

      scored.push({ idx, penalty });
    }

    scored.sort((a, b) => a.penalty - b.penalty);
    if (scored.length < wingCount) return null;

    const chosen = scored.slice(0, wingCount);
    const out: Card[] = [];
    for (const item of chosen) {
      const grp = byIdx.get(item.idx) ?? [];
      out.push(...grp.slice(0, wingSize));
    }
    return out;
  }

  /**
   * Whitepaper v2.0 Section 1.3: Client-side 15-Rank Histogram Swap-3 Selector
   * Automatically selects the 3 lowest-penalty isolated cards (protecting Rockets, Bombs, 2s, Aces, Straights, Triples).
   */
  public selectOptimalSwapThree(): CardData[] {
    const activeCards = this.cards.filter((c) => !c.destroyed);
    if (activeCards.length <= 3) {
      const allIds = activeCards.map((c) => c.cardData.id);
      this.selectByIds(allIds);
      return activeCards.map((c) => c.cardData);
    }

    const hist = new Int32Array(15);
    for (const c of activeCards) {
      const idx = Math.max(0, Math.min(14, c.cardData.value - 3));
      hist[idx] += 1;
    }
    const hasRocket = hist[13] >= 1 && hist[14] >= 1;

    const scored = activeCards.map((card) => {
      const idx = Math.max(0, Math.min(14, card.cardData.value - 3));
      const count = hist[idx];
      let keepScore = card.cardData.value * 2;

      if (card.cardData.isWild) keepScore += 900;
      if ((idx === 13 || idx === 14) && hasRocket) keepScore += 1000;
      if (idx >= 13) keepScore += 450;
      else if (idx === 12) keepScore += 280;
      else if (idx === 11) keepScore += 110;
      else if (idx === 10) keepScore += 55;

      if (count === 4) keepScore += 800;
      else if (count === 3) keepScore += 240;
      else if (count === 2) keepScore += 48;

      if (idx <= 11 && count - 1 === 0) {
        let l = idx;
        while (l - 1 >= 0 && hist[l - 1] >= 1) l--;
        let r = idx;
        while (r + 1 <= 11 && hist[r + 1] >= 1) r++;
        if (r - l + 1 >= 5 && (idx - l < 5 || r - idx < 5)) {
          keepScore += 135;
        }
      }

      return { card, keepScore };
    });

    scored.sort((a, b) => a.keepScore - b.keepScore);
    const chosen = scored.slice(0, 3).map((s) => s.card);
    const chosenIds = new Set(chosen.map((c) => c.cardData.id));

    for (const c of this.cards) {
      if (c.destroyed) continue;
      const picked = chosenIds.has(c.cardData.id);
      c.setSelected(picked, picked, picked ? '换三张推荐' : undefined);
    }

    const names = chosen.map((c) => this.valueToLabel(c.cardData.value)).join(' · ');
    this.showComboStatusBanner(`换三张推荐：[${names}]`, false);
    hapticEngine.smartComboLock();
    soundEngine.playGlissando();
    this.notifySelectionChange();
    return chosen.map((c) => c.cardData);
  }
}

