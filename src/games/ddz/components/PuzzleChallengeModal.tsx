import React, { useEffect, useMemo, useState } from 'react';
import { soundEngine } from '../../../shared/audio/SoundEngine';
import { hapticEngine } from '../../../shared/haptics/HapticEngine';
import { AvatarSvg } from '../../../shared/ui/AvatarSvg';
import { CommercialModalShell } from '../../../shared/ui/CommercialModalShell';
import { PokerSuitSvg } from '../../../shared/ui/ModalVectorIcons';
import { CardData, Rank, Suit } from '../types';

export interface PuzzleLevel {
  id: number;
  title: string;
  difficulty: '入门' | '进阶' | '困难' | '宗师' | '绝世';
  rewardBeans: number;
  description: string;
  strategyTip: string;
  landlordRanks: Rank[];
  peasantRanks: Rank[];
}

const RANK_VAL: Record<Rank, number> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  '2': 15,
  small_joker: 16,
  big_joker: 17,
};

const SUITS: Array<Exclude<Suit, null>> = ['spade', 'heart', 'club', 'diamond'];

function buildHandFromRanks(ranks: Rank[], prefix: string): CardData[] {
  const rankCounter: Record<string, number> = {};
  return ranks
    .map((r, i) => {
      const count = rankCounter[r] ?? 0;
      rankCounter[r] = count + 1;
      const suit: Suit =
        r === 'small_joker' || r === 'big_joker' ? null : SUITS[count % 4];
      return {
        id: `${prefix}_${r}_${i}`,
        rank: r,
        suit,
        value: RANK_VAL[r],
      };
    })
    .sort((a, b) => b.value - a.value);
}

export const PUZZLE_LEVELS: PuzzleLevel[] = [
  {
    id: 1,
    title: '第一关 · 引蛇出洞',
    difficulty: '入门',
    rewardBeans: 500,
    description: '农民手握单张2与对9，若直接出对子会被农民单2夺牌权。',
    strategyTip: '先打单张Q逼出农民单2，再用小王夺回牌权，最后对7收尾！',
    landlordRanks: ['small_joker', 'Q', '7', '7'],
    peasantRanks: ['2', '9', '9'],
  },
  {
    id: 2,
    title: '第二关 · 三带破敌',
    difficulty: '入门',
    rewardBeans: 800,
    description: '手握三张8与单A、单4，农民握有对K与单2。',
    strategyTip: '先用三张8带4打出，再留大王控场走完单牌！',
    landlordRanks: ['big_joker', '8', '8', '8', '4', '3'],
    peasantRanks: ['2', 'K', 'K', '9'],
  },
  {
    id: 3,
    title: '第三关 · 拆对制胜',
    difficulty: '进阶',
    rewardBeans: 1200,
    description: '农民握有对J与单A，地主手握对Q、单2与单6。',
    strategyTip: '先出对Q压制农民对J，再用单2控回先手走完单6！',
    landlordRanks: ['2', 'Q', 'Q', '6'],
    peasantRanks: ['A', 'J', 'J', '4'],
  },
  {
    id: 4,
    title: '第四关 · 顺子牵制',
    difficulty: '困难',
    rewardBeans: 2000,
    description: '地主拥有34567顺子与对A、单3，农民握有大王与对K。',
    strategyTip: '先打34567五张顺子，随后打对A压制农民对K，最后单3走完！',
    landlordRanks: ['A', 'A', '7', '6', '5', '4', '3', '3'],
    peasantRanks: ['big_joker', 'K', 'K', '8'],
  },
  {
    id: 5,
    title: '第五关 · 弃炸保帅',
    difficulty: '宗师',
    rewardBeans: 3500,
    description: '四张9若当炸弹打会留下两张孤立小单牌，四带二单反而一锤定音！',
    strategyTip: '利用四带二单（9999带3和5）一次性清空两张小单牌，再用单2收官！',
    landlordRanks: ['2', '9', '9', '9', '9', '5', '3'],
    peasantRanks: ['small_joker', 'A', 'Q', 'Q'],
  },
  {
    id: 6,
    title: '第六关 · 绝境逢生',
    difficulty: '绝世',
    rewardBeans: 5000,
    description: '地主既有三带又有单张，出牌次序错一步即满盘皆输。',
    strategyTip: '先打单J诱出农民单2，大王管上夺回先手，再打三6带4，最后对10绝杀！',
    landlordRanks: ['big_joker', 'J', '10', '10', '6', '6', '6', '4'],
    peasantRanks: ['2', 'Q', 'Q', '5'],
  },
];

