import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import { ServerPlayer } from '../server/entities/player.js';
import { UpgradeSystem as ServerUpgrades } from '../server/systems/UpgradeSystem.js';
import { UpgradeSystem as SoloUpgrades } from '../js/systems/UpgradeSystem.js';
import { XpOrb } from '../js/entities/XpOrb.js';
import { makeGame } from './harness.mjs';

function fixture() {
    const messages = [];
    const room = new GameRoom('UPGRADE-QUEUE', { bots: false });
    const socket = { id: 'upgrades', readyState: 1, bufferedAmount: 0, send(raw) { messages.push(JSON.parse(raw)); } };
    const player = room.addPlayer(socket, 'Upgrades', 'archer');
    room.state = 'playing';
    return { room, player, messages };
}

const damageCard = (player, duplicate = true) => ({
    type: 'weaponUpgrade', itemType: 'weapon', itemTypeId: player.weapons[0].type,
    itemRef: player.weapons[0], upgradeId: 'damage', upgradeType: { isAdditive: false },
    upgradeKey: 'damage-repeat', value: 20, isDuplicate: duplicate
});

test('server extra level-ups preserve the open offer and apply every queued choice cumulatively', () => {
    const { room, player, messages } = fixture();
    room.upgradeSystem.generateUpgradeCards = p => [damageCard(p)];
    room.handleLevelUp(player, 2);
    const originalCards = player.upgradeCards, originalId = player.upgradeOfferId;
    room.handleLevelUp(player, 3);
    assert.equal(player.pendingUpgrades, 5);
    assert.equal(player.upgradeCards, originalCards, 'earning XP while reading cannot reroll the open cards');
    assert.equal(player.upgradeOfferId, originalId);
    assert.equal(messages.at(-1).data.pendingUpgrades, 5);
    for (let selection = 1; selection <= 5; selection++) {
        assert.equal(room.applyUpgradeChoice(player.id, player.upgradeCards[0].upgradeKey, player.upgradeOfferId), true);
        assert.ok(Math.abs(player.weapons[0].upgrades.dmg - 1.2 ** selection) < 1e-12);
        assert.equal(player.pendingUpgrades, 5 - selection);
        assert.equal(messages.at(-1).data.pendingUpgrades, 5 - selection);
    }
    assert.equal(player.upgradeCards, null);
    assert.equal(messages.at(-1).type, 'upgradeDone');
    assert.equal(player.equipmentRevision, 5, 'one authoritative equipment revision per accepted choice');
});

test('late selections cannot consume a later offer even when both cards have the same upgrade key', () => {
    const { room, player } = fixture();
    room.upgradeSystem.generateUpgradeCards = p => [damageCard(p)];
    room.handleLevelUp(player, 3);
    const oldId = player.upgradeOfferId, key = player.upgradeCards[0].upgradeKey;
    assert.equal(room.applyUpgradeChoice(player.id, key, oldId), true);
    assert.notEqual(player.upgradeOfferId, oldId);
    assert.equal(room.applyUpgradeChoice(player.id, key, oldId), false);
    assert.equal(player.pendingUpgrades, 2);
    assert.equal(player.weapons[0].upgrades.dmg, 1.2);
    player.hp = 0;
    room.respawnPlayer(player.id);
    room.handleLevelUp(player, 1);
    assert.ok(player.upgradeOfferId > oldId);
    assert.equal(room.applyUpgradeChoice(player.id, key, oldId), false, 'old-life clicks cannot apply in the next life');
    assert.equal(player.pendingUpgrades, 1);
    assert.deepEqual(player.weapons[0].upgrades, {});
});

