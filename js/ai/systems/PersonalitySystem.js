// ai/systems/PersonalitySystem.js

import { rng } from '../../utils/math.js';

/**
 * System osobowości dla AI - definiuje unikalne cechy behawioralne
 */
export class PersonalitySystem {
    /**
     * @param {PersonalityConfig} [config] - Opcjonalna konfiguracja
     */
    constructor(config = null) {
        if (config) {
            this.traits = { ...config };
        } else {
            this.traits = this.generateRandomPersonality();
        }
        
        /** @type {string} Archetyp osobowości */
        this.archetype = this.determineArchetype();
        
        /** @type {number} Modyfikator nastroju (-1 do 1) */
        this.mood = 0;
        
        /** @type {number} Poziom stresu (0 do 1) */
        this.stress = 0;
        
        /** @type {number} Timer adaptacji */
        this.adaptationTimer = 0;
    }
    
    /**
     * Generuje losową osobowość
     * @returns {PersonalityTraits}
     */
    generateRandomPersonality() {
        return {
            // Cechy podstawowe
            aggression: rng(0.2, 1.0),      // Skłonność do ataku
            caution: rng(0.2, 1.0),          // Ostrożność/unikanie ryzyka
            greed: rng(0.3, 0.9),            // Priorytet zbierania XP
            patience: rng(0.2, 0.8),         // Cierpliwość w planowaniu
            exploration: rng(0.2, 0.8),      // Chęć eksploracji
            
            // Cechy zaawansowane
            riskTolerance: rng(0.2, 0.8),    // Akceptacja ryzyka
            persistence: rng(0.3, 0.9),      // Wytrwałość w dążeniu do celu
            adaptability: rng(0.3, 0.8),     // Zdolność adaptacji
            socialness: rng(0.1, 0.7),       // Interakcja z innymi botami
            
            // Preferencje taktyczne
            preferRanged: rng(0, 1),         // Preferencja do walki dystansowej
            preferAmbush: rng(0, 1),         // Preferencja do zasadzek
            preferDefense: rng(0, 1),        // Preferencja do defensywy
        };
    }
    
    /**
     * Określa archetyp na podstawie cech
     * @returns {string}
     */
    determineArchetype() {
        const t = this.traits;
        
        if (t.aggression > 0.7 && t.caution < 0.4) {
            return 'berserker';
        } else if (t.caution > 0.7 && t.greed < 0.5) {
            return 'survivor';
        } else if (t.greed > 0.7 && t.exploration > 0.6) {
            return 'collector';
        } else if (t.exploration > 0.7 && t.patience > 0.6) {
            return 'explorer';
        } else if (t.patience > 0.7 && t.preferDefense > 0.6) {
            return 'tactician';
        } else if (t.preferAmbush > 0.6 && t.patience > 0.5) {
            return 'assassin';
        } else {
            return 'balanced';
        }
    }
    
    /**
     * Aktualizuje osobowość w czasie
     * @param {number} dt 
     * @param {PersonalityContext} context 
     */
    update(dt, context) {
        // Aktualizuj stres na podstawie sytuacji
        this.updateStress(context);
        
        // Aktualizuj nastrój
        this.updateMood(context);
        
        // Adaptacja po czasie
        this.adaptationTimer += dt;
        if (this.adaptationTimer > 60) {
            this.adapt(context);
            this.adaptationTimer = 0;
        }
    }
    
    /**
     * Aktualizuje poziom stresu
     * @param {PersonalityContext} context 
     */
    updateStress(context) {
        const { hpPercent, threatCount, inDanger } = context;
        
        // Stres rośnie gdy niskie HP lub dużo zagrożeń
        const targetStress = (1 - hpPercent) * 0.5 + 
                             Math.min(threatCount / 5, 0.3) +
                             (inDanger ? 0.2 : 0);
        
        // Płynna zmiana stresu
        this.stress += (targetStress - this.stress) * 0.1;
        this.stress = Math.max(0, Math.min(1, this.stress));
    }
    
    /**
     * Aktualizuje nastrój
     * @param {PersonalityContext} context 
     */
    updateMood(context) {
        const { recentKills, recentDeaths, recentXp } = context;
        
        // Pozytywne wydarzenia poprawiają nastrój
        if (recentKills > 0) this.mood += 0.1 * recentKills;
        if (recentXp > 0) this.mood += 0.02;
        
        // Negatywne wydarzenia pogarszają
        if (recentDeaths > 0) this.mood -= 0.3;
        if (this.stress > 0.7) this.mood -= 0.05;
        
        // Normalizuj i powoli wracaj do neutralnego
        this.mood = Math.max(-1, Math.min(1, this.mood));
        this.mood *= 0.99;
    }
    
