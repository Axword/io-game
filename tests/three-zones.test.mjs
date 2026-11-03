import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLDS } from '../shared/config/worlds.js';
import { ZONES } from '../shared/config/constants.js';
import { getWorldZones } from '../shared/systems/worldRules.js';
import { configureWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { SpawnSystem as ClientSpawns } from '../js/systems/SpawnSystem.js';
import { SpawnSystem as ServerSpawns } from '../server/systems/SpawnSystem.js';
import { WorldMap } from '../js/core/WorldMap.js';
import { seededRandom } from './harness.mjs';

globalThis.THREE = THREE;

test('three map fills, two visible borders and combat share the unchanged arena bounds', () => {
    const scene = new THREE.Scene();
    const map = new WorldMap(scene);
    for (const world of WORLDS) {
        map.build(world.id);
        const zones = getWorldZones(world.id);
        assert.equal(world.bounds, 2800, 'reducing the zone count does not enlarge the map');
        assert.equal(zones.length, 3);
        assert.equal(map.zones, zones);
        assert.equal(new Set(zones.map(zone => zone.color)).size, 3, 'each zone has its own opaque ground color');
        assert.deepEqual(map.zoneBorders.map(border => border.radius), zones.slice(1).map(zone => zone.maxR));
        assert.equal(map.zoneMeshes[0].material.color.getHex(), zones[0].color);
        const bands = map.group.getObjectByName('world-zone-bands');
        assert.equal(bands.userData.zones, zones);
        assert.equal(bands.material.transparent, false, 'zone colors are visible fills rather than a faint overlay');
        assert.equal(map.zoneMeshes.length, 2, 'inner fills and borders share one static draw');
    }
    map.destroy();
    assert.equal(scene.children.length, 0);
});

test('a center player receives center-tier spawns even when the off-screen spawn ring lies in another zone', () => {
    for (const world of WORLDS) {
        const target = { x: 0, y: 0, hp: 100, worldId: world.id };
        const client = new ClientSpawns(ZONES, new THREE.Scene());
        client.reset({ solo: true, worldId: world.id });
        const server = new ServerSpawns(ZONES);
        server.worldId = world.id;
        for (const spawns of [client, server]) {
            const monsters = [];
            Math.random = seededRandom(501 + world.id);
            for (let attempt = 0; attempt < 20 && !monsters.length; attempt++) spawns.spawnMonster(monsters, [target]);
            assert.equal(monsters.length, 1);
            assert.equal(monsters[0].zoneId, 3, 'new attackers inherit the center encounter tier');
            assert.equal(monsters[0].zoneIdx, 0, 'the center retains the original strongest tier');
            monsters[0].destroy?.();
        }
    }
});

test('authoritative zone metadata reconstructs the same enemy appearance without resetting its tier', () => {
    for (const world of WORLDS) {
        const original = configureWorldEnemy({ x: 750, y: 0, isElite: false }, world.enemies[0], world.id, 0, { zoneAnchor: { x: 0, y: 0 } });
        const reconstructed = configureWorldEnemy({ x: original.x, y: original.y, isElite: false }, world.enemies[0], world.id, 0, { zoneId: original.zoneId });
        for (const key of ['zoneId', 'col', 'sz', 'hp', 'xp']) assert.equal(reconstructed[key], original[key]);
    }
});
