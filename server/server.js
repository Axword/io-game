import express from 'express';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { SERVER_CONFIG } from './config.js';
import { gameCache } from './gameCache.js';
import { GameRoom } from './gameRoom.js';
import { gameLoop } from './gameLoop.js';
import { send, broadcastToRoom } from './utils/network.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = app.listen(SERVER_CONFIG.PORT, () => {
    console.log(`[Server] HTTP/WebSocket listening on port ${SERVER_CONFIG.PORT}`);
});

app.use(express.static(path.join(__dirname, '../')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: gameCache.getAllRooms().length }));

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    ws.id = uuidv4();
    ws.isAlive = true;
    ws.pingT = 0;
    console.log('[WS] Client connected:', ws.id, req.socket.remoteAddress);
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            handleMessage(ws, msg);
        } catch (e) {
            console.error('[WS] Invalid message:', e.message);
            send(ws, { type: 'error', data: { message: 'Invalid JSON' } });
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });

    ws.on('error', (err) => {
        console.error('[WS] Socket error:', err.message);
    });

    send(ws, { type: 'connected', data: { playerId: ws.id } });
});

const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.on('close', () => clearInterval(heartbeat));
function handleMessage(ws, msg) {
    const { type } = msg;
    const payload = msg.data ?? msg;

    console.log('[WS] message:', type, payload);

    switch (type) {
        case 'joinRoom':
            handleJoinRoom(ws, payload);
            break;

        case 'permUpgrade':
            handlePermUpgrade(ws, payload);
            break;

        case 'leaveRoom':
            handleLeaveRoom(ws);
            break;

        case 'input':
            handleInput(ws, payload);
            break;

        case 'upgradeSelect':
            handleUpgradeSelect(ws, payload);
            break;

        case 'respawn':
            handleRespawn(ws);
            break;

        case 'ping':
            send(ws, { type: 'pong', t: payload?.t, serverTime: gameLoop.time });
            break;

        default:
            send(ws, { type: 'error', data: { message: `Unknown type: ${type}` } });
    }
}
function handleJoinRoom(ws, data) {
    const name = data?.name || 'Player';
    const cls = data?.class || 'warrior';
    const difficulty = data?.difficulty || SERVER_CONFIG.DEFAULT_DIFFICULTY;
    const bots = data?.bots !== undefined ? !!data.bots : SERVER_CONFIG.DEFAULT_BOTS;

    const quickJoin = !!data?.quickJoin;
    const create = !!data?.create;

    let roomId = data?.roomId;
    let room = null;

    if (roomId) {
        roomId = String(roomId).trim().toUpperCase();
        room = gameCache.getRoom(roomId);

        if (!room && !create) {
            send(ws, {
                type: 'error',
                data: { message: 'Pokój o takim kodzie nie istnieje.' }
            });
            return;
        }
    }

    // QUICK JOIN: najpierw szukamy istniejącego pokoju
    if (!room && quickJoin) {
        room = gameCache.findJoinableRoom
            ? gameCache.findJoinableRoom(SERVER_CONFIG.MAX_PLAYERS_PER_ROOM)
            : null;

        if (room) {
            roomId = room.id;
            console.log(`[WS] Quick join found room: ${roomId}`);
        }
    }

    // CREATE ROOM: tylko gdy jawnie tworzymy albo quickJoin nie znalazł niczego
    if (!room) {
        if (!create && !quickJoin) {
            send(ws, {
                type: 'error',
                data: { message: 'Nie można utworzyć pokoju w tym trybie.' }
            });
            return;
        }

        roomId = roomId || generateRoomCode();
        room = new GameRoom(roomId, { difficulty, bots });
        gameCache.saveRoom(roomId, room);

        console.log(`[WS] Created new room: ${roomId}`);
    }

    if (room.players.size >= SERVER_CONFIG.MAX_PLAYERS_PER_ROOM) {
        send(ws, {
            type: 'error',
            data: { message: 'Room is full' }
        });
        return;
    }

    const player = room.addPlayer(ws, name, cls);
    gameCache.linkSocket(ws, room.id);

    send(ws, {
        type: 'roomJoined',
        roomId: room.id,
        playerId: player.id,
        state: room.state,
        data: {
            players: room.getPlayerList(),
            bots: room.getBotList(),
            difficulty: room.difficulty,
            gameTime: room.gameTime
        }
    });

    broadcastToRoom(room, {
        type: 'playerJoined',
        data: {
            playerId: player.id,
            name: player.name,
            class: player.cls
        }
    }, ws);

    if (room.players.size === 1 && room.state === 'lobby') {
        room.start();
    }
}

function handleLeaveRoom(ws) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;

    const player = room.getPlayerBySocket(ws);
    if (player) {
        room.removePlayer(player.id);
        gameCache.unlinkSocket(ws);
    }

    send(ws, { type: 'leftRoom' });
    room.isEmpty(); // mark emptySince if no players left
}

function handleInput(ws, data) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;
    const player = room.getPlayerBySocket(ws);
    if (!player || player.hp <= 0) return;

    room.queueInput(player.id, {
        keys: data?.keys || {},
        mouseX: data?.mouseX ?? 0,
        mouseY: data?.mouseY ?? 0,
        mouseClicked: !!data?.mouseClicked
    });
}

function handleUpgradeSelect(ws, data) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;
    const player = room.getPlayerBySocket(ws);
    if (!player) return;

    room.applyUpgradeChoice(player.id, data?.upgradeKey);
}

function handleDisconnect(ws) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;

    const player = room.getPlayerBySocket(ws);
    if (!player) return;

    room.onPlayerDisconnect(player.id);
    gameCache.unlinkSocket(ws);
    room.isEmpty(); // mark emptySince if no players left
}

function handlePermUpgrade(ws, data) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;

    const player = room.getPlayerBySocket(ws);
    if (!player) return;

    const id = data?.id;
    const step = data?.step;

    if (!id || typeof step !== 'number') {
        send(ws, {
            type: 'error',
            data: { message: 'Invalid perm upgrade' }
        });
        return;
    }

    const stats = room.upgradePermanentStat(player.id, id, step);

    send(ws, {
        type: 'permStatsUpdated',
        data: {
            permStats: stats
        }
    });
}

function handleRespawn(ws) {
    const room = gameCache.getRoomBySocket(ws);
    if (!room) return;

    const player = room.getPlayerBySocket(ws);
    if (!player) return;

    const respawnedPlayer = room.respawnPlayer(player.id);

    if (!respawnedPlayer) {
        send(ws, {
            type: 'error',
            data: { message: 'Respawn failed' }
        });
        return;
    }

    send(ws, {
        type: 'playerRespawned',
        data: room.serializePlayer
            ? room.serializePlayer(respawnedPlayer)
            : {
                id: respawnedPlayer.id,
                name: respawnedPlayer.name,
                class: respawnedPlayer.cls,

                x: respawnedPlayer.x,
                y: respawnedPlayer.y,

                hp: respawnedPlayer.hp,
                maxHp: respawnedPlayer.maxHp,

                level: respawnedPlayer.level,
                xp: respawnedPlayer.xp,
                xpNeeded: respawnedPlayer.xpNeeded,
                totalXp: respawnedPlayer.totalXp,

                killedMonsters: respawnedPlayer.killedMonsters || 0,
                totalDmg: respawnedPlayer.totalDmg || 0
            }
    });
}


function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

