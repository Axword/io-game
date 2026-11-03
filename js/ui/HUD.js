import { iconMarkup } from './Icons.js';
import { describeEquipment } from './EquipmentDescriptions.js';
import { EquipmentInfo } from './EquipmentInfo.js';
import { ITEMS, ITEM_RARITIES } from '../../shared/config/items.js';
import { getItemRarityCounts } from '../../shared/systems/items.js';
import { getWorld } from '../../shared/config/worlds.js';
import { getWorldZone, getWorldZones } from '../../shared/systems/worldRules.js';

export class HUD {
    constructor() {
        this.hpFill = document.getElementById('hp-fill');
        this.hpTxt = document.getElementById('hp-txt');
        this.xpFill = document.getElementById('xp-fill');
        this.xpTxt = document.getElementById('xp-txt');
        this.lvlTxt = document.getElementById('lvl-txt');
        this.zoneTxt = document.getElementById('zone-txt');
        this.killFeed = document.getElementById('kf');
        this.minimap = document.getElementById('minimap');
        this.minimapCtx = this.minimap.getContext('2d');

        // Nowe elementy statystyk
        this.statsContainer = document.createElement('div');
        this.statsContainer.id = 'player-stats';
        this.statsContainer.style.position = 'fixed';
        this.statsContainer.style.bottom = '160px';
        this.statsContainer.style.left = '20px';
        this.statsContainer.style.display = 'flex';
        this.statsContainer.style.flexDirection = 'column';
        this.statsContainer.style.gap = '4px';
        this.statsContainer.style.zIndex = '100';
        document.getElementById('ui').appendChild(this.statsContainer);


        this.weaponSlots = [0, 1, 2, 3].map(i => ({
            el: document.getElementById(`ws${i}`),
            icon: document.querySelector(`#ws${i} .wi`),
            name: document.querySelector(`#ws${i} .wn`)
        }));

        this.bookSlots = [0, 1, 2, 3, 4].map(i => ({
            el: document.getElementById(`bs${i}`),
            icon: document.querySelector(`#bs${i} .wi`),
            name: document.querySelector(`#bs${i} .wn`)
        }));
        this.equipmentInfo = new EquipmentInfo(anchor => this.describeSlot(anchor));
        // Rozmiar minimappy z HTML elementu
        this.sz = this.minimap.width || 110;
        
        // Cache kolorów klas graczy
        this.CLASS_COLORS = {
            warrior:   { fill: '#e53935', stroke: '#b71c1c' },
            archer:    { fill: '#43a047', stroke: '#1b5e20' },
            mage:      { fill: '#8e24aa', stroke: '#4a148c' },
            berserker: { fill: '#ff6f00', stroke: '#e65100' },
            default:   { fill: '#29b6f6', stroke: '#01579b' }
        };
    }

    update(player, zones) {
        if (!player) return;
        this.equipmentPlayer = player;
        const now = performance.now();
        if (now - (this._lastHudAt ?? -1000) < 90) return;
        this._lastHudAt = now;

        // HP bar
        const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
        this.hpFill.style.width = hpPct + '%';
        this.hpTxt.textContent = `${Math.ceil(player.hp)} / ${Math.ceil(player.maxHp)}`;

        // XP bar
        const xpPct = (player.xp / player.xpNeeded) * 100;
        this.xpFill.style.width = xpPct + '%';
        this.xpTxt.textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
        this.lvlTxt.textContent = `LVL ${player.level}`;

        // Strefa
        const world = getWorld(window.gameInstance?.worldId || 0);
        const zone = getWorldZone(player.x, player.y, world.id);
        const zoneCount = getWorldZones(world.id).length;
        const label = document.getElementById('world-label');
        const touch = document.body.classList?.contains?.('touch-input');
        const worldLabel = touch ? `STREFA ${zone.id}/${zoneCount} · ${world.name}` : world.name;
        if (label && label.textContent !== worldLabel) label.textContent = worldLabel;
        if (label) label.title = `${world.name} · STREFA ${zone.id}/${zoneCount} · ${zone.name}`;
        this.zoneTxt.style.display = 'block';
        this.zoneTxt.textContent = `STREFA ${zone.id}/${zoneCount} · ${zone.name}`;
        this.zoneTxt.dataset.zone = String(zone.id);
        this.zoneTxt.style.color = '#fff8ec';
        this.zoneTxt.style.borderColor = '#' + zone.borderColor.toString(16).padStart(6, '0');
        this.zoneTxt.style.background = '#3c3047';

        this.updateWeaponSlots(player);
        this.updateBookSlots(player);
        this.updatePlayerStats(player);
        this.updateItemSlots(player);
        this.updateRunTimer();
    }

