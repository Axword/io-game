import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLDS } from '../shared/config/worlds.js';
import { ZONES } from '../shared/config/constants.js';
import { getWorldDanger, getWorldZones, getWorldZone, getWorldEdgeSpawn, isWorldSpawnClear } from '../shared/systems/worldRules.js';
import { configureWorldEnemy, updateWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { GameRoom } from '../server/gameRoom.js';
import { Monster } from '../js/entities/Monster.js';
import { ServerMonster } from '../server/entities/monster.js';

test('starts cover all four sides and remain clear of every world obstacle', () => {
    for (const world of WORLDS) {
        const sides = new Set();
        for (let sample = 0; sample < 128; sample++) {
            const point = getWorldEdgeSpawn(world.id, () => sample / 128);
            assert.ok(isWorldSpawnClear(point.x, point.y, world.id, 55));
            assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y)) >= world.bounds - 250);
            assert.equal(getWorldDanger(point.x, point.y, world.id).intensity, 0);
            sides.add(Math.abs(point.x) > Math.abs(point.y) ? (point.x < 0 ? 'left' : 'right') : (point.y < 0 ? 'bottom' : 'top'));
        }
        assert.equal(sides.size, 4);
        const first = getWorldEdgeSpawn(world.id, () => .1);
        const second = getWorldEdgeSpawn(world.id, () => .1, [{ ...first, hp: 100, worldId: world.id }].values());
        assert.ok(Math.hypot(second.x - first.x, second.y - first.y) >= 260, 'occupied candidates are skipped even when passed as an iterator');
    }
});

test('three wider zones preserve the original outer, middle and center tiers without enlarging any map', () => {
    for (const world of WORLDS) {
        const zones = getWorldZones(world.id);
        assert.equal(world.bounds, 2800);
        assert.deepEqual(zones.map(zone => zone.id), [1, 2, 3]);
        assert.deepEqual(zones.map(zone => zone.legacyZoneIdx), [4, 2, 0]);
        assert.deepEqual(zones.map(zone => zone.mScale), [1.5, 7, 20]);
        assert.deepEqual(zones.map(zone => zone.monsterSpeed), [.6, 2, 3]);
        for (const [index, zone] of zones.entries()) {
            const radius = index === 0 ? world.bounds - 240 : (zone.minR + zone.maxR) / 2;
            assert.equal(getWorldZone(radius, 0, world.id).id, zone.id);
            assert.equal(getWorldDanger(radius, 0, world.id), zone);
            if (index > 0) {
                assert.equal(getWorldZone(zone.maxR, 0, world.id).id, zone.id - 1, 'boundary matches the outer band');
                assert.equal(getWorldZone(zone.maxR - .01, 0, world.id).id, zone.id, 'crossing the visible border enters the stronger band');
                assert.ok(zone.mScale > zones[index - 1].mScale);
            }
        }
    }
});

test('all nine archetypes use identical solo/server strength and higher XP toward the center', () => {
    globalThis.THREE = THREE;
    for (const world of WORLDS) for (const archetype of world.enemies) {
        const edge = configureWorldEnemy({ x: world.bounds - 240, y: 0, isElite: false }, archetype, world.id, .5);
        const scene = new THREE.Scene();
        const solo = new Monster(0, 0, 0, ZONES, scene);
        const server = new ServerMonster(0, 0, 0, ZONES);
        solo.isElite = server.isElite = false;
        solo.configureArchetype(archetype, world.id, .5, { hp: 1.25, damage: 1.2 });
        configureWorldEnemy(server, archetype, world.id, .5, { hp: 1.25, damage: 1.2 });
        for (const key of ['hp', 'maxHp', 'dmg', 'moveSpeed', 'xp']) assert.equal(solo[key], server[key], `${archetype.id}:${key}`);
        assert.ok(server.maxHp > edge.maxHp);
        assert.ok(server.dmg > edge.dmg);
        assert.ok(server.xp > edge.xp);
        const center = configureWorldEnemy({ x: 0, y: 0, isElite: false }, archetype, world.id, .5);
        assert.ok(center.maxHp > edge.maxHp && center.dmg > edge.dmg && center.xp > edge.xp);
        solo.destroy();
    }
});

test('crossing a difficulty boundary cannot heal an enemy or reroll its reward', () => {
    for (const world of WORLDS) {
        const enemy = configureWorldEnemy({ x: world.bounds - 240, y: 0, isElite: false }, world.enemies[0], world.id, .5);
        enemy.hp /= 2;
        const original = { hp: enemy.hp, maxHp: enemy.maxHp, dmg: enemy.dmg, xp: enemy.xp };
        enemy.x = 0;
        for (let frame = 0; frame < 20; frame++) updateWorldEnemy(enemy, 1 / 60, [{ hp: 100, x: 100, y: 0, worldId: world.id }]);
        for (const key of Object.keys(original)) assert.equal(enemy[key], original[key]);
    }
});

test('authoritative joins, death respawns and portal arrivals use safe sides of each map', () => {
    const room = new GameRoom('EDGE', { bots: false });
    const socket = { id: 'side-player', readyState: 1, bufferedAmount: 0, send() {} };
    const player = room.addPlayer(socket, 'Side', 'archer');
    assert.ok(Math.max(Math.abs(player.x), Math.abs(player.y)) >= WORLDS[0].bounds - 250);
    assert.ok(player.invTimer > 0);
    for (const world of WORLDS) {
        player.worldId = world.id;
        player.level = player.maxLevelReached = 90;
        player.hp = 0;
        room.respawnPlayer(player.id);
        assert.equal(player.worldId, world.id);
        assert.equal(player.maxLevelReached, 90);
        assert.ok(isWorldSpawnClear(player.x, player.y, world.id, 55));
        assert.ok(Math.max(Math.abs(player.x), Math.abs(player.y)) >= world.bounds - 250);
    }
    for (const world of WORLDS) {
        player.x = player.y = 0;
        room.elapsedTime += 3;
        assert.equal(room.travelWorld(player.id, world.id), true);
        assert.ok(isWorldSpawnClear(player.x, player.y, world.id, 55));
        assert.ok(Math.max(Math.abs(player.x), Math.abs(player.y)) >= world.bounds - 250);
    }
});

test('item collection includes chest coordinates even after its authoritative removal', () => {
    const sent = [];
    const room = new GameRoom('CHEST', { bots: false });
    const player = room.addPlayer({ id: 'collector', readyState: 1, bufferedAmount: 0, send(raw) { sent.push(JSON.parse(raw)); } }, 'Collector', 'mage');
    room.nextChestTime = Infinity;
    room.spawnChest(player.x, player.y, true);
    const chest = { ...room.chests[0] };
    room.updateChests();
    const collected = sent.find(message => message.type === 'itemCollected');
    assert.equal(room.chests.length, 0);
    assert.deepEqual(collected.data.chest, { id: chest.id, x: chest.x, y: chest.y, rare: true });
    assert.ok(collected.data.item && collected.data.stacks > 0);
    assert.equal(collected.data.type, 'item');
    assert.ok(collected.data.itemId && collected.data.description);
    assert.equal(collected.data.totalStacks, player.items[collected.data.itemId]);
});
