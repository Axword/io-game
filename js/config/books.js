export const BOOKS = {
    vitality: {
        name: 'Księga Żywotności',
        icon: '❤️',
        col: 0xff0000,
        type: 'book',
        desc: 'Zwiększa maksymalne HP',
        stats: { maxHp: 20 },
        allowedUpgrades: ['bookPower']
    },
    armor: {
        name: 'Księga Pancerza',
        icon: '🛡️',
        col: 0x808080,
        type: 'book',
        desc: 'Redukuje otrzymywane obrażenia',
        stats: { armor: 5 },
        allowedUpgrades: ['bookPower']
    },
    regeneration: {
        name: 'Księga Regeneracji',
        icon: '💚',
        col: 0x00ff00,
        type: 'book',
        desc: 'Regeneruje HP co sekundę',
        stats: { regen: 1 },
        allowedUpgrades: ['bookPower']
    },
    speed: {
        name: 'Księga Szybkości',
        icon: '💨',
        col: 0x00ffff,
        type: 'book',
        desc: 'Zwiększa prędkość ruchu',
        stats: { moveSpeed: 0.15 },
        allowedUpgrades: ['bookPower']
    },
    luck: {
        name: 'Księga Szczęścia',
        icon: '🍀',
        col: 0xffff00,
        type: 'book',
        desc: 'Zwiększa szansę na lepsze upgrady',
        stats: { luck: 10 },
        allowedUpgrades: ['bookPower']
    },
    magnet: {
        name: 'Księga Magnetyzmu',
        icon: '🧲',
        col: 0xff00ff,
        type: 'book',
        desc: 'Zwiększa zasięg zbierania XP',
        stats: { magnetRange: 50 },
        allowedUpgrades: ['bookPower']
    },
    cooldown: {
        name: 'Księga Czasu',
        icon: '⏰',
        col: 0x4444ff,
        type: 'book',
        desc: 'Redukuje czas odnowienia wszystkich broni',
        stats: { cooldownReduction: 8 },
        allowedUpgrades: ['bookPower']
    },
    area: {
        name: 'Księga Mocy',
        icon: '💫',
        col: 0xff88ff,
        type: 'book',
        desc: 'Zwiększa obszar działania wszystkich broni',
        stats: { areaBonus: 10 },
        allowedUpgrades: ['bookPower']
    },
    critical: {
        name: 'Księga Precyzji',
        icon: '🎯',
        col: 0xffaa00,
        type: 'book',
        desc: 'Zwiększa szansę na trafienie krytyczne',
        stats: { critChance: 5, critDamage: 50 },
        allowedUpgrades: ['bookPower']
    },
    revival: {
        name: 'Księga Odrodzenia',
        icon: '👼',
        col: 0xffffff,
        type: 'book',
        desc: 'Dodaje dodatkowe życie',
        stats: { revives: 1 },
        allowedUpgrades: ['bookPower']
    }
};

export const ALL_BOOKS = ['vitality', 'armor', 'regeneration', 'speed', 'luck', 'magnet', 'cooldown', 'area', 'critical', 'revival'];