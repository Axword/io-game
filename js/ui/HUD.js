import { getZoneIdx } from '../utils/math.js';

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
        
        // HP bar
        const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
        this.hpFill.style.width = hpPct + '%';
        this.hpTxt.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
        
        // XP bar
        const xpPct = (player.xp / player.xpNeeded) * 100;
        this.xpFill.style.width = xpPct + '%';
        this.xpTxt.textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
        this.lvlTxt.textContent = `LVL ${player.level}`;
        
        // Strefa
        const zi = getZoneIdx(player.x, player.y, zones);
        this.zoneTxt.textContent = zones[zi].name;
        
        const centerDist = Math.hypot(player.x, player.y);
        if (centerDist < 800) {
            this.zoneTxt.style.color = '#ff0000';
            this.zoneTxt.style.borderColor = 'rgba(255, 0, 0, .6)';
            this.zoneTxt.style.background = 'rgba(255, 200, 200, .95)';
        } else if (centerDist < 1600) {
            this.zoneTxt.style.color = '#ff6600';
            this.zoneTxt.style.borderColor = 'rgba(255, 102, 0, .5)';
            this.zoneTxt.style.background = 'rgba(255, 235, 200, .95)';
        } else {
            this.zoneTxt.style.color = '#222';
            this.zoneTxt.style.borderColor = 'rgba(0, 0, 0, .15)';
            this.zoneTxt.style.background = 'rgba(255, 255, 255, .85)';
        }
        
        this.updateWeaponSlots(player);
        this.updateBookSlots(player);
    }

    updateWeaponSlots(player) {
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById('ws' + i);
            if (!el) continue;
            const w = player.weapons[i];
            
            if (w) {
                const wi = el.querySelector('.wi');
                const wn = el.querySelector('.wn');
                const WEAPONS = window.WEAPONS || {};
                if (WEAPONS[w.type]) {
                    if (wi) wi.textContent = WEAPONS[w.type].icon;
                    if (wn) wn.textContent = WEAPONS[w.type].name;
                    el.classList.add('active');
                }
            } else {
                const wi = el.querySelector('.wi');
                const wn = el.querySelector('.wn');
                if (wi) wi.textContent = '—';
                if (wn) wn.textContent = '';
                el.classList.remove('active');
            }
        }
    }