    updateRunTimer() {
        const timer = document.getElementById('run-timer');
        const game = window.gameInstance;
        if (!timer || !game) return;
        const format = seconds => {
            const value = Math.max(0, Math.floor(seconds || 0));
            return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
        };
        const text = format(game.worldTime ?? game.gameTime) + (game.soloMode ? ' / ' + format(game.soloDuration || 480) : '');
        if (timer.textContent !== text) timer.textContent = text;
        const boss = game.bosses?.find(b => b.hp > 0);
        timer.classList.toggle('boss-active', !!boss);
        timer.title = boss?.bossData?.name || '';
    }

    updateWeaponSlots(player) {
        for (let i = 0; i < this.weaponSlots.length; i++) {
            const slot = this.weaponSlots[i];
            if (!slot.el || !slot.icon || !slot.name) continue;
            const weapon = player.weapons[i];
            const data = window.WEAPONS?.[weapon?.type];
            this.setSlotInfo(slot.el, 'weapon', weapon?.type, i, weapon, player);
            const key = data ? weapon.type + ':' + (weapon.evolved || '') : '';
            if (slot.key === key) continue;
            slot.key = key;
            slot.icon.innerHTML = data ? iconMarkup(weapon.type) : '—';
            slot.name.textContent = data ? data.name : '';
            slot.el.classList.toggle('active', !!data);
            slot.el.classList.toggle('evolved', !!weapon?.evolved);
        }
    }
    updateBookSlots(player) {
        const books = window.BOOKS || {};
        for (let i = 0; i < this.bookSlots.length; i++) {
            const slot = this.bookSlots[i];
            if (!slot.el || !slot.icon || !slot.name) continue;
            const book = player.books?.[i];
            const data = books[book?.type];
            this.setSlotInfo(slot.el, 'book', book?.type, i, book, player);
            const key = data ? book.type + ':' + (book.level || 1) : '';
            if (slot.key === key) continue;
            slot.key = key;
            slot.icon.innerHTML = data ? iconMarkup(book.type) : '—';
            slot.name.textContent = data ? data.name : '';
            slot.el.classList.toggle('active', !!data);
            if (data) {
                slot.el.dataset.level = book.level || 1;
            } else {
                slot.el.removeAttribute('data-level');
            }
        }
    }
    updateItemSlots(player) {
        const container = document.getElementById('item-slots');
        if (!container) return;
        const entries = Object.entries(player.items || {}).filter(([id,count]) => ITEMS[id] && count > 0);
        const key = JSON.stringify([entries, player.itemRarities || {}]);
        if (key === this._itemSlotsKey) return;
        this._itemSlotsKey = key;
        container.replaceChildren();
        for (const [id, count] of entries) {
            const item = ITEMS[id];
            const el = document.createElement('div');
            el.className = 'item-slot';
            const counts = getItemRarityCounts(player, id);
            const rarity = ITEM_RARITIES.findLast((tier, index) => counts[index] > 0) || ITEM_RARITIES[0];
            el.dataset.itemRarity = rarity.key;
            el.style.borderColor = rarity.border;
            el.style.background = rarity.bg;
            el.style.setProperty('--item-rarity-color', rarity.col);
            this.setSlotInfo(el, 'item', id, null, { stacks: count }, player);
            el.innerHTML = iconMarkup(item.icon) + '<span class="item-stack">' + count + '</span>';
            container.appendChild(el);
        }
    }

