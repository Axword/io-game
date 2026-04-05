import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { XpOrb } from '../entities/XpOrb.js';
import { rng, rngInt, getZoneIdx } from '../utils/math.js';
import { BOSS_TYPES, BOSS_SPAWN_INTERVAL, DIFFICULTY_CONFIG, VIEW } from '../config/constants.js';

export class SpawnSystem {
    constructor(zones, scene) {
        this.zones = zones;
        this.scene = scene;
        this.monsterSpawnTimer = 0;
        this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
        this.bossWarnings = [];
        this.difficulty = 'medium';
        this.difficultyConfig = DIFFICULTY_CONFIG;
        this.zoneLimits = [
            { zone: 0, limit: 600, current: 0 },
            { zone: 1, limit: 800, current: 0 },
            { zone: 2, limit: 1000, current: 0 },
            { zone: 3, limit: 900, current: 0 },
            { zone: 4, limit: 1200, current: 0 }
        ];
    }
    setDifficulty(diff) {
        if (this.difficultyConfig[diff]) {
            this.difficulty = diff;
        }
    }
    getDifficultyMultipliers() {
        return this.difficultyConfig[this.difficulty] || this.difficultyConfig.medium;
    }
    updateZoneCounts(monsters) {
        for (const limit of this.zoneLimits) {
            limit.current = 0;
        }
        
        for (const m of monsters) {
            const zi = m.zoneIdx;
            if (this.zoneLimits[zi]) {
                this.zoneLimits[zi].current++;
            }
        }
    }
    
