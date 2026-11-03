import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { XpOrb } from '../entities/XpOrb.js';
import { rng, rngInt, getZoneIdx } from '../utils/math.js';
import { BOSS_TYPES, BOSS_SPAWN_INTERVAL, DIFFICULTY_CONFIG, VIEW, WORLD } from '../config/constants.js';
import { SOLO_ENCOUNTERS, SOLO_DIFFICULTIES } from '../config/encounters.js';
import { getWorld } from '../../shared/config/worlds.js';
import { isWorldSpawnClear, resolveWorldMovement } from '../../shared/systems/worldRules.js';
import { updateWorldEnemy, constrainDormantEnemy } from '../../shared/systems/enemyBehavior.js';
import { Bullet } from '../entities/Bullet.js';
import { balancedBossHealth } from '../../shared/systems/encounterBalance.js';
import { recordZoneEntry } from '../../shared/systems/zoneAggro.js';

const limitPosition = value => Math.max(-WORLD / 2 + 90, Math.min(WORLD / 2 - 90, value));

export class SpawnSystem {
    constructor(zones, scene) {
        this.zones = zones;
        this.soloZones = zones.map(zone => ({ ...zone, mScale: 1, monsterSpeed: 1 }));
        this.scene = scene;
        this.difficultyConfig = DIFFICULTY_CONFIG;
        this.difficulty = 'medium';
        this.bossWarnings = [];
        this.zoneLimits = zones.map((_, zone) => ({ zone, limit: 120, current: 0 }));
        this.reset();
    }

    reset({ solo = false, difficulty = this.difficulty, worldId = 0 } = {}) {
        this.clearWarnings();
        this.solo = solo;
        this.worldId = getWorld(worldId).id;
        this.setDifficulty(difficulty);
        this.monsterSpawnTimer = 0;
        this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
        this.encounterIndex = 0;
        this.bossesSpawned = 0;
        this.nextBossTime = solo ? SOLO_ENCOUNTERS[0].time : BOSS_SPAWN_INTERVAL;
        this.gameTime = 0;
        this.lastTargets = [];
        this.maxMonsters = solo ? 96 : 180;
        this.separationChecks = 0;
    }

    setDifficulty(difficulty) {
        if (this.difficultyConfig[difficulty]) this.difficulty = difficulty;
    }

    getDifficultyMultipliers() {
        return this.difficultyConfig[this.difficulty] || this.difficultyConfig.medium;
    }

    getSoloDifficulty() {
        return SOLO_DIFFICULTIES[this.difficulty] || SOLO_DIFFICULTIES.medium;
    }

    updateZoneCounts(monsters) {
        for (const zone of this.zoneLimits) zone.current = 0;
        for (const monster of monsters) if (monster.hp > 0 && this.zoneLimits[monster.zoneIdx]) this.zoneLimits[monster.zoneIdx].current++;
    }

    findNearestPlayer(x, y, players) {
        let closest = Infinity;
        for (const player of players) if (player?.hp > 0) closest = Math.min(closest, Math.hypot(player.x - x, player.y - y));
        return closest;
    }

    spawnMonster(monsters, players) {
        const living = players?.filter(player => player?.hp > 0);
        if (!living?.length || monsters.length >= this.maxMonsters) return null;
        const player = living[Math.floor(Math.random() * living.length)];
        let x, y;
        // Spawn outside the view, never on a character or beyond the arena.
        for (let attempt = 0; attempt < 14; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = VIEW + rng(110, 240);
            x = player.x + Math.cos(angle) * distance;
            y = player.y + Math.sin(angle) * distance;
            if ((!this.solo || isWorldSpawnClear(x, y, this.worldId, 50)) && Math.abs(x) < WORLD / 2 - 90 && Math.abs(y) < WORLD / 2 - 90 && this.findNearestPlayer(x, y, living) > VIEW + 60) break;
            x = undefined;
        }
        if (x === undefined) return null;
        const zoneIdx = getZoneIdx(x, y, this.zones);
        const monster = new Monster(x, y, zoneIdx, this.solo ? this.soloZones : this.zones, this.scene, this.solo ? 1 : this.getDifficultyMultipliers().hpMult);
        if (this.solo) {
            const difficulty = this.getSoloDifficulty();
            const progress = Math.min(1, this.gameTime / 480);
            const roster = getWorld(this.worldId).enemies;
            const weight = roster.reduce((total, enemy) => total + enemy.weight, 0);
            let roll = Math.random() * weight;
            const archetype = roster.find(enemy => (roll -= enemy.weight) <= 0) || roster[0];
            monster.configureArchetype(archetype, this.worldId, progress, { ...difficulty, zoneAnchor: player });
        }
        monsters.push(monster);
        return monster;
    }

