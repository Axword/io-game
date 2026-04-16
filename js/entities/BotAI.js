// entities/BotAI.js

import { rng, norm } from '../utils/math.js';

/**
 * Zaawansowany system AI dla botów
 * Wykorzystuje system priorytetów, pamięć, i adaptacyjne zachowania
 */
export class BotAI {
    constructor(bot) {
        this.bot = bot;
        
        // Stan główny
        this.state = 'exploring';
        this.subState = null;
        this.stateTimer = 0;
        this.decisionTimer = 0;
        
        // Pamięć bota
        this.memory = {
            lastDamageTime: 0,
            lastDamageSource: null,
            dangerousAreas: [], // [{x, y, radius, expireTime}]
            visitedAreas: [],   // [{x, y, time}]
            knownXpClusters: [], // [{x, y, totalValue, orbCount}]
            recentKills: 0,
            deathCount: 0,
            lastPosition: { x: 0, y: 0 },
            stuckTimer: 0,
        };
        
        // Parametry osobowości (różnicuje zachowania botów)
        this.personality = this.generatePersonality();
        
        // Cel i ścieżka
        this.target = null;
        this.targetType = null;
        this.pathHistory = [];
        this.fleeDirection = null;
        this.fleeTimer = 0;
        
        // Taktyka walki
        this.combatStyle = this.determineCombatStyle();
        this.kiteDirection = 1; // 1 lub -1 dla kierunku kręcenia
        this.lastKiteSwitch = 0;
        
        // Timery
        this.dangerCheckTimer = 0;
        this.xpScanTimer = 0;
        this.tacticalTimer = 0;
        
        // Cache dla optymalizacji
        this.cachedNearbyMonsters = [];
        this.cachedNearbyXp = [];
        this.cacheTimer = 0;
    }

    /**
     * Generuje unikalną "osobowość" dla bota
     */
    generatePersonality() {
        return {
            aggression: rng(0.3, 1.0),      // Jak agresywnie atakuje
            caution: rng(0.3, 1.0),          // Jak ostrożny jest
            greed: rng(0.4, 0.9),            // Priorytet zbierania XP
            patience: rng(0.3, 0.8),         // Jak długo czeka/planuje
            exploration: rng(0.3, 0.7),      // Chęć eksploracji nowych miejsc
            riskTolerance: rng(0.2, 0.8),    // Akceptacja ryzyka
        };
    }

    /**
     * Określa styl walki na podstawie klasy i broni
     */
    determineCombatStyle() {
        const weapon = this.bot.weapons[0];
        if (!weapon) return 'melee';
        
        const weaponType = weapon.type;
        
        switch (weaponType) {
            case 'aura':
                return 'aura'; // Wchodzi w środek wrogów
            case 'bow':
            case 'lightning':
            case 'crossbow':
            case 'fireball':
                return 'ranged'; // Utrzymuje dystans
            case 'sword':
            case 'axe':
            case 'hammer':
                return 'melee'; // Agresywne podejście
            case 'dagger':
                return 'assassin'; // Hit and run
            default:
                return 'balanced';
        }
    }

    /**
     * Główna funkcja decyzyjna
     */
    decide(monsters, xpOrbs, dt = 0.016) {
        // Aktualizuj cache co kilka klatek
        this.updateCache(monsters, xpOrbs, dt);
        
        // Sprawdź czy bot jest stuck
        this.checkIfStuck(dt);
        
        // Aktualizuj pamięć
        this.updateMemory(dt);
        
        // Oblicz kontekst sytuacyjny
        const context = this.analyzeContext(monsters, xpOrbs);
        
        // System priorytetów - wybierz najważniejszą akcję
        const priority = this.calculatePriorities(context);
        
        // Wybierz stan na podstawie priorytetów
        this.selectState(priority, context);
        
        // Wykonaj wybraną akcję
        return this.executeCurrentState(context, dt);
    }

