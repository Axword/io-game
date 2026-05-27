// server/server.js
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { cache } from './gameCache.js';
import { GameRoom } from './gameRoom.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const rooms = new Map(); // roomId -> GameRoom instance

app.get('/', (req, res) => res.send('Vampire Survivors Server is running!'));
app.get('/rooms', (req, res) => res.json(cache.getAllRooms()));

wss.on('connection', (ws) => {
    let currentRoomId = null;
    let currentPlayerId = null;

    console.log('[WS] New connection');

    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            switch (msg.type) {
                case 'quick_join': {
                    let targetRoom = Array.from(rooms.values()).find(r => r.players.size < 8);
                    if (!targetRoom) {
                        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                        const roomData = cache.createRoom(roomId, 'medium');
                        targetRoom = new GameRoom(roomData);
                        rooms.set(roomId, targetRoom);
                    }
                    msg.type = 'join_room';
                    msg.roomId = targetRoom.id;
                }
                case 'join_room': {
                    let roomId = msg.roomId || msg.code || 'ABC123'; // Obsługa 'code' z klienta
                    const playerClass = msg.class || 'warrior';
                    const playerName = msg.name || `Player_${Math.floor(Math.random() * 999)}`;
                    currentPlayerId = msg.playerId || uuidv4();
                    currentRoomId = roomId;

                    let roomData = cache.getRoom(roomId);
                    if (!roomData) {
                        roomData = cache.createRoom(roomId, msg.config?.difficulty || 'medium');
                    }

                    let gameRoom = rooms.get(roomId);
                    if (!gameRoom) {
                        gameRoom = new GameRoom(roomData);
                        rooms.set(roomId, gameRoom);
                    }

                    gameRoom.addPlayer(ws, currentPlayerId, playerName, playerClass);
                    
                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        roomId: roomId,
                        playerId: currentPlayerId,
                        players: Array.from(gameRoom.players.values()).map(p => p.toJSON())
                    }));
                    break;
                }

                case 'input': {
                    if (currentRoomId && currentPlayerId) {
                        const gameRoom = rooms.get(currentRoomId);
                        if (gameRoom) {
                            gameRoom.handleInput(currentPlayerId, msg.data);
                        }
                    }
                    break;
                }

                case 'leave_room': {
                    if (currentRoomId && currentPlayerId) {
                        const gameRoom = rooms.get(currentRoomId);
                        if (gameRoom) {
                            gameRoom.removePlayer(currentPlayerId);
                            if (gameRoom.players.size === 0) {
                                rooms.delete(currentRoomId);
                                cache.deleteRoom(currentRoomId);
                            }
                        }
                    }
                    break;
                }
            }
        } catch (e) {
            console.error('[WS] Message parsing error:', e);
        }
    });

    ws.on('close', () => {
        console.log(`[WS] Disconnected: ${currentPlayerId}`);
        if (currentRoomId && currentPlayerId) {
            const gameRoom = rooms.get(currentRoomId);
            if (gameRoom) {
                gameRoom.removePlayer(currentPlayerId);
                if (gameRoom.players.size === 0) {
                    rooms.delete(currentRoomId);
                    cache.deleteRoom(currentRoomId);
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});