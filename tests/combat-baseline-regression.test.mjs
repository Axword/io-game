import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeGame } from './harness.mjs';
import { Player } from '../js/entities/Player.js';
import { ServerPlayer } from '../server/entities/player.js';
import { CollisionSystem as ClientCollisions } from '../js/systems/CollisionSystem.js';
import { CollisionSystem as ServerCollisions } from '../server/systems/CollisionSystem.js';
import { WeaponSystem as ServerWeapons } from '../server/systems/WeaponSystem.js';
import { getWorld } from '../shared/config/worlds.js';
import { configureWorldEnemy, updateWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { xpNeededForLevel } from '../shared/systems/worldRules.js';

globalThis.THREE = THREE;
const input = { keys: {}, getMovementVector: () => ({ x: 0, y: 0 }), isKeyPressed: () => false };
const xpFor = level => Array.from({ length: level - 1 }, (_, i) => xpNeededForLevel(i + 1)).reduce((a,b) => a+b, 0);
const enemy = (zoneId, worldId = 0) => configureWorldEnemy({ x: 2500, y: 0, isElite: false },
    getWorld(worldId).enemies[0], worldId, 0, { hp: 1.5, damage: 1, zoneId });

function contactRun(platform, count, zoneId, hz = 60) {
    const scene = new THREE.Scene();
    const player = platform === 'client' ? new Player('archer', {}, scene) : new ServerPlayer('qa', 'QA', 'archer');
    player.addXp(xpFor(30), 0);
    const before = player.hp;
    const monsters = Array.from({ length: count }, () => ({ ...enemy(zoneId), x: player.x, y: player.y }));
    const collisions = platform === 'client' ? new ClientCollisions() : new ServerCollisions();
    for (let tick = 0; tick < hz && player.hp > 0; tick++) {
        collisions.checkMonsterPlayerCollisions(monsters, platform === 'client' ? player : [player], 1 / hz);
        if (platform === 'client') player.update(1 / hz, input, 0, [], [], null, null);
        else player.update(1 / hz, input);
    }
    const result = { before, hp: Math.max(0, player.hp), loss: before - Math.max(0, player.hp) };
    player.destroy?.();
    return result;
}

test('a level-30 player loses substantial HP to a crowd, and the original center kills a stationary player', () => {
    for (const platform of ['client', 'server']) for (const hz of [20,30,60,120]) {
        const single = contactRun(platform, 1, 1, hz);
        const crowd = contactRun(platform, 5, 1, hz);
        const center = contactRun(platform, 5, 3, hz);
        assert.ok(Math.abs(single.loss - 30) < 1e-6, `${platform}/${hz}: original outer contact DPS`);
        assert.ok(Math.abs(crowd.loss - 330) < 1e-6, `${platform}/${hz}: every overlapping enemy contributes`);
        assert.ok(crowd.loss / crowd.before > .8, 'standing in five mobs is dangerous even at level 30');
        assert.equal(center.hp, 0, 'the center is not a safe farming spot');
    }
});

test('player growth and outer farming retain the original rules instead of repeated cheap level-up healing', () => {
    for (const platform of ['client', 'server']) {
        const scene = new THREE.Scene();
        const p = platform === 'client' ? new Player('archer', {}, scene) : new ServerPlayer('qa', 'QA', 'archer');
        p.addXp(xpFor(10), 0);
        assert.equal(p.level, 10);
        assert.equal(p.maxHp, 182, 'the existing +10 HP per level is preserved');
        p.takeDamage(50);
        if (platform === 'client') p.update(.01, input, 0, [], [], null, null); else p.update(.01, input);
        const hp = p.hp;
        assert.equal(p.addXp(100000, 4), 0);
        assert.equal(p.hp, hp, 'low-tier farming cannot repeatedly heal a high-level player');
        assert.equal(p.addXp(p.xpNeeded, 3), 1);
        assert.equal(p.hp, hp + 25, 'the original heal remains available after a legitimately earned level');
        p.destroy?.();
    }
});

test('a stock laser keeps its original strength but cannot one-shot a center enemy on any update rate', async () => {
    const random = Math.random;
    try {
        for (const hz of [20,30,60,120]) {
            const game = await makeGame(917);
            await game.start('warlock', 'offline', 'Laser QA', { solo: true });
            Math.random = () => .99;
            const player = game.player;
            const target = { ...enemy(3), x: player.x + 120, y: player.y,
                takeDamage(amount) { this.hp -= amount; } };
            const before = target.hp;
            const bullets = [];
            game.weaponSystem.fireLaser(player, player.weapons[0], [target], bullets, player);
            for (let tick = 0; tick < hz; tick++) {
                for (const b of bullets) b.update(1 / hz);
                game.collisionSystem.checkBulletCollisions(bullets, [target], player, [], []);
                if (tick === 0) assert.ok(target.hp > before * .95, 'first contact is not a full-health kill');
            }
            const clientLoss = before - target.hp;
            assert.ok(clientLoss >= 160 && clientLoss <= 400, `original beam damage stays bounded: ${clientLoss}`);
            assert.ok(target.hp > before * .8, 'an unupgraded beam cannot erase a central enemy');
            const serverPlayer = new ServerPlayer('laser', 'Laser', 'warlock');
            const serverTarget = { ...enemy(3), x: 120, y: 0, takeDamage(amount) { this.hp -= amount; } };
            const serverBullets = [];
            const weapons = new ServerWeapons(), collisions = new ServerCollisions();
            weapons.fireLaser(serverPlayer, serverPlayer.weapons[0], [serverTarget], serverBullets, serverPlayer.id);
            for (const b of serverBullets) b.ownerEntity = serverPlayer;
            for (let tick = 0; tick < hz; tick++) {
                for (const b of serverBullets) b.update(1 / hz);
                collisions.checkBulletCollisions(serverBullets, [serverTarget], [serverPlayer], [], []);
            }
            assert.ok(Math.abs(before - serverTarget.hp - clientLoss) < 1e-6, 'multiplayer and solo apply the same beam damage');
            for (const b of bullets) b.destroy();
            game.cleanup();
        }
    } finally { Math.random = random; }
});

test('old weak enemies stop chasing into stronger zones, without healing or changing their XP', () => {
    const m = enemy(1);
    m.x = 2250;
    m.hp /= 2;
    const stats = { hp: m.hp, maxHp: m.maxHp, xp: m.xp, dmg: m.dmg };
    for (let i = 0; i < 32; i++) updateWorldEnemy(m, .1, [{ x: 1800, y: 0, hp: 100, worldId: 0 }]);
    assert.equal(m.state, 'returning');
    for (const [key, value] of Object.entries(stats)) assert.equal(m[key], value);
    for (let i = 0; i < 55; i++) updateWorldEnemy(m, .1, [{ x: 1800, y: 0, hp: 100, worldId: 0 }]);
    assert.equal(m.isDespawning, true);
    assert.equal(m.hp, 0);
});