interface PuzzleMovePattern {
  type:
    | 'SINGLE'
    | 'PAIR'
    | 'TRIPLE'
    | 'TRIPLE_SINGLE'
    | 'TRIPLE_PAIR'
    | 'STRAIGHT'
    | 'FOUR_TWO_SINGLES'
    | 'BOMB'
    | 'ROCKET';
  mainValue: number;
  length: number;
  cards: CardData[];
  label: string;
}

function classifyPuzzleMove(cards: CardData[]): PuzzleMovePattern | null {
  const n = cards.length;
  if (n === 0) return null;
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const byVal = new Map<number, CardData[]>();
  for (const c of sorted) {
    const list = byVal.get(c.value) ?? [];
    list.push(c);
    byVal.set(c.value, list);
  }
  const entries = Array.from(byVal.entries()).sort(
    (a, b) => b[1].length - a[1].length || b[0] - a[0]
  );

  if (n === 1) {
    return {
      type: 'SINGLE',
      mainValue: sorted[0].value,
      length: 1,
      cards: sorted,
      label: `单${sorted[0].rank === 'small_joker' ? '小王' : sorted[0].rank === 'big_joker' ? '大王' : sorted[0].rank}`,
    };
  }
  if (n === 2) {
    if (byVal.has(16) && byVal.has(17)) {
      return { type: 'ROCKET', mainValue: 17, length: 2, cards: sorted, label: '王炸' };
    }
    if (entries.length === 1 && entries[0][1].length === 2) {
      return {
        type: 'PAIR',
        mainValue: entries[0][0],
        length: 2,
        cards: sorted,
        label: `对${sorted[0].rank}`,
      };
    }
    return null;
  }
  if (n === 3) {
    if (entries.length === 1 && entries[0][1].length === 3) {
      return {
        type: 'TRIPLE',
        mainValue: entries[0][0],
        length: 3,
        cards: sorted,
        label: `三张${sorted[0].rank}`,
      };
    }
    return null;
  }
  if (n === 4) {
    if (entries.length === 1 && entries[0][1].length === 4) {
      return {
        type: 'BOMB',
        mainValue: entries[0][0],
        length: 4,
        cards: sorted,
        label: `炸弹${sorted[0].rank}`,
      };
    }
    if (entries[0][1].length === 3) {
      return {
        type: 'TRIPLE_SINGLE',
        mainValue: entries[0][0],
        length: 4,
        cards: [...entries[0][1], ...entries[1][1]],
        label: '三带一',
      };
    }
    return null;
  }
  if (n === 5 && entries[0][1].length === 3 && entries[1]?.[1].length === 2) {
    return {
      type: 'TRIPLE_PAIR',
      mainValue: entries[0][0],
      length: 5,
      cards: [...entries[0][1], ...entries[1][1]],
      label: '三带二',
    };
  }
  if (n === 6 && entries[0][1].length === 4) {
    return {
      type: 'FOUR_TWO_SINGLES',
      mainValue: entries[0][0],
      length: 6,
      cards: sorted,
      label: '四带二单',
    };
  }
  if (n >= 5 && entries.length === n) {
    const vals = sorted.map((c) => c.value).sort((a, b) => a - b);
    if (vals[vals.length - 1] <= 14) {
      let ok = true;
      for (let i = 1; i < vals.length; i++) {
        if (vals[i] !== vals[i - 1] + 1) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return {
          type: 'STRAIGHT',
          mainValue: vals[vals.length - 1],
          length: n,
          cards: sorted,
          label: '顺子',
        };
      }
    }
  }
  return null;
}

