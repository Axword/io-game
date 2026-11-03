import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './harness.mjs';
import { ServerPlayer } from '../server/entities/player.js';

test('a server pickup describes its authoritative stacks after the chest opens, before a loadout snapshot', async () => {
    const game = await makeGame(1034);
    await game.start('archer', 'offline', 'QA', { solo: true });
    const shown = [];
    game.hud = new Proxy({ showReward: data => shown.push(data) }, { get: (target, key) => target[key] || (() => {}) });
    game.player.items.armor = 1;
    game.notifyLoot({ type: 'item', itemId: 'armor', stacks: 2, totalStacks: 3 }, game.lootSystem.openingDuration);
    game.updatePresentation(.4);
    assert.equal(shown.length, 0, 'the chest opening is allowed to finish first');
    game.updatePresentation(.43);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].title, 'Pancerna łuska ×2');
    assert.ok(shown[0].details.some(line => line.includes('14%')));
    assert.ok(shown[0].details.some(line => line.includes('3/5')));
    assert.equal(game.player.items.armor, 1, 'describing the event does not mutate authoritative gameplay');
    game.cleanup();
});

test('a genuine solo loot choice describes the received item, and world cleanup cancels pending notices', async () => {
    const game = await makeGame(1035);
    await game.start('mage', 'offline', 'QA', { solo: true });
    const shown = [];
    game.hud = new Proxy({ showReward: data => shown.push(data) }, { get: (target, key) => target[key] || (() => {}) });
    game.lootSystem.spawn(game.player.x, game.player.y, true);
    game.update(.01);
    game.update(1);
    assert.equal(game.state, 'loot');
    const card = game.lootCards[0];
    assert.equal(game.applyLoot(card), true);
    assert.equal(shown.length, 1);
    assert.ok(shown[0].title.startsWith(card.name));
    assert.ok(shown[0].description.length > 10);
    assert.ok(shown[0].details.some(line => line.includes('Zdobyta premia')));
    game.notifyLoot(card, 2);
    game.clearWorldActors();
    game.updatePresentation(3);
    assert.equal(shown.length, 1, 'a prior-world reward cannot appear after travel');
    game.cleanup();
});

test('online book descriptions receive authoritative base HP and remaining revives', async () => {
    const game = await makeGame(1036);
    const source = new ServerPlayer('book', 'Book', 'warrior', { hp: 45 });
    source.revives = 2;
    const full = source.toState(true);
    assert.equal(source.baseHp, 190, 'base HP includes the server permanent bonus');
    assert.equal(full.baseHp, source.baseHp);
    assert.equal(full.revives, 2);
    const client = { x: 0, y: 0, hp: 1, cls: 'warrior' };
    game.syncEntity(client, full);
    assert.equal(client.baseHp, source.baseHp);
    assert.equal(client.revives, 2);
    source.revives = 1;
    game.syncEntity(client, source.toState(false));
    assert.equal(client.revives, 1, 'remaining lives stay current between equipment updates');
    game.cleanup();
});
