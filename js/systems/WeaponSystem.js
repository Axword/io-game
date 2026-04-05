import { WEAPONS } from '../config/weapons.js';
import { Bullet } from '../entities/Bullet.js';
import { mkRing } from '../utils/geometry.js';
import { norm, rng } from '../utils/math.js';

export class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
    }
    
    getWeaponStat(weapon, stat) {
        const base = WEAPONS[weapon.type].stats[stat] || 0;
        const mult = weapon.upgrades[stat] || (stat === 'atkSpd' ? 1 : (stat.startsWith('b') || stat === 'pierce' || stat === 'chain' || stat === 'targets' ? 0 : 1));
        
        if (stat === 'pierce' || stat === 'chain' || stat === 'bBnc' || stat === 'bCnt' || stat === 'targets') {
            return Math.round(base + mult);
        }
        
        return base * mult;
    }
    
    setupAura(entity) {
        if (entity.weapons[0] && entity.weapons[0].type === 'aura') {
            const range = this.getWeaponStat(entity.weapons[0], 'range');
            if (entity.auraRing) {
                this.scene.remove(entity.auraRing);
            }
            const ring = mkRing(range, 14, 0xffaa00, 0.4);
            ring.position.set(entity.x, entity.y, 2.5);
            this.scene.add(ring);
            entity.auraRing = ring;
            entity.auraMat = ring.material;
            entity.lastAuraRange = range;
        }
    }
    
    updateAura(entity, dt, monsters, player) {
        const w = entity.weapons[0];
        if (!w || w.type !== 'aura') return;
        
        w.timer -= dt;
        const range = this.getWeaponStat(w, 'range');
        
        // Płynna aktualizacja pozycji aury
        if (entity.auraRing) {
            entity.auraRing.position.set(entity.x, entity.y, 2.5);
            
            // Płynna zmiana rozmiaru tylko przy znacznej różnicy
            if (!entity.lastAuraRange) entity.lastAuraRange = range;
            
            const diff = Math.abs(entity.lastAuraRange - range);
            if (diff > 15) { // Rebuild tylko przy różnicy >15
                this.scene.remove(entity.auraRing);
                const ring = mkRing(range, 14, 0xffaa00, 0.4);
                ring.position.set(entity.x, entity.y, 2.5);
                this.scene.add(ring);
                entity.auraRing = ring;
                entity.lastAuraRange = range;
            }
        }
        
        // Atak
        if (w.timer <= 0) {
            const cooldown = WEAPONS.aura.cooldown / (this.getWeaponStat(w, 'atkSpd') || 1);
            w.timer = cooldown;
            
            const dmg = this.getWeaponStat(w, 'dmg');
            
            for (const m of monsters) {
                if (Math.hypot(m.x - entity.x, m.y - entity.y) <= range) {
                    m.takeDamage(dmg);
                    if (entity === player) {
                        player.totalDmg += dmg;
                    }
                }
            }
        }
    }
    
    findNearestTarget(x, y, monsters, range = 9999) {
        let best = null;
        let bd = range;
        for (const m of monsters) {
            const d = Math.hypot(m.x - x, m.y - y);
            if (d < bd) {
                bd = d;
                best = m;
            }
        }
        return best;
    }
    
    fireWeapon(entity, wIdx, input, monsters, bullets, fxList, player) {
        const w = entity.weapons[wIdx];
        if (!w) return;
        
        const wd = WEAPONS[w.type];
        const cooldown = wd.cooldown / (this.getWeaponStat(w, 'atkSpd') || 1);
        
        if (w.timer > 0) return;
        w.timer = cooldown;
        
        if (w.type === 'aura') return;
        
        if (w.type === 'bow') {
            let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 800);
            if (!tgt) return;
            
            const dx = tgt.x - entity.x;
            const dy = tgt.y - entity.y;
            const [nx, ny] = norm(dx, dy);
            const cnt = Math.round(this.getWeaponStat(w, 'bCnt'));
            const spd = this.getWeaponStat(w, 'bSpd');
            const dmg = this.getWeaponStat(w, 'dmg');
            const sz = this.getWeaponStat(w, 'bSz');
            const bnc = Math.round(this.getWeaponStat(w, 'bBnc'));
            const pierce = Math.round(this.getWeaponStat(w, 'pierce'));
            const spread = 0.12;
            
            for (let i = 0; i < cnt; i++) {
                const off = (i - (cnt - 1) / 2) * spread;
                const bx = nx * Math.cos(off) - ny * Math.sin(off);
                const by = nx * Math.sin(off) + ny * Math.cos(off);
                bullets.push(new Bullet(
                    entity.x, entity.y, bx * spd, by * spd,
                    dmg, entity === player ? 'player' : 'bot', 'bow', sz, bnc, pierce, 0x00dd66, this.scene
                ));
            }
        } else if (w.type === 'lightning') {
            const cnt = Math.round(this.getWeaponStat(w, 'targets'));
            const chain = Math.round(this.getWeaponStat(w, 'chain'));
            const dmg = this.getWeaponStat(w, 'dmg');
            
            const sorted = [...monsters].sort((a, b) => 
                Math.hypot(a.x - entity.x, a.y - entity.y) - Math.hypot(b.x - entity.x, b.y - entity.y)
            );
            
            const targets = sorted.slice(0, Math.min(cnt, sorted.length));
            
            for (const tgt of targets) {
                tgt.takeDamage(dmg);
                if (entity === player) player.totalDmg += dmg;
                
                const fx = this.createLightningFX(entity.x, entity.y, tgt.x, tgt.y, 0xffff44);
                fxList.push(fx);
                
                let last = tgt;
                const hit = new Set([tgt]);
                
                for (let b = 0; b < chain; b++) {
                    const next = monsters.find(m => 
                        !hit.has(m) && Math.hypot(m.x - last.x, m.y - last.y) < 250
                    );
                    if (!next) break;
                    
                    next.takeDamage(dmg * 0.7);
                    if (entity === player) player.totalDmg += dmg * 0.7;
                    
                    const fx2 = this.createLightningFX(last.x, last.y, next.x, next.y, 0xffff44);
                    fxList.push(fx2);
                    
                    hit.add(next);
                    last = next;
                }
            }
        } else if (w.type === 'axe') {
            const dmg = this.getWeaponStat(w, 'dmg');
            const sz = this.getWeaponStat(w, 'bSz');
            const spd = this.getWeaponStat(w, 'spd');
            const pierce = Math.round(this.getWeaponStat(w, 'pierce'));
            const cnt = Math.round(this.getWeaponStat(w, 'bCnt') || 1);
            
            let tgt = this.findNearestTarget(entity.x, entity.y, monsters, 700);
            if (!tgt) {
                const a = Math.random() * Math.PI * 2;
                tgt = { x: entity.x + Math.cos(a) * 300, y: entity.y + Math.sin(a) * 300 };
            }
            
            const dx = tgt.x - entity.x;
            const dy = tgt.y - entity.y;
            const [nx, ny] = norm(dx, dy);
            const spread = 0.2;
            
            for (let i = 0; i < cnt; i++) {
                const off = (i - (cnt - 1) / 2) * spread;
                const bx = nx * Math.cos(off) - ny * Math.sin(off);
                const by = nx * Math.sin(off) + ny * Math.cos(off);
                
                bullets.push(new Bullet(
                    entity.x, entity.y, bx * spd, by * spd,
                    dmg, entity === player ? 'player' : 'bot', 'axe', sz, 0, pierce, 0xff6600, this.scene
                ));
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
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, linewidth: 3 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        return { mesh: line, life: 0.15 };
    }
}