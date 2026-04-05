export const WORLD = 12000;
export const SAFE_R = 0;
export const CENTER_DANGER_R = 1500;
export const MOVEMENT_MULTIPLIER = 2.5;

export const ZONES = [
    { minR: 0, maxR: 1500, name: 'CENTRUM - EKSTREMA', col: 0x1a0000, mScale: 20, dangerLevel: 5, monsterSpeed: 3.0 },
    { minR: 1500, maxR: 3000, name: 'STREFA 4', col: 0x2a0a0a, mScale: 12, dangerLevel: 4, monsterSpeed: 2.4 },
    { minR: 3000, maxR: 4500, name: 'STREFA 3', col: 0x3a1a1a, mScale: 7, dangerLevel: 3, monsterSpeed: 2.0 },
    { minR: 4500, maxR: 6000, name: 'STREFA 2', col: 0x4a2a2a, mScale: 3.5, dangerLevel: 2, monsterSpeed: 1.6 },
    { minR: 6000, maxR: 12000, name: 'STREFA 1', col: 0x888888, mScale: 1.5, dangerLevel: 1, monsterSpeed: 0.6 }
];

export const RARITIES = [
    { id: 0, name: 'ZWYKŁE', col: '#666', bg: 'rgba(240,240,240,.95)', border: 'rgba(100,100,100,.6)', w: 50, key: 'common' },
    { id: 1, name: 'ULEPSZONE', col: '#2a2', bg: 'rgba(230,255,230,.95)', border: 'rgba(0,160,0,.6)', w: 30, key: 'enhanced' },
    { id: 2, name: 'RZADKIE', col: '#25f', bg: 'rgba(230,240,255,.95)', border: 'rgba(0,80,200,.6)', w: 15, key: 'rare' },
    { id: 3, name: 'LEGENDARNE', col: '#f80', bg: 'rgba(255,245,230,.95)', border: 'rgba(220,140,0,.7)', w: 5, key: 'legendary' }
];

export const PERM_DEFS = [
    { id: 'luck', icon: '🍀', name: 'Szczęście', desc: 'Szansa na lepsze ulepszenia', unit: '%', base: 0, step: 5 },
    { id: 'speed', icon: '💨', name: 'Szybkość Ruchu', desc: 'Stały bonus do prędkości', unit: '%', base: 0, step: 4 },
    { id: 'hp', icon: '❤️', name: 'Punkty Życia', desc: 'Bonus do maksymalnego HP', unit: '', base: 0, step: 15 }
];

export const VIEW = 450;

export const SPAWN_POINTS = [
    { x: -5500, y: 5500, name: 'NW' },
    { x: 0, y: 5500, name: 'N' },
    { x: 5500, y: 5500, name: 'NE' },
    { x: 5500, y: 0, name: 'E' },
    { x: 5500, y: -5500, name: 'SE' },
    { x: 0, y: -5500, name: 'S' },
    { x: -5500, y: -5500, name: 'SW' },
    { x: -5500, y: 0, name: 'W' }
];

export const DIFFICULTY_CONFIG = {
    easy: { hpMult: 1.0, spawnMult: 1.0 },
    medium: { hpMult: 1.5, spawnMult: 2.0 },
    hard: { hpMult: 2.0, spawnMult: 2.0 },
    extreme: { hpMult: 3.0, spawnMult: 3.0 }
};
export const BOSS_TYPES = [
    {
        id: 'destroyer',
        name: 'Niszczyciel',
        emoji: '👹',
        shape: 'pent',
        col: 0x880000,
        hp: 5000,
        dmg: 50,
        spd: 1.8,
        sz: 60,
        xp: 500,
        abilities: ['shockwave', 'charge']
    },
    {
        id: 'archon',
        name: 'Archon',
        emoji: '👾',
        shape: 'hex',
        col: 0x008888,
        hp: 4000,
        dmg: 40,
        spd: 2.2,
        sz: 55,
        xp: 450,
        abilities: ['laser', 'teleport']
    },
    {
        id: 'titan',
        name: 'Tytan',
        emoji: '🔥',
        shape: 'oct',
        col: 0xff4400,
        hp: 6000,
        dmg: 60,
        spd: 1.5,
        sz: 70,
        xp: 600,
        abilities: ['meteor', 'shield']
    }
];

export const BOSS_SPAWN_INTERVAL = 60; // Co 60 sekund