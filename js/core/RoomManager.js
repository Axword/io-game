import { Player } from '../entities/Player.js';
import { SPAWN_POINTS } from '../config/constants.js';
import { rngInt } from '../utils/math.js';

export class RoomManager {
    constructor(scene, upgradeSystem, weaponSystem) {
        this.scene = scene;
        this.upgradeSystem = upgradeSystem;
        this.weaponSystem = weaponSystem;
        this.isOnline = false;
        this.botSpawnTimer = 0;
        this.botsToSpawn = [];
    }
    
    createOfflineRoom(playerClass, permStats, playerSpawnPoint) {
        this.isOnline = false;
        
        const usedSpawns = [playerSpawnPoint];
        const availableSpawns = SPAWN_POINTS.filter(sp => sp !== playerSpawnPoint);
        
        const botCount = rngInt(5, 7);
        this.botsToSpawn = [];
        
        const realNames = [
            'xXShadowXx', 'ProGamer2024', 'NoobMaster', 'SkillIssue', 'TryHard_PL',
            'EzWin', 'Destroyer', 'Veteran99', 'TopPlayer', 'Hunter666',
            'SniperElite', 'WarMachine', 'DarkKnight', 'Phoenix', 'Blade'
        ];
        
        const usedNames = new Set();
        
        for (let i = 0; i < botCount; i++) {
            const spawnPoint = availableSpawns[i % availableSpawns.length];
            const botClass = ['warrior', 'archer', 'mage', 'berserker'][Math.floor(Math.random() * 4)];
            const botLevel = rngInt(3, 15);
            const joinDelay = rngInt(10, 45) * 1000;
            
            let name;
            do {
                name = realNames[Math.floor(Math.random() * realNames.length)];
            } while (usedNames.has(name));
            usedNames.add(name);
            
            this.botsToSpawn.push({
                class: botClass,
                level: botLevel,
                spawnPoint,
                joinDelay,
                spawned: false,
                name
            });
        }
        
        this.botsToSpawn.sort((a, b) => a.joinDelay - b.joinDelay);
        this.botSpawnTimer = 0;
    }
    
    update(dt, bots, hud) {
        if (this.isOnline || this.botsToSpawn.length === 0) return;
        
        this.botSpawnTimer += dt * 1000;
        
        for (const botData of this.botsToSpawn) {
            if (!botData.spawned && this.botSpawnTimer >= botData.joinDelay) {
                const bot = this.spawnBot(botData);
                bots.push(bot);
                botData.spawned = true;
                
                if (hud) {
                    hud.addKillFeed(`${bot.name} dołączył`);
                }
            }
        }
    }
    
    spawnBot(botData) {
        const bot = new Player(
            botData.class,
            { speed: 0, hp: 0, luck: 0 },
            this.scene,
            true,
            botData.spawnPoint.x,
            botData.spawnPoint.y
        );
        
        bot.name = botData.name;
        
        for (let i = 1; i < botData.level; i++) {
            bot.level = i + 1;
            bot.xpNeeded = Math.floor(100 * Math.pow(1.18, bot.level - 1));
            bot.maxHp += 10;
            bot.hp = bot.maxHp;
            
            this.applyRandomUpgrade(bot);
        }
        
        bot.totalXp = bot.level * 200;
        
        return bot;
    }
    
    applyRandomUpgrade(bot) {
        try {
            const cards = this.upgradeSystem.generateUpgradeCards(bot);
            if (cards && cards.length > 0) {
                const randomCard = cards[Math.floor(Math.random() * cards.length)];
                this.upgradeSystem.applyUpgrade(randomCard, bot, this.weaponSystem);
            }
        } catch (e) {
            console.warn('Bot auto-upgrade error:', e);
        }
    }
    
    createOnlineRoom(roomData) {
        this.isOnline = true;
    }
}