import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeGame, seededRandom } from './harness.mjs';
import { ITEMS, EVOLUTIONS } from '../shared/config/items.js';
import { rollItemCards, applyItem, evolveWeapons } from '../shared/systems/items.js';

test('chest choices are unique, bounded, and give healing when every item is full', () => {
  const player = { items: { armor: 4 }, hp: 25, maxHp: 100, armor: 28 };
  const cards = rollItemCards(player, true, seededRandom(12));
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map(c => c.itemId)).size, 3);
  for (let i = 0; i < 10; i++) applyItem(player, { itemId: 'armor', stacks: 2 });
  assert.equal(player.items.armor, ITEMS.armor.max);
  assert.equal(player.armor, 35);
  assert.equal(applyItem(player, { itemId: 'missing' }), false);
  player.items = Object.fromEntries(Object.entries(ITEMS).map(([id, item]) => [id, item.max]));
  const [heal] = rollItemCards(player, true);
  assert.equal(heal.type, 'heal');
  applyItem(player, heal);
  assert.equal(player.hp, 55);
});

test('every weapon evolution requires its item pair and applies once', () => {
  for (const [type, recipe] of Object.entries(EVOLUTIONS)) {
    const weapon = { type, stats: { dmg: 20, range: 100, orbit: 70, width: 18, chain: 1, bCnt: 1, count: 1 } };
    const player = { level: 8, weapons: [weapon], items: { [recipe.item]: 1 } };
    assert.equal(evolveWeapons(player).length, 0);
    player.items[recipe.item] = 2;
    assert.equal(evolveWeapons(player).length, 1);
    const stats = { ...weapon.stats };
    assert.equal(evolveWeapons(player).length, 0);
    assert.deepEqual(weapon.stats, stats);
  }
});

test('boss warning spawns into the current boss collection after array replacement', async () => {
  const game = await makeGame(12);
  await game.start('archer', 'offline', 'QA', { solo: true, bots: false });
  const spawns = game.spawnSystem;
  spawns.update(.05, game.monsters, 90, game.bullets, game.scene, [game.player], game.bosses);
  assert.equal(spawns.bossWarnings.length, 1);
  game.bosses = game.bosses.filter(b => b.hp > 0);
  for (let i = 0; i < 55; i++) {
    spawns.update(.05, game.monsters, 90 + i * .05, game.bullets, game.scene, [game.player], game.bosses);
    game.bosses = game.bosses.filter(b => b.hp > 0);
  }
  assert.equal(game.bosses.length, 1);
  assert.equal(game.bosses[0].bossData.id, 'destroyer');
  assert.equal(spawns.bossWarnings.length, 0);
  game.cleanup();
});

test('boss attacks are telegraphed, simulation timed, and cancelled by cleanup', async () => {
  const game = await makeGame(19);
  const { Boss } = await import('../js/entities/Boss.js');
  const { BOSS_TYPES } = await import('../js/config/constants.js');
  for (const data of BOSS_TYPES) {
    const boss = new Boss(300, 0, data, game.scene);
    const bullets = [];
    const player = { hp: 100, x: 0, y: 0 };
    boss.useAbility(player);
    assert.ok(boss.attackState?.markers.length > 0);
    assert.equal(bullets.length, 0);
    boss.update(.4, [player], bullets, game.scene);
    assert.equal(bullets.length, 0);
    boss.destroy();
    boss.update(2, [player], bullets, game.scene);
    assert.equal(bullets.length, 0);
    assert.equal(boss.attackState, null);
  }
  game.cleanup();
});

test('bosses are real auto-fire targets and accept normal player damage', async () => {
  const game = await makeGame(22);
  await game.start('archer', 'offline', 'QA', { solo: true, bots: false });
  for (const monster of game.monsters) monster.destroy();
  game.monsters.length = 0;
  const { Boss } = await import('../js/entities/Boss.js');
  const { BOSS_TYPES } = await import('../js/config/constants.js');
  const boss = new Boss(game.player.x + 120, game.player.y, { ...BOSS_TYPES[0], hp: 200 }, game.scene);
  game.bosses.push(boss);
  for (let i = 0; i < 30; i++) {
    game.updatePlayer(1 / 30);
    game.bullets.forEach(b => b.update(1 / 30));
    game.updateCollisions(1 / 30);
  }
  assert.ok(boss.hp < boss.maxHp, 'auto aim includes boss collection');
  game.cleanup();
});

test('XP pickup at the exact player position stays finite', async () => {
  await makeGame();
  const { XpOrb } = await import('../js/entities/XpOrb.js');
  const orb = new XpOrb(0, 0, 10, new THREE.Scene());
  assert.equal(orb.update(.05, { x: 0, y: 0 }), true);
  assert.ok(Number.isFinite(orb.x + orb.y));
  orb.destroy();
});

test('restart clears old warnings, effects, items, chests and run progress', async () => {
  const game = await makeGame(34);
  await game.start('mage', 'offline', 'QA', { solo: true, bots: false });
  applyItem(game.player, { itemId: 'ember', stacks: 2 });
  game.runStats.bossesDefeated = 2;
  game.lootSystem.spawn(10, 10, true);
  game.spawnSystem.spawnBoss(game.bosses, [game.player]);
  assert.equal(game.spawnSystem.bossWarnings.length, 1);
  await game.start('mage', 'offline', 'QA', { solo: true, bots: false });
  assert.equal(game.runStats.bossesDefeated, 0);
  assert.equal(game.runStats.chestsOpened, 0);
  assert.deepEqual(game.player.items, {});
  assert.equal(game.lootSystem.chests.length, 0);
  assert.equal(game.spawnSystem.bossWarnings.length, 0);
  assert.equal(game.bosses.length, 0);
  assert.equal(game.bots.length, 0);
  game.cleanup();
  assert.equal(game.scene.children.length, 0);
});
