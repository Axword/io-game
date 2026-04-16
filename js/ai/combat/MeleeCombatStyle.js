// ai/combat/MeleeCombatStyle.js

import { CombatStyle } from './CombatStyle.js';

/**
 * Styl walki melee - agresywne podejście
 */
export class MeleeCombatStyle extends CombatStyle {
    constructor() {
        super('melee');
        this.idealDistance = 80;
        this.distanceTolerance = 30;
        
        /** @type {number} Timer ataku */
        this.attackTimer = 0;
        
        /** @type {boolean} Czy jesteśmy w trakcie ataku */
        this.isAttacking = false;
    }
    
    /**
     * @override
     */
    execute(dt, context, target, kiteDirection) {
        const { bot, threatSystem } = context;
        
        const dist = target.distance;
        const attackRange = this.idealDistance + 20;
        
        let moveX, moveY;
        
        // Faza 1: Podejście
        if (dist > attackRange) {
            // Biegnij prosto do celu
            const dir = bot.directionTo(target.entity);
            moveX = dir.x;
            moveY = dir.y;
            
            this.isAttacking = false;
        }
        // Faza 2: Atak
        else if (dist > this.idealDistance - 20) {
            // W zasięgu ataku
            this.isAttacking = true;
            
            // Krąż wokół celu podczas ataku
            const dir = bot.directionTo(target.entity);
            const angle = Math.atan2(dir.y, dir.x);
            const perpAngle = angle + (Math.PI / 2) * kiteDirection;
            
            // Lekko w kierunku celu + krążenie
            moveX = dir.x * 0.3 + Math.cos(perpAngle) * 0.7;
            moveY = dir.y * 0.3 + Math.sin(perpAngle) * 0.7;
        }
        // Faza 3: Za blisko
        else {
            // Cofnij się lekko
            const dir = bot.directionTo(target.entity);
            moveX = -dir.x * 0.3;
            moveY = -dir.y * 0.3;
            
            // Krąż
            const angle = Math.atan2(dir.y, dir.x);
            const perpAngle = angle + (Math.PI / 2) * kiteDirection;
            moveX += Math.cos(perpAngle) * 0.7;
            moveY += Math.sin(perpAngle) * 0.7;
        }
        
        // Unikaj innych zagrożeń
        const otherThreats = threatSystem.getThreatsInRange(150)
            .filter(t => t.entityId !== target.entityId);
        
        if (otherThreats.length > 0) {
            const avoidance = this.avoidOtherThreats(bot, otherThreats, 120);
            moveX += avoidance.x * 0.4;
            moveY += avoidance.y * 0.4;
        }
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            shouldAttack: this.isAttacking,
            attackTarget: target.entity,
            data: { 
                style: 'melee', 
                isAttacking: this.isAttacking,
                distanceToTarget: dist
            }
        };
    }
}