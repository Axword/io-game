import { ZONES, SPAWN_POINTS, WORLD } from '../config/constants.js';
import { WEAPONS } from '../config/weapons.js';
import { BOOKS } from '../config/books.js';
import { CLASSES } from '../config/classes.js';
import { Player } from '../entities/Player.js';
import { Bot } from '../entities/Bot.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';
import { UpgradeSystem } from '../systems/UpgradeSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { Scoreboard } from '../ui/Scoreboard.js';
import { RoomManager } from './RoomManager.js';
import { Room } from './Room.js';
import { getZoneIdx } from '../utils/math.js';

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
        if (config.difficulty) {
            this.spawnSystem.setDifficulty(config.difficulty);
        }

        const roomId = this.generateRoomCode();
        this.room = new Room(roomId, config.difficulty || 'medium');
        this.room.addPlayer(playerName);

        const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];

        const roomPermStats = this.room.getPermanentStats(playerName);
        const playerPermStats = { ...this.permStats, ...roomPermStats };

        this.player = new Player(classId, playerPermStats, this.scene, false, spawnPoint.x, spawnPoint.y);
        this.player.totalXp = 0;
        this.player.name = playerName || 'Gracz';
        this.weaponSystem.setupAura(this.player);

        if (mode === 'online') {
            this.wsClient.on('gameState', (data) => this.handleServerState(data));
            try {
                const roomData = await this.wsClient.createOrJoinRoom(
                    classId, 
                    this.playerName, 
                    config?.roomId || null
                );                
                if (roomData.online) {
                    this.roomManager.createOnlineRoom(roomData);
                    this.hud.addKillFeed(`Dołączono do pokoju ${roomData.roomId}`);
                    this.inRoomMode = true;
                } else {
                    this.startOfflineMode(spawnPoint);
                }
            } catch (e) {
                console.warn('Online mode failed, starting offline:', e);
                this.startOfflineMode(spawnPoint);
            }
        } else {
            this.startOfflineMode(spawnPoint);
        }

        for (let i = 0; i < 80; i++) {
            this.spawnSystem.spawnMonster(this.monsters, [this.player]);
        }

        this.state = 'playing';
        this.gameTime = 0;
        this.pendingUpgrades = 0;
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
    handleServerState(data) {
        const { players } = data.data;
        const myServerData = players.find(p => p.id === this.wsClient.playerId);
        if (myServerData && this.player) {
            this.player.x = myServerData.x;
            this.player.y = myServerData.y;
            this.player.hp = myServerData.hp;
            this.player.level = myServerData.level;
            this.camera.position.set(this.player.x, this.player.y, 10); 
        }
    }
    updateOnline(dt) {
        if (this.wsClient.connected) {
            this.wsClient.send('input', {
                playerId: this.wsClient.playerId,
                data: {
                    keys: this.inputManager.keys,
                    mouseX: this.inputManager.mouseX,
                    mouseY: this.inputManager.mouseY,
                    mouseClicked: this.inputManager.mouseClicked
                }
            });
        }
    }
    update(dt) {
        if (!this.player) return null;

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
        // Gracz: aura trafia też w boty (używamy playerFireTargets który zawiera boty)
        this.weaponSystem.updateAura(this.player, dt, this._getPlayerFireTargets(), this.player);

        // Broń gracza focusuje boty-AI gdy są bliżej niż potwory
        const playerFireTargets = this._getPlayerFireTargets();
        for (let i = 0; i < 4; i++) {
            if (this.player.weapons[i]) {
                this.weaponSystem.fireWeapon(this.player, i, this.inputManager, playerFireTargets, this.bullets, this.fxList, this.player);
            }
        }
    }

    _getPlayerFireTargets() {
        // Dodaj żywych botów do listy celów gracza
        // WeaponSystem.findNearest() wybierze najbliższy cel automatycznie
        if (!this._playerTargets) this._playerTargets = [];
        this._playerTargets.length = 0;
        for (const m of this.monsters) this._playerTargets.push(m);
        for (const b of this.bots) {
            if (b.hp > 0) this._playerTargets.push(b);
        }
        return this._playerTargets;
    }

    updateBots(dt) {
        // Cache listy graczy — nie twórz tablicy co klatkę
        if (!this._allPlayersCache || this._allPlayersCacheDirty) {
            this._allPlayersCache = [this.player, ...this.bots].filter(Boolean);
            this._allPlayersCacheDirty = false;
        }
        const allPlayers = this._allPlayersCache;

        for (const bot of this.bots) {
            // Pasywny XP — każdy bot zyskuje losowe 2-6 XP na sekundę
            if (!bot._passiveXpTimer) bot._passiveXpTimer = Math.random(); // losowy offset startowy
            bot._passiveXpTimer += dt;
            if (bot._passiveXpTimer >= 1.0) {
                bot._passiveXpTimer -= 1.0;
                const passiveXp = 4 + Math.floor(Math.random() * 9); // 4-12 XP/s
                bot.addXp(passiveXp);
            }

            // Bot AI + ruch + XP
            bot.update(dt, null, 0, this.monsters, this.xpOrbs, this.upgradeSystem, this.weaponSystem, allPlayers);

            // Aura bota trafia w potwory + gracza + inne boty
            const botAuraTargets = this._getBotAuraTargets(bot);
            this.weaponSystem.updateAura(bot, dt, botAuraTargets, bot);

            // Strzelanie — zawsze dodaj gracza i inne boty do celów
            // findNearest() sam wybierze najbliższy cel (gracz, bot, lub mob)
            const botFireTargets = this._getBotFireTargets(bot);

            for (let i = 0; i < 4; i++) {
                if (bot.weapons[i]) {
                    this.weaponSystem.fireWeapon(bot, i, null, botFireTargets, this.bullets, this.fxList, bot);
                }
            }
        }
    }

    _getBotAuraTargets(bot) {
        // Reużywalna tablica: potwory + gracz + inne boty (nie siebie)
        if (!this._botAuraTargets) this._botAuraTargets = [];
        this._botAuraTargets.length = 0;
        for (const m of this.monsters) this._botAuraTargets.push(m);
        if (this.player && this.player.hp > 0) this._botAuraTargets.push(this.player);
        for (const b of this.bots) {
            if (b !== bot && b.hp > 0) this._botAuraTargets.push(b);
        }
        return this._botAuraTargets;
    }

    _getPvpFireTargets(pvpTarget) {
        if (!this._pvpFireTargets) this._pvpFireTargets = [];
        this._pvpFireTargets.length = 0;
        for (const m of this.monsters) this._pvpFireTargets.push(m);
        this._pvpFireTargets.push(pvpTarget);
        return this._pvpFireTargets;
    }

    _getBotFireTargets(bot) {
        // Reużywalna tablica: potwory + gracz + inne żywe boty
        // findNearest() wybierze najbliższy — broń automatycznie focusuje gracza gdy jest blisko
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
        this.spawnSystem.update(dt, this.monsters, this.gameTime, 
                            this.bullets, this.scene, targets, this.bosses);

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
// Dodaj nowe pociski z bounce
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

        // PvP kolizje (kontakt)
        const pvpResult = this.collisionSystem.checkPlayerBotCollisions(this.player, this.bots);
        if (pvpResult) {
            const killedName = pvpResult.killed.name || 'Bot';
            this.hud.addKillFeed(`⚔️ Zabiłeś ${killedName}!`);
            if (this.player) this.player.addXp(Math.floor((pvpResult.killed.totalXp || 0) * 0.3));
        }

        // PvP kolizje pocisków (35% dmg)
        this.collisionSystem.checkBotBulletVsPlayer(this.bullets, this.player, this.bots);
        this.collisionSystem.checkPlayerBulletVsBots(this.bullets, this.player, this.bots);
    }

    cleanupDead() {
        // Monstery
        this.monsters.filter(m => m.hp <= 0).forEach(m => {
            const spawnXp = m.state !== 'despawning' && !m.isDespawning;
            if (spawnXp) {
                const xpVal = m.xp || 5;
                const killer = m.lastHitBy; // kto zadał łącznie najwięcej obrażeń

                if (killer && killer.isBot && killer.hp > 0) {
                    // Bot-AI dostaje XP natychmiast — nie musi podnosić orba
                    killer.addXp(xpVal);
                    killer.killedMonsters = (killer.killedMonsters || 0) + 1;
                    if (killer.botAI?.onKill) killer.botAI.onKill(m);
                } else if (killer && killer === this.player && this.player.hp > 0) {
                    // Gracz zabił — normalny orb (gracz ma magnes)
                    this.spawnSystem.spawnXpOrbs(m, this.xpOrbs, this.player.level);
                    this.player.killedMonsters = (this.player.killedMonsters || 0) + 1;
                } else {
                    // Nikt konkretny (np. mob zabił mobbem) — spawn orb dla wszystkich
                    this.spawnSystem.spawnXpOrbs(m, this.xpOrbs, this.player ? this.player.level : 1);
                }
            }
            m.destroy();
        });
        this.monsters = this.monsters.filter(m => m.hp > 0);

        // Bossy
        this.bosses.filter(b => b.hp <= 0).forEach(b => {
            this.hud.addKillFeed(`💀 ${b.bossData.emoji} ${b.bossData.name} POKONANY!`);
            this.spawnSystem.spawnXpOrbs(b, this.xpOrbs, this.player ? this.player.level : 1);
            b.destroy();
        });
        this.bosses = this.bosses.filter(b => b.hp > 0);

        // Pociski — zabij miecze martwych właścicieli
        for (const b of this.bullets) {
            if (b.wtype === 'sword' || b.wtype === 'aura') {
                const owner = b.owner;
                if (owner && typeof owner === 'object') {
                    // Jeśli właściciel to gracz lub bot który jest martwy
                    if (owner.hp <= 0 || owner.life <= 0) {
                        b.life = -1;
                    }
                }
            }
        }
        this.bullets.filter(b => b.life <= 0).forEach(b => b.destroy());
        this.bullets = this.bullets.filter(b => b.life > 0);

        // XP orby
        this.xpOrbs.filter(o => o.life <= 0).forEach(o => o.destroy());
        this.xpOrbs = this.xpOrbs.filter(o => o.life > 0);

        // FX
        this.fxList = this.fxList.filter(f => f.life > 0);

        // Boty - respawn
        this.bots.filter(b => b.hp <= 0).forEach(b => {
            const botName = b.name || 'Bot';
            this.hud.addKillFeed(`💀 ${botName} został pokonany!`);

            // Powiadom AI o śmierci
            if (b.botAI?.onDeath) b.botAI.onDeath();

            b.destroy();
            this._allPlayersCacheDirty = true; // odśwież cache graczy

            setTimeout(() => {
                if (this.state === 'playing' || this.state === 'upgrade') {
                    this.spawnNewBot();
                    this._allPlayersCacheDirty = true;
                }
            }, 10000);
        });
        this.bots = this.bots.filter(b => b.hp > 0);
    }

    // ══════════════════════════════════════════════════════════
    //  PASKI HP NAD BOTAMI (overlay HTML)
    // ══════════════════════════════════════════════════════════

    _initBotHealthBarContainer() {
        if (this._botHpContainer) return;
        const div = document.createElement('div');
        div.id = 'bot-hp-overlay';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
        document.body.appendChild(div);
        this._botHpContainer = div;
        this._botHpElements  = new Map();
    }

    updateBotHealthBars() {
        // Aktualizuj co ~100ms (10fps) - DOM manipulation jest kosztowne
        if (!this._hpBarTimer) this._hpBarTimer = 0;
        this._hpBarTimer += 0.016; // approx dt
        if (this._hpBarTimer < 0.1) return;
        this._hpBarTimer = 0;

        this._initBotHealthBarContainer();

        const camera  = this.camera;
        const canvas  = this.renderer.renderer.domElement;
        const W       = canvas.clientWidth;
        const H       = canvas.clientHeight;
        const VIEW    = 450; // musi zgadzać się z constants.js

        // Przelicz współrzędne świata -> ekran (kamera ortograficzna)
        const worldToScreen = (wx, wy) => {
            const asp = W / H;
            const camX  = camera.position.x;
            const camY  = camera.position.y;
            const halfW = VIEW * asp;
            const halfH = VIEW;
            const sx = ((wx - camX + halfW) / (2 * halfW)) * W;
            const sy = ((1 - (wy - camY + halfH) / (2 * halfH))) * H;
            return { sx, sy };
        };

        const container = this._botHpContainer;
        const elements  = this._botHpElements;
        const activeBotIds = new Set();

        for (const bot of this.bots) {
            if (bot.hp <= 0) continue;
            const id = bot.name || bot;
            activeBotIds.add(id);

            // Pobierz lub utwórz element
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

            // Kolor HP baru (zielony → żółty → czerwony)
            const hpRatio = bot.hp / bot.maxHp;
            if      (hpRatio > 0.6) el.barFill.style.background = '#43a047';
            else if (hpRatio > 0.3) el.barFill.style.background = '#fdd835';
            else                    el.barFill.style.background = '#e53935';

            const { sx, sy } = worldToScreen(bot.x, bot.y);
            el.wrapper.style.left = sx + 'px';
            el.wrapper.style.top  = (sy - 14) + 'px';
            el.wrapper.style.display = '';
        }

        // Usuń elementy martwych botów
        for (const [id, el] of elements) {
            if (!activeBotIds.has(id)) {
                el.wrapper.remove();
                elements.delete(id);
            }
        }
    }

    clearBotHealthBars() {
        if (this._botHpContainer) {
            this._botHpContainer.innerHTML = '';
            this._botHpElements = new Map();
        }
    }

    spawnNewBot() {
        // Respawn zawsze w strefie 1 (blisko centrum)
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist  = 6500 + Math.random() * 1500; // Strefa 1: promień 6000-12000
        const newBot = new Bot(
            Math.cos(spawnAngle) * spawnDist,
            Math.sin(spawnAngle) * spawnDist,
            this.scene
        );
        this.weaponSystem.setupAura(newBot);

        // Zastosuj starterowe upgrady (odpowiednik level-upów przy spawnie)
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
        this.upgradeSystem.applyUpgrade(card, this.player, this.weaponSystem);
        this.pendingUpgrades--;
        if (this.pendingUpgrades <= 0) this.state = 'playing';
    }

    onPlayerDeath() {
        this.savePlayerStatsToRoom();
        this.state = 'dead';
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
        this.cleanup();
        this.state = 'menu';
        this.player = null;
        this.room = null;
        if (window.onLeaveRoom) {
            window.onLeaveRoom();
        }
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

        this.player = null;
        [this.monsters, this.bullets, this.xpOrbs, this.bots, this.bosses, this.fxList].forEach(arr => arr.length = 0);
    }
}