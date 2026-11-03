import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../server/gameRoom.js';
import { ServerBullet } from '../server/entities/bullet.js';
import { ServerXpOrb } from '../server/entities/xpOrb.js';
import { ServerPlayer } from '../server/entities/player.js';
import { ServerMonster } from '../server/entities/monster.js';
import { ZONES } from '../shared/config/constants.js';
import { WORLDS } from '../shared/config/worlds.js';
import { xpNeededForLevel } from '../shared/systems/worldRules.js';
import { GameCache } from '../server/gameCache.js';

function fixture() {
    const messages = [];
    const room = new GameRoom('WORLDS', { bots: false });
    const socket = id => ({ id, readyState: 1, bufferedAmount: 0, send(raw) { messages.push({ id, ...JSON.parse(raw) }); } });
    const first = room.addPlayer(socket('first'), 'First', 'archer');
    const second = room.addPlayer(socket('second'), 'Second', 'mage');
    room.state = 'playing';
    return { room, first, second, messages };
}

test('portal travel validates unlocks, proximity, life, target and cooldown on the server', () => {
    const { room, first } = fixture();
    first.x = 0; first.y = 0;
    assert.equal(room.travelWorld(first.id, 1), false);
    first.level = 30;
    first.maxLevelReached = 30;
    first.x = 101;
    assert.equal(room.travelWorld(first.id, 1), false);
    first.x = 0; first.hp = 0;
    assert.equal(room.travelWorld(first.id, 1), false);
    first.hp = first.maxHp;
    assert.equal(room.travelWorld(first.id, 1.5), false);
    assert.equal(room.travelWorld(first.id, 2), false);
    assert.equal(room.travelWorld(first.id, 1), true);
    assert.equal(first.worldId, 1);
    first.x = first.y = 0;
    assert.equal(room.travelWorld(first.id, 0), false);
    room.elapsedTime += 2;
    assert.equal(room.travelWorld(first.id, 0), true);
});

test('travel preserves the build and health and clears old projectiles and state caches', () => {
    const { room, first, messages } = fixture();
    first.level = 30; first.maxLevelReached = 30;
    first.x = first.y = 0;
    first.hp -= 10;
    first.items = { heart: 2, ember: 2 };
    const hp = first.hp, weapons = first.weapons, items = first.items;
    room.bullets.push(new ServerBullet(0, 0, 0, 0, 100, first.id, 'sword'));
    first.ws._snapshotEntitiesRoom = 'stale';
    assert.equal(room.travelWorld(first.id, 1), true);
    assert.equal(first.hp, hp);
    assert.equal(first.weapons, weapons);
    assert.equal(first.items, items);
    assert.equal(room.bullets.length, 0);
    assert.equal(first.x, 0);
    assert.equal(first.y, -180);
    assert.ok(first.invTimer > 0);
    assert.ok(messages.some(message => message.type === 'worldChanged' && message.data.worldId === 1));
    assert.equal(first.ws._snapshotEntitiesRoom, 'WORLDS/world/1');
});

test('holding E cannot chain travel and releasing it permits a later valid interaction', () => {
    const { room, first } = fixture();
    first.level = first.maxLevelReached = 60;
    first.x = first.y = 0;
    room.queueInput(first.id, { keys: { KeyE: true } });
    assert.equal(first.worldId, 1);
    room.elapsedTime += 3;
    first.x = first.y = 0;
    room.queueInput(first.id, { keys: { KeyE: true } });
    assert.equal(first.worldId, 1);
    room.queueInput(first.id, { keys: {} });
    room.queueInput(first.id, { keys: { KeyE: true } });
    assert.equal(first.worldId, 2);
});

test('a locked forward portal never silently travels backwards when E is pressed', () => {
    const { room, first } = fixture();
    first.level = first.maxLevelReached = 30;
    first.x = first.y = 0;
    room.travelWorld(first.id, 1);
    room.elapsedTime += 3;
    first.x = first.y = 0;
    room.queueInput(first.id, { keys: { KeyE: true } });
    assert.equal(first.worldId, 1, 'world1 portal points to locked world2 until LV60');
});

test('snapshots contain only players and actors from the observer world', () => {
    const { room, first, second } = fixture();
    first.level = first.maxLevelReached = 30;
    first.x = first.y = 0;
    room.travelWorld(first.id, 1);
    const ice = room.getWorldState(1);
    const rootState = room.buildStateForPlayer(second).data;
    const iceState = room.buildStateForPlayer(first).data;
    assert.equal(rootState.worldId, 0);
    assert.equal(iceState.worldId, 1);
    assert.deepEqual(rootState.players.map(player => player.id), [second.id]);
    assert.deepEqual(iceState.players.map(player => player.id), [first.id]);
    assert.ok(iceState.monsters.every(state => ice.monsters.some(monster => monster.id === state.id && monster.worldId === 1)));
    assert.ok(!rootState.monsters.some(monster => iceState.monsters.some(other => other.id === monster.id)));
    assert.notEqual(room.monsters, ice.monsters);
    assert.notEqual(room.bullets, ice.bullets);
    assert.notEqual(room.spawnSystem, ice.spawnSystem);
    assert.deepEqual(iceState.unlockedWorlds, [0, 1]);
});

