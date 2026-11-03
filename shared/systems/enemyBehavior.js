import { getWorld } from '../config/worlds.js';
import { MONSTER_CONFIG } from '../config/monsters.js';
import { resolveWorldMovement, getWorldDanger, getWorldZones } from './worldRules.js';
import { recordZoneEntry, hasEnteredZone } from './zoneAggro.js';

export function configureWorldEnemy(enemy, archetype, worldId = 0, progress = 0, difficulty = {}) {
    const world = getWorld(worldId);
    enemy.archetypeId = archetype.id;
    enemy.behavior = archetype.behavior;
    enemy.worldId = world.id;
    enemy.type = archetype.shape;
    const location = getWorldDanger(enemy.x, enemy.y, worldId);
    const anchor = difficulty.zoneAnchor ? getWorldDanger(difficulty.zoneAnchor.x, difficulty.zoneAnchor.y, worldId) : location;
    const override = getWorldZones(worldId).find(zone => zone.id === difficulty.zoneId);
    const danger = override || (anchor.id > location.id ? anchor : location);
    const tier = 4 - danger.legacyZoneIdx;
    const shade = [1, .94, .86, .77, .67][tier];
    const channel = shift => Math.round(((archetype.col >> shift) & 255) * shade);
    enemy.baseColor = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    enemy.col = enemy.baseColor;
    enemy.zoneId = danger.id;
    enemy.zoneIdx = danger.legacyZoneIdx;
    enemy.spawnZoneMin = danger.minR;
    enemy.spawnZoneMax = danger.maxR;
    enemy.spawnDanger = danger.intensity;
    // Preserve the original outer, middle and center combat strengths. Archetypes
    // vary that reference enemy; elapsed time never replaces spatial difficulty.
    const { base, zoneBonus: bonus, elite } = MONSTER_CONFIG;
    const scale = danger.mScale;
    enemy.maxHp = Math.round((base.hp + tier * bonus.hp) * scale * (difficulty.hp ?? 1.5) *
        world.hpScale * (archetype.hp / 18) * (enemy.isElite ? elite.hpMult : 1));
    enemy.hp = enemy.maxHp;
    enemy.dmg = Math.round((base.dmg + tier * bonus.dmg) * scale * world.damageScale *
        (archetype.dmg / 4) * (difficulty.damage ?? 1));
    enemy.spd = danger.monsterSpeed * (archetype.speed / 43) * (enemy.isElite ? elite.speedMult : 1);
    enemy.moveSpeed = enemy.spd * 55;
    enemy.sz = (base.sz + tier * bonus.sz) * (.85 + scale * .05) * (archetype.size / 28) *
        (enemy.isElite ? elite.sizeMult : 1);
    enemy.xp = Math.round((base.xp + tier * bonus.xp) * scale * world.xpScale *
        (archetype.xp / 8) * (enemy.isElite ? elite.xpMult : 1));
    enemy.canShoot = ['spitter', 'ringcaster', 'sentinel'].includes(enemy.behavior);
    enemy.isSoloMonster = true;
    enemy.shootTimer = 2 + Math.random() * 3;
    enemy.behaviorTime = Math.random() * Math.PI * 2;
    enemy.telegraph = null;
    enemy.dash = null;
    enemy.isDespawning = false;
    enemy.state = 'attacking';
    enemy.outsideZoneTimer = 0;
    enemy.returnTimer = 0;
    enemy.wanderAngle = Math.random() * Math.PI * 2;
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

// Separation runs after individual movement, so dormant crowds also need this
// band constraint at the end of the batch on both platforms.
export function constrainDormantEnemy(enemy) {
    if (enemy.state !== 'wandering' || enemy.hp <= 0) return;
    const minimum = enemy.spawnZoneMin + enemy.sz;
    const maximum = enemy.spawnZoneMax - enemy.sz;
    const radius = Math.hypot(enemy.x, enemy.y);
    const homeRadius = Math.max(minimum, Math.min(maximum, radius));
    if (homeRadius === radius) return;
    const angle = radius > .001 ? Math.atan2(enemy.y, enemy.x) : enemy.wanderAngle || 0;
    const obstacles = getWorld(enemy.worldId).obstacles;
    const clear = (x, y) => obstacles.every(obstacle =>
        Math.hypot(x - obstacle.x, y - obstacle.y) >= obstacle.r + enemy.sz * .5);
    // Scenery can cross a band boundary. Slide along the boundary instead of
    // projecting a collision-resolved monster back inside that scenery.
    for (const offset of [0, .04, -.04, .08, -.08, .16, -.16, .32, -.32]) {
        const x = Math.cos(angle + offset) * homeRadius;
        const y = Math.sin(angle + offset) * homeRadius;
        if (!clear(x, y)) continue;
        enemy.x = x; enemy.y = y;
        return;
    }
    const middle = (minimum + maximum) * .5;
    enemy.x = Math.cos(angle) * middle;
    enemy.y = Math.sin(angle) * middle;
    resolveWorldMovement(enemy, enemy.worldId, enemy.sz * .5);
}

function wanderInHomeZone(enemy, dt) {
    enemy.currentTarget = null;
    enemy.telegraph = null;
    enemy.dash = null;
    enemy.outsideZoneTimer = 0;
    enemy.returnTimer = 0;
    const minimum = enemy.spawnZoneMin + enemy.sz;
    const maximum = enemy.spawnZoneMax - enemy.sz;
    const radius = Math.hypot(enemy.x, enemy.y);
    const homeRadius = Math.max(minimum, Math.min(maximum, radius));
    if (Math.abs(homeRadius - radius) > 1) {
        // A death can leave the old pursuer outside its home band. It walks back
        // without attacking anyone who has not entered that band in this life.
        enemy.state = 'returning';
        const step = Math.min(Math.abs(homeRadius - radius), enemy.moveSpeed * 3.5 * dt) * Math.sign(homeRadius - radius);
        enemy.x += (radius > .001 ? enemy.x / radius : 1) * step;
        enemy.y += (radius > .001 ? enemy.y / radius : 0) * step;
        resolveWorldMovement(enemy, enemy.worldId, enemy.sz * .5);
        return;
    }
    enemy.state = 'wandering';
    enemy.behaviorTime = (enemy.behaviorTime || 0) + dt;
    enemy.wanderAngle = (enemy.wanderAngle || 0) + Math.sin(enemy.behaviorTime * .6) * .7 * dt;
    enemy.x += Math.cos(enemy.wanderAngle) * enemy.moveSpeed * .28 * dt;
    enemy.y += Math.sin(enemy.wanderAngle) * enemy.moveSpeed * .28 * dt;
    resolveWorldMovement(enemy, enemy.worldId, enemy.sz * .5);
    const movedRadius = Math.hypot(enemy.x, enemy.y);
    if (movedRadius < minimum || movedRadius > maximum) {
        constrainDormantEnemy(enemy);
        enemy.wanderAngle += Math.PI * .65;
    }
}

// The callback is the only platform-specific operation (Three.js or headless server).
export function updateWorldEnemy(enemy, dt, targets, emitShot) {
    if (enemy.hp <= 0) return;
    let target = null, distance = Infinity, targetMatchesZone = false, nearbyPlayer = false;
    for (const candidate of targets || []) {
        if (!candidate || candidate.hp <= 0 || (candidate.worldId !== undefined && candidate.worldId !== enemy.worldId)) continue;
        recordZoneEntry(candidate, enemy.worldId);
        const d = Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y);
        if (d > 1900) continue;
        nearbyPlayer = true;
        const matchesZone = getWorldDanger(candidate.x, candidate.y, enemy.worldId).id === enemy.zoneId;
        if (!hasEnteredZone(candidate, enemy.worldId, enemy.zoneId)) continue;
        if ((matchesZone && !targetMatchesZone) || (matchesZone === targetMatchesZone && d < distance)) {
            target = candidate; distance = d; targetMatchesZone = matchesZone;
        }
    }
    if (!target && nearbyPlayer && enemy.zoneId > 1) {
        wanderInHomeZone(enemy, dt);
        return;
    }
    if (!target || distance > 1900) {
        enemy.isDespawning = true; enemy.state = 'despawning'; enemy.hp = 0; return;
    }
    enemy.currentTarget = target;
    // Deeper crowds remember each visitor until that visitor dies. Outer mobs
    // retain their old leash so weak enemies do not flood the stronger center.
    const targetInZone = getWorldDanger(target.x, target.y, enemy.worldId).id === enemy.zoneId ||
        (enemy.zoneId > 1 && hasEnteredZone(target, enemy.worldId, enemy.zoneId));
    enemy.outsideZoneTimer = targetInZone ? 0 : (enemy.outsideZoneTimer || 0) + dt;
    if (targetInZone) { enemy.state = 'attacking'; enemy.returnTimer = 0; }
    if (enemy.outsideZoneTimer >= MONSTER_CONFIG.chase.outsideZoneTimeout) {
        enemy.state = 'returning';
        enemy.telegraph = null; enemy.dash = null;
        enemy.returnTimer = (enemy.returnTimer || 0) + dt;
        const radius = Math.hypot(enemy.x, enemy.y);
        const homeRadius = Math.max(enemy.spawnZoneMin + enemy.sz, Math.min(enemy.spawnZoneMax - enemy.sz, radius));
        if (Math.abs(homeRadius - radius) > 1 && radius > .001) {
            const step = Math.min(Math.abs(homeRadius - radius), enemy.moveSpeed * 3.5 * dt) * Math.sign(homeRadius - radius);
            enemy.x += enemy.x / radius * step;
            enemy.y += enemy.y / radius * step;
            resolveWorldMovement(enemy, enemy.worldId, enemy.sz * .5);
        }
        if (enemy.returnTimer >= MONSTER_CONFIG.despawn.timeout) {
            enemy.isDespawning = true; enemy.state = 'despawning'; enemy.hp = 0;
        }
        return;
    }
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
