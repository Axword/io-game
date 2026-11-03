import { ServerMonster } from '../entities/monster.js';
import { ServerBoss } from '../entities/boss.js';
import { ServerXpOrb } from '../entities/xpOrb.js';
import { rng, getZoneIdx } from '../../shared/utils/math.js';
import { BOSS_TYPES, DIFFICULTY_CONFIG, ZONES, VIEW, WORLD } from '../../shared/config/constants.js';
import { getWorld } from '../../shared/config/worlds.js';
import { configureWorldEnemy } from '../../shared/systems/enemyBehavior.js';
import { resolveWorldMovement } from '../../shared/systems/worldRules.js';
import { balancedBossHealth } from '../../shared/systems/encounterBalance.js';

export class SpawnSystem {
    constructor(zones) {
        this.zones = zones || ZONES;
        this.monsterSpawnTimer = 0;
        this.bossSpawnTimer = 90;
        this.difficulty = 'medium';
        this.difficultyConfig = DIFFICULTY_CONFIG;
        this.zoneLimits = this.zones.map((_, zone) => ({ zone, limit: 100, current: 0 }));
        this.maxMonsters = 320;
        this.spawnCursor = 0;
        this.bossIndex = 0;
        this.separationChecks = 0;
        this.lastTargets = [];
        this.worldId = 0;
        this.gameTime = 0;
        this.roomBudget = 320;
    }

    setDifficulty(difficulty) {
        if (this.difficultyConfig[difficulty]) this.difficulty = difficulty;
    }

    getDifficultyMultipliers() {
        return this.difficultyConfig[this.difficulty] || this.difficultyConfig.medium;
    }

    updateZoneCounts(monsters) {
        for (const zone of this.zoneLimits) zone.current = 0;
        for (const monster of monsters) if (monster.hp > 0 && this.zoneLimits[monster.zoneIdx]) this.zoneLimits[monster.zoneIdx].current++;
    }

    findNearestPlayer(x, y, players) {
        let nearest = Infinity;
        for (const player of players) if (player.hp > 0) nearest = Math.min(nearest, Math.hypot(player.x - x, player.y - y));
        return nearest;
    }

    spawnMonster(monsters, players) {
        if (!players?.length || monsters.length >= this.maxMonsters) return;
        const humans = players.filter(player => player.hp > 0 && !player.isBot);
        const candidates = humans.length ? humans : players.filter(player => player.hp > 0);
        if (!candidates.length) return;
        const player = candidates[this.spawnCursor++ % candidates.length];
        let nearby = 0;
        for (const monster of monsters) {
            if (monster.hp > 0 && Math.abs(monster.x - player.x) < 1400 && Math.abs(monster.y - player.y) < 1400) nearby++;
        }
        if (nearby >= 64) return;
        for (let attempt = 0; attempt < 12; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = VIEW + rng(180, 500);
            const x = player.x + Math.cos(angle) * distance;
            const y = player.y + Math.sin(angle) * distance;
            const world = getWorld(this.worldId);
            if (Math.abs(x) >= world.bounds - 90 || Math.abs(y) >= world.bounds - 90 || this.findNearestPlayer(x, y, players) < VIEW + 80) continue;
            if (world.obstacles.some(obstacle => Math.hypot(x - obstacle.x, y - obstacle.y) < obstacle.r + 45)) continue;
            const zoneIdx = getZoneIdx(x, y, this.zones);
            const monster = new ServerMonster(x, y, zoneIdx, this.zones, this.getDifficultyMultipliers().hpMult);
            const totalWeight = world.enemies.reduce((sum, enemy) => sum + enemy.weight, 0);
            let roll = Math.random() * totalWeight;
            const archetype = world.enemies.find(enemy => (roll -= enemy.weight) <= 0) || world.enemies[0];
            const difficulty = { easy: { hp: 0.8, damage: 0.75 }, medium: { hp: 1, damage: 1 },
                hard: { hp: 1.25, damage: 1.2 }, extreme: { hp: 1.55, damage: 1.45 } }[this.difficulty];
            configureWorldEnemy(monster, archetype, this.worldId, this.gameTime / 480, difficulty);
            monsters.push(monster);
            return monster;
        }
    }

