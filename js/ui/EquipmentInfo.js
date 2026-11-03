import { iconMarkup } from './Icons.js';
import { getItemRarity } from '../../shared/systems/items.js';

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const slotSelector = '[data-equipment-kind]';

export class EquipmentInfo {
    constructor(resolve) {
        this.resolve = resolve;
        this.anchor = null;
        this.pinned = false;
        this.rewardQueue = [];
        this.rewardRemaining = 0;
        this.refreshElapsed = 0;
        this.layer = document.createElement('div');
        this.layer.id = 'equipment-info-layer';
        document.body.appendChild(this.layer);
        this.tooltip = this.createCard('equipment-tooltip', 'tooltip');
        this.reward = this.createCard('equipment-reward', 'status');
        this.reward.setAttribute('aria-live', 'polite');
        this.reward.setAttribute('aria-atomic', 'true');
        this.onOver = event => {
            if (event.pointerType === 'touch' || event.pointerType === 'pen' || this.pinned) return;
            const anchor = event.target.closest?.(slotSelector);
            if (anchor) this.show(anchor);
        };
        this.onOut = event => {
            if (!this.pinned && this.anchor?.contains(event.target) && !this.anchor.contains(event.relatedTarget)) this.hide();
        };
        this.onFocus = event => {
            const anchor = event.target.closest?.(slotSelector);
            if (anchor) this.show(anchor);
        };
        this.onBlur = event => {
            if (!this.pinned && this.anchor?.contains(event.target) && !this.anchor.contains(event.relatedTarget)) this.hide();
        };
        this.onDown = event => {
            const anchor = event.target.closest?.(slotSelector);
            if (anchor && (event.pointerType === 'touch' || event.pointerType === 'pen')) {
                event.preventDefault();
                if (this.anchor === anchor && this.pinned) this.hide();
                else this.show(anchor, true);
            } else if (!anchor && !this.tooltip.contains(event.target)) this.hide();
        };
        this.onKey = event => {
            if (event.code === 'Escape' && this.anchor) {
                event.preventDefault(); event.stopPropagation(); this.hide(); return;
            }
            const anchor = event.target.closest?.(slotSelector);
            if (anchor && ['Enter', 'Space'].includes(event.code)) {
                event.preventDefault();
                if (this.anchor === anchor && this.pinned) this.hide();
                else this.show(anchor, true);
            }
        };
        this.onRelease = () => { this.hide(); this.reward.hidden = true; };
        for (const [type, listener] of [['pointerover', this.onOver], ['pointerout', this.onOut], ['focusin', this.onFocus],
            ['focusout', this.onBlur], ['pointerdown', this.onDown], ['keydown', this.onKey]]) document.addEventListener(type, listener);
        window.addEventListener('resize', this.onRelease);
        window.addEventListener('blur', this.onRelease);
        document.addEventListener('visibilitychange', this.onRelease);
    }

    createCard(id, role) {
        const card = document.createElement('div');
        card.id = id; card.className = 'equipment-info'; card.hidden = true;
        card.setAttribute('role', role);
        const heading = document.createElement('div'); heading.className = 'equipment-info-heading';
        const icon = document.createElement('span'); icon.className = 'equipment-info-icon';
        const title = document.createElement('strong'); title.className = 'equipment-info-title';
        const description = document.createElement('p'); description.className = 'equipment-info-description';
        const details = document.createElement('ul'); details.className = 'equipment-info-details';
        heading.append(icon, title); card.append(heading, description, details);
        card.parts = { icon, title, description, details };
        this.layer.appendChild(card);
        return card;
    }

    render(card, data) {
        const key = JSON.stringify(data);
        if (card.contentKey === key) return false;
        card.contentKey = key;
        if (data.rarity) {
            const rarity = getItemRarity(data.rarity);
            card.dataset.itemRarity = rarity.key;
            card.style.borderColor = rarity.border;
            card.style.background = rarity.bg;
        } else {
            delete card.dataset.itemRarity;
            card.style.removeProperty('border-color');
            card.style.removeProperty('background');
        }
        card.parts.icon.innerHTML = iconMarkup(data.icon);
        card.parts.title.textContent = data.title;
        card.parts.description.textContent = data.description;
        card.parts.details.replaceChildren();
        for (const detail of data.details || []) {
            const line = document.createElement('li'); line.textContent = detail; card.parts.details.appendChild(line);
        }
        card.parts.details.hidden = !data.details?.length;
        return true;
    }

    isAllowed() {
        const game = window.gameInstance;
        return !document.hidden && game?.player?.hp > 0 && ['playing', 'upgrade'].includes(game.state) &&
            !document.querySelector('.screen:not(.upgrade-nonmodal):not([style*="none"])');
    }

