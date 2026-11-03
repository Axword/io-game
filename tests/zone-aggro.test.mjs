import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLDS } from '../shared/config/worlds.js';
import { ZONES } from '../shared/config/constants.js';
import { configureWorldEnemy, updateWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { getWorldDanger, getWorldZones } from '../shared/systems/worldRules.js';
import { recordZoneEntry, hasEnteredZone, resetZoneAggro } from '../shared/systems/zoneAggro.js';
import { SpawnSystem as ClientSpawns } from '../js/systems/SpawnSystem.js';
import { SpawnSystem as ServerSpawns } from '../server/systems/SpawnSystem.js';

globalThis.THREE = THREE;
const player = (worldId = 0) => ({ x: 2100, y: 0, hp: 100, worldId });
const monster = (world, archetype = world.enemies[0], zoneId = 2) => configureWorldEnemy(
    { x: zoneId === 2 ? 1760 : 700, y: 0, isElite: false }, archetype, world.id, 0, { zoneId });

test('all deeper archetypes wander inside their band and cannot attack an unvisited outer player', () => {
    for (const world of WORLDS) for (const archetype of world.enemies) for (const zoneId of [2, 3]) {
        const enemy = monster(world, archetype, zoneId);
        const virgin = player(world.id);
        const start = { x: enemy.x, y: enemy.y };
        let shots = 0;
        enemy.shootTimer = 0;
        for (let frame = 0; frame < 600; frame++) {
            // Keep this observer in the outer band but inside the activity
            // radius as a randomly wandering center enemy changes direction.
            // Leaving every player's activity radius is a separate despawn rule.
            const angle = Math.atan2(enemy.y, enemy.x);
            const observerRadius = getWorldZones(world.id)[0].minR + 20;
            virgin.x = Math.cos(angle) * observerRadius;
            virgin.y = Math.sin(angle) * observerRadius;
            assert.equal(getWorldDanger(virgin.x, virgin.y, world.id).id, 1);
            assert.ok(Math.hypot(virgin.x - enemy.x, virgin.y - enemy.y) < 1900);
            updateWorldEnemy(enemy, 1 / 60, [virgin], () => shots++);
            assert.equal(getWorldDanger(enemy.x, enemy.y, world.id).id, zoneId, `${archetype.id}: idle stays home`);
            assert.equal(enemy.currentTarget, null);
            assert.equal(enemy.state, 'wandering');
        }
        assert.ok(Math.hypot(enemy.x - start.x, enemy.y - start.y) > 1, 'dormant enemies visibly walk');
        assert.equal(shots, 0, 'ranged and charging attacks remain inactive');
        assert.equal(enemy.hp, enemy.maxHp, 'idling never silently kills a nearby encounter');
    }
});

test('entering each deeper band activates its crowd for the rest of that life, including pursuit outside the band', () => {
    for (const world of WORLDS) for (const zoneId of [2, 3]) {
        const enemy = monster(world, world.enemies[0], zoneId);
        const visitor = player(world.id);
        visitor.x = zoneId === 2 ? 1800 : 850;
        updateWorldEnemy(enemy, 1 / 60, [visitor]);
        assert.equal(hasEnteredZone(visitor, world.id, zoneId), true);
        visitor.x = 2150;
        const hp = enemy.hp, xp = enemy.xp, dmg = enemy.dmg;
        for (let frame = 0; frame < 600; frame++) updateWorldEnemy(enemy, 1 / 60, [visitor]);
        assert.equal(enemy.currentTarget, visitor);
        assert.equal(enemy.state, 'attacking');
        assert.equal(enemy.outsideZoneTimer, 0, 'old three-second leash cannot erase entry aggression');
        assert.equal(getWorldDanger(enemy.x, enemy.y, world.id).id, 1, 'the pursuer can enter the outer band');
        assert.equal(enemy.hp, hp);
        assert.equal(enemy.xp, xp);
        assert.equal(enemy.dmg, dmg);
    }
});

test('multiplayer aggression belongs to the visitor and cannot switch onto a nearer innocent player', () => {
    const world = WORLDS[0];
    const enemy = monster(world);
    const visitor = player();
    visitor.x = 1750;
    recordZoneEntry(visitor);
    visitor.x = 2400;
    const innocent = player();
    innocent.x = 1920;
    updateWorldEnemy(enemy, .1, [innocent, visitor]);
    assert.equal(enemy.currentTarget, visitor);
    visitor.hp = 0;
    updateWorldEnemy(enemy, .1, [innocent, visitor]);
    assert.equal(enemy.currentTarget, null);
    assert.ok(['wandering', 'returning'].includes(enemy.state));
    assert.equal(enemy.hp, enemy.maxHp);
});

test('entry memory follows each world during one life and reset clears every world even on the same player object', () => {
    const visitor = player();
    for (const world of WORLDS) {
        visitor.worldId = world.id;
        visitor.x = 1600;
        recordZoneEntry(visitor);
        visitor.x = 2200;
        assert.equal(hasEnteredZone(visitor, world.id, 2), true);
        assert.equal(hasEnteredZone(visitor, world.id, 3), false);
    }
    visitor.worldId = 0;
    assert.equal(hasEnteredZone(visitor, 0, 2), true);
    resetZoneAggro(visitor);
    Object.assign(visitor, player());
    for (const world of WORLDS) {
        assert.equal(hasEnteredZone(visitor, world.id, 2), false);
        assert.equal(hasEnteredZone(visitor, world.id, 3), false);
    }
    visitor.x = 1700;
    recordZoneEntry(visitor);
    visitor.hp = 0;
    recordZoneEntry(visitor);
    visitor.hp = 100;
    visitor.x = 2200;
    assert.equal(hasEnteredZone(visitor, 0, 2), false, 'a recorded death also resets state');
});

test('both spawn loops remember entry even when no monster exists and do not share worlds or player lives', () => {
    for (const world of WORLDS) for (const platform of ['client', 'server']) {
        const scene = new THREE.Scene();
        const spawns = platform === 'client' ? new ClientSpawns(ZONES, scene) : new ServerSpawns(ZONES);
        if (platform === 'client') spawns.reset({ solo: true, worldId: world.id });
        else spawns.worldId = world.id;
        spawns.monsterSpawnTimer = spawns.bossSpawnTimer = Infinity;
        const visitor = player(world.id);
        visitor.x = 1600;
        if (platform === 'client') spawns.update(1 / 60, [], 0, [], scene, [visitor], []);
        else spawns.update(1 / 60, [], 0, [], [visitor], []);
        visitor.x = 2200;
        assert.equal(hasEnteredZone(visitor, world.id, 2), true);
        assert.equal(hasEnteredZone(player(world.id), world.id, 2), false);
        assert.equal(hasEnteredZone(visitor, (world.id + 1) % WORLDS.length, 2), false);
        const elsewhere = player((world.id + 1) % WORLDS.length);
        elsewhere.x = 1600;
        if (platform === 'client') spawns.update(1 / 60, [], 0, [], scene, [elsewhere], []);
        else spawns.update(1 / 60, [], 0, [], [elsewhere], []);
        assert.equal(hasEnteredZone(elsewhere, world.id, 2), false, 'another arena cannot record a visit here');
        spawns.clearWarnings?.();
    }
});

test('crowd separation cannot push dormant enemies through the visible boundary on either platform', () => {
    for (const world of WORLDS) for (const zoneId of [2, 3]) for (const platform of ['client', 'server']) {
        const scene = new THREE.Scene();
        const spawns = platform === 'client' ? new ClientSpawns(ZONES, scene) : new ServerSpawns(ZONES);
        if (platform === 'client') spawns.reset({ solo: true, worldId: world.id });
        else spawns.worldId = world.id;
        spawns.monsterSpawnTimer = spawns.bossSpawnTimer = Infinity;
        const crowd = Array.from({ length: 6 }, () => {
            const enemy = monster(world, world.enemies[0], zoneId);
            enemy.x = getWorldZones(world.id)[zoneId - 1].maxR - enemy.sz - .1;
            enemy.y = 0;
            enemy.updateVisuals = () => {};
            enemy.update = function(dt, targets) { updateWorldEnemy(this, dt, targets); };
            return enemy;
        });
        for (let frame = 0; frame < 40; frame++) {
            if (platform === 'client') spawns.update(0, crowd, 0, [], scene, [player(world.id)], []);
            else spawns.update(0, crowd, 0, [], [player(world.id)], []);
            for (const enemy of crowd) assert.equal(getWorldDanger(enemy.x, enemy.y, world.id).id, zoneId);
        }
        spawns.clearWarnings?.();
    }
});
