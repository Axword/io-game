import { RARITIES } from '../config/constants.js';
import { iconMarkup } from './Icons.js';
import { getItemRarity } from '../../shared/systems/items.js';
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export class UpgradeScreen {
    constructor(onUpgradeSelect) {
        this.screen = document.getElementById('s-upgrade');
        this.container = document.getElementById('up-cards');
        this.onUpgradeSelect = onUpgradeSelect;
        this.touchSelections = [];
        this.capturePointerDown = event => {
            // A real mouse press starts a separate gesture. Compatibility mouse
            // events following a touch do not emit a mouse pointerdown.
            if (event.pointerType === 'mouse') this.touchSelections.length = 0;
            else if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                const now = performance.now();
                this.touchSelections = this.touchSelections.filter(gesture => gesture.expires > now && gesture.pointerId !== event.pointerId);
            }
        };
        this.capturePointerEnd = event => {
            const now = performance.now();
            for (const gesture of this.touchSelections) if (gesture.pointerId === event.pointerId) {
                gesture.x = event.clientX;
                gesture.y = event.clientY;
                gesture.expires = now + 900;
                gesture.released = true;
            }
        };
        this.captureClick = event => {
            // Keyboard and assistive activation has no preceding pointer press.
            if (event.detail === 0) return;
            const now = performance.now();
            this.touchSelections = this.touchSelections.filter(gesture => gesture.expires > now);
            const explicitTouch = event.pointerType === 'touch' || event.pointerType === 'pen';
            if (event.pointerType === 'mouse' && !event.sourceCapabilities?.firesTouchEvents) return;
            const gesture = this.touchSelections.find(candidate =>
                explicitTouch && event.pointerId === candidate.pointerId ||
                (!event.pointerType || event.sourceCapabilities?.firesTouchEvents) && candidate.released &&
                Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) <= 32);
            if (!gesture) return;
            // Selection happens on pointerdown for the second thumb. Its later
            // click may target the replacement offer or the HUD underneath it.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (gesture.released) this.touchSelections.splice(this.touchSelections.indexOf(gesture), 1);
        };
        this.clearTouchSelections = () => { this.touchSelections.length = 0; };
        document.addEventListener('pointerdown', this.capturePointerDown, true);
        document.addEventListener('pointerup', this.capturePointerEnd, true);
        document.addEventListener('pointercancel', this.capturePointerEnd, true);
        document.addEventListener('click', this.captureClick, true);
        window.addEventListener('blur', this.clearTouchSelections);
    }
    show(cards = [], { mode = 'upgrade' } = {}) {
        const offer = {};
        this.activeOffer = offer;
        this.screen.classList.toggle('upgrade-nonmodal', mode === 'upgrade');
        this.screen.setAttribute('role', mode === 'upgrade' ? 'region' : 'dialog');
        this.screen.setAttribute('aria-label', mode === 'upgrade' ? 'Wybierz ulepszenie' : 'Skrzynka');
        this.screen.setAttribute('aria-modal', mode === 'upgrade' ? 'false' : 'true');
        this.container.replaceChildren();
        this.selectionPending = false;
        for (const [index, card] of cards.entries()) {
            const rarity = card.type === 'item' ? getItemRarity(card.itemRarity) : (RARITIES[card.rarId] || RARITIES[0]);
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'up-card';
            el.dataset.upgradeKey = card.upgradeKey || String(index);
            if (card.type === 'item') el.dataset.itemRarity = rarity.key;
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
            const select = () => {
                if (this.selectionPending || this.activeOffer !== offer) return;
                this.selectionPending = true;
                this.onUpgradeSelect(card);
            };
            // A second thumb must select a card while the first holds the stick.
            // Native click is retained for mouse and keyboard activation.
            el.addEventListener('pointerdown', event => {
                if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                    event.preventDefault();
                    const now = performance.now();
                    this.touchSelections = this.touchSelections.filter(gesture => gesture.expires > now && gesture.pointerId !== event.pointerId);
                    if (this.touchSelections.length >= 8) this.touchSelections.shift();
                    this.touchSelections.push({ pointerId: event.pointerId, x: event.clientX, y: event.clientY,
                        expires: Infinity, released: false });
                    select();
                }
            });
            el.addEventListener('click', select);
            this.container.appendChild(el);
        }
        this.screen.style.display = 'flex';
    }
    hide() { this.activeOffer = null; this.screen.style.display = 'none'; }
    destroy() {
        document.removeEventListener('pointerdown', this.capturePointerDown, true);
        document.removeEventListener('pointerup', this.capturePointerEnd, true);
        document.removeEventListener('pointercancel', this.capturePointerEnd, true);
        document.removeEventListener('click', this.captureClick, true);
        window.removeEventListener('blur', this.clearTouchSelections);
        this.clearTouchSelections();
        this.hide();
    }
}
