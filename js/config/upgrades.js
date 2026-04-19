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
            common: [1, 1],
            enhanced: [1, 2],
            rare: [2, 3],
            legendary: [3, 5]
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
            common: [1, 1],
            enhanced: [1, 2],
            rare: [2, 3],
            legendary: [3, 4]
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
            common: [1, 1],
            enhanced: [1, 2],
            rare: [2, 3],
            legendary: [3, 4]
        }
    },
    chain: {
        id: 'chain',
        name: 'Łańcuch',
        icon: '⛓️',
        desc: '+X przeskoków',
        isAdditive: true,
        ranges: {
            common: [1, 1],
            enhanced: [1, 2],
            rare: [2, 3],
            legendary: [3, 5]
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