import { ServerPlayer } from './player.js';
import { CLASSES } from '../../shared/config/classes.js';
import { rngInt } from '../../shared/utils/math.js';
import { BotAI } from '../systems/BotAI.js';

const ALL_CLASSES = Object.keys(CLASSES);
const BOT_NAMES = [
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Sigma',
    'Omega', 'Zeta', 'Theta', 'Lambda', 'Epsilon',
    'Kappa', 'Rho', 'Tau', 'Phi', 'Psi',
    'xXShadowXx', 'ProGamer2024', 'NoobMaster', 'SkillIssue', 'TryHard_PL',
    'EzWin', 'Destroyer', 'Veteran99', 'TopPlayer', 'Hunter666',
    'SniperElite', 'WarMachine', 'DarkKnight', 'Phoenix', 'Blade'
];

export class ServerBot extends ServerPlayer {
    constructor(x, y, options = {}) {
        const cls = options.class || ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)];
        const name = options.name || (BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + '_' + Math.floor(Math.random() * 999));
        const id = options.id || ('bot_' + Math.random().toString(36).substring(2, 8));
        const startLevel = options.level || Math.floor(Math.random() * 7) + 1;

        super(id, name, cls, { speed: 0, hp: 0, luck: 0 }, x, y, true);

        this.pendingStartUpgrades = 0;
        if (startLevel > 1) {
            this._fastLevelTo(startLevel);
            this.pendingStartUpgrades = startLevel - 1;
        }

        this.botAI = new BotAI(this);
    }

    _fastLevelTo(targetLevel) {
        const classData = this.classData;
        for (let lvl = this.level; lvl < targetLevel; lvl++) {
            this.level++;
            this.xpNeeded = Math.floor(100 * Math.pow(1.18, this.level - 1));
            this.maxHp += 10;
            if (classData?.levelBonus) {
                try { classData.levelBonus(this, this.level); } catch (_) {}
            }
        }
        this.xp = 0;
        this.totalXp = 0;
        this.hp = this.maxHp;
    }

    update(dt, monsters, xpOrbs, upgradeSystem, allPlayers = []) {
        // Passive XP gain
        if (!this._passiveXpTimer) this._passiveXpTimer = Math.random();
        this._passiveXpTimer += dt;
        if (this._passiveXpTimer >= 1.0) {
            this._passiveXpTimer -= 1.0;
            const passiveXp = 4 + Math.floor(Math.random() * 9);
            this.addXp(passiveXp);
        }

        // Bot AI decides movement direction
        const action = this.botAI.decide(monsters, xpOrbs, dt, allPlayers);
        const input = action?.move ? { keys: {}, moveX: action.move.x, moveY: action.move.y } : { keys: {} };

        let dx = 0, dy = 0;
        if (action?.move) {
            dx = action.move.x;
            dy = action.move.y;
        }
        if (dx || dy) {
            const len = Math.hypot(dx, dy);
            if (len > 0) {
                const finalSpeed = this.getFinalMoveSpeed();
                this.x += (dx / len) * finalSpeed * 2.5 * dt * 60;
                this.y += (dy / len) * finalSpeed * 2.5 * dt * 60;
            }
        }
        this.clampToWorld();

        // Collect nearby XP orbs automatically
        this.collectXpOrbs(xpOrbs);

        // Regen, cooldown, damage accumulator
        this.updateRegen(dt);
        if (this.invTimer > 0) this.invTimer -= dt;
        if (this.damageAccumulator > 0) {
            let damage = this.damageAccumulator;
            if (this.armor > 0) damage *= (1 - Math.min(0.75, this.armor / 100));
            if (this.damageReduction > 0) damage *= (1 - Math.min(0.75, this.damageReduction / 100));
            this.hp -= damage;
            this.damageAccumulator = 0;
            if (this.hp <= 0) this.tryRevive();
        }

        const cdTickMultiplier = this.getCooldownTickMultiplier();
        for (const w of this.weapons) {
            if (w && w.timer > 0) w.timer -= dt * cdTickMultiplier;
        }

        return action;
    }

    collectXpOrbs(xpOrbs) {
        const range = this.magnetRange || 60;
        for (const orb of xpOrbs) {
            if (orb.life <= 0) continue;
            const dist = Math.hypot(orb.x - this.x, orb.y - this.y);
            if (dist < range) {
                this.addXp(orb.val);
                orb.life = -1;
                if (this.botAI?.onXpGained) this.botAI.onXpGained(orb.val);
            }
        }
    }

    doAutoUpgrade(upgradeSystem, weaponSystem) {
        try {
            if (!upgradeSystem) return;
            const cards = upgradeSystem.generateUpgradeCards(this);
            if (!cards || cards.length === 0) return;
            let chosen;
            if (this.botAI?.selectBestUpgrade) {
                chosen = this.botAI.selectBestUpgrade(cards);
            } else {
                chosen = cards[Math.floor(Math.random() * cards.length)];
            }
            if (chosen) {
                upgradeSystem.applyUpgrade(chosen, this, weaponSystem);
                if (this.botAI && chosen.type === 'newWeapon') {
                    this.botAI.combatStyle = this.botAI._determineCombatStyle();
                }
            }
        } catch (e) {
            console.warn('[BotUpgrade] Error:', e.message);
        }
    }

    applyPendingStartUpgrades(upgradeSystem, weaponSystem) {
        if (this.pendingStartUpgrades > 0) {
            for (let i = 0; i < this.pendingStartUpgrades; i++) {
                this.doAutoUpgrade(upgradeSystem, weaponSystem);
            }
            this.pendingStartUpgrades = 0;
        }
    }
}
