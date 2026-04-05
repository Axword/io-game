import { RARITIES } from '../config/constants.js';

export class UpgradeScreen {
    constructor(onUpgradeSelect) {
        this.screen = document.getElementById('s-upgrade');
        this.container = document.getElementById('up-cards');
        this.onUpgradeSelect = onUpgradeSelect;
    }
    
    show(cards) {
        this.container.innerHTML = '';
        
        for (const c of cards) {
            const rar = RARITIES[c.rarId];
            const el = document.createElement('div');
            el.className = 'up-card';
            el.style.background = rar.bg;
            el.style.borderColor = rar.border;
            el.innerHTML = `
                <div class="up-icon">${c.icon}</div>
                <div class="up-wname">${c.wname}</div>
                <div class="up-name">${c.name}</div>
                <div class="up-desc">${c.desc}</div>
                ${c.val ? `<div class="up-val" style="color:${rar.col}">${c.val}</div>` : ''}
                <span class="up-rar" style="color:${rar.col};border-color:${rar.border}">${rar.name}</span>
            `;
            el.addEventListener('click', () => this.onUpgradeSelect(c));
            this.container.appendChild(el);
        }
        
        this.screen.style.display = 'flex';
    }
    
    hide() {
        this.screen.style.display = 'none';
    }
}