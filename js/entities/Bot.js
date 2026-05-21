import { Player } from './Player.js';
import { CLASSES } from '../config/classes.js';

const ALL_CLASSES = Object.keys(CLASSES);

export class Bot extends Player {
    constructor(x, y, scene) {
        const randomClass = ALL_CLASSES[Math.floor(Math.random() * ALL_CLASSES.length)];
        super(randomClass, { speed: 0, hp: 0, luck: 0 }, scene, true, x, y);

        // Losowy startowy poziom 1-7
        const startLevel = Math.floor(Math.random() * 7) + 1;

        // Ile upgradów do zastosowania po spawnie
        this._pendingStartUpgrades = 0;

        if (startLevel > 1) {
            this._fastLevelTo(startLevel);
            this._pendingStartUpgrades = startLevel - 1;
        }
    }

    /**
     * Symuluje szybkie levelowanie bez upgradeSystem
     * Ustawia: level, xpNeeded, maxHp, hp
     */
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

        // Reset XP - bot zaczyna zbierać od zera
        this.xp      = 0;
        this.totalXp = 0;
        this.hp      = this.maxHp; // pełne HP przy spawnie
    }
}
