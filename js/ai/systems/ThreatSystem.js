// ai/systems/ThreatSystem.js

/**
 * System oceny zagrożeń dla AI
 */
export class ThreatSystem {
    constructor() {
        /** @type {Map<number, ThreatData>} Cache zagrożeń */
        this.threatCache = new Map();
        
        /** @type {number} Timer aktualizacji cache */
        this.cacheTimer = 0;
        
        /** @type {number} Interwał aktualizacji */
        this.cacheInterval = 0.1;
        
        /** @type {ThreatData[]} Posortowana lista zagrożeń */
        this.sortedThreats = [];
    }
    
    /**
     * Aktualizuje system zagrożeń
     * @param {number} dt 
     * @param {LivingEntity} bot 
     * @param {LivingEntity[]} entities 
     */
    update(dt, bot, entities) {
        this.cacheTimer -= dt;
        
        if (this.cacheTimer <= 0) {
            this.cacheTimer = this.cacheInterval;
            this.recalculateThreats(bot, entities);
        }
    }
    
    /**
     * Przelicza wszystkie zagrożenia
     * @param {LivingEntity} bot 
     * @param {LivingEntity[]} entities 
     */
    recalculateThreats(bot, entities) {
        this.threatCache.clear();
        
        for (const entity of entities) {
            if (!entity.isAlive?.() || entity === bot) continue;
            
            const threatData = this.calculateThreat(bot, entity);
            this.threatCache.set(entity.id, threatData);
        }
        
        // Sortuj wg poziomu zagrożenia
        this.sortedThreats = Array.from(this.threatCache.values())
            .sort((a, b) => b.threatLevel - a.threatLevel);
    }
    
    /**
     * Oblicza zagrożenie dla pojedynczej jednostki
     * @param {LivingEntity} bot 
     * @param {LivingEntity} entity 
     * @returns {ThreatData}
     */
    calculateThreat(bot, entity) {
        const distance = bot.distanceTo(entity);
        
        // Bazowe zagrożenie na podstawie HP i obrażeń
        let baseThreat = 1;
        
        // HP encji
        const entityHp = entity.hp || entity.health?.current || 10;
        baseThreat *= (entityHp / 10);
        
        // Obrażenia encji
        const entityDmg = entity.dmg || entity.baseDamage || 10;
        baseThreat *= (entityDmg / 10);
        
        // Modyfikatory typu
        if (entity.isBoss) baseThreat *= 5;
        if (entity.isElite) baseThreat *= 2.5;
        if (entity.canShoot) baseThreat *= 1.5;
        
        // Modyfikator dystansu (bliżej = więcej zagrożenia)
        const distanceModifier = Math.max(0.1, 1 - (distance / 500));
        
        // Modyfikator prędkości (szybszy = więcej zagrożenia)
        const entitySpeed = entity.spd || entity.speed || 1;
        const speedModifier = Math.min(2, entitySpeed / 2);
        
        // Finalny poziom zagrożenia
        const threatLevel = baseThreat * distanceModifier * speedModifier;
        
        return {
            entity,
            entityId: entity.id,
            distance,
            threatLevel,
            isBoss: !!entity.isBoss,
            isElite: !!entity.isElite,
            canShoot: !!entity.canShoot,
            estimatedDamage: entityDmg,
            estimatedTimeToReach: distance / (entitySpeed * 55), // przybliżony czas
        };
    }
    
    /**
     * Zwraca najbliższe zagrożenie
     * @returns {ThreatData|null}
     */
    getNearestThreat() {
        let nearest = null;
        let minDist = Infinity;
        
        for (const threat of this.threatCache.values()) {
            if (threat.distance < minDist) {
                minDist = threat.distance;
                nearest = threat;
            }
        }
        
        return nearest;
    }
    
    /**
     * Zwraca najwyższe zagrożenie
     * @returns {ThreatData|null}
     */
    getHighestThreat() {
        return this.sortedThreats[0] || null;
    }
    
    /**
     * Zwraca zagrożenia w zasięgu
     * @param {number} range 
     * @returns {ThreatData[]}
     */
    getThreatsInRange(range) {
        return this.sortedThreats.filter(t => t.distance <= range);
    }
    
