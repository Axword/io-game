import { WORLDS, getWorld, PORTAL_RADIUS } from '../config/worlds.js';
import { ZONES } from '../config/constants.js';
import { MONSTER_CONFIG } from '../config/monsters.js';

export function xpNeededForLevel(level = 1) {
    return Math.floor(100 * Math.pow(1.18, Math.max(1, level) - 1));
}

export function unlockedWorldForLevel(level = 1) {
    let unlocked = 0;
    for (const world of WORLDS) if (level >= world.unlockLevel) unlocked = world.id;
    return unlocked;
}

export function canEnterWorld(player, worldId) {
    const world = WORLDS.find(world => world.id === Number(worldId));
    return !!world && player?.hp > 0 && (Math.max(player.level || 1, player.maxLevelReached || 1) >= world.unlockLevel || (player.unlockedWorld || 0) >= world.id);
}

export function isNearPortal(entity) {
    return Number.isFinite(entity?.x) && Number.isFinite(entity?.y) && Math.hypot(entity.x, entity.y) <= PORTAL_RADIUS;
}

// Resolve in place so the same rule applies to keyboard, touch and server movement.
export function resolveWorldMovement(entity, worldId = entity.worldId || 0, radius = 20) {
    const world = getWorld(worldId);
    const boundary = world.bounds - radius;
    entity.x = Math.max(-boundary, Math.min(boundary, Number.isFinite(entity.x) ? entity.x : 0));
    entity.y = Math.max(-boundary, Math.min(boundary, Number.isFinite(entity.y) ? entity.y : 0));
    for (let pass = 0; pass < 2; pass++) for (const obstacle of world.obstacles) {
        const dx = entity.x - obstacle.x, dy = entity.y - obstacle.y;
        const minimum = obstacle.r + radius;
        if (dx * dx + dy * dy >= minimum * minimum) continue;
        const distance = Math.hypot(dx, dy);
        const nx = distance > 0.001 ? dx / distance : 1;
        const ny = distance > 0.001 ? dy / distance : 0;
        entity.x = obstacle.x + nx * minimum;
        entity.y = obstacle.y + ny * minimum;
    }
    entity.x = Math.max(-boundary, Math.min(boundary, entity.x));
    entity.y = Math.max(-boundary, Math.min(boundary, entity.y));
    return entity;
}

export function isWorldSpawnClear(x, y, worldId = 0, radius = 35) {
    const world = getWorld(worldId);
    return Math.abs(x) < world.bounds - radius && Math.abs(y) < world.bounds - radius &&
        Math.hypot(x, y) > 180 && world.obstacles.every(obstacle => Math.hypot(x - obstacle.x, y - obstacle.y) > obstacle.r + radius);
}

const ZONE_RULES = [
    { id: 1, name: 'OBRZEŻA', min: 2 / 3, legacyZoneIdx: 4 },
    { id: 2, name: 'GŁĘBIA', min: 1 / 3, legacyZoneIdx: 2 },
    { id: 3, name: 'CENTRUM', min: 0, legacyZoneIdx: 0 }
];
const ZONE_COLORS = [
    [0xcbd9cf, 0xa8baa3, 0xb9a574, 0xa66d58, 0x804653],
    [0xcbdbe9, 0xa4bfd5, 0x9b9dbb, 0x98758e, 0x6a3f67],
    [0x443d51, 0x635064, 0x83565c, 0x954c4d, 0x702e3c]
];
const ZONE_BORDERS = [0x9acdb0, 0xe1d693, 0xf4c46d, 0xffa35b, 0xff6d5e];
const worldZones = new Map();

// Terrain, minimap, HUD and combat share the same three bands.
export function getWorldZones(worldId = 0) {
    const world = getWorld(worldId);
    if (!worldZones.has(world.id)) worldZones.set(world.id, ZONE_RULES.map((rule, index) => {
        const legacy = ZONES[rule.legacyZoneIdx], outer = ZONES[4];
        const tier = 4 - rule.legacyZoneIdx;
        const { base, zoneBonus } = MONSTER_CONFIG;
        const relative = key => ((base[key] + tier * zoneBonus[key]) * legacy.mScale) / (base[key] * outer.mScale);
        return Object.freeze({
            ...rule, mScale: legacy.mScale,
            monsterSpeed: legacy.monsterSpeed,
            hp: relative('hp'), damage: relative('dmg'), xp: relative('xp'),
            speed: legacy.monsterSpeed / outer.monsterSpeed,
            size: ((base.sz + tier * zoneBonus.sz) * (.85 + legacy.mScale * .05)) / (base.sz * (.85 + outer.mScale * .05)),
            minR: world.bounds * rule.min,
            maxR: index === 0 ? world.bounds * Math.SQRT2 : world.bounds * ZONE_RULES[index - 1].min,
            intensity: index / (ZONE_RULES.length - 1), color: ZONE_COLORS[world.id][tier], borderColor: ZONE_BORDERS[tier]
        });
    }));
    return worldZones.get(world.id);
}

export function getWorldZone(x, y, worldId = 0) {
    const distance = Number.isFinite(x) && Number.isFinite(y) ? Math.hypot(x, y) : Infinity;
    return getWorldZones(worldId).find(zone => distance >= zone.minR) || getWorldZones(worldId).at(-1);
}

// Strength belongs to an encounter at birth. Crossing a visible boundary never
// refills a wounded enemy or changes the XP already promised for defeating it.
export function getWorldDanger(x, y, worldId = 0) {
    return getWorldZone(x, y, worldId);
}

export function getWorldEdgeSpawn(worldId = 0, random = Math.random, occupied = []) {
    const world = getWorld(worldId);
    const occupants = Array.from(occupied);
    const edge = world.bounds - 240;
    const sample = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    const firstSide = Math.floor(sample * 4);
    const offset = (sample * 4 - firstSide - 0.5) * world.bounds * 1.3;
    let best = null, bestDistance = -1;
    for (let attempt = 0; attempt < 16; attempt++) {
        const side = (firstSide + attempt) % 4;
        const along = Math.max(-world.bounds * 0.7, Math.min(world.bounds * 0.7,
            offset + (Math.floor(attempt / 4) - 1) * 310));
        const point = side === 0 ? { x: -edge, y: along } : side === 1 ? { x: edge, y: along } :
            side === 2 ? { x: along, y: -edge } : { x: along, y: edge };
        if (!isWorldSpawnClear(point.x, point.y, worldId, 55)) continue;
        let nearest = Infinity;
        for (const entity of occupants) if (entity?.hp > 0 && (entity.worldId ?? worldId) === worldId) {
            nearest = Math.min(nearest, Math.hypot(entity.x - point.x, entity.y - point.y));
        }
        if (nearest > bestDistance) { best = point; bestDistance = nearest; }
        if (nearest >= 260) return point;
    }
    // World layouts leave this outer strip open; a bounded search also avoids
    // pathological retry loops when a multiplayer party fills every candidate.
    return best || resolveWorldMovement({ x: -edge, y: 0 }, worldId, 55);
}
