import { ServerBullet } from '../entities/bullet.js';
import { WEAPONS } from '../../shared/config/weapons.js';

export class WeaponSystem {
    getWeaponStat(w, stat, entity) {
        const base = w.stats[stat] || 0;
        const upgrade = w.upgrades?.[stat] || 0;

        let globalMult = 1;
        if (stat === 'dmg' && entity?.damageBonus) {
            globalMult *= (1 + entity.damageBonus / 100);
        }
        if (stat === 'bSz' && entity?.projectileSizeBonus) {
            globalMult *= (1 + entity.projectileSizeBonus / 100);
        }
        if (stat === 'bSpd' && entity?.projectileSpeedBonus) {
            globalMult *= (1 + entity.projectileSpeedBonus / 100);
        }
        if ((stat === 'range' || stat === 'orbit') && entity?.rangeBonus) {
            globalMult *= (1 + entity.rangeBonus / 100);
        }
        if (stat === 'atkSpd' && entity?.attackSpeedBonus) {
            globalMult *= (1 + entity.attackSpeedBonus / 100);
        }

        if (typeof upgrade === 'number' && upgrade > 0 && upgrade < 5) {
            return (base + upgrade) * globalMult;
        }
        return base * (upgrade || 1) * globalMult;
    }

    fireWeapon(entity, slotIdx, monsters, bullets, ownerId) {
        const w = entity.weapons[slotIdx];
        if (!w || w.timer > 0) return;

        const wd = WEAPONS[w.type];
        if (!wd) return;

        const atkSpd = this.getWeaponStat(w, 'atkSpd', entity);
        w.timer = wd.cooldown / Math.max(0.1, atkSpd);

        switch (w.type) {
            case 'bow': this.fireBow(entity, w, monsters, bullets, ownerId); break;
            case 'lightning': this.fireLightning(entity, w, monsters, bullets, ownerId); break;
            case 'axe': this.fireAxe(entity, w, monsters, bullets, ownerId); break;
            case 'fireball': this.fireFireball(entity, w, monsters, bullets, ownerId); break;
            case 'knife': this.fireKnife(entity, w, monsters, bullets, ownerId); break;
            case 'laser': this.fireLaser(entity, w, monsters, bullets, ownerId); break;
            case 'poison': this.firePoison(entity, w, bullets, ownerId); break;
            case 'meteor': this.fireMeteor(entity, w, monsters, bullets, ownerId); break;
            case 'sword': this.fireSword(entity, w, bullets, ownerId); break;
        }
    }

    fireBow(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const pierce = Math.round(this.getWeaponStat(w, 'pierce', entity));

        const target = this.findNearest(entity, monsters, 600);
        if (!target) return;

        const baseAngle = Math.atan2(target.y - entity.y, target.x - entity.x);
        if (cnt === 1) {
            this.spawnBullet(entity, baseAngle, spd, dmg, sz, 0, pierce, 0x00ff88, 'bow', bullets, ownerId);
        } else {
            const spreadAngle = Math.min(Math.PI * 0.6, (cnt - 1) * 0.15);
            for (let i = 0; i < cnt; i++) {
                const t = cnt === 1 ? 0 : (i / (cnt - 1)) - 0.5;
                const angle = baseAngle + t * spreadAngle;
                this.spawnBullet(entity, angle, spd, dmg, sz, 0, pierce, 0x00ff88, 'bow', bullets, ownerId);
            }
        }
    }

    fireKnife(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const pierce = Math.round(this.getWeaponStat(w, 'pierce', entity));
        const bounces = Math.round(this.getWeaponStat(w, 'bBnc', entity) || 0);

        for (let i = 0; i < cnt; i++) {
            const target = this.findNearest(entity, monsters, 500);
            if (!target) continue;
            const baseAngle = Math.atan2(target.y - entity.y, target.x - entity.x);
            const scatter = (Math.random() - 0.5) * 0.4;
            const angle = baseAngle + scatter;
            this.spawnBullet(entity, angle, spd, dmg, sz, bounces, pierce, 0xcccccc, 'knife', bullets, ownerId);
        }
    }

