// ai/systems/TargetingSystem.js

/**
 * System targetowania - wybiera optymalne cele
 */
export class TargetingSystem {
    constructor() {
        /** @type {LivingEntity|null} */
        this.primaryTarget = null;
        
        /** @type {LivingEntity[]} */
        this.secondaryTargets = [];
        
        /** @type {number} */
        this.targetLockTimer = 0;
        
        /** @type {number} Minimalny czas blokady celu */
        this.minTargetLockTime = 1.0;
        
        /** @type {Map<number, TargetScore>} */
        this.targetScores = new Map();
    }
    
    /**
     * Aktualizuje system targetowania
     * @param {number} dt 
     * @param {CombatEntity} bot 
     * @param {LivingEntity[]} potentialTargets 
     * @param {TargetingConfig} [config]
     */
    update(dt, bot, potentialTargets, config = {}) {
        this.targetLockTimer -= dt;
        
        // Oceń wszystkie cele
        this.evaluateTargets(bot, potentialTargets, config);
        
        // Sprawdź czy obecny cel jest nadal ważny
        if (!this.isTargetValid(this.primaryTarget)) {
            this.targetLockTimer = 0;
        }
        
        // Wybierz nowy cel jeśli potrzeba
        if (this.targetLockTimer <= 0 || !this.primaryTarget) {
            this.selectPrimaryTarget(config);
        }
        
        // Wybierz cele drugorzędne
        this.selectSecondaryTargets(config);
    }
    
    /**
     * Ocenia wszystkie potencjalne cele
     * @private
     */
    evaluateTargets(bot, potentialTargets, config) {
        this.targetScores.clear();
        
        const maxRange = config.maxRange || 800;
        const preferLowHp = config.preferLowHp !== false;
        const preferHighValue = config.preferHighValue !== false;
        
        for (const target of potentialTargets) {
            if (!this.isTargetValid(target)) continue;
            
            const distance = bot.distanceTo(target);
            if (distance > maxRange) continue;
            
            const score = this.calculateTargetScore(bot, target, distance, {
                preferLowHp,
                preferHighValue
            });
            
            this.targetScores.set(target.id, {
                target,
                score,
                distance,
                hp: target.hp || target.health?.current || 100,
                isBoss: !!target.isBoss,
                isElite: !!target.isElite
            });
        }
    }
    
    /**
     * Oblicza wynik dla celu
     * @private
     */
    calculateTargetScore(bot, target, distance, options) {
        let score = 100;
        
        // Dystans (bliżej = lepiej, ale nie za blisko)
        if (distance < 50) {
            score -= 10; // Za blisko
        } else if (distance < 200) {
            score += 30; // Idealna odległość
        } else if (distance < 400) {
            score += 15;
        } else {
            score -= (distance - 400) * 0.05;
        }
        
        // HP (niższe = lepiej jeśli preferujemy)
        const targetHp = target.hp || target.health?.current || 100;
        const targetMaxHp = target.maxHp || target.health?.max || 100;
        const hpPercent = targetHp / targetMaxHp;
        
        if (options.preferLowHp) {
            score += (1 - hpPercent) * 40;
            
            // Bonus za cele bliskie śmierci
            if (targetHp < 30) {
                score += 25;
            }
        }
        
        // Wartość (XP)
        if (options.preferHighValue) {
            const xpValue = target.xp || 10;
            score += Math.min(30, xpValue * 0.5);
        }
        
        // Typ celu
        if (target.isBoss) {
            score += 50; // Priorytet dla bossów
        } else if (target.isElite) {
            score += 25;
        }
        
        // Czy cel jest zablokowany na nas
        if (target.currentTarget === bot) {
            score += 15; // Priorytet dla celów które nas atakują
        }
        
        // Czy cel strzela
        if (target.canShoot) {
            score += 10;
        }
        
        return score;
    }
    
    /**
     * Wybiera główny cel
     * @private
     */
    selectPrimaryTarget(config) {
        if (this.targetScores.size === 0) {
            this.primaryTarget = null;
            return;
        }
        
        // Sortuj wg wyniku
        const sorted = Array.from(this.targetScores.values())
            .sort((a, b) => b.score - a.score);
        
        // Wybierz najlepszy
        const best = sorted[0];
        
        // Histereza - nie zmieniaj celu jeśli różnica jest mała
        if (this.primaryTarget && this.isTargetValid(this.primaryTarget)) {
            const currentScore = this.targetScores.get(this.primaryTarget.id);
            
            if (currentScore && best.score < currentScore.score + 20) {
                // Zostań przy obecnym celu
                return;
            }
        }
        
        this.primaryTarget = best.target;
        this.targetLockTimer = this.minTargetLockTime + Math.random() * 1.5;
    }
    
    /**
     * Wybiera cele drugorzędne
     * @private
     */
    selectSecondaryTargets(config) {
        const maxSecondary = config.maxSecondaryTargets || 3;
        
        this.secondaryTargets = Array.from(this.targetScores.values())
            .filter(t => t.target !== this.primaryTarget)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxSecondary)
            .map(t => t.target);
    }
    
    /**
     * Sprawdza czy cel jest ważny
     * @private
     */
    isTargetValid(target) {
        if (!target) return false;
        if (target.isDestroyed) return false;
        if (target.hp !== undefined && target.hp <= 0) return false;
        if (target.health?.isDead) return false;
        if (!target.isActive) return false;
        return true;
    }
    
    /**
     * Zwraca główny cel
     * @returns {LivingEntity|null}
     */
    getPrimaryTarget() {
        return this.isTargetValid(this.primaryTarget) ? this.primaryTarget : null;
    }
    
    /**
     * Zwraca cele drugorzędne
     * @returns {LivingEntity[]}
     */
    getSecondaryTargets() {
        return this.secondaryTargets.filter(t => this.isTargetValid(t));
    }
    
    /**
     * Zwraca wszystkie cele
     * @returns {LivingEntity[]}
     */
    getAllTargets() {
        const primary = this.getPrimaryTarget();
        const secondary = this.getSecondaryTargets();
        
        return primary ? [primary, ...secondary] : secondary;
    }
    
    /**
     * Zwraca wynik dla celu
     * @param {LivingEntity} target 
     * @returns {TargetScore|null}
     */
    getTargetScore(target) {
        return this.targetScores.get(target.id) || null;
    }
    
    /**
     * Wymusza zmianę celu
     * @param {LivingEntity|null} newTarget 
     */
    forceTarget(newTarget) {
        this.primaryTarget = newTarget;
        this.targetLockTimer = this.minTargetLockTime * 2;
    }
    
    /**
     * Czyści wszystkie cele
     */
    clear() {
        this.primaryTarget = null;
        this.secondaryTargets = [];
        this.targetScores.clear();
        this.targetLockTimer = 0;
    }
}

/**
 * @typedef {Object} TargetScore
 * @property {LivingEntity} target
 * @property {number} score
 * @property {number} distance
 * @property {number} hp
 * @property {boolean} isBoss
 * @property {boolean} isElite
 */

/**
 * @typedef {Object} TargetingConfig
 * @property {number} [maxRange=800]
 * @property {boolean} [preferLowHp=true]
 * @property {boolean} [preferHighValue=true]
 * @property {number} [maxSecondaryTargets=3]
 */