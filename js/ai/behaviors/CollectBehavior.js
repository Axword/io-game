// ai/behaviors/CollectBehavior.js

import { BaseBehavior } from './BaseBehavior.js';

/**
 * Zachowanie zbierania XP
 */
export class CollectBehavior extends BaseBehavior {
    constructor() {
        super('collect', 35);
        
        /** @type {{x: number, y: number}|null} */
        this.currentTarget = null;
        
        /** @type {number} Timer poszukiwania nowego celu */
        this.retargetTimer = 0;
        
        /** @type {number} Interwał zmiany celu */
        this.retargetInterval = 0.5;
    }
    
    /**
     * @override
     */
    calculatePriority(context) {
        const { bot, memory, personality, threatSystem } = context;
        
        const hpPercent = bot.getHealthPercent();
        const immediateThreats = threatSystem.getImmediateThreats();
        
        // Nie zbieraj gdy niebezpiecznie
        if (hpPercent < 0.3 || immediateThreats.length > 2) {
            return 0;
        }
        
        // Sprawdź czy są orby w pobliżu
        const bestCluster = memory.getBestXpCluster();
        const nearbyXpValue = this.calculateNearbyXpValue(context);
        
        if (nearbyXpValue === 0 && !bestCluster) {
            return 0;
        }
        
        let priority = this.basePriority;
        
        // Modyfikator osobowości (chciwość)
        priority *= personality.getActionModifier('collect');
        
        // Bonus za dużo XP w pobliżu
        priority += Math.min(30, nearbyXpValue * 0.5);
        
        // Bonus za klastry
        if (bestCluster && bestCluster.totalValue > 50) {
            priority += 15;
        }
        
        // Bonus gdy bezpiecznie
        if (hpPercent > 0.7 && immediateThreats.length === 0) {
            priority += 20;
        }
        
        return Math.max(0, priority);
    }
    
    /**
     * @override
     */
    execute(dt, context) {
        const { bot, memory, threatSystem, xpOrbs } = context;
        
        // Aktualizuj cel
        this.retargetTimer -= dt;
        if (this.retargetTimer <= 0 || !this.isTargetValid(context)) {
            this.retargetTimer = this.retargetInterval;
            this.selectTarget(context);
        }
        
        if (!this.currentTarget) {
            return { move: { x: 0, y: 0 } };
        }
        
        // Oblicz kierunek do celu
        const dx = this.currentTarget.x - bot.x;
        const dy = this.currentTarget.y - bot.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 1) {
            return { move: { x: 0, y: 0 } };
        }
        
        let moveX = dx / dist;
        let moveY = dy / dist;
        
        // Unikaj potworów po drodze
        const avoidance = this.calculateAvoidance(context);
        
        moveX = moveX * 0.7 + avoidance.x * 0.3;
        moveY = moveY * 0.7 + avoidance.y * 0.3;
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            data: { 
                collecting: true, 
                targetX: this.currentTarget.x, 
                targetY: this.currentTarget.y 
            }
        };
    }
    
    /**
     * Oblicza wartość XP w pobliżu
     * @private
     */
    calculateNearbyXpValue(context) {
        const { bot, xpOrbs } = context;
        let total = 0;
        
        for (const orb of xpOrbs) {
            if (orb.life <= 0) continue;
            
            const dist = Math.hypot(orb.x - bot.x, orb.y - bot.y);
            if (dist < 500) {
                total += (orb.val || 1) * (1 - dist / 500);
            }
        }
        
        return total;
    }
    
    /**
     * Wybiera cel do zbierania
     * @private
     */
    selectTarget(context) {
        const { bot, memory, xpOrbs } = context;
        
        // Priorytet 1: Klastry XP
        const cluster = memory.getBestXpCluster();
        if (cluster && cluster.totalValue > 30) {
            this.currentTarget = { x: cluster.x, y: cluster.y, isCluster: true };
            return;
        }
        
        // Priorytet 2: Najlepszy stosunek wartość/dystans
        let bestOrb = null;
        let bestScore = 0;
        
        for (const orb of xpOrbs) {
            if (orb.life <= 0) continue;
            
            const dist = Math.hypot(orb.x - bot.x, orb.y - bot.y);
            if (dist > 600) continue;
            
            const value = orb.val || 1;
            const score = value / (dist + 50); // +50 żeby uniknąć dzielenia przez bardzo małe liczby
            
            if (score > bestScore) {
                bestScore = score;
                bestOrb = orb;
            }
        }
        
        if (bestOrb) {
            this.currentTarget = { x: bestOrb.x, y: bestOrb.y, orb: bestOrb };
        } else {
            this.currentTarget = null;
        }
    }
    
    /**
     * Sprawdza czy cel jest nadal ważny
     * @private
     */
    isTargetValid(context) {
        if (!this.currentTarget) return false;
        
        // Jeśli to klaster, sprawdź czy nadal istnieje
        if (this.currentTarget.isCluster) {
            const cluster = context.memory.getBestXpCluster();
            return cluster && cluster.totalValue > 10;
        }
        
        // Jeśli to orb, sprawdź czy nadal żyje
        if (this.currentTarget.orb) {
            return this.currentTarget.orb.life > 0;
        }
        
        return false;
    }
    
    /**
     * Oblicza wektor unikania zagrożeń
     * @private
     */
    calculateAvoidance(context) {
        const { bot, threatSystem } = context;
        const threats = threatSystem.getThreatsInRange(200);
        
        let avoidX = 0, avoidY = 0;
        
        for (const threat of threats.slice(0, 3)) {
            const dx = bot.x - threat.entity.x;
            const dy = bot.y - threat.entity.y;
            const dist = threat.distance || 1;
            
            avoidX += dx / (dist * dist) * 50;
            avoidY += dy / (dist * dist) * 50;
        }
        
        return { x: avoidX, y: avoidY };
    }
    
    /**
     * @override
     */
    onDeactivate(context) {
        super.onDeactivate(context);
        this.currentTarget = null;
    }
}