test('projectiles, auras, XP, and chest pickups cannot reach another world', () => {
    const { room, first, second } = fixture();
    first.level = first.maxLevelReached = 30;
    first.x = first.y = 0;
    room.travelWorld(first.id, 1);
    first.x = second.x = 0; first.y = second.y = 0;
    first.invTimer = second.invTimer = 0;
    const ice = room.getWorldState(1);
    ice.monsters.length = 0;
    const bullet = new ServerBullet(0, 0, 0, 0, 1000, 'monster_test', 'wand', 2);
    bullet.ownerType = 'monster';
    room.bullets.push(bullet);
    const orb = new ServerXpOrb(0, 0, 25);
    room.xpOrbs.push(orb);
    room.spawnChest(0, 0);
    room.collisionSystem.checkBulletCollisions(room.bullets, [], room.worldPlayers(), [], []);
    room.updateXpOrbs(.05);
    room.updateChests();
    assert.equal(first.damageAccumulator, 0);
    assert.equal(first.totalXp, 0);
    assert.deepEqual(first.items, {});
    assert.ok(second.damageAccumulator > 0);
    assert.equal(second.totalXp, 25);
    assert.equal(Object.keys(second.items).length, 1);
});

test('each occupied world has an independent clock and inactive worlds remain asleep', () => {
    const { room, first } = fixture();
    const ice = room.getWorldState(1), ember = room.getWorldState(2);
    room.update(.05);
    assert.equal(room.gameTime, .05);
    assert.equal(ice.gameTime, 0);
    assert.equal(ember.gameTime, 0);
    first.level = first.maxLevelReached = 30;
    first.x = first.y = 0;
    room.travelWorld(first.id, 1);
    room.update(.05);
    assert.equal(room.gameTime, .1);
    assert.equal(ice.gameTime, .05);
    assert.equal(ember.gameTime, 0);
});

test('XP progression passes the old zone cap and records authoritative unlock history', () => {
    const player = new ServerPlayer('progress', 'Progress', 'archer');
    let xpTo30 = 0;
    for (let level = 1; level < 30; level++) xpTo30 += xpNeededForLevel(level);
    assert.equal(player.addXp(xpTo30, 4), 29);
    assert.equal(player.level, 30);
    assert.equal(player.maxLevelReached, 30);
    assert.equal(player.xpNeeded, xpNeededForLevel(30));
    const { room, first } = fixture();
    first.level = 30; first.maxLevelReached = 30;
    first.hp = 0;
    room.respawnPlayer(first.id);
    assert.equal(first.level, 1);
    assert.equal(first.maxLevelReached, 30);
    assert.deepEqual(room.unlockedWorlds(first), [0, 1]);
});

test('an emptied world releases its crowds and transient projectiles without resetting its clock', () => {
    const { room, first, second } = fixture();
    room.start();
    room.gameTime = 120;
    room.xpOrbs.push(new ServerXpOrb(0, 0, 10));
    room.bullets.push(new ServerBullet(0, 0, 1, 0, 1, 'enemy', 'wand'));
    room.spawnChest(0, 0);
    for (const player of [first, second]) {
        player.level = player.maxLevelReached = 30;
        player.x = player.y = 0;
        assert.equal(room.travelWorld(player.id, 1), true);
    }
    room.update(.05);
    assert.equal(room.monsters.length, 0);
    assert.equal(room.bullets.length, 0);
    assert.equal(room.xpOrbs.length, 0);
    assert.equal(room.gameTime, 120);
    assert.equal(room.chests.length, 1);
});

test('all world rosters and movement remain bounded with analog input', () => {
    const { room, first } = fixture();
    for (const world of WORLDS) {
        first.worldId = world.id;
        const arena = room.getWorldState(world.id);
        arena.spawnSystem.maxMonsters = 30;
        first.x = 0; first.y = -180;
        for (let i = 0; i < 100; i++) arena.spawnSystem.spawnMonster(arena.monsters, [first]);
        assert.ok(arena.monsters.length > 0);
        assert.ok(arena.monsters.every(monster => monster.worldId === world.id && world.enemies.some(enemy => enemy.id === monster.archetypeId)));
        first.x = world.bounds * 3;
        first.y = world.bounds * 3;
        first.updateMovement(1, { keys: {}, moveX: 100, moveY: 100 });
        assert.ok(Math.abs(first.x) <= world.bounds - 20);
        assert.ok(Math.abs(first.y) <= world.bounds - 20);
    }
    const slow = new ServerPlayer('slow', 'Slow', 'archer');
    const fast = new ServerPlayer('fast', 'Fast', 'archer');
    slow.updateMovement(.1, { keys: {}, moveX: .5, moveY: 0 });
    fast.updateMovement(.1, { keys: {}, moveX: 1, moveY: 0 });
    assert.equal(fast.x, slow.x * 2);
});

