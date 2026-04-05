import { mkShape } from '../utils/geometry.js';
import { CLASSES } from '../config/classes.js';
import { WEAPONS } from '../config/weapons.js';
import { MOVEMENT_MULTIPLIER } from '../config/constants.js';
import { rng, norm } from '../utils/math.js';

export class Player {
    constructor(cls, permStats, scene, isBot = false, startX = 0, startY = 0) {
        this.cls = cls;
        this.scene = scene;
        this.isBot = isBot;
        const cd = CLASSES[cls];
        
        const speedBonus = isBot ? 1 : 1 + (permStats.speed / 100);
        const hpBonus = isBot ? 50 : permStats.hp;
        this.maxHp = cd.hp + hpBonus;
        
        this.x = startX;
        this.y = startY;
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
        
        this.outline = mkShape(cd.shape, size + 3, 0x000000);
        this.outline.material.transparent = true;
        this.outline.material.opacity = 0.2;
        this.outline.position.z = z - 0.1;
        scene.add(this.outline);
        
        this.auraRing = null;
        this.auraMat = null;
        this.invTimer = 0;
        this.lastAuraRange = 0;
        
        this.killedMonsters = 0;
        this.totalDmg = 0;
        this.damageAccumulator = 0;
        
        if (isBot) {
            const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma', 'Omega', 'Zeta', 'Theta', 'Lambda', 'Epsilon', 'Kappa', 'Rho', 'Tau', 'Phi', 'Psi'];
            this.name = names[Math.floor(Math.random() * names.length)] + '_' + Math.floor(Math.random() * 999);
            this.botAI = new BotAI(this);
        }
    }
    
    makeWeaponInstance(type) {
        const baseStats = { ...WEAPONS[type].stats };
        return {
            type,
            timer: 0,
            upgrades: {},
            upgradeTypes: [],
            appliedUpgrades: new Set(),
            stats: baseStats
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
            const nx = dx / len;
            const ny = dy / len;
            this.x += nx * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += ny * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
        }
        
        const WORLD = 12000;
        this.x = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.x));
        this.y = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.y));
        
        this.mesh.position.set(this.x, this.y, 3);
        this.outline.position.set(this.x, this.y, 2.9);
        this.mesh.rotation.z += dt * 1.5;
    }
    
    updateBot(dt, monsters, xpOrbs, upgradeSystem, weaponSystem) {
        const action = this.botAI.decide(monsters, xpOrbs);
        
        if (action.move) {
            this.x += action.move.x * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += action.move.y * this.speed * MOVEMENT_MULTIPLIER * dt * 60;
        }
        
        const WORLD = 12000;
        this.x = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.x));
        this.y = Math.max(-WORLD / 2, Math.min(WORLD / 2, this.y));
        
        this.mesh.position.set(this.x, this.y, 2.8);
        this.outline.position.set(this.x, this.y, 2.7);
        this.mesh.rotation.z += dt * 1.2;
        
        for (const orb of xpOrbs) {
            const d = Math.hypot(orb.x - this.x, orb.y - this.y);
            if (d < 25) {
                this.addXp(orb.val);
                orb.life = -1;
            }
        }
    }
    
    addXp(amount, zoneIdx = -1) {
        if (zoneIdx === 4 && this.level >= 10) {
            return 0;
        }
        
        this.xp += amount;
        this.totalXp += amount;
        const levelUps = [];
        
        while (this.xp >= this.xpNeeded) {
            this.xp -= this.xpNeeded;
            this.level++;
            this.xpNeeded = Math.floor(100 * Math.pow(1.18, this.level - 1));
            this.maxHp += 10;
            this.hp = Math.min(this.maxHp, this.hp + 20);
            levelUps.push(this.level);
            
            if (this.isBot) {
                setTimeout(() => {
                    if (window.gameInstance) {
                        this.doAutoUpgrade(window.gameInstance.upgradeSystem, window.gameInstance.weaponSystem);
                    }
                }, 100);
            }
        }
        
        return levelUps.length;
    }
    
    doAutoUpgrade(upgradeSystem, weaponSystem) {
        try {
            const cards = upgradeSystem.generateUpgradeCards(this);
            if (cards && cards.length > 0) {
                const randomCard = cards[Math.floor(Math.random() * cards.length)];
                upgradeSystem.applyUpgrade(randomCard, this, weaponSystem);
            }
        } catch (e) {
            console.warn('Bot upgrade error:', e);
        }
    }
    
    takeDamage(amount) {
        this.damageAccumulator += amount;
        return true;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.auraRing) this.scene.remove(this.auraRing);
    }
}

class BotAI {
    constructor(bot) {
        this.bot = bot;
        this.state = 'exploring';
        this.target = null;
        this.decisionTimer = 0;
        this.fleeTimer = 0;
    }
    
