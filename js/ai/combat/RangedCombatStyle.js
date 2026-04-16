// ai/combat/RangedCombatStyle.js

import { CombatStyle } from './CombatStyle.js';

/**
 * Styl walki dla broni dystansowych - kiting
 */
export class RangedCombatStyle extends CombatStyle {
    constructor() {
        super('ranged');
        this.idealDistance = 350;
        this.distanceTolerance = 80;
    }
    
    /**
     * @override
     */
    execute(dt, context, target, kiteDirection) {
        const { bot, threatSystem } = context;
        
        // Oblicz podstawowy ruch
        const baseMove = this.calculateMovement(bot, target, kiteDirection);
        
        // Pobierz inne zagrożenia
        const otherThreats = threatSystem.getThreatsInRange(300)
            .filter(t => t.entityId !== target.entityId);
        
        // Unikanie innych zagrożeń
        const avoidance = this.avoidOtherThreats(bot, otherThreats, 200);
        
        // Łącz ruchy
        let moveX = baseMove.x * 0.7 + avoidance.x * 0.3;
        let moveY = baseMove.y * 0.7 + avoidance.y * 0.3;
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            shouldAttack: true,
            attackTarget: target.entity,
            data: { style: 'ranged', kiting: true }
        };
    }
}