    /**
     * Aktualizuje cache dla optymalizacji
     */
    updateCache(monsters, xpOrbs, dt) {
        this.cacheTimer -= dt;
        
        if (this.cacheTimer <= 0) {
            this.cacheTimer = 0.1; // Aktualizuj co 100ms
            
            // Cache najbliższych potworów
            this.cachedNearbyMonsters = monsters
                .map(m => ({
                    monster: m,
                    dist: Math.hypot(m.x - this.bot.x, m.y - this.bot.y),
                    threat: this.calculateThreat(m)
                }))
                .filter(m => m.dist < 800)
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 20);
            
            // Cache najbliższych orbs
            this.cachedNearbyXp = xpOrbs
                .filter(o => o.life > 0)
                .map(o => ({
                    orb: o,
                    dist: Math.hypot(o.x - this.bot.x, o.y - this.bot.y),
                    value: o.val
                }))
                .filter(o => o.dist < 600)
                .sort((a, b) => (b.value / b.dist) - (a.value / a.dist))
                .slice(0, 15);
        }
    }

    /**
     * Sprawdza czy bot utknął
     */
    checkIfStuck(dt) {
        const dx = this.bot.x - this.memory.lastPosition.x;
        const dy = this.bot.y - this.memory.lastPosition.y;
        const moved = Math.hypot(dx, dy);
        
        if (moved < 5) {
            this.memory.stuckTimer += dt;
        } else {
            this.memory.stuckTimer = 0;
        }
        
        this.memory.lastPosition = { x: this.bot.x, y: this.bot.y };
    }

    /**
     * Aktualizuje pamięć bota
     */
    updateMemory(dt) {
        // Usuń wygasłe niebezpieczne obszary
        const now = Date.now();
        this.memory.dangerousAreas = this.memory.dangerousAreas.filter(
            area => area.expireTime > now
        );
        
        // Aktualizuj klastry XP
        this.xpScanTimer -= dt;
        if (this.xpScanTimer <= 0) {
            this.xpScanTimer = 2.0;
            this.memory.knownXpClusters = this.findXpClusters();
        }
    }

    /**
     * Znajduje skupiska XP
     */
    findXpClusters() {
        const clusters = [];
        const checked = new Set();
        
        for (const orbData of this.cachedNearbyXp) {
            if (checked.has(orbData.orb)) continue;
            
            const cluster = { x: orbData.orb.x, y: orbData.orb.y, totalValue: 0, orbCount: 0 };
            
            for (const other of this.cachedNearbyXp) {
                const d = Math.hypot(other.orb.x - orbData.orb.x, other.orb.y - orbData.orb.y);
                if (d < 150) {
                    cluster.totalValue += other.value;
                    cluster.orbCount++;
                    cluster.x = (cluster.x + other.orb.x) / 2;
                    cluster.y = (cluster.y + other.orb.y) / 2;
                    checked.add(other.orb);
                }
            }
            
            if (cluster.orbCount >= 2) {
                clusters.push(cluster);
            }
        }
        
        return clusters.sort((a, b) => b.totalValue - a.totalValue);
    }

    /**
     * Oblicza zagrożenie pojedynczego potwora
     */
    calculateThreat(monster) {
        let threat = 1;
        
        // Większe HP = większe zagrożenie
        threat *= (monster.hp || 10) / 10;
        
        // Bliskość zwiększa zagrożenie
        const dist = Math.hypot(monster.x - this.bot.x, monster.y - this.bot.y);
        if (dist < 100) threat *= 2;
        else if (dist < 200) threat *= 1.5;
        
        // Typ potwora (jeśli dostępny)
        if (monster.isBoss) threat *= 3;
        if (monster.isElite) threat *= 2;
        
        return threat;
    }

    /**
     * Analizuje aktualną sytuację
     */
    analyzeContext(monsters, xpOrbs) {
        const centerDist = Math.hypot(this.bot.x, this.bot.y);
        const currentZone = this.getZone(centerDist);
        const hpPercent = this.bot.hp / this.bot.maxHp;
        
        // Oblicz łączne zagrożenie
        let totalThreat = 0;
        let immediateThreats = 0;
        let monstersInRange = 0;
        
        for (const m of this.cachedNearbyMonsters) {
            totalThreat += m.threat;
            if (m.dist < 150) {
                immediateThreats++;
            }
            if (m.dist < this.getWeaponRange()) {
                monstersInRange++;
            }
        }
        
        // Znajdź najbliższe zagrożenie
        const nearestThreat = this.cachedNearbyMonsters[0];
        
        // Oblicz potencjalne XP w pobliżu
        let nearbyXpValue = 0;
        for (const o of this.cachedNearbyXp) {
            nearbyXpValue += o.value / (o.dist / 100);
        }
        
        // Znajdź najbliższy klaster XP
        const bestXpCluster = this.memory.knownXpClusters[0];
        
        // Sprawdź czy jesteśmy w strefie bezpiecznej
        const inSafeZone = currentZone === 0;
        const appropriateZone = this.isAppropriateZone(currentZone);
        
        return {
            centerDist,
            currentZone,
            hpPercent,
            totalThreat,
            immediateThreats,
            monstersInRange,
            nearestThreat,
            nearbyXpValue,
            bestXpCluster,
            inSafeZone,
            appropriateZone,
            isStuck: this.memory.stuckTimer > 1.0,
            weaponReady: this.bot.weapons[0]?.timer <= 0,
            level: this.bot.level,
        };
    }

    /**
     * Sprawdza czy obecna strefa jest odpowiednia dla poziomu
     */
    isAppropriateZone(zone) {
        const level = this.bot.level;
        
        if (level < 3) return zone <= 1;
        if (level < 5) return zone <= 2;
        if (level < 8) return zone <= 3;
        if (level < 12) return zone <= 4;
        return true;
    }

    /**
     * Zwraca zasięg głównej broni
     */
    getWeaponRange() {
        const weapon = this.bot.weapons[0];
        if (!weapon) return 100;
        
        const baseRange = weapon.stats?.range || 200;
        
        switch (weapon.type) {
            case 'aura':
                return weapon.stats?.radius || 150;
            case 'bow':
            case 'crossbow':
                return 450;
            case 'lightning':
            case 'fireball':
                return 400;
            case 'sword':
            case 'axe':
                return 120;
            case 'dagger':
                return 80;
            default:
                return baseRange;
        }
    }

    /**
     * Oblicza priorytety dla różnych akcji
     */
    calculatePriorities(context) {
        const { 
            hpPercent, totalThreat, immediateThreats, nearbyXpValue,
            currentZone, appropriateZone, isStuck
        } = context;
        
        const p = this.personality;
        
        // Priorytet ucieczki
        let fleePriority = 0;
        if (hpPercent < 0.2) fleePriority = 100;
        else if (hpPercent < 0.3) fleePriority = 70 * p.caution;
        else if (hpPercent < 0.5 && immediateThreats > 3) fleePriority = 50 * p.caution;
        if (totalThreat > 10 && hpPercent < 0.6) fleePriority += 30;
        
        // Priorytet leczenia (powrót do safe zone)
        let healPriority = 0;
        if (hpPercent < 0.5 && !context.inSafeZone) {
            healPriority = (1 - hpPercent) * 60 * p.caution;
        }
        
        // Priorytet walki
        let combatPriority = 0;
        if (context.monstersInRange > 0 && context.weaponReady) {
            combatPriority = 40 * p.aggression;
            if (hpPercent > 0.7) combatPriority += 20;
            if (immediateThreats <= 2) combatPriority += 15;
        }
        
        // Priorytet zbierania XP
        let collectPriority = 0;
        if (nearbyXpValue > 0) {
            collectPriority = Math.min(50, nearbyXpValue * 2) * p.greed;
            if (hpPercent > 0.6 && immediateThreats < 2) {
                collectPriority += 20;
            }
        }
        
        // Priorytet eksploracji/przechodzenia do innej strefy
        let explorePriority = 10 * p.exploration;
        if (!appropriateZone) {
            if (currentZone > this.getRecommendedZone()) {
                explorePriority = 60; // Musimy się wycofać
            }
        } else if (this.bot.level >= 5 && currentZone < this.getRecommendedZone()) {
            explorePriority = 40 * p.aggression; // Możemy iść dalej
        }
        
        // Priorytet odblokowania (gdy stuck)
        let unstuckPriority = isStuck ? 80 : 0;
        
        return {
            flee: fleePriority,
            heal: healPriority,
            combat: combatPriority,
            collect: collectPriority,
            explore: explorePriority,
            unstuck: unstuckPriority,
        };
    }

    /**
     * Zwraca rekomendowaną strefę dla obecnego poziomu
     */
    getRecommendedZone() {
        const level = this.bot.level;
        if (level < 3) return 0;
        if (level < 5) return 1;
        if (level < 8) return 2;
        if (level < 12) return 3;
        return 4;
    }

    /**
     * Wybiera stan na podstawie priorytetów
     */
    selectState(priority, context) {
        // Znajdź najwyższy priorytet
        const sorted = Object.entries(priority).sort((a, b) => b[1] - a[1]);
        const [topAction, topValue] = sorted[0];
        
        // Minimalna różnica żeby zmienić stan (zapobiega "migotaniu")
        const currentPriority = priority[this.state] || 0;
        const hysteresis = 10;
        
        if (topValue > currentPriority + hysteresis || this.stateTimer <= 0) {
            this.state = topAction;
            this.stateTimer = rng(0.5, 1.5) * this.personality.patience;
            
            // Reset targetów przy zmianie stanu
            if (topAction !== this.state) {
                this.target = null;
                this.targetType = null;
            }
        }
        
        this.stateTimer -= 0.016;
    }

    /**
     * Wykonuje akcje dla obecnego stanu
     */
    executeCurrentState(context, dt) {
        switch (this.state) {
            case 'flee':
                return this.executeFlee(context, dt);
            case 'heal':
                return this.executeHeal(context);
            case 'combat':
                return this.executeCombat(context, dt);
            case 'collect':
                return this.executeCollect(context);
            case 'explore':
                return this.executeExplore(context);
            case 'unstuck':
                return this.executeUnstuck();
            default:
                return this.executeExplore(context);
        }
    }

    /**
     * Wykonuje ucieczkę
     */
    executeFlee(context, dt) {
        // Oblicz kierunek ucieczki - unikaj wszystkich zagrożeń
        let fleeX = 0, fleeY = 0;
        
        for (const m of this.cachedNearbyMonsters.slice(0, 5)) {
            const weight = 1 / (m.dist * m.dist + 1);
            fleeX += (this.bot.x - m.monster.x) * weight * m.threat;
            fleeY += (this.bot.y - m.monster.y) * weight * m.threat;
        }
        
        // Dodaj komponent w kierunku centrum (bezpieczeństwa)
        const toCenterX = -this.bot.x;
        const toCenterY = -this.bot.y;
        const centerDist = Math.hypot(toCenterX, toCenterY);
        
        if (centerDist > 100) {
            fleeX += toCenterX / centerDist * 0.5;
            fleeY += toCenterY / centerDist * 0.5;
        }
        
        // Unikaj krawędzi mapy
        const WORLD = 12000;
        const edgeBuffer = 500;
        if (Math.abs(this.bot.x) > WORLD/2 - edgeBuffer) {
            fleeX -= Math.sign(this.bot.x) * 2;
        }
        if (Math.abs(this.bot.y) > WORLD/2 - edgeBuffer) {
            fleeY -= Math.sign(this.bot.y) * 2;
        }
        
        const [nx, ny] = norm(fleeX, fleeY);
        
        return { move: { x: nx || 0, y: ny || 0 } };
    }

    /**
     * Wykonuje leczenie (ruch do safe zone)
     */
    executeHeal(context) {
        // Idź w kierunku centrum
        const [nx, ny] = norm(-this.bot.x, -this.bot.y);
        
        // Unikaj potworów po drodze
        let avoidX = 0, avoidY = 0;
        for (const m of this.cachedNearbyMonsters.slice(0, 3)) {
            if (m.dist < 200) {
                avoidX += (this.bot.x - m.monster.x) / m.dist;
                avoidY += (this.bot.y - m.monster.y) / m.dist;
            }
        }
        
        const finalX = nx * 0.7 + avoidX * 0.3;
        const finalY = ny * 0.7 + avoidY * 0.3;
        const [fnx, fny] = norm(finalX, finalY);
        
        return { move: { x: fnx, y: fny } };
    }

    /**
     * Wykonuje walkę - z różnymi stylami
     */
    executeCombat(context, dt) {
        const nearest = context.nearestThreat;
        if (!nearest) return this.executeExplore(context);
        
        const monster = nearest.monster;
        const dist = nearest.dist;
        
        switch (this.combatStyle) {
            case 'aura':
                return this.combatAuraStyle(monster, dist, context);
            case 'ranged':
                return this.combatRangedStyle(monster, dist, context, dt);
            case 'melee':
                return this.combatMeleeStyle(monster, dist, context);
            case 'assassin':
                return this.combatAssassinStyle(monster, dist, context);
            default:
                return this.combatBalancedStyle(monster, dist, context);
        }
    }

    /**
     * Styl walki dla aury - wchodzi w grupy wrogów
     */
    combatAuraStyle(monster, dist, context) {
        const auraRange = this.getWeaponRange();
        
        // Znajdź miejsce z największą gęstością wrogów
        let bestX = monster.x, bestY = monster.y;
        let maxDensity = 0;
        
        for (const m of this.cachedNearbyMonsters) {
            let density = 0;
            for (const other of this.cachedNearbyMonsters) {
                const d = Math.hypot(other.monster.x - m.monster.x, other.monster.y - m.monster.y);
                if (d < auraRange) density++;
            }
            if (density > maxDensity) {
                maxDensity = density;
                bestX = m.monster.x;
                bestY = m.monster.y;
            }
        }
        
        // Jeśli HP jest niskie, nie wchodź głęboko
        if (context.hpPercent < 0.4 && context.immediateThreats > 2) {
            return this.executeFlee(context);
        }
        
        const [nx, ny] = norm(bestX - this.bot.x, bestY - this.bot.y);
        return { move: { x: nx, y: ny } };
    }

    /**
     * Styl walki dla broni dystansowych - kiting
     */
    combatRangedStyle(monster, dist, context, dt) {
        const idealDist = this.getWeaponRange() * 0.7;
        
        // Zmień kierunek kręcenia co jakiś czas
        this.lastKiteSwitch += dt;
        if (this.lastKiteSwitch > 2 + Math.random() * 2) {
            this.kiteDirection *= -1;
            this.lastKiteSwitch = 0;
        }
        
        let moveX, moveY;
        
        if (dist < idealDist - 50) {
            // Za blisko - cofaj się
            const [bx, by] = norm(this.bot.x - monster.x, this.bot.y - monster.y);
            moveX = bx;
            moveY = by;
        } else if (dist > idealDist + 100) {
            // Za daleko - podejdź
            const [ax, ay] = norm(monster.x - this.bot.x, monster.y - this.bot.y);
            moveX = ax;
            moveY = ay;
        } else {
            // Optymalny dystans - krąż
            const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
            const perpAngle = angle + (Math.PI / 2) * this.kiteDirection;
            moveX = Math.cos(perpAngle);
            moveY = Math.sin(perpAngle);
        }
        
        // Unikaj innych wrogów
        for (const m of this.cachedNearbyMonsters.slice(1, 4)) {
            if (m.dist < 150) {
                moveX += (this.bot.x - m.monster.x) / m.dist * 0.5;
                moveY += (this.bot.y - m.monster.y) / m.dist * 0.5;
            }
        }
        
        const [nx, ny] = norm(moveX, moveY);
        return { move: { x: nx, y: ny } };
    }

    /**
     * Styl walki melee - agresywne podejście
     */
    combatMeleeStyle(monster, dist, context) {
        const attackRange = this.getWeaponRange();
        
        if (dist > attackRange + 20) {
            // Podejdź do wroga
            const [nx, ny] = norm(monster.x - this.bot.x, monster.y - this.bot.y);
            return { move: { x: nx, y: ny } };
        } else {
            // W zasięgu - krąż wokół
            const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
            const perpAngle = angle + Math.PI / 2;
            return { move: { x: Math.cos(perpAngle), y: Math.sin(perpAngle) } };
        }
    }

    combatAssassinStyle(monster, dist, context) {
        const attackRange = this.getWeaponRange();
        
        // Jeśli broń gotowa - atakuj
        if (context.weaponReady && dist > attackRange) {
            const [nx, ny] = norm(monster.x - this.bot.x, monster.y - this.bot.y);
            return { move: { x: nx * 1.2, y: ny * 1.2 } }; // Szybsze podejście
        } else if (!context.weaponReady && dist < 150) {
            // Broń na cooldown - wycofaj się
            const [nx, ny] = norm(this.bot.x - monster.x, this.bot.y - monster.y);
            return { move: { x: nx, y: ny } };
        }
        
        // Krąż czekając na cooldown
        const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
        const perpAngle = angle + Math.PI / 2;
        return { move: { x: Math.cos(perpAngle), y: Math.sin(perpAngle) } };
    }

    /**
     * Zbalansowany styl walki
     */
    combatBalancedStyle(monster, dist, context) {
        const idealDist = 200;
        
        if (dist > idealDist + 50) {
            const [nx, ny] = norm(monster.x - this.bot.x, monster.y - this.bot.y);
            return { move: { x: nx, y: ny } };
        } else if (dist < idealDist - 50) {
            const [nx, ny] = norm(this.bot.x - monster.x, this.bot.y - monster.y);
            return { move: { x: nx, y: ny } };
        }
        
        const angle = Math.atan2(monster.y - this.bot.y, monster.x - this.bot.x);
        const perpAngle = angle + Math.PI / 2;
        return { move: { x: Math.cos(perpAngle), y: Math.sin(perpAngle) } };
    }

    /**
     * Wykonuje zbieranie XP
     */
    executeCollect(context) {
        // Priorytet: klastry XP > pojedyncze duże orby > najbliższe orby
        let targetX, targetY;
        
        const cluster = context.bestXpCluster;
        if (cluster && cluster.totalValue > 50) {
            targetX = cluster.x;
            targetY = cluster.y;
        } else if (this.cachedNearbyXp.length > 0) {
            // Wybierz najlepszy stosunek wartości do odległości
            const best = this.cachedNearbyXp[0];
            targetX = best.orb.x;
            targetY = best.orb.y;
        } else {
            return this.executeExplore(context);
        }
        
        // Unikaj potworów po drodze
        let avoidX = 0, avoidY = 0;
        for (const m of this.cachedNearbyMonsters.slice(0, 3)) {
            if (m.dist < 150) {
                avoidX += (this.bot.x - m.monster.x) / m.dist * 0.3;
                avoidY += (this.bot.y - m.monster.y) / m.dist * 0.3;
            }
        }
        
        const [nx, ny] = norm(targetX - this.bot.x + avoidX, targetY - this.bot.y + avoidY);
        return { move: { x: nx, y: ny } };
    }

    /**
     * Wykonuje eksplorację
     */
    executeExplore(context) {
        const recommendedZone = this.getRecommendedZone();
        const targetRadius = this.getZoneRadius(recommendedZone);
        const currentDist = context.centerDist;
        
        // Cel: być w odpowiedniej strefie
        let targetAngle;
        
        if (this.target && this.targetType === 'explore') {
            // Kontynuuj do obecnego celu
            const dx = this.target.x - this.bot.x;
            const dy = this.target.y - this.bot.y;
            if (Math.hypot(dx, dy) < 200) {
                // Osiągnięto cel - wybierz nowy
                this.target = null;
            }
        }
        
        if (!this.target) {
            // Wybierz nowy cel eksploracji
            targetAngle = Math.random() * Math.PI * 2;
            const targetDist = targetRadius * (0.5 + Math.random() * 0.4);
            this.target = {
                x: Math.cos(targetAngle) * targetDist,
                y: Math.sin(targetAngle) * targetDist
            };
            this.targetType = 'explore';
        }
        
        const [nx, ny] = norm(this.target.x - this.bot.x, this.target.y - this.bot.y);
        return { move: { x: nx, y: ny } };
    }

    executeUnstuck() {
        // Losowy kierunek
        const angle = Math.random() * Math.PI * 2;
        this.memory.stuckTimer = 0;
        
        return { move: { x: Math.cos(angle), y: Math.sin(angle) } };
    }

    getZoneRadius(zone) {
        switch (zone) {
            case 0: return 1500;
            case 1: return 3000;
            case 2: return 4500;
            case 3: return 6000;
            default: return 6000;
        }
    }

    getZone(centerDist) {
        if (centerDist < 1500) return 0;
        if (centerDist < 3000) return 1;
        if (centerDist < 4500) return 2;
        if (centerDist < 6000) return 3;
        return 4;
    }

    onDamageTaken(amount, source) {
        this.memory.lastDamageTime = Date.now();
        this.memory.lastDamageSource = source;
        
        if (source) {
            this.memory.dangerousAreas.push({
                x: source.x || this.bot.x,
                y: source.y || this.bot.y,
                radius: 200,
                expireTime: Date.now() + 5000
            });
        }
    }

    onKill() {
        this.memory.recentKills++;
    }

    onDeath() {
        this.memory.deathCount++;
        this.personality.caution = Math.min(1, this.personality.caution + 0.1);
    }
}