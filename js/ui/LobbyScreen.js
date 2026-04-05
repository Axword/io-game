export class LobbyScreen {
    constructor(onQuickJoin, onJoinCode, onCreateRoom) {
        this.screen = document.getElementById('s-lobby');
        this.roomConfigScreen = document.getElementById('s-room-config');
        this.joinCodeScreen = document.getElementById('s-join-code');
        this.waitingRoomScreen = document.getElementById('s-waiting-room');
        
        this.playerName = localStorage.getItem('arenaio_player_name') || '';
        
        this.onQuickJoin = onQuickJoin;
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
            const code = document.getElementById('room-code-input').value.toUpperCase();
            if (code.length === 6) {
                this.onJoinCode(this.playerName, code);
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
    
    show(permStats) {
        document.getElementById('perm-disp-lobby').textContent = 
            `Permanentne: Szczęście +${permStats.luck}%  Prędkość +${permStats.speed}%  HP +${permStats.hp}`;
        this.screen.style.display = 'flex';
    }
    
    hide() {
        this.screen.style.display = 'none';
    }
    
    showRoomConfig() {
        this.screen.style.display = 'none';
        this.roomConfigScreen.style.display = 'flex';
    }
    
    showJoinCodeScreen() {
        this.screen.style.display = 'none';
        this.joinCodeScreen.style.display = 'flex';
        document.getElementById('room-code-input').value = '';
        document.getElementById('room-code-input').focus();
    }
    
    showLobby() {
        this.screen.style.display = 'flex';
        this.roomConfigScreen.style.display = 'none';
        this.joinCodeScreen.style.display = 'none';
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