import { WORLDS, getWorld, PORTAL_RADIUS } from '../config/worlds.js';

export function xpNeededForLevel(level = 1) {
    return Math.floor(45 + Math.max(1, level) * 12 + Math.max(0, level - 60) * 80);
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
