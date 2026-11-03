import { ITEMS, EVOLUTIONS } from '../config/items.js';

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
        cards.push({ type: 'item', itemId: id, icon: id, name: item.name, desc: item.desc,
            stacks, rarId: rare ? 2 : 1, val: `×${stacks}`, wname: 'Przedmiot', upgradeKey: `item_${id}` });
    }
    if (!cards.length) cards.push({ type: 'heal', name: 'Odnowa', icon: 'heart', desc: 'Przywraca 30% maks. HP', rarId: 1, val: '+30% HP', upgradeKey: 'item_heal' });
    return cards;
}

export function applyItem(player, card) {
    if (card.type === 'heal') {
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
        return true;
    }
    const item = ITEMS[card.itemId];
    if (!item) return false;
    player.items ??= {};
    const count = player.items[card.itemId] || 0;
    const added = Math.min(Math.max(1, Math.floor(card.stacks || 1)), item.max - count);
    if (added <= 0) return false;
    player.items[card.itemId] = count + added;
    for (const [stat, value] of Object.entries(item.stats)) player[stat] = (player[stat] || 0) + value * added;
    if (card.itemId === 'heart') player.hp = Math.min(player.maxHp, player.hp + 18 * added);
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
