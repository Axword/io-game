import { getWorld } from '../config/worlds.js';
import { resolveWorldMovement } from './worldRules.js';

export function configureWorldEnemy(enemy, archetype, worldId = 0, progress = 0, difficulty = {}) {
    const world = getWorld(worldId);
    progress = Math.max(0, Math.min(1, progress));
    enemy.archetypeId = archetype.id;
    enemy.behavior = archetype.behavior;
    enemy.worldId = world.id;
    enemy.type = archetype.shape;
    enemy.baseColor = archetype.col;
    enemy.col = archetype.col;
    const elite = enemy.isElite ? 2.6 : 1;
    enemy.maxHp = Math.round(archetype.hp * (1 + progress * 2.8) * world.hpScale * (difficulty.hp || 1) * elite);
    enemy.hp = enemy.maxHp;
    enemy.dmg = archetype.dmg * (1 + progress * 0.65) * world.damageScale * (difficulty.damage || 1) * (enemy.isElite ? 1.3 : 1);
    enemy.moveSpeed = archetype.speed * (1 + progress * 0.16) * (enemy.isElite ? 1.08 : 1);
    enemy.spd = enemy.moveSpeed / 55;
    enemy.sz = archetype.size * (enemy.isElite ? 1.25 : 1);
    enemy.xp = Math.round(archetype.xp * (1 + progress * 0.8) * world.xpScale * (enemy.isElite ? 4 : 1));
    enemy.canShoot = ['spitter', 'ringcaster', 'sentinel'].includes(enemy.behavior);
    enemy.isSoloMonster = true;
    enemy.shootTimer = 2 + Math.random() * 3;
    enemy.behaviorTime = Math.random() * Math.PI * 2;
    enemy.telegraph = null;
    enemy.dash = null;
    enemy.isDespawning = false;
    enemy.state = 'attacking';
    return enemy;
}

function startAttack(enemy, target) {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.telegraph = { type: enemy.behavior, angle, remaining: enemy.behavior === 'charger' ? 0.9 : 1.05, distance: enemy.behavior === 'charger' ? 280 : 420 };
}

function releaseAttack(enemy, emitShot) {
    const attack = enemy.telegraph;
    const kind = enemy.behavior;
    if (kind === 'charger') enemy.dash = { angle: attack.angle, remaining: 0.48 };
    else {
        const count = kind === 'ringcaster' ? 6 : kind === 'sentinel' ? 3 : 1;
        for (let i = 0; i < count; i++) {
            const angle = kind === 'ringcaster' ? attack.angle + Math.PI * 2 * i / count : attack.angle + (i - (count - 1) / 2) * 0.24;
            const speed = kind === 'spitter' ? 2.4 : 2.65;
            emitShot?.({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
                dmg: enemy.dmg * 0.8, size: kind === 'sentinel' ? 1.1 : 0.9, life: 3,
                col: kind === 'sentinel' ? 0xff9860 : 0x4bd9ff });
        }
    }
    enemy.telegraph = null;
    enemy.shootTimer = kind === 'charger' ? 4.6 : kind === 'ringcaster' ? 5.2 : 4.2;
}

// The callback is the only platform-specific operation (Three.js or headless server).
export function updateWorldEnemy(enemy, dt, targets, emitShot) {
    if (enemy.hp <= 0) return;
    let target = null, distance = Infinity;
    for (const candidate of targets || []) {
        if (!candidate || candidate.hp <= 0 || (candidate.worldId !== undefined && candidate.worldId !== enemy.worldId)) continue;
        const d = Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y);
        if (d < distance) { target = candidate; distance = d; }
    }
    if (!target || distance > 1900) {
        enemy.isDespawning = true; enemy.state = 'despawning'; enemy.hp = 0; return;
    }
    enemy.currentTarget = target;
    enemy.behaviorTime = (enemy.behaviorTime || 0) + dt;
    const dx = target.x - enemy.x, dy = target.y - enemy.y;
    const nx = dx / Math.max(distance, 0.001), ny = dy / Math.max(distance, 0.001);
    if (enemy.dash) {
        const duration = Math.min(dt, enemy.dash.remaining);
        enemy.x += Math.cos(enemy.dash.angle) * (280 / 0.48) * duration;
        enemy.y += Math.sin(enemy.dash.angle) * (280 / 0.48) * duration;
        enemy.dash.remaining -= dt;
        if (enemy.dash.remaining <= 0) enemy.dash = null;
    } else if (enemy.telegraph) {
        enemy.telegraph.remaining -= dt;
        if (enemy.telegraph.remaining <= 0) releaseAttack(enemy, emitShot);
    } else {
        const ranged = enemy.canShoot;
        let vx = nx, vy = ny;
        if (ranged && distance < 300) { vx = -nx * 0.65; vy = -ny * 0.65; }
        else if (ranged && distance < 390) { vx = -ny * 0.5; vy = nx * 0.5; }
        if (enemy.behavior === 'weaver') {
            const sway = Math.sin(enemy.behaviorTime * 3) * 0.65;
            vx += -ny * sway; vy += nx * sway;
        } else if (enemy.behavior === 'swarm') {
            const flank = Math.sin(enemy.behaviorTime * 1.8) * 0.8;
            vx += -ny * flank; vy += nx * flank;
        } else if (enemy.behavior === 'runner') {
            const burst = Math.sin(enemy.behaviorTime * 2.2) > 0.45 ? 1.3 : 0.8;
            vx *= burst; vy *= burst;
        }
        // A local tangent keeps simple pursuit from pinning on circular scenery.
        for (const obstacle of getWorld(enemy.worldId).obstacles) {
            const ox = obstacle.x - enemy.x, oy = obstacle.y - enemy.y;
            const range = obstacle.r + enemy.sz * 0.5 + 65;
            const squared = ox * ox + oy * oy;
            if (squared > range * range || squared < 0.0001 || ox * vx + oy * vy <= 0) continue;
            const obstacleDistance = Math.hypot(ox, oy);
            const side = ox * ny - oy * nx >= 0 ? 1 : -1;
            vx -= oy / obstacleDistance * side * 1.1;
            vy += ox / obstacleDistance * side * 1.1;
        }
        const magnitude = Math.hypot(vx, vy);
        if (magnitude > 1.5) { vx *= 1.5 / magnitude; vy *= 1.5 / magnitude; }
        if (distance > 12) {
            enemy.x += vx * enemy.moveSpeed * dt;
            enemy.y += vy * enemy.moveSpeed * dt;
        }
        if (ranged || enemy.behavior === 'charger') {
            enemy.shootTimer -= dt;
            if (enemy.shootTimer <= 0 && distance < (enemy.behavior === 'charger' ? 450 : 520)) startAttack(enemy, target);
        }
    }
    resolveWorldMovement(enemy, enemy.worldId, enemy.sz * 0.5);
}
