import { WEAPONS } from '../../shared/config/weapons.js';
import { BOOKS } from '../../shared/config/books.js';
import { ITEMS, ITEM_RARITIES } from '../../shared/config/items.js';
import { getItemRarity, getItemRarityCounts, getItemPower } from '../../shared/systems/items.js';
import { CLASSES } from '../../shared/config/classes.js';
import { weaponStat, weaponCooldown } from '../../shared/utils/weaponStats.js';

const numbers = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const number = value => numbers.format(Number.isFinite(value) ? value : 0);
const positiveInteger = (value, fallback = 1) => Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
const lookup = (table, id) => typeof id === 'string' && Object.hasOwn(table, id) ? table[id] : null;

const WEAPON_DESCRIPTIONS = {
    aura: 'Rani przeciwników, którzy znajdą się w aurze wokół postaci. Działa cały czas.',
    bow: 'Automatycznie strzela strzałami w stronę najbliższego przeciwnika. Więcej pocisków tworzy szerszą salwę.',
    lightning: 'Uderza najbliższych przeciwników, a potem przeskakuje na kolejne cele. Każdy przeskok jest słabszy.',
    axe: 'Rzuca obracający się topór w stronę wroga. Topór przebija kolejnych przeciwników.',
    fireball: 'Wystrzeliwuje kulę ognia, która po trafieniu wybucha i rani pobliskich przeciwników.',
    knife: 'Szybko rzuca nożami w stronę najbliższego przeciwnika. Noże mogą odbijać się i przebijać cele.',
    laser: 'Tworzy przebijającą wiązkę skierowaną w najbliższego wroga. Przeciwnicy w wiązce otrzymują kolejne trafienia.',
    poison: 'Pozostawia trującą chmurę pod postacią. Rani wrogów w środku, a zatrucie działa jeszcze przez chwilę po wyjściu.',
    meteor: 'Zrzuca meteory w pobliżu przeciwników. Uderzenie wywołuje wybuch obejmujący pobliskie cele.',
    sword: 'Ostrza krążą wokół postaci i ranią wrogów, których dotkną.'
};

const BOOK_DESCRIPTIONS = {
    vitality: 'Zwiększa maksymalne życie na podstawie bazowego HP postaci.',
    speed: 'Zwiększa szybkość poruszania się postaci.',
    cooldown: 'Skraca przerwy między atakami wszystkich broni.',
    magnet: 'Pozwala przyciągać kule XP z większej odległości.',
    critical: 'Zwiększa szansę na trafienie krytyczne oraz jego obrażenia.',
    damage: 'Zwiększa obrażenia wszystkich broni.',
    area: 'Powiększa obszar działania broni, aur i wybuchów.',
    luck: 'Zwiększa szansę na lepszą rzadkość oferowanych ulepszeń.',
    revival: 'Daje dodatkowe odrodzenia po utracie całego życia.',
    regeneration: 'Automatycznie przywraca brakujące życie co sekundę.'
};

const ITEM_DESCRIPTIONS = {
    magnet: 'Przyciąga kule XP z większej odległości.',
    clover: 'Zwiększa szansę na lepszą rzadkość oferowanych ulepszeń.',
    armor: 'Zmniejsza otrzymywane obrażenia dzięki dodatkowemu pancerzowi.',
    ember: 'Zwiększa obrażenia wszystkich broni.',
    hourglass: 'Skraca przerwy między atakami wszystkich broni.',
    heart: 'Zwiększa maksymalne życie i jednorazowo leczy przy podniesieniu.',
    prism: 'Powiększa obszar działania broni oraz ich pociski.',
    fang: 'Zwiększa szansę na trafienie krytyczne oraz jego obrażenia.'
};

function itemEffects(item, count) {
    const labels = {
        magnetRange: value => `+${number(value)} zasięgu zbierania XP`,
        luck: value => `+${number(value)} szczęścia`,
        armor: value => `+${number(value)}% pancerza`,
        damageBonus: value => `+${number(value)}% obrażeń`,
        cooldownReduction: value => `−${number(value)}% czasu odnowienia`,
        maxHp: value => `+${number(value)} maksymalnego HP`,
        areaBonus: value => `+${number(value)}% obszaru działania`,
        projectileSizeBonus: value => `+${number(value)}% rozmiaru pocisków`,
        critChance: value => `+${number(value)}% szansy na trafienie krytyczne`,
        critDamage: value => `+${number(value)}% obrażeń krytycznych`
    };
    return Object.entries(item.stats).map(([stat, value]) => labels[stat](value * count));
}

