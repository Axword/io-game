import { v4 as uuidv4 } from 'uuid';
import { rng, getZoneIdx } from '../../shared/utils/math.js';
import { MONSTER_CONFIG } from '../../shared/config/monsters.js';
import { ZONES, WORLD } from '../../shared/config/constants.js';
import { ServerBullet } from './bullet.js';

export class ServerMonster {
    constructor(x, y, zoneIdx, zones, hpMult = 1.0) {
        this.id = 'm_' + uuidv4().slice(0, 8);
        this.x = x;
        this.y = y;
        this.zoneIdx = Math.max(0, zoneIdx);
        this.zones = zones || ZONES;
        this.isBoss = false;
        this.hitTimer = 0;
        this.shootTimer = rng(2, 4);
        this.currentTarget = null;
        this.outsideZoneTimer = 0;
        this.despawnTimer = 0;
        this.state = 'attacking';
        this.retreatTarget = null;
        this.isDespawning = false;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitDir = Math.random() < 0.5 ? 1 : -1;
        this.lastHitBy = null;
        this._dmgMap = new Map();

        this.initMonster(hpMult);

        this.canShoot = this.zoneIdx <= 1;
        this.shootRange = this.getShootingStat('ranges');
        this.bulletSpeed = this.getShootingStat('speeds');
        this.bulletLifetime = this.getShootingStat('lifetimes');
    }

    getShootingStat(stat) {
        const data = MONSTER_CONFIG.shooting[stat];
        return data[this.zoneIdx] || 0;
    }

    initMonster(hpMult) {
        const z = this.zones[this.zoneIdx];
        const sc = z.mScale;
        const base = MONSTER_CONFIG.base;
        const bonus = MONSTER_CONFIG.zoneBonus;
        const elite = MONSTER_CONFIG.elite;
        const zoneMultiplier = 4 - this.zoneIdx;

        this.isElite = Math.random() < elite.chance;
        this.type = this.getShapeForZone();

        const eliteHpMult = this.isElite ? elite.hpMult : 1;
        const eliteSpeedMult = this.isElite ? elite.speedMult : 1;
        const eliteXpMult = this.isElite ? elite.xpMult : 1;
        const eliteSizeMult = this.isElite ? elite.sizeMult : 1;

        this.maxHp = Math.round((base.hp + zoneMultiplier * bonus.hp) * sc * eliteHpMult * hpMult);
        this.hp = this.maxHp;
        this.dmg = Math.round((base.dmg + zoneMultiplier * bonus.dmg) * sc);
        this.spd = (z.monsterSpeed || 1.4) * eliteSpeedMult;
        this.sz = (base.sz + zoneMultiplier * bonus.sz) * (0.85 + sc * 0.05) * eliteSizeMult;
        this.xp = Math.round((base.xp + zoneMultiplier * bonus.xp) * sc * eliteXpMult);
        this.baseColor = MONSTER_CONFIG.colors[Math.min(this.zoneIdx, MONSTER_CONFIG.colors.length - 1)];

        this.spawnZoneMin = z.minR;
        this.spawnZoneMax = z.maxR;
    }

    getShapeForZone() {
        const zi = this.zoneIdx;
        const shapes = MONSTER_CONFIG.shapes;
        if (zi <= 1) return shapes.low[Math.floor(Math.random() * 2)];
        if (zi <= 3) return shapes.mid[Math.floor(Math.random() * 2)];
        if (Math.random() < 0.05) return shapes.mid[Math.floor(Math.random() * 2)];
        return shapes.high[Math.floor(Math.random() * 3)];
    }