    setSlotInfo(element, kind, id, index, instance, player) {
        const data = id && describeEquipment(kind, id, instance, player);
        element.removeAttribute('title');
        if (!data) {
            for (const key of ['equipmentKind', 'equipmentId', 'equipmentIndex']) delete element.dataset[key];
            element.tabIndex = -1;
            for (const name of ['role', 'aria-label', 'aria-expanded', 'aria-describedby']) element.removeAttribute(name);
            return;
        }
        if (element.dataset.equipmentKind !== kind) element.dataset.equipmentKind = kind;
        if (element.dataset.equipmentId !== id) element.dataset.equipmentId = id;
        if (index !== null && element.dataset.equipmentIndex !== String(index)) element.dataset.equipmentIndex = index;
        if (element.tabIndex !== 0) element.tabIndex = 0;
        if (element.getAttribute('role') !== 'button') element.setAttribute('role', 'button');
        const label = [data.title, data.description, ...(data.details || [])].join('. ');
        if (element.getAttribute('aria-label') !== label) element.setAttribute('aria-label', label);
    }

    describeSlot(anchor) {
        const player = this.equipmentPlayer;
        if (!player) return null;
        const kind = anchor.dataset.equipmentKind;
        if (kind === 'item') {
            const id = anchor.dataset.equipmentId, stacks = player.items?.[id] || 0;
            return stacks > 0 ? describeEquipment(kind, id, { stacks }, player) : null;
        }
        const instance = (kind === 'weapon' ? player.weapons : player.books)?.[Number(anchor.dataset.equipmentIndex)];
        return instance ? describeEquipment(kind, instance.type, instance, player) : null;
    }

    showReward(data) { this.equipmentInfo.showReward(data); }
    updatePresentation(dt) { this.equipmentInfo.update(dt); }
    hideEquipmentInfo() { this.equipmentInfo.hide(); }
    clearEquipmentInfo() { this.equipmentInfo.clear(); this.equipmentPlayer = null; }

    getBookTooltip(book, bookData, player) {
        const data = describeEquipment('book', book.type, book, player);
        return data ? [data.title, data.description, ...data.details].join('\n') : '';
    }

    updatePlayerStats(player) {
        const now = performance.now();
        if (now - (this._lastStatsAt ?? -1000) < 300) return;
        this._lastStatsAt = now;
        this.statsContainer.innerHTML = '';

        // Podstawowe statystyki
        this.addStat('❤️', 'HP', `${Math.ceil(player.hp)} / ${player.maxHp}`);
        this.addStat('💨', 'Prędkość', `${Math.round(player.speed * 100)}%`);
        this.addStat('⚡', 'Szybkość Ataku', `${Math.round((1 / player.weapons[0]?.stats?.atkSpd || 1) * 100)}%`);

        // Statystyki krytyczne
        if (player.critChance > 0) {
            this.addStat('🎯', 'Szansa na Krytyk', `${Math.round(player.critChance)}%`);
            this.addStat('💥💥', 'Obrażenia Kryt', `${Math.round(player.critDamage)}%`);
        }

        // Statystyki z książek
        if (player.armor > 0) {
            const reduction = Math.min(75, Math.round(player.armor));
            this.addStat('🛡️', 'Redukcja Obrażeń', `-${reduction}%`);
        }

        if (player.regen > 0) {
            this.addStat('💚', 'Regeneracja', `+${player.regen}/s`);
        }

        if (player.cooldownReduction > 0) {
            this.addStat('⏰', 'Redukcja Cooldown', `-${Math.round(player.cooldownReduction)}%`);
        }

        if (player.areaBonus > 0) {
            this.addStat('💫', 'Bonus Obszaru', `+${Math.round(player.areaBonus)}%`);
        }

        if (player.damageBonus > 0) {
            this.addStat('💥', 'Bonus Obrażeń', `+${Math.round(player.damageBonus)}%`);
        }

        if (player.magnetRange > 100) {
            this.addStat('🧲', 'Zasięg XP', `+${Math.round(player.magnetRange - 100)}`);
        }
    }

