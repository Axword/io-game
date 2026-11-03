import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { GameRoom } from '../server/gameRoom.js';

const socket = id => ({ id, readyState: 1, bufferedAmount: 0, send() {} });

test('equipment cache prunes departed players and bots', () => {
  const room = new GameRoom('QACACHE', { bots: false });
  const first = room.addPlayer(socket('first'), 'First', 'warrior');
  const second = room.addPlayer(socket('second'), 'Second', 'archer');
  room.buildStateForPlayer(first);
  first.ws._equipmentRevisions.set('old-bot', 4);
  assert.equal(first.ws._equipmentRevisions.size, 3);
  room.removePlayer(second.id);
  room.buildStateForPlayer(first);
  assert.deepEqual([...first.ws._equipmentRevisions.keys()], [first.id]);
});

test('reconnect invalidates a stale socket equipment cache', () => {
  const room = new GameRoom('QARECONNECT', { bots: false });
  const player = room.addPlayer(socket('player'), 'QA', 'pyromancer');
  room.buildStateForPlayer(player);
  room.onPlayerDisconnect(player.id);
  const fresh = socket('new-socket');
  fresh._equipmentRevisions = new Map([[player.id, player.equipmentRevision]]);
  assert.equal(room.reconnectPlayer(fresh, player.id), player);
  assert.equal(fresh._equipmentRevisions.size, 0);
  const state = room.buildStateForPlayer(player);
  assert.equal(state.data.players[0].weapons[0].type, 'fireball');
  assert.equal(player.disconnectedAt, 0);
});

function nextMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', listener); reject(new Error('Timed out waiting for server message')); }, 5000);
    const listener = raw => {
      const message = JSON.parse(raw.toString());
      if (predicate(message)) { clearTimeout(timer); ws.off('message', listener); resolve(message); }
    };
    ws.on('message', listener);
  });
}

async function freePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('same websocket changes rooms without ghost streams and duplicate joins preserve its build', { timeout: 35000 }, async () => {
  const port = Number(process.env.QA_EQUIPMENT_PORT) || await freePort();
  const child = spawn(process.execPath, ['server/server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += String(data); });
  child.stderr.on('data', data => { logs += String(data); });
  child.on('error', error => { logs += `spawn: ${error.message}`; });
  let ws;
  try {
    let ready = false;
    const readyDeadline = performance.now() + 25000;
    for (let attempt = 0; attempt < 250 && performance.now() < readyDeadline; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `server starts: ${logs.slice(-500)}`);
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const firstSnapshot = nextMessage(ws, message => message.type === 'gameState');
    ws.send(JSON.stringify({ type: 'joinRoom', data: { name: 'QA', class: 'warrior', create: true, bots: false } }));
    const first = await firstSnapshot;
    assert.equal(first.data.players[0].weapons[0].type, 'aura');
    const unchanged = await nextMessage(ws, message => message.type === 'gameState');
    assert.equal(unchanged.data.players[0].weapons, undefined);
    const left = nextMessage(ws, message => message.type === 'leftRoom');
    ws.send(JSON.stringify({ type: 'leaveRoom' }));
    await left;
    const secondSnapshot = nextMessage(ws, message => message.type === 'gameState');
    ws.send(JSON.stringify({ type: 'joinRoom', data: { name: 'QA', class: 'mage', create: true, bots: false } }));
    const second = await secondSnapshot;
    assert.equal(second.data.players[0].class, 'mage');
    assert.equal(second.data.players[0].weapons[0].type, 'lightning');
    assert.notEqual(first.room, second.room);

    const duplicateJoin = nextMessage(ws, message => message.type === 'roomJoined' && message.roomId === second.room);
    ws.send(JSON.stringify({ type: 'joinRoom', data: { roomId: second.room, name: 'QA duplicate', class: 'warrior', bots: false } }));
    const duplicate = await duplicateJoin;
    assert.equal(duplicate.data.players.length, 1);
    assert.equal(duplicate.data.players[0].class, 'mage', 'same-room duplicate does not replace the current build');
    assert.equal(duplicate.data.players[0].id, second.data.players[0].id);

    const futureRooms = [];
    const trackRoom = raw => { const message = JSON.parse(raw.toString()); if (message.type === 'gameState') futureRooms.push(message.room); };
    const thirdSnapshot = nextMessage(ws, message => message.type === 'gameState' && message.room !== second.room);
    ws.send(JSON.stringify({ type: 'joinRoom', data: { name: 'QA direct', class: 'archer', create: true, bots: false } }));
    const third = await thirdSnapshot;
    assert.equal(third.data.players[0].class, 'archer');
    assert.notEqual(third.room, second.room);
    ws.on('message', trackRoom);
    await new Promise(resolve => setTimeout(resolve, 500));
    ws.off('message', trackRoom);
    assert.ok(futureRooms.length >= 3, 'new room continues its snapshot stream');
    assert.ok(futureRooms.every(id => id === third.room), 'the old room cannot keep sending ghost-player snapshots after a direct join');
  } finally {
    ws?.terminate();
    child.kill();
  }
});
