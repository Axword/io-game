// server/systems/SpawnSystem.js
import { ServerMonster } from '../entities/Monster.js';
import { ServerXpOrb } from '../entities/XpOrb.js'; // Założenie, że to stworzymy
import { rng, rngInt, getZoneIdx } from '../utils/math.js';
import { BOSS_TYPES, BOSS_SPAWN_INTERVAL, DIFFICULTY_CONFIG, VIEW, ZONES } from '../config.js';

export class ServerSpawnSystem {
    constructor() {
        this.zones = ZONES;
        this.monsterSpawnTimer = 0;
        this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
        this.difficulty = 'medium';
        this.difficultyConfig = DIFFICULTY_CONFIG;
        this.zoneLimits = [
            { zone: 0, limit: 500, current: 0 }, { zone: 1, limit: 600, current: 0 },
            { zone: 2, limit: 700, current: 0 }, { zone: 3, limit: 800, current: 0 },
            { zone: 4, limit: 900, current: 0 }
        ];
    }

    // ... (WKLEJ: setDifficulty, getDifficultyMultipliers, updateZoneCounts, findNearestPlayer) ...

    spawnMonster(monsters, players) {
        if (!players || players.length === 0) return;
        const WORLD = 12000, MARGIN = 800, SPAWN_DISTANCE = VIEW + 200, MAX_SPAWN_DISTANCE = VIEW + 800;
        
        // ... (WKLEJ LOGIKĘ WYBORU STREFY I GRACZA Z TWOJEGO PLIKU) ...
        
        // Zamiast new Monster(..., this.scene), dajemy:
        const diffMult = this.getDifficultyMultipliers();
        const monster = new ServerMonster(x, y, zi, this.zones, diffMult.hpMult);
        monsters.push(monster);
    }

    spawnBoss(bosses) {
        // ... (WKLEJ LOGIKĘ LOSOWANIA BOSSA) ...
        // Zamiast setTimeout z THREE.js, dodajemy od razu (lub dajemy timer w pętli gry)
        const boss = new ServerMonster(x, y, zi, this.zones, 1.0, true); // true = isBoss
        boss.type = bossType.id; // Zapisz typ bossa
        bosses.push(boss);
    }

    update(dt, monsters, gameTime, bullets, targets, bosses) {
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
                for (let i = 0; i < spawnCount; i++) this.spawnMonster(monsters, targets);
            }
            this.monsterSpawnTimer = spawnDelay;
        }
        
        this.bossSpawnTimer -= dt;
        if (this.bossSpawnTimer <= 0) {
            this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
            this.spawnBoss(bosses);
        }
        
        // Aktualizacja AI potworów
        for (const m of monsters) m.update(dt, targets, 0, bullets);

        // Separacja potworów (100% Twojej logiki)
        for (let i = 0; i < monsters.length; i++) {
            for (let j = i + 1; j < monsters.length; j++) {
                const a = monsters[i], b = monsters[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                const minDist = (a.sz + b.sz) * 0.8;
                if (dist < minDist && dist > 0.1) {
                    const push = (minDist - dist) / dist * 0.5;
                    a.x -= dx * push; a.y -= dy * push;
                    b.x += dx * push; b.y += dy * push;
                }
            }
        }
        
        for (const boss of bosses) boss.update(dt, targets, 0, bullets);
    }
    
    spawnXpOrbs(entity, xpOrbs) {
        const count = rngInt(2, 4);
        const xpPerOrb = entity.xp / count;
        for (let i = 0; i < count; i++) {
            const orb = new ServerXpOrb(
                entity.x + rng(-30, 30), entity.y + rng(-30, 30), xpPerOrb + rng(0, xpPerOrb * 0.5)
            );
            xpOrbs.push(orb);
        }
    }
}