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
import { send, broadcastToRoom } from './utils/network.js';
import { rngInt } from '../shared/utils/math.js';
import { rollItemCards, applyItem, evolveWeapons } from '../shared/systems/items.js';
import { WORLDS, getWorld } from '../shared/config/worlds.js';
import { resolveWorldMovement } from '../shared/systems/worldRules.js';
import { shouldRetireProjectile } from '../shared/systems/projectileBounds.js';

const BOT_NAMES = [
    'xXShadowXx', 'ProGamer2024', 'NoobMaster', 'SkillIssue', 'TryHard_PL',
    'EzWin', 'Destroyer', 'Veteran99', 'TopPlayer', 'Hunter666',
    'SniperElite', 'WarMachine', 'DarkKnight', 'Phoenix', 'Blade',
    'SpeedRunner', 'Lurker', 'GhostBlade', 'IronWill', 'StormRider'
];

export class GameRoom {
    constructor(id, options = {}) {
        this.id = id;
        this.worldId = options.worldId ?? 0;
        this.parentRoom = options.parentRoom || null;
        this.rootRoom = this.parentRoom || this;
        this.worlds = this.parentRoom?.worlds || new Map();
        if (!this.parentRoom) this.worlds.set(0, this);
        this.elapsedTime = 0;
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
        this.maxParticipants = Number.isInteger(options.maxPlayers) ? Math.max(2, Math.min(12, SERVER_CONFIG.MAX_PLAYERS_PER_ROOM, options.maxPlayers)) : 8;
        this.privacy = options.privacy === 'private' ? 'private' : 'public';

        this.botsEnabled = options.bots !== false;

        this.minBotSpawnDelay = 30;
        this.maxBotSpawnDelay = 90;
        this.botSpawnTimer = this.getRandomBotSpawnDelay();
        this.weaponSystem = new WeaponSystem();
        this.collisionSystem = new CollisionSystem();
        this.spawnSystem = new SpawnSystem(ZONES);
        this.spawnSystem.worldId = this.worldId;
        this.spawnSystem.setDifficulty(this.difficulty);
        this.upgradeSystem = new UpgradeSystem();

        this.inputQueue = new Map();
        this.pendingBotSpawns = [];
        this.botRespawnQueue = [];
        this.botNameIndex = 0;
        this.emptySince = 0;
        this.fxEvents = [];
        this.nextFxId = 1;
        this.stateSendTimer = 0;
        this.stateSendRate = 1 / 15; // 15 razy/s
        this.chests = [];
        this.nextChestId = 1;
        this.nextChestTime = 25;
        if (this.parentRoom) {
            this.players = this.parentRoom.players;
            this.inputQueue = this.parentRoom.inputQueue;
        }
    }
    getWorldState(id = 0) {
        const root = this.rootRoom;
        if (!Number.isInteger(id) || !WORLDS.some(world => world.id === id)) return null;
        if (!root.worlds.has(id)) root.worlds.set(id, new GameRoom(root.id, {
            difficulty: root.difficulty, bots: root.botsEnabled, worldId: id, parentRoom: root,
            maxPlayers: root.maxParticipants, privacy: root.privacy
        }));
        return root.worlds.get(id);
    }

    worldPlayers() {
        return Array.from(this.players.values()).filter(player => (player.worldId || 0) === this.worldId);
    }

    unlockedWorlds(player) {
        return WORLDS.filter(world => world.unlockLevel <= Math.max(player.level, player.maxLevelReached || 1)).map(world => world.id);
    }

    clearSocketState(ws) {
        if (!ws) return;
        ws._equipmentRevisions = new Map();
        ws._snapshotEntitiesRoom = null;
        ws._snapshotEntities = new Map();
    }

