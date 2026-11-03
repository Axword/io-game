import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, seededRandom } from './harness.mjs';
import { Boss } from '../js/entities/Boss.js';
import { BOSS_TYPES } from '../js/config/constants.js';
import { SOLO_ENCOUNTERS } from '../js/config/encounters.js';
import { SpawnSystem as ServerSpawnSystem } from '../server/systems/SpawnSystem.js';
import { ServerBoss } from '../server/entities/boss.js';
import { CollisionSystem as ServerCollisions } from '../server/systems/CollisionSystem.js';
import { ZONES } from '../shared/config/constants.js';

async function solo(seed = 1) {
  const game = await makeGame(seed);
  await game.start('pyromancer', 'offline', 'QA', { solo: true, bots: false });
  return game;
}

test('delayed boss spawn uses the live collection after cleanup replaces arrays', async () => {
  const game = await solo();
  game.spawnSystem.spawnBoss(game.bosses, [game.player], BOSS_TYPES[0], SOLO_ENCOUNTERS[0]);
  const original = game.bosses;
  game.bosses = game.bosses.filter(boss => boss.hp > 0);
  game.spawnSystem.updateBossWarnings(2.6, game.bosses);
  assert.equal(original.length, 0);
  assert.equal(game.bosses.length, 1);
  assert.equal(game.bosses[0].encounterId, 'destroyer');
  assert.equal(game.spawnSystem.bossesSpawned, 1);
  game.cleanup();
});

test('reset removes pending warnings and cannot spawn a boss into a subsequent run', async () => {
  const game = await solo();
  game.spawnSystem.spawnBoss(game.bosses, [game.player], BOSS_TYPES[0], SOLO_ENCOUNTERS[0]);
  const meshes = game.spawnSystem.bossWarnings.map(warning => [warning.warning, warning.ring]).flat();
  game.spawnSystem.reset({ solo: true });
  game.spawnSystem.updateBossWarnings(10, game.bosses);
  assert.equal(game.bosses.length, 0);
  assert.equal(game.spawnSystem.bossWarnings.length, 0);
  for (const mesh of meshes) assert.equal(mesh.parent, null);
  assert.equal(game.spawnSystem.nextBossTime, 90);
  game.cleanup();
});

test('boss projectile attacks wait for the full warning and destruction cancels them', async () => {
  const game = await solo();
  const boss = new Boss(0, 0, { ...BOSS_TYPES[0], abilities: ['shockwave'] }, game.scene);
  const bullets = [];
  const target = { x: 100, y: 0, hp: 100 };
  boss.abilityTimer = 0;
  boss.update(0.01, [target], bullets, game.scene);
  boss.update(0.5, [target], bullets, game.scene);
  assert.equal(bullets.length, 0);
  assert.equal(boss.attackState.ability, 'shockwave');
  boss.update(0.51, [target], bullets, game.scene);
  assert.equal(bullets.length, 10);
  for (const bullet of bullets) bullet.destroy();
  boss.useAbility(target);
  const markers = boss.attackState.markers.slice();
  boss.destroy();
  boss.update(4, [target], bullets, game.scene);
  assert.equal(bullets.length, 10);
  assert.equal(boss.attackState, null);
  for (const marker of markers) assert.equal(marker.parent, null);
  game.cleanup();
});

test('boss charge locks its direction and moves over time after the warning', async () => {
  const game = await solo();
  const boss = new Boss(0, 0, { ...BOSS_TYPES[0], abilities: ['charge'] }, game.scene);
  const target = { x: 200, y: 0, hp: 100 };
  const bullets = [];
  boss.useAbility(target);
  target.x = 0;
  target.y = 200;
  boss.update(0.5, [target], bullets, game.scene);
  assert.equal(boss.x, 0);
  assert.equal(boss.y, 0);
  boss.update(0.51, [target], bullets, game.scene);
  assert.ok(boss.attackState.charging);
  boss.update(0.1, [target], bullets, game.scene);
  assert.ok(boss.x > 0 && boss.x <= 64.001);
  assert.equal(boss.y, 0);
  boss.destroy();
  game.cleanup();
});

test('server warning phase deals and receives no damage', () => {
  const boss = new ServerBoss(0, 0, BOSS_TYPES[0]);
  boss.spawnTimer = 2.5;
  const player = { x: 0, y: 0, hp: 100, takeDamage(amount) { this.hp -= amount; } };
  const bot = { ...player, hp: 100 };
  const collisions = new ServerCollisions();
  collisions.checkBossPlayerCollisions([boss], [player], 1);
  collisions.checkBossBotCollisions([boss], [bot], 1);
  boss.takeDamage(500, player);
  assert.equal(player.hp, 100);
  assert.equal(bot.hp, 100);
  assert.equal(boss.hp, boss.maxHp);
  boss.spawnTimer = 0;
  collisions.checkBossPlayerCollisions([boss], [player], 0.1);
  assert.ok(player.hp < 100);
});

test('server spawning recovers after deaths and distributes bounded waves across humans', () => {
  Math.random = seededRandom(83);
  const spawns = new ServerSpawnSystem(ZONES);
  let monsters = [];
  const bullets = [], bosses = [];
  spawns.update(10, monsters, 10, bullets, [], bosses);
  assert.equal(monsters.length, 0);
  const players = [
    { x: -1800, y: -1700, hp: 100 },
    { x: 1800, y: 1700, hp: 100 }
  ];
  for (let i = 0; i < 500; i++) {
    spawns.update(0.05, monsters, 10 + i * 0.05, bullets, players, bosses);
    monsters = monsters.filter(monster => monster.hp > 0);
  }
  assert.ok(monsters.length > 30);
  assert.ok(monsters.length <= 128);
  for (const player of players) assert.ok(monsters.some(monster => Math.hypot(monster.x - player.x, monster.y - player.y) < 1400));
  assert.ok(monsters.every(monster => Number.isFinite(monster.x + monster.y)));
  assert.ok(spawns.separationChecks < monsters.length * (monsters.length - 1) / 2);
});
