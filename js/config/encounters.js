export const SOLO_DURATION = 480;
export const SOLO_ENCOUNTERS = [
    { time: 90, id: 'destroyer', hp: 720, dmg: 14, spd: 1.1, sz: 66, xp: 180 },
    { time: 240, id: 'archon', hp: 1450, dmg: 18, spd: 1.3, sz: 70, xp: 260 },
    { time: 420, id: 'titan', hp: 2400, dmg: 22, spd: 1.15, sz: 80, xp: 380 }
];

export const SOLO_DIFFICULTIES = {
    easy: { hp: 0.8, damage: 0.75, count: 0.8 },
    medium: { hp: 1, damage: 1, count: 1 },
    hard: { hp: 1.25, damage: 1.2, count: 1.15 },
    extreme: { hp: 1.55, damage: 1.45, count: 1.3 }
};