function canPuzzleMoveBeat(
  cand: PuzzleMovePattern,
  target: PuzzleMovePattern | null
): boolean {
  if (!target) return true;
  if (cand.type === 'ROCKET') return true;
  if (target.type === 'ROCKET') return false;
  if (cand.type === 'BOMB' && target.type !== 'BOMB') return true;
  if (cand.type !== target.type || cand.length !== target.length) return false;
  return cand.mainValue > target.mainValue;
}

function generateAllValidMoves(
  hand: CardData[],
  target: PuzzleMovePattern | null
): PuzzleMovePattern[] {
  const moves: PuzzleMovePattern[] = [];
  const byVal = new Map<number, CardData[]>();
  for (const c of hand) {
    const arr = byVal.get(c.value) ?? [];
    arr.push(c);
    byVal.set(c.value, arr);
  }
  const uniqueVals = Array.from(byVal.keys()).sort((a, b) => a - b);

  for (const v of uniqueVals) {
    const m = classifyPuzzleMove([byVal.get(v)![0]]);
    if (m && canPuzzleMoveBeat(m, target)) moves.push(m);
  }
  for (const v of uniqueVals) {
    const arr = byVal.get(v)!;
    if (arr.length >= 2) {
      const m = classifyPuzzleMove(arr.slice(0, 2));
      if (m && canPuzzleMoveBeat(m, target)) moves.push(m);
    }
  }
  for (const v of uniqueVals) {
    const arr = byVal.get(v)!;
    if (arr.length >= 3) {
      const triple = arr.slice(0, 3);
      const m3 = classifyPuzzleMove(triple);
      if (m3 && canPuzzleMoveBeat(m3, target)) moves.push(m3);
      for (const k of uniqueVals) {
        if (k === v) continue;
        const m31 = classifyPuzzleMove([...triple, byVal.get(k)![0]]);
        if (m31 && canPuzzleMoveBeat(m31, target)) moves.push(m31);
        if (byVal.get(k)!.length >= 2) {
          const m32 = classifyPuzzleMove([...triple, ...byVal.get(k)!.slice(0, 2)]);
          if (m32 && canPuzzleMoveBeat(m32, target)) moves.push(m32);
        }
      }
    }
  }
  const seqVals = uniqueVals.filter((v) => v <= 14);
  for (let len = 5; len <= seqVals.length; len++) {
    for (let i = 0; i + len <= seqVals.length; i++) {
      let contiguous = true;
      for (let j = 1; j < len; j++) {
        if (seqVals[i + j] !== seqVals[i + j - 1] + 1) {
          contiguous = false;
          break;
        }
      }
      if (contiguous) {
        const cards = seqVals.slice(i, i + len).map((v) => byVal.get(v)![0]);
        const ms = classifyPuzzleMove(cards);
        if (ms && canPuzzleMoveBeat(ms, target)) moves.push(ms);
      }
    }
  }
  for (const v of uniqueVals) {
    const arr = byVal.get(v)!;
    if (arr.length === 4) {
      const four = arr.slice(0, 4);
      const otherVals = uniqueVals.filter((k) => k !== v);
      for (let i = 0; i < otherVals.length; i++) {
        for (let j = i + 1; j < otherVals.length; j++) {
          const m42 = classifyPuzzleMove([
            ...four,
            byVal.get(otherVals[i])![0],
            byVal.get(otherVals[j])![0],
          ]);
          if (m42 && canPuzzleMoveBeat(m42, target)) moves.push(m42);
        }
      }
      const mb = classifyPuzzleMove(four);
      if (mb && canPuzzleMoveBeat(mb, target)) moves.push(mb);
    }
  }
  if (byVal.has(16) && byVal.has(17)) {
    const mr = classifyPuzzleMove([byVal.get(16)![0], byVal.get(17)![0]]);
    if (mr && canPuzzleMoveBeat(mr, target)) moves.push(mr);
  }
  return moves;
}