updateBookSlots(player) {
    if (!player.books) return;
    
    const BOOKS = window.BOOKS || {};
    
    for (let i = 0; i < 5; i++) {
        const el = document.getElementById('bs' + i);
        if (!el) continue;
        
        const book = player.books[i];
        
        if (book && BOOKS[book.type]) {
            const wi = el.querySelector('.wi');
            const wn = el.querySelector('.wn');
            const bookData = BOOKS[book.type];
            
            if (wi) wi.textContent = bookData.icon;
            if (wn) wn.textContent = bookData.name;
            
            // Pokaż poziom księgi
            const level = book.level || 1;
            if (level > 1) {
                el.setAttribute('data-level', level);
                el.classList.add('active');
            } else {
                el.setAttribute('data-level', '1');
                el.classList.remove('active');
            }
            
            // Tooltip z efektami księgi
            el.title = this.getBookTooltip(book, bookData, player);
            
        } else {
            const wi = el.querySelector('.wi');
            const wn = el.querySelector('.wn');
            if (wi) wi.textContent = '—';
            if (wn) wn.textContent = '';
            el.removeAttribute('data-level');
            el.classList.remove('active');
            el.title = '';
        }
    }
}
    getBookTooltip(book, bookData, player) {
        const level = book.level || 1;
        const stats = book.stats || {};
        
        let tooltip = `${bookData.name} (Poziom ${level})\n${bookData.desc}\n\n`;
        
        // Dodaj konkretne wartości statystyk
        if (bookData.type === 'vitality') {
            tooltip += `❤️ +${Math.round(stats.maxHp || 0)} Max HP`;
        } else if (bookData.type === 'armor') {
            tooltip += `🛡️ +${Math.round(stats.armor || 0)} Pancerz\n`;
            const reduction = Math.min(75, (stats.armor || 0) / 100 * 100);
            tooltip += `(-${reduction.toFixed(1)}% obrażeń)`;
        } else if (bookData.type === 'regeneration') {
            tooltip += `💚 +${(stats.regen || 0).toFixed(1)} HP/s`;
        } else if (bookData.type === 'speed') {
            tooltip += `💨 +${((stats.moveSpeed || 0) * 100).toFixed(0)}% Prędkości`;
        } else if (bookData.type === 'luck') {
            tooltip += `🍀 +${Math.round(stats.luck || 0)} Szczęście`;
        } else if (bookData.type === 'magnet') {
            tooltip += `🧲 +${Math.round(stats.magnetRange || 0)} Zasięg XP`;
        } else if (bookData.type === 'cooldown') {
            tooltip += `⏰ -${(stats.cooldownReduction || 0).toFixed(0)}% Cooldown`;
        } else if (bookData.type === 'area') {
            tooltip += `💫 +${(stats.areaBonus || 0).toFixed(0)}% Obszar`;
        } else if (bookData.type === 'critical') {
            tooltip += `🎯 +${(stats.critChance || 0).toFixed(0)}% Szansa na Kryt\n`;
            tooltip += `💥 +${Math.round(stats.critDamage || 0)}% Obrażenia Kryt`;
        } else if (bookData.type === 'revival') {
            tooltip += `👼 +${Math.round(stats.revives || 0)} Dodatkowe życia`;
        }
        
        return tooltip;
    }

    // ============================================================
    //  MINIMAPA
    // ============================================================
    updateMinimap(player, monsters, bots, safeRadius, bosses = []) {
        const ctx  = this.minimapCtx;
        const sz   = this.sz;
        const half = sz / 2;

        // Świat ma WORLD x WORLD jednostek, środek = (0,0)
        const WORLD    = 12000;
        const mapScale = sz / WORLD;

        // Konwersja: współrzędne świata → piksele minimappy
        // Świat: X rośnie w prawo, Y rośnie w górę
        // Canvas: X rośnie w prawo, Y rośnie w dół  →  odwracamy Y
        const toM = (wx, wy) => [
            (wx / WORLD) * sz + half,
            half - (wy / WORLD) * sz
        ];

        // ── tło ────────────────────────────────────────────────
        ctx.clearRect(0, 0, sz, sz);
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, sz, sz);

        // ── strefa niebezpieczeństwa (centrum) ─────────────────
        const dangerR = 1500 * mapScale;
        const dangerGrad = ctx.createRadialGradient(half, half, 0, half, half, dangerR);
        dangerGrad.addColorStop(0,   'rgba(200, 0, 0, 0.55)');
        dangerGrad.addColorStop(0.7, 'rgba(140, 0, 0, 0.25)');
        dangerGrad.addColorStop(1,   'rgba(100, 0, 0, 0.05)');
        ctx.fillStyle = dangerGrad;
        ctx.beginPath();
        ctx.arc(half, half, dangerR, 0, Math.PI * 2);
        ctx.fill();

        // ── obręcze stref ──────────────────────────────────────
        const ZONE_RINGS = [
            { r: 1500, col: 'rgba(255, 80,  80,  0.6)', lw: 1.2 },
            { r: 3000, col: 'rgba(200, 100, 50,  0.35)', lw: 0.8 },
            { r: 4500, col: 'rgba(150, 150, 50,  0.25)', lw: 0.8 },
            { r: 6000, col: 'rgba(80,  150, 80,  0.20)', lw: 0.8 },
        ];
        for (const z of ZONE_RINGS) {
            ctx.beginPath();
            ctx.arc(half, half, z.r * mapScale, 0, Math.PI * 2);
            ctx.strokeStyle = z.col;
            ctx.lineWidth   = z.lw;
            ctx.stroke();
        }

        // ── krzyżyk w centrum ──────────────────────────────────
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.lineWidth   = 0.8;
        const cs = 3;
        ctx.beginPath();
        ctx.moveTo(half - cs, half); ctx.lineTo(half + cs, half);
        ctx.moveTo(half, half - cs); ctx.lineTo(half, half + cs);
        ctx.stroke();

        // ── viewport gracza ────────────────────────────────────
        if (player) {
            const [px, py] = toM(player.x, player.y);
            const vw = 900 * mapScale;
            const vh = 900 * mapScale;

            ctx.fillStyle   = 'rgba(180, 220, 255, 0.07)';
            ctx.strokeStyle = 'rgba(120, 180, 255, 0.35)';
            ctx.lineWidth   = 0.8;
            ctx.fillRect  (px - vw / 2, py - vh / 2, vw, vh);
            ctx.strokeRect(px - vw / 2, py - vh / 2, vw, vh);
        }

        // ── potwory ────────────────────────────────────────────
        for (const m of monsters) {
            const [mx, my] = toM(m.x, m.y);
            if (mx < 0 || mx > sz || my < 0 || my > sz) continue;

            if (m.isElite) {
                // Elita – większa kropka z obwódką
                ctx.beginPath();
                ctx.arc(mx, my, 2.8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 140, 0, .9)';
                ctx.fill();
                ctx.strokeStyle = '#ff6600';
                ctx.lineWidth   = 0.6;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(200, 40, 40, .8)';
                ctx.fill();
            }
        }

        // ── bossy ──────────────────────────────────────────────
        const now   = Date.now();
        const pulse = 0.65 + Math.sin(now * 0.006) * 0.35;   // 0.30 – 1.00

        for (const boss of bosses) {
            const [bx, by] = toM(boss.x, boss.y);
            if (bx < 0 || bx > sz || by < 0 || by > sz) continue;

            // Pulsująca aura
            ctx.beginPath();
            ctx.arc(bx, by, 9 * pulse, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 0, 0, ${0.15 * pulse})`;
            ctx.fill();

            // Zewnętrzny krąg (żółty)
            ctx.beginPath();
            ctx.arc(bx, by, 6, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffd600';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Wypełnienie (czerwone)
            ctx.beginPath();
            ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#cc0000';
            ctx.fill();

            // Symbol czaszki
            ctx.save();
            ctx.font          = 'bold 7px Arial';
            ctx.textAlign     = 'center';
            ctx.textBaseline  = 'middle';
            ctx.fillStyle     = '#fff';
            ctx.strokeStyle   = '#000';
            ctx.lineWidth     = 1;
            ctx.strokeText('☠', bx, by);
            ctx.fillText  ('☠', bx, by);
            ctx.restore();
        }

        // ── boty / inni gracze ─────────────────────────────────
        // Boty są ukrytymi graczami – rysujemy ich jak prawdziwych graczy
        for (const bot of bots) {
            const [bx, by] = toM(bot.x, bot.y);
            if (bx < 0 || bx > sz || by < 0 || by > sz) continue;

            const cls    = bot.cls || 'default';
            const colors = this.CLASS_COLORS[cls] || this.CLASS_COLORS.default;

            // Tło (halo)
            ctx.beginPath();
            ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fill();

            // Kółko gracza
            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, Math.PI * 2);
            ctx.fillStyle   = colors.fill;
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth   = 1;
            ctx.fill();
            ctx.stroke();

            // Mały trójkąt kierunku (opcjonalny, jeśli bot ma rotation)
            // (pomijamy – nie zawsze mamy kąt)
        }

        // ── gracz (my) ─────────────────────────────────────────
        if (player) {
            const [px, py] = toM(player.x, player.y);

            // Pulsująca biała aura "jesteś tutaj"
            const playerPulse = 0.5 + Math.sin(now * 0.005) * 0.5;
            ctx.beginPath();
            ctx.arc(px, py, 6 + playerPulse * 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * playerPulse})`;
            ctx.fill();

            // Zewnętrzna biała obwódka
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            // Wypełnienie kolorem klasy
            const cls    = player.cls || 'default';
            const colors = this.CLASS_COLORS[cls] || this.CLASS_COLORS.default;
            ctx.beginPath();
            ctx.arc(px, py, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = colors.fill;
            ctx.fill();

            // Mała biała kropka w środku (marker "Ty")
            ctx.beginPath();
            ctx.arc(px, py, 1.2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }

        // ── ramka minimappy ────────────────────────────────────
        // Zaokrąglona ramka z gradientem
        ctx.strokeStyle = 'rgba(200, 200, 220, 0.55)';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(0.75, 0.75, sz - 1.5, sz - 1.5);

        // Subtelny wewnętrzny cień (efekt winiety)
        const vignette = ctx.createRadialGradient(half, half, half * 0.6, half, half, half * 1.1);
        vignette.addColorStop(0,   'rgba(0,0,0,0)');
        vignette.addColorStop(1,   'rgba(0,0,0,0.35)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, sz, sz);

        // Ramka jeszcze raz na wierzchu (po winiety)
        ctx.strokeStyle = 'rgba(140, 160, 200, 0.7)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(0.5, 0.5, sz - 1, sz - 1);

        // ── legenda ────────────────────────────────────────────
        this._drawLegend(ctx, sz, bosses.length > 0);
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