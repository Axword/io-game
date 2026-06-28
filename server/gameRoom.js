import { v4 as uuidv4 } from 'uuid';
import { SERVER_CONFIG, SPAWN_POINTS, ZONES, WORLD, MOVEMENT_MULTIPLIER } from './config.js';
import { ServerPlayer } from './entities/player.js';
import { ServerBot } from './entities/bot.js';
import { ServerMonster } from './entities/monster.js';
import { ServerBoss } from './entities/boss.js';
import { ServerBullet } from './entities/bullet.js';
import { ServerXpOrb } from './entities/xpOrb.js';
import { WeaponSystem } from './systems/WeaponSystem.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { SpawnSystem } from './systems/SpawnSystem.js';
import { UpgradeSystem } from './systems/UpgradeSystem.js';
import { broadcastToRoom } from './utils/network.js';
import { rngInt } from '../shared/utils/math.js';

const BOT_NAMES = [
    'xXShadowXx', 'ProGamer2024', 'NoobMaster', 'SkillIssue', 'TryHard_PL',
    'EzWin', 'Destroyer', 'Veteran99', 'TopPlayer', 'Hunter666',
    'SniperElite', 'WarMachine', 'DarkKnight', 'Phoenix', 'Blade',
    'SpeedRunner', 'Lurker', 'GhostBlade', 'IronWill', 'StormRider'
];

export class GameRoom {
    constructor(id, options = {}) {
        this.id = id;
        this.state = 'lobby';
        this.difficulty = options.difficulty || SERVER_CONFIG.DEFAULT_DIFFICULTY;
        this.botsEnabled = options.bots !== undefined ? !!options.bots : SERVER_CONFIG.DEFAULT_BOTS;
        this.gameTime = 0;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();

        this.players = new Map();    // playerId -> ServerPlayer
        this.bots = new Map();       // botId -> ServerBot
        this.monsters = [];          // ServerMonster[]
        this.bosses = [];            // ServerBoss[]
        this.bullets = [];           // ServerBullet[]
        this.xpOrbs = [];            // ServerXpOrb[]

        this.weaponSystem = new WeaponSystem();
        this.collisionSystem = new CollisionSystem();
        this.spawnSystem = new SpawnSystem(ZONES);
        this.spawnSystem.setDifficulty(this.difficulty);
        this.upgradeSystem = new UpgradeSystem();

        this.inputQueue = new Map();
        this.pendingBotSpawns = [];
        this.botRespawnQueue = [];
        this.botNameIndex = 0;
        this.emptySince = 0;
    }

