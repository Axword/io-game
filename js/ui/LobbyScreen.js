export class LobbyScreen {
    constructor(onQuickJoin, onJoinCode, onCreateRoom, onOffline) {
        this.screen = document.getElementById('s-lobby');
        this.roomConfigScreen = document.getElementById('s-room-config');
        this.joinCodeScreen = document.getElementById('s-join-code');
        this.waitingRoomScreen = document.getElementById('s-waiting-room');
        this.btnOffline = document.getElementById('btn-offline');
        this.playerName = localStorage.getItem('arenaio_player_name') || '';
        
        this.onQuickJoin = onQuickJoin;
        this.onOffline = onOffline;
        this.onJoinCode = onJoinCode;
        this.onCreateRoom = onCreateRoom;
        this.setupListeners();
    }
    
    setupListeners() {
        const nameInput = document.getElementById('player-name');
        nameInput.value = this.playerName;
        nameInput.addEventListener('input', (e) => {
            this.playerName = e.target.value.trim();
            localStorage.setItem('arenaio_player_name', this.playerName);
        });
        
        document.getElementById('btn-quick-join').addEventListener('click', () => {
            if (!this.validateName()) return;
            this.onQuickJoin(this.playerName);
        });
        
        document.getElementById('btn-join-code').addEventListener('click', () => {
            if (!this.validateName()) return;
            this.showJoinCodeScreen();
        });
        
        document.getElementById('btn-create-room').addEventListener('click', () => {
            if (!this.validateName()) return;
            this.showRoomConfig();
        });
        
        const maxPlayersSlider = document.getElementById('room-max-players');
        maxPlayersSlider.addEventListener('input', (e) => {
            document.getElementById('room-max-display').textContent = e.target.value;
        });
        
        document.getElementById('btn-config-back').addEventListener('click', () => {
            this.showLobby();
        });
        
        document.getElementById('btn-config-create').addEventListener('click', () => {
            this.createRoomWithConfig();
        });
        
        document.getElementById('btn-code-back').addEventListener('click', () => {
            this.showLobby();
        });
            
        document.getElementById('btn-code-join').addEventListener('click', () => {
            const codeInput = document.getElementById('room-code-input');

            const code = (codeInput?.value || '')
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');

            const name = this.getName();

            console.log('[Lobby] Join code clicked:', {
                name,
                code,
                codeLength: code.length,
                hasCallback: !!this.onJoinCode
            });

            if (!name || name.length < 2) {
                alert('Wprowadź nazwę gracza (min. 2 znaki)');
                return;
            }

            if (code.length !== 6) {
                alert('Kod pokoju musi mieć 6 znaków.');
                codeInput?.focus();
                return;
            }

            if (!this.onJoinCode) {
                console.warn('[Lobby] onJoinCode callback missing');
                return;
            }

            this.playerName = name;
            this.onJoinCode(name, code);
        });
        this.btnOffline?.addEventListener('click', () => {
            if (!this.validateName()) return;

            const name = this.getName();

            console.log('[Lobby] Offline clicked:', {
                name,
                hasCallback: !!this.onOffline
            });

            if (this.onOffline) {
                this.onOffline(name);
            } else {
                console.warn('[Lobby] onOffline callback missing');
            }
        });
        document.getElementById('room-code-input').addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }
    
    validateName() {
        if (!this.playerName || this.playerName.length < 2) {
            alert('Wprowadź nazwę gracza (min. 2 znaki)');
            return false;
        }
        return true;
    }
    getName() {
        return document.getElementById('player-name')?.value?.trim() || 'Gracz';
    }    
    show(permStats) {
        document.getElementById('perm-disp-lobby').textContent =
            `Permanentne: Szczęście +${permStats.luck}%  Prędkość +${permStats.speed}%  HP +${permStats.hp}`;

        if (this.roomConfigScreen) this.roomConfigScreen.style.display = 'none';
        if (this.joinCodeScreen) this.joinCodeScreen.style.display = 'none';
        if (this.waitingRoomScreen) this.waitingRoomScreen.style.display = 'none';

        this.screen.style.display = 'flex';
    }
    
    hide() {
        if (this.screen) this.screen.style.display = 'none';
        if (this.roomConfigScreen) this.roomConfigScreen.style.display = 'none';
        if (this.joinCodeScreen) this.joinCodeScreen.style.display = 'none';
        if (this.waitingRoomScreen) this.waitingRoomScreen.style.display = 'none';
    }
    
    showRoomConfig() {
        this.screen.style.display = 'none';
        this.roomConfigScreen.style.display = 'flex';
    }
    
    showJoinCodeScreen() {
        if (this.screen) this.screen.style.display = 'none';
        if (this.roomConfigScreen) this.roomConfigScreen.style.display = 'none';
        if (this.waitingRoomScreen) this.waitingRoomScreen.style.display = 'none';

        this.joinCodeScreen.style.display = 'flex';

        const input = document.getElementById('room-code-input');
        input.value = code || '';
        input.focus();
    }
    
    showLobby() {
        if (this.screen) this.screen.style.display = 'flex';
        if (this.roomConfigScreen) this.roomConfigScreen.style.display = 'none';
        if (this.joinCodeScreen) this.joinCodeScreen.style.display = 'none';
        if (this.waitingRoomScreen) this.waitingRoomScreen.style.display = 'none';
    }

    createRoomWithConfig() {
        const config = {
            maxPlayers: parseInt(document.getElementById('room-max-players').value),
            difficulty: document.getElementById('room-difficulty').value,
            friendlyFire: document.getElementById('room-friendly-fire').checked,
            privacy: document.getElementById('room-privacy').value
        };
        
        this.roomConfigScreen.style.display = 'none';
        this.onCreateRoom(this.playerName, config);
    }
    
    showWaitingRoom(roomCode, isHost) {
        this.screen.style.display = 'none';
        this.waitingRoomScreen.style.display = 'flex';
        document.getElementById('waiting-room-code').textContent = roomCode;
        
        const startBtn = document.getElementById('btn-start-game');
        startBtn.style.display = isHost ? 'block' : 'none';
    }
    
    updateWaitingRoom(players, maxPlayers) {
        const list = document.getElementById('waiting-players-list');
        list.innerHTML = '';
        
        players.forEach((p, idx) => {
            const item = document.createElement('div');
            item.className = 'player-item' + (idx === 0 ? ' host' : '');
            item.innerHTML = `
                <span class="player-name">${p.name}</span>
                <span class="player-status">${idx === 0 ? '👑 HOST' : p.ready ? '✓ Gotowy' : '⏳ Oczekuje'}</span>
            `;
            list.appendChild(item);
        });
        
        document.getElementById('waiting-count').textContent = `${players.length}/${maxPlayers}`;
    }
}