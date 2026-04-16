// ai/core/StateMachine.js

/**
 * Generyczna maszyna stanów z obsługą przejść i histerii
 */
export class StateMachine {
    /**
     * @param {Object<string, State>} states - Mapa stanów
     * @param {string} initialState - Początkowy stan
     */
    constructor(states, initialState) {
        /** @type {Object<string, State>} */
        this.states = states;
        
        /** @type {string} */
        this.currentStateId = initialState;
        
        /** @type {State} */
        this.currentState = states[initialState];
        
        /** @type {string|null} */
        this.previousStateId = null;
        
        /** @type {number} Czas w obecnym stanie */
        this.stateTime = 0;
        
        /** @type {number} Histeria - opóźnienie przed zmianą stanu */
        this.hysteresis = 10;
        
        /** @type {number} Minimalny czas w stanie */
        this.minStateTime = 0.3;
        
        /** @type {string[]} Historia stanów */
        this.history = [];
        
        /** @type {number} Maksymalny rozmiar historii */
        this.maxHistorySize = 10;
        
        // Wejdź do początkowego stanu
        if (this.currentState?.enter) {
            this.currentState.enter(null);
        }
    }
    
    /**
     * Aktualizuje maszynę stanów
     * @param {number} dt 
     * @param {Object} context 
     * @returns {any} Wynik aktualizacji stanu
     */
    update(dt, context) {
        this.stateTime += dt;
        
        // Sprawdź przejścia
        const nextStateId = this.checkTransitions(context);
        
        if (nextStateId && this.canTransitionTo(nextStateId, context)) {
            this.transitionTo(nextStateId, context);
        }
        
        // Wykonaj bieżący stan
        if (this.currentState?.execute) {
            return this.currentState.execute(dt, context);
        }
        
        return null;
    }
    
    /**
     * Sprawdza możliwe przejścia
     * @param {Object} context 
     * @returns {string|null}
     */
    checkTransitions(context) {
        if (!this.currentState?.transitions) return null;
        
        for (const [targetState, condition] of Object.entries(this.currentState.transitions)) {
            if (condition(context)) {
                return targetState;
            }
        }
        
        return null;
    }
    
    /**
     * Sprawdza czy można przejść do stanu
     * @param {string} targetStateId 
     * @param {Object} context 
     * @returns {boolean}
     */
    canTransitionTo(targetStateId, context) {
        if (targetStateId === this.currentStateId) return false;
        if (this.stateTime < this.minStateTime) return false;
        
        const targetState = this.states[targetStateId];
        if (!targetState) return false;
        
        // Sprawdź priorytet z histerezą
        const currentPriority = this.currentState?.priority?.(context) || 0;
        const targetPriority = targetState.priority?.(context) || 0;
        
        return targetPriority > currentPriority + this.hysteresis;
    }
    
    /**
     * Przechodzi do nowego stanu
     * @param {string} newStateId 
     * @param {Object} context 
     */
    transitionTo(newStateId, context) {
        const newState = this.states[newStateId];
        if (!newState) {
            console.warn(`State ${newStateId} not found`);
            return;
        }
        
        // Wyjdź z obecnego stanu
        if (this.currentState?.exit) {
            this.currentState.exit(newStateId, context);
        }
        
        // Zapisz historię
        this.history.push(this.currentStateId);
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
        
        // Zmień stan
        this.previousStateId = this.currentStateId;
        this.currentStateId = newStateId;
        this.currentState = newState;
        this.stateTime = 0;
        
        // Wejdź do nowego stanu
        if (this.currentState.enter) {
            this.currentState.enter(this.previousStateId, context);
        }
    }
    
    /**
     * Wymusza przejście do stanu (ignoruje warunki)
     * @param {string} stateId 
     * @param {Object} context 
     */
    forceTransition(stateId, context = {}) {
        if (this.states[stateId]) {
            this.transitionTo(stateId, context);
        }
    }
    
    /**
     * Wraca do poprzedniego stanu
     * @param {Object} context 
     */
    revertToPrevious(context = {}) {
        if (this.previousStateId) {
            this.transitionTo(this.previousStateId, context);
        }
    }
    
    /**
     * Sprawdza czy jest w danym stanie
     * @param {string} stateId 
     * @returns {boolean}
     */
    isInState(stateId) {
        return this.currentStateId === stateId;
    }
    
    /**
     * Sprawdza czy był ostatnio w danym stanie
     * @param {string} stateId 
     * @param {number} historyDepth 
     * @returns {boolean}
     */
    wasInState(stateId, historyDepth = 3) {
        const recentHistory = this.history.slice(-historyDepth);
        return recentHistory.includes(stateId);
    }
    
    /**
     * Resetuje maszynę stanów
     * @param {string} initialState 
     */
    reset(initialState) {
        this.currentStateId = initialState;
        this.currentState = this.states[initialState];
        this.previousStateId = null;
        this.stateTime = 0;
        this.history = [];
        
        if (this.currentState?.enter) {
            this.currentState.enter(null);
        }
    }
}

/**
 * @typedef {Object} State
 * @property {function(string|null, Object): void} [enter] - Wywoływane przy wejściu do stanu
 * @property {function(number, Object): any} [execute] - Wywoływane co klatkę
 * @property {function(string, Object): void} [exit] - Wywoływane przy wyjściu ze stanu
 * @property {function(Object): number} [priority] - Zwraca priorytet stanu
 * @property {Object<string, function(Object): boolean>} [transitions] - Warunki przejść
 */