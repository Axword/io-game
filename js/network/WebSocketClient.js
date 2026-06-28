export class WebSocketClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.handlers = {};
        this.roomId = null;
        this.playerId = null;

        // Public callbacks for game integration
        this.onGameState = null;
        this.onPlayerKilled = null;
        this.onPlayerDead = null;
        this.onLevelUp = null;
        this.onUpgradeOptions = null;
        this.onMatchEnded = null;
        this.onRoomJoined = null;
        this.onPong = null;
        this.onPlayerJoined = null;
        this.onPlayerReconnected = null;
        this.onLeftRoom = null;
        this.onError = null;
        this.onPlayerRespawned = null;
    }

    async connect(url) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 3000);

            try {
                this.ws = new WebSocket(url);
                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    console.log('[WS] Connected to', url);
                    this.connected = true;
                    resolve();
                };
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {
                        console.error('[WS] Parse error:', e);
                    }
                };
                this.ws.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('[WS] Error:', error);
                    this.connected = false;
                    reject(error);
                };
                this.ws.onclose = () => {
                    console.log('[WS] Disconnected');
                    this.connected = false;
                    this.roomId = null;
                };
            } catch (e) {
                clearTimeout(timeout);
                console.error('[WS] Connection failed:', e);
                reject(e);
            }
        });
    }

    send(type, data) {
        if (!this.connected || !this.ws) {
            console.warn('[WS] Not connected, cannot send:', type);
            return;
        }
        try {
            this.ws.send(JSON.stringify({ type, ...data }));
        } catch (e) {
            console.error('[WS] Send error:', e);
        }
    }

    on(type, handler) {
        this.handlers[type] = handler;
    }

    once(type, handler) {
        const wrappedHandler = (data) => {
            handler(data);
            delete this.handlers[type];
        };
        this.handlers[type] = wrappedHandler;
    }

    handleMessage(data) {
        // Built-in event dispatch
        const callbackName = 'on' + data.type.charAt(0).toUpperCase() + data.type.slice(1);
        if (this[callbackName]) {
            try { this[callbackName](data); } catch (e) { console.error(e); }
        }

        const handler = this.handlers[data.type];
        if (handler) {
            handler(data);
        }
    }
    async joinRoom({
        name,
        playerClass,
        roomId = null,
        difficulty = 'medium',
        bots = true,
        quickJoin = false,
        create = false
    }) {
        if (!this.connected) return { online: false };

        this.send('joinRoom', {
            name,
            class: playerClass,
            roomId,
            difficulty,
            bots,
            quickJoin,
            create
        });

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.warn('[WS] Join room timeout - falling back to offline mode');
                resolve({ online: false });
            }, 3000);

            this.once('roomJoined', (data) => {
                clearTimeout(timeout);
                this.roomId = data.roomId;
                this.playerId = data.playerId;
                resolve({ online: true, ...data });
            });

            this.once('error', (data) => {
                clearTimeout(timeout);
                console.warn('[WS] Join room error:', data);
                resolve({
                    online: false,
                    error: data?.data?.message || 'Join room failed'
                });
            });
        });
    }
    sendInput(inputData) {
        if (!this.connected || !this.playerId) return;
        this.send('input', {
            playerId: this.playerId,
            data: inputData
        });
    }

    sendUpgradeSelect(upgradeKey) {
        if (!this.connected || !this.playerId) return;
        this.send('upgradeSelect', {
            playerId: this.playerId,
            data: { upgradeKey }
        });
    }

    sendPing(t) {
        this.send('ping', { t });
    }

    leaveRoom() {
        if (!this.connected || !this.playerId) return;
        this.send('leaveRoom', { playerId: this.playerId });
        this.roomId = null;
    }

    sendRespawn() {
        if (!this.connected || !this.playerId) return;

        this.send('respawn', {});
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.connected = false;
            this.roomId = null;
            this.playerId = null;
        }
    }
}
