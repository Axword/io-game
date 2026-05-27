// server/systems/WeaponSystem.js
import { ServerBullet } from '../entities/Bullet.js';
import { WEAPONS } from '../config.js';

export class ServerWeaponSystem {
    getWeaponStat(w, stat, entity) {
        const base = w.stats[stat] || 0;
        const upgrade = w.upgrades?.[stat] || 0;
        let globalMult = 1;
        
        if (stat === 'dmg' && entity?.damageBonus) globalMult *= (1 + entity.damageBonus / 100);
        if (stat === 'bSz' && entity?.projectileSizeBonus) globalMult *= (1 + entity.projectileSizeBonus / 100);
        if (stat === 'bSpd' && entity?.projectileSpeedBonus) globalMult *= (1 + entity.projectileSpeedBonus / 100);
        if ((stat === 'range' || stat === 'orbit') && entity?.rangeBonus) globalMult *= (1 + entity.rangeBonus / 100);
        if (stat === 'atkSpd' && entity?.attackSpeedBonus) globalMult *= (1 + entity.attackSpeedBonus / 100);

        if (typeof upgrade === 'number' && upgrade > 0 && upgrade < 5) return (base + upgrade) * globalMult;
        return base * (upgrade || 1) * globalMult;
    }

    fireWeapon(entity, slotIdx, inputManager, targets, bullets, owner) {
        const w = entity.weapons[slotIdx];
        if (!w || w.timer > 0) return;
        const wd = WEAPONS[w.type];
        if (!wd) return;

        const atkSpd = this.getWeaponStat(w, 'atkSpd', entity);
        w.timer = wd.cooldown / Math.max(0.1, atkSpd);

        switch (w.type) {
            case 'bow':       this.fireBow(entity, w, targets, bullets, owner); break;
            case 'lightning': this.fireLightning(entity, w, targets, bullets, owner); break;
            case 'axe':       this.fireAxe(entity, w, targets, bullets, owner); break;
            case 'fireball':  this.fireFireball(entity, w, targets, bullets, owner); break;
            case 'knife':     this.fireKnife(entity, w, targets, bullets, owner); break;
            case 'laser':     this.fireLaser(entity, w, targets, bullets, owner); break;
            case 'poison':    this.firePoison(entity, w, bullets, owner); break;
            case 'meteor':    this.fireMeteor(entity, w, targets, bullets, owner); break;
            case 'sword':     this.fireSword(entity, w, bullets, owner); break;
        }
    }

    // ... (TUTAJ WKLEJ WSZYSTKIE FUNKCJE fireBow, fireKnife, fireAxe, fireFireball, fireMeteor, fireSword) ...
    // ZMIANA: Zamiast `new Bullet(..., this.scene)` dajesz `new ServerBullet(...)`
    // ZMIANA: Usuwasz parametr `fxList` z sygnatur i wywołań.

    fireLightning(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const targets = Math.max(1, Math.round(this.getWeaponStat(w, 'targets', entity)));
        const chains = Math.max(0, Math.round(this.getWeaponStat(w, 'chain', entity)));
        const chainRange = w.stats.chainRange || 250;

        const sorted = monsters.filter(m => m.hp > 0)
            .map(m => ({ m, d: Math.hypot(m.x - entity.x, m.y - entity.y) }))
            .filter(e => e.d < 500).sort((a, b) => a.d - b.d);

        const initialTargets = sorted.slice(0, targets);

        for (const { m: target } of initialTargets) {
            const firstDmg = target.isBot ? dmg * 0.35 : dmg;
            target.takeDamage(firstDmg, owner);
            if (owner === entity && entity.totalDmg !== undefined) entity.totalDmg += firstDmg;

            let lastX = target.x, lastY = target.y;
            const hitSet = new Set([target]);
            let chainDmg = dmg;

            for (let c = 0; c < chains; c++) {
                chainDmg *= 0.7;
                let nextTarget = null, nearestDist = chainRange;
                for (const m of monsters) {
                    if (m.hp <= 0 || hitSet.has(m) || m === entity) continue;
                    const d = Math.hypot(m.x - lastX, m.y - lastY);
                    if (d < nearestDist) { nearestDist = d; nextTarget = m; }
                }
                if (!nextTarget) break;

                const chainHitDmg = nextTarget.isBot ? chainDmg * 0.35 : chainDmg;
                nextTarget.takeDamage(chainHitDmg, owner);
                if (owner === entity && entity.totalDmg !== undefined) entity.totalDmg += chainHitDmg;
                
                hitSet.add(nextTarget);
                lastX = nextTarget.x; lastY = nextTarget.y;
            }
        }
    }

    fireLaser(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 1.0;
        const range = this.getWeaponStat(w, 'range', entity) || 350;
        const width = this.getWeaponStat(w, 'width', entity) || 18;
        const target = this.findNearest(entity, monsters, range + 100);
        const angle = target ? Math.atan2(target.y - entity.y, target.x - entity.x) : Math.random() * Math.PI * 2;
        const halfRange = range / 2;

        const b = new ServerBullet(entity.x + Math.cos(angle) * halfRange, entity.y + Math.sin(angle) * halfRange, 0, 0, dmg, owner, 'laser', 1, 0, 999, 0xff00ff);
        b.owner = entity; b.life = duration; b.laserAngle = angle; b.laserRange = range; b.laserWidth = width;
        b.rehitInterval = 0.15; b.rehitTimer = 0; b.pierce = 999;
        bullets.push(b);
    }

    firePoison(entity, w, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 5;
        const range = this.getWeaponStat(w, 'range', entity) || 150;
        const tick = w.stats.tick || 0.15;
        const lingerDmg = w.stats.lingerDmg || (dmg * 0.4);
        const lingerDuration = w.stats.lingerDuration || 2.0;

        const b = new ServerBullet(entity.x, entity.y, 0, 0, dmg, owner, 'poison', range / 120, 0, 999, 0x00ff00);
        b.owner = entity; b.life = duration; b.tickInterval = tick; b.tickDmg = dmg;
        b.rehitInterval = tick; b.rehitTimer = 0; b.lingerDmg = lingerDmg; b.lingerDuration = lingerDuration; b.pierce = 999;
        bullets.push(b);
    }

    updateAura(entity, dt, targets, owner) {
        const auraWeapon = entity.weapons.find(w => w?.type === 'aura');
        if (!auraWeapon) return;
        const range = this.getWeaponStat(auraWeapon, 'range', entity);
        const dmg = this.getWeaponStat(auraWeapon, 'dmg', entity);

        for (const m of targets) {
            if (m.hp <= 0 || m === entity) continue;
            const dist = Math.hypot(m.x - entity.x, m.y - entity.y);
            if (dist < range) {
                const auraDmg = m.isBot ? dmg * dt * 0.35 : dmg * dt;
                m.takeDamage(auraDmg, entity);
                if (owner === entity && entity.totalDmg !== undefined) entity.totalDmg += auraDmg;
            }
        }
    }

    spawnBullet(entity, angle, speed, dmg, sz, bounces, pierce, col, wtype, bullets, owner) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const b = new ServerBullet(entity.x + Math.cos(angle) * 15, entity.y + Math.sin(angle) * 15, vx, vy, dmg, owner, wtype, sz, bounces, pierce, col);
        bullets.push(b);
        return b;
    }

    // ... (WKLEJ findNearest i findDensestGroup bez zmian) ...
}