    decide(monsters, xpOrbs) {
        this.decisionTimer -= 0.016;
        
        const centerDist = Math.hypot(this.bot.x, this.bot.y);
        const currentZone = this.getZone(centerDist);
        const hpPercent = this.bot.hp / this.bot.maxHp;
        
        if (this.decisionTimer <= 0) {
            this.decisionTimer = rng(0.3, 0.8);
            
            if (hpPercent < 0.3) {
                this.state = 'fleeing';
                this.fleeTimer = 3;
            } else if (currentZone >= 3 && this.bot.level < 5) {
                this.state = 'stay_safe';
            } else if (this.bot.level >= 5 && currentZone >= 2) {
                this.state = 'hunting';
            } else {
                const nearbyXp = this.findNearestXpOrb(xpOrbs, 300);
                if (nearbyXp) {
                    this.state = 'collecting';
                    this.target = nearbyXp;
                } else {
                    this.state = 'hunting';
                }
            }
        }
        
        if (this.fleeTimer > 0) {
            this.fleeTimer -= 0.016;
            this.state = 'fleeing';
        }
        
        return this.executeState(monsters, xpOrbs, centerDist);
    }
    
    executeState(monsters, xpOrbs, centerDist) {
        switch (this.state) {
            case 'fleeing':
                return this.flee(monsters, centerDist);
            case 'stay_safe':
                return this.stayInSafeZone();
            case 'collecting':
                return this.collectXp(xpOrbs);
            case 'hunting':
                return this.hunt(monsters);
            default:
                return this.explore();
        }
    }
    
    flee(monsters, centerDist) {
        const nearestMonster = this.findNearestMonster(monsters, 400);
        
        if (nearestMonster) {
            const [nx, ny] = norm(this.bot.x - nearestMonster.x, this.bot.y - nearestMonster.y);
            return { move: { x: nx, y: ny } };
        }
        
        if (centerDist < 3000) {
            const [nx, ny] = norm(-this.bot.x, -this.bot.y);
            return { move: { x: -nx, y: -ny } };
        }
        
        return { move: { x: rng(-1, 1), y: rng(-1, 1) } };
    }
    
    stayInSafeZone() {
        const [nx, ny] = norm(-this.bot.x, -this.bot.y);
        return { move: { x: nx, y: ny } };
    }
    
    collectXp(xpOrbs) {
        const nearestOrb = this.findNearestXpOrb(xpOrbs, 500);
        
        if (nearestOrb) {
            const [nx, ny] = norm(nearestOrb.x - this.bot.x, nearestOrb.y - this.bot.y);
            return { move: { x: nx, y: ny } };
        }
        
        return this.hunt([]);
    }
    
    hunt(monsters) {
        const weapon = this.bot.weapons[0];
        const isAura = weapon && weapon.type === 'aura';
        const isRanged = weapon && (weapon.type === 'bow' || weapon.type === 'lightning');
        
        const range = isAura ? 200 : (isRanged ? 500 : 300);
        const nearestMonster = this.findNearestMonster(monsters, range + 200);
        
        if (nearestMonster) {
            const dist = Math.hypot(nearestMonster.x - this.bot.x, nearestMonster.y - this.bot.y);
            const idealDist = isAura ? 80 : (isRanged ? 350 : 200);
            
            if (dist > idealDist + 50) {
                const [nx, ny] = norm(nearestMonster.x - this.bot.x, nearestMonster.y - this.bot.y);
                return { move: { x: nx, y: ny } };
            } else if (dist < idealDist - 50 && isRanged) {
                const [nx, ny] = norm(this.bot.x - nearestMonster.x, this.bot.y - nearestMonster.y);
                return { move: { x: nx, y: ny } };
            } else {
                const angle = Math.atan2(nearestMonster.y - this.bot.y, nearestMonster.x - this.bot.x);
                const perpAngle = angle + Math.PI / 2;
                return { move: { x: Math.cos(perpAngle), y: Math.sin(perpAngle) } };
            }
        }
        
        return this.explore();
    }
    
    explore() {
        const angle = Math.random() * Math.PI * 2;
        return { move: { x: Math.cos(angle), y: Math.sin(angle) } };
    }
    
    findNearestMonster(monsters, maxDist) {
        let nearest = null;
        let minDist = maxDist;
        
        for (const m of monsters) {
            const d = Math.hypot(m.x - this.bot.x, m.y - this.bot.y);
            if (d < minDist) {
                minDist = d;
                nearest = m;
            }
        }
        
        return nearest;
    }
    
    findNearestXpOrb(xpOrbs, maxDist) {
        let nearest = null;
        let minDist = maxDist;
        
        for (const orb of xpOrbs) {
            const d = Math.hypot(orb.x - this.bot.x, orb.y - this.bot.y);
            if (d < minDist) {
                minDist = d;
                nearest = orb;
            }
        }
        
        return nearest;
    }
    
    getZone(centerDist) {
        if (centerDist < 1500) return 0;
        if (centerDist < 3000) return 1;
        if (centerDist < 4500) return 2;
        if (centerDist < 6000) return 3;
        return 4;
    }
}