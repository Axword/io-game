// ai/BotAI.js

import { StateMachine } from './core/StateMachine.js';
import { MemorySystem } from './systems/MemorySystem.js';
import { PersonalitySystem } from './systems/PersonalitySystem.js';
import { ThreatSystem } from './systems/ThreatSystem.js';

import { FleeBehavior } from './behaviors/FleeBehavior.js';
import { CombatBehavior } from './behaviors/CombatBehavior.js';
import { CollectBehavior } from './behaviors/CollectBehavior.js';
import { ExploreBehavior } from './behaviors/ExploreBehavior.js';
import { HealBehavior } from './behaviors/HealBehavior.js';

import { rng, norm } from '../utils/math.js';

/**
 * Główny kontroler AI dla botów - fasada łącząca wszystkie systemy
 */
export class BotAI {
    /**
     * @param {CombatEntity} bot 
     */
    constructor(bot) {
        /** @type {CombatEntity} */
        this.bot = bot;
        
        // Systemy
        /** @type {MemorySystem} */
        this.memory = new MemorySystem();
        
        /** @type {PersonalitySystem} */
        this.personality = new PersonalitySystem();
        
        /** @type {ThreatSystem} */
        this.threatSystem = new ThreatSystem();
        
        // Zachowania
        /** @type {Map<string, BaseBehavior>} */
        this.behaviors = new Map([
            ['flee', new FleeBehavior()],
            ['combat', new CombatBehavior()],
            ['collect', new CollectBehavior()],
            ['explore', new ExploreBehavior()],
            ['heal', new HealBehavior()],
        ]);
        
        /** @type {BaseBehavior|null} */
        this.activeBehavior = null;
        
        /** @type {string} */
        this.activeBehaviorName = 'explore';
        
        // Statystyki
        /** @type {number} */
        this.totalKills = 0;
        
        /** @type {number} */
        this.totalDeaths = 0;
        
        /** @type {number} */
        this.survivalTime = 0;
        
        /** @type {number} */
        this.recentKills = 0;
        
        /** @type {number} */
        this.recentXpGained = 0;
        
        // Cache i optymalizacja
        /** @type {number} */
        this.cacheTimer = 0;
        
        /** @type {number} */
        this.decisionTimer = 0;
        
        /** @type {number} */
        this.decisionInterval = 0.1;
        
        // Last position for stuck detection
        /** @type {{x: number, y: number}} */
        this.lastPosition = { x: bot.x, y: bot.y };
        
        /** @type {number} */
        this.stuckTimer = 0;
    }
    
    /**
     * Główna funkcja decyzyjna
     * @param {LivingEntity[]} monsters 
     * @param {XpOrb[]} xpOrbs 
     * @param {number} dt 
     * @returns {BehaviorResult}
     */
    decide(monsters, xpOrbs, dt = 0.016) {
        // Aktualizuj systemy
        this.updateSystems(dt, monsters, xpOrbs);
        
        // Sprawdź czy jesteśmy stuck
        this.checkStuck(dt);
        
        // Buduj kontekst
        const context = this.buildContext(monsters, xpOrbs, dt);
        
        // Wybierz i wykonaj zachowanie
        this.decisionTimer -= dt;
        if (this.decisionTimer <= 0) {
            this.decisionTimer = this.decisionInterval;
            this.selectBehavior(context);
        }
        
        // Wykonaj aktywne zachowanie
        return this.executeBehavior(dt, context);
    }
    
    /**
     * Aktualizuje wszystkie systemy
     * @private
     */
    updateSystems(dt, monsters, xpOrbs) {
        // Aktualizuj pamięć
        this.memory.update(dt, this.survivalTime);
        this.memory.updateXpClusters(xpOrbs, this.bot.x, this.bot.y);
        
        // Aktualizuj zagrożenia
        this.threatSystem.update(dt, this.bot, monsters);
        
        // Aktualizuj osobowość
        this.personality.update(dt, {
            hpPercent: this.bot.getHealthPercent(),
            threatCount: this.threatSystem.getThreatsInRange(300).length,
            inDanger: this.threatSystem.isCriticalSituation(this.bot.getHealthPercent()),
            recentKills: this.recentKills,
            recentDeaths: 0,
            recentXp: this.recentXpGained,
            totalDeaths: this.totalDeaths,
            totalKills: this.totalKills,
            survivalTime: this.survivalTime
        });
        
        // Zwiększ czas przetrwania
        this.survivalTime += dt;
        
        // Zapisz odwiedzoną lokację
        this.memory.recordVisit(this.bot.x, this.bot.y);
        
        // Resetuj recent stats
        this.recentKills = 0;
        this.recentXpGained = 0;
    }
    
    /**
     * Sprawdza czy bot utknął
     * @private
     */
    checkStuck(dt) {
        const dx = this.bot.x - this.lastPosition.x;
        const dy = this.bot.y - this.lastPosition.y;
        const moved = Math.hypot(dx, dy);
        
        if (moved < 5) {
            this.stuckTimer += dt;
        } else {
            this.stuckTimer = 0;
        }
        
        this.lastPosition = { x: this.bot.x, y: this.bot.y };
    }
    
