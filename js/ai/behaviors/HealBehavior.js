// ai/behaviors/HealBehavior.js

import { BaseBehavior } from './BaseBehavior.js';

/**
 * Zachowanie leczenia - powrót do bezpiecznej strefy
 */
export class HealBehavior extends BaseBehavior {
    constructor() {
        super('heal', 55);
        
        /** @type {number} Docelowy % HP przed zakończeniem leczenia */
        this.targetHpPercent = 0.7;
        
        /** @type {boolean} Czy aktywnie leczymy */
        this.isHealing = false;
    }
    
    /**
     * @override
     */
    calculatePriority(context) {
        const { bot, personality, threatSystem } = context;
        
        const hpPercent = bot.getHealthPercent();
        const inSafeZone = context.currentZone === 0;
        const immediateThreats = threatSystem.getImmediateThreats();
        
        // Już jesteśmy w safe zone i mamy dużo HP
        if (inSafeZone && hpPercent > this.targetHpPercent) {
            return 0;
        }
        
        // Nie potrzebujemy leczenia
        if (hpPercent > 0.8) {
            return 0;
        }
        
        let priority = 0;
        
        // Im mniej HP, tym większy priorytet
        if (hpPercent < 0.5 && !inSafeZone) {
            priority = (1 - hpPercent) * 80;
        } else if (hpPercent < 0.7 && !inSafeZone && immediateThreats.length === 0) {
            priority = (1 - hpPercent) * 40;
        }
        
        // Modyfikator osobowości (ostrożność)
        priority *= personality.getActionModifier('heal');
        
        // Kontynuuj leczenie jeśli już zaczęliśmy
        if (this.isHealing && hpPercent < this.targetHpPercent) {
            priority = Math.max(priority, 50);
        }
        
        return priority;
    }
    
    /**
     * @override
     */
    execute(dt, context) {
        const { bot, threatSystem, memory } = context;
        
        const hpPercent = bot.getHealthPercent();
        const centerDist = Math.hypot(bot.x, bot.y);
        
        // Sprawdź czy skończyliśmy leczenie
        if (hpPercent >= this.targetHpPercent && centerDist < 1200) {
            this.isHealing = false;
            return { move: { x: 0, y: 0 }, data: { healingComplete: true } };
        }
        
        this.isHealing = true;
        
        // Kierunek do centrum (safe zone)
        let moveX = 0, moveY = 0;
        
        if (centerDist > 100) {
            moveX = -bot.x / centerDist;
            moveY = -bot.y / centerDist;
        }
        
        // Unikaj potworów po drodze - bardziej agresywnie niż w innych zachowaniach
        const avoidance = this.calculateAvoidance(context);
        
        // Gdy blisko potworów, priorytet unikania jest wyższy
        const immediateThreats = threatSystem.getImmediateThreats();
        const avoidWeight = immediateThreats.length > 0 ? 0.6 : 0.3;
        
        moveX = moveX * (1 - avoidWeight) + avoidance.x * avoidWeight;
        moveY = moveY * (1 - avoidWeight) + avoidance.y * avoidWeight;
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            data: { 
                healing: true, 
                hpPercent,
                distanceToSafe: centerDist
            }
        };
    }
    
    /**
     * Oblicza wektor unikania
     * @private
     */
    calculateAvoidance(context) {
        const { bot, threatSystem } = context;
        const threats = threatSystem.getThreatsInRange(300);
        
        let avoidX = 0, avoidY = 0;
        
        for (const threat of threats) {
            const dx = bot.x - threat.entity.x;
            const dy = bot.y - threat.entity.y;
            const dist = threat.distance || 1;
            
            // Silniejsze unikanie gdy leczymy
            const weight = (300 - dist) / 300;
            avoidX += (dx / dist) * weight;
            avoidY += (dy / dist) * weight;
        }
        
        // Normalizuj
        const len = Math.hypot(avoidX, avoidY);
        if (len > 0) {
            return { x: avoidX / len, y: avoidY / len };
        }
        
        return { x: 0, y: 0 };
    }
    
    /**
     * @override
     */
    canExecute(context) {
        // Można leczyć tylko gdy HP < 80%
        return context.bot.getHealthPercent() < 0.8;
    }
    
    /**
     * @override
     */
    onActivate(context) {
        super.onActivate(context);
        this.isHealing = true;
    }
    
    /**
     * @override
     */
    onDeactivate(context) {
        super.onDeactivate(context);
        this.isHealing = false;
    }
}