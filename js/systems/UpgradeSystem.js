import { WEAPONS, ALL_WEAPONS } from '../config/weapons.js';
import { RARITIES } from '../config/constants.js';
import { UPGRADE_TYPES } from '../config/upgrades.js';
import { rng, rngInt } from '../utils/math.js';

export class UpgradeSystem {
    constructor(permStats) {
        this.permStats = permStats;
    }
    
    rollRarity() {
        const luck = this.permStats.luck;
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
        
        if (upgradeType.isAdditive) {
            return rngInt(ranges[0], ranges[1]);
        } else {
            return rng(ranges[0], ranges[1]);
        }
    }
    
    generateUpgradeCards(player) {
        const cards = [];
        const emptySlot = player.weapons.findIndex(w => w === null);
        const ownedTypes = player.weapons.filter(w => w).map(w => w.type);
        const availNew = ALL_WEAPONS.filter(t => !ownedTypes.includes(t));
        
        // 25% szans na nową broń
        if (emptySlot > -1 && availNew.length > 0 && Math.random() < 0.25) {
            const wt = availNew[Math.floor(Math.random() * availNew.length)];
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
        
        // Zbierz wszystkie możliwe upgrady
        const possibleUpgrades = [];
        
        for (const weapon of player.weapons) {
            if (!weapon) continue;
            
            const wd = WEAPONS[weapon.type];
            const allowedUpgrades = wd.allowedUpgrades || [];
            
            for (const upgradeId of allowedUpgrades) {
                const upgradeType = UPGRADE_TYPES[upgradeId];
                if (!upgradeType) continue;
                
                const upgradeKey = weapon.type + '_' + upgradeId;
                
                // Każdy upgrade tylko RAZ
                if (weapon.appliedUpgrades && weapon.appliedUpgrades.has(upgradeKey)) {
                    continue;
                }
                
                possibleUpgrades.push({
                    weapon,
                    weaponType: weapon.type,
                    upgradeId,
                    upgradeType,
                    upgradeKey
                });
            }
        }
        
        // ZAWSZE generuj 3 karty
        const targetCards = 3;
        
        if (possibleUpgrades.length === 0) {
            // Fallback - jeśli brak upgradów, pozwól na duplikaty z mniejszym bonusem
            console.warn('No upgrades available, using fallback');
            for (const weapon of player.weapons) {
                if (!weapon) continue;
                const wd = WEAPONS[weapon.type];
                const allowedUpgrades = wd.allowedUpgrades || [];
                
                for (const upgradeId of allowedUpgrades) {
                    const upgradeType = UPGRADE_TYPES[upgradeId];
                    if (!upgradeType) continue;
                    
                    possibleUpgrades.push({
                        weapon,
                        weaponType: weapon.type,
                        upgradeId,
                        upgradeType,
                        upgradeKey: weapon.type + '_' + upgradeId + '_dup',
                        isDuplicate: true
                    });
                }
            }
        }
        
        // Shuffle i wybierz
        const shuffled = possibleUpgrades.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, targetCards - cards.length);
        
        for (const item of selected) {
            const { weapon, weaponType, upgradeId, upgradeType, upgradeKey, isDuplicate } = item;
            
            const rarId = this.rollRarity();
            let value = this.getRarityValue(upgradeType, rarId);
            
            // Zmniejsz wartość dla duplikatów
            if (isDuplicate) {
                value *= 0.5;
            }
            
            let desc = upgradeType.desc.replace('X', Math.round(value));
            let valText = upgradeType.isAdditive ? 
                `+${Math.round(value)}` : 
                `+${Math.round(value)}%`;
            
            cards.push({
                type: 'upgrade',
                weaponType,
                weaponRef: weapon,
                upgradeId,
                upgradeType,
                name: upgradeType.name,
                icon: upgradeType.icon,
                wname: WEAPONS[weaponType].name,
                desc,
                value,
                rarId,
                val: valText,
                upgradeKey,
                isDuplicate
            });
        }
        
        // Dopełnij do 3 jeśli trzeba
        while (cards.length < targetCards && player.weapons.filter(w => w).length > 0) {
            const weapon = player.weapons.filter(w => w)[0];
            const wd = WEAPONS[weapon.type];
            const upgradeId = wd.allowedUpgrades[0];
            const upgradeType = UPGRADE_TYPES[upgradeId];
            
            const rarId = 0; // Zwykłe
            const value = this.getRarityValue(upgradeType, rarId) * 0.3;
            
            cards.push({
                type: 'upgrade',
                weaponType: weapon.type,
                weaponRef: weapon,
                upgradeId,
                upgradeType,
                name: upgradeType.name + ' (Bonus)',
                icon: upgradeType.icon,
                wname: WEAPONS[weapon.type].name,
                desc: upgradeType.desc.replace('X', Math.round(value)),
                value,
                rarId,
                val: upgradeType.isAdditive ? `+${Math.round(value)}` : `+${Math.round(value)}%`,
                upgradeKey: weapon.type + '_' + upgradeId + '_bonus_' + Date.now(),
                isDuplicate: true
            });
        }
        
        return cards.slice(0, targetCards);
    }
    
    applyUpgrade(card, player, weaponSystem) {
        if (card.type === 'newWeapon') {
            const slot = player.weapons.findIndex(w => w === null);
            if (slot > -1) {
                player.weapons[slot] = player.makeWeaponInstance(card.weaponType);
                if (card.weaponType === 'aura') {
                    weaponSystem.setupAura(player);
                }
            }
        } else if (card.type === 'upgrade') {
            const weapon = card.weaponRef;
            
            if (!weapon.appliedUpgrades) {
                weapon.appliedUpgrades = new Set();
            }
            
            // Oznacz jako zastosowany (tylko jeśli nie duplikat)
            if (!card.isDuplicate) {
                weapon.appliedUpgrades.add(card.upgradeKey);
            }
            
            const statName = this.getStatName(card.upgradeId, card.weaponType);
            
            if (card.upgradeType.isAdditive) {
                const current = weapon.upgrades[statName] || 0;
                weapon.upgrades[statName] = current + card.value;
            } else {
                const current = weapon.upgrades[statName] || 1;
                weapon.upgrades[statName] = current * (1 + card.value / 100);
            }
        }
    }
    
    getStatName(upgradeId, weaponType) {
        const mapping = {
            'damage': 'dmg',
            'attackSpeed': 'atkSpd',
            'projectileCount': weaponType === 'lightning' ? 'targets' : 'bCnt',
            'projectileSize': 'bSz',
            'projectileSpeed': 'bSpd',
            'pierce': 'pierce',
            'range': 'range',
            'bounce': 'bBnc',
            'chain': 'chain',
            'duration': 'duration'
        };
        
        return mapping[upgradeId] || upgradeId;
    }
}