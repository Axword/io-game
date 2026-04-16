// ai/systems/MemorySystem.js

/**
 * System pamięci dla AI - przechowuje wspomnienia o zdarzeniach i lokacjach
 */
export class MemorySystem {
    /**
     * @param {MemoryConfig} [config]
     */
    constructor(config = {}) {
        /** @type {number} Maksymalny czas pamięci (sekundy) */
        this.maxMemoryTime = config.maxMemoryTime || 30;
        
        /** @type {number} Maksymalna liczba wspomnień */
        this.maxMemories = config.maxMemories || 100;
        
        /** @type {Memory[]} Wspomnienia */
        this.memories = [];
        
        /** @type {Map<string, DangerZone>} Niebezpieczne obszary */
        this.dangerZones = new Map();
        
        /** @type {{x: number, y: number}[]} Odwiedzone lokacje */
        this.visitedLocations = [];
        
        /** @type {number} Maksymalna liczba lokacji */
        this.maxLocations = 50;
        
        /** @type {Map<number, EntityMemory>} Pamięć o konkretnych jednostkach */
        this.entityMemories = new Map();
        
        /** @type {{x: number, y: number, totalValue: number, count: number}[]} Klastry XP */
        this.xpClusters = [];
        
        /** @type {number} Timer aktualizacji klastrów */
        this.clusterUpdateTimer = 0;
        
        /** @type {number} Interwał aktualizacji klastrów */
        this.clusterUpdateInterval = 2;
    }
    
    /**
     * Aktualizuje pamięć
     * @param {number} dt 
     * @param {number} currentTime - Aktualny czas gry
     */
    update(dt, currentTime) {
        // Usuń stare wspomnienia
        this.memories = this.memories.filter(m => 
            currentTime - m.timestamp < this.maxMemoryTime
        );
        
        // Usuń wygasłe strefy zagrożenia
        for (const [id, zone] of this.dangerZones) {
            if (currentTime > zone.expireTime) {
                this.dangerZones.delete(id);
            }
        }
        
        // Aktualizuj timer klastrów
        this.clusterUpdateTimer -= dt;
    }
    
    /**
     * Dodaje wspomnienie
     * @param {string} type - Typ wspomnienia
     * @param {Object} data - Dane wspomnienia
     * @param {number} currentTime - Aktualny czas
     * @param {number} [importance=1] - Ważność (wyższe = dłużej pamiętane)
     */
    addMemory(type, data, currentTime, importance = 1) {
        const memory = {
            type,
            data,
            timestamp: currentTime,
            importance,
            accessCount: 0
        };
        
        this.memories.push(memory);
        
        // Ogranicz liczbę wspomnień
        if (this.memories.length > this.maxMemories) {
            // Usuń najmniej ważne/najstarsze
            this.memories.sort((a, b) => {
                const ageA = currentTime - a.timestamp;
                const ageB = currentTime - b.timestamp;
                return (b.importance / ageB) - (a.importance / ageA);
            });
            this.memories = this.memories.slice(0, this.maxMemories);
        }
    }
    
    /**
     * Pobiera wspomnienia danego typu
     * @param {string} type 
     * @param {number} [limit] 
     * @returns {Memory[]}
     */
    getMemoriesByType(type, limit = 10) {
        return this.memories
            .filter(m => m.type === type)
            .slice(-limit);
    }
    
    /**
     * Oznacza obszar jako niebezpieczny
     * @param {number} x 
     * @param {number} y 
     * @param {number} radius 
     * @param {number} duration - Czas trwania (sekundy)
     * @param {number} currentTime 
     * @param {number} [threatLevel=1]
     */
    markDangerZone(x, y, radius, duration, currentTime, threatLevel = 1) {
        const id = `${Math.round(x/100)}_${Math.round(y/100)}`;
        
        if (this.dangerZones.has(id)) {
            // Wzmocnij istniejącą strefę
            const zone = this.dangerZones.get(id);
            zone.threatLevel = Math.max(zone.threatLevel, threatLevel);
            zone.expireTime = Math.max(zone.expireTime, currentTime + duration);
        } else {
            this.dangerZones.set(id, {
                x, y, radius, threatLevel,
                expireTime: currentTime + duration
            });
        }
    }
    
    /**
     * Sprawdza czy punkt jest w niebezpiecznym obszarze
     * @param {number} x 
     * @param {number} y 
     * @returns {{inDanger: boolean, threatLevel: number}}
     */
    checkDanger(x, y) {
        let maxThreat = 0;
        
        for (const zone of this.dangerZones.values()) {
            const dist = Math.hypot(x - zone.x, y - zone.y);
            if (dist < zone.radius) {
                maxThreat = Math.max(maxThreat, zone.threatLevel);
            }
        }
        
        return { inDanger: maxThreat > 0, threatLevel: maxThreat };
    }
    
    /**
     * Zapisuje odwiedzoną lokację
     * @param {number} x 
     * @param {number} y 
     */
    recordVisit(x, y) {
        // Zaokrąglij do siatki
        const gridX = Math.round(x / 200) * 200;
        const gridY = Math.round(y / 200) * 200;
        
        // Sprawdź czy już odwiedzono
        const exists = this.visitedLocations.some(
            loc => loc.x === gridX && loc.y === gridY
        );
        
        if (!exists) {
            this.visitedLocations.push({ x: gridX, y: gridY });
            
            if (this.visitedLocations.length > this.maxLocations) {
                this.visitedLocations.shift();
            }
        }
    }
    
