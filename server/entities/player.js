import { v4 as uuidv4 } from 'uuid';
import { CLASSES } from '../../shared/config/classes.js';
import { WEAPONS } from '../../shared/config/weapons.js';
import { BOOKS } from '../../shared/config/books.js';
import { WORLD, MOVEMENT_MULTIPLIER } from '../../shared/config/constants.js';

export class ServerPlayer {
    constructor(id, name, cls, permStats = {}, x = 0, y = 0, isBot = false) {
        this.id = id;
        this.name = name || 'Player';
        this.cls = cls;
        this.classData = CLASSES[cls] || CLASSES.warrior;
        const cd = this.classData;

        const speedBonus = isBot ? 1 : 1 + ((permStats.speed || 0) / 100);
        const hpBonus = isBot ? 50 : (permStats.hp || 0);

        this.baseHp = cd.hp + hpBonus;
        this.maxHp = this.baseHp;
        this.hp = this.maxHp;

        this.level = 1;
        this.xp = 0;
        this.xpNeeded = 100;
        this.totalXp = 0;

        this.baseSpeed = cd.spd * speedBonus;
        this.speed = this.baseSpeed;

        this.weapons = [this.makeWeaponInstance(cd.weapon), null, null, null];
        this.books = [null, null, null, null, null];

        this.armor = 0;
        this.regen = 0;
        this.magnetRange = isBot ? 60 : 100;
        this.cooldownReduction = 0;
        this.areaBonus = 0;

        this.critChance = 0;
        this.critDamage = 200;

        this.damageBonus = 0;
        this.attackSpeedBonus = 0;
        this.moveSpeedBonus = 0;
        this.projectileSpeedBonus = 0;
        this.projectileSizeBonus = 0;
        this.rangeBonus = 0;

        this.damageReduction = 0;
        this.revives = 0;
        this.luck = isBot ? 0 : (permStats.luck || 0);

        this.regenTimer = 0;
        this.invTimer = 0;

        this.killedMonsters = 0;
        this.totalDmg = 0;
        this.damageAccumulator = 0;

        this.pendingUpgrades = 0;
        this.lastInputSeq = 0;
        this.input = { keys: {}, mouseX: 0, mouseY: 0, mouseClicked: false };

        this.x = x;
        this.y = y;
        this.isBot = isBot;
        this.ws = null;
        this.disconnectedAt = 0;
        this.isDead = false;
        this.deathNotified = false;
        this.applyClassBaseBonuses();
        this.hp = this.maxHp;
    }

    applyClassBaseBonuses() {
        const cd = this.classData;
        if (!cd?.baseBonuses) return;
        for (const [key, value] of Object.entries(cd.baseBonuses)) {
            this[key] = (this[key] || 0) + value;
        }
    }

    makeWeaponInstance(type) {
        return {
            type,
            timer: 0,
            upgrades: {},
            upgradeTypes: [],
            appliedUpgrades: new Set(),
            upgradeApplyCount: {},
            stats: WEAPONS[type] ? { ...WEAPONS[type].stats } : {}
        };
    }

    makeBookInstance(type) {
        return {
            type,
            level: 1,
            appliedUpgrades: new Set(),
            stats: BOOKS[type] ? { ...BOOKS[type].stats } : {}
        };
    }

    getFinalMoveSpeed() {
        return this.speed * (1 + (this.moveSpeedBonus || 0) / 100);
    }

    getCooldownTickMultiplier() {
        const reduction = Math.min(0.8, (this.cooldownReduction || 0) / 100);
        return 1 / Math.max(0.2, 1 - reduction);
    }

    getHealthPercent() {
        return this.maxHp > 0 ? this.hp / this.maxHp : 0;
    }

    tryRevive() {
        if (this.hp > 0 || this.revives <= 0) return false;
        this.revives--;
        this.hp = Math.max(1, this.maxHp * 0.5);
        this.invTimer = 2;
        return true;
    }

