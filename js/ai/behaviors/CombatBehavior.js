// ai/behaviors/CombatBehavior.js

import { BaseBehavior } from './BaseBehavior.js';
import { AuraCombatStyle } from '../combat/AuraCombatStyle.js';
import { RangedCombatStyle } from '../combat/RangedCombatStyle.js';
import { MeleeCombatStyle } from '../combat/MeleeCombatStyle.js';
import { AssassinCombatStyle } from '../combat/AssassinCombatStyle.js';

/**
 * Zachowanie walki - obsługuje różne style walki
 */
export class CombatBehavior extends BaseBehavior {
    constructor() {
        super('combat', 40);
        
        /** @type {Map<string, CombatStyle>} */
        this.combatStyles = new Map([
            ['aura', new AuraCombatStyle()],
            ['ranged', new RangedCombatStyle()],
            ['melee', new MeleeCombatStyle()],
            ['assassin', new AssassinCombatStyle()],
        ]);
        
        /** @type {CombatStyle|null} */
        this.currentStyle = null;
        
        /** @type {string} */
        this.currentStyleName = 'melee';
        
        /** @type {number} Timer zmiany kierunku kitingu */
        this.kiteDirectionTimer = 0;
        
        /** @type {number} Kierunek kitingu (1 lub -1) */
        this.kiteDirection = 1;
    }
    
    /**
     * Ustawia styl walki na podstawie broni
     * @param {string} weaponType 
     */
    setCombatStyle(weaponType) {
        const styleMap = {
            'aura': 'aura',
            'bow': 'ranged',
            'crossbow': 'ranged',
            'lightning': 'ranged',
            'fireball': 'ranged',
            'sword': 'melee',
            'axe': 'melee',
            'hammer': 'melee',
            'dagger': 'assassin',
        };
        
        this.currentStyleName = styleMap[weaponType] || 'melee';
        this.currentStyle = this.combatStyles.get(this.currentStyleName);
    }
    
    /**
     * @override
     */
    calculatePriority(context) {
        const { threatSystem, personality, bot } = context;
        
        // Sprawdź czy są cele w zasięgu
        const threats = threatSystem.getThreatsInRange(this.getWeaponRange(bot));
        if (threats.length === 0) return 0;
        
        const hpPercent = bot.getHealthPercent();
        const weapon = bot.getPrimaryWeapon();
        const weaponReady = weapon ? weapon.timer <= 0 : false;
        
        let priority = this.basePriority;
        
        // Modyfikator osobowości
        priority *= personality.getActionModifier('combat');
        
        // Bonus gdy broń gotowa
        if (weaponReady) priority += 20;
        
        // Bonus gdy dużo HP
        if (hpPercent > 0.7) priority += 15;
        
        // Penalty gdy mało HP i dużo zagrożeń
        if (hpPercent < 0.4 && threats.length > 2) {
            priority -= 30;
        }
        
        // Bonus za cele o niskim HP (łatwe zabójstwa)
        const lowHpTargets = threats.filter(t => 
            (t.entity.hp || t.entity.health?.current || 100) < 30
        );
        if (lowHpTargets.length > 0) priority += 10;
        
        return Math.max(0, priority);
    }
    
    /**
     * @override
     */
    execute(dt, context) {
        const { threatSystem, bot } = context;
        
        // Zaktualizuj kierunek kitingu
        this.kiteDirectionTimer += dt;
        if (this.kiteDirectionTimer > 2 + Math.random() * 2) {
            this.kiteDirection *= -1;
            this.kiteDirectionTimer = 0;
        }
        
        // Znajdź najlepszy cel
        const target = this.selectTarget(context);
        if (!target) {
            return { move: { x: 0, y: 0 } };
        }
        
        // Deleguj do stylu walki
        if (this.currentStyle) {
            return this.currentStyle.execute(dt, context, target, this.kiteDirection);
        }
        
        // Fallback - prosta walka
        return this.executeBasicCombat(context, target);
    }
    
    /**
     * Wybiera najlepszy cel
     * @param {BehaviorContext} context 
     * @returns {ThreatData|null}
     */
    selectTarget(context) {
        const { threatSystem, bot } = context;
        const threats = threatSystem.getThreatsInRange(this.getWeaponRange(bot) + 100);
        
        if (threats.length === 0) return null;
        
        // Priorytetyzuj cele
        // 1. Elite/Boss (dużo XP)
        // 2. Niskie HP (łatwe zabójstwa)
        // 3. Najbliższy
        
        threats.sort((a, b) => {
            // Priorytet typu
            if (a.isBoss !== b.isBoss) return a.isBoss ? -1 : 1;
            if (a.isElite !== b.isElite) return a.isElite ? -1 : 1;
            
            // HP (niższe = lepsze)
            const hpA = a.entity.hp || a.entity.health?.current || 100;
            const hpB = b.entity.hp || b.entity.health?.current || 100;
            
            if (hpA < 30 && hpB >= 30) return -1;
            if (hpB < 30 && hpA >= 30) return 1;
            
            // Dystans
            return a.distance - b.distance;
        });
        
        return threats[0];
    }
    
    /**
     * Podstawowa logika walki
     * @param {BehaviorContext} context 
     * @param {ThreatData} target 
     * @returns {BehaviorResult}
     */
    executeBasicCombat(context, target) {
        const { bot } = context;
        const idealDist = 150;
        const dist = target.distance;
        
        let moveX, moveY;
        
        if (dist > idealDist + 50) {
            // Za daleko - podejdź
            const dir = bot.directionTo(target.entity);
            moveX = dir.x;
            moveY = dir.y;
        } else if (dist < idealDist - 50) {
            // Za blisko - cofnij się
            const dir = bot.directionTo(target.entity);
            moveX = -dir.x;
            moveY = -dir.y;
        } else {
            // Optymalny dystans - krąż
            const dir = bot.directionTo(target.entity);
            const angle = Math.atan2(dir.y, dir.x);
            const perpAngle = angle + (Math.PI / 2) * this.kiteDirection;
            moveX = Math.cos(perpAngle);
            moveY = Math.sin(perpAngle);
        }
        
        return {
            move: { x: moveX, y: moveY },
            shouldAttack: true,
            attackTarget: target.entity
        };
    }
    
    /**
     * Zwraca zasięg broni
     * @param {CombatEntity} bot 
     * @returns {number}
     */
    getWeaponRange(bot) {
        const weapon = bot.getPrimaryWeapon();
        if (!weapon) return 100;
        
        const rangeMap = {
            'aura': 150,
            'bow': 450,
            'crossbow': 400,
            'lightning': 400,
            'fireball': 350,
            'sword': 120,
            'axe': 130,
            'hammer': 140,
            'dagger': 80,
        };
        
        return rangeMap[weapon.type] || weapon.stats?.range || 200;
    }
    
    /**
     * @override
     */
    onActivate(context) {
        super.onActivate(context);
        
        // Ustaw styl walki
        const weapon = context.bot.getPrimaryWeapon();
        if (weapon) {
            this.setCombatStyle(weapon.type);
        }
    }
}