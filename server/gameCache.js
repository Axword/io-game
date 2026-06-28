export class GameCache {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
    }

    saveRoom(roomId, roomData) {
        this.rooms.set(roomId, roomData);
    }


    getRoom(roomId) {
        return this.rooms.get(roomId) || null;
    }

    deleteRoom(roomId) {
        const room = this.rooms.get(roomId);
        this.rooms.delete(roomId);
        if (room) {
            for (const player of room.players.values()) {
                if (player.ws) this.socketToRoom.delete(player.ws);
            }
        }
        return room;
    }

    getAllRooms() {
        return Array.from(this.rooms.values());
    }

    cleanupOldRooms(maxEmptyMs) {
        const now = Date.now();
        const toRemove = [];
        for (const [roomId, room] of this.rooms) {
            if (room.isEmpty() && room.emptySince > 0 && now - room.emptySince > maxEmptyMs) {
                toRemove.push(roomId);
            }
        }
        for (const roomId of toRemove) {
            this.deleteRoom(roomId);
        }
        return toRemove.length;
    }

    linkSocket(ws, roomId) {
        this.socketToRoom.set(ws, roomId);
    }

    unlinkSocket(ws) {
        this.socketToRoom.delete(ws);
    }
    findJoinableRoom(maxPlayers) {
        const rooms = this.getAllRooms();

        return rooms.find(room => {
            if (!room) return false;

            const isFull = room.players.size >= maxPlayers;
            const isEnded = room.state === 'ended';

            return !isFull && !isEnded;
        }) || null;
    }

    getRoomBySocket(ws) {
        const roomId = this.socketToRoom.get(ws);
        return roomId ? this.getRoom(roomId) : null;
    }
}

export const gameCache = new GameCache();
