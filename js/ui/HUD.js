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
    }
    
    update(player, zones) {
        if (!player) return;
        
        const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
        this.hpFill.style.width = hpPct + '%';
        this.hpTxt.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
        
        const xpPct = (player.xp / player.xpNeeded) * 100;
        this.xpFill.style.width = xpPct + '%';
        this.xpTxt.textContent = `${Math.floor(player.xp)} / ${player.xpNeeded}`;
        this.lvlTxt.textContent = `LVL ${player.level}`;
        
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
    }
    
    updateWeaponSlots(player) {
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById('ws' + i);
            const w = player.weapons[i];
            
            if (w) {
                const wi = el.querySelector('.wi');
                const wn = el.querySelector('.wn');
                const WEAPONS = window.WEAPONS || {};
                if (WEAPONS[w.type]) {
                    wi.textContent = WEAPONS[w.type].icon;
                    wn.textContent = WEAPONS[w.type].name;
                    el.classList.add('active');
                }
            } else {
                el.querySelector('.wi').textContent = '—';
                el.querySelector('.wn').textContent = '';
                el.classList.remove('active');
            }
        }
    }
    
    updateMinimap(player, monsters, bots, safeRadius) {
        const sz = 110;
        const half = sz / 2;
        const WORLD = 12000;
        const mapScale = sz / WORLD;
        
        this.minimapCtx.clearRect(0, 0, sz, sz);
        
        this.minimapCtx.fillStyle = '#f5f5f5';
        this.minimapCtx.fillRect(0, 0, sz, sz);
        
        const toM = (worldX, worldY) => {
            const screenX = (worldX / WORLD) * sz + half;
            const screenY = half - (worldY / WORLD) * sz;
            return [screenX, screenY];
        };
        
        this.minimapCtx.fillStyle = 'rgba(100, 0, 0, 0.3)';
        this.minimapCtx.beginPath();
        this.minimapCtx.arc(half, half, 1500 * mapScale, 0, Math.PI * 2);
        this.minimapCtx.fill();
        
        this.minimapCtx.strokeStyle = 'rgba(150, 0, 0, 0.5)';
        this.minimapCtx.lineWidth = 1;
        this.minimapCtx.beginPath();
        this.minimapCtx.arc(half, half, 1500 * mapScale, 0, Math.PI * 2);
        this.minimapCtx.stroke();
        
        const zones = [
            { r: 3000, col: 'rgba(80, 30, 30, 0.2)' },
            { r: 4500, col: 'rgba(60, 40, 40, 0.15)' },
            { r: 6000, col: 'rgba(100, 100, 100, 0.1)' }
        ];
        
        for (const zone of zones) {
            this.minimapCtx.strokeStyle = zone.col;
            this.minimapCtx.lineWidth = 1;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(half, half, zone.r * mapScale, 0, Math.PI * 2);
            this.minimapCtx.stroke();
        }
        
        this.minimapCtx.strokeStyle = '#333';
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.strokeRect(0, 0, sz, sz);
        
        if (player) {
            const viewportWidth = 900;
            const viewportHeight = 900;
            
            const [px, py] = toM(player.x, player.y);
            const vw = viewportWidth * mapScale;
            const vh = viewportHeight * mapScale;
            
            this.minimapCtx.fillStyle = 'rgba(100, 100, 100, 0.15)';
            this.minimapCtx.fillRect(
                px - vw / 2,
                py - vh / 2,
                vw,
                vh
            );
            
            this.minimapCtx.strokeStyle = 'rgba(80, 80, 80, 0.6)';
            this.minimapCtx.lineWidth = 1;
            this.minimapCtx.strokeRect(
                px - vw / 2,
                py - vh / 2,
                vw,
                vh
            );
        }
        
        for (const m of monsters) {
            const [mx, my] = toM(m.x, m.y);
            if (mx < 0 || mx > sz || my < 0 || my > sz) continue;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(mx, my, 1.5, 0, Math.PI * 2);
            this.minimapCtx.fillStyle = 'rgba(180, 30, 30, .85)';
            this.minimapCtx.fill();
        }
        
        for (const b of bots) {
            const [bx, by] = toM(b.x, b.y);
            if (bx < 0 || bx > sz || by < 0 || by > sz) continue;
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(bx, by, 2.5, 0, Math.PI * 2);
            this.minimapCtx.fillStyle = 'rgba(50, 180, 50, .9)';
            this.minimapCtx.fill();
            this.minimapCtx.strokeStyle = '#000';
            this.minimapCtx.lineWidth = 0.5;
            this.minimapCtx.stroke();
        }
        
        if (player) {
            const [px, py] = toM(player.x, player.y);
            this.minimapCtx.beginPath();
            this.minimapCtx.arc(px, py, 3.5, 0, Math.PI * 2);
            this.minimapCtx.fillStyle = '#2962ff';
            this.minimapCtx.fill();
            this.minimapCtx.strokeStyle = '#000';
            this.minimapCtx.lineWidth = 1;
            this.minimapCtx.stroke();
        }
    }
    
    addKillFeed(msg) {
        const el = document.createElement('div');
        el.className = 'km';
        el.textContent = '💀 ' + msg;
        this.killFeed.prepend(el);
        setTimeout(() => el.remove(), 3100);
    }
}