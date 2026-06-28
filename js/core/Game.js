import { ZONES, SPAWN_POINTS, WORLD, BOSS_TYPES } from '../../js/config/constants.js';
import { WEAPONS } from '../../js/config/weapons.js';
import { BOOKS } from '../../js/config/books.js';
import { CLASSES } from '../../js/config/classes.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';
import { Monster } from '../entities/Monster.js';
import { Boss } from '../entities/Boss.js';
import { Bullet } from '../entities/Bullet.js';
import { XpOrb } from '../entities/XpOrb.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { RoomManager } from './RoomManager.js';
import { Room } from './Room.js';
import { getZoneIdx } from '../../js/utils/math.js';

export class Game {
    constructor(renderer, inputManager, hud, permStats, wsClient) {
        this.renderer = renderer;
        this.scene = renderer.getScene();
        this.camera = renderer.getCamera();
        this.inputManager = inputManager;
        this.hud = hud;
        this.permStats = permStats;
        this.wsClient = wsClient;

        this.weaponSystem = new WeaponSystem(this.scene);
        this.upgradeSystem = new UpgradeSystem(permStats);
        this.spawnSystem = new SpawnSystem(ZONES, this.scene);
        this.collisionSystem = new CollisionSystem();
        this.scoreboard = new Scoreboard();
        this.roomManager = new RoomManager(this.scene, this.upgradeSystem, this.weaponSystem);

        this.state = 'menu';
        this.player = null;
        this.playerName = '';
        this.room = null;
        this.inRoomMode = false;
        this.monsters = [];
        this.bullets = [];
        this.xpOrbs = [];
        this.bots = [];
        this.bosses = [];
        this.fxList = [];

        this.gameTime = 0;
        this.pendingUpgrades = 0;
        this.escapePressed = false;
        this.onlineMode = false;
        this.serverStateBuffer = null;
        this.lastServerStateTime = 0;

        // Online entity lookup maps
        this.onlinePlayerMap = new Map();
        this.onlineBotMap = new Map();
        this.onlineMonsterMap = new Map();
        this.onlineBulletMap = new Map();
        this.onlineXpOrbMap = new Map();
        this.onlineBossMap = new Map();

        window.WEAPONS = WEAPONS;
        window.BOOKS = BOOKS;
        window.CLASSES = CLASSES;
        window.gameInstance = this;
    }

    async start(classId, mode = 'online', playerName = '', config = {}) {
        this.cleanup();
        this.spawnBackground();

        this.playerName = playerName;
        this.inRoomMode = true;
        this.onlineMode = (mode === 'online' && this.wsClient?.connected);

        if (config.difficulty) {
            this.spawnSystem.setDifficulty(config.difficulty);
        }

        const roomId = this.generateRoomCode();
        this.room = new Room(roomId, config.difficulty || 'medium');
        this.room.addPlayer(playerName);
        const roomPermStats = this.room.getPermanentStats(playerName);
        const playerPermStats = { ...this.permStats, ...roomPermStats };

        const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        this.player = new Player(classId, playerPermStats, this.scene, false, spawnPoint.x, spawnPoint.y);
        this.player.totalXp = 0;
        this.player.name = playerName || 'Gracz';
        this.weaponSystem.setupAura(this.player);

        if (this.onlineMode) {
            await this.startOnline(classId, playerName, config);
        } else {
            this.startOfflineMode(spawnPoint);
        }

        if (!this.onlineMode) {
            for (let i = 0; i < 80; i++) {
                this.spawnSystem.spawnMonster(this.monsters, [this.player]);
            }
        }

        this.state = 'playing';
        this.gameTime = 0;
        this.pendingUpgrades = 0;
    }

