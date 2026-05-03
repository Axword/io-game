const addFlat = (player, key, value) => {
    player[key] = (player[key] || 0) + value;
};

const addPct = (player, key, value, max = 999) => {
    player[key] = Math.min(max, (player[key] || 0) + value);
};

export const CLASSES = {
    warrior: {
        name: 'Wojownik',
        emoji: '🛡️',
        desc: 'Wytrzymała klasa walcząca z bliska. Z poziomami dostaje więcej życia, pancerza i szybkości ataku.',
        col: 0x4488ff,
        weapon: 'aura',
        hp: 145,
        spd: 1.00,
        shape: 'sq',
        baseBonuses: {
            armor: 4,
            damageBonus: 4
        },
        levelBonus: (player, level) => {
            addFlat(player, 'maxHp', 4);
            if (level % 3 === 0) addFlat(player, 'armor', 1.5);
            if (level % 4 === 0) addPct(player, 'attackSpeedBonus', 3, 80);
            if (level % 6 === 0) addPct(player, 'areaBonus', 2, 60);
        }
    },

    archer: {
        name: 'Łucznik',
        emoji: '🏹',
        desc: 'Szybka i precyzyjna klasa dystansowa. Z poziomami rośnie szansa na krytyki i prędkość pocisków.',
        col: 0x44ff88,
        weapon: 'bow',
        hp: 92,
        spd: 1.16,
        shape: 'tri',
        baseBonuses: {
            critChance: 8,
            projectileSpeedBonus: 6
        },
        levelBonus: (player, level) => {
            addPct(player, 'critChance', 1.5, 220);
            if (level % 2 === 0) addPct(player, 'critDamage', 6, 450);
            if (level % 4 === 0) addPct(player, 'projectileSpeedBonus', 4, 120);
            if (level % 5 === 0) addPct(player, 'attackSpeedBonus', 2, 80);
        }
    },

    mage: {
        name: 'Mag',
        emoji: '🔮',
        desc: 'Specjalista od walki obszarowej. Z poziomami zwiększa zasięg działania, skraca odnowienie i wzmacnia zaklęcia.',
        col: 0xcc44ff,
        weapon: 'lightning',
        hp: 102,
        spd: 1.03,
        shape: 'cir',
        baseBonuses: {
            areaBonus: 8,
            cooldownReduction: 4
        },
        levelBonus: (player, level) => {
            addPct(player, 'areaBonus', 2, 100);
            if (level % 3 === 0) addPct(player, 'cooldownReduction', 2, 45);
            if (level % 4 === 0) addPct(player, 'damageBonus', 2, 120);
            if (level % 6 === 0) addFlat(player, 'luck', 2);
        }
    },

    berserker: {
        name: 'Berserker',
        emoji: '🪓',
        desc: 'Agresywna klasa nastawiona na obrażenia. Z poziomami staje się coraz szybszy i silniejszy.',
        col: 0xff6644,
        weapon: 'axe',
        hp: 125,
        spd: 1.12,
        shape: 'dia',
        baseBonuses: {
            damageBonus: 6,
            attackSpeedBonus: 4
        },
        levelBonus: (player, level) => {
            addPct(player, 'damageBonus', 2, 150);
            if (level % 2 === 0) addPct(player, 'attackSpeedBonus', 2, 90);
            if (level % 4 === 0) addPct(player, 'moveSpeedBonus', 1.5, 35);
            if (level % 6 === 0) addFlat(player, 'maxHp', 6);
        }
    },

    pyromancer: {
        name: 'Piromanta',
        emoji: '🔥',
        desc: 'Włada ogniem i eksplozjami. Z poziomami zwiększa obrażenia obszarowe i rozmiar ataków.',
        col: 0xff3300,
        weapon: 'fireball',
        hp: 96,
        spd: 1.02,
        shape: 'cir',
        baseBonuses: {
            areaBonus: 10,
            projectileSizeBonus: 5
        },
        levelBonus: (player, level) => {
            addPct(player, 'areaBonus', 2.5, 120);
            if (level % 2 === 0) addPct(player, 'damageBonus', 2, 120);
            if (level % 4 === 0) addPct(player, 'projectileSizeBonus', 4, 120);
            if (level % 6 === 0) addPct(player, 'critChance', 1, 120);
        }
    },

    assassin: {
        name: 'Zabójca',
        emoji: '🗡️',
        desc: 'Bardzo szybka klasa oparta na krytykach. Z poziomami zwiększa szansę i siłę trafień krytycznych.',
        col: 0xaaaaaa,
        weapon: 'knife',
        hp: 84,
        spd: 1.20,
        shape: 'tri',
        baseBonuses: {
            critChance: 12,
            critDamage: 25
        },
        levelBonus: (player, level) => {
            addPct(player, 'critChance', 2, 250);
            if (level % 2 === 0) addPct(player, 'critDamage', 8, 500);
            if (level % 4 === 0) addPct(player, 'attackSpeedBonus', 2, 90);
            if (level % 5 === 0) addPct(player, 'moveSpeedBonus', 2, 40);
        }
    },

    necromancer: {
        name: 'Nekromanta',
        emoji: '☠️',
        desc: 'Powolna, ale stabilna klasa oparta na truciznach i przetrwaniu. Z poziomami zyskuje regenerację i większy obszar działania.',
        col: 0x00cc44,
        weapon: 'poison',
        hp: 110,
        spd: 0.98,
        shape: 'dia',
        baseBonuses: {
            regen: 0.35,
            areaBonus: 4
        },
        levelBonus: (player, level) => {
            addFlat(player, 'regen', 0.08);
            if (level % 3 === 0) addPct(player, 'areaBonus', 2, 80);
            if (level % 4 === 0) addFlat(player, 'maxHp', 5);
            if (level % 5 === 0) addFlat(player, 'magnetRange', 10);
        }
    },

    paladin: {
        name: 'Paladyn',
        emoji: '⚔️',
        desc: 'Dobrze zbalansowana klasa defensywna. Z poziomami zyskuje życie, pancerz i trochę mocy ofensywnej.',
        col: 0x88ccff,
        weapon: 'sword',
        hp: 138,
        spd: 0.96,
        shape: 'sq',
        baseBonuses: {
            armor: 5,
            critDamage: 10
        },
        levelBonus: (player, level) => {
            addFlat(player, 'maxHp', 3);
            if (level % 2 === 0) addFlat(player, 'armor', 1);
            if (level % 4 === 0) addPct(player, 'damageBonus', 2, 90);
            if (level % 6 === 0) addPct(player, 'critChance', 1.5, 120);
        }
    },

    warlock: {
        name: 'Czarnoksiężnik',
        emoji: '📡',
        desc: 'Klasa dystansowa z dużym zasięgiem. Z poziomami zwiększa zasięg, obrażenia i skraca czas odnowienia.',
        col: 0xff00ff,
        weapon: 'laser',
        hp: 90,
        spd: 1.04,
        shape: 'cir',
        baseBonuses: {
            rangeBonus: 8,
            cooldownReduction: 3
        },
        levelBonus: (player, level) => {
            addPct(player, 'cooldownReduction', 1.5, 45);
            if (level % 2 === 0) addPct(player, 'rangeBonus', 2, 100);
            if (level % 4 === 0) addPct(player, 'damageBonus', 2, 100);
            if (level % 6 === 0) addPct(player, 'projectileSizeBonus', 3, 100);
        }
    },

    druid: {
        name: 'Druid',
        emoji: '☄️',
        desc: 'Klasa oparta na kontroli pola walki. Z poziomami zwiększa obszar działania, obrażenia i wygodę zbierania XP.',
        col: 0xff8800,
        weapon: 'meteor',
        hp: 118,
        spd: 1.01,
        shape: 'dia',
        baseBonuses: {
            areaBonus: 6,
            magnetRange: 20
        },
        levelBonus: (player, level) => {
            addPct(player, 'areaBonus', 1.5, 100);
            if (level % 2 === 0) addPct(player, 'damageBonus', 1.5, 100);
            if (level % 4 === 0) addFlat(player, 'magnetRange', 12);
            if (level % 6 === 0) addFlat(player, 'luck', 2);
        }
    }
};