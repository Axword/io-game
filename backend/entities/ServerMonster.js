// server/entities/Monster.js
import { rng, getZoneIdx } from '../utils/math.js';
import { MONSTER_CONFIG } from '../config.js';

export class ServerMonster {
    constructor(x, y, zoneIdx, zones, hpMult = 1.0, isBoss = false) {
        this.id = Math.random().toString(36).substring(2, 8);
        this.x = x;
        this.y = y;
        this.zoneIdx = Math.max(0, zoneIdx);
        this.zones = zones;
        this.isBoss = isBoss;
        
        this.hitTimer = 0;
        this.shootTimer = rng(2, 4);
        this.currentTarget = null;
        this.outsideZoneTimer = 0;
        this.despawnTimer = 0;
        this.state = 'attacking';
        this.retreatTarget = null;
        this.isDespawning = false;
        this.lastHitBy = null;

        if (!isBoss) this.initMonster(zones, hpMult);

        this.canShoot = this.isBoss || this.zoneIdx <= 1;
        this.shootRange = this.getShootingStat('ranges');
        this.bulletSpeed = this.getShootingStat('speeds');
        this.bulletLifetime = this.getShootingStat('lifetimes');
    }

    getShootingStat(stat) {
        const data = MONSTER_CONFIG.shooting[stat];
        if (this.isBoss) return data.boss;
        return data[this.zoneIdx] || 0;
    }

    initMonster(zones, hpMult) {
        const z = zones[this.zoneIdx];
        const sc = z.mScale;
        const base = MONSTER_CONFIG.base;
        const bonus = MONSTER_CONFIG.zoneBonus;
        const elite = MONSTER_CONFIG.elite;
        const zoneMultiplier = 4 - this.zoneIdx;

        this.isElite = Math.random() < elite.chance;
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
        
        this.spawnZoneMin = z.minR;
        this.spawnZoneMax = z.maxR;
    }

    // ... (TUTAJ WKLEJ WSZYSTKIE FUNKCJE MATEMATYCZNE Z TWOJEGO PLIKU) ...
    // findNearestTarget, findTargetInMyZone, isTargetInMyZone, findRetreatPoint, 
    // isInMyZone, clampToMyZone, checkForNearbyPlayers, update, handleAttacking, 
    // handleReturning, handleDespawning, chaseAndAttack, moveToward
    
    shootAtTarget(target, bullets) { // Usunięto 'scene'
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;

        // Uwaga: ServerBullet zdefiniujemy za chwilę
        const bullet = new ServerBullet(
            this.x, this.y,
            (dx / len) * this.bulletSpeed, (dy / len) * this.bulletSpeed,
            this.dmg * 0.4,
            this.isBoss ? 'boss' : 'monster',
            'wand', 1, 0, 0, 0xff6666
        );
        bullet.life = this.bulletLifetime;
        bullets.push(bullet);
    }

    takeDamage(amount, attacker = null) {
        this.hp -= amount;
        this.hitTimer = 0.1;

        if (attacker && attacker !== 'monster' && attacker !== 'boss') {
            if (!this._dmgMap) this._dmgMap = new Map();
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

    toJSON() {
        return {
            id: this.id, x: this.x, y: this.y, hp: this.hp, maxHp: this.maxHp,
            sz: this.sz, zoneIdx: this.zoneIdx, isElite: this.isElite, isBoss: this.isBoss,
            state: this.state, isDespawning: this.isDespawning
        };
    }
}