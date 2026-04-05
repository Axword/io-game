import { PERM_DEFS } from '../config/constants.js';

export class DeathScreen {
    constructor(onPermScreen, onPlayAgain) {
        this.screen = document.getElementById('s-death');
        this.permScreen = document.getElementById('s-perm');
        this.deathStats = document.getElementById('death-stats');
        this.permCards = document.getElementById('perm-cards');
        this.permPts = document.getElementById('perm-pts');
        
        this.btnPerm = document.getElementById('btn-perm');
        this.btnAgain = document.getElementById('btn-again');
        
        this.onPlayAgainCallback = onPlayAgain;
        this.btnPerm.addEventListener('click', onPermScreen);
        
        this.pendingPermPts = 0;
        this.isInRoom = false;
        this.onRespawn = null;
        this.onLeaveRoom = null;
    }
    
    show(level, kills, totalDmg, isInRoom = false) {
        this.isInRoom = isInRoom;
        this.pendingPermPts = Math.floor(level / 3) + 1;
        this.deathStats.innerHTML = `
            POZIOM: ${level}<br>
            ZABICI WROGOWIE: ${kills}<br>
            CAŁKOWITE OBRAŻENIA: ${Math.floor(totalDmg)}
        `;
        this.screen.style.display = 'flex';
        this.permScreen.style.display = 'none';
        
        this.updateButtonsForRoom(isInRoom);
    }
    
    updateButtonsForRoom(isInRoom) {
        this.btnPerm.style.display = 'block';
        
        if (!this.respawnBtn) {
            this.respawnBtn = document.createElement('button');
            this.respawnBtn.className = 'btn btn-success';
            this.respawnBtn.textContent = 'WZNOWIĆ GRĘ';
            this.respawnBtn.addEventListener('click', () => {
                if (this.onRespawn) this.onRespawn();
            });
            document.querySelector('#death-btn-group').appendChild(this.respawnBtn);
        }
        this.respawnBtn.style.display = 'block';
        
        if (!this.leaveBtn) {
            this.leaveBtn = document.createElement('button');
            this.leaveBtn.className = 'btn btn-danger';
            this.leaveBtn.textContent = '← WYJDŹ Z POKOJU';
            this.leaveBtn.addEventListener('click', () => {
                if (this.onLeaveRoom) this.onLeaveRoom();
            });
            document.querySelector('#death-btn-group').appendChild(this.leaveBtn);
        }
        this.leaveBtn.style.display = 'block';
    }
    
    hide() {
        this.screen.style.display = 'none';
    }
    
    showPermScreen(permStats, onPermUpgrade) {
        this.screen.style.display = 'none';
        this.permScreen.style.display = 'flex';
        this.buildPermCards(permStats, onPermUpgrade);
        this.updatePermScreenButtons();
    }
    
    hidePermScreen() {
        this.permScreen.style.display = 'none';
    }
    
    updatePermScreenButtons() {
        // Usuń stary przycisk
        const oldBtn = document.querySelector('#s-perm .perm-btn-continue');
        if (oldBtn) oldBtn.remove();
        
        let newBtn = document.createElement('button');
        newBtn.className = 'btn btn-success';
        newBtn.textContent = 'WZNOWIĆ GRĘ';
        newBtn.classList.add('perm-btn-continue');
        this.permScreen.appendChild(newBtn);
        
        newBtn.addEventListener('click', () => {
            if (this.onRespawn) this.onRespawn();
        });
    }
    
    buildPermCards(permStats, onPermUpgrade) {
        this.permCards.innerHTML = '';
        this.permPts.textContent = `Dostępne punkty: ${this.pendingPermPts}`;
        
        if (this.pendingPermPts <= 0) {
            this.permCards.innerHTML = 
                '<div style="color:#666;font-size:13px;font-family:\'Share Tech Mono\'">Brak punktów do wydania.</div>';
            return;
        }
        
        for (const pd of PERM_DEFS) {
            const cur = permStats[pd.id];
            const el = document.createElement('div');
            el.className = 'perm-card';
            el.innerHTML = `
                <div class="perm-icon">${pd.icon}</div>
                <div class="perm-name">${pd.name}</div>
                <div class="perm-val">${pd.desc}</div>
                <div class="perm-curr">Aktualnie: ${cur}${pd.unit} → ${cur + pd.step}${pd.unit}</div>
            `;
            el.addEventListener('click', () => {
                if (this.pendingPermPts <= 0) return;
                onPermUpgrade(pd.id, pd.step);
                this.pendingPermPts--;
                this.buildPermCards(permStats, onPermUpgrade);
            });
            this.permCards.appendChild(el);
        }
    }
}