    /**
     * Zwraca natychmiastowe zagrożenia (bardzo blisko)
     * @param {number} [immediateRange=150]
     * @returns {ThreatData[]}
     */
    getImmediateThreats(immediateRange = 150) {
        return this.sortedThreats.filter(t => t.distance <= immediateRange);
    }
    
    /**
     * Oblicza łączny poziom zagrożenia
     * @returns {number}
     */
    getTotalThreatLevel() {
        let total = 0;
        for (const threat of this.threatCache.values()) {
            total += threat.threatLevel;
        }
        return total;
    }
    
    /**
     * Oblicza kierunek ucieczki od zagrożeń
     * @param {LivingEntity} bot 
     * @param {number} [weightedByThreat=true]
     * @returns {{x: number, y: number}}
     */
    calculateFleeDirection(bot, weightedByThreat = true) {
        let fleeX = 0, fleeY = 0;
        
        for (const threat of this.threatCache.values()) {
            const dx = bot.x - threat.entity.x;
            const dy = bot.y - threat.entity.y;
            const dist = threat.distance || 1;
            
            // Ważenie: bliższe i groźniejsze = większy wpływ
            const weight = weightedByThreat 
                ? (threat.threatLevel / (dist * dist + 1))
                : (1 / (dist * dist + 1));
            
            fleeX += dx * weight;
            fleeY += dy * weight;
        }
        
        // Normalizuj
        const len = Math.hypot(fleeX, fleeY);
        if (len === 0) return { x: 0, y: 0 };
        
        return { x: fleeX / len, y: fleeY / len };
    }
    
    /**
     * Znajduje najbezpieczniejszy kierunek
     * @param {LivingEntity} bot 
     * @param {number} checkRadius 
     * @returns {{x: number, y: number, safety: number}}
     */
    findSafestDirection(bot, checkRadius = 300) {
        const directions = 8;
        let bestDir = { x: 0, y: 0 };
        let bestSafety = -Infinity;
        
        for (let i = 0; i < directions; i++) {
            const angle = (Math.PI * 2 / directions) * i;
            const checkX = bot.x + Math.cos(angle) * checkRadius;
            const checkY = bot.y + Math.sin(angle) * checkRadius;
            
            // Oblicz bezpieczeństwo w tym kierunku
            let safety = 0;
            
            for (const threat of this.threatCache.values()) {
                const distToCheck = Math.hypot(checkX - threat.entity.x, checkY - threat.entity.y);
                const currentDist = threat.distance;
                
                // Bonus za oddalenie się od zagrożenia
                safety += (distToCheck - currentDist) * threat.threatLevel * 0.01;
            }
            
            if (safety > bestSafety) {
                bestSafety = safety;
                bestDir = { x: Math.cos(angle), y: Math.sin(angle) };
            }
        }
        
        return { ...bestDir, safety: bestSafety };
    }
    
    /**
     * Sprawdza czy sytuacja jest krytyczna
     * @param {number} hpPercent - Procent HP bota
     * @returns {boolean}
     */
    isCriticalSituation(hpPercent) {
        const immediateThreats = this.getImmediateThreats();
        const totalThreat = this.getTotalThreatLevel();
        
        // Krytyczne gdy:
        // - Niskie HP i jakiekolwiek zagrożenie
        // - Bardzo wysokie zagrożenie
        // - Wiele natychmiastowych zagrożeń
        return (
            (hpPercent < 0.2 && immediateThreats.length > 0) ||
            totalThreat > 20 ||
            immediateThreats.length > 4
        );
    }
    
    /**
     * Czyści cache
     */
    clear() {
        this.threatCache.clear();
        this.sortedThreats = [];
    }
}

/**
 * @typedef {Object} ThreatData
 * @property {LivingEntity} entity
 * @property {number} entityId
 * @property {number} distance
 * @property {number} threatLevel
 * @property {boolean} isBoss
 * @property {boolean} isElite
 * @property {boolean} canShoot
 * @property {number} estimatedDamage
 * @property {number} estimatedTimeToReach
 */