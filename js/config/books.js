export const BOOKS = {
    vitality: {
        name: 'Księga Żywotności',
        icon: '❤️',
        col: 0xff0000,
        type: 'book',
        desc: 'Zwiększa maksymalne HP o 10% bazowego HP',
        stats: { maxHp: 0.1 },
        allowedUpgrades: ['bookPower']
    },
    speed: {
        name: 'Księga Szybkości',
        icon: '💨',
        col: 0x00ffff,
        type: 'book',
        desc: 'Zwiększa prędkość ruchu o 8%',
        stats: { moveSpeed: 0.08 },
        allowedUpgrades: ['bookPower']
    },
    cooldown: {
        name: 'Księga Czasu',
        icon: '⏰',
        col: 0x4444ff,
        type: 'book',
        desc: 'Redukuje czas odnowienia wszystkich broni o 5%',
        stats: { cooldownReduction: 5 },
        allowedUpgrades: ['bookPower']
    },
    magnet: {
        name: 'Księga Magnetyzmu',
        icon: '🧲',
        col: 0xff00ff,
        type: 'book',
        desc: 'Zwiększa zasięg zbierania XP o 30 jednostek',
        stats: { magnetRange: 30 },
        allowedUpgrades: ['bookPower']
    },
    critical: {
        name: 'Księga Precyzji',
        icon: '🎯',
        col: 0xffaa00,
        type: 'book',
        desc: 'Zwiększa szansę na krytyk o 3% i obrażenia krytyczne o 10%',
        stats: { critChance: 3, critDamage: 10 },
        allowedUpgrades: ['bookPower']
    },
    damage: {
        name: 'Księga Mocy',
        icon: '💥',
        col: 0xff8800,
        type: 'book',
        desc: 'Zwiększa obrażenia wszystkich broni o 5%',
        stats: { damageBonus: 5 },
        allowedUpgrades: ['bookPower']
    },
    area: {
        name: 'Księga Rozprzestrzeniania',
        icon: '💫',
        col: 0x88ff88,
        type: 'book',
        desc: 'Zwiększa obszar działania broni o 8%',
        stats: { areaBonus: 8 },
        allowedUpgrades: ['bookPower']
    },
    luck: {
        name: 'Księga Szczęścia',
        icon: '🍀',
        col: 0xffff00,
        type: 'book',
        desc: 'Zwiększa szansę na lepsze upgrady o 5%',
        stats: { luck: 5 },
        allowedUpgrades: ['bookPower']
    },
    revival: {
        name: 'Księga Odrodzenia',
        icon: '👼',
        col: 0xffffff,
        type: 'book',
        desc: 'Daje 1 dodatkowe życie',
        stats: { revives: 1 },
        allowedUpgrades: ['bookPower']
    },
    regeneration: {
        name: 'Księga Regeneracji',
        icon: '💚',
        col: 0x00ff88,
        type: 'book',
        desc: 'Regeneruje 0.5 HP na sekundę',
        stats: { regen: 0.5 },
        allowedUpgrades: ['bookPower']
    }
};

export const ALL_BOOKS = Object.keys(BOOKS);