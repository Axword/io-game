export class WebSocketClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.handlers = {};
        this.roomId = null;
        this.playerId = null;
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
    
    handleMessage(data) {
        const handler = this.handlers[data.type];
        if (handler) {
            handler(data);
        } else {
            console.warn('[WS] No handler for message type:', data.type);
        }
    }
    
    async createOrJoinRoom(playerClass) {
        if (this.connected) {
            this.send('join_room', { class: playerClass });
            return new Promise((resolve) => {
                this.once('room_joined', (data) => {
                    this.roomId = data.roomId;
                    this.playerId = data.playerId;
                    resolve({ online: true, roomId: data.roomId, players: data.players });
                });
            });
        } else {
            return { online: false };
        }
    }
    
    once(type, handler) {
        const wrappedHandler = (data) => {
            handler(data);
            delete this.handlers[type];
        };
        this.handlers[type] = wrappedHandler;
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