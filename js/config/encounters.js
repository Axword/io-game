export const SOLO_DURATION = 480;
export const SOLO_ENCOUNTERS = [
    { time: 90, id: 'destroyer', hp: 5000, dmg: 50, spd: 1.8, sz: 66, xp: 500 },
    { time: 240, id: 'archon', hp: 4000, dmg: 40, spd: 2.2, sz: 70, xp: 450 },
    { time: 420, id: 'titan', hp: 6000, dmg: 60, spd: 1.5, sz: 80, xp: 600 }
];

export const SOLO_DIFFICULTIES = {
    easy: { hp: 1, damage: 1, count: 0.8 },
    medium: { hp: 1.5, damage: 1, count: 1 },
    hard: { hp: 2, damage: 1, count: 1.15 },
    extreme: { hp: 3, damage: 1, count: 1.3 }
};