    async startOnline(classId, playerName, config) {
        this.inputManager.setWebSocketClient(this.wsClient);

        this.wsClient.onGameState = (msg) => this.handleServerState(msg);
        this.wsClient.onLevelUp = (msg) => this.handleServerLevelUp(msg);
        this.wsClient.onUpgradeOptions = (msg) => this.handleServerUpgradeOptions(msg);
        this.wsClient.onPlayerDead = (msg) => this.handleServerPlayerDead(msg);
        this.wsClient.onPlayerKilled = (msg) => this.handleServerPlayerKilled(msg);
        this.wsClient.onMatchEnded = (msg) => this.handleServerMatchEnded(msg);
        this.wsClient.onPlayerRespawned = (msg) => this.handleServerPlayerRespawned(msg);
        try {
            const roomData = await this.wsClient.joinRoom({
                name: playerName,
                playerClass: classId,
                roomId: config?.roomId || null,
                difficulty: config?.difficulty || 'medium',
                bots: config?.bots !== undefined ? config.bots : true,

                quickJoin: !!config?.quickJoin,
                create: !!config?.create
            });

            if (roomData.online) {
                this.roomManager.createOnlineRoom(roomData);

                this.serverRoomId = roomData.roomId;
                this.showRoomCodeOverlay(roomData.roomId);

                this.hud.addKillFeed(`Dołączono do pokoju ${roomData.roomId}`);
                this.inRoomMode = true;
            } else {
                this.onlineMode = false;
                this.startOfflineMode({ x: this.player.x, y: this.player.y });
            }
        } catch (e) {
            console.warn('Online mode failed, starting offline:', e);
            this.onlineMode = false;
            this.startOfflineMode({ x: this.player.x, y: this.player.y });
        }
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    startOfflineMode(playerSpawnPoint) {
        this.roomManager.createOfflineRoom(this.player.cls, this.permStats, playerSpawnPoint);
    }

    spawnBackground() {
        const hw = WORLD / 2;

        const bgGeo = new THREE.PlaneGeometry(WORLD, WORLD);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
        const bg = new THREE.Mesh(bgGeo, bgMat);
        bg.position.z = -15;
        this.scene.add(bg);

        const gridHelper = new THREE.GridHelper(WORLD, 60, 0x222222, 0x444444);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.position.z = -14;
        this.scene.add(gridHelper);

        for (let i = 0; i < ZONES.length; i++) {
            const z = ZONES[i];
            const geo = i === 0 ? new THREE.CircleGeometry(z.maxR, 64) : new THREE.RingGeometry(z.minR, z.maxR, 64);
            const mat = new THREE.MeshBasicMaterial({ color: z.col, transparent: true, opacity: i === 0 ? 0.6 : 0.5 });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.z = -10 - i * 0.1;
            this.scene.add(mesh);

            if (i === 0) {
                const warningGeo = new THREE.RingGeometry(z.maxR - 50, z.maxR, 64);
                const warningMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
                const warning = new THREE.Mesh(warningGeo, warningMat);
                warning.position.z = -9;
                this.scene.add(warning);
            }
        }

        const borderMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 4 });
        const borderPoints = [
            new THREE.Vector3(-hw, -hw, -5), new THREE.Vector3(hw, -hw, -5),
            new THREE.Vector3(hw, hw, -5), new THREE.Vector3(-hw, hw, -5),
            new THREE.Vector3(-hw, -hw, -5)
        ];
        const borderLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPoints), borderMat);
        this.scene.add(borderLine);
    }

    // ═══════════════════════════════════════════════════════════
    //  ONLINE STATE SYNC
    // ═══════════════════════════════════════════════════════════

    handleServerState(msg) {
        this.serverStateBuffer = msg.data;
        this.lastServerStateTime = performance.now();
        this.gameTime = msg.data.gameTime || this.gameTime;

        const myId = this.wsClient.playerId;
        const meState = msg.data.players.find(p => p.id === myId);

        if (meState) {
            this.syncEntity(this.player, meState, false);
            this.camera.position.set(this.player.x, this.player.y, 10);
        }

        this.syncCollection(this.onlinePlayerMap, msg.data.players.filter(p => p.id !== myId), (s) => this.createPlayerFromState(s), false, true);
        this.syncCollection(this.onlineBotMap, msg.data.bots, (s) => this.createBotFromState(s), false, false);
        this.syncCollection(this.onlineMonsterMap, msg.data.monsters, (s) => this.createMonsterFromState(s), true, false);
        this.syncCollection(this.onlineBulletMap, msg.data.bullets, (s) => this.createBulletFromState(s), true, false);
        this.syncCollection(this.onlineXpOrbMap, msg.data.xpOrbs, (s) => this.createXpOrbFromState(s), true, false);
        this.syncCollection(this.onlineBossMap, msg.data.bosses, (s) => this.createBossFromState(s), true, false);

        // Update local arrays for systems that use them (e.g. HUD)
        this.bots = Array.from(this.onlineBotMap.values());
        this.monsters = Array.from(this.onlineMonsterMap.values());
        this.bullets = Array.from(this.onlineBulletMap.values());
        this.xpOrbs = Array.from(this.onlineXpOrbMap.values());
        this.bosses = Array.from(this.onlineBossMap.values());

        this.hud.update(this.player, ZONES);
        this.hud.updateMinimap(this.player, this.monsters, this.bots, 0, this.bosses);
        this.scoreboard.update(this.player, this.bots);
    }

    syncCollection(map, states, factory, hasShape, isPlayer) {
        const seen = new Set();
        for (const s of states) {
            seen.add(s.id);
            let entity = map.get(s.id);
            if (!entity) {
                entity = factory(s);
                entity.targetX = s.x;
                entity.targetY = s.y;
                map.set(s.id, entity);
            } else {
                this.syncEntity(entity, s, hasShape);
            }
        }
        for (const [id, entity] of map) {
            if (!seen.has(id)) {
                entity.destroy && entity.destroy();
                map.delete(id);
            }
        }
    }
    syncEntity(entity, state, hasShape, snap = false) {
        if (snap || entity.x === undefined || entity.y === undefined) {
            entity.x = state.x;
            entity.y = state.y;
        } else {
            entity.targetX = state.x;
            entity.targetY = state.y;
        }

        if (state.hp !== undefined) entity.hp = state.hp;
        if (state.maxHp !== undefined) entity.maxHp = state.maxHp;

        if (state.level !== undefined) entity.level = state.level;
        if (state.xp !== undefined) entity.xp = state.xp;
        if (state.xpNeeded !== undefined) entity.xpNeeded = state.xpNeeded;
        if (state.totalXp !== undefined) entity.totalXp = state.totalXp;

        if (state.killedMonsters !== undefined) entity.killedMonsters = state.killedMonsters;
        if (state.totalDmg !== undefined) entity.totalDmg = state.totalDmg;

        if (state.class !== undefined && entity.cls !== state.class) {
            entity.cls = state.class;
        }
    }
    createPlayerFromState(s) {
        const p = new Player(s.class || 'warrior', this.permStats, this.scene, false, s.x, s.y);
        p.id = s.id;
        p.name = s.name;
        p.level = s.level || 1;
        p.hp = s.hp || 1;
        p.maxHp = s.maxHp || 1;
        return p;
    }

    createBotFromState(s) {
        const b = new Bot(s.x, s.y, this.scene);
        b.id = s.id;
        b.name = s.name;
        b.cls = s.class || b.cls;
        b.level = s.level || 1;
        b.hp = s.hp || 1;
        b.maxHp = s.maxHp || 1;
        return b;
    }

    createMonsterFromState(s) {
        const m = new Monster(s.x, s.y, s.zoneIdx || 0, ZONES, this.scene, 1.0, s.isBoss || false);
        m.id = s.id;
        m.hp = s.hp || 1;
        m.maxHp = s.maxHp || 1;
        m.isElite = s.isElite || false;
        m.sz = s.sz || m.sz;
        return m;
    }

    createBulletFromState(s) {
        const b = new Bullet(s.x, s.y, s.vx || 0, s.vy || 0, 0, null, s.wtype || 'bow', s.sz || 1, 0, 0, s.col || 0xffffff, this.scene);
        b.id = s.id;
        return b;
    }

    createXpOrbFromState(s) {
        const o = new XpOrb(s.x, s.y, s.val || 1, this.scene);
        o.id = s.id;
        return o;
    }

    createBossFromState(s) {
        const bossType = BOSS_TYPES.find(b => b.id === s.type) || BOSS_TYPES[0];
        const b = new Boss(s.x, s.y, bossType, this.scene);
        b.id = s.id;
        b.hp = s.hp || 1;
        b.maxHp = s.maxHp || 1;
        return b;
    }

    handleServerLevelUp(msg) {
        this.pendingUpgrades = msg.data.pendingUpgrades || 1;
    }

    handleServerUpgradeOptions(msg) {
        if (msg.data?.cards && msg.data.cards.length > 0) {
            this.state = 'upgrade';
            window.gameInstance.upgradeCards = msg.data.cards;
        }
    }

    handleServerPlayerDead(msg) {
        this.state = 'dead';
        this.deathData = msg.data || {};

        if (this.deathData.permStats) {
            this.serverPermStats = this.deathData.permStats;
        }
    }

    handleServerPlayerKilled(msg) {
        this.hud.addKillFeed(`⚔️ ${msg.data.killerName} zabił ${msg.data.victimName || 'gracza'}!`);
    }

    handleServerMatchEnded(msg) {
        this.state = 'ended';
        this.hud.showMatchEnd(msg.data);
    }

    handleServerPlayerRespawned(msg) {
        const data = msg.data || {};

        if (!this.player) return;

        this.syncEntity(this.player, data, false, true);

        this.player.hp = data.hp ?? this.player.maxHp;
        this.player.maxHp = data.maxHp ?? this.player.maxHp;
        this.player.level = data.level ?? 1;
        this.player.xp = data.xp ?? 0;
        this.player.xpNeeded = data.xpNeeded ?? 100;
        this.player.totalXp = data.totalXp ?? 0;
        this.player.killedMonsters = data.killedMonsters ?? 0;
        this.player.totalDmg = data.totalDmg ?? 0;

        this.pendingUpgrades = 0;
        this.state = 'playing';

        this.hud.addKillFeed('Odrodzony!');
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════════════════════
    interpolateOnlineEntities(dt) {
        const alpha = 1 - Math.pow(0.001, dt); 
        // im większe, tym szybciej dogania target

        const interpolate = (entity) => {
            if (!entity) return;

            if (entity.targetX === undefined || entity.targetY === undefined) return;

            entity.x += (entity.targetX - entity.x) * alpha;
            entity.y += (entity.targetY - entity.y) * alpha;

            if (entity.updatePosition) {
                entity.updatePosition(3, 2.9);
            } else if (entity.mesh) {
                entity.mesh.position.set(entity.x, entity.y, entity.mesh.position.z);
            }
        };

        interpolate(this.player);

        for (const e of this.onlinePlayerMap.values()) interpolate(e);
        for (const e of this.onlineBotMap.values()) interpolate(e);
        for (const e of this.onlineMonsterMap.values()) interpolate(e);
        for (const e of this.onlineBulletMap.values()) interpolate(e);
        for (const e of this.onlineXpOrbMap.values()) interpolate(e);
        for (const e of this.onlineBossMap.values()) interpolate(e);
    }
    update(dt) {
        if (!this.player) return null;

        if (this.onlineMode) {
            return this.updateOnline(dt);
        }
        return this.updateOffline(dt);
    }

    updateOnline(dt) {
        this.inputManager.update();
        this.interpolateOnlineEntities(dt);
        // Camera already follows player in handleServerState
        if (this.player) {
            this.camera.position.set(this.player.x, this.player.y, 10);
        }

        // Server owns positions; we only animate visual effects here if needed
        for (const fx of this.fxList) {
            fx.life -= dt;
            if (fx.life > 0) fx.mesh.material.opacity = fx.life / 0.15;
            else this.scene.remove(fx.mesh);
        }
        this.fxList = this.fxList.filter(fx => fx.life > 0);

        this.hud.update(this.player, ZONES);
        this.hud.updateMinimap(this.player, this.monsters, this.bots, 0, this.bosses);
        this.scoreboard.update(this.player, this.bots);
        this.updateBotHealthBars();

        if (this.state === 'upgrade' && window.gameInstance.upgradeCards) {
            return window.gameInstance.upgradeCards;
        }

        return null;
    }

    updateOffline(dt) {
        this.gameTime += dt;
        this.roomManager.update(dt, this.bots, this.hud);

        this.checkEscapeKey();

        this.updatePlayer(dt);
        this.updateBots(dt);
        this.updateWorld(dt);
        this.updateCollisions(dt);
        this.cleanupDead();

        if (this.player.hp <= 0) return this.onPlayerDeath();
        if (this.pendingUpgrades > 0 && this.state === 'playing') {
            this.state = 'upgrade';
            return this.upgradeSystem.generateUpgradeCards(this.player);
        }

        this.hud.update(this.player, ZONES);
        this.hud.updateMinimap(this.player, this.monsters, this.bots, 0, this.bosses);
        this.scoreboard.update(this.player, this.bots);
        this.updateBotHealthBars();

        return null;
    }

    checkEscapeKey() {
        if (this.inputManager && this.inputManager.isKeyPressed('Escape')) {
            if (!this.escapePressed) {
                this.escapePressed = true;
                this.onEscapePressed();
            }
        } else {
            this.escapePressed = false;
        }
    }

    onEscapePressed() {
        if (!window.roomMenuScreen) return;
        window.roomMenuScreen.toggle(this.room);
    }

    updatePlayer(dt) {
        this.player.update(dt, this.inputManager, 0, this.monsters, this.xpOrbs, this.upgradeSystem, this.weaponSystem);
        this.camera.position.set(this.player.x, this.player.y, 10);

        const playerFireTargets = this._getPlayerFireTargets();
        this.weaponSystem.updateAura(this.player, dt, playerFireTargets, this.player);

        for (let i = 0; i < 4; i++) {
            if (this.player.weapons[i]) {
                this.weaponSystem.fireWeapon(this.player, i, this.inputManager, playerFireTargets, this.bullets, this.fxList, this.player);
            }
        }
    }

    _getPlayerFireTargets() {
        if (!this._playerTargets) this._playerTargets = [];
        this._playerTargets.length = 0;
        for (const m of this.monsters) this._playerTargets.push(m);
        for (const b of this.bots) {
            if (b.hp > 0) this._playerTargets.push(b);
        }
        return this._playerTargets;
    }

    updateBots(dt) {
        if (!this._allPlayersCache || this._allPlayersCacheDirty) {
            this._allPlayersCache = [this.player, ...this.bots].filter(Boolean);
            this._allPlayersCacheDirty = false;
        }
        const allPlayers = this._allPlayersCache;

        for (const bot of this.bots) {
            if (!bot._passiveXpTimer) bot._passiveXpTimer = Math.random();
            bot._passiveXpTimer += dt;
            if (bot._passiveXpTimer >= 1.0) {
                bot._passiveXpTimer -= 1.0;
                const passiveXp = 4 + Math.floor(Math.random() * 9);
                bot.addXp(passiveXp);
            }

            bot.update(dt, null, 0, this.monsters, this.xpOrbs, this.upgradeSystem, this.weaponSystem, allPlayers);

            const botAuraTargets = this._getBotAuraTargets(bot);
            this.weaponSystem.updateAura(bot, dt, botAuraTargets, bot);

            const botFireTargets = this._getBotFireTargets(bot);
            for (let i = 0; i < 4; i++) {
                if (bot.weapons[i]) {
                    this.weaponSystem.fireWeapon(bot, i, null, botFireTargets, this.bullets, this.fxList, bot);
                }
            }
        }
    }

    _getBotAuraTargets(bot) {
        if (!this._botAuraTargets) this._botAuraTargets = [];
        this._botAuraTargets.length = 0;
        for (const m of this.monsters) this._botAuraTargets.push(m);
        if (this.player && this.player.hp > 0) this._botAuraTargets.push(this.player);
        for (const b of this.bots) {
            if (b !== bot && b.hp > 0) this._botAuraTargets.push(b);
        }
        return this._botAuraTargets;
    }

    _getBotFireTargets(bot) {
        if (!this._botFireTargets) this._botFireTargets = [];
        this._botFireTargets.length = 0;
        for (const m of this.monsters) this._botFireTargets.push(m);
        if (this.player && this.player.hp > 0) this._botFireTargets.push(this.player);
        for (const b of this.bots) {
            if (b !== bot && b.hp > 0) this._botFireTargets.push(b);
        }
        return this._botFireTargets;
    }

    updateWorld(dt) {
        const targets = [this.player, ...this.bots];
        this.spawnSystem.update(dt, this.monsters, this.gameTime, this.bullets, this.scene, targets, this.bosses);

        this.bullets.forEach(b => b.update(dt));

        for (const orb of this.xpOrbs) {
            if (orb.life <= 0) continue;
            if (orb.update(dt, this.player)) {
                const zoneIdx = getZoneIdx(this.player.x, this.player.y, ZONES);
                const levelUps = this.player.addXp(orb.val, zoneIdx);
                this.player.totalXp = (this.player.totalXp || 0) + orb.val;
                if (levelUps > 0) this.pendingUpgrades += levelUps;
                orb.life = -1;
            }
        }

        for (const fx of this.fxList) {
            fx.life -= dt;
            if (fx.life > 0) fx.mesh.material.opacity = fx.life / 0.15;
            else this.scene.remove(fx.mesh);
        }
    }

    updateCollisions(dt) {
        this.collisionSystem.checkBulletCollisions(this.bullets, this.monsters, this.player, this.bots, this.bosses);

        const newBullets = [];
        for (const b of this.bullets) {
            if (b._spawnQueue) {
                newBullets.push(...b._spawnQueue);
                b._spawnQueue = null;
            }
        }
        this.bullets.push(...newBullets);
        for (const b of newBullets) {
            this.scene.add(b.mesh);
        }

        this.collisionSystem.checkMonsterPlayerCollisions(this.monsters, this.player, dt);
        this.collisionSystem.checkMonsterBotCollisions(this.monsters, this.bots, dt);
        this.collisionSystem.checkBossPlayerCollisions(this.bosses, this.player, dt);
        this.collisionSystem.checkBossBotCollisions(this.bosses, this.bots, dt);

        const pvpResult = this.collisionSystem.checkPlayerBotCollisions(this.player, this.bots);
        if (pvpResult) {
            this.hud.addKillFeed(`⚔️ Zabiłeś ${pvpResult.killed.name || 'Bot'}!`);
            if (this.player) this.player.addXp(Math.floor((pvpResult.killed.totalXp || 0) * 0.3));
        }

        this.collisionSystem.checkBotBulletVsPlayer(this.bullets, this.player, this.bots);
        this.collisionSystem.checkPlayerBulletVsBots(this.bullets, this.player, this.bots);
    }

    cleanupDead() {
        this.monsters.filter(m => m.hp <= 0).forEach(m => {
            const spawnXp = m.state !== 'despawning' && !m.isDespawning;
            if (spawnXp) {
                const xpVal = m.xp || 5;
                const killer = m.lastHitBy;
                if (killer && killer.isBot && killer.hp > 0) {
                    killer.addXp(xpVal);
                    killer.killedMonsters = (killer.killedMonsters || 0) + 1;
                    if (killer.botAI?.onKill) killer.botAI.onKill(m);
                } else if (killer && killer === this.player && this.player.hp > 0) {
                    this.spawnSystem.spawnXpOrbs(m, this.xpOrbs, this.player.level);
                    this.player.killedMonsters = (this.player.killedMonsters || 0) + 1;
                } else {
                    this.spawnSystem.spawnXpOrbs(m, this.xpOrbs, this.player ? this.player.level : 1);
                }
            }
            m.destroy();
        });
        this.monsters = this.monsters.filter(m => m.hp > 0);

        this.bosses.filter(b => b.hp <= 0).forEach(b => {
            this.hud.addKillFeed(`💀 ${b.bossData.emoji} ${b.bossData.name} POKONANY!`);
            this.spawnSystem.spawnXpOrbs(b, this.xpOrbs, this.player ? this.player.level : 1);
            b.destroy();
        });
        this.bosses = this.bosses.filter(b => b.hp > 0);

        for (const b of this.bullets) {
            if (b.wtype === 'sword' || b.wtype === 'aura') {
                const owner = b.owner;
                if (owner && typeof owner === 'object') {
                    if (owner.hp <= 0 || owner.life <= 0) b.life = -1;
                }
            }
        }
        this.bullets.filter(b => b.life <= 0).forEach(b => b.destroy());
        this.bullets = this.bullets.filter(b => b.life > 0);

        this.xpOrbs.filter(o => o.life <= 0).forEach(o => o.destroy());
        this.xpOrbs = this.xpOrbs.filter(o => o.life > 0);

        this.fxList = this.fxList.filter(fx => fx.life > 0);

        this.bots.filter(b => b.hp <= 0).forEach(b => {
            this.hud.addKillFeed(`💀 ${b.name || 'Bot'} został pokonany!`);
            if (b.botAI?.onDeath) b.botAI.onDeath();
            b.destroy();
            this._allPlayersCacheDirty = true;
            setTimeout(() => {
                if (this.state === 'playing' || this.state === 'upgrade') {
                    this.spawnNewBot();
                    this._allPlayersCacheDirty = true;
                }
            }, 10000);
        });
        this.bots = this.bots.filter(b => b.hp > 0);
    }

    updateBotHealthBars() {
        // Aktualizuj co ~100ms (10fps) - DOM manipulation jest kosztowne
        if (!this._hpBarTimer) this._hpBarTimer = 0;
        this._hpBarTimer += 0.016; // approx dt
        if (this._hpBarTimer < 0.1) return;
        this._hpBarTimer = 0;

        this._initBotHealthBarContainer();

        const camera = this.camera;
        const canvas = this.renderer.renderer.domElement;
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const VIEW = 450; // musi zgadzać się z constants.js

        // Przelicz współrzędne świata -> ekran (kamera ortograficzna)
        const worldToScreen = (wx, wy) => {
            const asp = W / H;
            const camX = camera.position.x;
            const camY = camera.position.y;
            const halfW = VIEW * asp;
            const halfH = VIEW;
            const sx = ((wx - camX + halfW) / (2 * halfW)) * W;
            const sy = ((1 - (wy - camY + halfH) / (2 * halfH))) * H;
            return { sx, sy };
        };

        const container = this._botHpContainer;
        const elements = this._botHpElements;
        const activeBotIds = new Set();

        for (const bot of this.bots) {
            if (bot.hp <= 0) continue;
            const id = bot.name || bot;
            activeBotIds.add(id);

            if (!elements.has(id)) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:absolute;display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);gap:1px;';

                const nameEl = document.createElement('div');
                nameEl.style.cssText = 'font-size:10px;font-weight:bold;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap;';
                nameEl.textContent = bot.name || 'Bot';

                const barBg = document.createElement('div');
                barBg.style.cssText = 'width:36px;height:4px;background:#333;border-radius:2px;overflow:hidden;';

                const barFill = document.createElement('div');
                barFill.style.cssText = 'height:100%;background:#e53935;border-radius:2px;transition:width 0.1s;';
                barBg.appendChild(barFill);

                wrapper.appendChild(nameEl);
                wrapper.appendChild(barBg);
                container.appendChild(wrapper);
                elements.set(id, { wrapper, barFill });
            }

            const el = elements.get(id);
            const pct = Math.max(0, Math.min(1, bot.hp / bot.maxHp)) * 100;
            el.barFill.style.width = pct + '%';

            const hpRatio = bot.hp / bot.maxHp;
            if (hpRatio > 0.6) el.barFill.style.background = '#43a047';
            else if (hpRatio > 0.3) el.barFill.style.background = '#fdd835';
            else el.barFill.style.background = '#e53935';

            const { sx, sy } = worldToScreen(bot.x, bot.y);
            el.wrapper.style.left = sx + 'px';
            el.wrapper.style.top = (sy - 14) + 'px';
            el.wrapper.style.display = '';
        }

        for (const [id, el] of elements) {
            if (!activeBotIds.has(id)) {
                el.wrapper.remove();
                elements.delete(id);
            }
        }
    }

    _initBotHealthBarContainer() {
        if (this._botHpContainer) return;
        const div = document.createElement('div');
        div.id = 'bot-hp-overlay';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
        document.body.appendChild(div);
        this._botHpContainer = div;
        this._botHpElements = new Map();
    }

    clearBotHealthBars() {
        if (this._botHpContainer) {
            this._botHpContainer.innerHTML = '';
            this._botHpElements = new Map();
        }
    }

    spawnNewBot() {
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = 6500 + Math.random() * 1500;
        const newBot = new Bot(
            Math.cos(spawnAngle) * spawnDist,
            Math.sin(spawnAngle) * spawnDist,
            this.scene
        );
        this.weaponSystem.setupAura(newBot);
        if (newBot._pendingStartUpgrades > 0) {
            for (let i = 0; i < newBot._pendingStartUpgrades; i++) {
                const cards = this.upgradeSystem.generateUpgradeCards(newBot);
                if (cards?.length > 0) {
                    const best = newBot.botAI?.selectBestUpgrade
                        ? newBot.botAI.selectBestUpgrade(cards)
                        : cards[Math.floor(Math.random() * cards.length)];
                    if (best) this.upgradeSystem.applyUpgrade(best, newBot, this.weaponSystem);
                }
            }
            newBot._pendingStartUpgrades = 0;
        }
        this.bots.push(newBot);
    }

    applyUpgrade(card) {
        if (this.onlineMode) {
            this.wsClient.sendUpgradeSelect(card.upgradeKey);
        } else {
            this.upgradeSystem.applyUpgrade(card, this.player, this.weaponSystem);
        }
        this.pendingUpgrades--;
        if (this.pendingUpgrades <= 0) this.state = 'playing';
    }

    onPlayerDeath() {
        this.savePlayerStatsToRoom();
        this.state = 'dead';
        if (this.onlineMode && this.deathData) {
            return this.deathData;
        }
        return {
            level: this.player.level,
            kills: this.player.killedMonsters,
            totalDmg: this.player.totalDmg,
            isInRoom: this.inRoomMode
        };
    }

    savePlayerStatsToRoom() {
        if (!this.player || !this.room) return;
        this.room.updatePlayerStats(this.playerName, {
            level: this.player.level,
            xp: this.player.xp,
            kills: this.player.killedMonsters,
            totalDmg: this.player.totalDmg
        });
    }

    respawnPlayer() {
        if (!this.player || !this.room) return;
        const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
        const playerClass = this.player.cls;
        this.player.destroy();

        const roomPermStats = this.room.getPermanentStats(this.playerName);
        const playerPermStats = { ...this.permStats, ...roomPermStats };

        this.player = new Player(
            playerClass,
            playerPermStats,
            this.scene,
            false,
            spawnPoint.x,
            spawnPoint.y
        );
        this.player.level = 1;
        this.player.xp = 0;
        this.player.xpNeeded = 100;
        this.player.totalXp = 0;
        this.player.killedMonsters = 0;
        this.player.totalDmg = 0;
        this.player.name = this.playerName || 'Gracz';
        this.weaponSystem.setupAura(this.player);
        this.hud.addKillFeed('Odrodzony!');
        this.pendingUpgrades = 0;
        this.state = 'playing';
    }

    leaveRoom() {
        this.savePlayerStatsToRoom();
        if (this.onlineMode && this.wsClient) {
            this.wsClient.leaveRoom();
        }
        this.cleanup();
        this.state = 'menu';
        this.player = null;
        this.room = null;
        this.hideRoomCodeOverlay();
        if (window.onLeaveRoom) window.onLeaveRoom();
    }
    hideRoomCodeOverlay() {
        const el = document.getElementById('room-code-overlay');
        if (el) el.style.display = 'none';
    }
    showRoomCodeOverlay(roomId) {
        if (!roomId) return;

        let el = document.getElementById('room-code-overlay');

        if (!el) {
            el = document.createElement('div');
            el.id = 'room-code-overlay';
            el.style.cssText = `
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 9999;
                padding: 10px 14px;
                background: rgba(0, 0, 0, 0.72);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 8px;
                font-family: 'Share Tech Mono', monospace;
                font-size: 14px;
                letter-spacing: 1px;
                pointer-events: none;
                text-align: right;
            `;
            document.body.appendChild(el);
        }

        el.innerHTML = `
            <div style="opacity:.65;font-size:11px;">KOD POKOJU</div>
            <div style="font-size:20px;font-weight:bold;">${roomId}</div>
        `;

        el.style.display = 'block';
    }


    cleanup() {
        [this.player, ...this.monsters, ...this.bullets, ...this.xpOrbs, ...this.bots, ...this.bosses]
            .filter(e => e).forEach(e => e.destroy && e.destroy());

        this.fxList.forEach(fx => fx.mesh && this.scene.remove(fx.mesh));

        const toRemove = [];
        this.scene.traverse(obj => {
            if (obj !== this.scene && ['Mesh', 'Line', 'GridHelper', 'Sprite'].includes(obj.type)) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));
        this.hideRoomCodeOverlay();
        this.player = null;
        [this.monsters, this.bullets, this.xpOrbs, this.bots, this.bosses, this.fxList].forEach(arr => arr.length = 0);

        this.onlinePlayerMap.clear();
        this.onlineBotMap.clear();
        this.onlineMonsterMap.clear();
        this.onlineBulletMap.clear();
        this.onlineXpOrbMap.clear();
        this.onlineBossMap.clear();
    }
}
