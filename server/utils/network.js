export function send(ws, data) {
    if (ws && ws.readyState === 1) {
        try {
            ws.send(JSON.stringify(data));
        } catch (e) {
            console.error('[WS] Send failed:', e.message);
        }
    }
}

export function broadcastToRoom(room, data, exceptWs = null) {
    if (!room) return;
    const payload = JSON.stringify(data);
    for (const player of room.players.values()) {
        if (player.ws && player.ws !== exceptWs && player.ws.readyState === 1) {
            try {
                player.ws.send(payload);
            } catch (e) {
                // ignore failed send
            }
        }
    }
}