    travelWorld(playerId, targetWorldId) {
        const root = this.rootRoom;
        const player = root.players.get(playerId);
        if (!player) return false;
        const unlocked = root.unlockedWorlds(player);
        const target = targetWorldId ?? ((player.worldId + 1) % WORLDS.length);
        if (player.hp <= 0 || player.disconnectedAt || !Number.isInteger(target) || target === player.worldId ||
            !unlocked.includes(target) || Math.hypot(player.x, player.y) > 100 ||
            root.elapsedTime < (player.portalReadyAt || 0)) return false;
        const origin = root.getWorldState(player.worldId);
        const destination = root.getWorldState(target);
        if (!destination) return false;
        origin.bullets = origin.bullets.filter(bullet => bullet.ownerId !== player.id);
        player.worldId = target;
        player.x = 0; player.y = -180;
        player.damageAccumulator = 0;
        player.invTimer = Math.max(1.5, player.invTimer || 0);
        player.portalReadyAt = root.elapsedTime + 2;
        player.equipmentRevision = (player.equipmentRevision || 0) + 1;
        root.inputQueue.delete(playerId);
        root.clearSocketState(player.ws);
        if (destination.state === 'lobby') destination.start();
        root.sendTo(playerId, { type: 'worldChanged', data: {
            worldId: target, worldTime: destination.gameTime, unlockedWorlds: unlocked,
            x: player.x, y: player.y
        } });
        destination.broadcastState();
        return true;
    }
    addPlayer(ws, name, cls) {
        if (this.getHumanCount() >= this.maxParticipants) return null;
        const point = { x: (this.players.size % 4 - 1.5) * 42, y: -180 - Math.floor(this.players.size / 4) * 42 };

        const player = new ServerPlayer(
            ws.id,
            name,
            cls,
            {},
            point.x,
            point.y,
            false
        );

        player.ws = ws;
        player.isBot = false;
        player.equipmentRevision = 0;
        player.items = {};
        player.worldId = 0;
        player.maxLevelReached = 1;
        player.portalReadyAt = 0;

        this.players.set(player.id, player);

        this.lastActivity = Date.now();
        this.emptySince = 0;

        return player;
    }
    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            this.players.delete(playerId);
            this.inputQueue.delete(playerId);
            for (const arena of this.rootRoom.worlds.values()) arena.bullets = arena.bullets.filter(bullet => bullet.ownerId !== playerId);
        }
        this.lastActivity = Date.now();
    }

    getPlayerBySocket(ws) {
        for (const player of this.players.values()) {
            if (player.ws === ws) return player;
        }
        return null;
    }

    getRandomBotSpawnDelay() {
        return this.minBotSpawnDelay + Math.random() * (this.maxBotSpawnDelay - this.minBotSpawnDelay);
    }

    onPlayerDisconnect(playerId) {
        const player = this.players.get(playerId);
        if (player) {
            player.disconnectedAt = Date.now();
            this.inputQueue.delete(playerId);
            for (const arena of this.rootRoom.worlds.values()) arena.bullets = arena.bullets.filter(bullet => bullet.ownerId !== playerId);
        }
    }

    reconnectPlayer(ws, playerId) {
        const player = this.players.get(playerId);
        if (player && player.disconnectedAt > 0) {
            if (Date.now() - player.disconnectedAt < SERVER_CONFIG.RECONNECT_TIMEOUT_MS) {
                ws._equipmentRevisions = new Map();
                ws._snapshotEntitiesRoom = null;
                ws._snapshotEntities = new Map();
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
        const initialSpawnCount = 18;
        const allTargets = this.getAllLivingTargets();

        for (let i = 0; i < initialSpawnCount; i++) {
            this.spawnSystem.spawnMonster(this.monsters, allTargets);
        }

        // Boty nie spawnują się od razu.
        // Pierwszy bot wejdzie po 30–90 sekundach przez updateBotJoining().
        this.botSpawnTimer = this.getRandomBotSpawnDelay();
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
        const player = this.players.get(playerId);
        if (!player) return;
        const pressed = !!input?.keys?.KeyE;
        if (pressed && !player.portalHeld) this.travelWorld(playerId);
        player.portalHeld = pressed;
        player.lastInputTime = this.rootRoom.elapsedTime;
        this.inputQueue.set(playerId, input);
    }

    applyUpgradeChoice(playerId, upgradeKey) {
        const player = this.players.get(playerId);
        if (!player || player.pendingUpgrades <= 0) return;

        const card = player.upgradeCards?.find(c => c.upgradeKey === upgradeKey);
        if (!card) return;

        this.upgradeSystem.applyUpgrade(card, player, this.weaponSystem);
        player.equipmentRevision = (player.equipmentRevision || 0) + 1;
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
        if (this.parentRoom) return this.updateArena(dt);
        this.elapsedTime += dt;
        const roomHumans = Math.max(1, Array.from(this.players.values()).filter(player => !player.disconnectedAt && player.hp > 0).length);
        for (const arena of this.worlds.values()) {
            const visitors = arena.worldPlayers().filter(player => !player.disconnectedAt);
            const active = visitors.filter(player => player.hp > 0).length;
            arena.spawnSystem.roomBudget = Math.max(0, Math.floor(320 * active / roomHumans));
            if (visitors.length) {
                arena.inactiveCleared = false;
                arena.updateArena(dt);
            } else if (!arena.inactiveCleared) {
                // Sleeping worlds keep their encounter clock and small boss/chest
                // state, while crowds and short-lived effects release references.
                arena.monsters.length = 0;
                arena.bullets.length = 0;
                arena.xpOrbs.length = 0;
                arena.spawnSystem.lastTargets = [];
                arena.spawnSystem.monsterSpawnTimer = 0;
                arena.inactiveCleared = true;
            }
        }
        this.removeTimedOutPlayers();
    }

    updateArena(dt) {
        this.gameTime += dt;
        this.lastActivity = Date.now();

        const allHumans = this.worldPlayers().filter(p => !p.disconnectedAt);
        const allBots = Array.from(this.bots.values());
        const allPlayers = [...allHumans, ...allBots];
        const allLivingTargets = allPlayers.filter(p => p.hp > 0);

        // 1. Process inputs
        for (const player of allHumans) {
            if (player.hp <= 0) continue;
            const input = (this.rootRoom.elapsedTime - (player.lastInputTime ?? -10) < 0.3 && this.inputQueue.get(player.id)) || { keys: {}, mouseX: 0, mouseY: 0, mouseClicked: false };
            player.update(dt, input);
        }

        // 2. Bot AI & movement
        for (const bot of allBots) {
            if (bot.hp <= 0) continue;
            bot.update(dt, this.monsters, this.xpOrbs, this.upgradeSystem, allPlayers);
        }

        // 3. Spawn monsters & update monsters/bosses
        this.spawnSystem.update(dt, this.monsters, this.gameTime, this.bullets, allLivingTargets, this.bosses);

        // 4. Update bullets (movement, life)
        for (const b of this.bullets) {
            b.prevX = b.x; b.prevY = b.y;
            b.update(dt);
            if (shouldRetireProjectile(b, this.worldId, b.ownerEntity || this.getEntityById(b.ownerId))) b.life = -1;
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
                    this.weaponSystem.fireWeapon(
                        p,
                        i,
                        targets,
                        this.bullets,
                        p.id,
                        this
                    );                }
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
        this.updateChests();
        this.enforceBotLimit();
        // 10.5 Bot joining system
        this.updateBotJoining(dt);

        // 11. Broadcast state
        this.stateSendTimer += dt;

        if (this.stateSendTimer >= this.stateSendRate) {
            this.stateSendTimer %= this.stateSendRate;
            this.broadcastState();
        }
        // 12. Remove timed-out disconnected players
        this.removeTimedOutPlayers();
    }

    getAllLivingTargets() {
        const list = [];
        for (const p of this.worldPlayers()) if (p.hp > 0 && !p.disconnectedAt) list.push(p);
        for (const b of this.bots.values()) if (b.hp > 0) list.push(b);
        return list;
    }

    spawnChest(x, y, rare = false) {
        if (this.chests.length >= 48) return;
        const position = resolveWorldMovement({ x, y }, this.worldId, 25);
        this.chests.push({ id: `c_${this.nextChestId++}`, x: position.x, y: position.y, rare, expiresAt: this.gameTime + 180 });
    }

    updateChests() {
        this.chests = this.chests.filter(chest => chest.expiresAt > this.gameTime);
        if (this.gameTime >= this.nextChestTime) {
            this.nextChestTime += 45;
            for (const player of this.worldPlayers()) {
                if (player.hp <= 0 || player.disconnectedAt) continue;
                const angle = Math.random() * Math.PI * 2;
                this.spawnChest(Math.max(-5700, Math.min(5700, player.x + Math.cos(angle) * 200)), Math.max(-5700, Math.min(5700, player.y + Math.sin(angle) * 200)));
            }
        }
        for (let i = this.chests.length - 1; i >= 0; i--) {
            const chest = this.chests[i];
            for (const player of this.worldPlayers()) {
                if (player.hp <= 0 || player.disconnectedAt || Math.hypot(player.x - chest.x, player.y - chest.y) >= 42) continue;
                const cards = rollItemCards(player, chest.rare);
                const card = cards[Math.floor(Math.random() * cards.length)];
                applyItem(player, card);
                const evolutions = chest.rare ? evolveWeapons(player) : [];
                player.equipmentRevision = (player.equipmentRevision || 0) + 1;
                this.sendTo(player.id, { type: 'itemCollected', data: { item: card.name, stacks: card.stacks || 1, evolutions } });
                this.chests.splice(i, 1);
                break;
            }
        }
    }

    enforceBotLimit() {
        const maxBots = this.getMaxAllowedBots();

        while (this.getBotCount() > maxBots) {
            this.removeOneBot('limit');
        }
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
                    bullet.angle = (bullet._orbitAngle || 0) + Math.PI / 2;
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
            orb.life -= dt;
            let nearest = null;
            let nearestDistance = Infinity;
            for (const player of this.worldPlayers()) {
                if (player.hp <= 0 || player.disconnectedAt) continue;
                const distance = (orb.x - player.x) ** 2 + (orb.y - player.y) ** 2;
                if (distance < nearestDistance) { nearest = player; nearestDistance = distance; }
            }
            const player = nearest;
            if (player) {
                const collected = orb.update(dt, player);
                if (collected) {
                    const zoneIdx = this.getZoneIdx(player.x, player.y);
                    const levelUps = player.addXp(orb.val, zoneIdx);
                    if (levelUps > 0) {
                        this.handleLevelUp(player, levelUps);
                    }
                    orb.life = -1;
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
                this.spawnChest(b.x, b.y, true);
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
                    this.botRespawnQueue.push({
                        timer: this.getRandomBotSpawnDelay(),
                        botId
                    });
                this.bots.delete(botId);
            }
        }

        // Respawn bots
        // Respawn bots
        for (let i = this.botRespawnQueue.length - 1; i >= 0; i--) {
            const entry = this.botRespawnQueue[i];

            entry.timer -= dt;

            if (entry.timer <= 0) {
                this.botRespawnQueue.splice(i, 1);

                // Jeśli nie ma miejsca, bot nie wraca.
                if (!this.hasFreeParticipantSlot()) {
                    continue;
                }

                this.spawnBot();
            }
        }
        // Dead players -> death screen
        for (const player of this.worldPlayers()) {
            if (player.hp <= 0 && !player.deathNotified) {
                player.hp = 0;
                player.isDead = true;
                player.deathNotified = true;

                send(player.ws, {
                    type: 'playerDead',
                    data: {
                        level: player.level,
                        kills: player.killedMonsters || 0,
                        totalDmg: player.totalDmg || 0,
                        isInRoom: true,
                        pendingPermPts: Math.floor(player.level / 3) + 1,
                        player: player.toState()
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
        if (this.parentRoom) return this.rootRoom.getPermanentStats(playerId);
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
        for (const player of this.worldPlayers()) {
            if (!player.ws || player.ws.readyState !== 1) continue;
            if (player.ws.bufferedAmount > 128 * 1024) continue;

            const state = this.buildStateForPlayer(player);

            try {
                player.ws.send(JSON.stringify(state));
            } catch (e) {
                console.error('[Room] state send failed:', e.message);
            }
        }
    }
    filterNear(entity, list, range) {
        const r2 = range * range;

        return list.filter(o => {
            const dx = o.x - entity.x;
            const dy = o.y - entity.y;

            return dx * dx + dy * dy <= r2;
        });
    }
    nearbyStates(player, list, range, kind) {
        const socket = player.ws || player;
        const arenaKey = this.worldId ? `${this.id}/world/${this.worldId}` : this.id;
        if (socket._snapshotEntitiesRoom !== arenaKey) {
            socket._snapshotEntitiesRoom = arenaKey;
            socket._snapshotEntities = new Map();
        }
        const previous = socket._snapshotEntities.get(kind) || new Set();
        const visible = this.filterNear(player, list, range);
        const next = new Set();
        const states = visible.map(entity => {
            next.add(entity.id);
            if (!previous.has(entity.id)) return entity.toState();
            const state = { id: entity.id, x: Math.round(entity.x * 10) / 10, y: Math.round(entity.y * 10) / 10 };
            if (kind === 'monsters') state.hp = Math.round(entity.hp);
            if (kind === 'monsters' && entity.archetypeId) state.telegraph = entity.telegraph ? { ...entity.telegraph } : null;
            if (kind === 'bullets' && (entity.wtype === 'sword' || entity.wtype === 'axe')) state.angle = entity.angle;
            return state;
        });
        socket._snapshotEntities.set(kind, next);
        return states;
    }
    buildStateForPlayer(player) {
        if ((player.worldId || 0) !== this.worldId) return this.getWorldState(player.worldId).buildStateForPlayer(player);
        const monsterRange = 1350;
        const bulletRange = 1450;
        const orbRange = 1000;
        const bossRange = 1600;
        const revisions = player.ws ? (player.ws._equipmentRevisions ??= new Map()) : new Map();
        for (const id of revisions.keys()) {
            if (!this.players.has(id) && !this.bots.has(id)) revisions.delete(id);
        }
        const serializePlayer = p => {
            const revision = p.equipmentRevision || 0;
            const includeLoadout = revisions.get(p.id) !== revision;
            revisions.set(p.id, revision);
            return p.toState(includeLoadout);
        };

        const players = this.worldPlayers()
            .map(serializePlayer);

        const bots = Array.from(this.bots.values())
            .map(serializePlayer);

        return {
            type: 'gameState',
            room: this.id,
            t: this.gameTime,
            data: {
                gameTime: this.gameTime,
                worldTime: this.gameTime,
                worldId: this.worldId,
                unlockedWorlds: this.unlockedWorlds(player),
                chests: this.filterNear(player, this.chests, 1400).map(({ id, x, y, rare }) => ({ id, x, y, rare })),

                players,
                bots,

                monsters: this.nearbyStates(player, this.monsters, monsterRange, 'monsters'),
                bullets: this.nearbyStates(player, this.bullets, bulletRange, 'bullets'),
                xpOrbs: this.nearbyStates(player, this.xpOrbs, orbRange, 'xpOrbs'),
                bosses: this.filterNear(player, this.bosses, bossRange).map(b => b.toState())
            }
        };
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

    emitFx(fx) {
        const event = {
            id: `fx_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            ...fx
        };

        for (const player of this.worldPlayers()) {
            if (player.ws?.bufferedAmount > 128 * 1024) continue;
            if (Number.isFinite(fx.x1) && (player.x - fx.x1) ** 2 + (player.y - fx.y1) ** 2 > 1600 ** 2) continue;
            send(player.ws, { type: 'fx', data: event });
        }
    }

    removeTimedOutPlayers() {
        const now = Date.now();
        for (const [playerId, player] of this.players) {
            if (player.disconnectedAt > 0 && now - player.disconnectedAt > SERVER_CONFIG.RECONNECT_TIMEOUT_MS) {
                this.players.delete(playerId);
                this.inputQueue.delete(playerId);
            }
        }
    }

    getPlayerList() {
        return Array.from(this.players.values()).map(p => p.toState());
    }

    getRandomSpawnPoint() {
        return { x: (Math.random() - 0.5) * 100, y: -180 };
    }

    respawnPlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.hp > 0) return null;
        const point = this.getRandomSpawnPoint();
        const stats = this.getPermanentStats(playerId);
        const fresh = new ServerPlayer(player.id, player.name, player.cls, stats, point.x, point.y, false);
        fresh.ws = player.ws;
        fresh.items = {};
        fresh.equipmentRevision = (player.equipmentRevision || 0) + 1;
        fresh.invTimer = 2;
        fresh.upgradeCards = null;
        fresh.lastInputTime = -10;
        fresh.damageBonus += stats.dmg || 0;
        fresh.magnetRange += stats.magnet || 0;
        fresh.regen += stats.regen || 0;
        fresh.lastHitBy = null;
        fresh.worldId = player.worldId || 0;
        fresh.maxLevelReached = Math.max(player.maxLevelReached || 1, player.level);
        fresh.portalReadyAt = this.rootRoom.elapsedTime + 2;
        fresh.portalHeld = false;
        // Preserve references held by current combat systems, but reset the build.
        Object.assign(player, fresh);
        this.inputQueue.delete(playerId);
        for (const arena of this.rootRoom.worlds.values()) arena.bullets = arena.bullets.filter(bullet => bullet.ownerId !== playerId);
        this.clearSocketState(player.ws);
        return player;
    }
    getHumanCount() {
        return Array.from(this.players.values()).filter(p => !p.isBot).length;
    }

    getBotCount() {
        let count = 0;
        for (const arena of this.rootRoom.worlds.values()) count += arena.bots.size;
        return count;
    }

    getParticipantCount() {
        return this.getHumanCount() + this.getBotCount();
    }

    getMaxAllowedBots() {
        return Math.max(0, this.maxParticipants - this.getHumanCount());
    }

    canAddBot() {
        if (!this.botsEnabled) return false;
        if (this.state !== 'playing') return false;

        return this.getBotCount() < this.getMaxAllowedBots();
    }

    removeOneBot() {
        const arena = Array.from(this.rootRoom.worlds.values()).reverse().find(world => world.bots.size);
        if (!arena) return null;
        const lastBotId = Array.from(arena.bots.keys()).at(-1);
        const bot = arena.bots.get(lastBotId);
        arena.bots.delete(lastBotId);
        arena.bullets = arena.bullets.filter(bullet => bullet.ownerId !== lastBotId);

        console.log(`[Room ${this.id}] Bot removed to free slot: ${bot?.name || lastBotId}`);

        return bot;
    }

    makeRoomForHumanPlayer() {
        if (this.getHumanCount() >= this.maxParticipants) {
            return false;
        }

        while (this.getParticipantCount() >= this.maxParticipants && this.getBotCount() > 0) {
            this.removeOneBot('human_join');
        }

        return true;
    }

    ensureParticipantLimit() {
        while (this.getParticipantCount() > this.maxParticipants && this.getBotCount() > 0) {
            this.removeOneBot();
        }
    }

    spawnBot() {
        if (!this.botsEnabled) return null;
        if (!this.hasFreeParticipantSlot()) return null;

        const angle = Math.random() * Math.PI * 2;
        const dist = 350 + Math.random() * 350;

        const bot = new ServerBot(
            Math.cos(angle) * dist,
            Math.sin(angle) * dist,
            {
                name: this.generateBotName(),
                level: rngInt(1, 7)
            }
        );
        bot.applyPendingStartUpgrades(this.upgradeSystem, this.weaponSystem);
        bot.worldId = this.worldId;
        resolveWorldMovement(bot, this.worldId, 20);
        this.bots.set(bot.id, bot);
        return bot;
    }

    getParticipantCount() {
        return this.getHumanCount() + this.getBotCount();
    }

    hasFreeParticipantSlot() {
        return this.getParticipantCount() < this.maxParticipants;
    }
    applyPermanentStats(player) {
        const stats = this.getPermanentStats(player.id);

        const baseMaxHp = player.baseHp || 100;

        player.maxHp = baseMaxHp + (stats.hp || 0);

        player.dmgBonus = stats.dmg || 0;
        player.speedBonus = stats.speed || 0;
        player.magnetRange = 45 + (stats.magnet || 0);
        player.regen = stats.regen || 0;
    }
    addFxEvent(fx) {
        this.fxEvents.push({
            id: `fx_${this.nextFxId++}`,
            ...fx
        });
    }

    updateBotJoining(dt) {
        if (!this.botsEnabled) return;
        if (this.state !== 'playing') return;

        // Jeżeli nie wolno dodać bota, resetuj timer i wyjdź.
        if (!this.canAddBot()) {
            this.botSpawnTimer = this.getRandomBotSpawnDelay();
            return;
        }

        this.botSpawnTimer -= dt;

        if (this.botSpawnTimer > 0) return;

        this.spawnBot('timer');

        this.botSpawnTimer = this.getRandomBotSpawnDelay();
}
    getBotList() {
        return Array.from(this.bots.values()).map(b => b.toState());
    }
}
