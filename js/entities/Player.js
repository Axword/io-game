import { Entity } from './Entity.js';
import { mkShape } from '../utils/geometry.js';
import { CLASSES } from '../config/classes.js';
import { WEAPONS } from '../config/weapons.js';
import { BOOKS } from '../config/books.js';
import { MOVEMENT_MULTIPLIER } from '../config/constants.js';
import { BotAI } from './BotAI.js';

const BOT_NAMES = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma',
    'Omega', 'Zeta', 'Theta', 'Lambda', 'Epsilon',
    'Kappa', 'Rho', 'Tau', 'Phi', 'Psi'
];

export class Player extends Entity {
    constructor(cls, permStats, scene, isBot = false, startX = 0, startY = 0) {
        super(startX, startY, scene);

        this.cls = cls;
        this.isBot = isBot;
        this.classData = CLASSES[cls];
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

        // Ekwipunek
        this.weapons = [this.makeWeaponInstance(cd.weapon), null, null, null];
        this.books = [null, null, null, null, null];

        // Globalne statystyki gracza
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

        // Statystyki runu
        this.killedMonsters = 0;
        this.totalDmg = 0;
        this.damageAccumulator = 0;

        // Timery / stan
        this.invTimer = 0;
        this.auraRing = null;
        this.auraMat = null;
        this.lastAuraRange = 0;

        // Zastosuj bazowe bonusy klasy
        this.applyClassBaseBonuses();
        this.hp = this.maxHp;

        // Mesh
        const size = isBot ? 20 : 22;
        const z = isBot ? 2.8 : 3;

        this.mesh = mkShape(cd.shape, size, cd.col);
        this.mesh.position.set(startX, startY, z);
        scene.add(this.mesh);

        this.createOutline(cd.shape, size + 3, 0x000000, 0.2, z - 0.1);

        if (isBot) {
            this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(Math.random() * 999);
            this.botAI = new BotAI(this);
        }
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
            stats: { ...WEAPONS[type].stats }
        };
    }

    makeBookInstance(type) {
        return {
            type,
            level: 1,
            appliedUpgrades: new Set(),
            stats: { ...BOOKS[type].stats }
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

    update(dt, input, safeRadius, monsters, xpOrbs, upgradeSystem, weaponSystem) {
        if (this.isBot) {
            this.updateBot(dt, monsters, xpOrbs, upgradeSystem, weaponSystem);
        } else {
            this.updatePlayer(dt, input);
        }

        // Regeneracja
        if (this.regen > 0 && this.hp < this.maxHp) {
            this.regenTimer += dt;
            if (this.regenTimer >= 1) {
                this.hp = Math.min(this.maxHp, this.hp + this.regen);
                this.regenTimer = 0;
            }
        }

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

            if (this.hp <= 0) {
                this.tryRevive();
            }
        }

        // Tick cooldownów
        const cdTickMultiplier = this.getCooldownTickMultiplier();
        for (const w of this.weapons) {
            if (w && w.timer > 0) {
                w.timer -= dt * cdTickMultiplier;
            }
        }
    }

    updatePlayer(dt, input) {
        let dx = 0;
        let dy = 0;

        if (input.isKeyPressed('KeyW') || input.isKeyPressed('ArrowUp')) dy += 1;
        if (input.isKeyPressed('KeyS') || input.isKeyPressed('ArrowDown')) dy -= 1;
        if (input.isKeyPressed('KeyA') || input.isKeyPressed('ArrowLeft')) dx -= 1;
        if (input.isKeyPressed('KeyD') || input.isKeyPressed('ArrowRight')) dx += 1;

        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            const finalSpeed = this.getFinalMoveSpeed();

            this.x += (dx / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += (dy / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
        }

        this.clampToWorld();
        this.updatePosition(3, 2.9);
        this.mesh.rotation.z += dt * 1.5;
    }

    updateBot(dt, monsters, xpOrbs, upgradeSystem, weaponSystem) {
        const action = this.botAI.decide(monsters, xpOrbs, dt);

        if (action?.move) {
            const len = Math.hypot(action.move.x, action.move.y);
            if (len > 0) {
                const finalSpeed = this.getFinalMoveSpeed();

                this.x += (action.move.x / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
                this.y += (action.move.y / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
            }
        }

        this.clampToWorld();
        this.updatePosition(2.8, 2.7);
        this.mesh.rotation.z += dt * 1.2;

        // Bot zbiera XP orby
        this.collectXpOrbs(xpOrbs);
    }

    collectXpOrbs(xpOrbs) {
        const range = this.magnetRange || 60;

        for (const orb of xpOrbs) {
            if (orb.life <= 0) continue;

            const dist = Math.hypot(orb.x - this.x, orb.y - this.y);
            if (dist < range) {
                const levelUps = this.addXp(orb.val);
                orb.life = -1;

                // Powiadom AI o zdobytym XP
                if (this.botAI?.onXpGained) {
                    this.botAI.onXpGained(orb.val);
                }
            }
        }
    }

    clampToWorld() {
        const WORLD = 12000;
        this.x = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.x));
        this.y = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.y));
    }

    takeDamage(amount, source = null) {
        if (this.invTimer > 0) return false;

        this.damageAccumulator += amount;

        if (this.isBot && this.botAI?.onDamageTaken) {
            this.botAI.onDamageTaken(amount, source);
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

            // Bonus poziomowy klasy
            const classData = CLASSES[this.cls];
            if (classData?.levelBonus) {
                classData.levelBonus(this, this.level);
            }

            this.hp = Math.min(this.maxHp, this.hp + 5);

            levelUps++;

            if (this.isBot) {
                this.doAutoUpgrade();
            }
        }

        return levelUps;
    }

    doAutoUpgrade() {
        try {
            const game = window.gameInstance;
            if (!game) return;

            const cards = game.upgradeSystem.generateUpgradeCards(this);
            if (cards?.length > 0) {
                const randomCard = cards[Math.floor(Math.random() * cards.length)];
                game.upgradeSystem.applyUpgrade(randomCard, this, game.weaponSystem);
            }
        } catch (e) {
            console.warn('Bot upgrade error:', e);
        }
    }
    getPrimaryWeapon() {
        return this.weapons.find(w => w !== null) || null;
    }
    destroy() {
        super.destroy();
        this.removeMesh(this.auraRing);
    }
}