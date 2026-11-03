import { v4 as uuidv4 } from 'uuid';
import { WORLD } from '../../shared/config/constants.js';
import { ServerBullet } from './bullet.js';
import { getWorld } from '../../shared/config/worlds.js';
import { resolveWorldMovement } from '../../shared/systems/worldRules.js';

export class ServerBoss {
    constructor(x, y, bossType) {
        this.id = 'boss_' + uuidv4().slice(0, 8);
        this.x = x;
        this.y = y;
        this.bossData = bossType;
        this.type = bossType.shape;
        this.col = bossType.col;
        this.maxHp = bossType.hp;
        this.hp = this.maxHp;
        this.dmg = bossType.dmg;
        this.spd = bossType.spd;
        this.sz = bossType.sz;
        this.xp = bossType.xp;
        this.isBoss = true;
        this.hitTimer = 0;
        this.currentTarget = null;
        this.lastHitBy = null;
        this._dmgMap = new Map();
        this.abilities = bossType.abilities || ['shockwave', 'charge'];
        this.abilityIndex = 0;
        this.abilityTimer = 2.4;
        this.attackState = null;
        this.spawnTimer = 0;
        this.shieldTimer = 0;
        this.worldId = 0;
    }

    clamp(value) {
        const bounds = getWorld(this.worldId).bounds - this.sz;
        return Math.max(-bounds, Math.min(bounds, value));
    }

    update(dt, targets, bullets) {
        if (this.hp <= 0) return;
        if (this.spawnTimer > 0) { this.spawnTimer -= dt; return; }
        if (this.shieldTimer > 0) this.shieldTimer -= dt;
        if (this.hitTimer > 0) this.hitTimer -= dt;
        this.currentTarget = this.findNearestTarget(targets);
        if (this.attackState) {
            this.advanceAttack(dt, bullets);
            return;
        }
        if (!this.currentTarget) return;
        this.chaseAndAttack(dt);
        this.abilityTimer -= dt;
        if (this.abilityTimer <= 0) this.beginAttack(this.currentTarget);
    }

    findNearestTarget(targets) {
        let nearest = null;
        let minDist = Infinity;
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const distance = Math.hypot(target.x - this.x, target.y - this.y);
            if (distance < minDist) { minDist = distance; nearest = target; }
        }
        return nearest;
    }

    chaseAndAttack(dt) {
        const dx = this.currentTarget.x - this.x;
        const dy = this.currentTarget.y - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= this.sz * 0.75 + 48) return;
        const step = Math.min(distance, this.spd * 55 * dt);
        this.x = this.clamp(this.x + dx / distance * step);
        this.y = this.clamp(this.y + dy / distance * step);
    }

    beginAttack(target) {
        const ability = this.abilities[this.abilityIndex++ % this.abilities.length];
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        const attack = { ability, angle, remaining: ability === 'meteor' ? 1.2 : 1, distance: ability === 'charge' ? 380 : 760 };
        if (ability === 'meteor') attack.positions = [
            { x: target.x, y: target.y },
            { x: target.x + Math.cos(angle + 1.8) * 125, y: target.y + Math.sin(angle + 1.8) * 125 },
            { x: target.x + Math.cos(angle - 1.8) * 125, y: target.y + Math.sin(angle - 1.8) * 125 }
        ];
        if (ability === 'teleport') attack.destination = resolveWorldMovement({ x: this.clamp(target.x - Math.cos(angle) * 300), y: this.clamp(target.y - Math.sin(angle) * 300) }, this.worldId, this.sz * 0.5);
        this.attackState = attack;
    }

    advanceAttack(dt, bullets) {
        const attack = this.attackState;
        attack.remaining -= dt;
        if (attack.charging) {
            const step = Math.min(attack.distance, dt * 640);
            this.x = this.clamp(this.x + Math.cos(attack.angle) * step);
            this.y = this.clamp(this.y + Math.sin(attack.angle) * step);
            attack.distance -= step;
            if (attack.distance <= 0 || attack.remaining <= 0) this.finishAttack();
            return;
        }
        if (attack.remaining > 0) return;
        switch (attack.ability) {
            case 'charge': attack.charging = true; attack.remaining = 0.65; break;
            case 'meteor':
                for (const point of attack.positions) this.createBullet(point.x, point.y, 0, 0, this.dmg, 3.3, 0.24, bullets, true);
                this.finishAttack();
                break;
            case 'laser':
                for (let distance = 35; distance < attack.distance; distance += 32) {
                    this.createBullet(this.x + Math.cos(attack.angle) * distance, this.y + Math.sin(attack.angle) * distance,
                        0, 0, this.dmg * 0.75, 1.1, 0.18, bullets, true);
                }
                this.finishAttack();
                break;
            case 'teleport':
                this.x = attack.destination.x;
                this.y = attack.destination.y;
                this.finishAttack();
                break;
            case 'shield': this.shieldTimer = 2.2; this.finishAttack(); break;
            default:
                for (let i = 0; i < 10; i++) {
                    const direction = attack.angle + (i + 0.5) * Math.PI * 2 / 10;
                    this.createBullet(this.x, this.y, Math.cos(direction) * 3.5, Math.sin(direction) * 3.5,
                        this.dmg * 0.6, 1.1, 3.2, bullets);
                }
                this.finishAttack();
        }
    }

    finishAttack() {
        this.attackState = null;
        this.abilityTimer = this.hp < this.maxHp * 0.5 ? 2.8 : 3.8;
    }

    createBullet(x, y, vx, vy, dmg, size, life, bullets, mine = false) {
        const bullet = new ServerBullet(x, y, vx, vy, dmg, this.id, mine ? 'mine' : 'wand', size, 0, 0, 0xff8e45);
        bullet.ownerType = 'boss';
        bullet.worldId = this.worldId;
        bullet.life = life;
        bullet.isMine = mine;
        bullets.push(bullet);
    }

    takeDamage(amount, attacker = null) {
        if (this.spawnTimer > 0 || !Number.isFinite(amount) || amount <= 0) return;
        const damage = this.shieldTimer > 0 ? amount * 0.5 : amount;
        this.hp -= damage;
        this.hitTimer = 0.1;
        if (attacker && attacker !== 'monster' && attacker !== 'boss') {
            this._dmgMap.set(attacker, (this._dmgMap.get(attacker) || 0) + damage);
            let topDmg = 0;
            for (const [candidate, total] of this._dmgMap) {
                if (total > topDmg) { topDmg = total; this.lastHitBy = candidate; }
            }
        }
    }

    toState() {
        const attack = this.attackState;
        return {
            id: this.id, x: this.x, y: this.y,
            hp: Math.round(this.hp), maxHp: Math.round(this.maxHp),
            type: this.bossData.id, sz: this.sz,
            worldId: this.worldId,
            spawnTimer: this.spawnTimer,
            shieldActive: this.shieldTimer > 0,
            telegraph: attack && !attack.charging ? { ability: attack.ability, angle: attack.angle,
                remaining: attack.remaining, distance: attack.distance,
                positions: attack.positions, destination: attack.destination,
                sequence: this.abilityIndex } : null
        };
    }
}