    findTargetInMyZone(targets) {
        let nearest = null;
        let minDist = Infinity;
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const targetZone = getZoneIdx(target.x, target.y, this.zones);
            if (targetZone !== this.zoneIdx) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = target;
            }
        }
        return nearest;
    }

    isTargetInMyZone(target) {
        if (!target || this.isBoss) return true;
        return getZoneIdx(target.x, target.y, this.zones) === this.zoneIdx;
    }

    isInMyZone(px, py) {
        const dist = Math.hypot(px, py);
        return dist >= this.spawnZoneMin && dist <= this.spawnZoneMax;
    }

    clampToMyZone(px, py) {
        const dist = Math.hypot(px, py);
        if (dist < 1) {
            const rndAngle = Math.random() * Math.PI * 2;
            return {
                x: Math.cos(rndAngle) * (this.spawnZoneMin + 50),
                y: Math.sin(rndAngle) * (this.spawnZoneMin + 50)
            };
        }
        if (dist >= this.spawnZoneMin && dist <= this.spawnZoneMax) {
            return { x: px, y: py };
        }
        const clampedDist = Math.max(this.spawnZoneMin + 10, Math.min(this.spawnZoneMax - 10, dist));
        const nx = px / dist;
        const ny = py / dist;
        return { x: nx * clampedDist, y: ny * clampedDist };
    }

    findRetreatPoint() {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = this.spawnZoneMin + Math.random() * (this.spawnZoneMax - this.spawnZoneMin);
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;
            if (this.isInMyZone(x, y)) return { x, y };
        }
        const mid = (this.spawnZoneMin + this.spawnZoneMax) / 2;
        const angle = Math.random() * Math.PI * 2;
        return { x: Math.cos(angle) * mid, y: Math.sin(angle) * mid };
    }

    checkForNearbyPlayers(targets) {
        const detectionRange = 1100;
        let nearest = null;
        let nearestDist = Infinity;
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist < detectionRange) {
                const targetZone = getZoneIdx(target.x, target.y, this.zones);
                if (targetZone === this.zoneIdx || dist < 800) {
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearest = target;
                    }
                }
            }
        }
        return nearest;
    }

    update(dt, targets, bullets) {
        if (this.state === 'attacking') {
            this.handleAttacking(dt, targets, bullets);
        } else if (this.state === 'returning') {
            this.handleReturning(dt, targets, bullets);
        } else if (this.state === 'despawning') {
            this.handleDespawning(dt, targets, bullets);
        }
        if (this.hitTimer > 0) this.hitTimer -= dt;
    }

    handleAttacking(dt, targets, bullets) {
        if (!this.currentTarget || this.currentTarget.hp <= 0) {
            this.currentTarget = this.findTargetInMyZone(targets);
            if (!this.currentTarget) {
                this.state = 'returning';
                this.outsideZoneTimer = 0;
                this.retreatTarget = this.findRetreatPoint();
                return;
            }
        }

        const targetInZone = this.isTargetInMyZone(this.currentTarget);
        if (targetInZone) {
            this.outsideZoneTimer = 0;
            this.chaseAndAttack(dt, bullets);
        } else {
            this.outsideZoneTimer += dt;
            if (this.outsideZoneTimer < MONSTER_CONFIG.chase.outsideZoneTimeout) {
                this.chaseAndAttack(dt, bullets);
            } else {
                const newTarget = this.findTargetInMyZone(targets);
                if (newTarget) {
                    this.currentTarget = newTarget;
                    this.outsideZoneTimer = 0;
                } else {
                    this.state = 'returning';
                    this.outsideZoneTimer = 0;
                    this.retreatTarget = this.findRetreatPoint();
                }
            }
        }
    }

    handleReturning(dt, targets, bullets) {
        const nearbyPlayer = this.checkForNearbyPlayers(targets);
        if (nearbyPlayer) {
            const playerZone = getZoneIdx(nearbyPlayer.x, nearbyPlayer.y, this.zones);
            if (playerZone === this.zoneIdx) {
                this.currentTarget = nearbyPlayer;
                this.state = 'attacking';
                this.outsideZoneTimer = 0;
                this.isDespawning = false;
                return;
            }
        }

        if (!this.retreatTarget) {
            this.retreatTarget = this.findRetreatPoint();
        }
        if (!this.isInMyZone(this.retreatTarget.x, this.retreatTarget.y)) {
            const clamped = this.clampToMyZone(this.retreatTarget.x, this.retreatTarget.y);
            this.retreatTarget.x = clamped.x;
            this.retreatTarget.y = clamped.y;
        }

        const dx = this.retreatTarget.x - this.x;
        const dy = this.retreatTarget.y - this.y;
        const distToRetreat = Math.hypot(dx, dy);
        if (distToRetreat < 80) {
            this.retreatTarget = this.findRetreatPoint();
            return;
        }

        const newX = this.x + (dx / distToRetreat) * this.spd * 3.5 * dt * 55;
        const newY = this.y + (dy / distToRetreat) * this.spd * 3.5 * dt * 55;
        const clamped = this.clampToMyZone(newX, newY);
        if (clamped.x !== newX || clamped.y !== newY) {
            this.retreatTarget = this.findRetreatPoint();
        }
        this.x = clamped.x;
        this.y = clamped.y;
    }

    handleDespawning(dt, targets, bullets) {
        const nearbyPlayer = this.checkForNearbyPlayers(targets);
        if (nearbyPlayer) {
            this.currentTarget = nearbyPlayer;
            this.state = 'attacking';
            this.outsideZoneTimer = 0;
            this.despawnTimer = 0;
            this.isDespawning = false;
            return;
        }

        this.despawnTimer += dt;
        if (!this.isInMyZone(this.x, this.y)) {
            const clamped = this.clampToMyZone(this.x, this.y);
            this.x = clamped.x;
            this.y = clamped.y;
        }
        if (this.despawnTimer > MONSTER_CONFIG.despawn.timeout) {
            this.isDespawning = true;
            this.hp = -1;
        }
    }

    chaseAndAttack(dt, bullets) {
        if (!this.currentTarget) return;
        const dx = this.currentTarget.x - this.x;
        const dy = this.currentTarget.y - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) return;

        if (this.canShoot && distance < this.shootRange) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                const cooldown = MONSTER_CONFIG.shooting.cooldowns.normal;
                this.shootTimer = rng(cooldown[0], cooldown[1]);
                this.shootAtTarget(this.currentTarget, bullets);
            }
        }

        const attackRange = MONSTER_CONFIG.attack.normalRange;
        this.orbitAngle += this.orbitDir * dt * 0.8;
        const orbitRadius = attackRange * 0.9;
        const targetX = this.currentTarget.x + Math.cos(this.orbitAngle) * orbitRadius;
        const targetY = this.currentTarget.y + Math.sin(this.orbitAngle) * orbitRadius;

        const tdx = targetX - this.x;
        const tdy = targetY - this.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist < 1) return;

        const moveSpeed = distance < attackRange ? this.spd * MONSTER_CONFIG.attack.slowdownFactor : this.spd;
        this.x += (tdx / tdist) * moveSpeed * dt * 55;
        this.y += (tdy / tdist) * moveSpeed * dt * 55;
    }

    shootAtTarget(target, bullets) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        const bulletColor = this.isElite ? 0xffaa44 : 0xff6666;
        const bulletSize = this.isElite ? 1.2 : 1;

        const bullet = new ServerBullet(
            this.x, this.y,
            (dx / len) * this.bulletSpeed,
            (dy / len) * this.bulletSpeed,
            this.dmg * 0.4,
            this.id,
            'wand',
            bulletSize,
            0, 0, bulletColor
        );
        bullet.ownerType = 'monster';
        bullet.life = this.bulletLifetime;
        bullets.push(bullet);
    }

    takeDamage(amount, attacker = null) {
        this.hp -= amount;
        this.hitTimer = 0.1;
        if (attacker && attacker !== 'monster' && attacker !== 'boss') {
            const prev = this._dmgMap.get(attacker) || 0;
            this._dmgMap.set(attacker, prev + amount);
            let topDmg = 0, topAttacker = attacker;
            for (const [a, d] of this._dmgMap) {
                if (d > topDmg) { topDmg = d; topAttacker = a; }
            }
            this.lastHitBy = topAttacker;
        }
        if (this.state === 'despawning' || this.state === 'returning') {
            this.state = 'attacking';
            this.outsideZoneTimer = 0;
            this.isDespawning = false;
        }
    }

    toState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            hp: Math.round(this.hp),
            maxHp: Math.round(this.maxHp),
            zoneIdx: this.zoneIdx,
            isElite: this.isElite,
            isBoss: this.isBoss,
            type: this.type,
            sz: this.sz
        };
    }
}