    fireLightning(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const targets = Math.max(1, Math.round(this.getWeaponStat(w, 'targets', entity)));
        const chains = Math.max(0, Math.round(this.getWeaponStat(w, 'chain', entity)));
        const chainRange = w.stats.chainRange || 250;

        const sorted = monsters
            .filter(m => m.hp > 0)
            .map(m => ({ m, d: Math.hypot(m.x - entity.x, m.y - entity.y) }))
            .filter(e => e.d < 500)
            .sort((a, b) => a.d - b.d);

        const initialTargets = sorted.slice(0, targets);

        for (const { m: target } of initialTargets) {
            const firstDmg = target.isBot ? dmg * 0.35 : dmg;
            target.takeDamage(firstDmg, entity);
            if (target.isBot && target.botAI?.onDamageTaken) target.botAI.onDamageTaken(firstDmg, entity);
            if (entity.totalDmg !== undefined) entity.totalDmg += firstDmg;

            let lastX = target.x, lastY = target.y;
            const hitSet = new Set([target]);
            let chainDmg = dmg;

            for (let c = 0; c < chains; c++) {
                chainDmg *= 0.7;
                let nextTarget = null;
                let nearestDist = chainRange;
                for (const m of monsters) {
                    if (m.hp <= 0 || hitSet.has(m)) continue;
                    if (m === entity) continue;
                    const d = Math.hypot(m.x - lastX, m.y - lastY);
                    if (d < nearestDist) { nearestDist = d; nextTarget = m; }
                }
                if (!nextTarget) break;

                const chainHitDmg = nextTarget.isBot ? chainDmg * 0.35 : chainDmg;
                nextTarget.takeDamage(chainHitDmg, entity);
                if (nextTarget.isBot && nextTarget.botAI?.onDamageTaken) nextTarget.botAI.onDamageTaken(chainHitDmg, entity);
                if (entity.totalDmg !== undefined) entity.totalDmg += chainHitDmg;

                hitSet.add(nextTarget);
                lastX = nextTarget.x;
                lastY = nextTarget.y;
            }
        }
    }

    fireAxe(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const pierce = 999;

        const target = this.findDensestGroup(entity, monsters, 500);
        if (!target) return;
        const angle = Math.atan2(target.y - entity.y, target.x - entity.x);
        this.spawnBullet(entity, angle, spd, dmg, sz, 0, pierce, 0xff8800, 'axe', bullets, ownerId);
    }

    fireFireball(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const explosion = this.getWeaponStat(w, 'explosion', entity) || 120;

        for (let i = 0; i < cnt; i++) {
            const target = this.findNearest(entity, monsters, 500);
            if (!target) continue;
            const angle = Math.atan2(target.y - entity.y, target.x - entity.x);
            const scatter = cnt > 1 ? (Math.random() - 0.5) * 0.5 : 0;
            const b = this.spawnBullet(entity, angle + scatter, spd, dmg, sz, 0, 0, 0xff3300, 'fireball', bullets, ownerId);
            if (b) {
                b.explosionRadius = explosion;
                b.isExplosive = true;
            }
        }
    }

    fireLaser(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 1.0;
        const range = this.getWeaponStat(w, 'range', entity) || 350;
        const width = this.getWeaponStat(w, 'width', entity) || 18;

        const target = this.findNearest(entity, monsters, range + 100);
        const angle = target
            ? Math.atan2(target.y - entity.y, target.x - entity.x)
            : Math.random() * Math.PI * 2;

        const halfRange = range / 2;
        const b = new ServerBullet(
            entity.x + Math.cos(angle) * halfRange,
            entity.y + Math.sin(angle) * halfRange,
            0, 0,
            dmg, ownerId, 'laser', 1, 0, 999, 0xff00ff
        );
        b.ownerType = entity.isBot ? 'bot' : 'player';
        b.life = duration;
        b.laserAngle = angle;
        b.laserRange = range;
        b.laserWidth = width;
        b.rehitInterval = 0.15;
        b.rehitTimer = 0;
        b.pierce = 999;
        bullets.push(b);
    }

