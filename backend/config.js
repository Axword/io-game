// server/config.js
export const WORLD_SIZE = 12000;
export const MOVEMENT_MULTIPLIER = 1.0; // Dostosuj do klienta
export const TICK_RATE = 20; // 20 ticków na sekundę (50ms) - oszczędza transfer
export const DT = 1 / TICK_RATE;

export const CLASSES = {
    warrior: { hp: 120, spd: 4.5, weapon: 'sword' },
    archer:  { hp: 90,  spd: 5.5, weapon: 'bow' },
    mage:    { hp: 80,  spd: 5.0, weapon: 'wand' },
    berserker: { hp: 150, spd: 4.0, weapon: 'axe' }
};