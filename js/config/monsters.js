// config/monsters.js
export const MONSTER_CONFIG = {
    base: { hp: 20, dmg: 8, sz: 14, xp: 10 },
    zoneBonus: { hp: 15, dmg: 5, sz: 4, xp: 8 },
    elite: { 
        hpMult: 5, 
        speedMult: 1.25, 
        xpMult: 10, 
        sizeMult: 1.3, 
        chance: 0.01 
    },
    chase: { 
        outsideZoneTimeout: 3.0,
        detectRange: 800, 
        bossDetectRange: 1200 
    },
    despawn: { 
        timeout: 5.0, 
        escapeSpeed: 2.0 
    },
    shooting: {
        ranges: { boss: 800, 0: 600, 1: 400 },
        speeds: { boss: 10, 0: 7, 1: 4 },
        lifetimes: { boss: 4, 0: 3.5, 1: 2 },
        cooldowns: { boss: [1.5, 3], normal: [3, 5] }
    },
    attack: { 
        bossRange: 80, 
        normalRange: 50, 
        slowdownFactor: 0.5 
    },
    colors: [0x330033, 0x555555, 0x006666, 0x660066, 0xaa0000, 0x880000],
    shapes: {
        low: ['tri', 'sq'],
        mid: ['pent', 'hex'],
        high: ['hept', 'oct', 'non']
    }
};