export const UPGRADE_TYPES = {
    damage: {
        id: 'damage',
        name: 'Obrażenia',
        icon: '💥',
        desc: 'Zwiększa obrażenia o +X%',
        ranges: {
            common: [10, 20],
            enhanced: [20, 35],
            rare: [35, 55],
            legendary: [55, 85]
        }
    },
    attackSpeed: {
        id: 'attackSpeed',
        name: 'Szybkość Ataku',
        icon: '⚡',
    desc: 'Zwiększa szybkość ataku o +X%',
        ranges: {
            common: [8, 15],
            enhanced: [15, 25],
            rare: [25, 40],
            legendary: [40, 65]
        }
    },
    projectileCount: {
        id: 'projectileCount',
        name: 'Wielokrotność',
        icon: '🎯',
        desc: '+X pocisków',
        isAdditive: true,
        ranges: {
            common: [0.5, 0.5],
            enhanced: [0.5, 1.0],
            rare: [1.0, 1.5],
            legendary: [1.5, 2.5]
        }
    },
    projectileSize: {
        id: 'projectileSize',
        name: 'Wielkość',
        icon: '⬤',
        desc: 'Zwiększa rozmiar o +X%',
        ranges: {
            common: [15, 25],
            enhanced: [25, 40],
            rare: [40, 60],
            legendary: [60, 90]
        }
    },
    projectileSpeed: {
        id: 'projectileSpeed',
        name: 'Prędkość Pocisku',
        icon: '🚀',
        desc: 'Zwiększa prędkość o +X%',
        ranges: {
            common: [10, 20],
            enhanced: [20, 35],
            rare: [35, 55],
            legendary: [55, 85]
        }
    },
    pierce: {
        id: 'pierce',
        name: 'Przebicie',
        icon: '🔱',
        desc: '+X przebić',
        isAdditive: true,
        ranges: {
            common: [0.5, 0.5],
            enhanced: [0.5, 1.0],
            rare: [1.0, 1.5],
            legendary: [1.5, 2.5]
        }
    },
    range: {
        id: 'range',
        name: 'Zasięg',
        icon: '📡',
        desc: 'Zwiększa zasięg o +X%',
        ranges: {
            common: [8, 12],
            enhanced: [12, 18],
            rare: [18, 28],
            legendary: [28, 40]
        }
    },
    bounce: {
        id: 'bounce',
        name: 'Rykoszet',
        icon: '🔄',
        desc: '+X odbić',
        isAdditive: true,
        ranges: {
            common: [0.5, 0.5],
            enhanced: [0.5, 1.0],
            rare: [1.0, 1.5],
            legendary: [1.5, 2.0]
        }
    },
    chain: {
        id: 'chain',
        name: 'Łańcuch',
        icon: '⛓️',
        desc: '+X przeskoków',
        isAdditive: true,
        ranges: {
            common: [0.5, 0.5],
            enhanced: [0.5, 1.0],
            rare: [1.0, 1.5],
            legendary: [1.5, 2.5]
        }
    },
    duration: {
        id: 'duration',
        name: 'Czas Trwania',
        icon: '⏱️',
        desc: 'Zwiększa czas o +X%',
        ranges: {
            common: [15, 25],
            enhanced: [25, 40],
            rare: [40, 60],
            legendary: [60, 90]
        }
    },
    explosion: {
        id: 'explosion',
        name: 'Eksplozja',
        icon: '💣',
        desc: 'Zwiększa zasięg wybuchu o +X%',
        ranges: {
            common: [20, 30],
            enhanced: [30, 50],
            rare: [50, 80],
            legendary: [80, 120]
        }
    },
    critChance: {
        id: 'critChance',
        name: 'Szansa na Krytyk',
        icon: '🎯',
        desc: 'Zwiększa szansę na krytyk o +X%',
        ranges: {
            common: [3, 5],
            enhanced: [5, 10],
            rare: [10, 15],
            legendary: [15, 25]
        }
    },
    critDamage: {
        id: 'critDamage',
        name: 'Obrażenia Krytyczne',
        icon: '💥💥',
        desc: 'Zwiększa obrażenia krytyczne o +X%',
        ranges: {
            common: [10, 20],
            enhanced: [20, 35],
            rare: [35, 55],
            legendary: [55, 85]
        }
    },
    bookPower: {
        id: 'bookPower',
        name: 'Moc Księgi',
        icon: '📖',
        desc: 'Zwiększa efekt o +X%',
        ranges: {
            common: [20, 30],
            enhanced: [30, 50],
            rare: [50, 80],
            legendary: [80, 120]
        }
    }
};