// entities/Player.js
import { Entity } from './Entity.js';
import { mkShape } from '../utils/geometry.js';
import { CLASSES } from '../config/classes.js';
import { WEAPONS } from '../config/weapons.js';
import { MOVEMENT_MULTIPLIER } from '../config/constants.js';
import { BotAI } from './BotAI.js';

const BOT_NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Zeta', 'Theta', 'Lambda', 'Epsilon', 'Kappa', 'Rho', 'Tau', 'Phi', 'Psi'];

export class Player extends Entity {
    constructor(cls, permStats, scene, isBot = false, startX = 0, startY = 0) {
        super(startX, startY, scene);
        this.cls = cls;
        this.isBot = isBot;
        const cd = CLASSES[cls];
        
        const speedBonus = isBot ? 1 : 1 + (permStats.speed / 100);
        const hpBonus = isBot ? 50 : permStats.hp;
        this.maxHp = cd.hp + hpBonus;
        this.hp = this.maxHp;
        this.level = 1;
        this.xp = 0;
        this.xpNeeded = 100;
        this.speed = cd.spd * speedBonus;
        this.totalXp = 0;
        
        this.weapons = [this.makeWeaponInstance(cd.weapon), null, null, null];
        
        const size = isBot ? 20 : 22;
        const z = isBot ? 2.8 : 3;
        
        this.mesh = mkShape(cd.shape, size, cd.col);
        this.mesh.position.set(startX, startY, z);
        scene.add(this.mesh);
        
        this.createOutline(cd.shape, size + 3, 0x000000, 0.2, z - 0.1);
        
        this.auraRing = null;
        this.auraMat = null;
        this.invTimer = 0;
        this.lastAuraRange = 0;
        this.killedMonsters = 0;
        this.totalDmg = 0;
        this.damageAccumulator = 0;
        
        if (isBot) {
            this.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(Math.random() * 999);
            this.botAI = new BotAI(this);
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
    
    update(dt, input, safeRadius, monsters, xpOrbs, upgradeSystem, weaponSystem) {
        if (this.isBot) {
            this.updateBot(dt, monsters, xpOrbs, upgradeSystem, weaponSystem);
        } else {
            this.updatePlayer(dt, input);
        }
        
        if (this.invTimer > 0) this.invTimer -= dt;
        
        if (this.damageAccumulator > 0) {
            this.hp -= this.damageAccumulator;
            this.damageAccumulator = 0;
        }
        
        for (const w of this.weapons) {
            if (w && w.timer > 0) w.timer -= dt;
        }
    }
    
    updatePlayer(dt, input) {
        let dx = 0, dy = 0;
        
        if (input.isKeyPressed('KeyW') || input.isKeyPressed('ArrowUp')) dy += 1;
        if (input.isKeyPressed('KeyS') || input.isKeyPressed('ArrowDown')) dy -= 1;
        if (input.isKeyPressed('KeyA') || input.isKeyPressed('ArrowLeft')) dx -= 1;
        if (input.isKeyPressed('KeyD') || input.isKeyPressed('ArrowRight')) dx += 1;
        
        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            this.x += (dx / len) * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += (dy / len) * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
        }
        
        this.clampToWorld();
        this.updatePosition(3, 2.9);
        this.mesh.rotation.z += dt * 1.5;
    }

    updateBot(dt, monsters, xpOrbs, upgradeSystem, weaponSystem) {
        const action = this.botAI.decide(monsters, xpOrbs, dt);
        
        if (action.move) {
            const len = Math.hypot(action.move.x, action.move.y);
            if (len > 0) {
                this.x += (action.move.x / len) * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
                this.y += (action.move.y / len) * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
            }
        }
        
        this.clampToWorld();
        this.updatePosition(2.8, 2.7);
        this.mesh.rotation.z += dt * 1.2;
        
        for (const orb of xpOrbs) {
            if (Math.hypot(orb.x - this.x, orb.y - this.y) < 25) {
                this.addXp(orb.val);
                orb.life = -1;
            }
        }
    }

    clampToWorld() {
        const WORLD = 12000;
        this.x = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.x));
        this.y = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.y));
    }

    takeDamage(amount, source = null) {
        this.damageAccumulator += amount;
        if (this.isBot && this.botAI) this.botAI.onDamageTaken(amount, source);
        return true;
    }
        
    addXp(amount, zoneIdx = -1) {
        if (zoneIdx === 4 && this.level >= 10) return 0;
        
        this.xp += amount;
        this.totalXp += amount;
        let levelUps = 0;
        
        while (this.xp >= this.xpNeeded) {
            this.xp -= this.xpNeeded;
            this.level++;
            this.xpNeeded = Math.floor(100 * Math.pow(1.18, this.level - 1));
            this.maxHp += 10;
            this.hp = Math.min(this.maxHp, this.hp + 20);
            levelUps++;
            
            if (this.isBot) {
                setTimeout(() => {
                    if (window.gameInstance) {
                        this.doAutoUpgrade(window.gameInstance.upgradeSystem, window.gameInstance.weaponSystem);
                    }
                }, 100);
            }
        }
        return levelUps;
    }
    
    doAutoUpgrade(upgradeSystem, weaponSystem) {
        try {
            const cards = upgradeSystem.generateUpgradeCards(this);
            if (cards?.length > 0) {
                upgradeSystem.applyUpgrade(cards[Math.floor(Math.random() * cards.length)], this, weaponSystem);
            }
        } catch (e) {
            console.warn('Bot upgrade error:', e);
        }
    }
    
    destroy() {
        super.destroy();
        this.removeMesh(this.auraRing);
    }
}