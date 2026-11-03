import test from 'node:test';
import assert from 'node:assert/strict';
import { describeEquipment, describeLootReward } from '../js/ui/EquipmentDescriptions.js';
import { WEAPONS } from '../shared/config/weapons.js';
import { BOOKS } from '../shared/config/books.js';
import { ITEMS } from '../shared/config/items.js';

test('every weapon, book and item has a readable behavior and numeric effects', () => {
    for (const [kind, definitions] of [['weapon', WEAPONS], ['book', BOOKS], ['item', ITEMS]]) {
        for (const [id, definition] of Object.entries(definitions)) {
            const result = describeEquipment(kind, id, {}, { baseHp: 145 });
            assert.equal(result.title, definition.name);
            assert.ok(result.description.length > 20, `${kind}/${id} explains its behavior`);
            assert.ok(result.details.length >= 2, `${kind}/${id} exposes current values`);
            assert.ok(result.icon);
            assert.ok([result.title, result.description, ...result.details].every(line => typeof line === 'string' && !/<[^>]+>|NaN|Infinity|undefined/.test(line)));
        }
    }
});

test('laser shows damage per repeated hit and current bonuses rather than an incorrect DPS claim', () => {
    const weapon = { type: 'laser', stats: { ...WEAPONS.laser.stats }, upgrades: { dmg: 2, duration: 2, range: 1.5 } };
    const before = structuredClone(weapon);
    const result = describeEquipment('weapon', 'laser', weapon,
        { damageBonus: 50, rangeBonus: 10, areaBonus: 20, attackSpeedBonus: 100, cooldownReduction: 50 });
    assert.ok(result.details.includes('Obrażenia trafienia: 120 co 0,15 s'));
    assert.ok(result.details.includes('Zasięg: 693'));
    assert.ok(result.details.includes('Czas działania: 2 s'));
    assert.ok(result.details.includes('Odstęp ataków: 0,75 s'));
    assert.equal(result.details.some(line => line.includes('na sekundę')), false);
    assert.deepEqual(weapon, before, 'displaying a tooltip cannot change gameplay stats');
});

test('continuous aura, sword hits and capped volleys describe their real timing', () => {
    const aura = describeEquipment('weapon', 'aura', {}, { damageBonus: 50 });
    assert.ok(aura.details.includes('Obrażenia na sekundę: 18'));
    assert.equal(aura.details.some(line => line.startsWith('Odstęp ataków')), false);
    const knife = describeEquipment('weapon', 'knife', { upgrades: { bCnt: 1.5, atkSpd: 50 } }, { cooldownReduction: 65 });
    assert.ok(knife.details.includes('Pociski w salwie: 3'));
    assert.ok(knife.details.includes('Odstęp ataków: 0,1 s'), 'tooltip respects the shared ten-volley cap');
    const sword = describeEquipment('weapon', 'sword', { upgrades: { atkSpd: .5 } });
    assert.ok(sword.details.includes('Odstęp trafień: 0,4 s'));
    const manySwords = describeEquipment('weapon', 'sword', { upgrades: { count: 100 } });
    assert.ok(manySwords.details.includes('Ostrza: 4'), 'weapon-specific blade cap also applies to the description');
    const poison = describeEquipment('weapon', 'poison');
    assert.ok(poison.details.includes('Obrażenia trucizny: 13 co 0,15 s'));
    assert.ok(poison.details.includes('Po wyjściu z chmury: 8 HP/s przez 2 s'));
});

test('books show current power and level, including real base HP, fractions and spent revives', () => {
    const vitality = describeEquipment('book', 'vitality', { level: 3, stats: { maxHp: .2 } }, { baseHp: 200, cls: 'archer' });
    assert.ok(vitality.details.includes('+120 maksymalnego HP'), 'permanent HP is part of the same base used by book application');
    const critical = describeEquipment('book', 'critical', { level: 2, stats: { critChance: 3.125, critDamage: 10.5 } });
    assert.ok(critical.details.includes('+6,25% szansy na trafienie krytyczne'));
    assert.ok(critical.details.includes('+21% obrażeń krytycznych'));
    const regen = describeEquipment('book', 'regeneration', { level: 3, stats: { regen: .75 } });
    assert.ok(regen.details.includes('+2,25 HP na sekundę'));
    const revival = describeEquipment('book', 'revival', { level: 3, stats: { revives: 1.5 } }, { revives: 1 });
    assert.ok(revival.details.includes('Dodatkowe odrodzenia z księgi: 4'));
    assert.ok(revival.details.includes('Pozostało odrodzeń: 1'));
});

test('item descriptions separate per-stack and cumulative effects without inventing regeneration', () => {
    const armor = describeEquipment('item', 'armor', { stacks: 3 });
    assert.ok(armor.details.includes('Stosy: 3/5'));
    assert.ok(armor.details.includes('Na jeden stos: +7% pancerza'));
    assert.ok(armor.details.includes('Łączna premia: +21% pancerza'));
    const prism = describeEquipment('item', 'prism', {}, { items: { prism: 2 } });
    assert.ok(prism.details.includes('Łączna premia: +16% obszaru działania, +16% rozmiaru pocisków'));
    const heart = describeEquipment('item', 'heart', { stacks: 5 });
    assert.ok(heart.details.includes('Łączna premia: +90 maksymalnego HP'));
    assert.ok(heart.details.some(line => line.includes('jednorazowo leczy do 18 HP')));
    assert.equal(heart.details.some(line => line.includes('HP/s')), false);
});

test('loot summary separates newly gained stacks from authoritative owned total', () => {
    const heart = describeLootReward({ type: 'item', itemId: 'heart', stacks: 2, totalStacks: 5 }, { items: { heart: 3 } });
    assert.equal(heart.title, 'Żywy kryształ ×2');
    assert.ok(heart.details.includes('Zdobyta premia: +36 maksymalnego HP'));
    assert.ok(heart.details.includes('Jednorazowe leczenie: do +36 HP'));
    assert.ok(heart.details.includes('Masz teraz: 5/5 stosów'));
    assert.ok(heart.details.includes('Łączna premia: +90 maksymalnego HP'));
    const fang = describeLootReward({ type: 'item', itemId: 'fang', stacks: 1 }, { items: { fang: 3 } });
    assert.ok(fang.details.includes('Zdobyta premia: +4% szansy na trafienie krytyczne'));
    assert.ok(fang.details.includes('Zdobyta premia: +8% obrażeń krytycznych'));
    assert.ok(fang.details.includes('Łączna premia: +12% szansy na trafienie krytyczne, +24% obrażeń krytycznych'));
    const heal = describeLootReward({ type: 'heal' }, { hp: 190, maxHp: 200 });
    assert.equal(heal.description, 'Jednorazowo przywraca do 30% maksymalnego życia.');
    assert.deepEqual(heal.details, ['Leczenie: do +60 HP']);
});

test('unknown equipment and prototype property names do not produce misleading tooltips', () => {
    for (const kind of ['weapon', 'book', 'item', 'unknown']) for (const id of ['missing', '__proto__', 'constructor', 'toString']) {
        assert.equal(describeEquipment(kind, id), null);
    }
    assert.equal(describeLootReward({ type: 'item', itemId: 'missing' }), null);
    assert.equal(describeLootReward(null), null);
});
