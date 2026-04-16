// ai/combat/AuraCombatStyle.js

import { CombatStyle } from './CombatStyle.js';

/**
 * Styl walki dla aury - wchodzi w grupy wrogów
 */
export class AuraCombatStyle extends CombatStyle {
    constructor() {
        super('aura');
        this.idealDistance = 50; // Chcemy być blisko
        this.distanceTolerance = 30;
    }
    
    /**
     * @override
     */
    execute(dt, context, target, kiteDirection) {
        const { bot, threatSystem } = context;
        
        // Znajdź miejsce z największą gęstością wrogów
        const optimalPosition = this.findOptimalPosition(context);
        
        // Sprawdź czy nie jest za niebezpiecznie
        const hpPercent = bot.getHealthPercent();
        const immediateThreats = threatSystem.getImmediateThreats();
        
        if (hpPercent < 0.4 && immediateThreats.length > 3) {
            // Za niebezpiecznie - wycofaj się trochę
            const fleeDir = threatSystem.calculateFleeDirection(bot);
            return {
                move: { x: fleeDir.x * 0.5, y: fleeDir.y * 0.5 },
                shouldAttack: true,
                data: { style: 'aura', retreating: true }
            };
        }
        
        // Idź do optymalnej pozycji
        const dx = optimalPosition.x - bot.x;
        const dy = optimalPosition.y - bot.y;
        const dist = Math.hypot(dx, dy);
        
        let moveX, moveY;
        
        if (dist > 20) {
            moveX = dx / dist;
            moveY = dy / dist;
        } else {
            // Jesteśmy w optymalnej pozycji - krąż powoli
            const angle = Date.now() * 0.001 * kiteDirection;
            moveX = Math.cos(angle) * 0.3;
            moveY = Math.sin(angle) * 0.3;
        }
        
        return {
            move: { x: moveX, y: moveY },
            shouldAttack: true,
            attackTarget: target.entity,
            data: { 
                style: 'aura', 
                density: optimalPosition.density,
                inOptimalPosition: dist < 50
            }
        };
    }
    
    /**
     * Znajduje optymalną pozycję (maksymalna gęstość wrogów)
     * @private
     */
    findOptimalPosition(context) {
        const { bot, threatSystem } = context;
        const threats = threatSystem.getThreatsInRange(400);
        
        if (threats.length === 0) {
            return { x: bot.x, y: bot.y, density: 0 };
        }
        
        // Znajdź centroid wszystkich wrogów w zasięgu
        let sumX = 0, sumY = 0;
        let count = 0;
        
        for (const threat of threats) {
            // Ważenie - bliższe i słabsze cele są lepsze
            const weight = 1 / (threat.distance + 50);
            sumX += threat.entity.x * weight;
            sumY += threat.entity.y * weight;
            count += weight;
        }
        
        if (count === 0) {
            return { x: bot.x, y: bot.y, density: 0 };
        }
        
        const centroidX = sumX / count;
        const centroidY = sumY / count;
        
        // Oblicz gęstość w centroidzie
        let density = 0;
        const auraRange = 150; // Zakładany zasięg aury
        
        for (const threat of threats) {
            const distToCentroid = Math.hypot(
                threat.entity.x - centroidX,
                threat.entity.y - centroidY
            );
            if (distToCentroid < auraRange) {
                density++;
            }
        }
        
        return { x: centroidX, y: centroidY, density };
    }
}