    spawnBoss(bosses, targets = this.lastTargets) {
        const humans = targets.filter(target => target.hp > 0 && !target.isBot);
        const player = humans[this.bossIndex % Math.max(1, humans.length)] || targets.find(target => target.hp > 0);
        if (!player || bosses.length >= 2) return;
        const source = BOSS_TYPES[this.bossIndex++ % BOSS_TYPES.length];
        const angle = Math.random() * Math.PI * 2;
        const bounds = getWorld(this.worldId).bounds - 100;
        const clamp = value => Math.max(-bounds, Math.min(bounds, value));
        const position = resolveWorldMovement({ x: clamp(player.x + Math.cos(angle) * 520), y: clamp(player.y + Math.sin(angle) * 520) }, this.worldId, source.sz * 0.5);
        const participants = humans.filter(human => Math.hypot(human.x - position.x, human.y - position.y) <= 1400);
        if (!participants.includes(player) && !player.isBot) participants.push(player);
        const phase = (this.bossIndex - 1) % 3;
        const difficulty = { easy: { hp: 0.8, damage: 0.75 }, medium: { hp: 1, damage: 1 },
            hard: { hp: 1.25, damage: 1.2 }, extreme: { hp: 1.55, damage: 1.45 } }[this.difficulty];
        const bossType = { ...source,
            hp: balancedBossHealth([720, 1450, 2400][phase] * (1 + this.worldId * 1.7) * difficulty.hp, participants, difficulty.hp),
            dmg: [14, 18, 22][phase] * (1 + this.worldId * 0.3) * difficulty.damage,
            xp: [180, 260, 380][(this.bossIndex - 1) % 3] * (1 + this.worldId),
            spd: source.id === 'archon' ? 1.3 : 1.1
        };
        const boss = new ServerBoss(position.x, position.y, bossType);
        boss.spawnTimer = 2.5;
        boss.worldId = this.worldId;
        resolveWorldMovement(boss, this.worldId, boss.sz * 0.5);
        bosses.push(boss);
        return boss;
    }

    separateMonsters(monsters) {
        const cells = new Map();
        const size = 140;
        this.separationChecks = 0;
        for (const monster of monsters) {
            if (monster.hp <= 0) continue;
            const cx = Math.floor(monster.x / size);
            const cy = Math.floor(monster.y / size);
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                for (const other of cells.get(`${cx + ox},${cy + oy}`) || []) {
                    this.separationChecks++;
                    const dx = monster.x - other.x;
                    const dy = monster.y - other.y;
                    const minimum = (monster.sz + other.sz) * 0.65;
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

    update(dt, monsters, gameTime, bullets, targets, bosses) {
        this.gameTime = gameTime;
        this.lastTargets = targets;
        const humans = targets.filter(target => target.hp > 0 && !target.isBot);
        this.maxMonsters = Math.min(this.roomBudget, 64 * Math.max(1, humans.length));
        const living = monsters.filter(monster => monster.hp > 0);
        if (living.length > this.maxMonsters) {
            // Reallocate immediately when a party splits across worlds. Keeping
            // every old crowd would both exceed the room cap and overwhelm the
            // few players remaining behind.
            living.sort((a, b) => this.findNearestPlayer(b.x, b.y, targets) - this.findNearestPlayer(a.x, a.y, targets));
            for (let i = 0; i < living.length - this.maxMonsters; i++) {
                living[i].hp = 0;
                living[i].isDespawning = true;
                living[i].state = 'despawning';
            }
        }
        this.monsterSpawnTimer -= dt;
        if (this.monsterSpawnTimer <= 0) {
            const count = Math.min(12, Math.max(2, humans.length * 3));
            for (let i = 0; i < count && monsters.length < this.maxMonsters; i++) this.spawnMonster(monsters, targets);
            this.monsterSpawnTimer = Math.max(0.75, 1.8 / Math.sqrt(this.getDifficultyMultipliers().spawnMult));
        }
        this.bossSpawnTimer -= dt;
        if (this.bossSpawnTimer <= 0) {
            this.spawnBoss(bosses, targets);
            this.bossSpawnTimer = this.bossIndex % 3 === 2 ? 180 : 150;
        }
        const activityTargets = humans.length ? humans : targets;
        for (const monster of monsters) {
            if (monster.hp <= 0) continue;
            if (this.findNearestPlayer(monster.x, monster.y, activityTargets) > 1900) {
                monster.hp = 0;
                monster.isDespawning = true;
                monster.state = 'despawning';
                continue;
            }
            monster.update(dt, targets, bullets);
        }
        this.separateMonsters(monsters);
        for (const monster of monsters) if (monster.hp > 0) resolveWorldMovement(monster, this.worldId, monster.sz * 0.5);
        for (const boss of bosses || []) if (boss.hp > 0) {
            boss.update(dt, targets, bullets);
            resolveWorldMovement(boss, this.worldId, boss.sz * 0.5);
        }
    }

    spawnXpOrbs(entity, xpOrbs) {
        if (xpOrbs.length >= 450) {
            let closest = null;
            let distance = Infinity;
            for (const orb of xpOrbs) {
                const candidate = Math.hypot(orb.x - entity.x, orb.y - entity.y);
                if (candidate < distance && orb.life > 0) { closest = orb; distance = candidate; }
            }
            if (closest) closest.val += entity.xp;
            return;
        }
        const count = Math.min(entity.isBoss ? 4 : 1, 450 - xpOrbs.length);
        for (let i = 0; i < count; i++) xpOrbs.push(new ServerXpOrb(
            entity.x + rng(-20, 20), entity.y + rng(-20, 20), entity.xp / count));
    }
}
