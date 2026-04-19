import { ZONES, SPAWN_POINTS, WORLD } from '../config/constants.js';
import { WEAPONS } from '../config/weapons.js';
import { Player } from '../entities/Player.js';
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
        window.gameInstance = this;
    }
    
    async start(classId, mode = 'offline', playerName = '', config = {}) {
        this.cleanup();
        this.spawnBackground();
        
        this.playerName = playerName;
        this.inRoomMode = true; // Zawsze gramy w pokoju
        
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
        this.weaponSystem.setupAura(this.player);
        
        if (mode === 'online') {
            try {
                const roomData = await this.wsClient.createOrJoinRoom(classId);
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
        this.weaponSystem.updateAura(this.player, dt, this.monsters, this.player);
        
        for (let i = 0; i < 4; i++) {
            if (this.player.weapons[i]) {
                this.weaponSystem.fireWeapon(this.player, i, this.inputManager, this.monsters, this.bullets, this.fxList, this.player);
            }
        }
    }
    
    updateBots(dt) {
        for (const bot of this.bots) {
            bot.update(dt, null, 0, this.monsters, this.xpOrbs, this.upgradeSystem, this.weaponSystem);
            this.weaponSystem.updateAura(bot, dt, this.monsters, this.player);
            for (let i = 0; i < 4; i++) {
                if (bot.weapons[i]) {
                    this.weaponSystem.fireWeapon(bot, i, this.inputManager, this.monsters, this.bullets, this.fxList, this.player);
                }
            }
        }
    }
    
    updateWorld(dt) {
        const targets = [this.player, ...this.bots];
        this.spawnSystem.update(dt, this.monsters, this.gameTime, this.bullets, this.scene, targets, this.bosses);
        
        this.bullets.forEach(b => b.update(dt));
        
        for (const orb of this.xpOrbs) {
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
    this.collisionSystem.checkMonsterPlayerCollisions(this.monsters, this.player, dt);
    this.collisionSystem.checkMonsterBotCollisions(this.monsters, this.bots, dt);
    this.collisionSystem.checkBossPlayerCollisions(this.bosses, this.player, dt);
    this.collisionSystem.checkBossBotCollisions(this.bosses, this.bots, dt);
    const pvpResult = this.collisionSystem.checkPlayerBotCollisions(this.player, this.bots);
    if (pvpResult) {
        const killedName = pvpResult.killed.name || 'Bot';
        this.hud.addKillFeed(`⚔️ Zabiłeś ${killedName}!`);
    }
}
    
cleanupDead() {
    this.monsters.filter(m => m.hp <= 0).forEach(m => {
        const spawnXp = m.state !== 'despawning' && !m.isDespawning;
        if (spawnXp) {
            this.spawnSystem.spawnXpOrbs(m, this.xpOrbs, this.player ? this.player.level : 1);
            if (this.player && Math.hypot(m.x - this.player.x, m.y - this.player.y) < 1000) {
                this.player.killedMonsters++;
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
    this.bullets.filter(b => b.life <= 0).forEach(b => b.destroy());
    this.bullets = this.bullets.filter(b => b.life > 0);
    this.xpOrbs.filter(o => o.life <= 0).forEach(o => o.destroy());
    this.xpOrbs = this.xpOrbs.filter(o => o.life > 0);
    this.fxList = this.fxList.filter(f => f.life > 0);
    this.bots.filter(b => b.hp <= 0).forEach(b => {
        const botName = b.name || 'Bot';
        this.hud.addKillFeed(`💀 ${botName} został pokonany!`);
        b.destroy();
        
        setTimeout(() => {
            if (this.state === 'playing' || this.state === 'upgrade') {
                const spawnPoint = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
                const newBot = new Player(
                    ['warrior', 'archer', 'mage', 'berserker'][Math.floor(Math.random() * 4)], 
                    { speed: 0, hp: 0, luck: 0 }, 
                    this.scene, 
                    true, 
                    spawnPoint.x, 
                    spawnPoint.y
                );
                this.bots.push(newBot);
            }
        }, 10000);
    });
    this.bots = this.bots.filter(b => b.hp > 0);
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
        
        this.weaponSystem.setupAura(this.player);
        this.hud.addKillFeed('Odrodzony!');
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