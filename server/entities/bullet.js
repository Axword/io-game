import { v4 as uuidv4 } from 'uuid';

const LIFETIMES = {
    mine: 8,
    laser: 1.5,
    poison: 5,
    fireball: 6,
    meteor: 4,
    sword: 999,
    knife: 1.2,
    bow: 5,
    axe: 5,
    lightning: 0.05,   // instant hit; bullet lives only for chain bookkeeping
    wand: 3
};

export class ServerBullet {
    constructor(x, y, vx, vy, dmg, ownerId, wtype, sz = 1, bounces = 0, pierce = 0, col = 0xffffff) {
        this.id = 'b_' + uuidv4().slice(0, 8);
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.dmg = dmg;
        this.ownerId = ownerId;   // player/bot/monster/boss id
        this.ownerType = 'player'; // 'player' | 'bot' | 'monster' | 'boss'
        this.wtype = wtype;
        this.sz = sz || 1;
        this.bounces = bounces || 0;
        this.pierce = pierce || 0;
        this.col = col;
        this.life = LIFETIMES[wtype] || 5;
        this.maxLife = this.life;
        this.hit = new Set();
        this.hitCount = 0;
        this.isMine = wtype === 'mine';
        this.animTime = 0;

        this.explosionRadius = 0;
        this.hasExploded = false;

        this.tickInterval = 0;
        this.tickTimer = 0;
        this.tickDmg = 0;

        this.lingerDmg = 0;
        this.lingerDuration = 0;
        this.lingeredEntities = new Map();

        this.trajectory = null;

        this.baseAngle = 0;
        this.orbitRadius = 120;
        this.orbitSpeed = 3;
        this.orbitSlot = 0;
        this.orbitSlotsTotal = 1;

        this.rehitInterval = 0;
        this.rehitTimer = 0;

        this.laserRange = 350;
        this.laserWidth = 18;
        this.laserAngle = 0;

        this.chainCount = 0;
        this.chainRange = 250;

        this._spawnQueue = [];

        if (wtype === 'sword') {
            this.rehitInterval = 0.2;
            this.rehitTimer = 0.2;
        }
        if (wtype === 'poison') {
            this.rehitInterval = 0.15;
            this.rehitTimer = 0;
        }
    }

    getLifetime(wtype) {
        return LIFETIMES[wtype] || 5;
    }

    update(dt) {
        this.animTime += dt;

        if (this.rehitInterval > 0) {
            this.rehitTimer -= dt;
            if (this.rehitTimer <= 0) {
                this.hit.clear();
                this.rehitTimer = this.rehitInterval;
            }
        }

        if (this.lingerDmg > 0 && this.lingeredEntities.size > 0) {
            for (const [entity, timer] of this.lingeredEntities) {
                const newTimer = timer - dt;
                if (newTimer <= 0 || !entity || entity.hp <= 0) {
                    this.lingeredEntities.delete(entity);
                } else {
                    this.lingeredEntities.set(entity, newTimer);
                    if (entity.takeDamage) {
                        entity.takeDamage(this.lingerDmg * dt);
                    }
                }
            }
        }

        if (this.trajectory) {
            this.updateTrajectory(dt);
        } else if (this.wtype === 'sword' && this.ownerId) {
            // sword position is updated by room based on owner position
        } else if (this.wtype === 'laser' && this.ownerId) {
            // laser position is updated by room based on owner position
        } else if (this.wtype === 'poison') {
            // stays in place
        } else if (!this.isMine) {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
        }

        this.life -= dt;
    }

    updateTrajectory(dt) {
        this.trajectory.currentTime += dt;
        const t = Math.min(1, this.trajectory.currentTime / this.trajectory.totalTime);

        if (t < 0.5) {
            const p = t * 2;
            this.x = this.trajectory.startX + (this.trajectory.peakX - this.trajectory.startX) * p;
            this.y = this.trajectory.startY + (this.trajectory.peakY - this.trajectory.startY) * p;
        } else {
            const p = (t - 0.5) * 2;
            this.x = this.trajectory.peakX + (this.trajectory.endX - this.trajectory.peakX) * p;
            this.y = this.trajectory.peakY + (this.trajectory.endY - this.trajectory.peakY) * p;
        }

        if (t >= 1) this.life = -1;
    }

    canHit() {
        if (this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype)) return true;
        return this.hitCount < (this.pierce + 1);
    }

    onHit() {
        if (this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype)) return;
        this.hitCount++;
        if (!this.canHit()) this.life = -1;
    }

    addLingerTarget(entity) {
        if (this.lingerDmg > 0 && entity && !this.lingeredEntities.has(entity)) {
            this.lingeredEntities.set(entity, this.lingerDuration);
        }
    }

    refreshLingerTarget(entity) {
        if (this.lingerDmg > 0 && entity) {
            this.lingeredEntities.set(entity, this.lingerDuration);
        }
    }

    toState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            wtype: this.wtype,
            sz: this.sz,
            col: this.col
        };
    }
}