    spawnBoss(bosses, targets = this.lastTargets, bossType = null, encounter = null) {
        const player = targets?.find(target => target?.hp > 0);
        if (!player || !bosses) return;
        const angle = Math.random() * Math.PI * 2;
        const point = { x: limitPosition(player.x + Math.cos(angle) * 410), y: limitPosition(player.y + Math.sin(angle) * 410) };
        if (this.solo) resolveWorldMovement(point, this.worldId, 90);
        const { x, y } = point;
        const type = bossType || BOSS_TYPES[Math.floor(Math.random() * BOSS_TYPES.length)];
        let data = { ...type };
        if (this.solo && encounter) {
            const difficulty = this.getSoloDifficulty();
            data = { ...data, ...encounter,
                hp: balancedBossHealth(encounter.hp * difficulty.hp * getWorld(this.worldId).hpScale, targets, difficulty.hp),
                dmg: encounter.dmg * getWorld(this.worldId).damageScale,
                xp: Math.round(encounter.xp * getWorld(this.worldId).xpScale), encounterId: encounter.id, col: getWorld(this.worldId).enemies[0].col };
        }
        this.createBossWarning(x, y, data, bosses);
    }

    createBossWarning(x, y, bossType, bosses = null) {
        const warning = new THREE.Mesh(new THREE.CircleGeometry(90, 32),
            new THREE.MeshBasicMaterial({ color: 0xffa940, transparent: true, opacity: 0.12 }));
        warning.position.set(x, y, 0.3);
        const ring = new THREE.Mesh(new THREE.RingGeometry(85, 92, 40),
            new THREE.MeshBasicMaterial({ color: 0xffda47, transparent: true, opacity: 0.8 }));
        ring.position.set(x, y, 0.4);
        this.scene.add(warning);
        this.scene.add(ring);
        this.bossWarnings.push({ warning, ring, x, y, life: 2.5, bossType, bosses });
    }

    disposeWarning(warning) {
        for (const mesh of [warning.warning, warning.ring]) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }

    clearWarnings() {
        for (const warning of this.bossWarnings || []) this.disposeWarning(warning);
        if (this.bossWarnings) this.bossWarnings.length = 0;
    }

    updateBossWarnings(dt, bosses = null) {
        for (let i = this.bossWarnings.length - 1; i >= 0; i--) {
            const warning = this.bossWarnings[i];
            warning.life -= dt;
            const pulse = Math.sin(warning.life * 12);
            warning.warning.material.opacity = 0.1 + (pulse + 1) * 0.06;
            warning.ring.material.opacity = 0.65 + pulse * 0.25;
            if (warning.life <= 0) {
                this.disposeWarning(warning);
                const collection = bosses || warning.bosses;
                if (collection) {
                    collection.push(new Boss(warning.x, warning.y, warning.bossType, this.scene));
                    this.bossesSpawned++;
                }
                this.bossWarnings.splice(i, 1);
            }
        }
    }

    updateSoloMonster(monster, dt, targets, bullets, scene) {
        if (monster.archetypeId) {
            updateWorldEnemy(monster, dt, targets, shot => {
                if (bullets.length >= 450) return;
                const bullet = new Bullet(shot.x, shot.y, shot.vx, shot.vy, shot.dmg, 'monster', 'wand', shot.size, 0, 0, shot.col, scene);
                bullet.life = shot.life;
                bullet.worldId = this.worldId;
                bullets.push(bullet);
            });
            monster.updateVisuals(dt);
            return;
        }
        const { target, distance } = monster.findNearestTarget(targets);
        if (!target) return;
        if (distance > 1650) {
            monster.isDespawning = true;
            monster.state = 'despawning';
            monster.hp = 0;
            return;
        }
        monster.state = 'attacking';
        monster.currentTarget = target;
        if (distance > 12) {
            const step = Math.min(distance - 10, monster.spd * 55 * dt);
            monster.x += (target.x - monster.x) / distance * step;
            monster.y += (target.y - monster.y) / distance * step;
        }
        if (monster.canShoot && distance < monster.shootRange) {
            monster.shootTimer -= dt;
            if (monster.shootTimer <= 0) {
                monster.shootTimer = rng(3.5, 5);
                monster.shootAtTarget(target, bullets, scene);
            }
        }
        monster.updateVisuals(dt);
    }

