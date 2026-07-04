import { ZONES, SPAWN_POINTS, WORLD, BOSS_TYPES, MOVEMENT_MULTIPLIER } from '../../js/config/constants.js';
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
        this.upgradeCards = null;
        this.upgradeCardsDirty = false;
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
        if (!this.onlineMode) {
            this.inputManager.setWebSocketClient(null);
        }
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
        this.wsClient.onUpgradeDone = (msg) => this.handleServerUpgradeDone(msg);
        this.wsClient.onFx = (msg) => this.handleServerFx(msg.data);
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

                const joinedRoomId =
                    roomData.roomId ||
                    roomData.data?.roomId ||
                    this.wsClient.roomId;

                this.serverRoomId = joinedRoomId;

                console.log('[Game] showing room code:', joinedRoomId);

                this.showRoomCodeOverlay(joinedRoomId);

                this.hud.addKillFeed(`Dołączono do pokoju ${joinedRoomId}`);
                this.inRoomMode = true;
            } else {
                console.warn('[Game] Online join failed:', roomData.error);

                alert(roomData.error || 'Nie udało się dołączyć do pokoju.');

                this.onlineMode = false;

                // Posprzątaj rozpoczęty lokalny player/background jeśli trzeba
                this.cleanup();
                this.state = 'menu';

                // Wróć do lobby
                if (window.gameInstance === this) {
                    // opcjonalnie
                }

                return;
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

    handleServerUpgradeDone(msg) {
        console.log('[Game] upgradeDone:', msg);

        this.pendingUpgrades = 0;
        this.state = 'playing';

        this.upgradeCards = null;
        this.upgradeCardsDirty = false;
        window.gameInstance.upgradeCards = null;
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

        if (!this._bulletDebugAt || performance.now() - this._bulletDebugAt > 1500) {
            this._bulletDebugAt = performance.now();

            const bullets = msg.data?.bullets || [];
        
        }

        const myId = this.wsClient.playerId;
        const meState = msg.data.players.find(p => p.id === myId);
        if (meState) {
            // HP/XP/level synchronizujemy normalnie, ale pozycji nie snapujemy agresywnie.
            this.syncEntity(this.player, meState, false, false);

            // Zapamiętaj pozycję serwera do miękkiej korekty.
            this.player.serverX = meState.x;
            this.player.serverY = meState.y;

            // Pierwszy sync albo teleport/respawn — snap.
            if (
                this.player._firstServerSync !== false ||
                Math.hypot(this.player.x - meState.x, this.player.y - meState.y) > 700
            ) {
                this.player.x = meState.x;
                this.player.y = meState.y;
                this.player.targetX = meState.x;
                this.player.targetY = meState.y;
                this.player._firstServerSync = false;

                if (this.player.updatePosition) {
                    this.player.updatePosition(3, 2.9);
                } else if (this.player.mesh) {
                    this.player.mesh.position.set(this.player.x, this.player.y, this.player.mesh.position.z);
                }
            }
        }
            this.syncCollection(
            this.onlinePlayerMap,
            msg.data.players.filter(p => p.id !== myId),
            (s) => this.createPlayerFromState(s),
            false,
            true
        );

        this.syncCollection(this.onlineBotMap, msg.data.bots || [], (s) => this.createBotFromState(s), false, false);
        this.syncCollection(this.onlineMonsterMap, msg.data.monsters || [], (s) => this.createMonsterFromState(s), true, false);
        this.syncCollection(this.onlineBulletMap, msg.data.bullets || [], (s) => this.createBulletFromState(s), true, false);
        this.syncCollection(this.onlineXpOrbMap, msg.data.xpOrbs || [], (s) => this.createXpOrbFromState(s), true, false);
        this.syncCollection(this.onlineBossMap, msg.data.bosses || [], (s) => this.createBossFromState(s), true, false);

        this.remotePlayers = Array.from(this.onlinePlayerMap.values());
        this.onlineBots = Array.from(this.onlineBotMap.values());

        this.bots = [
            ...this.remotePlayers,
            ...this.onlineBots
        ];

        this.monsters = Array.from(this.onlineMonsterMap.values());
        this.bullets = Array.from(this.onlineBulletMap.values());
        this.xpOrbs = Array.from(this.onlineXpOrbMap.values());
        this.bosses = Array.from(this.onlineBossMap.values());

    }
    getBulletColor(wtype, fallback = 0xffffff) {
        const colors = {
            bow: 0x00ff88,
            knife: 0xe0e0e0,
            axe: 0xff8800,
            fireball: 0xff3300,
            lightning: 0xffff44,
            laser: 0xff00ff,
            poison: 0x00ff00,
            meteor: 0xff6600,
            sword: 0x88ccff,
            aura: 0xffaa00
        };

        return colors[wtype] ?? fallback;
    }
    createBulletFromState(s) {
        const wtype = s.wtype || 'bow';
        const col = s.col ?? this.getBulletColor(wtype);

        const b = new Bullet(
            s.x,
            s.y,
            s.vx || 0,
            s.vy || 0,
            0,
            null,
            wtype,
            s.sz || 1,
            s.bounces || 0,
            s.pierce || 0,
            col,
            this.scene
        );

        b.id = s.id;
        b.ownerId = s.ownerId || null;
        b.life = s.life ?? b.life;

        b.wtype = wtype;
        b.col = col;
        b.angle = s.angle;
        b.rotation = s.rotation;

        b.laserAngle = s.laserAngle;
        b.laserRange = s.laserRange;
        b.laserWidth = s.laserWidth;

        if (wtype === 'laser') {
            this.rebuildLaserBulletMesh(b, s);
        }

        return b;
    }
    handleServerFx(fxPayload) {
        const fxEvents = Array.isArray(fxPayload)
            ? fxPayload
            : [fxPayload];

        for (const fx of fxEvents) {
            if (!fx) continue;

            if (fx.type === 'lightning') {
                this.weaponSystem.createLightningFX(
                    fx.x1,
                    fx.y1,
                    fx.x2,
                    fx.y2,
                    this.fxList,
                    fx.col || 0xffff44
                );
            }
        }
}
    syncCollection(map, states, factory, hasShape, isPlayer) {
        const seen = new Set();

        for (const s of states) {
            seen.add(s.id);

            let entity = map.get(s.id);

            if (!entity) {
                entity = factory(s);

                entity.x = s.x;
                entity.y = s.y;
                entity.targetX = s.x;
                entity.targetY = s.y;

                map.set(s.id, entity);
            } else {
                this.syncEntity(entity, s, hasShape, false);
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
        if (!entity || !state) return;

        // Pierwsza synchronizacja albo wymuszony snap
        if (snap) {
            entity.x = state.x;
            entity.y = state.y;
            entity.targetX = state.x;
            entity.targetY = state.y;
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

        if (state.isDead !== undefined) entity.isDead = state.isDead;
        if (state.weapons) {
            entity.weapons = state.weapons.map(w => w ? {
                ...w,
                appliedUpgrades: new Set(w.appliedUpgrades || [])
            } : null);
        }

        if (state.books) {
            entity.books = state.books.map(b => b ? {
                ...b,
                appliedUpgrades: new Set(b.appliedUpgrades || [])
            } : null);
        }
        if (state.class !== undefined && entity.cls !== state.class) {
            entity.cls = state.class;
        }
        if (state.vx !== undefined) entity.vx = state.vx;
        if (state.vy !== undefined) entity.vy = state.vy;
        if (state.life !== undefined) entity.life = state.life;
        if (state.ownerId !== undefined) entity.ownerId = state.ownerId;
        if (state.wtype !== undefined) entity.wtype = state.wtype;
        if (state.col !== undefined) entity.col = state.col;

        if (state.angle !== undefined) entity.angle = state.angle;
        if (state.rotation !== undefined) entity.rotation = state.rotation;
        if (state.laserAngle !== undefined) entity.laserAngle = state.laserAngle;
        if (state.laserRange !== undefined) entity.laserRange = state.laserRange;
        if (state.laserWidth !== undefined) entity.laserWidth = state.laserWidth;
        if (entity.wtype === 'axe' || entity.wtype === 'sword') {
            if (entity.mesh) {
                entity.mesh.position.set(entity.x, entity.y, 4);

                const angle =
                    state.angle ??
                    entity.angle ??
                    Math.atan2(entity.vy || 0, entity.vx || 1);

                entity.mesh.rotation.z = angle;

                if (entity.wtype === 'axe') {
                    entity.mesh.rotation.z += performance.now() * 0.015;
                }
            }
        }
        if (entity.wtype === 'laser') {
            entity.x = state.x;
            entity.y = state.y;
            entity.targetX = state.x;
            entity.targetY = state.y;

            if (entity.mesh) {
                entity.mesh.position.set(entity.x, entity.y, 2.5);
                entity.mesh.rotation.z = entity.laserAngle || 0;
            }

            if (entity.glow) {
                entity.glow.position.set(entity.x, entity.y, 2.3);
                entity.glow.rotation.z = entity.laserAngle || 0;
            }
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

    rebuildLaserBulletMesh(b, s) {
        const range = s.laserRange || s.range || 350;
        const width = s.laserWidth || s.width || 18;
        const angle = s.laserAngle ?? s.angle ?? 0;
        const col = s.col ?? 0xff00ff;

        if (b.mesh) {
            this.scene.remove(b.mesh);
        }

        const geo = new THREE.PlaneGeometry(range, width);
        const mat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.75,
            side: THREE.DoubleSide
        });

        b.mesh = new THREE.Mesh(geo, mat);
        b.mesh.position.set(s.x, s.y, 2.5);
        b.mesh.rotation.z = angle;
        this.scene.add(b.mesh);

        if (b.glow) {
            this.scene.remove(b.glow);
        }

        const glowGeo = new THREE.PlaneGeometry(range, width * 3);
        const glowMat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        });

        b.glow = new THREE.Mesh(glowGeo, glowMat);
        b.glow.position.set(s.x, s.y, 2.3);
        b.glow.rotation.z = angle;
        this.scene.add(b.glow);
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
        const data = msg.data || {};

        console.log('[Game] upgradeOptions:', data);

        if (data.pendingUpgrades !== undefined) {
            this.pendingUpgrades = data.pendingUpgrades;
        }

        if (data.cards && data.cards.length > 0) {
            this.state = 'upgrade';

            this.upgradeCards = data.cards;
            this.upgradeCardsDirty = true;

            // opcjonalnie dla debug / kompatybilności
            window.gameInstance.upgradeCards = data.cards;
        }
    }
    handleServerPlayerDead(msg) {
        const data = msg.data || {};

        console.log('[Game] playerDead:', data);

        this.state = 'dead';
        this.deathData = data;
        this.pendingUpgrades = 0;

        this.upgradeCards = null;
        window.gameInstance.upgradeCards = null;
    }

    handleServerPlayerKilled(msg) {
        this.hud.addKillFeed(`⚔️ ${msg.data.killerName} zabił ${msg.data.victimName || 'gracza'}!`);
    }

    handleServerMatchEnded(msg) {
        this.state = 'ended';
        this.hud.showMatchEnd(msg.data);
    }
    handleServerPlayerRespawned(msg) {
        const data = msg.data || msg;

        console.log('[Game] playerRespawned:', data);

        if (!this.player) return;

        this.syncEntity(this.player, data, false, true);

        if (this.player.updatePosition) {
            this.player.updatePosition(3, 2.9);
        } else if (this.player.mesh) {
            this.player.mesh.position.set(this.player.x, this.player.y, this.player.mesh.position.z);
        }

        this.pendingUpgrades = 0;
        this.state = 'playing';
        this.deathData = null;

        window.gameInstance.upgradeCards = null;
        this.upgradeCards = null;

        this.hud.addKillFeed('Odrodzony!');
}
    // ═══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════════════════════
    interpolateOnlineEntities(dt) {
        const interpolate = (entity, speed = 14) => {
            if (!entity) return;
            if (entity.targetX === undefined || entity.targetY === undefined) return;

            const alpha = Math.min(1, dt * speed);

            entity.x += (entity.targetX - entity.x) * alpha;
            entity.y += (entity.targetY - entity.y) * alpha;

            if (entity.updatePosition) {
                entity.updatePosition(3, 2.9);
            } else if (entity.mesh) {
                entity.mesh.position.set(entity.x, entity.y, entity.mesh.position.z);
            }

            if (typeof entity.updateHealthBar === 'function') {
                entity.updateHealthBar();
            }
        };

        for (const e of this.onlinePlayerMap.values()) interpolate(e, 18);
        for (const e of this.onlineBotMap.values()) interpolate(e, 18);

        // Ważne: potwory szybciej doganiają serwer
        for (const e of this.onlineMonsterMap.values()) interpolate(e, 26);
        for (const e of this.onlineBossMap.values()) interpolate(e, 22);

        for (const e of this.onlineXpOrbMap.values()) interpolate(e, 14);
        for (const e of this.onlineBulletMap.values()) interpolate(e, 30);
   }
    update(dt) {
        if (!this.player) return null;

        if (this.onlineMode) {
            return this.updateOnline(dt);
        }
        return this.updateOffline(dt);
    }

    updateOnline(dt) {
        this.inputManager.update(dt);

        // Lokalny ruch natychmiast
        this.updateLocalPlayerPrediction(dt);

        // Miękka korekta do serwera
        this.reconcileLocalPlayerWithServer(dt);

        // Inne encje
        this.interpolateOnlineEntities(dt);

        // Aura visual
        this.updateOnlineAuraVisuals(dt);

        // Płynna kamera — ZAMIAST camera.position.set(...)
        this.updateOnlineCamera(dt);

        for (const fx of this.fxList) {
            fx.life -= dt;

            if (fx.life > 0) {
                if (fx.mesh.material) {
                    fx.mesh.material.opacity = fx.life / (fx.maxLife || 0.25);
                }
            } else {
                this.scene.remove(fx.mesh);
            }
        }

        this.fxList = this.fxList.filter(fx => fx.life > 0);

        this.hud.update(this.player, ZONES);
        this.hud.updateMinimap(this.player, this.monsters, this.bots, 0, this.bosses);
        this.scoreboard.update(this.player, this.bots);
        this.updateBotHealthBars();

        if (this.state === 'upgrade' && this.upgradeCardsDirty && this.upgradeCards) {
            this.upgradeCardsDirty = false;
            return this.upgradeCards;
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


    requestRespawn() {
        if (!this.onlineMode || !this.wsClient) {
            this.respawnPlayer();
            return;
        }

        this.wsClient.sendRespawn();
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
        // Aktualizuj co ~50ms
        if (!this._hpBarTimer) this._hpBarTimer = 0;
        this._hpBarTimer += 0.016;

        if (this._hpBarTimer < 0.05) return;
        this._hpBarTimer = 0;

        this._initBotHealthBarContainer();

        const camera = this.camera;
        const canvas = this.renderer.renderer.domElement;
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;

        const worldToScreen = (wx, wy, wz = 0) => {
            const vector = new THREE.Vector3(wx, wy, wz);
            vector.project(camera);

            return {
                sx: (vector.x * 0.5 + 0.5) * W,
                sy: (-vector.y * 0.5 + 0.5) * H,
                visible: vector.z >= -1 && vector.z <= 1
            };
        };

        const container = this._botHpContainer;
        const elements = this._botHpElements;
        const activeIds = new Set();

        // WAŻNE:
        // Tylko boty / inni gracze.
        // Nie dodawaj tutaj monsters/bosses, bo wtedy będą podwójne paski.
        const entities = this.bots;

        for (const bot of entities) {
            if (!bot || bot.hp <= 0 || !bot.maxHp) continue;

            const id = bot.id || bot.name || bot;
            activeIds.add(id);

            if (!elements.has(id)) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `
                    position:absolute;
                    display:flex;
                    flex-direction:column;
                    align-items:center;
                    transform:translate(-50%,-100%);
                    gap:1px;
                    pointer-events:none;
                `;

                const nameEl = document.createElement('div');
                nameEl.style.cssText = `
                    font-size:10px;
                    font-weight:bold;
                    color:#fff;
                    text-shadow:0 1px 2px #000;
                    white-space:nowrap;
                `;

                nameEl.textContent = bot.name || 'Bot';

                const barBg = document.createElement('div');
                barBg.style.cssText = `
                    width:36px;
                    height:4px;
                    background:#333;
                    border-radius:2px;
                    overflow:hidden;
                `;

                const barFill = document.createElement('div');
                barFill.style.cssText = `
                    height:100%;
                    background:#e53935;
                    border-radius:2px;
                    transition:width 0.1s;
                `;

                barBg.appendChild(barFill);
                wrapper.appendChild(nameEl);
                wrapper.appendChild(barBg);
                container.appendChild(wrapper);

                elements.set(id, {
                    wrapper,
                    barFill,
                    nameEl
                });
            }

            const el = elements.get(id);

            const hpRatio = Math.max(0, Math.min(1, bot.hp / bot.maxHp));
            const pct = hpRatio * 100;

            el.barFill.style.width = pct + '%';

            if (hpRatio > 0.6) {
                el.barFill.style.background = '#43a047';
            } else if (hpRatio > 0.3) {
                el.barFill.style.background = '#fdd835';
            } else {
                el.barFill.style.background = '#e53935';
            }

            const { sx, sy, visible } = worldToScreen(bot.x, bot.y, 0);

            const onScreen =
                visible &&
                sx >= -80 &&
                sx <= W + 80 &&
                sy >= -80 &&
                sy <= H + 80;

            el.wrapper.style.left = sx + 'px';
            el.wrapper.style.top = (sy - 14) + 'px';
            el.wrapper.style.display = onScreen ? '' : 'none';
        }

        for (const [id, el] of elements) {
            if (!activeIds.has(id)) {
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

            this.upgradeCards = null;
            this.upgradeCardsDirty = false;
            window.gameInstance.upgradeCards = null;

            this.pendingUpgrades--;

            if (this.pendingUpgrades <= 0) {
                this.state = 'playing';
            }

            return;
        }

        this.upgradeSystem.applyUpgrade(card, this.player, this.weaponSystem);

        this.pendingUpgrades--;

        if (this.pendingUpgrades <= 0) {
            this.state = 'playing';
        }
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

        this.hideRoomCodeOverlay();

        this.cleanup();
        this.state = 'menu';
        this.player = null;
        this.room = null;

        if (window.onLeaveRoom) window.onLeaveRoom();
    }

    upgradePermanentStat(id, step) {
        if (this.onlineMode && this.wsClient) {
            this.wsClient.sendPermUpgrade(id, step);
            return;
        }

        if (this.room && this.playerName) {
            this.room.upgradePermanentStat(this.playerName, id, step);
        }
    }
    updateOnlineAuraVisuals(dt) {
        const updateOne = (entity) => {
            if (!entity || !entity.weapons) return;

            const hasAura = entity.weapons.some(w => w?.type === 'aura');

            if (!hasAura) {
                if (entity.auraRing) {
                    this.scene.remove(entity.auraRing);
                    entity.auraRing = null;
                }

                if (entity.auraInner) {
                    this.scene.remove(entity.auraInner);
                    entity.auraInner = null;
                }

                return;
            }

            if (!entity.auraRing) {
                this.weaponSystem.setupAura(entity);
            }

            // Pusta lista celów = tylko visual, bez damage
            this.weaponSystem.updateAura(entity, dt, [], entity);
        };

        updateOne(this.player);

        for (const p of this.onlinePlayerMap.values()) updateOne(p);
        for (const b of this.onlineBotMap.values()) updateOne(b);
    }
    showRoomCodeOverlay(roomId) {
        const overlay = document.getElementById('room-code-overlay');
        const value = document.getElementById('room-code-value');

        if (!overlay || !value) {
            console.warn('[RoomCode] overlay elements not found');
            return;
        }

        if (!roomId) {
            overlay.style.display = 'none';
            value.textContent = '------';
            return;
        }

        value.textContent = roomId;
        overlay.style.display = 'block';

        console.log('[RoomCode] visible:', roomId);
    }

    updateLocalPlayerPrediction(dt) {
        if (!this.player || !this.inputManager) return;
        if (this.player.hp <= 0 || this.player.isDead) return;

        let dx = 0;
        let dy = 0;

        if (this.inputManager.isKeyPressed?.('KeyW') || this.inputManager.isKeyPressed?.('ArrowUp')) dy += 1;
        if (this.inputManager.isKeyPressed?.('KeyS') || this.inputManager.isKeyPressed?.('ArrowDown')) dy -= 1;
        if (this.inputManager.isKeyPressed?.('KeyA') || this.inputManager.isKeyPressed?.('ArrowLeft')) dx -= 1;
        if (this.inputManager.isKeyPressed?.('KeyD') || this.inputManager.isKeyPressed?.('ArrowRight')) dx += 1;

        if (!dx && !dy) return;

        const len = Math.hypot(dx, dy) || 1;

        // Dopasuj pod swoje Player.js, jeśli masz inną nazwę speeda.
        const speed =
            this.player.getFinalMoveSpeed?.() ||
            this.player.speed ||
            this.player.spd ||
            this.player.baseSpeed ||
            3;

        // U Ciebie na serwerze jest MOVEMENT_MULTIPLIER * dt * 60.
        // Jeśli klient nie importuje MOVEMENT_MULTIPLIER, użyj 1 jako fallback.
        const movementMultiplier =
            typeof MOVEMENT_MULTIPLIER !== 'undefined'
                ? MOVEMENT_MULTIPLIER
                : 1;

        this.player.x += (dx / len) * speed * movementMultiplier * dt * 60;
        this.player.y += (dy / len) * speed * movementMultiplier * dt * 60;

        const half = WORLD / 2;

        this.player.x = Math.max(-half, Math.min(half, this.player.x));
        this.player.y = Math.max(-half, Math.min(half, this.player.y));
    }
    updateOnlineCamera(dt) {
        if (!this.player || !this.camera) return;

        const targetX = this.player.x;
        const targetY = this.player.y;

        const dx = targetX - this.camera.position.x;
        const dy = targetY - this.camera.position.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 1000) {
            this.camera.position.set(targetX, targetY, 10);
            return;
        }

        const alpha = Math.min(1, dt * 22);

        this.camera.position.x += dx * alpha;
        this.camera.position.y += dy * alpha;
        this.camera.position.z = 10;
}
    reconcileLocalPlayerWithServer(dt) {
        if (!this.player) return;
        if (this.player.serverX === undefined || this.player.serverY === undefined) return;

        const dx = this.player.serverX - this.player.x;
        const dy = this.player.serverY - this.player.y;
        const dist = Math.hypot(dx, dy);

        // Bardzo duży desync / respawn / teleport
        if (dist > 900) {
            this.player.x = this.player.serverX;
            this.player.y = this.player.serverY;
        }
        // Małe różnice ignoruj, żeby nie "ciągnęło" gracza
        else if (dist > 25) {
            const correction = Math.min(1, dt * 3.5);

            this.player.x += dx * correction;
            this.player.y += dy * correction;
        }

        if (this.player.updatePosition) {
            this.player.updatePosition(3, 2.9);
        } else if (this.player.mesh) {
            this.player.mesh.position.set(this.player.x, this.player.y, this.player.mesh.position.z);
        }
    }
    hideRoomCodeOverlay() {
        const overlay = document.getElementById('room-code-overlay');
        const value = document.getElementById('room-code-value');

        if (value) value.textContent = '------';
        if (overlay) overlay.style.display = 'none';
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
