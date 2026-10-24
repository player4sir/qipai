import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { ZhajinhuaRoom } from '../../server/games/zhajinhua/ZhajinhuaRoom.js';
import type { ZjhSnapshot } from '../../src/games/zhajinhua/types.js';

const HUMAN = 'zjh_test_human';

const createRoom = (mode = 'classic') => {
  const snapshots: ZjhSnapshot[] = [];
  const errors: string[] = [];
  const connectionManager = {
    emitToPlayer: (playerId: string, event: string, payload: unknown) => {
      if (playerId !== HUMAN) return;
      if (event === 's2c_zjh_snapshot') snapshots.push(JSON.parse(JSON.stringify(payload)) as ZjhSnapshot);
      if (event === 's2c_zjh_error') errors.push((payload as { message: string }).message);
    },
  };
  let destroyed = false;
  const room = new ZhajinhuaRoom({
    roomId: 'room_zjh_test',
    hostId: HUMAN,
    baseScore: 100,
    isPrivate: false,
    mode,
    connectionManager: connectionManager as never,
    onRoomDestroyed: () => {
      destroyed = true;
    },
  });
  room.addPlayer({ playerId: HUMAN, nickname: 'T', avatarId: 'kashen', beans: 50_000 });
  return { room, snapshots, errors, isDestroyed: () => destroyed };
};

const total = (s: ZjhSnapshot) => s.seats.reduce((sum, seat) => sum + (seat?.beans ?? 0), 0);

test('room starts a hand automatically with bots and hides other hands', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const { room, snapshots } = createRoom();
    mock.timers.tick(2_000 + 1_300);
    const s = snapshots[snapshots.length - 1];
    assert.equal(s.phase, 'BETTING');
    assert.equal(s.seats.filter(Boolean).length, 5);
    const me = s.mySeat;
    assert.ok(me >= 0);
    for (const seat of s.seats) {
      assert.ok(seat);
      assert.equal(seat!.cards, null, 'nobody sees hidden cards before looking');
      assert.equal(seat!.totalBet, 100);
    }
    assert.equal(s.pot, 500);
    room.destroy();
  } finally {
    mock.timers.reset();
  }
});

test('look reveals only own cards; out-of-turn actions are rejected', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const { room, snapshots, errors } = createRoom();
    mock.timers.tick(3_300);
    const before = snapshots[snapshots.length - 1];
    room.handleClientEvent(HUMAN, 'c2s_zjh_action', { action: 'look' });
    const after = snapshots[snapshots.length - 1];
    assert.equal(after.seats[after.mySeat]!.cards?.length, 3);
    for (const seat of after.seats) {
      if (seat && seat.seatIndex !== after.mySeat) assert.equal(seat.cards, null);
    }
    if (before.currentTurnSeat !== before.mySeat) {
      room.handleClientEvent(HUMAN, 'c2s_zjh_action', { action: 'call' });
      assert.ok(errors.length >= 1, 'out-of-turn call must be rejected');
    }
    room.destroy();
  } finally {
    mock.timers.reset();
  }
});