function describeWeapon(id, instance, player) {
    const definition = lookup(WEAPONS, id);
    if (!definition) return null;
    const weapon = { ...instance, type: id, stats: { ...definition.stats, ...instance.stats } };
    const stat = name => weaponStat(weapon, name, player);
    const details = [];
    if (instance.evolved) details.push(`Ewolucja broni: ${definition.name}`);
    if (id === 'aura') details.push(`Obrażenia na sekundę: ${number(stat('dmg'))}`);
    else if (id === 'laser') details.push(`Obrażenia trafienia: ${number(stat('dmg'))} co 0,15 s`);
    else if (id === 'poison') details.push(`Obrażenia trucizny: ${number(stat('dmg'))} co ${number(weapon.stats.tick || .15)} s`);
    else details.push(`Obrażenia trafienia: ${number(stat('dmg'))}`);

    if (!['aura', 'sword'].includes(id)) {
        const reduction = Math.min(.8, (player.cooldownReduction || 0) / 100);
        const seconds = weaponCooldown(weapon, player, definition) * Math.max(.2, 1 - reduction);
        details.push(`Odstęp ataków: ${number(seconds)} s`);
    }
    if (['bow', 'knife', 'fireball', 'meteor'].includes(id)) details.push(`Pociski w salwie: ${Math.max(1, Math.round(stat('bCnt')))}`);
    if (id === 'lightning') {
        details.push(`Cele pierwszego uderzenia: ${Math.max(1, Math.round(stat('targets')))}`);
        details.push(`Przeskoki: ${Math.max(0, Math.round(stat('chain')))}`);
    }
    if (id === 'sword') {
        details.push(`Ostrza: ${Math.min(weapon.stats.maxCount || 4, Math.max(1, Math.round(stat('count'))))}`);
        details.push(`Odstęp trafień: ${number(Math.max(.08, .2 / (stat('atkSpd') || 1)))} s`);
        details.push(`Promień orbity: ${number(stat('orbit'))}`);
    }
    if (['aura', 'laser', 'poison'].includes(id)) details.push(`Zasięg: ${number(stat('range'))}`);
    if (['laser', 'poison'].includes(id)) details.push(`Czas działania: ${number(stat('duration'))} s`);
    if (id === 'fireball') details.push(`Promień wybuchu: ${number(stat('explosion'))}`);
    if (id === 'meteor') details.push(`Obszar uderzenia: ${number(stat('impact'))}`);
    if (id === 'poison') details.push(`Po wyjściu z chmury: ${number(weapon.stats.lingerDmg || stat('dmg') * .4)} HP/s przez ${number(weapon.stats.lingerDuration || 2)} s`);
    return { title: instance.evolved || definition.name, description: WEAPON_DESCRIPTIONS[id], details, icon: id };
}

function describeBook(id, instance, player) {
    const definition = lookup(BOOKS, id);
    if (!definition) return null;
    const level = positiveInteger(instance.level);
    const stats = { ...definition.stats, ...instance.stats };
    const baseHp = Number.isFinite(player.baseHp) ? player.baseHp : CLASSES[player.cls]?.hp;
    const details = [`Poziom księgi: ${level}`];
    switch (id) {
        case 'vitality':
            details.push(Number.isFinite(baseHp) ? `+${number(Math.round(baseHp * stats.maxHp * level))} maksymalnego HP` : `+${number(stats.maxHp * level * 100)}% bazowego HP`);
            break;
        case 'speed': details.push(`+${number(stats.moveSpeed * level * 100)}% szybkości ruchu`); break;
        case 'cooldown':
            details.push(`Premia księgi: −${number(Math.min(65, stats.cooldownReduction * level))}% czasu odnowienia`);
            details.push('Łączny limit redukcji z wyposażenia: 65%');
            break;
        case 'magnet': details.push(`+${number(stats.magnetRange * level)} zasięgu zbierania XP`); break;
        case 'critical':
            details.push(`+${number(stats.critChance * level)}% szansy na trafienie krytyczne`);
            details.push(`+${number(stats.critDamage * level)}% obrażeń krytycznych`);
            break;
        case 'damage': details.push(`+${number(stats.damageBonus * level)}% obrażeń wszystkich broni`); break;
        case 'area': details.push(`+${number(stats.areaBonus * level)}% obszaru działania`); break;
        case 'luck': details.push(`+${number(stats.luck * level)} szczęścia`); break;
        case 'revival':
            details.push(`Dodatkowe odrodzenia z księgi: ${Math.floor(stats.revives * level)}`);
            if (Number.isFinite(player.revives)) details.push(`Pozostało odrodzeń: ${Math.max(0, Math.floor(player.revives))}`);
            break;
        case 'regeneration': details.push(`+${number(stats.regen * level)} HP na sekundę`); break;
    }
    return { title: definition.name, description: BOOK_DESCRIPTIONS[id], details, icon: id };
}

