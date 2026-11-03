import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './harness.mjs';
import { XpOrb } from '../js/entities/XpOrb.js';
import { getWorld } from '../shared/config/worlds.js';

test('solo portal requires both earned progression and presence at the central portal', async () => {
    const game = await makeGame(418);
    await game.start('archer', 'offline', 'QA', { solo: true });
    game.player.x = 0; game.player.y = 0;
    assert.equal(game.getPortalState().locked, true);
    assert.equal(game.travelWorld(1), false);
    game.xpOrbs.push(new XpOrb(0, 0, 6600, game.scene));
    game.updateWorld(.01);
    assert.ok(game.player.level >= 30);
    assert.equal(game.getPortalState().locked, false);
    game.player.y = 180;
    assert.equal(game.travelWorld(1), false, 'the unlock alone cannot teleport remotely');
    game.player.y = 0;
    const before = { level: game.player.level, xp: game.player.totalXp, hp: game.player.hp, weapon: game.player.weapons[0] };
    game.lootSystem.spawn(200, 200);
    assert.equal(game.travelWorld(1), true);
    assert.equal(game.worldId, 1);
    assert.equal(game.player.worldId, 1);
    assert.equal(game.player.level, before.level);
    assert.equal(game.player.totalXp, before.xp);
    assert.equal(game.player.hp, before.hp);
    assert.equal(game.player.weapons[0], before.weapon);
    assert.equal(game.worldTime, 0);
    assert.equal(game.lootSystem.chests.length, 0);
    assert.equal(game.bullets.length, 0);
    assert.equal(game.monsters.length, 0);
    assert.equal(game.getPortalState().requiredLevel, 60);
    assert.equal(game.getPortalState().locked, true);
    game.cleanup();
    assert.equal(game.scene.children.length, 0);
});

test('offline pause freezes movement, spawns, loot and world time', async () => {
    const game = await makeGame(419);
    await game.start('pyromancer', 'offline', 'QA', { solo: true });
    game.inputManager.keys.KeyD = true;
    game.paused = true;
    const before = { x: game.player.x, time: game.gameTime, worldTime: game.worldTime, monsters: game.monsters.length };
    game.update(2);
    assert.deepEqual({ x: game.player.x, time: game.gameTime, worldTime: game.worldTime, monsters: game.monsters.length }, before);
    game.paused = false;
    game.update(.05);
    assert.ok(game.player.x > before.x);
    assert.ok(game.worldTime > before.worldTime);
    game.cleanup();
});

test('online world change clears prior actors and accepts only server-selected world state', async () => {
    const game = await makeGame(420);
    await game.start('mage', 'offline', 'QA', { solo: true });
    game.onlineMode = true;
    game.lootSystem.spawn(10, 10);
    const player = game.player;
    game.handleWorldChanged({ worldId: 1, worldTime: 123, unlockedWorlds: [0, 1], x: 0, y: -180 });
    assert.equal(game.player, player);
    assert.equal(game.worldId, 1);
    assert.equal(game.worldMap.world, getWorld(1));
    assert.equal(game.worldTime, 123);
    assert.deepEqual(game.unlockedWorlds, [0, 1]);
    assert.equal(game.monsters.length, 0);
    assert.equal(game.lootSystem.chests.length, 0);
    assert.equal(game.player._firstServerSync, true);
    game.handleWorldChanged({ worldId: 500 });
    assert.equal(game.worldId, 1);
    game.cleanup();
});

test('a stale or invented upgrade card cannot bypass the currently offered choices', async () => {
    const game = await makeGame(421);
    await game.start('archer', 'offline', 'QA', { solo: true });
    game.pendingUpgrades = 1;
    const cards = game.update(.01);
    assert.equal(game.state, 'upgrade');
    assert.equal(cards, game.upgradeCards);
    assert.equal(game.applyUpgrade({ ...cards[0] }), false);
    assert.equal(game.pendingUpgrades, 1);
    assert.equal(game.applyUpgrade(cards[0]), true);
    assert.equal(game.state, 'playing');
    assert.equal(game.pendingUpgrades, 0);
    game.cleanup();
});

test('authoritative enemy archetypes and elite rims override local constructor randomness', async () => {
    const game = await makeGame(422);
    for (const elite of [false, true]) {
        Math.random = () => elite ? .99 : 0;
        const size = 45 * (elite ? 1.25 : 1);
        const monster = game.createMonsterFromState({ id: `frost-${elite}`, x: 0, y: 0, worldId: 1,
            archetypeId: 'glacier', isElite: elite, hp: 100, maxHp: 100, sz: size });
        assert.equal(monster.archetypeId, 'glacier');
        assert.equal(monster.worldId, 1);
        assert.equal(monster.isElite, elite);
        assert.equal(!!monster.glowRing, elite);
        assert.equal(monster.mesh.userData.baseScale, size);
        monster.destroy();
    }
    game.cleanup();
});