function removeCards(hand: CardData[], toRemove: CardData[]): CardData[] {
  const ids = new Set(toRemove.map((c) => c.id));
  return hand.filter((c) => !ids.has(c.id));
}

interface MinimaxResult {
  landlordWins: boolean;
  bestMove: PuzzleMovePattern | null;
  depth: number;
}

function solvePuzzleMinimax(
  landlordHand: CardData[],
  peasantHand: CardData[],
  turn: 'landlord' | 'peasant',
  lastMove: PuzzleMovePattern | null,
  lastActor: 'landlord' | 'peasant' | null,
  memo = new Map<string, MinimaxResult>(),
  depth = 0
): MinimaxResult {
  if (landlordHand.length === 0) {
    return { landlordWins: true, bestMove: null, depth };
  }
  if (peasantHand.length === 0) {
    return { landlordWins: false, bestMove: null, depth };
  }
  if (depth > 26) {
    return { landlordWins: false, bestMove: null, depth };
  }

  const lKey = landlordHand.map((c) => c.rank).join(',');
  const pKey = peasantHand.map((c) => c.rank).join(',');
  const mKey = lastMove
    ? `${lastMove.type}_${lastMove.mainValue}_${lastMove.length}_${lastActor}`
    : 'lead';
  const stateKey = `${lKey}|${pKey}|${turn}|${mKey}`;
  const cached = memo.get(stateKey);
  if (cached) return cached;

  const isFreeLead = !lastMove || lastActor === turn;
  const effectiveTarget = isFreeLead ? null : lastMove;

  if (turn === 'landlord') {
    const candidates = generateAllValidMoves(landlordHand, effectiveTarget);
    candidates.sort((a, b) => b.cards.length - a.cards.length || a.mainValue - b.mainValue);

    const fallbackMove: PuzzleMovePattern | null = candidates[0] ?? null;

    for (const move of candidates) {
      const nextL = removeCards(landlordHand, move.cards);
      const sub = solvePuzzleMinimax(
        nextL,
        peasantHand,
        'peasant',
        move,
        'landlord',
        memo,
        depth + 1
      );
      if (sub.landlordWins) {
        const res = { landlordWins: true, bestMove: move, depth: sub.depth };
        memo.set(stateKey, res);
        return res;
      }
    }

    if (!isFreeLead) {
      const passSub = solvePuzzleMinimax(
        landlordHand,
        peasantHand,
        'peasant',
        null,
        'peasant',
        memo,
        depth + 1
      );
      if (passSub.landlordWins) {
        const res = { landlordWins: true, bestMove: null, depth: passSub.depth };
        memo.set(stateKey, res);
        return res;
      }
    }

    const loseRes = { landlordWins: false, bestMove: fallbackMove, depth };
    memo.set(stateKey, loseRes);
    return loseRes;
  } else {
    const candidates = generateAllValidMoves(peasantHand, effectiveTarget);
    candidates.sort((a, b) => b.cards.length - a.cards.length || b.mainValue - a.mainValue);

    let bestDefenseMove: PuzzleMovePattern | null = candidates[0] ?? null;
    let maxDepth = depth;

    for (const move of candidates) {
      const nextP = removeCards(peasantHand, move.cards);
      const sub = solvePuzzleMinimax(
        landlordHand,
        nextP,
        'landlord',
        move,
        'peasant',
        memo,
        depth + 1
      );
      if (!sub.landlordWins) {
        const res = { landlordWins: false, bestMove: move, depth: sub.depth };
        memo.set(stateKey, res);
        return res;
      }
      if (sub.depth > maxDepth) {
        maxDepth = sub.depth;
        bestDefenseMove = move;
      }
    }

    if (!isFreeLead) {
      const passSub = solvePuzzleMinimax(
        landlordHand,
        peasantHand,
        'landlord',
        null,
        'landlord',
        memo,
        depth + 1
      );
      if (!passSub.landlordWins) {
        const res = { landlordWins: false, bestMove: null, depth: passSub.depth };
        memo.set(stateKey, res);
        return res;
      }
    }

    const landlordStillWins = {
      landlordWins: true,
      bestMove: bestDefenseMove,
      depth: maxDepth,
    };
    memo.set(stateKey, landlordStillWins);
    return landlordStillWins;
  }
}

