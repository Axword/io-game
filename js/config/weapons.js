export const WEAPONS = {
    aura: {
        name: 'Aura',
        icon: '◎',
        col: 0xffaa00,
        auto: true,
        cont: true,
        cooldown: 0.38,
        stats: { dmg: 8, range: 95, atkSpd: 1 },
        allowedUpgrades: ['damage', 'range', 'attackSpeed']
    },
    bow: {
        name: 'Łuk',
        icon: '🏹',
        col: 0x00ff88,
        auto: true,
        manual: false,
        cooldown: 0.8,
        stats: { dmg: 35, bSpd: 25, bCnt: 1, bSz: 1, pierce: 0, critChance: 5, critDamage: 150 },
        // bCnt zwiększa SZEROKOŚĆ strzały (fan/spread), nie ilość osobnych pocisków
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'projectileSize', 'attackSpeed', 'pierce', 'critChance', 'critDamage']
    },
    lightning: {
        name: 'Piorun',
        icon: '⚡',
        col: 0xffff44,
        auto: true,
        cont: false,
        cooldown: 1.1,
        stats: { dmg: 22, targets: 1, atkSpd: 1, chain: 3, chainRange: 250 },
        // chain = ile razy przeskakuje między wrogami
        allowedUpgrades: ['damage', 'projectileCount', 'attackSpeed', 'chain']
    },
    axe: {
        name: 'Topór',
        icon: '🪓',
        col: 0xff8800,
        auto: true,
        cont: false,
        cooldown: 1.9,
        stats: { dmg: 30, bSz: 1, bSpd: 7, atkSpd: 1, pierce: 999 },
        // pierce: 999 = przechodzi przez wszystkich
        allowedUpgrades: ['damage', 'projectileSize', 'projectileSpeed', 'attackSpeed']
    },
    fireball: {
        name: 'Kula Ognia',
        icon: '🔥',
        col: 0xff3300,
        auto: true,
        manual: false,
        cooldown: 2.8,
        stats: { dmg: 55, bSpd: 12, bCnt: 1, bSz: 1.5, explosion: 120 },
        // Rzadziej strzela, ale wybucha i zadaje AOE
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'projectileSize', 'attackSpeed', 'explosion']
    },
    knife: {
        name: 'Noże',
        icon: '🔪',
        col: 0xcccccc,
        auto: true,
        manual: false,
        cooldown: 0.18,
        stats: { dmg: 8, bSpd: 40, bCnt: 1, bSz: 0.6, pierce: 0, bBnc: 2, critChance: 18, critDamage: 220 },
        // Niski dmg, bardzo szybkie, ODBIJAJĄ SIĘ od wrogów
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'attackSpeed', 'bounce', 'critChance', 'critDamage']
    },
    laser: {
        name: 'Laser',
        icon: '📡',
        col: 0xff00ff,
        auto: true,
        manual: false,
        cooldown: 2.5,
        stats: { dmg: 50, duration: 1.0, range: 350, width: 18, atkSpd: 1 },
        // Krótki zasięg, wąski, strzela OD gracza, przechodzi przez jednostki
        allowedUpgrades: ['damage', 'duration', 'range', 'projectileSize', 'attackSpeed']
    },
    poison: {
        name: 'Trucizna',
        icon: '☠️',
        col: 0x00ff00,
        auto: true,
        cont: false,
        cooldown: 3.0,
        stats: { dmg: 20, duration: 5, range: 150, atkSpd: 1, tick: 0.15, lingerDmg: 8, lingerDuration: 2.0 },
        // dmg BAZOWY x4, tick co 0.15s (stałe obrażenia), linger = dmg po wyjściu
        allowedUpgrades: ['damage', 'duration', 'range', 'attackSpeed']
    },
    meteor: {
        name: 'Meteor',
        icon: '☄️',
        col: 0xff6600,
        auto: true,
        manual: false,
        cooldown: 4.0,
        stats: { dmg: 100, bCnt: 1, impact: 200, bSz: 1.5 },
        allowedUpgrades: ['damage', 'projectileCount', 'projectileSize', 'attackSpeed']
    },
    sword: {
        name: 'Miecz',
        icon: '⚔️',
        col: 0x88ccff,
        auto: true,
        cont: true,
        cooldown: 0.1,
        stats: { dmg: 12, orbit: 120, count: 1, speed: 3, atkSpd: 1, maxCount: 4 },
        allowedUpgrades: ['damage', 'range', 'projectileCount', 'attackSpeed']
    }
};

export const ALL_WEAPONS = Object.keys(WEAPONS);