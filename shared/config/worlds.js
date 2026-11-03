const enemy = (id, name, behavior, shape, col, hp, dmg, speed, size, xp, weight) =>
    ({ id, name, behavior, shape, col, hp, dmg, speed, size, xp, weight });

// Coordinates are shared by simulation, collision, map art and portal interaction.
export const WORLDS = [
    {
        id: 0, name: 'Szmaragdowa Polana', unlockLevel: 1, bounds: 2800,
        palette: { ground: 0xcbd9cf, grid: 0xb7c9bc, accent: 0x59d797, obstacle: 0x507c65 },
        hpScale: 1, damageScale: 1, xpScale: 1,
        enemies: [
            enemy('mossling', 'Mchownik', 'pursuer', 'pent', 0x9f4cf0, 18, 4, 43, 28, 8, 5),
            enemy('bramble', 'Cierniak', 'weaver', 'tri', 0xb257f0, 16, 4, 48, 28, 9, 3),
            enemy('spore', 'Zarodnik', 'spitter', 'hex', 0x7b52d5, 25, 5, 30, 33, 12, 2)
        ],
        obstacles: [
            { x: -610, y: 390, r: 90 }, { x: -480, y: 500, r: 60 },
            { x: 650, y: -430, r: 110 }, { x: 760, y: -530, r: 58 },
            { x: 1300, y: 800, r: 100 }, { x: -1300, y: -800, r: 110 },
            { x: 120, y: 1450, r: 120 }, { x: -150, y: -1480, r: 90 },
            { x: 2050, y: -1200, r: 125 }, { x: -1950, y: 1300, r: 125 }
        ]
    },
    {
        id: 1, name: 'Kryształowy Lodowiec', unlockLevel: 30, bounds: 2800,
        palette: { ground: 0xcbdbe9, grid: 0xb4c7dc, accent: 0x50d7ff, obstacle: 0x6391bd },
        hpScale: 1.3, damageScale: 1, xpScale: 1.4,
        enemies: [
            enemy('shard', 'Odłamek', 'runner', 'dia', 0x548bea, 36, 7, 65, 25, 15, 4),
            enemy('glacier', 'Lodowy Strażnik', 'bruiser', 'sq', 0x7d6cce, 100, 10, 27, 45, 23, 3),
            enemy('frostseer', 'Mroźny Wieszcz', 'ringcaster', 'hex', 0x8c62df, 54, 8, 34, 34, 20, 2)
        ],
        obstacles: [
            { x: -550, y: 600, r: 95 }, { x: 550, y: 600, r: 95 },
            { x: -550, y: -600, r: 95 }, { x: 550, y: -600, r: 95 },
            { x: -1250, y: 0, r: 140 }, { x: 1250, y: 0, r: 140 },
            { x: 0, y: 1400, r: 140 }, { x: 0, y: -1400, r: 140 },
            { x: 1900, y: 1700, r: 160 }, { x: -1900, y: -1700, r: 160 },
            { x: 1850, y: -1800, r: 105 }, { x: -1850, y: 1800, r: 105 }
        ]
    },
    {
        id: 2, name: 'Żarząca Otchłań', unlockLevel: 60, bounds: 2800,
        palette: { ground: 0x443d51, grid: 0x50465d, accent: 0xffaa46, obstacle: 0x292338 },
        hpScale: 1.6, damageScale: 1, xpScale: 1.8,
        enemies: [
            enemy('cinder', 'Żarowy Szarżownik', 'charger', 'tri', 0xff7957, 105, 12, 50, 35, 30, 3),
            enemy('obsidian', 'Obsydianowy Wartownik', 'sentinel', 'oct', 0xb05dce, 160, 15, 27, 43, 36, 3),
            enemy('wisp', 'Iskrownik', 'swarm', 'dia', 0xfb9e63, 68, 10, 78, 22, 24, 5)
        ],
        obstacles: [
            { x: -620, y: 200, r: 130 }, { x: 620, y: -200, r: 130 },
            { x: -1100, y: 700, r: 170 }, { x: 1100, y: -700, r: 170 },
            { x: 650, y: 1200, r: 100 }, { x: -650, y: -1200, r: 100 },
            { x: -1800, y: -900, r: 140 }, { x: 1800, y: 900, r: 140 },
            { x: 150, y: 1900, r: 165 }, { x: -150, y: -1900, r: 165 },
            { x: 2150, y: -1750, r: 100 }, { x: -2150, y: 1750, r: 100 }
        ]
    }
];

export function getWorld(id = 0) {
    return WORLDS.find(world => world.id === Number(id)) || WORLDS[0];
}

export function enemyById(id, worldId = 0) {
    return getWorld(worldId).enemies.find(enemy => enemy.id === id) || getWorld(worldId).enemies[0];
}

export const PORTAL_RADIUS = 100;
