import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_RARITIES, ITEMS } from '../shared/config/items.js';
import { applyItem, getItemRarityCounts, getItemPower, rollItemRarity, rollItemCards } from '../shared/systems/items.js';
import { describeEquipment, describeLootReward } from '../js/ui/EquipmentDescriptions.js';

const player = () => ({ hp: 100, maxHp: 100, items: {}, armor: 0, cooldownReduction: 0 });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} equals ${expected}`);

test('five item qualities can drop, with better odds from boss chests and luck', () => {
    const samples = [.1, .8, .95, .995, .9995];
    assert.deepEqual(samples.map(value => rollItemRarity({}, false, () => value).key), ITEM_RARITIES.map(tier => tier.key));
    assert.equal(rollItemRarity({}, false, () => .7).key, 'common');
    assert.equal(rollItemRarity({}, true, () => .7).key, 'uncommon');
    assert.equal(rollItemRarity({ luck: 100 }, false, () => .7).key, 'uncommon');
    const cards = rollItemCards(player(), true, () => .9995);
    assert.equal(cards.length, 3);
    assert.ok(cards.every(card => card.itemRarity === 'legendary' && card.stacks === 2));
    const rolls = [.45, .9995, 0, 0, 0, 0];
    const damage = rollItemCards(player(), false, () => rolls.shift() ?? 0)[0];
    assert.equal(damage.itemId, 'ember');
    assert.match(damage.desc, /20%/);
});

test('common and legacy cards retain original effects even with an old cosmetic rarity ID', () => {
    for (const rarId of [undefined, 1, 2, 3]) {
        const p = player();
        assert.equal(applyItem(p, { type: 'item', itemId: 'armor', stacks: 2, rarId }), true);
        assert.equal(p.armor, 14);
        assert.deepEqual(p.itemRarities.armor, [2, 0, 0, 0, 0]);
        assert.equal(getItemPower(p, 'armor'), 2);
    }
});

test('mixed qualities only strengthen their acquired stacks and never reset earlier bonuses', () => {
    const p = player();
    applyItem(p, { itemId: 'armor', stacks: 1, itemRarity: 'common' });
    applyItem(p, { itemId: 'armor', stacks: 2, itemRarity: 'epic' });
    close(p.armor, 29.4);
    assert.equal(p.items.armor, 3);
    assert.deepEqual(p.itemRarities.armor, [1, 0, 0, 2, 0]);
    close(getItemPower(p, 'armor'), 4.2);
    const armorBeforeTooltip = p.armor;
    const info = describeEquipment('item', 'armor', {}, p);
    assert.equal(info.rarity, 'epic');
    assert.ok(info.details.includes('Rzadkości: ZWYKŁY ×1, EPICKI ×2'));
    assert.ok(info.details.includes('Łączna premia: +29,4% pancerza'));
    assert.equal(p.armor, armorBeforeTooltip, 'describing mixed stacks does not apply their power again');
});

test('stack cap applies across all qualities and excess copies do not grant stats', () => {
    const p = player();
    applyItem(p, { itemId: 'ember', stacks: 4 });
    applyItem(p, { itemId: 'ember', stacks: 3, itemRarity: 'legendary' });
    assert.equal(p.items.ember, 5);
    assert.equal(p.damageBonus, 60);
    assert.deepEqual(p.itemRarities.ember, [4, 0, 0, 0, 1]);
    assert.equal(applyItem(p, { itemId: 'ember', itemRarity: 'legendary' }), false);
    assert.equal(p.damageBonus, 60);
    assert.equal(rollItemCards(p, false, () => .5).some(card => card.itemId === 'ember'), false);
});

test('high-quality health stacks increase max HP and heal once by the same gained amount', () => {
    const p = player();
    applyItem(p, { itemId: 'heart', stacks: 1 });
    p.hp = 10;
    applyItem(p, { itemId: 'heart', stacks: 1, itemRarity: 'legendary' });
    assert.equal(p.maxHp, 154);
    assert.equal(p.hp, 46);
    assert.equal(p.regen, undefined);
    const reward = describeLootReward({ type: 'item', itemId: 'heart', stacks: 1, itemRarity: 'legendary', totalStacks: 2, totalItemRarities: [1, 0, 0, 0, 1] }, { items: { heart: 1 } });
    assert.equal(reward.rarity, 'legendary');
    assert.ok(reward.details.includes('Zdobyta premia: +36 maksymalnego HP'));
    assert.ok(reward.details.includes('Jednorazowe leczenie: do +36 HP'));
    assert.ok(reward.details.includes('Łączna premia: +54 maksymalnego HP'));
});

test('quality metadata survives JSON snapshots and reward reports before the inventory update', () => {
    const p = player();
    applyItem(p, { itemId: 'prism', stacks: 2 });
    applyItem(p, { itemId: 'prism', stacks: 1, itemRarity: 'rare' });
    const snapshot = JSON.parse(JSON.stringify({ items: p.items, itemRarities: p.itemRarities }));
    close(getItemPower(snapshot, 'prism'), 3.35);
    const oldPlayer = { items: { prism: 2 }, itemRarities: { prism: [2, 0, 0, 0, 0] } };
    const reward = describeLootReward({ type: 'item', itemId: 'prism', stacks: 1, itemRarity: 'rare', totalStacks: 3 }, oldPlayer);
    assert.ok(reward.details.includes('Zdobyta premia: +10,8% obszaru działania'));
    assert.ok(reward.details.includes('Łączna premia: +26,8% obszaru działania, +26,8% rozmiaru pocisków'));
    assert.deepEqual(oldPlayer.itemRarities.prism, [2, 0, 0, 0, 0]);
});

test('metadata is bounded and old inventory counts are interpreted as common', () => {
    assert.deepEqual(getItemRarityCounts({ items: { fang: 3 } }, 'fang'), [3, 0, 0, 0, 0]);
    assert.deepEqual(getItemRarityCounts({ items: { fang: 5 }, itemRarities: { fang: [0, 100, 100, 100, 100] } }, 'fang'), [0, 5, 0, 0, 0]);
    for (const itemId of ['missing', '__proto__', 'constructor']) assert.equal(applyItem(player(), { itemId }), false);
    assert.ok(Object.values(ITEMS).every(item => item.max === 5));
});