    /**
     * Buduje kontekst dla zachowań
     * @private
     * @returns {BehaviorContext}
     */
    buildContext(monsters, xpOrbs, dt) {
        const centerDist = Math.hypot(this.bot.x, this.bot.y);
        
        return {
            bot: this.bot,
            threatSystem: this.threatSystem,
            memory: this.memory,
            personality: this.personality,
            monsters,
            xpOrbs,
            dt,
            gameTime: this.survivalTime,
            centerDistance: centerDist,
            currentZone: this.getZone(centerDist),
            isStuck: this.stuckTimer > 1.0,
        };
    }
    
    /**
     * Wybiera najlepsze zachowanie
     * @private
     */
    selectBehavior(context) {
        // Handle stuck
        if (context.isStuck) {
            this.unstuck();
            return;
        }
        
        // Oblicz priorytety wszystkich zachowań
        const priorities = [];
        
        for (const [name, behavior] of this.behaviors) {
            if (behavior.canExecute(context)) {
                const priority = behavior.calculatePriority(context);
                priorities.push({ name, behavior, priority });
            }
        }
        
        // Sortuj wg priorytetu
        priorities.sort((a, b) => b.priority - a.priority);
        
        // Wybierz najwyższy priorytet z histerezą
        const best = priorities[0];
        if (!best) return;
        
        const currentPriority = this.activeBehavior?.calculatePriority(context) || 0;
        const hysteresis = 10;
        
        if (best.priority > currentPriority + hysteresis || !this.activeBehavior) {
            this.switchBehavior(best.name, best.behavior, context);
        }
    }
    
    /**
     * Przełącza zachowanie
     * @private
     */
    switchBehavior(name, behavior, context) {
        if (this.activeBehavior) {
            this.activeBehavior.onDeactivate(context);
        }
        
        this.activeBehaviorName = name;
        this.activeBehavior = behavior;
        behavior.onActivate(context);
    }
    
    /**
     * Wykonuje aktywne zachowanie
     * @private
     * @returns {BehaviorResult}
     */
    executeBehavior(dt, context) {
        if (!this.activeBehavior) {
            // Domyślnie eksploruj
            this.activeBehavior = this.behaviors.get('explore');
        }
        
        this.activeBehavior.updateActiveTime(dt);
        return this.activeBehavior.execute(dt, context);
    }
    
    /**
     * Odblokowuje bota gdy utknął
     * @private
     */
    unstuck() {
        this.stuckTimer = 0;
        // Losowy kierunek
        const angle = Math.random() * Math.PI * 2;
        return {
            move: { x: Math.cos(angle), y: Math.sin(angle) }
        };
    }
    
    /**
     * Określa strefę na podstawie dystansu
     * @private
     */
    getZone(centerDist) {
        if (centerDist < 1500) return 0;
        if (centerDist < 3000) return 1;
        if (centerDist < 4500) return 2;
        if (centerDist < 6000) return 3;
        return 4;
    }
    
    // ============ Callbacki ============
    
    /**
     * Wywoływane gdy bot otrzyma obrażenia
     * @param {number} amount 
     * @param {Entity|null} source 
     */
    onDamageTaken(amount, source) {
        // Zapisz w pamięci
        this.memory.addMemory('damage', {
            amount,
            sourceId: source?.id,
            x: source?.x || this.bot.x,
            y: source?.y || this.bot.y
        }, this.survivalTime, 2);
        
        // Oznacz obszar jako niebezpieczny
        if (source) {
            this.memory.markDangerZone(
                source.x, source.y,
                200, 5, this.survivalTime,
                amount / 20
            );
        }
    }
    
    /**
     * Wywoływane gdy bot zabije coś
     * @param {LivingEntity} victim 
     */
    onKill(victim) {
        this.totalKills++;
        this.recentKills++;
        
        this.memory.addMemory('kill', {
            victimId: victim.id,
            x: victim.x,
            y: victim.y,
            xpGained: victim.xp || 0
        }, this.survivalTime, 1);
    }
    
    /**
     * Wywoływane gdy bot umrze
     */
    onDeath() {
        this.totalDeaths++;
        
        // Adaptacja - zwiększ ostrożność
        this.personality.traits.caution = Math.min(1, this.personality.traits.caution + 0.1);
        
        // Reset survival time
        this.survivalTime = 0;
    }
    
    /**
     * Wywoływane gdy bot zdobędzie XP
     * @param {number} amount 
     */
    onXpGained(amount) {
        this.recentXpGained += amount;
    }
    
    /**
     * Zwraca informacje debugowe
     * @returns {Object}
     */
    getDebugInfo() {
        return {
            activeBehavior: this.activeBehaviorName,
            personality: this.personality.getDescription(),
            stress: this.personality.stress.toFixed(2),
            mood: this.personality.mood.toFixed(2),
            threats: this.threatSystem.getTotalThreatLevel().toFixed(1),
            memory: this.memory.toJSON(),
            survivalTime: this.survivalTime.toFixed(0)
        };
    }
}