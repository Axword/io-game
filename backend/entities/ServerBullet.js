// server/entities/Bullet.js
export class ServerBullet {
    constructor(x, y, vx, vy, dmg, owner, wtype, sz, bounces, pierce, col) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.dmg = dmg; this.owner = owner; // Referencja do obiektu (gracz/mob)
        this.wtype = wtype; this.sz = sz || 1;
        this.bounces = bounces || 0; this.pierce = pierce || 0;
        this.col = col;
        this.life = this.getLifetime(wtype);
        
        this.hit = new Set(); // Przechowuje referencje do trafionych encji
        this.hitCount = 0;
        this.isMine = (wtype === 'mine');
        this.animTime = 0;

        // Explosion (fireball, meteor)
        this.explosionRadius = 0;
        this.hasExploded = false;
        this.isExplosive = false;

        // Poison linger
        this.lingerDmg = 0;
        this.lingerDuration = 0;
        this.lingeredEntities = new Map(); // entity -> timer

        // Trajectory (meteor)
        this.trajectory = null;

        // Sword orbit
        this.baseAngle = 0;
        this.orbitRadius = 120;
        this.orbitSpeed = 3;
        this.orbitSlot = 0;
        this.orbitSlotsTotal = 1;

        // Sword/poison rehit
        this.rehitInterval = 0;
        this.rehitTimer = 0;

        // Laser
        this.laserRange = 350;
        this.laserWidth = 18;
        this.laserAngle = 0;

        if (wtype === 'sword') { this.rehitInterval = 0.2; this.rehitTimer = 0.2; }
        if (wtype === 'poison') { this.rehitInterval = 0.15; this.rehitTimer = 0; }
    }

    getLifetime(wtype) {
        return { mine: 8, laser: 1.5, poison: 5, fireball: 6, meteor: 4, sword: 999, knife: 1.2 }[wtype] || 5;
    }

    update(dt) {
        this.animTime += dt;

        // Rehit timer (sword, poison)
        if (this.rehitInterval > 0) {
            this.rehitTimer -= dt;
            if (this.rehitTimer <= 0) {
                this.hit.clear();
                this.rehitTimer = this.rehitInterval;
            }
        }

        // Poison linger
        if (this.lingerDmg > 0 && this.lingeredEntities.size > 0) {
            for (const [entity, timer] of this.lingeredEntities) {
                const newTimer = timer - dt;
                if (newTimer <= 0 || !entity || entity.hp <= 0) {
                    this.lingeredEntities.delete(entity);
                } else {
                    this.lingeredEntities.set(entity, newTimer);
                    if (entity.takeDamage) entity.takeDamage(this.lingerDmg * dt, this.owner);
                }
            }
        }

        // Ruch
        if (this.trajectory) {
            this.updateTrajectory(dt);
        } else if (this.wtype === 'sword' && this.owner && typeof this.owner === 'object') {
            const total = Math.max(1, this.orbitSlotsTotal || 1);
            const slot = this.orbitSlot || 0;
            const slotAngle = (slot / total) * Math.PI * 2;
            const angle = (this.baseAngle || 0) + slotAngle + this.animTime * (this.orbitSpeed || 3);
            const orbit = this.orbitRadius || 120;
            this.x = this.owner.x + Math.cos(angle) * orbit;
            this.y = this.owner.y + Math.sin(angle) * orbit;
        } else if (this.wtype === 'laser' && this.owner && typeof this.owner === 'object') {
            const halfRange = (this.laserRange || 350) / 2;
            this.x = this.owner.x + Math.cos(this.laserAngle) * halfRange;
            this.y = this.owner.y + Math.sin(this.laserAngle) * halfRange;
        } else if (this.wtype === 'poison') {
            // Trucizna stoi w miejscu
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

    toJSON() {
        return {
            id: this.id, x: this.x, y: this.y, wtype: this.wtype, sz: this.sz,
            angle: Math.atan2(this.vy, this.vx), // Klient sam to obróci
            life: this.life, ownerId: this.owner?.id || 'monster'
        };
    }
}