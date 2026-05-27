// server/gameCache.js
class GameCache {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(roomId, difficulty = 'medium') {
        const room = {
            id: roomId,
            difficulty,
            createdAt: Date.now(),
            gameTime: 0,
            state: 'playing',
            players: new Map(), // playerId -> ServerPlayer instance
        };
        this.rooms.set(roomId, room);
        return room;
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    getAllRooms() {
        return Array.from(this.rooms.values()).map(r => ({
            id: r.id,
            playersCount: r.players.size,
            gameTime: r.gameTime
        }));
    }
}

export const cache = new GameCache();