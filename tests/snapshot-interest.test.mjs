import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import { ServerMonster } from '../server/entities/monster.js';
import { ServerBullet } from '../server/entities/bullet.js';
import { ServerXpOrb } from '../server/entities/xpOrb.js';
import { ZONES } from '../shared/config/constants.js';
import { applyItem } from '../shared/systems/items.js';

const socket = id => ({ id, readyState: 1, bufferedAmount: 0, send() {} });
function fixture(id = 'INTEREST', ws = socket('observer')) {
  const room = new GameRoom(id, { bots: false });
  const player = room.addPlayer(ws, 'Observer', 'warrior');
  player.x = 0;
  player.y = 0;
  const monster = new ServerMonster(100.24, 100.36, 0, ZONES);
  monster.id = 'm_same';
  const bullet = new ServerBullet(200, 200, 4, 5, 10, player.id, 'fireball', 1.5, 0, 0, 0xff3300);
  bullet.id = 'b_same';
  const orb = new ServerXpOrb(300, 300, 25);
  orb.id = 'x_same';
  room.monsters = [monster];
  room.bullets = [bullet];
  room.xpOrbs = [orb];
  return { room, player, monster, bullet, orb };
}

function assertMetadata(state) {
  assert.ok(state.monsters[0].type);
  assert.ok(state.monsters[0].maxHp > 0);
  assert.ok(state.monsters[0].sz > 0);
  assert.equal(state.bullets[0].wtype, 'fireball');
  assert.equal(state.bullets[0].sz, 1.5);
  assert.equal(state.bullets[0].col, 0xff3300);
  assert.equal(state.xpOrbs[0].val, 25);
}

test('first visible snapshot contains construction metadata; subsequent snapshots contain live state', () => {
  const { room, player, monster, bullet, orb } = fixture();
  assertMetadata(room.buildStateForPlayer(player).data);
  monster.hp -= 3;
  monster.x = 120.36;
  bullet.x = 230.24;
  orb.y = 310.36;
  const state = room.buildStateForPlayer(player).data;
  assert.deepEqual(Object.keys(state.monsters[0]).sort(), ['hp', 'id', 'x', 'y']);
  assert.equal(state.monsters[0].hp, Math.round(monster.hp));
  assert.equal(state.monsters[0].x, 120.4);
  assert.deepEqual(Object.keys(state.bullets[0]).sort(), ['id', 'x', 'y']);
  assert.equal(state.bullets[0].x, 230.2);
  assert.deepEqual(Object.keys(state.xpOrbs[0]).sort(), ['id', 'x', 'y']);
  assert.equal(state.xpOrbs[0].y, 310.4);
});

test('entities exiting interest are removed and get full metadata when visible again', () => {
  const { room, player } = fixture();
  assertMetadata(room.buildStateForPlayer(player).data);
  player.x = 5000;
  const away = room.buildStateForPlayer(player).data;
  assert.deepEqual(away.monsters, []);
  assert.deepEqual(away.bullets, []);
  assert.deepEqual(away.xpOrbs, []);
  for (const set of player.ws._snapshotEntities.values()) assert.equal(set.size, 0);
  player.x = 0;
  assertMetadata(room.buildStateForPlayer(player).data);
});

test('each observer gets independent initial entity metadata', () => {
  const { room, player } = fixture();
  room.buildStateForPlayer(player);
  const second = room.addPlayer(socket('second'), 'Second', 'mage');
  second.x = 0; second.y = 0;
  assertMetadata(room.buildStateForPlayer(second).data);
  assert.equal(room.buildStateForPlayer(player).data.monsters[0].type, undefined);
});

test('same socket entering another room gets metadata even when entity IDs match', () => {
  const first = fixture('FIRST');
  first.room.buildStateForPlayer(first.player);
  const second = fixture('SECOND', first.player.ws);
  assertMetadata(second.room.buildStateForPlayer(second.player).data);
  assert.equal(second.player.ws._snapshotEntitiesRoom, 'SECOND');
});

test('reconnect clears interest metadata cache even if the supplied socket has old room state', () => {
  const { room, player, bullet } = fixture();
  bullet.ownerId = 'independent-enemy';
  room.buildStateForPlayer(player);
  const reusedSocket = player.ws;
  assert.equal(reusedSocket._snapshotEntities.get('monsters').size, 1);
  room.onPlayerDisconnect(player.id);
  assert.equal(room.reconnectPlayer(reusedSocket, player.id), player);
  assertMetadata(room.buildStateForPlayer(player).data);
});

test('changed sword and axe orientation remains in compact snapshots', () => {
  const { room, player, bullet } = fixture();
  const sword = new ServerBullet(10, 10, 0, 0, 10, player.id, 'sword');
  sword.angle = 0;
  const axe = new ServerBullet(20, 20, 2, 2, 10, player.id, 'axe');
  axe.angle = 0;
  room.bullets.push(sword, axe);
  room.buildStateForPlayer(player);
  sword.angle = 1.2;
  axe.angle = 2.4;
  const states = room.buildStateForPlayer(player).data.bullets;
  assert.equal(states.find(state => state.id === sword.id).angle, 1.2);
  assert.equal(states.find(state => state.id === axe.id).angle, 2.4);
  assert.equal(states.find(state => state.id === bullet.id).angle, undefined);
});

test('living players cannot request healing or invulnerability through respawn', () => {
  const { room, player } = fixture();
  player.hp = 1;
  player.invTimer = 0;
  const position = { x: player.x, y: player.y };
  assert.equal(room.respawnPlayer(player.id), null);
  assert.equal(player.hp, 1);
  assert.equal(player.invTimer, 0);
  assert.equal(player.x, position.x);
  assert.equal(player.y, position.y);
});