    /**
     * Sprawdza czy lokacja była odwiedzona
     * @param {number} x 
     * @param {number} y 
     * @param {number} [tolerance=200]
     * @returns {boolean}
     */
    wasVisited(x, y, tolerance = 200) {
        return this.visitedLocations.some(loc => 
            Math.hypot(x - loc.x, y - loc.y) < tolerance
        );
    }
    
    /**
     * Znajduje nieodwiedzone lokacje w pobliżu
     * @param {number} x 
     * @param {number} y 
     * @param {number} searchRadius 
     * @returns {{x: number, y: number}[]}
     */
    findUnexploredNearby(x, y, searchRadius) {
        const unexplored = [];
        const gridSize = 200;
        const steps = Math.floor(searchRadius / gridSize);
        
        for (let dx = -steps; dx <= steps; dx++) {
            for (let dy = -steps; dy <= steps; dy++) {
                const checkX = x + dx * gridSize;
                const checkY = y + dy * gridSize;
                
                if (!this.wasVisited(checkX, checkY)) {
                    unexplored.push({ x: checkX, y: checkY });
                }
            }
        }
        
        return unexplored;
    }
    
    /**
     * Aktualizuje pamięć o jednostce
     * @param {number} entityId 
     * @param {Object} data 
     * @param {number} currentTime 
     */
    rememberEntity(entityId, data, currentTime) {
        this.entityMemories.set(entityId, {
            ...data,
            lastSeen: currentTime
        });
    }
    
    /**
     * Pobiera pamięć o jednostce
     * @param {number} entityId 
     * @returns {EntityMemory|undefined}
     */
    recallEntity(entityId) {
        return this.entityMemories.get(entityId);
    }
    
    /**
     * Aktualizuje klastry XP
     * @param {Array<{x: number, y: number, val: number}>} xpOrbs 
     * @param {number} botX 
     * @param {number} botY 
     */
    updateXpClusters(xpOrbs, botX, botY) {
        if (this.clusterUpdateTimer > 0) return;
        this.clusterUpdateTimer = this.clusterUpdateInterval;
        
        this.xpClusters = [];
        const checked = new Set();
        const clusterRadius = 150;
        const maxDist = 600;
        
        // Filtruj orby w zasięgu
        const nearbyOrbs = xpOrbs.filter(orb => 
            Math.hypot(orb.x - botX, orb.y - botY) < maxDist
        );
        
        for (const orb of nearbyOrbs) {
            if (checked.has(orb)) continue;
            
            // Znajdź wszystkie orby w klastrze
            const cluster = {
                x: orb.x,
                y: orb.y,
                totalValue: 0,
                count: 0,
                orbs: []
            };
            
            for (const other of nearbyOrbs) {
                const dist = Math.hypot(other.x - orb.x, other.y - orb.y);
                if (dist < clusterRadius) {
                    cluster.totalValue += other.val || 1;
                    cluster.count++;
                    cluster.orbs.push(other);
                    checked.add(other);
                }
            }
            
            // Oblicz centroid klastra
            if (cluster.count > 0) {
                cluster.x = cluster.orbs.reduce((sum, o) => sum + o.x, 0) / cluster.count;
                cluster.y = cluster.orbs.reduce((sum, o) => sum + o.y, 0) / cluster.count;
            }
            
            if (cluster.count >= 2) {
                this.xpClusters.push(cluster);
            }
        }
        
        // Sortuj wg wartości
        this.xpClusters.sort((a, b) => b.totalValue - a.totalValue);
    }
    
    /**
     * Zwraca najlepszy klaster XP
     * @returns {{x: number, y: number, totalValue: number, count: number}|null}
     */
    getBestXpCluster() {
        return this.xpClusters[0] || null;
    }
    
    /**
     * Czyści pamięć
     */
    clear() {
        this.memories = [];
        this.dangerZones.clear();
        this.visitedLocations = [];
        this.entityMemories.clear();
        this.xpClusters = [];
    }
    
    /**
     * Serializuje pamięć
     * @returns {Object}
     */
    toJSON() {
        return {
            memoriesCount: this.memories.length,
            dangerZonesCount: this.dangerZones.size,
            visitedLocationsCount: this.visitedLocations.length,
            xpClustersCount: this.xpClusters.length
        };
    }
}

/**
 * @typedef {Object} Memory
 * @property {string} type
 * @property {Object} data
 * @property {number} timestamp
 * @property {number} importance
 * @property {number} accessCount
 */

/**
 * @typedef {Object} DangerZone
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number} threatLevel
 * @property {number} expireTime
 */

/**
 * @typedef {Object} EntityMemory
 * @property {number} lastSeen
 * @property {number} [lastHp]
 * @property {number} [threatLevel]
 */

/**
 * @typedef {Object} MemoryConfig
 * @property {number} [maxMemoryTime=30]
 * @property {number} [maxMemories=100]
 */