import { Renderer } from './core/Renderer.js';
import { InputManager } from './core/InputManager.js';
import { Game } from './core/Game.js';
import { HUD } from './ui/HUD.js';
import { MenuScreen } from './ui/MenuScreen.js';
import { LobbyScreen } from './ui/LobbyScreen.js';
import { UpgradeScreen } from './ui/UpgradeScreen.js';
import { DeathScreen } from './ui/DeathScreen.js';
import { RoomMenuScreen } from './ui/RoomMenuScreen.js';
import { loadPermStats, savePermStats } from './utils/storage.js';
import { WebSocketClient } from './network/WebSocketClient.js';

class ArenaIO {
    constructor() {
        this.permStats = loadPermStats();
        this.isOnline = false;
        this.initSystems();
        this.initUI();
        this.init();
    }
    
    initSystems() {
        const canvas = document.getElementById('gc');
        this.renderer = new Renderer(canvas);
        this.inputManager = new InputManager();
        this.inputManager.setCamera(this.renderer.getCamera());
        this.inputManager.setCanvas(canvas);
    }
    
    initUI() {
        this.hud = new HUD();
        this.menuScreen = new MenuScreen((cls) => this.onClassSelect(cls));
        this.lobbyScreen = new LobbyScreen(
            (name) => this.onQuickJoin(name),
            (name, code) => this.onJoinWithCode(name, code),
            (name, config) => this.onCreateRoom(name, config)
        );
        this.upgradeScreen = new UpgradeScreen((card) => this.onUpgradeSelect(card));
        this.roomMenuScreen = new RoomMenuScreen(() => this.onLeaveRoom());
        this.deathScreen = new DeathScreen(
            () => this.onShowPermScreen(),
            () => this.onPlayAgain()
        );
        
        this.deathScreen.onRespawn = () => this.onRespawnInRoom();
        this.deathScreen.onLeaveRoom = () => this.onLeaveRoom();
        
        window.roomMenuScreen = this.roomMenuScreen;
    }
    
    async init() {
        await this.initNetwork();
        this.start();
    }
    
    async initNetwork() {
        this.wsClient = new WebSocketClient();
        try {
            await this.wsClient.connect('ws://localhost:3000');
            this.isOnline = true;
            console.log('[Network] Connected - multiplayer available');
        } catch (e) {
            this.isOnline = false;
            console.log('[Network] Offline - playing with bots');
        }
    }
    
    start() {
        this.game = new Game(this.renderer, this.inputManager, this.hud, this.permStats, this.wsClient);
        this.lobbyScreen.show(this.permStats);
        this.lastTime = 0;
        this.startLoop();
    }
    
    async onQuickJoin(playerName) {
        if (this.isOnline) {
            this.wsClient.send('quick_join', { name: playerName });
        } else {
            this.startOfflineGame(playerName);
        }
    }
    
    async onJoinWithCode(playerName, code) {
        if (this.isOnline) {
            this.wsClient.send('join_room', { name: playerName, code });
        } else {
            alert('Tryb online niedostępny');
            this.lobbyScreen.showLobby();
        }
    }
    
    async onCreateRoom(playerName, config) {
        if (this.isOnline) {
            this.wsClient.send('create_room', { name: playerName, config });
        } else {
            this.startOfflineGame(playerName, config);
        }
    }
    
    startOfflineGame(playerName, config = {}) {
        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
        this.currentPlayerName = playerName;
        this.currentConfig = config;
    }
    
    async onClassSelect(classId) {
        const mode = this.isOnline ? 'online' : 'offline';
        await this.game.start(classId, mode, this.currentPlayerName, this.currentConfig);
        this.menuScreen.hide();
    }
    
    onUpgradeSelect(card) {
        this.game.applyUpgrade(card);
        if (this.game.pendingUpgrades <= 0) {
            this.upgradeScreen.hide();
        } else {
            this.upgradeScreen.show(this.game.upgradeSystem.generateUpgradeCards(this.game.player));
        }
    }
    
    onShowPermScreen() {
        if (this.game.room && this.game.playerName) {
            const roomPermStats = this.game.room.getPermanentStats(this.game.playerName);
            this.deathScreen.showPermScreen(roomPermStats, (id, step) => {
                this.game.room.upgradePermanentStat(this.game.playerName, id, step);
            });
        } else {
            this.deathScreen.showPermScreen(this.permStats, (id, step) => {
                this.permStats[id] += step;
                savePermStats(this.permStats);
            });
        }
        this.deathScreen.onRespawn = () => this.onRespawnInRoom();
    }
    
    onPlayAgain() {
        this.deathScreen.hide();
        this.deathScreen.hidePermScreen();
        this.lobbyScreen.show(this.permStats);
    }
    
    onLeaveRoom() {
        this.game.leaveRoom();
        this.deathScreen.hide();
        this.roomMenuScreen.hide();
        this.lobbyScreen.show(this.permStats);
    }
    
    onRespawnInRoom() {
        this.deathScreen.hide();
        this.game.respawnPlayer();
    }
    
    startLoop() {
        const loop = (timestamp) => {
            requestAnimationFrame(loop);
            
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.lastTime = timestamp;
            
            if (this.game.state === 'playing' || this.game.state === 'upgrade') {
                const upgradeCards = this.game.update(dt);
                
                if (upgradeCards && this.game.state === 'upgrade') {
                    this.upgradeScreen.show(upgradeCards);
                }
            }
            
            if (this.game.state === 'dead') {
                const deathData = this.game.onPlayerDeath();
                this.deathScreen.show(deathData.level, deathData.kills, deathData.totalDmg, deathData.isInRoom);
                this.game.state = 'death_screen';
            }
            
            this.inputManager.resetClick();
            this.renderer.render();
        };
        
        requestAnimationFrame((ts) => {
            this.lastTime = ts;
            loop(ts);
        });
    }
}

new ArenaIO();