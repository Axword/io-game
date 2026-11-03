import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import { ServerXpOrb } from '../server/entities/xpOrb.js';
import { weaponStat } from '../shared/utils/weaponStats.js';
import { applyBookStatsDelta } from '../shared/systems/bookStats.js';
import { WebSocketClient } from '../js/network/WebSocketClient.js';

test('browser input and upgrade messages use the server protocol envelope exactly once', () => {
  const sent = [];
  const client = new WebSocketClient();
  client.connected = true;
  client.playerId = 'qa-client';
  client.ws = { send(raw) { sent.push(JSON.parse(raw)); } };
  client.sendInput({ keys: { KeyD: true }, mouseX: 12, mouseY: 20, mouseClicked: false });
  assert.deepEqual(sent[0], { type: 'input', data: { keys: { KeyD: true }, mouseX: 12, mouseY: 20, mouseClicked: false } });
  client.sendUpgradeSelect('item_ember');
  assert.deepEqual(sent[1], { type: 'upgradeSelect', data: { upgradeKey: 'item_ember' } });
  client.sendUpgradeSelect('bow_damage_0', 42);
  assert.deepEqual(sent[2], { type: 'upgradeSelect', data: { upgradeKey: 'bow_damage_0', offerId: 42 } });
});

function roomWithPlayers(count = 2) {
  const room = new GameRoom('QANET', { bots: false });
  const messages = [];
  const players = Array.from({ length: count }, (_, i) => room.addPlayer({ id: `qa-${i}`, readyState: 1, bufferedAmount: 0, send(raw) { messages.push(JSON.parse(raw)); } }, `Player${i}`, 'archer'));
  return { room, players, messages };
}

test('movement is held between packets, then released after an input timeout', () => {
  const { room, players: [player] } = roomWithPlayers(1);
  player.x = 0; player.y = 0;
  room.queueInput(player.id, { keys: { KeyD: true }, mouseX: 0, mouseY: 0 });
  room.update(.05);
  const firstX = player.x;
  room.update(.05);
  assert.ok(player.x > firstX, 'holding a key survives the next tick without a new packet');
  for (let i = 0; i < 8; i++) room.update(.05);
  const stoppedX = player.x;
  room.update(.05);
  assert.equal(player.x, stoppedX, 'stale held inputs stop after 300ms');
});

test('equipment is sent on change and to each fresh socket, with backpressure protection', () => {
  const { room, players: [player], messages } = roomWithPlayers(1);
  room.broadcastState();
  assert.ok(messages[0].data.players[0].weapons, 'first snapshot includes equipment');
  room.broadcastState();
  assert.equal(messages[1].data.players[0].weapons, undefined, 'unchanged equipment is omitted');
  player.equipmentRevision = (player.equipmentRevision || 0) + 1;
  room.broadcastState();
  assert.ok(messages[2].data.players[0].weapons, 'equipment change invalidates cache');
  player.ws.bufferedAmount = 200 * 1024;
  room.broadcastState();
  assert.equal(messages.length, 3, 'slow clients do not accumulate stale snapshots');
  const fresh = [];
  player.ws = { id: player.id, readyState: 1, bufferedAmount: 0, send(raw) { fresh.push(JSON.parse(raw)); } };
  room.broadcastState();
  assert.ok(fresh[0].data.players[0].weapons, 'reconnected socket gets a complete loadout');
  assert.ok(fresh[0].data.players[0].finalMoveSpeed > 0, 'snapshot exposes authoritative final movement speed');
});

test('XP lifetime and ownership do not depend on the number of connected players', () => {
  const { room, players } = roomWithPlayers(8);
  for (let i = 0; i < players.length; i++) { players[i].x = 1000 + i * 100; players[i].y = 1000; }
  const orb = new ServerXpOrb(0, 0, 25);
  room.xpOrbs.push(orb);
  room.updateXpOrbs(.1);
  assert.ok(Math.abs(orb.life - 19.9) < .000001, 'one tenth second passes exactly once');
  players[0].x = 0; players[0].y = 0;
  players[1].x = 0; players[1].y = 0;
  const before = players.map(p => p.totalXp);
  room.updateXpOrbs(.1);
  assert.equal(players.reduce((sum, p, i) => sum + p.totalXp - before[i], 0), 25, 'overlapping players cannot duplicate pickup XP');
});

test('weapon multipliers preserve neutral attack speed and projectile count caps', () => {
  const weapon = { stats: { dmg: 10, bCnt: 1 }, upgrades: { dmg: 1.2, bCnt: 2 } };
  assert.equal(weaponStat(weapon, 'atkSpd', {}), 1);
  assert.equal(weaponStat(weapon, 'dmg', {}), 12);
  assert.equal(weaponStat(weapon, 'bCnt', {}), 3);
  weapon.upgrades.bCnt = 1000;
  assert.equal(weaponStat(weapon, 'bCnt', {}), 12);
});

test('reapplying a book replaces its previous contribution without exponential stacking', () => {
  const player = { baseHp: 100, maxHp: 100, hp: 100, moveSpeedBonus: 0, luck: 0 };
  const book = { level: 1, stats: { maxHp: .1, moveSpeed: .08, luck: 5 } };
  applyBookStatsDelta(player, book);
  assert.equal(player.maxHp, 110);
  applyBookStatsDelta(player, book);
  assert.equal(player.maxHp, 110, 'idempotent at same level');
  book.level = 2;
  applyBookStatsDelta(player, book);
  assert.equal(player.maxHp, 120);
  assert.equal(player.moveSpeedBonus, 16);
  assert.equal(player.luck, 10);
});
