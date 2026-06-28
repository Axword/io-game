import { v4 as uuidv4 } from 'uuid';
import { rng } from '../../shared/utils/math.js';
import { BOSS_TYPES } from '../../shared/config/constants.js';
import { MONSTER_CONFIG } from '../../shared/config/monsters.js';
import { ServerBullet } from './bullet.js';

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
        this.shootTimer = rng(1, 2);
        this.currentTarget = null;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitDir = Math.random() < 0.5 ? 1 : -1;
        this.lastHitBy = null;
        this._dmgMap = new Map();
        this.shootRange = MONSTER_CONFIG.shooting.ranges.boss;
        this.bulletSpeed = MONSTER_CONFIG.shooting.speeds.boss;
        this.bulletLifetime = MONSTER_CONFIG.shooting.lifetimes.boss;
    }

    update(dt, targets, bullets) {
        if (!this.currentTarget || this.currentTarget.hp <= 0) {
            this.currentTarget = this.findNearestTarget(targets);
        }
        if (this.currentTarget) {
            this.chaseAndAttack(dt, bullets);
        }
        if (this.hitTimer > 0) this.hitTimer -= dt;
    }

    findNearestTarget(targets) {
        let nearest = null;
        let minDist = Infinity;
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = target;
            }
        }
        return nearest;
    }

    chaseAndAttack(dt, bullets) {
        const dx = this.currentTarget.x - this.x;
        const dy = this.currentTarget.y - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) return;

        if (distance < this.shootRange) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                const cooldown = MONSTER_CONFIG.shooting.cooldowns.boss;
                this.shootTimer = rng(cooldown[0], cooldown[1]);
                this.shootAtTarget(this.currentTarget, bullets);
            }
        }

        const attackRange = MONSTER_CONFIG.attack.bossRange;
        this.orbitAngle += this.orbitDir * dt * 0.5;
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
        const bullet = new ServerBullet(
            this.x, this.y,
            (dx / len) * this.bulletSpeed,
            (dy / len) * this.bulletSpeed,
            this.dmg * 0.5,
            this.id,
            'wand',
            1.5, 0, 0, 0xff00ff
        );
        bullet.ownerType = 'boss';
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
    }

    toState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            hp: Math.round(this.hp),
            maxHp: Math.round(this.maxHp),
            type: this.bossData.id,
            sz: this.sz
        };
    }
}