    update(dt, input) {
        this.updateMovement(dt, input);
        this.updateRegen(dt);

        if (this.invTimer > 0) this.invTimer -= dt;

        if (this.damageAccumulator > 0) {
            let damage = this.damageAccumulator;
            if (this.armor > 0) {
                const armorReduction = Math.min(0.75, this.armor / 100);
                damage *= (1 - armorReduction);
            }
            if (this.damageReduction > 0) {
                const flatReduction = Math.min(0.75, this.damageReduction / 100);
                damage *= (1 - flatReduction);
            }
            this.hp -= damage;
            this.damageAccumulator = 0;
            if (this.hp <= 0) this.tryRevive();
        }

        const cdTickMultiplier = this.getCooldownTickMultiplier();
        for (const w of this.weapons) {
            if (w && w.timer > 0) {
                w.timer -= dt * cdTickMultiplier;
            }
        }
    }

    updateMovement(dt, input) {
        let dx = 0;
        let dy = 0;

        if (input) {
            if (input.keys['KeyW'] || input.keys['ArrowUp']) dy += 1;
            if (input.keys['KeyS'] || input.keys['ArrowDown']) dy -= 1;
            if (input.keys['KeyA'] || input.keys['ArrowLeft']) dx -= 1;
            if (input.keys['KeyD'] || input.keys['ArrowRight']) dx += 1;
        }

        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            const finalSpeed = this.getFinalMoveSpeed();
            this.x += (dx / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += (dy / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
        }

        this.clampToWorld();
    }

    updateRegen(dt) {
        if (this.regen > 0 && this.hp < this.maxHp) {
            this.regenTimer += dt;
            if (this.regenTimer >= 1) {
                this.hp = Math.min(this.maxHp, this.hp + this.regen);
                this.regenTimer = 0;
            }
        }
    }

    clampToWorld() {
        const half = WORLD / 2;
        this.x = Math.max(-half, Math.min(half, this.x));
        this.y = Math.max(-half, Math.min(half, this.y));
    }

    takeDamage(amount, source = null) {
        if (this.invTimer > 0) return false;
        this.damageAccumulator += amount;
        if (source && source !== 'monster' && source !== 'boss') {
            this.lastHitBy = source;
        }
        return true;
    }

    addXp(amount, zoneIdx = -1) {
        if (zoneIdx === 4 && this.level >= 10) return 0;

        this.xp += amount;
        this.totalXp = (this.totalXp || 0) + amount;
        let levelUps = 0;

        while (this.xp >= this.xpNeeded) {
            this.xp -= this.xpNeeded;
            this.level++;
            this.xpNeeded = Math.floor(100 * Math.pow(1.18, this.level - 1));

            this.maxHp += 10;
            this.hp = Math.min(this.maxHp, this.hp + 20);

            const classData = CLASSES[this.cls];
            if (classData?.levelBonus) {
                classData.levelBonus(this, this.level);
            }

            this.hp = Math.min(this.maxHp, this.hp + 5);
            levelUps++;
        }

        return levelUps;
    }

    getPrimaryWeapon() {
        return this.weapons.find(w => w !== null) || null;
     }
    toState() {
        return {
            id: this.id,
            name: this.name,

            x: this.x,
            y: this.y,

            hp: Math.round(this.hp),
            maxHp: Math.round(this.maxHp),
            isDead: this.isDead || this.hp <= 0,

            level: this.level,
            xp: Math.floor(this.xp || 0),
            xpNeeded: Math.floor(this.xpNeeded || 100),
            totalXp: Math.floor(this.totalXp || 0),

            killedMonsters: this.killedMonsters || 0,
            totalDmg: Math.floor(this.totalDmg || 0),

            pendingUpgrades: this.pendingUpgrades || 0,

            class: this.cls,
            weapons: this.weapons.map(w => w ? {
                type: w.type,
                timer: w.timer || 0,
                upgrades: w.upgrades || {},
                upgradeTypes: w.upgradeTypes || [],
                appliedUpgrades: Array.from(w.appliedUpgrades || []),
                upgradeApplyCount: w.upgradeApplyCount || {},
                stats: w.stats || {}
            } : null),

            books: this.books.map(b => b ? {
                type: b.type,
                level: b.level || 1,
                appliedUpgrades: Array.from(b.appliedUpgrades || []),
                stats: b.stats || {}
            } : null)
        };
    }
}
