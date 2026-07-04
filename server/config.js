import { ZONES, WORLD, MOVEMENT_MULTIPLIER, SPAWN_POINTS, DIFFICULTY_CONFIG, BOSS_TYPES, BOSS_SPAWN_INTERVAL, RARITIES } from '../shared/config/constants.js';
import { CLASSES } from '../shared/config/classes.js';
import { BOOKS, ALL_BOOKS } from '../shared/config/books.js';
import { UPGRADE_TYPES } from '../shared/config/upgrades.js';
import { MONSTER_CONFIG } from '../shared/config/monsters.js';

export const SERVER_CONFIG = {
    PORT: process.env.PORT || 3000,
    TICK_RATE: 20,              // 25 TPS = 40 ms
    TICK_MS: 30,
    MAX_ROOMS: 50,
    MAX_PLAYERS_PER_ROOM: 16,
    MAX_MONSTERS_PER_ROOM: 1500,
    DEFAULT_BOTS: true,
    DEFAULT_DIFFICULTY: 'medium',
    RECONNECT_TIMEOUT_MS: 30000,
    ROOM_CLEANUP_AGE_MS: 5 * 60 * 1000, // 5 min empty room
    BROADCAST_FULL_STATE_EVERY: 1,      // every tick
    INPUT_QUEUE_LIMIT: 8
};

export {
    ZONES,
    WORLD,
    MOVEMENT_MULTIPLIER,
    SPAWN_POINTS,
    DIFFICULTY_CONFIG,
    BOSS_TYPES,
    BOSS_SPAWN_INTERVAL,
    RARITIES,
    CLASSES,
    BOOKS,
    ALL_BOOKS,
    UPGRADE_TYPES,
    MONSTER_CONFIG
};

export function getClassData(cls) {
    return CLASSES[cls] || CLASSES.warrior;
}