test('multiplayer new book and weapon offers have unique selectable authority keys', () => {
    const { room, first } = fixture();
    const random = Math.random;
    try {
        Math.random = () => 0;
        first.level = 2;
        const cards = room.upgradeSystem.generateUpgradeCards(first);
        assert.equal(new Set(cards.map(card => card.upgradeKey)).size, cards.length);
        assert.ok(cards.every(card => typeof card.upgradeKey === 'string' && card.upgradeKey.length > 0));
        const book = cards.find(card => card.type === 'newBook');
        assert.ok(book);
        first.pendingUpgrades = 1;
        first.upgradeCards = cards;
        room.applyUpgradeChoice(first.id, book.upgradeKey);
        assert.ok(first.books.some(owned => owned?.type === book.bookType));
        assert.equal(first.weapons.filter(Boolean).length, 1, 'choosing a book cannot select the other undefined-key new weapon');
    } finally { Math.random = random; }
});

test('configured room capacity and privacy are honored by joins and quick match', () => {
    const cache = new GameCache();
    const small = new GameRoom('SMALL', { maxPlayers: 2, bots: false });
    const privateRoom = new GameRoom('PRIVATE', { maxPlayers: 12, privacy: 'private', bots: false });
    const large = new GameRoom('LARGE', { maxPlayers: 12, bots: false });
    const socket = id => ({ id, readyState: 1, send() {} });
    for (let i = 0; i < 2; i++) assert.ok(small.addPlayer(socket(`s${i}`), `Small${i}`, 'archer'));
    assert.equal(small.addPlayer(socket('overflow'), 'Overflow', 'mage'), null);
    assert.equal(privateRoom.privacy, 'private');
    for (const room of [small, privateRoom, large]) cache.saveRoom(room.id, room);
    assert.equal(cache.findJoinableRoom(16), large, 'quick match skips private rooms and each configured full room');
    for (let i = 0; i < 12; i++) assert.ok(large.addPlayer(socket(`l${i}`), `Large${i}`, 'archer'));
    assert.equal(large.addPlayer(socket('overflow-large'), 'OverflowLarge', 'mage'), null);
    assert.equal(cache.findJoinableRoom(16), null);
    assert.equal(large.getWorldState(1).maxParticipants, 12);
    assert.equal(new GameRoom('BAD', { maxPlayers: 999 }).maxParticipants, 12);
    assert.equal(new GameRoom('BADLOW', { maxPlayers: -1 }).maxParticipants, 2);
});

test('server boss health scales to actual armed participants and world difficulty', () => {
    const { room, first, second } = fixture();
    first.x = 0; first.y = -180;
    second.x = 40; second.y = -180;
    const boss = room.spawnSystem.spawnBoss([], [first]);
    assert.ok(boss.maxHp >= 2000, 'a normal 250DPS archer must not erase the old 720HP boss in under three seconds');
    const partyBoss = room.spawnSystem.spawnBoss([], [first, second]);
    assert.ok(partyBoss.maxHp > boss.maxHp, 'a second armed participant contributes to encounter health');
    const ice = room.getWorldState(1);
    ice.spawnSystem.setDifficulty('hard');
    first.worldId = 1;
    const iceBoss = ice.spawnSystem.spawnBoss([], [first]);
    assert.ok(iceBoss.maxHp > boss.maxHp, 'hard-world encounters retain their higher floor and DPS multiplier');
});

test('distant players in the same world do not inflate another players boss encounter', () => {
    const { room, first, second } = fixture();
    const random = Math.random;
    try {
        Math.random = () => .2;
        first.x = 0; first.y = -180;
        second.x = second.y = 2600;
        const alone = room.spawnSystem.spawnBoss([], [first]);
        room.spawnSystem.bossIndex = 0;
        const distant = room.spawnSystem.spawnBoss([], [first, second]);
        assert.equal(distant.maxHp, alone.maxHp, 'a player outside the boss interest area is not part of the DPS budget');
        room.spawnSystem.bossIndex = 0;
        second.x = 40; second.y = -180;
        const nearby = room.spawnSystem.spawnBoss([], [first, second]);
        assert.ok(nearby.maxHp > alone.maxHp, 'nearby party members still increase encounter health');
    } finally { Math.random = random; }
});

test('a party splitting worlds immediately reallocates old crowds without dropping XP', () => {
    const { room, first } = fixture();
    room.monsters = Array.from({ length: 240 }, (_, index) => {
        const monster = new ServerMonster(900 + index * 2, -300, 4, ZONES);
        monster.worldId = 0;
        monster.update = () => {};
        return monster;
    });
    first.level = first.maxLevelReached = 30;
    first.x = first.y = 0;
    assert.equal(room.travelWorld(first.id, 1), true);
    room.update(.05);
    assert.ok(room.monsters.length <= room.spawnSystem.maxMonsters);
    assert.ok(room.monsters.length <= 64, 'one remaining human keeps at most the per-human active crowd');
    assert.equal(room.xpOrbs.length, 0, 'budget retirement grants no farming reward');
    assert.ok(Array.from(room.worlds.values()).reduce((count, world) => count + world.monsters.length, 0) <= 320);
});
