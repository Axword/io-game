import { SERVER_CONFIG } from './config.js';
import { gameCache } from './gameCache.js';

class GameLoop {
    constructor() {
        this.time = 0;
        this.running = false;
        this.timer = null;
        this.lastTick = 0;
        this.accumulator = 0;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.lastTick = performance.now();
        this.timer = setInterval(() => this.tick(), SERVER_CONFIG.TICK_MS);
        console.log('[GameLoop] Started at', SERVER_CONFIG.TICK_RATE, 'TPS');
    }

    stop() {
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    tick() {
        const now = performance.now();
        const dt = Math.min((now - this.lastTick) / 1000, 0.1);
        this.lastTick = now;
        this.time += dt;

        const rooms = gameCache.getAllRooms();
        for (const room of rooms) {
            if ((room.state === 'playing' || room.state === 'lobby') && room.hasConnectedPlayers()) {
                room.update(dt);
            }
        }

        // Cleanup old empty rooms every ~10 seconds
        if (Math.floor(this.time / 10) > Math.floor((this.time - dt) / 10)) {
            gameCache.cleanupOldRooms(SERVER_CONFIG.RECONNECT_TIMEOUT_MS);
        }
    }
}

export const gameLoop = new GameLoop();
// Start immediately; rooms will be updated when created
gameLoop.start();