    addPlayer(ws, name, cls) {
        const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        const player = new ServerPlayer(ws.id, name, cls, {}, spawn.x, spawn.y, false);
        player.ws = ws;
        this.players.set(player.id, player);
        this.lastActivity = Date.now();
        this.emptySince = 0;
        return player;
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.players.delete(playerId);
        }
        this.lastActivity = Date.now();
    }

    getPlayerBySocket(ws) {
        for (const player of this.players.values()) {
            if (player.ws === ws) return player;
        }
        return null;
    }

    onPlayerDisconnect(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.disconnectedAt = Date.now();
        }
    }

    reconnectPlayer(ws, playerId) {
        const player = this.players.get(playerId);
        if (player && player.disconnectedAt > 0) {
            if (Date.now() - player.disconnectedAt < SERVER_CONFIG.RECONNECT_TIMEOUT_MS) {
                player.ws = ws;
                player.disconnectedAt = 0;
                return player;
            }
        }
        return null;
    }

    hasConnectedPlayers() {
        for (const p of this.players.values()) {
            if (p.disconnectedAt === 0) return true;
        }
        return false;
    }

    isEmpty() {
        const hasConnected = this.hasConnectedPlayers();
        if (!hasConnected && this.emptySince === 0) {
            this.emptySince = Date.now();
        }
        if (hasConnected) {
            this.emptySince = 0;
        }
        return !hasConnected;
    }

    start() {
        this.state = 'playing';
        this.gameTime = 0;

        // Initial monster spawn
        const initialSpawnCount = 80;
        const allTargets = this.getAllLivingTargets();
        for (let i = 0; i < initialSpawnCount; i++) {
            this.spawnSystem.spawnMonster(this.monsters, allTargets);
        }

        // Spawn bots if enabled
        if (this.botsEnabled) {
            const botCount = rngInt(9, 12);
            for (let i = 0; i < botCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 6500 + Math.random() * 1500;
                const bot = new ServerBot(
                    Math.cos(angle) * dist,
                    Math.sin(angle) * dist,
                    {
                        name: this.generateBotName(),
                        level: rngInt(1, 7)
                    }
                );
                bot.applyPendingStartUpgrades(this.upgradeSystem, this.weaponSystem);
                this.bots.set(bot.id, bot);
            }
        }
    }

    stop() {
        this.state = 'ended';
    }

    generateBotName() {
        const name = BOT_NAMES[this.botNameIndex % BOT_NAMES.length] + '_' + Math.floor(Math.random() * 999);
        this.botNameIndex++;
        return name;
    }

    queueInput(playerId, input) {
        this.inputQueue.set(playerId, input);
    }

    applyUpgradeChoice(playerId, upgradeKey) {
        const player = this.players.get(playerId);
        if (!player || player.pendingUpgrades <= 0) return;

        const card = player.upgradeCards?.find(c => c.upgradeKey === upgradeKey);
        if (!card) return;

        this.upgradeSystem.applyUpgrade(card, player, this.weaponSystem);
        player.pendingUpgrades--;

        if (player.pendingUpgrades > 0) {
            player.upgradeCards = this.upgradeSystem.generateUpgradeCards(player);
            this.sendTo(player.id, { type: 'upgradeOptions', playerId, data: { cards: player.upgradeCards } });
        } else {
            player.upgradeCards = null;
            this.sendTo(player.id, { type: 'upgradeDone', playerId });
        }
    }

    update(dt) {
        this.gameTime += dt;
        this.lastActivity = Date.now();

        const allHumans = Array.from(this.players.values());
        const allBots = Array.from(this.bots.values());
        const allPlayers = [...allHumans, ...allBots];
        const allLivingTargets = allPlayers.filter(p => p.hp > 0);

        // 1. Process inputs
        for (const player of allHumans) {
            if (player.hp <= 0) continue;
            const input = this.inputQueue.get(player.id) || { keys: {}, mouseX: 0, mouseY: 0, mouseClicked: false };
            player.update(dt, input);
        }
        this.inputQueue.clear();

        // 2. Bot AI & movement
        for (const bot of allBots) {
            if (bot.hp <= 0) continue;
            bot.update(dt, this.monsters, this.xpOrbs, this.upgradeSystem, allPlayers);
        }

        // 3. Spawn monsters & update monsters/bosses
        this.spawnSystem.update(dt, this.monsters, this.gameTime, this.bullets, allLivingTargets, this.bosses);

        // 4. Update bullets (movement, life)
        for (const b of this.bullets) {
            b.update(dt);
        }

        // 5. Update sword positions (attached to owners)
        this.weaponSystem.updateSwordPositions(this.bullets, dt);
        this.updateAttachedBullets();

        // 6. Aura damage
        for (const p of allPlayers) {
            if (p.hp <= 0) continue;
            const auraTargets = [...this.monsters, ...this.bosses];
            for (const other of allPlayers) {
                if (other !== p && other.hp > 0) auraTargets.push(other);
            }
            this.weaponSystem.updateAura(p, dt, auraTargets, p.id);
        }

        // 7. Weapon firing
        for (const p of allPlayers) {
            if (p.hp <= 0) continue;
            const targets = this.getFireTargetsFor(p, allPlayers);
            for (let i = 0; i < 4; i++) {
                if (p.weapons[i]) {
                    this.weaponSystem.fireWeapon(p, i, targets, this.bullets, p.id);
                }
            }
        }

        // 8. Collisions
        this.collisionSystem.checkBulletCollisions(this.bullets, this.monsters, allHumans, allBots, this.bosses);
        this.addBounceBullets();
        this.collisionSystem.checkMonsterPlayerCollisions(this.monsters, allHumans, dt);
        this.collisionSystem.checkMonsterBotCollisions(this.monsters, allBots, dt);
        this.collisionSystem.checkBossPlayerCollisions(this.bosses, allHumans, dt);
        this.collisionSystem.checkBossBotCollisions(this.bosses, allBots, dt);
        this.collisionSystem.checkPlayerBotCollisions(allHumans, allBots);
        this.collisionSystem.checkBotBulletVsPlayer(this.bullets, allHumans, allBots);
        this.collisionSystem.checkPlayerBulletVsBots(this.bullets, allHumans, allBots);

        // 9. Collect XP orbs for players
        this.updateXpOrbs(dt);

        // 10. Cleanup dead entities, spawn orbs, level ups, respawn bots
        this.cleanupAndSpawn(dt);

        // 11. Broadcast state
        this.broadcastState();

        // 12. Remove timed-out disconnected players
        this.removeTimedOutPlayers();
    }

    getAllLivingTargets() {
        const list = [];
        for (const p of this.players.values()) if (p.hp > 0) list.push(p);
        for (const b of this.bots.values()) if (b.hp > 0) list.push(b);
        return list;
    }

    getFireTargetsFor(entity, allPlayers) {
        const targets = [];
        for (const m of this.monsters) if (m.hp > 0) targets.push(m);
        for (const b of this.bosses) if (b.hp > 0) targets.push(b);
        for (const p of allPlayers) {
            if (p !== entity && p.hp > 0) targets.push(p);
        }
        return targets;
    }

    updateAttachedBullets() {
        const ownerMap = new Map();
        for (const p of this.players.values()) ownerMap.set(p.id, p);
        for (const b of this.bots.values()) ownerMap.set(b.id, b);

        for (const bullet of this.bullets) {
            if (bullet.wtype === 'sword' && bullet.ownerId) {
                const owner = ownerMap.get(bullet.ownerId);
                if (owner) {
                    bullet.ownerEntity = owner;
                    bullet.x = owner.x + Math.cos(bullet._orbitAngle || 0) * (bullet.orbitRadius || 120);
                    bullet.y = owner.y + Math.sin(bullet._orbitAngle || 0) * (bullet.orbitRadius || 120);
                }
            } else if (bullet.wtype === 'laser' && bullet.ownerId) {
                const owner = ownerMap.get(bullet.ownerId);
                if (owner) {
                    bullet.ownerEntity = owner;
                    const halfRange = (bullet.laserRange || 350) / 2;
                    bullet.x = owner.x + Math.cos(bullet.laserAngle) * halfRange;
                    bullet.y = owner.y + Math.sin(bullet.laserAngle) * halfRange;
                }
            }
        }
    }

    addBounceBullets() {
        const newBullets = [];
        for (const b of this.bullets) {
            if (b._spawnQueue && b._spawnQueue.length > 0) {
                newBullets.push(...b._spawnQueue);
                b._spawnQueue.length = 0;
            }
        }
        this.bullets.push(...newBullets);
    }

    updateXpOrbs(dt) {
        for (const orb of this.xpOrbs) {
            if (orb.life <= 0) continue;
            for (const player of this.players.values()) {
                if (player.hp <= 0) continue;
                const collected = orb.update(dt, player);
                if (collected) {
                    const zoneIdx = this.getZoneIdx(player.x, player.y);
                    const levelUps = player.addXp(orb.val, zoneIdx);
                    player.totalXp = (player.totalXp || 0) + orb.val;
                    if (levelUps > 0) {
                        this.handleLevelUp(player, levelUps);
                    }
                    orb.life = -1;
                    break;
                }
            }
        }
    }

    cleanupAndSpawn(dt) {
        // Dead monsters
        for (const m of this.monsters) {
            if (m.hp <= 0) {
                const spawnXp = m.state !== 'despawning' && !m.isDespawning;
                if (spawnXp) {
                    const killer = m.lastHitBy;
                    if (killer && killer.isBot && killer.hp > 0) {
                        killer.addXp(m.xp);
                        killer.killedMonsters = (killer.killedMonsters || 0) + 1;
                        if (killer.botAI?.onKill) killer.botAI.onKill(m);
                    } else if (killer && killer.totalDmg !== undefined && killer.hp > 0) {
                        this.spawnSystem.spawnXpOrbs(m, this.xpOrbs);
                        killer.killedMonsters = (killer.killedMonsters || 0) + 1;
                    } else {
                        this.spawnSystem.spawnXpOrbs(m, this.xpOrbs);
                    }
                }
            }
        }
        this.monsters = this.monsters.filter(m => m.hp > 0);

        // Dead bosses
        for (const b of this.bosses) {
            if (b.hp <= 0) {
                this.spawnSystem.spawnXpOrbs(b, this.xpOrbs);
            }
        }
        this.bosses = this.bosses.filter(b => b.hp > 0);

        // Dead bullets
        for (const b of this.bullets) {
            if ((b.wtype === 'sword' || b.wtype === 'aura') && b.ownerId) {
                const owner = this.getEntityById(b.ownerId);
                if (!owner || owner.hp <= 0) b.life = -1;
            }
        }
        this.bullets = this.bullets.filter(b => b.life > 0);

        // Dead orbs
        this.xpOrbs = this.xpOrbs.filter(o => o.life > 0);

        // Dead bots
        for (const [botId, bot] of this.bots) {
            if (bot.hp <= 0) {
                if (bot.botAI?.onDeath) bot.botAI.onDeath();
                this.botRespawnQueue.push({ timer: 10, botId });
                this.bots.delete(botId);
            }
        }

        // Respawn bots
        for (let i = this.botRespawnQueue.length - 1; i >= 0; i--) {
            const entry = this.botRespawnQueue[i];
            entry.timer -= dt;
            if (entry.timer <= 0) {
                this.botRespawnQueue.splice(i, 1);
                const angle = Math.random() * Math.PI * 2;
                const dist = 6500 + Math.random() * 1500;
                const newBot = new ServerBot(
                    Math.cos(angle) * dist,
                    Math.sin(angle) * dist,
                    { name: this.generateBotName(), level: rngInt(1, 7) }
                );
                newBot.applyPendingStartUpgrades(this.upgradeSystem, this.weaponSystem);
                this.bots.set(newBot.id, newBot);
            }
        }

        // Dead players -> death screen
        for (const player of this.players.values()) {
            if (player.hp <= 0 && !player.isDeadNotified) {
                player.isDeadNotified = true;
                this.sendTo(player.id, {
                    type: 'playerDead',
                    playerId: player.id,
                    data: {
                        level: player.level,
                        kills: player.killedMonsters || 0,
                        totalDmg: player.totalDmg || 0,
                        isInRoom: true,

                        permStats: this.getPermanentStats(player.id),
                        pendingPermPts: Math.floor(player.level / 3) + 1
                    }
                });
            }
        }
    }

    handleLevelUp(player, levelUps) {
        player.pendingUpgrades += levelUps;
        player.upgradeCards = this.upgradeSystem.generateUpgradeCards(player);
        this.sendTo(player.id, {
            type: 'levelUp',
            playerId: player.id,
            data: { level: player.level, pendingUpgrades: player.pendingUpgrades }
        });
        this.sendTo(player.id, {
            type: 'upgradeOptions',
            playerId: player.id,
            data: { cards: player.upgradeCards }
        });
    }

    getEntityById(id) {
        if (this.players.has(id)) return this.players.get(id);
        if (this.bots.has(id)) return this.bots.get(id);
        return null;
    }

    getZoneIdx(x, y) {
        const dist = Math.hypot(x, y);
        for (let i = 0; i < ZONES.length; i++) {
            if (dist >= ZONES[i].minR && dist < ZONES[i].maxR) return i;
        }
        return ZONES.length - 1;
    }

    getPermanentStats(playerId) {
        if (!this.permanentStats) {
            this.permanentStats = new Map();
        }

        if (!this.permanentStats.has(playerId)) {
            this.permanentStats.set(playerId, {
                hp: 0,
                dmg: 0,
                speed: 0,
                magnet: 0,
                regen: 0
            });
        }

        return this.permanentStats.get(playerId);
    }

    upgradePermanentStat(playerId, id, step) {
        const stats = this.getPermanentStats(playerId);

        stats[id] = (stats[id] || 0) + step;

        return stats;
    }
    
    broadcastState() {
        const data = {
            type: 'gameState',
            room: this.id,
            t: this.gameTime,
            data: {
                gameTime: this.gameTime,
                players: Array.from(this.players.values()).map(p => p.toState()),
                bots: Array.from(this.bots.values()).map(b => b.toState()),
                monsters: this.monsters.map(m => m.toState()),
                bullets: this.bullets.map(b => b.toState()),
                xpOrbs: this.xpOrbs.map(o => o.toState()),
                bosses: this.bosses.map(b => b.toState())
            }
        };
        broadcastToRoom(this, data);
    }

    sendTo(playerId, data) {
        const player = this.players.get(playerId);
        if (player && player.ws && player.ws.readyState === 1) {
            try {
                player.ws.send(JSON.stringify(data));
            } catch (e) {
                console.error('[Room] sendTo failed:', e.message);
            }
        }
    }

    removeTimedOutPlayers() {
        const now = Date.now();
        for (const [playerId, player] of this.players) {
            if (player.disconnectedAt > 0 && now - player.disconnectedAt > SERVER_CONFIG.RECONNECT_TIMEOUT_MS) {
                this.players.delete(playerId);
            }
        }
    }

    getPlayerList() {
        return Array.from(this.players.values()).map(p => p.toState());
    }

    respawnPlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return null;

        const spawnPoint = this.getRandomSpawnPoint
            ? this.getRandomSpawnPoint()
            : {
                x: (Math.random() - 0.5) * 1000,
                y: (Math.random() - 0.5) * 1000
            };

        player.x = spawnPoint.x;
        player.y = spawnPoint.y;

        player.level = 1;
        player.xp = 0;
        player.xpNeeded = 100;
        player.totalXp = 0;

        player.killedMonsters = 0;
        player.totalDmg = 0;

        player.pendingUpgrades = 0;

        // Ważne: HP musi być ustawione po maxHp.
        // Jeżeli permanent staty zwiększają maxHp, przelicz je tutaj.
        if (typeof player.recalculateStats === 'function') {
            player.recalculateStats();
        }

        if (!player.maxHp || player.maxHp <= 0) {
            player.maxHp = 100;
        }

        player.hp = player.maxHp;

        player.dead = false;
        player.isDead = false;
        player.state = 'playing';

        return player;
    }

    getBotList() {
        return Array.from(this.bots.values()).map(b => b.toState());
    }
}
