// ai/behaviors/ExploreBehavior.js

import { BaseBehavior } from './BaseBehavior.js';
import { rng } from '../../utils/math.js';

/**
 * Zachowanie eksploracji - poruszanie się po mapie
 */
export class ExploreBehavior extends BaseBehavior {
    constructor() {
        super('explore', 10);
        
        /** @type {{x: number, y: number}|null} */
        this.destination = null;
        
        /** @type {number} */
        this.destinationTimer = 0;
        
        /** @type {number} */
        this.maxDestinationTime = 10;
        
        /** @type {number} */
        this.wanderAngle = Math.random() * Math.PI * 2;
        
        /** @type {number} */
        this.wanderTimer = 0;
    }
    
    /**
     * @override
     */
    calculatePriority(context) {
        const { personality } = context;
        
        let priority = this.basePriority;
        
        // Modyfikator osobowości
        priority *= personality.getActionModifier('explore');
        
        // Bonus gdy jesteśmy w niewłaściwej strefie
        const recommendedZone = this.getRecommendedZone(context.bot.level);
        
        if (context.currentZone > recommendedZone) {
            // Za daleko - musimy wrócić
            priority = 60;
        } else if (context.currentZone < recommendedZone && context.bot.level >= 5) {
            // Możemy iść dalej
            priority += 30 * personality.getEffectiveTrait('aggression');
        }
        
        return priority;
    }
    
    /**
     * @override
     */
    execute(dt, context) {
        const { bot, memory, threatSystem } = context;
        
        // Aktualizuj destination
        this.destinationTimer += dt;
        
        if (!this.destination || this.destinationTimer > this.maxDestinationTime || 
            this.reachedDestination(bot)) {
            this.selectNewDestination(context);
        }
        
        // Sprawdź czy destination jest bezpieczna
        const danger = memory.checkDanger(this.destination.x, this.destination.y);
        if (danger.inDanger && danger.threatLevel > 0.5) {
            this.selectNewDestination(context);
        }
        
        // Oblicz kierunek
        const dx = this.destination.x - bot.x;
        const dy = this.destination.y - bot.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < 1) {
            return { move: { x: 0, y: 0 } };
        }
        
        let moveX = dx / dist;
        let moveY = dy / dist;
        
        // Dodaj wandering dla naturalniejszego ruchu
        this.wanderTimer += dt;
        if (this.wanderTimer > 1) {
            this.wanderAngle += rng(-0.5, 0.5);
            this.wanderTimer = 0;
        }
        
        moveX += Math.cos(this.wanderAngle) * 0.2;
        moveY += Math.sin(this.wanderAngle) * 0.2;
        
        // Unikaj zagrożeń
        const avoidance = this.calculateAvoidance(context);
        moveX += avoidance.x * 0.3;
        moveY += avoidance.y * 0.3;
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            data: { exploring: true }
        };
    }
    
    /**
     * Wybiera nową destynację
     * @private
     */
    selectNewDestination(context) {
        const { bot, memory } = context;
        
        this.destinationTimer = 0;
        
        const recommendedZone = this.getRecommendedZone(bot.level);
        const targetRadius = this.getZoneRadius(recommendedZone);
        
        // Sprawdź nieodwiedzone lokacje
        const unexplored = memory.findUnexploredNearby(bot.x, bot.y, 800);
        
        if (unexplored.length > 0 && Math.random() < 0.7) {
            // Idź do nieodwiedzonej lokacji w odpowiedniej strefie
            const validUnexplored = unexplored.filter(loc => {
                const dist = Math.hypot(loc.x, loc.y);
                return Math.abs(dist - targetRadius) < 1000;
            });
            
            if (validUnexplored.length > 0) {
                const chosen = validUnexplored[Math.floor(Math.random() * validUnexplored.length)];
                this.destination = chosen;
                return;
            }
        }
        
        // Losowa pozycja w odpowiedniej strefie
        const angle = Math.random() * Math.PI * 2;
        const distance = targetRadius * (0.5 + Math.random() * 0.4);
        
        this.destination = {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance
        };
    }
    
    /**
     * Sprawdza czy dotarliśmy do destynacji
     * @private
     */
    reachedDestination(bot) {
        if (!this.destination) return true;
        
        const dist = Math.hypot(
            this.destination.x - bot.x,
            this.destination.y - bot.y
        );
        
        return dist < 100;
    }
    
    /**
     * Oblicza wektor unikania
     * @private
     */
    calculateAvoidance(context) {
        const { bot, threatSystem } = context;
        const threats = threatSystem.getThreatsInRange(250);
        
        let avoidX = 0, avoidY = 0;
        
        for (const threat of threats.slice(0, 5)) {
            const dx = bot.x - threat.entity.x;
            const dy = bot.y - threat.entity.y;
            const dist = threat.distance || 1;
            
            const weight = 1 / (dist * dist + 1);
            avoidX += dx * weight * 100;
            avoidY += dy * weight * 100;
        }
        
        // Unikaj krawędzi mapy
        const WORLD = 12000;
        const edge = 500;
        const half = WORLD / 2;
        
        if (bot.x > half - edge) avoidX -= 1;
        if (bot.x < -half + edge) avoidX += 1;
        if (bot.y > half - edge) avoidY -= 1;
        if (bot.y < -half + edge) avoidY += 1;
        
        return { x: avoidX, y: avoidY };
    }
    
    /**
     * Zwraca rekomendowaną strefę dla poziomu
     * @private
     */
    getRecommendedZone(level) {
        if (level < 3) return 0;
        if (level < 5) return 1;
        if (level < 8) return 2;
        if (level < 12) return 3;
        return 4;
    }
    
    /**
     * Zwraca promień strefy
     * @private
     */
    getZoneRadius(zone) {
        const radii = [1200, 2500, 4000, 5500, 6000];
        return radii[Math.min(zone, radii.length - 1)];
    }
    
    /**
     * @override
     */
    onActivate(context) {
        super.onActivate(context);
        this.selectNewDestination(context);
    }
    
    /**
     * @override
     */
    onDeactivate(context) {
        super.onDeactivate(context);
        this.destination = null;
    }
}