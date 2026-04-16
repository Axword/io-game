// ai/behaviors/BaseBehavior.js

/**
 * @abstract
 * Abstrakcyjna klasa bazowa dla zachowań AI
 */
export class BaseBehavior {
    /**
     * @param {string} name - Nazwa zachowania
     * @param {number} basePriority - Bazowy priorytet
     */
    constructor(name, basePriority = 0) {
        if (new.target === BaseBehavior) {
            throw new Error('BaseBehavior is abstract');
        }
        
        /** @type {string} */
        this.name = name;
        
        /** @type {number} */
        this.basePriority = basePriority;
        
        /** @type {boolean} */
        this.isActive = false;
        
        /** @type {number} */
        this.activeTime = 0;
    }
    
    /**
     * Oblicza priorytet zachowania w obecnym kontekście
     * @abstract
     * @param {BehaviorContext} context 
     * @returns {number}
     */
    calculatePriority(context) {
        throw new Error('Method calculatePriority() must be implemented');
    }
    
    /**
     * Wykonuje zachowanie
     * @abstract
     * @param {number} dt 
     * @param {BehaviorContext} context 
     * @returns {BehaviorResult}
     */
    execute(dt, context) {
        throw new Error('Method execute() must be implemented');
    }
    
    /**
     * Wywoływane przy aktywacji zachowania
     * @param {BehaviorContext} context 
     */
    onActivate(context) {
        this.isActive = true;
        this.activeTime = 0;
    }
    
    /**
     * Wywoływane przy deaktywacji zachowania
     * @param {BehaviorContext} context 
     */
    onDeactivate(context) {
        this.isActive = false;
    }
    
    /**
     * Sprawdza czy zachowanie można wykonać
     * @param {BehaviorContext} context 
     * @returns {boolean}
     */
    canExecute(context) {
        return true;
    }
    
    /**
     * Aktualizuje czas aktywności
     * @param {number} dt 
     */
    updateActiveTime(dt) {
        if (this.isActive) {
            this.activeTime += dt;
        }
    }
}

/**
 * @typedef {Object} BehaviorContext
 * @property {CombatEntity} bot - Bot wykonujący zachowanie
 * @property {ThreatSystem} threatSystem
 * @property {MemorySystem} memory
 * @property {PersonalitySystem} personality
 * @property {LivingEntity[]} monsters
 * @property {XpOrb[]} xpOrbs
 * @property {number} dt
 * @property {number} gameTime
 * @property {number} centerDistance - Odległość od centrum mapy
 * @property {number} currentZone - Obecna strefa
 */

/**
 * @typedef {Object} BehaviorResult
 * @property {{x: number, y: number}} [move] - Kierunek ruchu
 * @property {boolean} [shouldAttack] - Czy atakować
 * @property {LivingEntity} [attackTarget] - Cel ataku
 * @property {Object} [data] - Dodatkowe dane
 */