interface HistorySnapshot {
  landlordHand: CardData[];
  peasantHand: CardData[];
  turn: 'landlord' | 'peasant';
  lastMove: PuzzleMovePattern | null;
  lastActor: 'landlord' | 'peasant' | null;
  peasantStatusText: string;
  landlordStatusText: string;
}

export interface PuzzleChallengeModalProps {
  onClose: () => void;
  onClaimReward?: () => void;
  initialLevelIdx?: number;
}

export const PuzzleChallengeModal: React.FC<PuzzleChallengeModalProps> = ({
  onClose,
  onClaimReward,
  initialLevelIdx = 0,
}) => {
  const [levelIdx, setLevelIdx] = useState(() =>
    Math.max(0, Math.min(PUZZLE_LEVELS.length - 1, initialLevelIdx))
  );
  const currentLevel = PUZZLE_LEVELS[levelIdx];

  const [landlordHand, setLandlordHand] = useState<CardData[]>(() =>
    buildHandFromRanks(currentLevel.landlordRanks, 'L')
  );
  const [peasantHand, setPeasantHand] = useState<CardData[]>(() =>
    buildHandFromRanks(currentLevel.peasantRanks, 'P')
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [turn, setTurn] = useState<'landlord' | 'peasant'>('landlord');
  const [lastMove, setLastMove] = useState<PuzzleMovePattern | null>(null);
  const [lastActor, setLastActor] = useState<'landlord' | 'peasant' | null>(null);
  const [peasantStatusText, setPeasantStatusText] = useState<string>('等待地主先手出牌');
  const [landlordStatusText, setLandlordStatusText] = useState<string>('请选择手牌出牌');
  const [solverHintText, setSolverHintText] = useState<string | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [solvedLevels, setSolvedLevels] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('ddz_solved_puzzles_v1');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const loadLevel = (idx: number) => {
    const lv = PUZZLE_LEVELS[idx];
    setLevelIdx(idx);
    setLandlordHand(buildHandFromRanks(lv.landlordRanks, 'L'));
    setPeasantHand(buildHandFromRanks(lv.peasantRanks, 'P'));
    setSelectedIds(new Set());
    setTurn('landlord');
    setLastMove(null);
    setLastActor(null);
    setPeasantStatusText('等待地主先手出牌');
    setLandlordStatusText('请选择手牌出牌');
    setSolverHintText(null);
    setHistory([]);
    soundEngine.playTap(740);
  };

  const gameResult: 'playing' | 'win' | 'lose' = useMemo(() => {
    if (landlordHand.length === 0) return 'win';
    if (peasantHand.length === 0) return 'lose';
    return 'playing';
  }, [landlordHand.length, peasantHand.length]);

  useEffect(() => {
    if (gameResult === 'win') {
      soundEngine.playVictoryFanfare();
      hapticEngine.playCard();
      if (!solvedLevels.has(currentLevel.id)) {
        const next = new Set(solvedLevels);
        next.add(currentLevel.id);
        setSolvedLevels(next);
        try {
          localStorage.setItem('ddz_solved_puzzles_v1', JSON.stringify(Array.from(next)));
        } catch {
          // ignore
        }
        onClaimReward?.();
      }
    } else if (gameResult === 'lose') {
      soundEngine.playDefeatTone();
    }
  }, [gameResult, currentLevel.id, solvedLevels, onClaimReward]);

  useEffect(() => {
    if (turn !== 'peasant' || gameResult !== 'playing') return;
    const timer = window.setTimeout(() => {
      const memo = new Map<string, MinimaxResult>();
      const res = solvePuzzleMinimax(
        landlordHand,
        peasantHand,
        'peasant',
        lastMove,
        lastActor,
        memo,
        0
      );

      if (res.bestMove) {
        const move = res.bestMove;
        soundEngine.playCardPlace(true);
        soundEngine.playDdzCardVoice(move.type, move.mainValue);
        const nextP = removeCards(peasantHand, move.cards);
        setPeasantHand(nextP);
        setLastMove(move);
        setLastActor('peasant');
        setPeasantStatusText(`农民打出：${move.label}`);
        setLandlordStatusText(
          nextP.length === 0 ? '农民已走完手牌' : '轮到您管牌或选择不出'
        );
        setTurn('landlord');
      } else {
        soundEngine.playDdzActionVoice('pass');
        setPeasantStatusText('农民选择：要不起');
        setLandlordStatusText('农民要不起 · 您获得先手牌权');
        setLastMove(null);
        setLastActor('landlord');
        setTurn('landlord');
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [turn, gameResult, landlordHand, peasantHand, lastMove, lastActor]);

  const minimaxEval = useMemo(() => {
    if (gameResult !== 'playing' || turn !== 'landlord') return null;
    const memo = new Map<string, MinimaxResult>();
    return solvePuzzleMinimax(
      landlordHand,
      peasantHand,
      'landlord',
      lastMove,
      lastActor,
      memo,
      0
    );
  }, [landlordHand, peasantHand, turn, lastMove, lastActor, gameResult]);

  const handleToggleCard = (cardId: string) => {
    if (turn !== 'landlord' || gameResult !== 'playing') return;
    soundEngine.playTap(760);
    hapticEngine.selectCard();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const handlePlaySelected = () => {
    if (turn !== 'landlord' || gameResult !== 'playing') return;
    const chosen = landlordHand.filter((c) => selectedIds.has(c.id));
    const move = classifyPuzzleMove(chosen);
    if (!move) {
      soundEngine.playDefeatTone();
      hapticEngine.tap();
      setLandlordStatusText('所选牌型不合规则，请重选');
      return;
    }

    const isFreeLead = !lastMove || lastActor === 'landlord';
    if (!isFreeLead && !canPuzzleMoveBeat(move, lastMove)) {
      soundEngine.playDefeatTone();
      hapticEngine.tap();
      setLandlordStatusText(`压制失败：需大过农民的 ${lastMove?.label}`);
      return;
    }

    setHistory((h) => [
      ...h,
      {
        landlordHand,
        peasantHand,
        turn,
        lastMove,
        lastActor,
        peasantStatusText,
        landlordStatusText,
      },
    ]);

    soundEngine.playCardPlace(true);
    soundEngine.playDdzCardVoice(move.type, move.mainValue);
    hapticEngine.playCard();

    const nextL = removeCards(landlordHand, chosen);
    setLandlordHand(nextL);
    setSelectedIds(new Set());
    setLastMove(move);
    setLastActor('landlord');
    setLandlordStatusText(`您打出：${move.label}`);
    setSolverHintText(null);
    if (nextL.length > 0) {
      setPeasantStatusText('农民思考应对中...');
      setTurn('peasant');
    }
  };

  const handlePass = () => {
    if (turn !== 'landlord' || gameResult !== 'playing') return;
    const isFreeLead = !lastMove || lastActor === 'landlord';
    if (isFreeLead) return;

    setHistory((h) => [
      ...h,
      {
        landlordHand,
        peasantHand,
        turn,
        lastMove,
        lastActor,
        peasantStatusText,
        landlordStatusText,
      },
    ]);

    soundEngine.playDdzActionVoice('pass');
    setSelectedIds(new Set());
    setLastMove(null);
    setLastActor('peasant');
    setLandlordStatusText('地主：不出');
    setSolverHintText(null);
    setTurn('peasant');
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    soundEngine.playTap(680);
    const prev = history[history.length - 1];
    setLandlordHand(prev.landlordHand);
    setPeasantHand(prev.peasantHand);
    setTurn(prev.turn);
    setLastMove(prev.lastMove);
    setLastActor(prev.lastActor);
    setPeasantStatusText(prev.peasantStatusText);
    setLandlordStatusText(prev.landlordStatusText);
    setSelectedIds(new Set());
    setSolverHintText(null);
    setHistory((h) => h.slice(0, -1));
  };

  const handleMinimaxHint = () => {
    if (!minimaxEval) return;
    soundEngine.playGlissando();
    hapticEngine.smartComboLock();

    if (!minimaxEval.landlordWins) {
      setSolverHintText('当前局面已被农民反制，请点击「悔棋」重选');
      return;
    }

    if (!minimaxEval.bestMove) {
      setSelectedIds(new Set());
      setSolverHintText('提示：本手选择「不出」让牌，等待农民出牌后再反击');
      return;
    }

    const ids = new Set(minimaxEval.bestMove.cards.map((c) => c.id));
    setSelectedIds(ids);
    setSolverHintText(
      `提示：打出 ${minimaxEval.bestMove.label} [${minimaxEval.bestMove.cards
        .map((c) => (c.rank === 'big_joker' ? '大王' : c.rank === 'small_joker' ? '小王' : c.rank))
        .join(' · ')}]`
    );
  };

  const renderCardButton = (card: CardData, interactive: boolean) => {
    const selected = selectedIds.has(card.id);
    const isRed =
      card.suit === 'heart' || card.suit === 'diamond' || card.rank === 'big_joker';
    const rankLabel =
      card.rank === 'big_joker'
        ? '大王'
        : card.rank === 'small_joker'
        ? '小王'
        : card.rank;

    return (
      <button
        key={card.id}
        type="button"
        disabled={!interactive}
        onClick={() => interactive && handleToggleCard(card.id)}
        className={`relative flex h-18 w-13 shrink-0 flex-col justify-between rounded-xl border-2 p-1.5 shadow-2xs transition-all ${
          selected
            ? '-translate-y-2 border-[#F59E0B] bg-[#FFFBEB] ring-2 ring-[#F59E0B]/35 shadow-sm'
            : 'border-[#DFD2B8] bg-white hover:-translate-y-0.5'
        } ${interactive ? 'cursor-pointer' : 'cursor-default opacity-95'}`}
      >
        <div
          className={`text-left font-mono text-xs font-black leading-none ${
            isRed ? 'text-rose-600' : 'text-slate-900'
          }`}
        >
          <div>{rankLabel}</div>
          <div className="mt-0.5">
            <PokerSuitSvg
              suit={card.suit}
              isRedJoker={card.rank === 'big_joker'}
              className="h-2.5 w-2.5"
            />
          </div>
        </div>
        <div className="self-end">
          <PokerSuitSvg
            suit={card.suit}
            isRedJoker={card.rank === 'big_joker'}
            className="h-4 w-4"
          />
        </div>
      </button>
    );
  };

  return (
    <CommercialModalShell
      title="残局闯关"
      subtitle={`${currentLevel.title} · 首通奖励 +${currentLevel.rewardBeans} 积分`}
      size="lg"
      closeOnBackdrop={false}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex h-8.5 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              悔棋
            </button>
            <button
              type="button"
              onClick={() => loadLevel(levelIdx)}
              className="flex h-8.5 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] whitespace-nowrap shrink-0 cursor-pointer"
            >
              重玩
            </button>
            <button
              type="button"
              onClick={handleMinimaxHint}
              disabled={turn !== 'landlord' || gameResult !== 'playing'}
              className="flex h-8.5 items-center justify-center rounded-lg border border-[#D4AF37]/35 bg-[#D4AF37]/[0.08] px-3 text-xs font-bold text-[#E5B85B] hover:bg-[#D4AF37]/15 disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              出牌提示
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePass}
              disabled={
                turn !== 'landlord' ||
                gameResult !== 'playing' ||
                lastActor !== 'peasant' ||
                !lastMove
              }
              className="flex h-8.5 min-w-[76px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-4 text-xs font-semibold text-[#E5E7EB] hover:bg-white/[0.11] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              不出
            </button>
            <button
              type="button"
              onClick={handlePlaySelected}
              disabled={turn !== 'landlord' || gameResult !== 'playing' || selectedIds.size === 0}
              className="flex h-8.5 min-w-[88px] items-center justify-center rounded-lg bg-[#D49B35] px-5 text-xs font-bold text-[#111315] hover:bg-[#E0A842] disabled:opacity-35 whitespace-nowrap shrink-0 cursor-pointer"
            >
              出牌
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Level Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {PUZZLE_LEVELS.map((lv, idx) => {
            const active = idx === levelIdx;
            const solved = solvedLevels.has(lv.id);
            return (
              <button
                key={lv.id}
                type="button"
                onClick={() => loadLevel(idx)}
                className={`flex h-7.5 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-[#D49B35] bg-[#D49B35] text-[#111315] font-bold'
                    : solved
                    ? 'border-[#D4AF37]/35 bg-[#D4AF37]/[0.08] text-[#E5B85B]'
                    : 'border-white/[0.08] bg-white/[0.03] text-[#9CA3AF] hover:text-[#F3F4F6]'
                }`}
              >
                第{lv.id}关{solved ? ' (已通)' : ''}
              </button>
            );
          })}
        </div>

        {/* Peasant Open Hand */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <AvatarSvg
                avatarId="kashen"
                size={28}
                animState={turn === 'peasant' ? 'think' : gameResult === 'lose' ? 'win' : 'idle'}
              />
              <span className="font-bold text-[#F3F4F6]">
                守关农民（余 {peasantHand.length} 张）
              </span>
            </div>
            <span className="font-bold text-[#E5B85B]">{peasantStatusText}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {peasantHand.map((c) => renderCardButton(c, false))}
          </div>
        </div>

        {/* Center Trick Banner */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.08] px-3 py-2.5 text-center">
          {gameResult === 'win' ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[#E5B85B]">
                恭喜破局获胜
              </span>
              {levelIdx + 1 < PUZZLE_LEVELS.length && (
                <button
                  type="button"
                  onClick={() => loadLevel(levelIdx + 1)}
                  className="inline-flex h-7 items-center justify-center rounded-lg bg-[#D49B35] px-3 text-xs font-bold text-[#111315] hover:bg-[#E0A842] cursor-pointer"
                >
                  下一关
                </button>
              )}
            </div>
          ) : gameResult === 'lose' ? (
            <div className="text-xs font-bold text-rose-400">
              闯关失败 · {currentLevel.strategyTip}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="font-bold text-[#F3F4F6]">
                {lastMove
                  ? `${lastActor === 'landlord' ? '地主' : '农民'}打出 ${lastMove.label}`
                  : '桌面为空 · 请先手出牌'}
              </span>
              <span className="text-[#9CA3AF]">· {solverHintText || landlordStatusText}</span>
            </div>
          )}
        </div>

        {/* Landlord Player Hand */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <AvatarSvg
                avatarId="noble"
                size={28}
                isLandlord={true}
                animState={gameResult === 'win' ? 'win' : turn === 'landlord' ? 'play' : 'idle'}
              />
              <span className="font-bold text-[#F3F4F6]">
                破局地主（您 · 余 {landlordHand.length} 张）
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {landlordHand.map((c) =>
              renderCardButton(c, turn === 'landlord' && gameResult === 'playing')
            )}
          </div>
        </div>
      </div>
    </CommercialModalShell>
  );
};
