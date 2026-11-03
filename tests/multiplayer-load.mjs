import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { GameRoom } from '../server/gameRoom.js';
import { seededRandom } from './harness.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;
const classes = ['warrior', 'archer', 'mage', 'berserker', 'pyromancer', 'assassin', 'necromancer', 'paladin'];

export function soak() {
  Math.random = seededRandom(827);
  const room = new GameRoom('QASOAK', { difficulty: 'medium', bots: false });
  let bytes = 0, snapshots = 0, maxSnapshot = 0;
  const players = classes.map((classId, i) => {
    const socket = { id: `qa-${i}`, readyState: 1, bufferedAmount: 0, send(raw) { const message = JSON.parse(raw); if (message.type === 'gameState') { bytes += raw.length; snapshots++; maxSnapshot = Math.max(maxSnapshot, raw.length); } } };
    const player = room.addPlayer(socket, `QA${i}`, classId);
    // A crowded initial position deliberately stresses shared collisions.
    player.x = 320 + (i % 4) * 60;
    player.y = 280 + Math.floor(i / 4) * 60;
    return player;
  });
  room.start();
  const timings = [];
  const peaks = { monsters: 0, bullets: 0, orbs: 0, bosses: 0 };
  for (let tick = 0; tick < Number(process.env.QA_SOAK_SECONDS || 300) * 20; tick++) {
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      if (player.hp <= 0) room.respawnPlayer?.(player.id);
      if (player.pendingUpgrades && player.upgradeCards?.length) room.applyUpgradeChoice(player.id, player.upgradeCards[0].upgradeKey);
      const phase = tick / 75 + i * .25;
      room.queueInput(player.id, { keys: { KeyW: Math.sin(phase) > .35, KeyS: Math.sin(phase) < -.35, KeyA: Math.cos(phase) < -.35, KeyD: Math.cos(phase) > .35 }, mouseX: player.x, mouseY: player.y, mouseClicked: false });
    }
    const begin = performance.now();
    room.update(1 / 20);
    timings.push(performance.now() - begin);
    for (const [key, value] of Object.entries({ monsters: room.monsters.length, bullets: room.bullets.length, orbs: room.xpOrbs.length, bosses: room.bosses.length })) peaks[key] = Math.max(peaks[key], value);
    assert.ok(players.every(p => Number.isFinite(p.x + p.y + p.hp)), 'all simulated players remain finite');
  }
  const result = { seconds: room.gameTime, clients: players.length, p50TickMs: percentile(timings, .5), p95TickMs: percentile(timings, .95), p99TickMs: percentile(timings, .99), maxTickMs: Math.max(...timings), peaks, snapshots, bytes, maxSnapshotBytes: maxSnapshot, kBpsPerClient: bytes / 1024 / players.length / room.gameTime };
  assert.ok(result.p95TickMs < 45, `95th percentile tick ${result.p95TickMs.toFixed(1)}ms must fit 50ms simulation budget`);
  return result;
}

export async function networkLoad() {
  const port = Number(globalThis.process.env.QA_LOAD_PORT || 4184);
  const requestedClients = Number(globalThis.process.env.QA_CLIENTS || 8);
  const clientCount = Number.isInteger(requestedClients) ? Math.max(2, Math.min(12, requestedClients)) : 8;
  const clientClasses = Array.from({ length: clientCount }, (_, index) => classes[index % classes.length]);
  const process = spawn(globalThis.process.execPath, ['server/server.js'], { cwd: globalThis.process.cwd(), env: { ...globalThis.process.env, PORT: String(port) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  process.stdout.on('data', data => logs.push(String(data)));
  process.stderr.on('data', data => logs.push(String(data)));
  process.on('error', error => logs.push(`spawn: ${error.message}`));
  const sockets = [];
  try {
    let ready = false;
    const readyDeadline = performance.now() + 25000;
    for (let attempt = 0; attempt < 250 && performance.now() < readyDeadline; attempt++) {
      try { ready = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(750) })).ok; } catch (error) { if (attempt % 20 === 0) logs.push(`health: ${error.cause?.code || error.message}`); }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `server starts: ${logs.join('').slice(-1000)}`);
    const metrics = [];
    let roomId;
    for (let i = 0; i < clientClasses.length; i++) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      sockets.push(socket);
      const metric = { client: i, snapshots: 0, bytes: 0, maxBytes: 0, times: [], errors: [], playerId: null, maxVisiblePlayers: 0 };
      metrics.push(metric);
      const joined = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Join timeout')), 5000);
        socket.on('message', raw => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'connected') metric.playerId = msg.data.playerId;
          if (msg.type === 'roomJoined') { roomId = msg.roomId || msg.data.roomId; clearTimeout(timeout); resolve(); }
          if (msg.type === 'error') metric.errors.push(msg.data?.message);
          if (msg.type === 'playerDead') socket.send(JSON.stringify({ type: 'respawn' }));
          if (msg.type === 'upgradeOptions') { const card = msg.data?.cards?.[0]; if (card) socket.send(JSON.stringify({ type: 'upgradeSelect', data: { upgradeKey: card.upgradeKey } })); }
          if (msg.type === 'gameState') {
            metric.snapshots++; metric.bytes += raw.length; metric.maxBytes = Math.max(metric.maxBytes, raw.length); metric.times.push(performance.now());
            metric.maxVisiblePlayers = Math.max(metric.maxVisiblePlayers, msg.data.players?.length || 0);
          }
        });
        socket.on('error', reject);
      });
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      socket.send(JSON.stringify({ type: 'joinRoom', data: { name: `Load${i}`, class: clientClasses[i], maxPlayers: clientCount, difficulty: 'medium', bots: false, create: i === 0, roomId } }));
      await joined;
    }
    const duration = Number(globalThis.process.env.QA_NETWORK_SECONDS || 12);
    const start = performance.now();
    let inputTick = 0;
    while (performance.now() - start < duration * 1000) {
      for (const socket of sockets) socket.send(JSON.stringify({ type: 'input', data: { keys: { KeyD: inputTick % 100 < 50, KeyA: inputTick % 100 >= 50 }, mouseX: 0, mouseY: 0 } }));
      inputTick++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return metrics.map(m => {
      const gaps = m.times.slice(1).map((t, i) => t - m.times[i]);
      const result = { client: m.client, snapshots: m.snapshots, meanHz: m.snapshots / duration, p95GapMs: percentile(gaps, .95), maxGapMs: Math.max(...gaps), kBps: m.bytes / 1024 / duration, maxSnapshotBytes: m.maxBytes, visiblePlayers: m.maxVisiblePlayers, errors: m.errors };
      assert.ok(result.snapshots > duration * 6, 'snapshot stream continues for every client');
      assert.ok(result.p95GapMs < 300, 'snapshot cadence stays responsive');
      assert.equal(m.errors.length, 0, 'valid clients receive no protocol errors');
      assert.equal(result.visiblePlayers, clientCount, 'every player sees all participants');
      return result;
    });
  } finally {
    for (const socket of sockets) socket.terminate();
    process.kill();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = { soak: soak(), network: await networkLoad() };
  fs.mkdirSync('output/test-results', { recursive: true });
  fs.writeFileSync('output/test-results/multiplayer-load.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
