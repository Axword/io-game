import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { configureWorldEnemy } from '../shared/systems/enemyBehavior.js';
import { getWorldZones } from '../shared/systems/worldRules.js';
import { getWorld } from '../shared/config/worlds.js';
import { ZONES, DIFFICULTY_CONFIG } from '../shared/config/constants.js';
import { Monster } from '../js/entities/Monster.js';

globalThis.THREE = THREE;

// Reference values calculated from Monster.initMonster in revision f904605,
// before the world/campaign changes. These are fixed acceptance fixtures rather
// than values read from the new zone multipliers being checked.
const ORIGINAL = {
    damage: [12, 46, 126, 276, 560],
    xp: [15, 63, 182, 408, 840],
    speed: [.6, 1.6, 2, 2.4, 3],
    size: [12.95, 18.45, 26.4, 37.7, 55.5],
    eliteXp: [150, 630, 1820, 4080, 8400],
    eliteSpeed: [.75, 2, 2.5, 3, 3.75],
    eliteSize: [16.835, 23.985, 34.32, 49.01, 72.15],
    difficulties: [
        { name: 'easy', hpMultiplier: 1, normalHp: [30, 123, 350, 780, 1600], eliteHp: [150, 613, 1750, 3900, 8000] },
        { name: 'medium', hpMultiplier: 1.5, normalHp: [45, 184, 525, 1170, 2400], eliteHp: [225, 919, 2625, 5850, 12000] },
        { name: 'hard', hpMultiplier: 2, normalHp: [60, 245, 700, 1560, 3200], eliteHp: [300, 1225, 3500, 7800, 16000] },
        { name: 'extreme', hpMultiplier: 3, normalHp: [90, 368, 1050, 2340, 4800], eliteHp: [450, 1838, 5250, 11700, 24000] }
    ]
};
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} versus ${expected}`);

for (const difficulty of ORIGINAL.difficulties) for (const elite of [false, true]) {
    test(`three zones retain f904605 outer, middle and center ${difficulty.name} ${elite ? 'elite' : 'normal'} stats`, () => {
        assert.equal(DIFFICULTY_CONFIG[difficulty.name].hpMult, difficulty.hpMultiplier);
        const archetype = getWorld(0).enemies.find(enemy => enemy.id === 'mossling');
        assert.ok(archetype, 'the reference archetype remains available');
        for (const [index, zone] of getWorldZones(0).entries()) {
            const originalIndex = index * 2;
            const radius = index === 0 ? 2500 : (zone.minR + zone.maxR) / 2;
            for (const progress of [0, 1]) {
                const enemy = configureWorldEnemy({ x: radius, y: 0, isElite: elite }, archetype, 0, progress,
                    { hp: difficulty.hpMultiplier, damage: 1 });
                assert.equal(enemy.zoneId, index + 1);
                assert.equal(enemy.zoneIdx, 4 - originalIndex);
                assert.equal(enemy.maxHp, (elite ? difficulty.eliteHp : difficulty.normalHp)[originalIndex]);
                assert.equal(enemy.hp, enemy.maxHp);
                assert.equal(enemy.dmg, ORIGINAL.damage[originalIndex], 'difficulty and elite state never added a new damage multiplier');
                assert.equal(enemy.xp, (elite ? ORIGINAL.eliteXp : ORIGINAL.xp)[originalIndex]);
                close(enemy.spd, (elite ? ORIGINAL.eliteSpeed : ORIGINAL.speed)[originalIndex], 'movement speed');
                close(enemy.moveSpeed, (elite ? ORIGINAL.eliteSpeed : ORIGINAL.speed)[originalIndex] * 55, 'world-units movement speed');
                close(enemy.sz, (elite ? ORIGINAL.eliteSize : ORIGINAL.size)[originalIndex], 'body size');
            }
        }
    });
}

test('reference archetype agrees with the preserved legacy Monster initializer, including elite rounding', () => {
    const random = Math.random;
    try {
        for (const elite of [false, true]) for (const difficulty of ORIGINAL.difficulties) {
            Math.random = () => elite ? 0 : .99;
            for (let index = 0; index < 3; index++) {
                const scene = new THREE.Scene();
                const legacy = new Monster(0, 0, 4 - index * 2, ZONES, scene, difficulty.hpMultiplier);
                const updated = configureWorldEnemy({ x: 0, y: 0, isElite: elite }, getWorld(0).enemies[0], 0, .5,
                    { hp: difficulty.hpMultiplier, damage: 1, zoneId: index + 1 });
                for (const key of ['maxHp', 'hp', 'dmg', 'xp', 'spd', 'sz']) close(updated[key], legacy[key], key);
                legacy.destroy();
                assert.equal(scene.children.length, 0);
            }
        }
    } finally { Math.random = random; }
});