    findNearestPlayer(x, y, players) {
        let minDist = 9999;
        for (const p of players) {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < minDist) minDist = d;
        }
        return minDist;
    }
    
    spawnMonster(monsters, players) {
        if (!players || players.length === 0) return;
        
        const WORLD = 12000;
        const MARGIN = 800;
        const SPAWN_DISTANCE = VIEW + 200;
        const MAX_SPAWN_DISTANCE = VIEW + 800;
        const PER_PLAYER_LIMIT = 50;
        
        this.updateZoneCounts(monsters);
        
        const weights = [30, 25, 20, 15, 10];
        const availableZones = this.zoneLimits
            .map((limit, idx) => ({ idx, limit, weight: weights[idx] }))
            .filter(z => z.limit.current < z.limit.limit);
        
        if (availableZones.length === 0) return;
        
        const totalWeight = availableZones.reduce((sum, z) => sum + z.weight, 0);
        let roll = Math.random() * totalWeight;
        let zi = 0;
        
        for (const zone of availableZones) {
            roll -= zone.weight;
            if (roll <= 0) {
                zi = zone.idx;
                break;
            }
        }
        
        const z = this.zones[zi];
        
        // Sprawdź czy jakiś gracz jest blisko strefy
        let spawnerPlayer = null;
        for (const p of players) {
            const playerZone = getZoneIdx(p.x, p.y, this.zones);
            const playerInZone = playerZone === zi;
            const playerNearZone = Math.abs(getZoneIdx(p.x, p.y, this.zones) - zi) <= 1;
            
            if (playerInZone || playerNearZone) {
                spawnerPlayer = p;
                break;
            }
        }
        
        if (!spawnerPlayer) return;
        
        // Per-player limit - nie spawnnuj zbyt dużo wokół jednego gracza
        const monstersNearPlayer = monsters.filter(m => Math.hypot(m.x - spawnerPlayer.x, m.y - spawnerPlayer.y) < SPAWN_DISTANCE * 1.5).length;
        if (monstersNearPlayer >= PER_PLAYER_LIMIT) return;
        
        let x, y;
        let attempts = 0;
        let validSpawn = false;
        
        do {
            const angle = Math.random() * Math.PI * 2;
            const distance = rng(SPAWN_DISTANCE, MAX_SPAWN_DISTANCE);
            x = spawnerPlayer.x + Math.cos(angle) * distance;
            y = spawnerPlayer.y + Math.sin(angle) * distance;
            
            const distFromCenter = Math.hypot(x, y);
            
            const inBounds = Math.abs(x) < WORLD/2 - MARGIN && Math.abs(y) < WORLD/2 - MARGIN;
            const inZone = distFromCenter >= z.minR && distFromCenter <= z.maxR;
            
            const tooCloseToPlayer = players.some(p => Math.hypot(p.x - x, p.y - y) < SPAWN_DISTANCE);
            
            if (inBounds && inZone && !tooCloseToPlayer) {
                validSpawn = true;
            }
            
            attempts++;
        } while (!validSpawn && attempts < 20);
        
        if (!validSpawn) return;
        
        const diffMult = this.getDifficultyMultipliers();
        const monster = new Monster(x, y, zi, this.zones, this.scene, diffMult.hpMult);
        monsters.push(monster);
    }
    
    spawnBoss(bosses) {
        const zi = rngInt(0, 2);
        const z = this.zones[zi];
        
        const angle = Math.random() * Math.PI * 2;
        const r = rng(z.minR + 200, z.maxR - 200);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        
        const bossType = BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)];
        
        this.createBossWarning(x, y, bossType);
        
        setTimeout(() => {
            const boss = new Boss(x, y, bossType, this.scene);
            bosses.push(boss);
        }, 3000);
    }
    
    createBossWarning(x, y, bossType) {
        const warningGeo = new THREE.CircleGeometry(100, 32);
        const warningMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.3 
        });
        const warning = new THREE.Mesh(warningGeo, warningMat);
        warning.position.set(x, y, -5);
        this.scene.add(warning);
        
        const ringGeo = new THREE.RingGeometry(95, 105, 32);
        const ringMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.8 
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, y, -4);
        this.scene.add(ring);
        
        this.bossWarnings.push({ warning, ring, life: 3, bossType });
    }
    
    updateBossWarnings(dt) {
        for (let i = this.bossWarnings.length - 1; i >= 0; i--) {
            const w = this.bossWarnings[i];
            w.life -= dt;
            
            const pulse = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
            w.warning.material.opacity = pulse;
            w.ring.material.opacity = 0.8 + Math.sin(Date.now() * 0.015) * 0.2;
            
            if (w.life <= 0) {
                this.scene.remove(w.warning);
                this.scene.remove(w.ring);
                this.bossWarnings.splice(i, 1);
            }
        }
    }
    
    update(dt, monsters, gameTime, bullets, scene, targets, bosses) {
        this.monsterSpawnTimer -= dt;
        const diffMult = this.getDifficultyMultipliers();
        const spawnDelay = (2.5 + Math.random() * 2.5) / (diffMult.spawnMult * 0.75);
        
        if (this.monsterSpawnTimer <= 0) {
            this.updateZoneCounts(monsters);
            
            const playerCount = targets.length || 1;
            const totalLimit = this.zoneLimits.reduce((sum, z) => sum + Math.ceil(z.limit / playerCount), 0);
            const totalCurrent = this.zoneLimits.reduce((sum, z) => sum + z.current, 0);
            
            if (totalCurrent < totalLimit) {
                const spawnCount = Math.max(1, Math.ceil((totalLimit - totalCurrent) * 0.1));
                for (let i = 0; i < spawnCount; i++) {
                    this.spawnMonster(monsters, targets);
                }
            }
            
            this.monsterSpawnTimer = spawnDelay;
        }
        
        this.bossSpawnTimer -= dt;
        if (this.bossSpawnTimer <= 0) {
            this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
            this.spawnBoss(bosses);
        }
        
        this.updateBossWarnings(dt);
        
        for (const m of monsters) {
            m.update(dt, targets, 0, bullets, scene);
        }
        
        if (bosses) {
            for (const boss of bosses) {
                boss.update(dt, targets, bullets, scene);
            }
        }
    }
    
    spawnXpOrbs(entity, xpOrbs) {
        const count = rngInt(2, 4);
        const xpPerOrb = entity.xp / count;
        
        for (let i = 0; i < count; i++) {
            const orb = new XpOrb(
                entity.x + rng(-30, 30),
                entity.y + rng(-30, 30),
                xpPerOrb + rng(0, xpPerOrb * 0.5),
                this.scene
            );
            xpOrbs.push(orb);
        }
    }
}