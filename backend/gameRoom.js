// server/gameRoom.js
import { ServerPlayer } from './entities/Player.js';
import { DT } from './config.js';
import { ServerSpawnSystem } from './systems/SpawnSystem.js';
import { ServerCollisionSystem } from './systems/CollisionSystem.js';

export class GameRoom {
    constructor(roomData) {
        this.id = roomData.id;
        this.difficulty = roomData.difficulty;
        this.gameTime = 0;
        this.players = roomData.players; // Map from cache
        this.clients = new Map(); // playerId -> WebSocket instance
        this.spawnSystem = new ServerSpawnSystem();
        this.collisionSystem = new ServerCollisionSystem();
        
        this.monsters = [];
        this.bullets = [];
        this.xpOrbs = [];
        this.bosses = [];
        this.loopInterval = null;
    }

    addPlayer(ws, playerId, playerName, playerClass) {
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = 6500 + Math.random() * 1500; // Promień 6500-8000
        const startX = Math.cos(spawnAngle) * spawnDist;
        const startY = Math.sin(spawnAngle) * spawnDist;
        
        const player = new ServerPlayer(playerId, playerName, playerClass, {}, startX, startY);
        this.players.set(playerId, player);
        this.clients.set(playerId, ws);

        // Powiadom innych o dołączeniu
        this.broadcast({
            type: 'player_joined',
            playerId: playerId,
            name: playerName,
            class: playerClass
        }, playerId);

        // Jeśli to pierwszy gracz, odpal pętlę gry
        if (this.players.size === 1) {
            this.startGameLoop();
        }
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        this.clients.delete(playerId);

        this.broadcast({
            type: 'player_left',
            playerId: playerId
        });

        if (this.players.size === 0) {
            this.stopGameLoop();
        }
    }

    handleInput(playerId, inputData) {
        const player = this.players.get(playerId);
        if (player) {
            player.setInput(inputData);
        }
    }

    startGameLoop() {
        console.log(`[Room ${this.id}] Game loop started`);
        this.loopInterval = setInterval(() => this.update(), DT * 1000);
    }

    stopGameLoop() {
        console.log(`[Room ${this.id}] Game loop stopped`);
        if (this.loopInterval) clearInterval(this.loopInterval);
    }

    update() {
        this.gameTime += DT;
        const targets = Array.from(this.players.values()); // Wszyscy gracze w pokoju

        // 1. Gracze
        for (const player of this.players.values()) player.update(DT);

        // 2. Spawn & AI Potworów
        this.spawnSystem.update(DT, this.monsters, this.gameTime, this.bullets, targets, this.bosses);

        // 3. Pociski
        for (const b of this.bullets) b.update(DT);

        // 4. Kolizje
        this.collisionSystem.checkBulletCollisions(this.bullets, this.monsters, targets, [], this.bosses);
        this.collisionSystem.checkMonsterPlayerCollisions(this.monsters, targets[0], DT); // Tymczasowo dla 1 gracza
        
        // Obsługa bounce (kolejka nowych pocisków)
        const newBullets = [];
        for (const b of this.bullets) {
            if (b._spawnQueue) { newBullets.push(...b._spawnQueue); b._spawnQueue = null; }
        }
        this.bullets.push(...newBullets);

        // 5. Czyszczenie martwych
        this.monsters = this.monsters.filter(m => {
            if (m.hp <= 0) {
                if (m.state !== 'despawning' && !m.isDespawning) {
                    this.spawnSystem.spawnXpOrbs(m, this.xpOrbs);
                    // Przyznaj XP zabójcy (m.lastHitBy)
                }
                return false;
            }
            return true;
        });
        this.bullets = this.bullets.filter(b => b.life > 0);

        // 6. Broadcast stanu
        this.broadcast({
            type: 'gameState',
            data: {
                gameTime: this.gameTime,
                players: targets.map(p => p.toJSON()),
                monsters: this.monsters.map(m => m.toJSON()),
                bullets: this.bullets.map(b => b.toJSON()),
                xpOrbs: this.xpOrbs.map(o => o.toJSON())
            }
        });
    }

    broadcast(message, excludePlayerId = null) {
        const dataStr = JSON.stringify(message);
        for (const [pId, ws] of this.clients.entries()) {
            if (pId !== excludePlayerId && ws.readyState === 1) { // 1 = OPEN
                ws.send(dataStr);
            }
        }
    }
}