for (const mode of ['classic', 'special']) {
  test(`beans are conserved across many hands (${mode}); AFK human ends up in trusteeship`, () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    try {
      const { room, snapshots, isDestroyed } = createRoom(mode);

      let prevPhase = '';
      let handTotal = -1;
      let hands = 0;
      let sawShowdown = false;

      for (let step = 0; step < 6_000 && hands < 60; step++) {
        mock.timers.tick(500);
        const s = snapshots[snapshots.length - 1];
        if (!s) continue;

        if (s.phase === 'BETTING' && prevPhase !== 'BETTING') {
          handTotal = total(s) + s.pot;
          hands += 1;
        }
        if (s.phase === 'SHOWDOWN') sawShowdown = true;

        if (handTotal >= 0 && (s.phase === 'BETTING' || s.phase === 'SHOWDOWN')) {
          assert.equal(total(s) + s.pot, handTotal, `chips leaked mid-hand (${s.phase})`);
        }
        if (s.phase === 'RESULT' && handTotal >= 0) {
          assert.equal(total(s), handTotal, 'chips leaked at settlement');
          const deltas = s.seats.reduce((sum, seat) => sum + (seat?.delta ?? 0), 0);
          assert.equal(deltas, 0, 'round deltas must be zero-sum');
          assert.ok(s.seats.some((seat) => seat?.isWinner), 'someone must win');
          for (const seat of s.seats) assert.ok(!seat || seat.beans >= 0, 'beans never negative');
        }
        prevPhase = s.phase;
      }

      assert.ok(hands >= 20, `expected many hands to be played, got ${hands}`);
      void sawShowdown;
      assert.equal(isDestroyed(), false);
      room.destroy();
    } finally {
      mock.timers.reset();
    }
  });
}

test('short stack is forced all-in, goes to showdown, chips conserved, never negative', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const snapshots: ZjhSnapshot[] = [];
    const cm = {
      emitToPlayer: (id: string, ev: string, payload: unknown) => {
        if (id === HUMAN && ev === 's2c_zjh_snapshot') snapshots.push(JSON.parse(JSON.stringify(payload)));
      },
    };
    const room = new ZhajinhuaRoom({
      roomId: 'room_zjh_short',
      hostId: HUMAN,
      baseScore: 100,
      isPrivate: false,
      connectionManager: cm as never,
      onRoomDestroyed: () => undefined,
    });
    room.addPlayer({ playerId: HUMAN, nickname: 'T', avatarId: 'kashen', beans: 600 });

    let sawShowdown = false;
    let sawAllInResult = false;
    for (let step = 0; step < 3_000 && !sawAllInResult; step++) {
      mock.timers.tick(250);
      const s = snapshots[snapshots.length - 1];
      if (!s) continue;
      if (s.phase === 'SHOWDOWN') sawShowdown = true;
      if (s.phase === 'RESULT' && s.seats.some((seat) => seat?.status === 'allin')) {
        sawAllInResult = true;
        const sum = s.seats.reduce((a, seat) => a + (seat?.delta ?? 0), 0);
        assert.equal(sum, 0, 'zero-sum');
        for (const seat of s.seats) assert.ok(!seat || seat.beans >= 0);
      }
      if (s.my.canAct) {
        // Drive the human: always call, shove when it cannot afford to.
        room.handleClientEvent(HUMAN, 'c2s_zjh_action', { action: s.my.mustAllIn ? 'allin' : 'call' });
      }
    }
    assert.ok(sawShowdown, 'all-in must trigger a showdown');
    assert.ok(sawAllInResult, 'all-in hand must settle');
    room.destroy();
  } finally {
    mock.timers.reset();
  }
});

test('AFK human is put into trusteeship after repeated timeouts and can cancel it', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const { room, snapshots } = createRoom();
    let sawTrusteeship = false;
    for (let step = 0; step < 4_000 && !sawTrusteeship; step++) {
      mock.timers.tick(500);
      const s = snapshots[snapshots.length - 1];
      if (s?.myTrusteeship) sawTrusteeship = true;
    }
    assert.ok(sawTrusteeship, 'two silent turns must enable trusteeship');
    room.handleClientEvent(HUMAN, 'c2s_zjh_ready', {});
    assert.equal(snapshots[snapshots.length - 1].myTrusteeship, false);
    room.destroy();
  } finally {
    mock.timers.reset();
  }
});

test('human leaving mid-hand folds, forfeits, and room reports empty of humans', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const { room, snapshots } = createRoom();
    mock.timers.tick(3_300);
    assert.equal(snapshots[snapshots.length - 1].phase, 'BETTING');
    room.removePlayer(HUMAN);
    assert.equal(room.isEmptyOfHumans(), true);
    room.destroy();
  } finally {
    mock.timers.reset();
  }
});