    firePoison(entity, w, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 5;
        const range = this.getWeaponStat(w, 'range', entity) || 150;
        const tick = w.stats.tick || 0.15;
        const lingerDmg = w.stats.lingerDmg || (dmg * 0.4);
        const lingerDuration = w.stats.lingerDuration || 2.0;

        const b = new ServerBullet(
            entity.x, entity.y,
            0, 0,
            dmg, ownerId, 'poison', range / 120, 0, 999, 0x00ff00
        );
        b.ownerType = entity.isBot ? 'bot' : 'player';
        b.life = duration;
        b.tickInterval = tick;
        b.tickDmg = dmg;
        b.rehitInterval = tick;
        b.rehitTimer = 0;
        b.lingerDmg = lingerDmg;
        b.lingerDuration = lingerDuration;
        b.pierce = 999;
        bullets.push(b);
    }

    fireMeteor(entity, w, monsters, bullets, ownerId) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const impact = this.getWeaponStat(w, 'impact', entity) || 200;

        for (let i = 0; i < cnt; i++) {
            let targetX, targetY;
            const target = this.findNearest(entity, monsters, 600);
            if (target) {
                targetX = target.x + (Math.random() - 0.5) * 80;
                targetY = target.y + (Math.random() - 0.5) * 80;
            } else {
                const angle = Math.random() * Math.PI * 2;
                const dist = 150 + Math.random() * 250;
                targetX = entity.x + Math.cos(angle) * dist;
                targetY = entity.y + Math.sin(angle) * dist;
            }

            const spawnX = targetX + (Math.random() - 0.5) * 200;
            const spawnY = targetY + 400 + Math.random() * 200;

            const b = new ServerBullet(
                spawnX, spawnY,
                0, 0,
                dmg, ownerId, 'meteor', sz, 0, 0, 0xff6600
            );
            b.ownerType = entity.isBot ? 'bot' : 'player';
            b.explosionRadius = impact;
            b.isExplosive = true;
            b.trajectory = {
                startX: spawnX,
                startY: spawnY,
                peakX: (spawnX + targetX) / 2,
                peakY: Math.max(spawnY, targetY) + 100,
                endX: targetX,
                endY: targetY,
                currentTime: 0,
                totalTime: 0.8 + Math.random() * 0.4
            };
            b.life = 4;
            bullets.push(b);
        }
    }

    fireSword(entity, w, bullets, ownerId) {
        const maxCount = w.stats.maxCount || 4;
        const rawCnt = this.getWeaponStat(w, 'count', entity) || 1;
        const cnt = Math.min(maxCount, Math.max(1, Math.round(rawCnt)));
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const orbit = this.getWeaponStat(w, 'orbit', entity) || 120;
        const baseSpeed = this.getWeaponStat(w, 'speed', entity) || 3;
        const atkSpd = this.getWeaponStat(w, 'atkSpd', entity) || 1;
        const spinSpeed = baseSpeed * atkSpd;

        let swords = bullets.filter(b => b.wtype === 'sword' && b.ownerId === ownerId);

        for (const s of swords) {
            s.dmg = dmg;
            s.orbitRadius = orbit;
            s.orbitSpeed = spinSpeed;
            s.rehitInterval = Math.max(0.08, 0.2 / atkSpd);
        }

        while (swords.length > cnt) {
            const removed = swords.pop();
            removed.life = -1;
        }

        if (swords.length >= cnt) return;

        while (swords.length < cnt) {
            const idx = swords.length;
            const angleOffset = (idx / cnt) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
            const b = new ServerBullet(
                entity.x, entity.y,
                0, 0, dmg, ownerId, 'sword', 1, 0, 999, 0x88ccff
            );
            b.ownerType = entity.isBot ? 'bot' : 'player';
            b.baseAngle = angleOffset;
            b.orbitRadius = orbit;
            b.orbitSpeed = spinSpeed;
            b.orbitSlot = idx;
            b.orbitSlotsTotal = cnt;
            b.rehitInterval = Math.max(0.08, 0.2 / atkSpd);
            bullets.push(b);
            swords.push(b);
        }
    }

    updateAura(entity, dt, monsters, ownerId) {
        const auraWeapon = entity.weapons.find(w => w?.type === 'aura');
        if (!auraWeapon) return;

        const range = this.getWeaponStat(auraWeapon, 'range', entity);
        const dmg = this.getWeaponStat(auraWeapon, 'dmg', entity);

        for (const m of monsters) {
            if (m.hp <= 0) continue;
            if (m === entity) continue;
            const dist = Math.hypot(m.x - entity.x, m.y - entity.y);
            if (dist < range) {
                const auraDmg = m.isBot ? dmg * dt * 0.35 : dmg * dt;
                m.takeDamage(auraDmg, entity);
                if (m.isBot && m.botAI?.onDamageTaken) m.botAI.onDamageTaken(auraDmg, entity);
                if (entity.totalDmg !== undefined) entity.totalDmg += auraDmg;
            }
        }
    }

    updateSwordPositions(bullets, dt) {
        for (const b of bullets) {
            if (b.wtype !== 'sword' || !b.ownerId) continue;
            // Room is responsible for providing owner position; here we just update angle
            const total = Math.max(1, b.orbitSlotsTotal || 1);
            const slot = b.orbitSlot || 0;
            const slotAngle = (slot / total) * Math.PI * 2;
            b.baseAngle = (b.baseAngle || 0) + dt * (b.orbitSpeed || 3);
            // final position is computed by room using owner x/y
            b._orbitAngle = (b.baseAngle || 0) + slotAngle + b.animTime * (b.orbitSpeed || 3);
        }
    }

    spawnBullet(entity, angle, speed, dmg, sz, bounces, pierce, col, wtype, bullets, ownerId) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const b = new ServerBullet(
            entity.x + Math.cos(angle) * 15,
            entity.y + Math.sin(angle) * 15,
            vx, vy, dmg, ownerId, wtype, sz, bounces, pierce, col
        );
        b.ownerType = entity.isBot ? 'bot' : 'player';
        bullets.push(b);
        return b;
    }

    findNearest(entity, monsters, range) {
        let nearest = null;
        let nearestDist = range;

        if (entity.isBot) {
            const pvpTarget = entity.botAI?.getPvpTarget?.();
            if (pvpTarget && pvpTarget.hp > 0) {
                const pvpDist = Math.hypot(pvpTarget.x - entity.x, pvpTarget.y - entity.y);
                if (pvpDist < range) return pvpTarget;
            }
        }

        for (const m of monsters) {
            if (m.hp <= 0) continue;
            if (m === entity) continue;
            const d = Math.hypot(m.x - entity.x, m.y - entity.y);
            if (d < nearestDist) { nearestDist = d; nearest = m; }
        }
        return nearest;
    }

    findDensestGroup(entity, monsters, range) {
        let bestTarget = null;
        let bestDensity = 0;
        const nearby = monsters.filter(m => m.hp > 0 && Math.hypot(m.x - entity.x, m.y - entity.y) < range);
        if (nearby.length === 0) return null;

        for (const m of nearby) {
            let density = 0;
            for (const other of nearby) {
                if (Math.hypot(other.x - m.x, other.y - m.y) < 150) density++;
            }
            if (density > bestDensity) { bestDensity = density; bestTarget = m; }
        }
        return bestTarget || nearby[0];
    }
}
