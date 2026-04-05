export const WEAPONS = {
    aura: {
        name: 'Aura',
        icon: '◎',
        col: 0xffaa00,
        auto: true,
        cont: true,
        cooldown: 0.38,
        stats: { dmg: 8, range: 95, atkSpd: 1 },
        // Dozwolone upgrady dla tej broni
        allowedUpgrades: ['damage', 'range', 'attackSpeed', 'duration']
    },
    bow: {
        name: 'Łuk',
        icon: '🏹',
        col: 0x00ff88,
        auto: true,
        manual: false,
        cooldown: 0.8, // Szybszy niż snajperka
        stats: { dmg: 35, bSpd: 25, bCnt: 1, bBnc: 0, bSz: 1, pierce: 0 },
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'bounce', 'projectileSize', 'attackSpeed', 'pierce']
    },
    lightning: {
        name: 'Piorun',
        icon: '⚡',
        col: 0xffff44,
        auto: true,
        cont: false,
        cooldown: 1.1,
        stats: { dmg: 22, targets: 1, atkSpd: 1, chain: 0 },
        allowedUpgrades: ['damage', 'projectileCount', 'attackSpeed', 'chain', 'range']
    },
    axe: {
        name: 'Topór',
        icon: '🪓',
        col: 0xff8800,
        auto: true,
        cont: false,
        cooldown: 1.9,
        stats: { dmg: 30, sz: 1, spd: 7, atkSpd: 1, pierce: 0 },
        allowedUpgrades: ['damage', 'projectileSize', 'projectileSpeed', 'attackSpeed', 'pierce', 'projectileCount']
    }
};

export const ALL_WEAPONS = ['aura', 'bow', 'lightning', 'axe'];