test('death respawn resets the build while preserving player identity and permanent bonuses', () => {
  const { room, player, bullet } = fixture();
  const ws = player.ws;
  const stats = room.getPermanentStats(player.id);
  Object.assign(stats, { hp: 15, speed: 12, dmg: 6, magnet: 20, regen: 1 });
  applyItem(player, { type: 'item', itemId: 'heart', stacks: 2 });
  player.weapons[1] = player.makeWeaponInstance('fireball');
  player.weapons[0].upgrades.dmg = 3;
  player.weapons[0].evolved = 'Old evolution';
  player.books[0] = player.makeBookInstance('speed');
  player.level = 12;
  player.damageBonus = 100;
  player.armor = 40;
  player.moveSpeedBonus = 50;
  player.pendingUpgrades = 3;
  player.upgradeCards = [{ upgradeKey: 'old' }];
  player.damageAccumulator = 10;
  player.hp = 0;
  room.queueInput(player.id, { keys: { KeyD: true } });
  const otherBullet = new ServerBullet(0, 0, 0, 0, 10, 'other', 'bow');
  room.bullets.push(otherBullet);
  room.buildStateForPlayer(player);
  const revision = player.equipmentRevision;
  assert.equal(room.respawnPlayer(player.id), player);
  assert.equal(player.ws, ws);
  assert.equal(room.players.get(player.id), player);
  assert.equal(player.level, 1);
  assert.equal(player.xp, 0);
  assert.deepEqual(player.items, {});
  assert.deepEqual(player.weapons.filter(Boolean).map(weapon => weapon.type), ['aura']);
  assert.deepEqual(player.weapons[0].upgrades, {});
  assert.equal(player.weapons[0].evolved, undefined);
  assert.ok(player.books.every(book => book === null));
  assert.equal(player.maxHp, 160);
  assert.equal(player.hp, 160);
  assert.equal(player.damageBonus, 10);
  assert.equal(player.armor, 4);
  assert.equal(player.moveSpeedBonus, 0);
  assert.ok(Math.abs(player.getFinalMoveSpeed() - 1.12) < 1e-9);
  assert.equal(player.magnetRange, 120);
  assert.equal(player.regen, 1);
  assert.equal(player.pendingUpgrades, 0);
  assert.equal(player.upgradeCards, null);
  assert.equal(player.damageAccumulator, 0);
  assert.equal(player.invTimer, 2);
  assert.ok(player.equipmentRevision > revision);
  assert.equal(room.inputQueue.has(player.id), false);
  assert.equal(room.bullets.includes(bullet), false);
  assert.deepEqual(room.bullets, [otherBullet]);
  const state = room.buildStateForPlayer(player).data.players.find(entity => entity.id === player.id);
  assert.equal(state.weapons[0].type, 'aura');
  assert.deepEqual(state.items, {});
});

test('client preserves entity appearance and identity when applying compact snapshots', async () => {
  const { makeGame } = await import('./harness.mjs');
  const game = await makeGame(84);
  await game.start('warrior', 'offline', 'Client', { solo: true, bots: false });
  for (const monster of game.monsters) monster.destroy();
  game.monsters.length = 0;
  const { room, player, monster, bullet, orb } = fixture();
  game.wsClient = { playerId: player.id };
  game.onlineMode = true;
  const first = room.buildStateForPlayer(player);
  game.handleServerState(first);
  const clientMonster = game.onlineMonsterMap.get(monster.id);
  const clientBullet = game.onlineBulletMap.get(bullet.id);
  const clientOrb = game.onlineXpOrbMap.get(orb.id);
  assert.ok(clientMonster && clientBullet && clientOrb);
  const appearance = { type: clientMonster.type, size: clientMonster.sz, bulletType: clientBullet.wtype, bulletSize: clientBullet.sz, color: clientBullet.col, value: clientOrb.val };
  monster.hp -= 7; monster.x += 10;
  bullet.x += 15;
  orb.x += 20;
  game.handleServerState(room.buildStateForPlayer(player));
  assert.equal(game.onlineMonsterMap.get(monster.id), clientMonster);
  assert.equal(game.onlineBulletMap.get(bullet.id), clientBullet);
  assert.equal(game.onlineXpOrbMap.get(orb.id), clientOrb);
  assert.deepEqual({ type: clientMonster.type, size: clientMonster.sz, bulletType: clientBullet.wtype, bulletSize: clientBullet.sz, color: clientBullet.col, value: clientOrb.val }, appearance);
  assert.equal(clientMonster.hp, Math.round(monster.hp));
  assert.equal(clientMonster.targetX, Math.round(monster.x * 10) / 10);
  assert.equal(clientBullet.targetX, bullet.x);
  assert.equal(clientOrb.targetX, orb.x);
  player.x = 5000;
  game.handleServerState(room.buildStateForPlayer(player));
  assert.equal(game.onlineMonsterMap.size, 0);
  assert.equal(game.onlineBulletMap.size, 0);
  assert.equal(game.onlineXpOrbMap.size, 0);
  player.x = 0;
  game.handleServerState(room.buildStateForPlayer(player));
  assert.notEqual(game.onlineMonsterMap.get(monster.id), clientMonster);
  assert.equal(game.onlineMonsterMap.get(monster.id).type, appearance.type);
  assert.equal(game.onlineBulletMap.get(bullet.id).wtype, 'fireball');
  assert.equal(game.onlineXpOrbMap.get(orb.id).val, 25);
  game.cleanup();
});
