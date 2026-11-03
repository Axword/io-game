import { RARITIES } from '../config/constants.js';
import { iconMarkup } from './Icons.js';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export class UpgradeScreen {
    constructor(onUpgradeSelect) {
        this.screen = document.getElementById('s-upgrade');
        this.container = document.getElementById('up-cards');
        this.onUpgradeSelect = onUpgradeSelect;
    }
    show(cards = []) {
        this.container.replaceChildren();
        this.selectionPending = false;
        for (const [index, card] of cards.entries()) {
            const rarity = RARITIES[card.rarId] || RARITIES[0];
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'up-card';
            el.dataset.upgradeKey = card.upgradeKey || String(index);
            el.style.background = rarity.bg;
            el.style.borderColor = rarity.border;
            el.style.animation = 'cardEnter .24s ease-out both';
            el.style.animationDelay = (index * .055) + 's';
            const icon = card.itemId || card.weaponType || card.bookType || card.upgradeId || card.icon;
            el.innerHTML = '<div class="up-icon">' + iconMarkup(icon) + '</div>' +
                '<div class="up-wname">' + escapeText(card.wname) + '</div>' +
                '<div class="up-name">' + escapeText(card.name) + '</div>' +
                '<div class="up-desc">' + escapeText(card.desc) + '</div>' +
                (card.val ? '<div class="up-val" style="color:' + rarity.col + '">' + escapeText(card.val) + '</div>' : '') +
                '<span class="up-rar" style="color:' + rarity.col + ';border-color:' + rarity.border + '">' + rarity.name + '</span>';
            el.addEventListener('click', () => {
                if (this.selectionPending) return;
                this.selectionPending = true;
                this.onUpgradeSelect(card);
            });
            this.container.appendChild(el);
        }
        this.screen.style.display = 'flex';
    }
    hide() { this.screen.style.display = 'none'; }
}