    show(anchor, pinned = false) {
        if (!this.isAllowed()) return;
        const data = this.resolve(anchor);
        if (!data) return;
        if (this.anchor !== anchor) this.hide();
        this.anchor = anchor; this.pinned = pinned;
        anchor.setAttribute('aria-describedby', this.tooltip.id);
        anchor.setAttribute('aria-expanded', 'true');
        this.render(this.tooltip, data);
        this.tooltip.hidden = false; this.reward.hidden = true;
        this.place(this.tooltip, anchor.getBoundingClientRect());
    }

    hide() {
        this.anchor?.removeAttribute('aria-describedby');
        this.anchor?.setAttribute('aria-expanded', 'false');
        this.anchor = null; this.pinned = false;
        this.tooltip.hidden = true;
    }

    place(card, anchor = null) {
        const area = this.layer.getBoundingClientRect(), width = card.offsetWidth, height = card.offsetHeight;
        const margin = area.left;
        const maxX = Math.max(area.left, area.right - width);
        const maxY = Math.max(area.top, area.bottom - height);
        const touch = document.body.classList.contains('touch-input');
        const centered = (innerWidth - width) / 2;
        const positions = anchor ? [
            [anchor.left, anchor.top - height - 10], [anchor.left, anchor.bottom + 10],
            [anchor.right + 10, anchor.top], [anchor.left - width - 10, anchor.top]
        ] : [];
        positions.push([centered, 76], [centered, 64], [centered, innerHeight - height - (touch ? 170 : 180)],
            [innerWidth - width - margin, Math.max(76, (innerHeight - height) / 2)], [margin, Math.max(76, (innerHeight - height) / 2)]);
        const avoids = [{ rect: { left: innerWidth / 2 - 30, right: innerWidth / 2 + 30,
            top: innerHeight / 2 - 30, bottom: innerHeight / 2 + 30 }, weight: 8 }];
        for (const selector of ['#hp-wrap', '#xp-wrap', '#touch-stick', '#touch-menu', '#touch-portal', '.up-card']) {
            for (const element of document.querySelectorAll(selector)) {
                if (element.hidden || !element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
                avoids.push({ rect: element.getBoundingClientRect(), weight: selector === '.up-card' ? 8 : 12 });
            }
        }
        if (anchor) avoids.push({ rect: anchor, weight: 10 });
        let best, bestScore = Infinity;
        for (const [rawX, rawY] of positions) {
            const x = Math.max(area.left, Math.min(maxX, rawX));
            const y = Math.max(area.top, Math.min(maxY, rawY));
            const box = { left: x, top: y, right: x + width, bottom: y + height };
            const score = avoids.reduce((sum, avoid) => sum + overlap(box, avoid.rect) * avoid.weight, 0);
            if (score < bestScore) { best = { x, y }; bestScore = score; }
        }
        card.style.left = Math.round(best.x - area.left) + 'px'; card.style.top = Math.round(best.y - area.top) + 'px';
    }

    showReward(data) {
        if (!data) return;
        if (this.rewardRemaining > 0) {
            if (this.rewardQueue.length >= 4) this.rewardQueue.shift();
            this.rewardQueue.push(data);
        } else this.startReward(data);
    }

    startReward(data) {
        this.rewardRemaining = 4.5;
        this.render(this.reward, data);
        if (this.isAllowed() && !this.anchor) { this.reward.hidden = false; this.place(this.reward); }
    }

    update(dt) {
        if (!this.anchor && this.rewardRemaining <= 0) return;
        if (!this.isAllowed()) { this.hide(); this.reward.hidden = true; return; }
        if (this.anchor) {
            if (!this.anchor.isConnected || getComputedStyle(this.anchor).visibility === 'hidden') this.hide();
            else {
                this.refreshElapsed += dt;
                if (this.refreshElapsed >= .1) {
                    this.refreshElapsed = 0;
                    const data = this.resolve(this.anchor);
                    if (!data) this.hide();
                    else if (this.render(this.tooltip, data)) this.place(this.tooltip, this.anchor.getBoundingClientRect());
                }
            }
        }
        const rewardWasHidden = this.reward.hidden;
        this.reward.hidden = !!this.anchor || this.rewardRemaining <= 0;
        if (!this.reward.hidden) {
            if (rewardWasHidden) this.place(this.reward);
            this.rewardRemaining -= Math.max(0, dt || 0);
            if (this.rewardRemaining <= 0) {
                this.reward.hidden = true;
                if (this.rewardQueue.length) this.startReward(this.rewardQueue.shift());
            }
        }
    }

    clear() { this.hide(); this.reward.hidden = true; this.rewardRemaining = 0; this.rewardQueue.length = 0; }

    destroy() {
        this.clear();
        for (const [type, listener] of [['pointerover', this.onOver], ['pointerout', this.onOut], ['focusin', this.onFocus],
            ['focusout', this.onBlur], ['pointerdown', this.onDown], ['keydown', this.onKey]]) document.removeEventListener(type, listener);
        window.removeEventListener('resize', this.onRelease); window.removeEventListener('blur', this.onRelease);
        document.removeEventListener('visibilitychange', this.onRelease);
        this.layer.remove();
    }
}
