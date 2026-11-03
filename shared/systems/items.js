import { ITEMS, EVOLUTIONS, ITEM_RARITIES } from '../config/items.js';

const definition = id => typeof id === 'string' && Object.hasOwn(ITEMS, id) ? ITEMS[id] : null;
const stackCount = (value, max = 5) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : 0;
const sample = random => Math.max(0, Math.min(.999999999, Number(random()) || 0));

export function getItemRarity(key) {
    return ITEM_RARITIES.find(rarity => rarity.key === key || rarity.id === key) || ITEM_RARITIES[0];
}

// The fixed five-count vector is deliberately bounded and JSON serializable.
// Missing entries are old common stacks, never retroactively promoted.
export function getItemRarityCounts(player, itemId, countOverride) {
    const item = definition(itemId);
    const total = stackCount(countOverride ?? player?.items?.[itemId], item?.max || 5);
    const saved = player?.itemRarities?.[itemId];
    let remaining = total;
    const counts = ITEM_RARITIES.map((rarity, index) => {
        const count = Array.isArray(saved) ? Math.min(remaining, stackCount(saved[index])) : 0;
        remaining -= count;
        return count;
    });
    counts[0] += remaining;
    return counts;
}

export function getItemPower(player, itemId, countOverride) {
    return getItemRarityCounts(player, itemId, countOverride).reduce((sum, count, index) => sum + count * ITEM_RARITIES[index].power, 0);
}

export function rollItemRarity(player, rare = false, random = Math.random) {
    const luck = Math.max(0, Math.min(100, Number(player?.luck) || 0));
    const weights = ITEM_RARITIES.map(rarity => (rare ? rarity.rareWeight : rarity.weight) * (1 + rarity.id * luck / 200));
    let roll = sample(random) * weights.reduce((sum, weight) => sum + weight, 0);
    for (const rarity of ITEM_RARITIES) {
        roll -= weights[rarity.id];
        if (roll <= 0) return rarity;
    }
    return ITEM_RARITIES.at(-1);
}

function itemDescription(item, power) {
    const number = value => new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value);
    const effects = {
        magnetRange: value => `+${number(value)} zasięgu zbierania`,
        luck: value => `+${number(value)} szczęścia`,
        armor: value => `+${number(value)}% pancerza`,
        damageBonus: value => `+${number(value)}% obrażeń`,
        cooldownReduction: value => `−${number(value)}% czasu odnowienia`,
        maxHp: value => `+${number(value)} maks. HP i ${number(value)} leczenia`,
        areaBonus: value => `+${number(value)}% obszaru`,
        projectileSizeBonus: value => `+${number(value)}% rozmiaru pocisków`,
        critChance: value => `+${number(value)}% szansy krytyka`,
        critDamage: value => `+${number(value)}% obrażeń krytycznych`
    };
    return Object.entries(item.stats).map(([stat, value]) => effects[stat](value * power)).join(', ');
}

export function rollItemCards(player, rare = false, random = Math.random) {
    const available = Object.entries(ITEMS).filter(([id, item]) => (player.items?.[id] || 0) < item.max);
    const cards = [];
    while (available.length && cards.length < 3) {
        const total = available.reduce((sum, [, item]) => sum + item.weight, 0);
        let roll = random() * total;
        let index = available.length - 1;
        for (let i = 0; i < available.length; i++) {
            roll -= available[i][1].weight;
            if (roll <= 0) { index = i; break; }
        }
        const [id, item] = available.splice(index, 1)[0];
        const stacks = Math.min(rare ? 2 : 1, item.max - (player.items?.[id] || 0));
        const rarity = rollItemRarity(player, rare, random);
        cards.push({ type: 'item', itemId: id, icon: id, name: item.name, desc: itemDescription(item, rarity.power),
            stacks, itemRarity: rarity.key, rarId: [0, 1, 2, 2, 3][rarity.id], val: `×${stacks}`, wname: 'Przedmiot', upgradeKey: `item_${id}` });
    }
    if (!cards.length) cards.push({ type: 'heal', name: 'Odnowa', icon: 'heart', desc: 'Przywraca 30% maks. HP', rarId: 1, val: '+30% HP', upgradeKey: 'item_heal' });
    return cards;
}

export function applyItem(player, card) {
    if (!player || !card) return false;
    if (card.type === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
        return true;
    }
    const item = definition(card.itemId);
    if (!item) return false;
    player.items ??= {};
    const count = stackCount(player.items[card.itemId], item.max);
    const added = Math.min(Math.max(1, stackCount(card.stacks)), item.max - count);
    if (added <= 0) return false;
    const rarity = getItemRarity(card.itemRarity);
    const counts = getItemRarityCounts(player, card.itemId, count);
    counts[rarity.id] += added;
    player.itemRarities ??= {};
    player.itemRarities[card.itemId] = counts;
    player.items[card.itemId] = count + added;
    for (const [stat, value] of Object.entries(item.stats)) player[stat] = (player[stat] || 0) + value * added * rarity.power;
    if (card.itemId === 'heart') player.hp = Math.min(player.maxHp, player.hp + item.stats.maxHp * added * rarity.power);
    player.cooldownReduction = Math.min(65, player.cooldownReduction || 0);
    player.armor = Math.min(65, player.armor || 0);
    return true;
}

// A boss chest evolves each eligible weapon once. Items and weapon levels both matter.
export function evolveWeapons(player) {
    const evolved = [];
    if (player.level < 8) return evolved;
    for (const weapon of player.weapons || []) {
        const recipe = weapon && EVOLUTIONS[weapon.type];
        if (!recipe || weapon.evolved || (player.items?.[recipe.item] || 0) < 2) continue;
        for (const [stat, multiplier] of Object.entries(recipe.stats || {})) weapon.stats[stat] = (weapon.stats[stat] || 0) * multiplier;
        for (const [stat, value] of Object.entries(recipe.add || {})) weapon.stats[stat] = (weapon.stats[stat] || 0) + value;
        weapon.evolved = recipe.name;
        evolved.push(recipe.name);
    }
    return evolved;
}
