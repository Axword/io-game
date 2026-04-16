// ai/behaviors/FleeBehavior.js

import { BaseBehavior } from './BaseBehavior.js';

/**
 * Zachowanie ucieczki
 */
export class FleeBehavior extends BaseBehavior {
    constructor() {
        super('flee', 70);
        
        /** @type {number} Czas ucieczki */
        this.fleeTimer = 0;
        
        /** @type {number} Minimalny czas ucieczki */
        this.minFleeDuration = 2;
    }
    
    /**
     * @override
     */
    calculatePriority(context) {
        const { bot, threatSystem, personality } = context;
        
        const hpPercent = bot.getHealthPercent();
        const immediateThreats = threatSystem.getImmediateThreats();
        const totalThreat = threatSystem.getTotalThreatLevel();
        
        let priority = 0;
        
        // Krytyczne HP - najwyższy priorytet
        if (hpPercent < 0.2) {
            priority = 100;
        } 
        // Niskie HP
        else if (hpPercent < 0.3) {
            priority = 70 * personality.getEffectiveTrait('caution');
        }
        // Średnie HP ale dużo zagrożeń
        else if (hpPercent < 0.5 && immediateThreats.length > 3) {
            priority = 50 * personality.getEffectiveTrait('caution');
        }
        
        // Dodatkowy priorytet gdy bardzo wysokie zagrożenie
        if (totalThreat > 15 && hpPercent < 0.6) {
            priority += 30;
        }
        
        // Sytuacja krytyczna
        if (threatSystem.isCriticalSituation(hpPercent)) {
            priority = Math.max(priority, 90);
        }
        
        // Kontynuuj ucieczkę jeśli timer aktywny
        if (this.fleeTimer > 0) {
            priority = Math.max(priority, 60);
        }
        
        return priority;
    }
    
    /**
     * @override
     */
    execute(dt, context) {
        const { bot, threatSystem, memory } = context;
        
        // Aktualizuj timer
        if (this.fleeTimer > 0) {
            this.fleeTimer -= dt;
        }
        
        // Oblicz kierunek ucieczki
        const fleeDir = threatSystem.calculateFleeDirection(bot, true);
        
        // Dodaj komponent w kierunku centrum (bezpieczeństwa)
        const centerDir = this.getDirectionToSafety(bot);
        
        // Sprawdź niebezpieczne obszary z pamięci
        const dangerCheck = memory.checkDanger(
            bot.x + fleeDir.x * 200,
            bot.y + fleeDir.y * 200
        );
        
        let finalX = fleeDir.x * 0.7 + centerDir.x * 0.3;
        let finalY = fleeDir.y * 0.7 + centerDir.y * 0.3;
        
        // Unikaj krawędzi mapy
        const edgeAvoidance = this.avoidMapEdges(bot);
        finalX += edgeAvoidance.x;
        finalY += edgeAvoidance.y;
        
        // Jeśli kierunek ucieczki prowadzi w niebezpieczne miejsce, znajdź alternatywę
        if (dangerCheck.inDanger) {
            const safeDir = threatSystem.findSafestDirection(bot);
            finalX = safeDir.x;
            finalY = safeDir.y;
        }
        
        // Normalizuj
        const len = Math.hypot(finalX, finalY);
        if (len > 0) {
            finalX /= len;
            finalY /= len;
        }
        
        return {
            move: { x: finalX, y: finalY },
            data: { isFleeing: true }
        };
    }
    
    /**
     * Zwraca kierunek do bezpiecznego miejsca
     * @param {CombatEntity} bot 
     * @returns {{x: number, y: number}}
     */
    getDirectionToSafety(bot) {
        // Kierunek do centrum mapy (strefa bezpieczna)
        const centerDist = Math.hypot(bot.x, bot.y);
        
        if (centerDist < 100) {
            return { x: 0, y: 0 };
        }
        
        return {
            x: -bot.x / centerDist,
            y: -bot.y / centerDist
        };
    }
    
    /**
     * Unika krawędzi mapy
     * @param {CombatEntity} bot 
     * @returns {{x: number, y: number}}
     */
    avoidMapEdges(bot) {
        const WORLD = 12000;
        const edgeBuffer = 500;
        const halfWorld = WORLD / 2;
        
        let avoidX = 0, avoidY = 0;
        
        if (bot.x > halfWorld - edgeBuffer) {
            avoidX = -2;
        } else if (bot.x < -halfWorld + edgeBuffer) {
            avoidX = 2;
        }
        
        if (bot.y > halfWorld - edgeBuffer) {
            avoidY = -2;
        } else if (bot.y < -halfWorld + edgeBuffer) {
            avoidY = 2;
        }
        
        return { x: avoidX, y: avoidY };
    }
    
    /**
     * @override
     */
    onActivate(context) {
        super.onActivate(context);
        this.fleeTimer = this.minFleeDuration + Math.random() * 2;
        
        // Zapisz lokację jako niebezpieczną
        context.memory.markDangerZone(
            context.bot.x,
            context.bot.y,
            200,
            5,
            context.gameTime
        );
    }
}