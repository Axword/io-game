import { CLASSES } from '../config/classes.js';
import { WEAPONS } from '../config/weapons.js';

export class MenuScreen {
    constructor(onClassSelect) {
        this.screen = document.getElementById('s-menu');
        this.grid = document.getElementById('cls-grid');
        this.permDisp = document.getElementById('perm-disp');
        this.onClassSelect = onClassSelect;
        this.selectedClass = null;
    }
    
    show(permStats) {
        this.grid.innerHTML = '';
        
        for (const [id, cd] of Object.entries(CLASSES)) {
            const el = document.createElement('div');
            el.className = 'cls-card';
            el.innerHTML = `
                <div class="cls-emoji">${cd.emoji}</div>
                <div class="cls-name">${cd.name}</div>
                <div class="cls-desc">${cd.desc}</div>
                <div class="cls-stats">HP:${cd.hp}  SPD:${cd.spd}  ${WEAPONS[cd.weapon].name}</div>
            `;
            el.addEventListener('click', () => {
                this.selectedClass = id;
                this.onClassSelect(id);
            });
            this.grid.appendChild(el);
        }
        
        this.permDisp.textContent = 
            `Permanentne: Szczęście +${permStats.luck}%  Prędkość +${permStats.speed}%  HP +${permStats.hp}`;
        
        this.screen.style.display = 'flex';
    }
    
    hide() {
        this.screen.style.display = 'none';
    }
}