    addStat(icon, name, value) {
        const statEl = document.createElement('div');
        statEl.style.display = 'flex';
        statEl.style.alignItems = 'center';
        statEl.style.gap = '6px';
        statEl.style.fontSize = '11px';
        statEl.style.color = 'white';
        statEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';
        statEl.style.fontFamily = "'Share Tech Mono', monospace";

        const iconEl = document.createElement('span');
        iconEl.innerHTML = iconMarkup(icon);
        iconEl.style.fontSize = '14px';

        const nameEl = document.createElement('span');
        nameEl.textContent = name;
        nameEl.style.flex = '1';

        const valueEl = document.createElement('span');
        valueEl.textContent = value;
        valueEl.style.fontWeight = 'bold';

        statEl.appendChild(iconEl);
        statEl.appendChild(nameEl);
        statEl.appendChild(valueEl);

        this.statsContainer.appendChild(statEl);
    }

    // ============================================================
    //  MINIMAPA
    // ============================================================
    updateMinimap(player, monsters, bots, safeRadius, bosses = []) {
        if (!player) return;
        const now = performance.now();
        if (now - (this._lastMapAt ?? -1000) < 120) return;
        this._lastMapAt = now;
        const world = getWorld(window.gameInstance?.worldId || 0);
        const ctx = this.minimapCtx, size = this.sz, half = size / 2;
        const scale = (size - 8) / (world.bounds * 2);
        const zones = getWorldZones(world.id);
        const mapPoint = (x, y) => [half + x * scale, half - y * scale];
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#' + zones[0].color.toString(16).padStart(6, '0');
        ctx.fillRect(0, 0, size, size);
        for (const zone of zones.slice(1)) {
            ctx.fillStyle = '#' + zone.color.toString(16).padStart(6, '0');
            ctx.beginPath(); ctx.arc(half, half, zone.maxR * scale, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#' + zone.borderColor.toString(16).padStart(6, '0');
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.strokeStyle = '#a6a1b8'; ctx.lineWidth = 1;
        ctx.strokeRect(4, 4, size - 8, size - 8);
        ctx.fillStyle = '#6f6a83';
        for (const obstacle of world.obstacles || []) {
            const [x, y] = mapPoint(obstacle.x, obstacle.y);
            ctx.beginPath(); ctx.arc(x, y, Math.max(1, obstacle.r * scale), 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = '#d8b4ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(half, half, 4, 0, Math.PI * 2); ctx.stroke();
        const dot = (entity, radius, color) => {
            const [x, y] = mapPoint(entity.x, entity.y);
            if (x < 4 || x > size - 4 || y < 4 || y > size - 4) return;
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
        };
        for (const monster of monsters) if (monster.hp > 0) dot(monster, monster.isElite ? 2 : 1.2, monster.isElite ? '#ffe64a' : '#c987ee');
        for (const boss of bosses) if (boss.hp > 0) dot(boss, 3.5, '#ff715a');
        for (const other of bots) if (other.hp > 0) dot(other, 2.5, '#74e0ef');
        dot(player, 3.5, '#ffffff');
        dot(player, 1.8, '#2aaefa');
    }
    // Mała legenda w rogu minimappy
    _drawLegend(ctx, sz, hasBoss) {
        const items = [
            { col: 'rgba(200,40,40,.8)',  label: 'Potwór'  },
            { col: '#29b6f6',             label: 'Gracz'   },
        ];
        if (hasBoss) {
            items.push({ col: '#cc0000', label: 'Boss ☠' });
        }

        ctx.save();
        ctx.font         = '5.5px Arial';
        ctx.textBaseline = 'middle';

        let y = sz - 5 - items.length * 7;

        for (const item of items) {
            // Tło tekstu
            ctx.fillStyle = 'rgba(0,0,0,0.45)';
            ctx.fillRect(3, y - 3, 38, 6.5);

            // Kółko koloru
            ctx.beginPath();
            ctx.arc(7, y + 0.5, 2, 0, Math.PI * 2);
            ctx.fillStyle = item.col;
            ctx.fill();

            // Tekst
            ctx.fillStyle = 'rgba(230,230,230,0.9)';
            ctx.fillText(item.label, 12, y + 0.5);

            y += 7;
        }
        ctx.restore();
    }

    addKillFeed(msg) {
        const el = document.createElement('div');
        el.className   = 'km';
        el.textContent = msg;
        this.killFeed.prepend(el);
        setTimeout(() => el.remove(), 3100);
    }
}
