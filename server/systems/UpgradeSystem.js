import { WEAPONS, ALL_WEAPONS } from '../../shared/config/weapons.js';
import { BOOKS, ALL_BOOKS } from '../../shared/config/books.js';
import { UPGRADE_TYPES } from '../../shared/config/upgrades.js';
import { RARITIES } from '../../shared/config/constants.js';
import { rng } from '../../shared/utils/math.js';
import { CLASSES } from '../../shared/config/classes.js';

export class UpgradeSystem {
    constructor(permStats = {}) {
        this.permStats = permStats;
    }

    rollRarity() {
        const luck = this.permStats.luck || 0;
        const weights = RARITIES.map((r, i) => {
            const boost = i * luck * 0.02;
            return Math.max(0.01, r.w + boost);
        });
        const tot = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * tot;
        for (let i = 0; i < weights.length; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return 0;
    }

    getRarityValue(upgradeType, rarityId) {
        const rarity = RARITIES[rarityId];
        const ranges = upgradeType.ranges[rarity.key];
        if (!ranges) {
            console.warn('No range for', upgradeType.id, rarity.key);
            return upgradeType.isAdditive ? 1 : 10;
        }
        return rng(ranges[0], ranges[1]);
    }

    generateUpgradeCards(player) {
        const cards = [];
        const emptyWeaponSlot = player.weapons.findIndex(w => w === null);
        const emptyBookSlot = player.books ? player.books.findIndex(b => b === null) : -1;

        const ownedWeaponTypes = player.weapons.filter(w => w).map(w => w.type);
        const ownedBookTypes = player.books ? player.books.filter(b => b).map(b => b.type) : [];

        const availNewWeapons = ALL_WEAPONS.filter(t => !ownedWeaponTypes.includes(t));
        const availNewBooks = ALL_BOOKS.filter(t => !ownedBookTypes.includes(t));

        if (emptyWeaponSlot > -1 && availNewWeapons.length > 0 && Math.random() < 0.25) {
            const wt = availNewWeapons[Math.floor(Math.random() * availNewWeapons.length)];
            const wd = WEAPONS[wt];
            cards.push({
                type: 'newWeapon',
                weaponType: wt,
                name: 'NOWA BROŃ: ' + wd.name,
                icon: wd.icon,
                desc: 'Odblokuj nową broń',
                wname: 'Nowa broń',
                rarId: 2,
                val: '',
                upgradeId: 'newWeapon_' + wt
            });
        }

        if (emptyBookSlot > -1 && availNewBooks.length > 0 && Math.random() < 0.25) {
            const bt = availNewBooks[Math.floor(Math.random() * availNewBooks.length)];
            const bd = BOOKS[bt];
            cards.push({
                type: 'newBook',
                bookType: bt,
                name: 'NOWA KSIĘGA: ' + bd.name,
                icon: bd.icon,
                desc: bd.desc,
                wname: 'Nowa księga',
                rarId: 2,
                val: '',
                upgradeId: 'newBook_' + bt
            });
        }

        const possibleUpgrades = [];

        for (const weapon of player.weapons) {
            if (!weapon) continue;
            const wd = WEAPONS[weapon.type];
            const allowedUpgrades = wd.allowedUpgrades || [];
            for (const upgradeId of allowedUpgrades) {
                const upgradeType = UPGRADE_TYPES[upgradeId];
                if (!upgradeType) continue;

                if (!weapon.upgradeApplyCount) weapon.upgradeApplyCount = {};
                const applyCount = weapon.upgradeApplyCount[upgradeId] || 0;

                let maxApply = 1;
                if (upgradeId === 'projectileCount') {
                    const maxCount = weapon.stats?.maxCount || 4;
                    maxApply = maxCount - 1;
                }

                const upgradeKey = weapon.type + '_' + upgradeId + '_' + applyCount;
                if (applyCount >= maxApply) continue;

                let weight = 1;
                if (upgradeId === 'critChance' && player.critChance > 0) weight = 1.5;
                if (upgradeId === 'critDamage' && player.critDamage > 150) weight = 1.5;
                if (upgradeId === 'damage' && player.damageBonus > 0) weight = 1.5;
                if (upgradeId === 'attackSpeed' && player.cooldownReduction > 0) weight = 1.5;

                possibleUpgrades.push({
                    itemType: 'weapon',
                    item: weapon,
                    itemTypeId: weapon.type,
                    upgradeId,
                    upgradeType,
                    upgradeKey,
                    weight
                });
            }
        }

        if (player.books) {
            for (const book of player.books) {
                if (!book) continue;
                const bd = BOOKS[book.type];
                const allowedUpgrades = bd.allowedUpgrades || [];
                for (const upgradeId of allowedUpgrades) {
                    const upgradeType = UPGRADE_TYPES[upgradeId];
                    if (!upgradeType) continue;
                    const upgradeKey = book.type + '_' + upgradeId;
                    if (book.appliedUpgrades && book.appliedUpgrades.has(upgradeKey)) continue;

                    let weight = 1;
                    if (book.type === 'critical' && player.weapons.some(w => w && ['bow', 'knife'].includes(w.type))) weight = 1.5;
                    if (book.type === 'damage' && player.weapons.length > 0) weight = 1.5;
                    if (book.type === 'cooldown' && player.weapons.length > 0) weight = 1.5;

                    possibleUpgrades.push({
                        itemType: 'book',
                        item: book,
                        itemTypeId: book.type,
                        upgradeId,
                        upgradeType,
                        upgradeKey,
                        weight
                    });
                }
            }
        }

        const targetCards = 3;

        if (possibleUpgrades.length === 0) {
            for (const weapon of player.weapons) {
                if (!weapon) continue;
                const wd = WEAPONS[weapon.type];
                const allowedUpgrades = wd.allowedUpgrades || [];
                for (const upgradeId of allowedUpgrades) {
                    const upgradeType = UPGRADE_TYPES[upgradeId];
                    if (!upgradeType) continue;
                    possibleUpgrades.push({
                        itemType: 'weapon',
                        item: weapon,
                        itemTypeId: weapon.type,
                        upgradeId,
                        upgradeType,
                        upgradeKey: weapon.type + '_' + upgradeId + '_dup',
                        isDuplicate: true,
                        weight: 0.5
                    });
                }
            }
        }

        const selected = this.weightedRandomSelection(possibleUpgrades, targetCards - cards.length);

        for (const upgrade of selected) {
            const { itemType, item, itemTypeId, upgradeId, upgradeType, upgradeKey, isDuplicate } = upgrade;
            const rarId = this.rollRarity();
            let value = this.getRarityValue(upgradeType, rarId);
            if (isDuplicate) value *= 0.5;

            let desc = upgradeType.desc.replace('X', Math.round(value));
            let valText = upgradeType.isAdditive
                ? `+${Math.round(value * 10) / 10}`
                : `+${Math.round(value)}%`;

            const itemData = itemType === 'weapon' ? WEAPONS[itemTypeId] : BOOKS[itemTypeId];
            cards.push({
                type: itemType === 'weapon' ? 'weaponUpgrade' : 'bookUpgrade',
                itemType,
                itemTypeId,
                itemRef: item,
                upgradeId,
                upgradeType,
                name: upgradeType.name,
                icon: upgradeType.icon,
                wname: itemData.name,
                desc,
                value,
                rarId,
                val: valText,
                upgradeKey,
                isDuplicate
            });
        }

        while (cards.length < targetCards && player.weapons.filter(w => w).length > 0) {
            const weapon = player.weapons.filter(w => w)[0];
            const wd = WEAPONS[weapon.type];
            const upgradeId = wd.allowedUpgrades[0];
            const upgradeType = UPGRADE_TYPES[upgradeId];
            const rarId = 0;
            const value = this.getRarityValue(upgradeType, rarId) * 0.3;
            cards.push({
                type: 'weaponUpgrade',
                itemType: 'weapon',
                itemTypeId: weapon.type,
                itemRef: weapon,
                upgradeId,
                upgradeType,
                name: upgradeType.name + ' (Bonus)',
                icon: upgradeType.icon,
                wname: WEAPONS[weapon.type].name,
                desc: upgradeType.desc.replace('X', Math.round(value)),
                value,
                rarId,
                val: upgradeType.isAdditive ? `+${Math.round(value * 10) / 10}` : `+${Math.round(value)}%`,
                upgradeKey: weapon.type + '_' + upgradeId + '_bonus_' + Date.now(),
                isDuplicate: true
            });
        }

        return cards.slice(0, targetCards);
    }

    weightedRandomSelection(items, count) {
        let remaining = [...items];
        const selected = [];
        for (let i = 0; i < count; i++) {
            if (remaining.length === 0) break;
            const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
            if (totalWeight <= 0) break;
            let random = Math.random() * totalWeight;
            for (let j = 0; j < remaining.length; j++) {
                random -= remaining[j].weight;
                if (random <= 0) {
                    selected.push(remaining[j]);
                    remaining.splice(j, 1);
                    break;
                }
            }
        }
        return selected;
    }

    applyUpgrade(card, player, weaponSystem) {
        if (card.type === 'newWeapon') {
            const slot = player.weapons.findIndex(w => w === null);
            if (slot > -1) {
                player.weapons[slot] = player.makeWeaponInstance(card.weaponType);
            }
        } else if (card.type === 'newBook') {
            if (!player.books) player.books = [null, null, null, null, null];
            const slot = player.books.findIndex(b => b === null);
            if (slot > -1) {
                player.books[slot] = player.makeBookInstance(card.bookType);
                this.applyBookStats(player, card.bookType);
            }
        } else if (card.type === 'weaponUpgrade') {
            const weapon = card.itemRef;
            if (!weapon.appliedUpgrades) weapon.appliedUpgrades = new Set();
            if (!weapon.upgradeApplyCount) weapon.upgradeApplyCount = {};

            if (!card.isDuplicate) {
                weapon.appliedUpgrades.add(card.upgradeKey);
                weapon.upgradeApplyCount[card.upgradeId] = (weapon.upgradeApplyCount[card.upgradeId] || 0) + 1;
            }

            const statName = this.getStatName(card.upgradeId, card.itemTypeId);
            if (card.upgradeType.isAdditive) {
                const current = weapon.upgrades[statName] || 0;
                weapon.upgrades[statName] = current + card.value;
            } else {
                const current = weapon.upgrades[statName] || 1;
                weapon.upgrades[statName] = current * (1 + card.value / 100);
            }
        } else if (card.type === 'bookUpgrade') {
            const book = card.itemRef;
            if (!book.appliedUpgrades) book.appliedUpgrades = new Set();
            if (!card.isDuplicate) book.appliedUpgrades.add(card.upgradeKey);

            book.level = (book.level || 1) + 1;
            for (const key in book.stats) {
                if (typeof book.stats[key] === 'number') {
                    book.stats[key] *= (1 + card.value / 100);
                }
            }
            this.applyBookStats(player, card.itemTypeId);
        }
    }

    applyBookStats(player, bookType) {
        const book = player.books.find(b => b && b.type === bookType);
        if (!book) return;
        const bd = BOOKS[bookType];
        const level = book.level || 1;

        if (bookType === 'vitality') {
            const baseHp = CLASSES[player.cls].hp;
            const bonus = Math.round(baseHp * book.stats.maxHp * level);
            player.maxHp += bonus;
            player.hp = Math.min(player.maxHp, player.hp + bonus);
        } else if (bookType === 'speed') {
            player.speed *= (1 + book.stats.moveSpeed * level);
        } else if (bookType === 'cooldown') {
            player.cooldownReduction = (player.cooldownReduction || 0) + (book.stats.cooldownReduction * level);
        } else if (bookType === 'magnet') {
            player.magnetRange = (player.magnetRange || 100) + (book.stats.magnetRange * level);
        } else if (bookType === 'critical') {
            player.critChance = (player.critChance || 0) + (book.stats.critChance * level);
            player.critDamage = (player.critDamage || 150) + (book.stats.critDamage * level);
        } else if (bookType === 'damage') {
            player.damageBonus = (player.damageBonus || 0) + (book.stats.damageBonus * level);
        } else if (bookType === 'area') {
            player.areaBonus = (player.areaBonus || 0) + (book.stats.areaBonus * level);
        } else if (bookType === 'luck') {
            this.permStats.luck = (this.permStats.luck || 0) + (book.stats.luck * level);
        } else if (bookType === 'revival') {
            player.revives = (player.revives || 0) + (book.stats.revives * level);
        } else if (bookType === 'regeneration') {
            player.regen = (player.regen || 0) + (book.stats.regen * level);
        }
    }

    getStatName(upgradeId, weaponType) {
        if (weaponType === 'sword') {
            if (upgradeId === 'range') return 'orbit';
            if (upgradeId === 'projectileCount') return 'count';
        }
        const mapping = {
            'damage': 'dmg',
            'attackSpeed': 'atkSpd',
            'projectileCount': weaponType === 'lightning' ? 'targets' : 'bCnt',
            'projectileSize': weaponType === 'laser' ? 'width' : 'bSz',
            'projectileSpeed': 'bSpd',
            'pierce': 'pierce',
            'range': 'range',
            'bounce': 'bBnc',
            'chain': 'chain',
            'duration': 'duration',
            'explosion': 'explosion',
            'critChance': 'critChance',
            'critDamage': 'critDamage'
        };
        return mapping[upgradeId] || upgradeId;
    }
}
