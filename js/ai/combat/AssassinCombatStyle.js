// ai/combat/AssassinCombatStyle.js

import { CombatStyle } from './CombatStyle.js';

/**
 * Styl walki assassin - hit and run
 */
export class AssassinCombatStyle extends CombatStyle {
    constructor() {
        super('assassin');
        this.idealDistance = 60;
        this.distanceTolerance = 20;
        
        /** @type {'approach'|'attack'|'retreat'} */
        this.phase = 'approach';
        
        /** @type {number} Timer fazy */
        this.phaseTimer = 0;
        
        /** @type {number} Czas ataku */
        this.attackDuration = 0.5;
        
        /** @type {number} Czas wycofania */
        this.retreatDuration = 1.5;
    }
    
    /**
     * @override
     */
    execute(dt, context, target, kiteDirection) {
        const { bot, threatSystem } = context;
        
        // Aktualizuj fazę
        this.phaseTimer -= dt;
        this.updatePhase(context, target);
        
        let moveX, moveY;
        
        switch (this.phase) {
            case 'approach':
                ({ moveX, moveY } = this.executeApproach(bot, target));
                break;
            case 'attack':
                ({ moveX, moveY } = this.executeAttack(bot, target, kiteDirection));
                break;
            case 'retreat':
                ({ moveX, moveY } = this.executeRetreat(bot, target, context));
                break;
        }
        
        // Normalizuj
        const len = Math.hypot(moveX, moveY);
        if (len > 0) {
            moveX /= len;
            moveY /= len;
        }
        
        return {
            move: { x: moveX, y: moveY },
            shouldAttack: this.phase === 'attack',
            attackTarget: target.entity,
            data: { 
                style: 'assassin', 
                phase: this.phase,
                phaseTimer: this.phaseTimer
            }
        };
    }
    
    /**
     * Aktualizuje fazę walki
     * @private
     */
    updatePhase(context, target) {
        const { bot } = context;
        const weapon = bot.getPrimaryWeapon();
        const weaponReady = weapon ? weapon.timer <= 0 : false;
        const dist = target.distance;
        
        switch (this.phase) {
            case 'approach':
                // Przejdź do ataku gdy blisko i broń gotowa
                if (dist < this.idealDistance + 30 && weaponReady) {
                    this.phase = 'attack';
                    this.phaseTimer = this.attackDuration;
                }
                break;
                
            case 'attack':
                // Przejdź do wycofania po czasie lub gdy broń użyta
                if (this.phaseTimer <= 0 || !weaponReady) {
                    this.phase = 'retreat';
                    this.phaseTimer = this.retreatDuration;
                }
                break;
                
            case 'retreat':
                // Wróć do podejścia gdy timer się skończy i broń gotowa
                if (this.phaseTimer <= 0 && weaponReady) {
                    this.phase = 'approach';
                }
                // Lub gdy jesteśmy daleko
                else if (dist > 300) {
                    this.phase = 'approach';
                }
                break;
        }
    }
    
    /**
     * Faza podejścia
     * @private
     */
    executeApproach(bot, target) {
        const dir = bot.directionTo(target.entity);
        
        // Szybkie, bezpośrednie podejście
        return {
            moveX: dir.x * 1.2, // Szybciej niż normalnie
            moveY: dir.y * 1.2
        };
    }
    
    /**
     * Faza ataku
     * @private
     */
    executeAttack(bot, target, kiteDirection) {
        const dir = bot.directionTo(target.entity);
        const angle = Math.atan2(dir.y, dir.x);
        const perpAngle = angle + (Math.PI / 2) * kiteDirection;
        
        // Krąż blisko celu
        return {
            moveX: Math.cos(perpAngle) * 0.8 + dir.x * 0.2,
            moveY: Math.sin(perpAngle) * 0.8 + dir.y * 0.2
        };
    }
    
    /**
     * Faza wycofania
     * @private
     */
    executeRetreat(bot, target, context) {
        const { threatSystem } = context;
        
        // Uciekaj od celu
        const dir = bot.directionTo(target.entity);
        let moveX = -dir.x;
        let moveY = -dir.y;
        
        // Dodaj unikanie innych zagrożeń
        const fleeDir = threatSystem.calculateFleeDirection(bot);
        moveX = moveX * 0.6 + fleeDir.x * 0.4;
        moveY = moveY * 0.6 + fleeDir.y * 0.4;
        
        return { moveX, moveY };
    }
}