function describeItem(id, instance, player) {
    const item = lookup(ITEMS, id);
    if (!item) return null;
    const count = Math.min(item.max, positiveInteger(instance.stacks ?? instance.count ?? player.items?.[id]));
    const counts = getItemRarityCounts(player, id, count);
    const rarity = ITEM_RARITIES[counts.findLastIndex(value => value > 0)] || ITEM_RARITIES[0];
    const power = getItemPower(player, id, count);
    const details = [`Stosy: ${count}/${item.max}`, `Rzadkości: ${counts.map((amount, index) => amount ? `${ITEM_RARITIES[index].name} ×${amount}` : '').filter(Boolean).join(', ')}`,
        `Na jeden stos: ${itemEffects(item, rarity.power).join(', ')}`, `Łączna premia: ${itemEffects(item, power).join(', ')}`];
    if (counts.filter(value => value > 0).length > 1) details.splice(2, 1);
    if (id === 'heart') details.push(`Każdy podniesiony stos jednorazowo leczy do ${number(item.stats.maxHp * rarity.power)} HP, zależnie od rzadkości.`);
    if (id === 'armor' || id === 'hourglass') details.push(`Łączny limit ${id === 'armor' ? 'pancerza' : 'redukcji czasu odnowienia'} z wyposażenia: 65%.`);
    return { title: item.name, description: ITEM_DESCRIPTIONS[id], details, icon: item.icon, rarity: rarity.key };
}

export function describeEquipment(kind, id, instance = {}, player = {}) {
    if (kind === 'weapon') return describeWeapon(id, instance || {}, player || {});
    if (kind === 'book') return describeBook(id, instance || {}, player || {});
    if (kind === 'item') return describeItem(id, instance || {}, player || {});
    return null;
}

export function describeLootReward(card, player = {}) {
    if (card?.type === 'heal') return {
        title: 'Odnowa', description: 'Jednorazowo przywraca do 30% maksymalnego życia.',
        details: Number.isFinite(player.maxHp) ? [`Leczenie: do +${number(player.maxHp * .3)} HP`] : [], icon: 'heart'
    };
    const item = card?.type === 'item' && lookup(ITEMS, card.itemId);
    if (!item) return null;
    const gained = Math.min(item.max, positiveInteger(card.stacks));
    const total = Math.min(item.max, Math.max(gained, positiveInteger(card.totalStacks ?? player.items?.[card.itemId], gained)));
    const rarity = getItemRarity(card.itemRarity);
    let counts;
    if (Array.isArray(card.totalItemRarities)) {
        counts = getItemRarityCounts({ itemRarities: { [card.itemId]: card.totalItemRarities } }, card.itemId, total);
    } else {
        const owned = Math.min(item.max, Math.max(0, Math.floor(player.items?.[card.itemId] || 0)));
        const hasMetadata = Array.isArray(player.itemRarities?.[card.itemId]);
        counts = getItemRarityCounts(player, card.itemId, Math.min(owned, total));
        if (owned < total) counts[rarity.id] += Math.min(gained, total - owned);
        else if (!hasMetadata && rarity.id > 0) { counts[0] = Math.max(0, total - gained); counts[rarity.id] = gained; }
        counts = getItemRarityCounts({ itemRarities: { [card.itemId]: counts } }, card.itemId, total);
    }
    const power = counts.reduce((sum, amount, index) => sum + amount * ITEM_RARITIES[index].power, 0);
    const details = [`Rzadkość: ${rarity.name}`, ...itemEffects(item, gained * rarity.power).map(effect => `Zdobyta premia: ${effect}`)];
    if (card.itemId === 'heart') details.push(`Jednorazowe leczenie: do +${number(item.stats.maxHp * gained * rarity.power)} HP`);
    details.push(`Masz teraz: ${total}/${item.max} stosów`);
    details.push(`Łączna premia: ${itemEffects(item, power).join(', ')}`);
    return { title: `${item.name} ×${gained}`, description: ITEM_DESCRIPTIONS[card.itemId], details, icon: item.icon, rarity: rarity.key };
}