for (const [name, UpgradeSystem] of [['solo', SoloUpgrades], ['server', ServerUpgrades]]) {
    test(`${name} upgrades target the current owned instance and preserve earlier bonuses after inventory replacement`, () => {
        const player = new ServerPlayer('p', 'Player', 'archer');
        const upgrades = new UpgradeSystem({});
        const oldWeapon = player.weapons[0];
        const card = damageCard(player, false);
        const ownedWeapon = { ...oldWeapon, upgrades: { dmg: 1.5, bCnt: 2 }, appliedUpgrades: new Set() };
        player.weapons[0] = ownedWeapon;
        assert.equal(upgrades.applyUpgrade(card, player, {}), true);
        assert.ok(Math.abs(ownedWeapon.upgrades.dmg - 1.8) < 1e-12);
        assert.equal(ownedWeapon.upgrades.bCnt, 2);
        assert.deepEqual(oldWeapon.upgrades, {}, 'the detached reference is never upgraded');
        assert.equal(upgrades.applyUpgrade(card, player, {}), false, 'a duplicate selection cannot multiply the same normal upgrade twice');
        assert.ok(Math.abs(ownedWeapon.upgrades.dmg - 1.8) < 1e-12);

        player.books[0] = player.makeBookInstance('damage');
        upgrades.applyBookStats(player, 'damage');
        const oldBook = player.books[0];
        const bookCard = { type: 'bookUpgrade', itemTypeId: 'damage', itemRef: oldBook,
            upgradeKey: 'damage_bookPower', value: 20, upgradeType: { isAdditive: false } };
        player.books[0] = { ...oldBook, stats: { ...oldBook.stats }, appliedStats: { ...oldBook.appliedStats }, appliedUpgrades: new Set() };
        const before = player.damageBonus;
        assert.equal(upgrades.applyUpgrade(bookCard, player, {}), true);
        assert.equal(player.books[0].level, 2);
        assert.equal(oldBook.level, 1);
        assert.ok(player.damageBonus > before);
        const after = player.damageBonus;
        assert.equal(upgrades.applyUpgrade(bookCard, player, {}), false);
        assert.equal(player.damageBonus, after);
    });
}

test('real solo XP pickups queue level-ups without replacing offers or dropping selected bonuses', async () => {
    const game = await makeGame(1807);
    await game.start('archer', 'offline', 'Queue QA', { solo: true });
    game.upgradeSystem.generateUpgradeCards = p => [damageCard(p)];
    game.xpOrbs.push(new XpOrb(game.player.x, game.player.y, game.player.xpNeeded, game.scene));
    const first = game.update(.01);
    assert.equal(game.state, 'upgrade');
    game.xpOrbs.push(new XpOrb(game.player.x, game.player.y, game.player.xpNeeded, game.scene));
    game.update(.01);
    assert.equal(game.pendingUpgrades, 2);
    assert.equal(game.upgradeCards, first);
    assert.equal(game.applyUpgrade(first[0]), true);
    assert.equal(game.pendingUpgrades, 1);
    assert.equal(game.player.weapons[0].upgrades.dmg, 1.2);
    assert.equal(game.applyUpgrade(first[0]), false, 'the old offer cannot consume the next selection');
    assert.equal(game.applyUpgrade(game.upgradeCards[0]), true);
    assert.equal(game.pendingUpgrades, 0);
    assert.equal(game.player.weapons[0].upgrades.dmg, 1.44);
    assert.equal(game.state, 'playing');
    game.cleanup();
});

test('online selection waits for server queue counts and snapshots retain cumulative upgrades', async () => {
    const game = await makeGame(1808);
    const source = new ServerPlayer('p', 'Online', 'archer');
    game.player = source;
    game.onlineMode = true;
    const sent = [];
    game.wsClient = { sendUpgradeSelect: (...args) => { sent.push(args); return true; } };
    const cards = [damageCard(source)];
    game.handleServerUpgradeOptions({ data: { cards, pendingUpgrades: 2, offerId: 17 } });
    assert.equal(game.applyUpgrade(cards[0]), true);
    assert.equal(game.applyUpgrade(cards[0]), false);
    assert.deepEqual(sent, [['damage-repeat', 17]]);
    assert.equal(game.pendingUpgrades, 2, 'no optimistic decrement can be reset by another level-up event');
    game.handleServerUpgradeOptions({ data: { cards, pendingUpgrades: 3, offerId: 17 } });
    assert.equal(game.upgradeSelectionPending, true);
    assert.equal(game.upgradeCards, null, 'an in-flight offer cannot be reopened by more XP');
    const next = [damageCard(source)];
    game.handleServerUpgradeOptions({ data: { cards: next, pendingUpgrades: 2, offerId: 18 } });
    assert.equal(game.upgradeCards, next);
    assert.equal(game.upgradeSelectionPending, false);
    source.weapons[0].upgrades = { dmg: 1.44, bCnt: 2 };
    game.syncEntity(source, JSON.parse(JSON.stringify(source.toState(true))));
    assert.deepEqual(source.weapons[0].upgrades, { dmg: 1.44, bCnt: 2 });
    game.syncEntity(source, source.toState(false));
    assert.deepEqual(source.weapons[0].upgrades, { dmg: 1.44, bCnt: 2 }, 'compact snapshots cannot reset the build');
    game.handleServerUpgradeDone({ data: { pendingUpgrades: 0, offerId: 18 } });
    assert.equal(game.pendingUpgrades, 0);
    assert.equal(game.upgradeSelectionPending, false);
    assert.equal(game.state, 'playing');
    game.player = null;
    game.cleanup();
});
