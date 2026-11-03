import test from 'node:test';
import assert from 'node:assert/strict';
import { WeaponSystem as ServerWeapons } from '../server/systems/WeaponSystem.js';
import { WeaponSystem as ClientWeapons } from '../js/systems/WeaponSystem.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { shouldRetireProjectile } from '../shared/systems/projectileBounds.js';

function volleys(Weapons, hz, client) {
    const player = { id: 'rate-test', cooldownReduction: 65, attackSpeedBonus: 200,
        weapons: [{ type: 'bow', timer: 0, stats: { ...WEAPONS.bow.stats }, upgrades: { atkSpd: 5 } }] };
    const system = new Weapons(null);
    let count = 0;
    system.fireBow = () => count++;
    const bullets = [];
    const multiplier = 1 / (1 - player.cooldownReduction / 100);
    for (let tick = 0; tick < hz * 10; tick++) {
        const weapon = player.weapons[0];
        if (weapon.timer > 0) weapon.timer -= multiplier / hz;
        if (client) system.fireWeapon(player, 0, null, [], bullets, [], player);
        else system.fireWeapon(player, 0, [], bullets, player.id);
    }
    return count;
}

test('late-game weapon cadence is capped and agrees at server and client frame rates', () => {
    const counts = [20, 30, 60, 120].map(hz => volleys(ServerWeapons, hz, false));
    const clientCounts = [20, 30, 60, 120].map(hz => volleys(ClientWeapons, hz, true));
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.ok(Math.max(...counts) <= 101, 'maximum ten volleys per second');
    assert.deepEqual(clientCounts, counts);
});

test('projectile retirement keeps useful combat range and preserves persistent weapon shapes', () => {
    const projectile = { wtype: 'bow', x: 600, y: 0 };
    assert.equal(shouldRetireProjectile(projectile, 0, { x: 0, y: 0 }), false);
    projectile.x = 1351;
    assert.equal(shouldRetireProjectile(projectile, 0, { x: 0, y: 0 }), true);
    projectile.x = 3000;
    assert.equal(shouldRetireProjectile(projectile, 0), true);
    for (const type of ['sword', 'laser', 'poison', 'meteor']) {
        assert.equal(shouldRetireProjectile({ ...projectile, wtype: type }, 0), false);
    }
});