    /**
     * Adaptuje osobowość na podstawie doświadczeń
     * @param {PersonalityContext} context 
     */
    adapt(context) {
        const { totalDeaths, totalKills, survivalTime } = context;
        const adaptRate = this.traits.adaptability * 0.05;
        
        // Jeśli dużo umierał - zwiększ ostrożność
        if (totalDeaths > 3) {
            this.traits.caution = Math.min(1, this.traits.caution + adaptRate);
            this.traits.aggression = Math.max(0.2, this.traits.aggression - adaptRate * 0.5);
        }
        
        // Jeśli dużo zabijał - zwiększ agresję
        if (totalKills > 10) {
            this.traits.aggression = Math.min(1, this.traits.aggression + adaptRate * 0.3);
        }
        
        // Długie przetrwanie - zwiększ cierpliwość
        if (survivalTime > 120) {
            this.traits.patience = Math.min(1, this.traits.patience + adaptRate * 0.2);
        }
        
        // Przelicz archetyp
        this.archetype = this.determineArchetype();
    }
    
    /**
     * Zwraca zmodyfikowaną cechę uwzględniając nastrój i stres
     * @param {string} trait 
     * @returns {number}
     */
    getEffectiveTrait(trait) {
        const baseTrait = this.traits[trait] || 0.5;
        
        // Stres wpływa na cechy
        let modifier = 1;
        
        switch (trait) {
            case 'aggression':
                // Stres może zwiększyć agresję (walka) lub zmniejszyć (ucieczka)
                modifier = 1 + (this.stress - 0.5) * (this.traits.riskTolerance - 0.5);
                break;
            case 'caution':
                // Stres zwiększa ostrożność
                modifier = 1 + this.stress * 0.3;
                break;
            case 'patience':
                // Stres zmniejsza cierpliwość
                modifier = 1 - this.stress * 0.3;
                break;
            case 'greed':
                // Dobry nastrój zwiększa chciwość
                modifier = 1 + this.mood * 0.2;
                break;
        }
        
        return Math.max(0, Math.min(1, baseTrait * modifier));
    }
    
    /**
     * Sprawdza czy osobowość preferuje daną akcję
     * @param {string} action 
     * @returns {boolean}
     */
    prefersAction(action) {
        const threshold = 0.5;
        
        switch (action) {
            case 'attack':
                return this.getEffectiveTrait('aggression') > threshold;
            case 'flee':
                return this.getEffectiveTrait('caution') > threshold && this.stress > 0.4;
            case 'collect':
                return this.getEffectiveTrait('greed') > threshold;
            case 'explore':
                return this.getEffectiveTrait('exploration') > threshold;
            case 'wait':
                return this.getEffectiveTrait('patience') > threshold;
            default:
                return false;
        }
    }
    
    /**
     * Oblicza modyfikator priorytetu dla akcji
     * @param {string} action 
     * @returns {number} Modyfikator (0.5 - 1.5)
     */
    getActionModifier(action) {
        const traitMap = {
            'flee': 'caution',
            'heal': 'caution',
            'combat': 'aggression',
            'collect': 'greed',
            'explore': 'exploration',
            'wait': 'patience'
        };
        
        const trait = traitMap[action];
        if (!trait) return 1;
        
        const value = this.getEffectiveTrait(trait);
        return 0.5 + value; // Zakres 0.5 - 1.5
    }
    
    /**
     * Zwraca opis osobowości
     * @returns {string}
     */
    getDescription() {
        const traits = [];
        
        if (this.traits.aggression > 0.7) traits.push('aggressive');
        if (this.traits.caution > 0.7) traits.push('cautious');
        if (this.traits.greed > 0.7) traits.push('greedy');
        if (this.traits.exploration > 0.7) traits.push('curious');
        if (this.traits.patience > 0.7) traits.push('patient');
        
        return `${this.archetype} (${traits.join(', ') || 'balanced'})`;
    }
    
    /**
     * Serializuje osobowość
     * @returns {Object}
     */
    toJSON() {
        return {
            traits: { ...this.traits },
            archetype: this.archetype,
            mood: this.mood,
            stress: this.stress
        };
    }
    
    /**
     * Wczytuje osobowość z JSON
     * @param {Object} data 
     */
    fromJSON(data) {
        if (data.traits) {
            this.traits = { ...data.traits };
        }
        if (data.archetype) {
            this.archetype = data.archetype;
        }
        if (typeof data.mood === 'number') {
            this.mood = data.mood;
        }
        if (typeof data.stress === 'number') {
            this.stress = data.stress;
        }
    }
}

/**
 * @typedef {Object} PersonalityTraits
 * @property {number} aggression
 * @property {number} caution
 * @property {number} greed
 * @property {number} patience
 * @property {number} exploration
 * @property {number} riskTolerance
 * @property {number} persistence
 * @property {number} adaptability
 * @property {number} socialness
 * @property {number} preferRanged
 * @property {number} preferAmbush
 * @property {number} preferDefense
 */

/**
 * @typedef {Object} PersonalityContext
 * @property {number} hpPercent
 * @property {number} threatCount
 * @property {boolean} inDanger
 * @property {number} recentKills
 * @property {number} recentDeaths
 * @property {number} recentXp
 * @property {number} totalDeaths
 * @property {number} totalKills
 * @property {number} survivalTime
 */

/**
 * @typedef {PersonalityTraits} PersonalityConfig
 */