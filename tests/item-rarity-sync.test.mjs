import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerPlayer } from '../server/entities/player.js';
import { GameRoom } from '../server/gameRoom.js';
import { applyItem, getItemPower } from '../shared/systems/items.js';
import { recordZoneEntry, hasEnteredZone } from '../shared/systems/zoneAggro.js';
import { makeGame } from './harness.mjs';

test('mixed item quality survives full and compact multiplayer snapshots without sharing server arrays', async () => {
    const source = new ServerPlayer('quality', 'Quality', 'mage');
    applyItem(source, { itemId: 'ember', stacks: 1, itemRarity: 'common' });
    applyItem(source, { itemId: 'ember', stacks: 1, itemRarity: 'legendary' });
    const state = source.toState(true);
    assert.deepEqual(state.itemRarities.ember, [1, 0, 0, 0, 1]);
    const game = await makeGame(1731);
    const client = { x: 0, y: 0, hp: 1, cls: 'mage' };
    game.syncEntity(client, state);
    assert.equal(getItemPower(client, 'ember'), 3);
    assert.equal(client.damageBonus, source.damageBonus);
    game.syncEntity(client, source.toState(false));
    assert.equal(getItemPower(client, 'ember'), 3, 'compact snapshots keep the last authoritative inventory');
    state.itemRarities.ember[0] = 5;
    assert.deepEqual(source.itemRarities.ember, [1, 0, 0, 0, 1]);
    assert.deepEqual(client.itemRarities.ember, [1, 0, 0, 0, 1]);
    game.cleanup();
});

test('an authoritative chest reports stack quality and same-object respawn clears quality and zone aggression', () => {
    const messages = [];
    const room = new GameRoom('QUALITY', { bots: false });
    const player = room.addPlayer({ id: 'quality', readyState: 1, bufferedAmount: 0,
        send(raw) { messages.push(JSON.parse(raw)); } }, 'Quality', 'mage');
    player.x = 1500; player.y = 0;
    recordZoneEntry(player);
    assert.equal(hasEnteredZone(player, 0, 2), true);
    room.nextChestTime = Infinity;
    room.spawnChest(player.x, player.y, true);
    const random = Math.random;
    try { Math.random = () => .99999999; room.updateChests(); }
    finally { Math.random = random; }
    const reward = messages.find(message => message.type === 'itemCollected').data;
    assert.equal(reward.itemRarity, 'legendary');
    assert.deepEqual(reward.totalItemRarities, [0, 0, 0, 0, 2]);
    assert.deepEqual(reward.totalItemRarities, player.itemRarities[reward.itemId]);
    player.hp = 0;
    assert.equal(room.respawnPlayer(player.id), player, 'combat systems keep the original player reference');
    assert.deepEqual(player.items, {});
    assert.deepEqual(player.itemRarities, {});
    assert.equal(hasEnteredZone(player, 0, 2), false);
});

test('book revives start a fresh aggression history in solo and on the server', async () => {
    const game = await makeGame(1732);
    await game.start('mage', 'offline', 'Quality', { solo: true });
    for (const player of [game.player, new ServerPlayer('revive', 'Revive', 'mage')]) {
        player.x = 1500; player.y = 0;
        recordZoneEntry(player);
        assert.equal(hasEnteredZone(player, 0, 2), true);
        player.x = 2300;
        player.hp = 0;
        player.revives = 1;
        assert.equal(player.tryRevive(), true);
        assert.equal(hasEnteredZone(player, 0, 2), false);
        assert.ok(player.hp > 0);
    }
    game.cleanup();
});