    separateMonsters(monsters) {
        const cells = new Map();
        const cellSize = 100;
        this.separationChecks = 0;
        for (const monster of monsters) {
            if (monster.hp <= 0) continue;
            const cx = Math.floor(monster.x / cellSize);
            const cy = Math.floor(monster.y / cellSize);
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                const nearby = cells.get(`${cx + ox},${cy + oy}`);
                if (!nearby) continue;
                for (const other of nearby) {
                    this.separationChecks++;
                    const dx = monster.x - other.x;
                    const dy = monster.y - other.y;
                    const minimum = (monster.sz + other.sz) * 0.45;
                    const squared = dx * dx + dy * dy;
                    if (squared >= minimum * minimum) continue;
                    const distance = Math.sqrt(squared);
                    const push = (minimum - distance) / Math.max(0.1, distance) * 0.25;
                    const pushX = distance < 0.1 ? minimum * 0.1 : dx * push;
                    monster.x += pushX;
                    monster.y += dy * push;
                    other.x -= pushX;
                    other.y -= dy * push;
                }
            }
            const key = `${cx},${cy}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(monster);
        }
    }

    update(dt, monsters, gameTime, bullets, scene, targets, bosses) {
        this.gameTime = gameTime;
        this.lastTargets = targets;
        if (this.solo) for (const target of targets) if ((target.worldId ?? this.worldId) === this.worldId) recordZoneEntry(target, this.worldId);
        this.monsterSpawnTimer -= dt;
        if (this.monsterSpawnTimer <= 0) {
            const progress = Math.min(1, gameTime / 480);
            const cap = this.solo ? Math.round((26 + progress * 64) * this.getSoloDifficulty().count) : Math.min(180, 70 * Math.max(1, targets.length));
            this.maxMonsters = this.solo ? Math.min(120, cap) : cap;
            const count = this.solo ? 3 + Math.floor(progress * 4) : 6;
            for (let i = 0; i < count && monsters.length < this.maxMonsters; i++) this.spawnMonster(monsters, targets);
            this.monsterSpawnTimer = this.solo ? 1.7 - progress * 0.7 : 1.5;
        }
        if (this.solo) {
            const encounter = SOLO_ENCOUNTERS[this.encounterIndex];
            if (encounter && gameTime >= encounter.time) {
                const type = BOSS_TYPES.find(type => type.id === encounter.id);
                this.spawnBoss(bosses, targets, type, encounter);
                this.encounterIndex++;
                this.nextBossTime = SOLO_ENCOUNTERS[this.encounterIndex]?.time ?? null;
            }
        } else {
            this.bossSpawnTimer -= dt;
            if (this.bossSpawnTimer <= 0 && (bosses?.length || 0) + this.bossWarnings.length < 3) {
                this.bossSpawnTimer = BOSS_SPAWN_INTERVAL;
                this.spawnBoss(bosses, targets);
            }
        }
        this.updateBossWarnings(dt, bosses);
        for (const monster of monsters) {
            if (monster.hp <= 0) continue;
            if (monster.isSoloMonster) this.updateSoloMonster(monster, dt, targets, bullets, scene);
            else monster.update(dt, targets, 0, bullets, scene);
        }
        this.separateMonsters(monsters);
        if (this.solo) for (const monster of monsters) {
            resolveWorldMovement(monster, this.worldId, monster.sz * 0.5);
            constrainDormantEnemy(monster);
        }
        for (const boss of bosses || []) {
            boss.update(dt, targets, bullets, scene);
            if (this.solo) resolveWorldMovement(boss, this.worldId, boss.sz * 0.55);
        }
    }

    spawnXpOrbs(entity, xpOrbs) {
        const capacity = Math.max(0, 300 - xpOrbs.length);
        const count = this.solo ? Math.min(capacity, entity.isBoss ? 5 : 1) : Math.min(capacity, rngInt(2, 3));
        if (!count) {
            let nearest = null;
            let distance = Infinity;
            for (const orb of xpOrbs) {
                const candidate = Math.hypot(orb.x - entity.x, orb.y - entity.y);
                if (candidate < distance && orb.life > 0) { nearest = orb; distance = candidate; }
            }
            if (nearest) nearest.val += entity.xp;
            return;
        }
        for (let i = 0; i < count; i++) xpOrbs.push(new XpOrb(
            entity.x + rng(-16, 16), entity.y + rng(-16, 16), entity.xp / count, this.scene));
    }
}
