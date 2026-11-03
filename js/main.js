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
        this.wsClient = new WebSocketClient();

        this.initSystems();
        this.initUI();
        window.arenaApp = this;
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
            (name, config) => this.onCreateRoom(name, config),
            (name) => this.onOfflinePlay(name)
        );
        this.upgradeScreen = new UpgradeScreen((card) => this.onUpgradeSelect(card));
        this.roomMenuScreen = new RoomMenuScreen(() => this.onLeaveRoom());
        this.roomMenuScreen.onVisibilityChange = visible => {
            if (this.game) this.game.paused = visible && !this.game.onlineMode;
            this.inputManager.releaseAll?.();
        };
        this.deathScreen = new DeathScreen(
            () => this.onShowPermScreen(),
            () => this.onPlayAgain()
        );
        
        this.deathScreen.onRespawn = () => this.onRespawnInRoom();
        this.deathScreen.onLeaveRoom = () => this.onLeaveRoom();
        
        window.roomMenuScreen = this.roomMenuScreen;
    }
    
    init() {
        this.start();
    }
    async initNetwork() {
        try {
            const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
            await this.wsClient.connect(window.ARENA_SERVER_URL || `${scheme}//${location.host}`);
            this.isOnline = true;

            console.log('[Network] Connected - multiplayer available');

            if (this.game) {
                this.game.wsClient = this.wsClient;
            }
        } catch (e) {
            this.isOnline = false;

            console.log('[Network] Offline - playing with bots');

            if (this.game) {
                this.game.wsClient = this.wsClient;
            }
        }
    } 
    start() {
        this.game = new Game(this.renderer, this.inputManager, this.hud, this.permStats, this.wsClient);
        this.lobbyScreen.show(this.permStats);
        this.lastTime = 0;
        this.startLoop();
    }
    
    async onQuickJoin(playerName) {
        this.forceOffline = false;
        this.currentPlayerName = playerName;

        this.currentConfig = {
            difficulty: 'medium',
            quickJoin: true,
            create: false,
            online: true,
        };

        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
    }
    onOfflinePlay(playerName) {
        console.log('[Offline] Starting offline game for player:', playerName);
        this.forceOffline = true;
        this.currentPlayerName = playerName;
        this.currentConfig = {
            difficulty: 'medium',
            offline: true,
            online: false,
            solo: true,
            bots: false
        };
        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
    }
    async onJoinWithCode(playerName, code) {
        this.forceOffline = false;
        this.currentPlayerName = playerName;

        this.currentConfig = {
            roomId: String(code || '').trim().toUpperCase(),
            quickJoin: false,
            create: false,
            online: true
        };
        console.log('[ArenaIO] Join with code:', {
            playerName,
            code,
            currentConfig: this.currentConfig
        });
        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
    }

    async onCreateRoom(playerName, config) {
        this.forceOffline = false;
        this.currentPlayerName = playerName;

        this.currentConfig = {
            ...config,
            create: true,
            quickJoin: false,
            online: true
        };

        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
    }
    
    startOfflineGame(playerName, config = {}) {
        this.lobbyScreen.hide();
        this.menuScreen.show(this.permStats);
        this.currentPlayerName = playerName;
        this.currentConfig = config;
    }
    async onClassSelect(classId) {
        if (this.startingGame) return;
        this.startingGame = true;
        try { await this.startSelectedClass(classId); }
        finally { this.startingGame = false; }
    }

    async startSelectedClass(classId) {
        const wantsOffline = this.forceOffline || this.currentConfig?.offline;

        const wantsOnline =
            !wantsOffline &&
            (
                this.currentConfig?.online ||
                this.currentConfig?.roomId ||
                this.currentConfig?.quickJoin ||
                this.currentConfig?.create
            );

        let mode = 'offline';

        if (wantsOnline) {
            const ok = await this.ensureNetwork();

            if (!ok) {
                alert('Nie udało się połączyć z serwerem.');
                return;
            }

            mode = 'online';
        } else if (!wantsOffline && this.isOnline) {
            mode = 'online';
        }

        console.log('[ArenaIO] Class selected:', {
            classId,
            mode,
            wantsOnline,
            wantsOffline,
            isOnline: this.isOnline,
            wsConnected: this.wsClient?.connected,
            currentConfig: this.currentConfig
        });

        try {
            await this.game.start(
                classId,
                mode,
                this.currentPlayerName,
                this.currentConfig
            );

            this.menuScreen.hide();
        } catch (e) {
            console.warn('[ArenaIO] Game start failed:', e);

            alert(e.message || 'Nie udało się dołączyć do pokoju.');

            // Posprzątaj niedokończoną grę
            if (this.game) {
                this.game.cleanup();
                this.game.state = 'menu';
            }

            this.menuScreen.hide();

            // Jeśli to było dołączanie kodem, wróć do wpisywania kodu
            if (this.currentConfig?.roomId) {
                this.lobbyScreen.show(this.permStats);
                this.lobbyScreen.showJoinCodeScreen(this.currentConfig.roomId);
            } else {
                this.lobbyScreen.show(this.permStats);
            }
        }
    }    
    onUpgradeSelect(card) {
        if (this.game.state === 'loot') {
            if (this.game.applyLoot(card)) this.upgradeScreen.hide();
            return;
        }
        this.game.applyUpgrade(card);
        if (this.game.pendingUpgrades <= 0) {
            this.upgradeScreen.hide();
        } else {
            if (this.game.upgradeCards) this.upgradeScreen.show(this.game.upgradeCards);
        }
    }
    onShowPermScreen() {
        if (this.game.onlineMode) {
            const onlinePermStats =
                this.game.serverPermStats ||
                this.game.deathData?.permStats ||
                this.permStats;

            this.deathScreen.showPermScreen(onlinePermStats, (id, step) => {
                onlinePermStats[id] = (onlinePermStats[id] || 0) + step;

                this.game.upgradePermanentStat(id, step);
            });

            this.deathScreen.onRespawn = () => this.onRespawnInRoom();
            return;
        }

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
        this.deathScreen.hidePermScreen();

        if (this.game.onlineMode) {
            this.game.requestRespawn();
        } else {
            this.game.respawnPlayer();
        }
    }

    async ensureNetwork() {
        if (this.wsClient?.connected) {
            this.isOnline = true;
            return true;
        }
        try {
            await this.initNetwork();
            return this.wsClient?.connected === true;
        } catch (e) {
            console.warn('[Network] ensureNetwork failed:', e);
            return false;
        }
    }

    startLoop() {
        const loop = (timestamp) => {
            requestAnimationFrame(loop);
            
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.lastTime = timestamp;
            if (this._inputState !== this.game.state) {
                this.inputManager.releaseAll?.();
                this._inputState = this.game.state;
            }
            const canControl = this.game.state === 'playing';
            if (this.inputManager.consumeAction?.('menu') && (canControl || this.roomMenuScreen.isVisible)) this.roomMenuScreen.toggle(this.game.room);
            // Online E travels through the input packet; the server handles its edge once.
            if (this.inputManager.consumeAction?.('portal') && canControl && !this.roomMenuScreen.isVisible && !this.game.onlineMode) this.game.travelWorld();
            const controlsVisible = canControl && !this.roomMenuScreen.isVisible;
            this.inputManager.touchControls?.setVisible(controlsVisible);
            const portal = this.game.getPortalState();
            this.inputManager.touchControls?.setPortalState(portal);
            const portalButton = document.getElementById('world-portal');
            if (portalButton) {
                portalButton.hidden = !controlsVisible || !portal.near;
                portalButton.disabled = portal.locked;
                const label = portal.locked ? `${portal.targetName} · LV ${portal.requiredLevel}` : `E · ${portal.targetName}`;
                if (portalButton.textContent !== label) portalButton.textContent = label;
                if (!portalButton.onclick) portalButton.onclick = () => this.game.travelWorld();
            }
            
            if (this.game.state === 'playing' || (this.game.onlineMode && this.game.state === 'upgrade')) {
                const upgradeCards = this.game.update(dt);
                if (upgradeCards && (this.game.state === 'upgrade' || this.game.state === 'loot')) {
                    document.querySelector('#s-upgrade .s-title').textContent = this.game.state === 'loot' ? 'SKRZYNKA' : 'POZIOM WYŻEJ';
                    this.upgradeScreen.show(upgradeCards);
                }
            }
            if (this.game.state === 'victory') {
                this.upgradeScreen.hide();
                this.deathScreen.show(this.game.player.level, this.game.player.killedMonsters, this.game.player.totalDmg, false);
                document.querySelector('#s-death .s-title').textContent = 'ZWYCIĘSTWO';
                this.deathScreen.deathStats.innerHTML += `<br>ŚWIATY: ${this.game.worldId + 1} / 3<br>BOSSOWIE: ${this.game.runStats.bossesDefeated}<br>SKRZYNKI: ${this.game.runStats.chestsOpened}`;
                this.game.state = 'victory_screen';
            }
            
            if (this.game.state === 'dead') {
                this.upgradeScreen.hide();
                document.querySelector('#s-death .s-title').textContent = 'ZGINĄŁEŚ';
                const deathData = this.game.onPlayerDeath();
                this.deathScreen.show(
                    deathData.level,
                    deathData.kills,
                    deathData.totalDmg,
                    deathData.isInRoom,
                    deathData.pendingPermPts
                );
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
