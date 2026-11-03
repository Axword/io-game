import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLDS, getWorld } from '../shared/config/worlds.js';
import { xpNeededForLevel, unlockedWorldForLevel, canEnterWorld, isNearPortal, resolveWorldMovement, isWorldSpawnClear } from '../shared/systems/worldRules.js';
import { configureWorldEnemy, updateWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { WorldMap } from '../js/core/WorldMap.js';

test('three worlds have distinct layouts and nine distinct enemy behaviors', () => {
    assert.equal(WORLDS.length, 3);
    assert.deepEqual(WORLDS.map(world => world.unlockLevel), [1, 30, 60]);
    assert.equal(new Set(WORLDS.map(world => world.palette.ground)).size, 3);
    assert.equal(new Set(WORLDS.flatMap(world => world.enemies.map(enemy => enemy.id))).size, 9);
    assert.equal(new Set(WORLDS.flatMap(world => world.enemies.map(enemy => enemy.behavior))).size, 9);
    for (const world of WORLDS) {
        assert.ok(world.obstacles.every(obstacle => Math.hypot(obstacle.x, obstacle.y) - obstacle.r > 250), 'central spawn and portal remain clear');
        assert.ok(world.obstacles.every(obstacle => Math.max(Math.abs(obstacle.x), Math.abs(obstacle.y)) + obstacle.r < world.bounds), 'obstacles remain inside map');
    }
});

test('level gates open exactly at 30 and 60 and portal interaction stays local', () => {
    assert.equal(unlockedWorldForLevel(29), 0);
    assert.equal(unlockedWorldForLevel(30), 1);
    assert.equal(unlockedWorldForLevel(59), 1);
    assert.equal(unlockedWorldForLevel(60), 2);
    assert.equal(canEnterWorld({ hp: 1, level: 29 }, 1), false);
    assert.equal(canEnterWorld({ hp: 1, level: 30 }, 1), true);
    assert.equal(canEnterWorld({ hp: 1, level: 1, maxLevelReached: 60 }, 2), true, 'earned unlocks survive a fresh character');
    assert.equal(canEnterWorld({ hp: 0, level: 90 }, 2), false);
    assert.equal(canEnterWorld({ hp: 1, level: 90 }, 20), false);
    assert.equal(isNearPortal({ x: 0, y: 100 }), true);
    assert.equal(isNearPortal({ x: 0, y: 101 }), false);
    let total = 0;
    for (let level = 1; level < 30; level++) total += xpNeededForLevel(level);
    assert.equal(total, 6525, 'first gate is reachable without the previous exponential XP wall');
    assert.ok(xpNeededForLevel(90) < 4000);
    assert.ok(xpNeededForLevel(90) > 3000, 'late-game progression softens repeated level-up healing');
});

test('map collision resolves borders, obstacle centers and invalid coordinates finitely', () => {
    for (const world of WORLDS) {
        const outside = { x: Infinity, y: -10000 };
        resolveWorldMovement(outside, world.id, 22);
        assert.ok(Number.isFinite(outside.x + outside.y));
        assert.ok(Math.abs(outside.y) <= world.bounds - 22);
        for (const obstacle of world.obstacles) {
            const entity = { x: obstacle.x, y: obstacle.y };
            resolveWorldMovement(entity, world.id, 22);
            assert.ok(Math.hypot(entity.x - obstacle.x, entity.y - obstacle.y) >= obstacle.r + 21.99);
            assert.equal(isWorldSpawnClear(obstacle.x, obstacle.y, world.id), false);
        }
    }
});

test('every enemy archetype advances finite simulation and only attacks its own world', () => {
    for (const world of WORLDS) for (const archetype of world.enemies) {
        const enemy = configureWorldEnemy({ x: 580, y: -100, isElite: false }, archetype, world.id, .5);
        const shots = [];
        let warned = false;
        for (let frame = 0; frame < 600; frame++) {
            updateWorldEnemy(enemy, 1 / 60, [{ x: 0, y: 0, hp: 100, worldId: world.id }], shot => shots.push(shot));
            warned ||= !!enemy.telegraph;
            assert.ok(Number.isFinite(enemy.x + enemy.y + enemy.hp));
        }
        if (enemy.canShoot) { assert.ok(warned, archetype.id + ' visibly warns before firing'); assert.ok(shots.length > 0); }
        const wrong = configureWorldEnemy({ x: 300, y: 0, isElite: false }, archetype, world.id);
        updateWorldEnemy(wrong, .1, [{ x: 0, y: 0, hp: 100, worldId: (world.id + 1) % 3 }], () => assert.fail('cross-world shot'));
        assert.equal(wrong.hp, 0, 'unoccupied instance retires enemies instead of chasing another world');
    }
});

test('charger locks direction during its warning and its dash happens over simulation time', () => {
    const world = getWorld(2), archetype = world.enemies.find(enemy => enemy.behavior === 'charger');
    const enemy = configureWorldEnemy({ x: 300, y: 0, isElite: false }, archetype, 2);
    enemy.shootTimer = 0;
    updateWorldEnemy(enemy, 1 / 60, [{ x: 0, y: 0, hp: 100, worldId: 2 }]);
    const initial = { x: enemy.x, y: enemy.y, angle: enemy.telegraph.angle };
    updateWorldEnemy(enemy, .45, [{ x: 0, y: 300, hp: 100, worldId: 2 }]);
    assert.equal(enemy.x, initial.x);
    assert.equal(enemy.y, initial.y);
    assert.equal(enemy.telegraph.angle, initial.angle);
    updateWorldEnemy(enemy, .5, [{ x: 0, y: 300, hp: 100, worldId: 2 }]);
    assert.ok(enemy.dash);
    updateWorldEnemy(enemy, .1, [{ x: 0, y: 300, hp: 100, worldId: 2 }]);
    assert.ok(Math.hypot(enemy.x - initial.x, enemy.y - initial.y) < 100, 'dash is not an instant teleport');
});

test('map rebuilds and animations keep object count bounded and destroy their scene content', () => {
    globalThis.THREE = THREE;
    const scene = new THREE.Scene(), map = new WorldMap(scene);
    for (let cycle = 0; cycle < 6; cycle++) {
        map.build(cycle % 3);
        const count = map.group.children.length;
        assert.ok(count < 60);
        const geometries = new Set();
        map.group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
        assert.ok(geometries.size <= 12, 'repeated map props share shape geometry');
        map.setPortalState({ available: true, destination: (cycle + 1) % 3 });
        for (let frame = 0; frame < 200; frame++) map.update(1 / 60);
        assert.equal(map.group.children.length, count);
        assert.equal(scene.children.length, 1);
    }
    map.destroy();
    assert.equal(scene.children.length, 0);
});
