import { WEAPONS } from '../config/weapons.js';
import { Bullet } from '../entities/Bullet.js';
import { mkRing } from '../utils/geometry.js';
import { norm, rng } from '../utils/math.js';

export class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
    }
    
    getWeaponStat(weapon, stat) {
        const base = WEAPONS[weapon.type].stats[stat] ?? 0;
        const upg = weapon.upgrades[stat] ?? null;
        
        // Addytywne statystyki
        if (['pierce', 'chain', 'bBnc', 'bCnt', 'targets', 'count'].includes(stat)) {
            return Math.round(base + (upg ?? 0));
        }
        
        // Mnożnikowe statystyki
        return base * (upg ?? 1);
    }
    
    setupAura(entity) {
        const w = entity.weapons.find(w => w && w.type === 'aura');
        if (!w) return;
        
        const range = this.getWeaponStat(w, 'range');
        if (entity.auraRing) this.scene.remove(entity.auraRing);
        
        const ring = mkRing(range, 14, 0xffaa00, 0.4);
        ring.position.set(entity.x, entity.y, 2.5);
        this.scene.add(ring);
        entity.auraRing = ring;
        entity.auraMat = ring.material;
        entity.lastAuraRange = range;
    }
    
    updateAura(entity, dt, monsters, player) {
        const w = entity.weapons.find(w => w && w.type === 'aura');
        if (!w) return;
        
        w.timer = (w.timer || 0) - dt;
        const range = this.getWeaponStat(w, 'range');
        
        if (entity.auraRing) {
            entity.auraRing.position.set(entity.x, entity.y, 2.5);
            
            const diff = Math.abs((entity.lastAuraRange || 0) - range);
            if (diff > 15) {
                this.scene.remove(entity.auraRing);
                const ring = mkRing(range, 14, 0xffaa00, 0.4);
                ring.position.set(entity.x, entity.y, 2.5);
                this.scene.add(ring);
                entity.auraRing = ring;
                entity.lastAuraRange = range;
            }
        }
        
        if (w.timer <= 0) {
            const cooldown = WEAPONS.aura.cooldown / (this.getWeaponStat(w, 'atkSpd') || 1);
            w.timer = cooldown;
            const dmg = this.getWeaponStat(w, 'dmg');
            
            for (const m of monsters) {
                if (Math.hypot(m.x - entity.x, m.y - entity.y) <= range) {
                    m.takeDamage(dmg);
                    if (entity === player) player.totalDmg += dmg;
                }
            }
        }
    }
    
    findNearestTarget(x, y, monsters, range = 9999) {
        let best = null, bd = range;
        for (const m of monsters) {
            const d = Math.hypot(m.x - x, m.y - y);
            if (d < bd) { bd = d; best = m; }
        }
        return best;
    }
    
    fireWeapon(entity, wIdx, input, monsters, bullets, fxList, player) {
        const w = entity.weapons[wIdx];
        if (!w || w.type === 'aura') return;
        
        const wd = WEAPONS[w.type];
        if (!wd) return;
        
        const cooldown = wd.cooldown / Math.max(0.1, this.getWeaponStat(w, 'atkSpd') || 1);
        w.timer = w.timer || 0;
        if (w.timer > 0) return;
        w.timer = cooldown;
        
        const isPlayer = entity === player;
        const owner = isPlayer ? 'player' : 'bot';
        
        switch (w.type) {
            case 'bow':    this.fireBow(entity, w, monsters, bullets, owner); break;
            case 'knife':  this.fireKnife(entity, w, monsters, bullets, owner); break;
            case 'axe':    this.fireAxe(entity, w, monsters, bullets, owner); break;
            case 'fireball': this.fireFireball(entity, w, monsters, bullets, owner); break;
            case 'meteor': this.fireMeteor(entity, w, monsters, bullets, owner); break;
            case 'poison': this.firePoison(entity, w, monsters, bullets, owner); break;
            case 'laser':  this.fireLaser(entity, w, monsters, bullets, fxList, owner); break;
            case 'sword':  this.fireSword(entity, w, bullets, owner); break;
            case 'lightning': this.fireLightning(entity, w, monsters, fxList, player, isPlayer); break;
        }
    }
    
    // ── Łuk ──────────────────────────────────────────────────────
    fireBow(entity, w, monsters, bullets, owner) {
        let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 800);
        if (!tgt) return;
        
        const [nx, ny] = norm(tgt.x - entity.x, tgt.y - entity.y);
        const cnt    = this.getWeaponStat(w, 'bCnt');
        const spd    = this.getWeaponStat(w, 'bSpd');
        const dmg    = this.getWeaponStat(w, 'dmg');
        const sz     = this.getWeaponStat(w, 'bSz') || 1;
        const bnc    = this.getWeaponStat(w, 'bBnc');
        const pierce = this.getWeaponStat(w, 'pierce');
        const spread = 0.12;
        
        for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * spread;
            const bx = nx * Math.cos(off) - ny * Math.sin(off);
            const by = nx * Math.sin(off) + ny * Math.cos(off);
            bullets.push(new Bullet(
                entity.x, entity.y, bx * spd, by * spd,
                dmg, owner, 'bow', sz, bnc, pierce, 0x00dd66, this.scene
            ));
        }
    }
    
    // ── Noże ─────────────────────────────────────────────────────
    fireKnife(entity, w, monsters, bullets, owner) {
        let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 700);
        if (!tgt) return;
        
        const [nx, ny] = norm(tgt.x - entity.x, tgt.y - entity.y);
        const cnt    = this.getWeaponStat(w, 'bCnt');
        const spd    = this.getWeaponStat(w, 'bSpd');
        const dmg    = this.getWeaponStat(w, 'dmg');
        const sz     = this.getWeaponStat(w, 'bSz') || 1;
        const pierce = this.getWeaponStat(w, 'pierce');
        const spread = 0.08;
        
        for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * spread;
            const bx = nx * Math.cos(off) - ny * Math.sin(off);
            const by = nx * Math.sin(off) + ny * Math.cos(off);
            bullets.push(new Bullet(
                entity.x, entity.y, bx * spd, by * spd,
                dmg, owner, 'knife', sz, 0, pierce, 0xcccccc, this.scene
            ));
        }
    }
    
    // ── Topór ────────────────────────────────────────────────────
    fireAxe(entity, w, monsters, bullets, owner) {
        let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 700);
        if (!tgt) {
            const a = Math.random() * Math.PI * 2;
            tgt = { x: entity.x + Math.cos(a) * 300, y: entity.y + Math.sin(a) * 300 };
        }
        
        const [nx, ny] = norm(tgt.x - entity.x, tgt.y - entity.y);
        const cnt    = this.getWeaponStat(w, 'bCnt') || 1;
        const spd    = this.getWeaponStat(w, 'spd') || 7;
        const dmg    = this.getWeaponStat(w, 'dmg');
        const sz     = this.getWeaponStat(w, 'sz') || 1;
        const pierce = this.getWeaponStat(w, 'pierce');
        const spread = 0.2;
        
        for (let i = 0; i < cnt; i++) {
            const off = (i - (cnt - 1) / 2) * spread;
            const bx = nx * Math.cos(off) - ny * Math.sin(off);
            const by = nx * Math.sin(off) + ny * Math.cos(off);
            bullets.push(new Bullet(
                entity.x, entity.y, bx * spd, by * spd,
                dmg, owner, 'axe', sz, 0, pierce, 0xff6600, this.scene
            ));
        }
    }
    
    // ── Kula Ognia ───────────────────────────────────────────────
    fireFireball(entity, w, monsters, bullets, owner) {
        let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 900);
        if (!tgt) return;
        
        const [nx, ny] = norm(tgt.x - entity.x, tgt.y - entity.y);
        const cnt = this.getWeaponStat(w, 'bCnt');
        const spd = this.getWeaponStat(w, 'bSpd') || 15;
        const dmg = this.getWeaponStat(w, 'dmg');
        const sz  = this.getWeaponStat(w, 'bSz') || 1;
        
        for (let i = 0; i < cnt; i++) {
            const spread = (i - (cnt - 1) / 2) * 0.15;
            const bx = nx * Math.cos(spread) - ny * Math.sin(spread);
            const by = nx * Math.sin(spread) + ny * Math.cos(spread);
            bullets.push(new Bullet(
                entity.x, entity.y, bx * spd, by * spd,
                dmg, owner, 'fireball', sz, 0, 0, 0xff3300, this.scene
            ));
        }
    }
    
    // ── Meteor ───────────────────────────────────────────────────
    fireMeteor(entity, w, monsters, bullets, owner) {
        const cnt = this.getWeaponStat(w, 'bCnt') || 1;
        const dmg = this.getWeaponStat(w, 'dmg');
        const sz  = this.getWeaponStat(w, 'bSz') || 2;
        
        for (let i = 0; i < cnt; i++) {
            // Losowy cel spośród widocznych wrogów
            if (monsters.length === 0) return;
            const tgt = monsters[Math.floor(Math.random() * monsters.length)];
            
            // Meteor spada z góry (z góry ekranu)
            const startX = tgt.x + rng(-100, 100);
            const startY = tgt.y + 600;
            const [nx, ny] = norm(tgt.x - startX, tgt.y - startY);
            const spd = 20;
            
            bullets.push(new Bullet(
                startX, startY, nx * spd, ny * spd,
                dmg, owner, 'meteor', sz, 0, 999, 0xff6600, this.scene
            ));
        }
    }
    
    // ── Trucizna ─────────────────────────────────────────────────
    firePoison(entity, w, monsters, bullets, owner) {
        const dmg  = this.getWeaponStat(w, 'dmg');
        const sz   = this.getWeaponStat(w, 'range') / 150 || 1;
        
        bullets.push(new Bullet(
            entity.x, entity.y, 0, 0,
            dmg, owner, 'poison', sz, 0, 999, 0x00ff00, this.scene
        ));
    }
    
    // ── Laser ────────────────────────────────────────────────────
    fireLaser(entity, w, monsters, bullets, fxList, owner) {
        let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 1200);
        if (!tgt) return;
        
        const dmg      = this.getWeaponStat(w, 'dmg');
        const sz       = this.getWeaponStat(w, 'width') / 30 || 1;
        const angle    = Math.atan2(tgt.y - entity.y, tgt.x - entity.x);
        
        const b = new Bullet(
            entity.x, entity.y, Math.cos(angle), Math.sin(angle),
            dmg, owner, 'laser', sz, 0, 999, 0xff00ff, this.scene
        );
        b.life = this.getWeaponStat(w, 'duration') || 1.5;
        bullets.push(b);
    }
    
    // ── Wirujący Miecz ───────────────────────────────────────────
    fireSword(entity, w, bullets, owner) {
        const cnt   = this.getWeaponStat(w, 'count') || 1;
        const dmg   = this.getWeaponStat(w, 'dmg');
        const orbit = this.getWeaponStat(w, 'orbit') || 120;
        const spd   = this.getWeaponStat(w, 'speed') || 3;
        
        // Dodaj miecze w równych odstępach kątowych
        const existingSwords = bullets.filter(b => b.wtype === 'sword' && b.owner === owner);
        
        // Tylko dodaj jeśli mamy mniej niż cnt mieczy
        if (existingSwords.length >= cnt) return;
        
        const angleOffset = (existingSwords.length / cnt) * Math.PI * 2;
        
        const b = new Bullet(
            entity.x + Math.cos(angleOffset) * orbit,
            entity.y + Math.sin(angleOffset) * orbit,
            Math.cos(angleOffset), Math.sin(angleOffset),
            dmg, owner, 'sword', 1, 0, 999, 0x88ccff, this.scene
        );
        b.owner = entity;
        bullets.push(b);
    }
    
    // ── Piorun ───────────────────────────────────────────────────
    fireLightning(entity, w, monsters, fxList, player, isPlayer) {
        const cnt   = this.getWeaponStat(w, 'targets');
        const chain = this.getWeaponStat(w, 'chain');
        const dmg   = this.getWeaponStat(w, 'dmg');
        
        const sorted = [...monsters].sort((a, b) =>
            Math.hypot(a.x - entity.x, a.y - entity.y) - Math.hypot(b.x - entity.x, b.y - entity.y)
        );
        
        for (const tgt of sorted.slice(0, cnt)) {
            tgt.takeDamage(dmg);
            if (isPlayer) player.totalDmg += dmg;
            fxList.push(this.createLightningFX(entity.x, entity.y, tgt.x, tgt.y, 0xffff44));
            
            let last = tgt;
            const hit = new Set([tgt]);
            
            for (let b = 0; b < chain; b++) {
                const next = monsters.find(m =>
                    !hit.has(m) && Math.hypot(m.x - last.x, m.y - last.y) < 250
                );
                if (!next) break;
                next.takeDamage(dmg * 0.7);
                if (isPlayer) player.totalDmg += dmg * 0.7;
                fxList.push(this.createLightningFX(last.x, last.y, next.x, next.y, 0xffff44));
                hit.add(next);
                last = next;
            }
        }
    }
    
    createLightningFX(ax, ay, bx, by, col) {
        const pts = [
            new THREE.Vector3(ax, ay, 2.5),
            new THREE.Vector3(ax + (bx - ax) * 0.3 + rng(-15, 15), ay + (by - ay) * 0.3 + rng(-15, 15), 2.5),
            new THREE.Vector3(ax + (bx - ax) * 0.7 + rng(-15, 15), ay + (by - ay) * 0.7 + rng(-15, 15), 2.5),
            new THREE.Vector3(bx, by, 2.5)
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        return { mesh: line, life: 0.15 };
    }
}