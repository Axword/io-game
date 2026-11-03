import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../shared/config/weapons.js';
import { balancedBossHealth, estimatePlayerDps } from '../shared/systems/encounterBalance.js';

function build(type = 'bow') {
    return { hp: 100, cooldownReduction: 0, weapons: [{ type, stats: { ...WEAPONS[type].stats }, upgrades: {} }] };
}

test('boss health responds to the equipped build and the whole living party', () => {
    const starter = build();
    const advanced = build();
    advanced.weapons[0].upgrades.dmg = 8;
    advanced.weapons[0].upgrades.bCnt = 5;
    advanced.cooldownReduction = 50;
    assert.ok(balancedBossHealth(720, [advanced]) > balancedBossHealth(720, [starter]) * 5);
    assert.equal(balancedBossHealth(720, [starter, starter]), balancedBossHealth(720, [starter]) * 2);
    assert.equal(balancedBossHealth(720, [{ ...advanced, hp: 0 }]), 720);
    assert.equal(balancedBossHealth(5000, []), 5000);
});

test('boss estimate limits fire cadence and extreme health while covering every weapon', () => {
    for (const type of Object.keys(WEAPONS)) assert.ok(estimatePlayerDps(build(type)) > 0, type + ' contributes to encounter balance');
    const rapid = build();
    rapid.weapons[0].upgrades.atkSpd = 5;
    const first = estimatePlayerDps(rapid);
    rapid.cooldownReduction = 65;
    assert.equal(estimatePlayerDps(rapid), first, 'both builds already reach the shared ten-volley cap');
    rapid.weapons[0].upgrades.dmg = 1000000;
    assert.equal(balancedBossHealth(720, [rapid]), 3000000);
    assert.equal(balancedBossHealth(720, [rapid, rapid, rapid, rapid]), 12000000, 'party cap grows per living participant');
});
