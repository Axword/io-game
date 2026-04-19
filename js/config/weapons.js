export const WEAPONS = {
    aura: {
        name: 'Aura',
        icon: '◎',
        col: 0xffaa00,
        auto: true,
        cont: true,
        cooldown: 0.38,
        stats: { dmg: 8, range: 95, atkSpd: 1 },
        allowedUpgrades: ['damage', 'range', 'attackSpeed', 'duration']
    },
    bow: {
        name: 'Łuk',
        icon: '🏹',
        col: 0x00ff88,
        auto: true,
        cooldown: 0.8,
        stats: { dmg: 35, bSpd: 25, bCnt: 1, bBnc: 0, bSz: 1, pierce: 0, range: 600 },
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'bounce', 'projectileSize', 'attackSpeed', 'pierce', 'range']
    },
    lightning: {
        name: 'Piorun',
        icon: '⚡',
        col: 0xffff44,
        auto: true,
        cooldown: 1.1,
        stats: { dmg: 22, targets: 1, atkSpd: 1, chain: 0, range: 400 },
        allowedUpgrades: ['damage', 'projectileCount', 'attackSpeed', 'chain', 'range']
    },
    axe: {
        name: 'Topór',
        icon: '🪓',
        col: 0xff8800,
        auto: true,
        cooldown: 1.9,
        stats: { dmg: 30, sz: 1, spd: 7, atkSpd: 1, pierce: 0, range: 500 },
        allowedUpgrades: ['damage', 'projectileSize', 'projectileSpeed', 'attackSpeed', 'pierce', 'projectileCount', 'range']
    },
    fireball: {
        name: 'Kula Ognia',
        icon: '🔥',
        col: 0xff3300,
        auto: true,
        cooldown: 1.5,
        stats: { dmg: 45, bSpd: 15, bCnt: 1, bSz: 1.2, explosion: 80, pierce: 0, range: 550 },
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'projectileSize', 'attackSpeed', 'explosion', 'range']
    },
    sword: {
        name: 'Wirujący Miecz',
        icon: '⚔️',
        col: 0x88ccff,
        auto: true,
        cont: true,
        cooldown: 0.1,
        stats: { dmg: 12, orbit: 120, count: 1, speed: 3, atkSpd: 1 },
        allowedUpgrades: ['damage', 'range', 'projectileCount', 'attackSpeed', 'projectileSpeed']
    },
    knife: {
        name: 'Noże',
        icon: '🔪',
        col: 0xcccccc,
        auto: true,
        cooldown: 0.3,
        stats: { dmg: 18, bSpd: 35, bCnt: 1, bSz: 0.8, pierce: 1, range: 450 },
        allowedUpgrades: ['damage', 'projectileSpeed', 'projectileCount', 'attackSpeed', 'pierce', 'range']
    },
    laser: {
        name: 'Laser',
        icon: '📡',
        col: 0xff00ff,
        auto: true,
        cooldown: 2.5,
        stats: { dmg: 60, duration: 1.5, width: 30, atkSpd: 1, range: 700 },
        allowedUpgrades: ['damage', 'duration', 'projectileSize', 'attackSpeed', 'projectileCount', 'range']
    },
    poison: {
        name: 'Trucizna',
        icon: '☠️',
        col: 0x00ff00,
        auto: true,
        cooldown: 3.0,
        stats: { dmg: 5, duration: 5, range: 150, atkSpd: 1, tick: 0.5 },
        allowedUpgrades: ['damage', 'duration', 'range', 'attackSpeed']
    },
    meteor: {
        name: 'Meteor',
        icon: '☄️',
        col: 0xff6600,
        auto: true,
        cooldown: 4.0,
        stats: { dmg: 100, bCnt: 1, impact: 200, bSz: 2, pierce: 999, range: 800 },
        allowedUpgrades: ['damage', 'projectileCount', 'projectileSize', 'attackSpeed', 'explosion', 'range']
    }
};

export const ALL_WEAPONS = ['aura', 'bow', 'lightning', 'axe', 'fireball', 'sword', 'knife', 'laser', 'poison', 'meteor'];