import { Bullet } from '../entities/Bullet.js';
import { WEAPONS } from '../config/weapons.js';
import { norm } from '../utils/math.js';

export class WeaponSystem {
    constructor(scene) {
        this.scene = scene;
    }

    getWeaponStat(w, stat, entity) {
        const base = w.stats[stat] || 0;
        const upgrade = w.upgrades?.[stat] || 0;

        // Globalne bonusy gracza
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

        // Additive vs multiplicative
        if (typeof upgrade === 'number' && upgrade > 0 && upgrade < 5) {
            // Prawdopodobnie additive
            return (base + upgrade) * globalMult;
        }
        return base * (upgrade || 1) * globalMult;
    }

    fireWeapon(entity, slotIdx, inputManager, monsters, bullets, fxList, owner) {
        const w = entity.weapons[slotIdx];
        if (!w || w.timer > 0) return;

        const wd = WEAPONS[w.type];
        if (!wd) return;

        // Cooldown
        const atkSpd = this.getWeaponStat(w, 'atkSpd', entity);
        w.timer = wd.cooldown / Math.max(0.1, atkSpd);

        switch (w.type) {
            case 'bow':       this.fireBow(entity, w, monsters, bullets, owner); break;
            case 'lightning': this.fireLightning(entity, w, monsters, bullets, owner, fxList); break;
            case 'axe':       this.fireAxe(entity, w, monsters, bullets, owner); break;
            case 'fireball':  this.fireFireball(entity, w, monsters, bullets, owner); break;
            case 'knife':     this.fireKnife(entity, w, monsters, bullets, owner); break;
            case 'laser':     this.fireLaser(entity, w, monsters, bullets, owner); break;
            case 'poison':    this.firePoison(entity, w, bullets, owner); break;
            case 'meteor':    this.fireMeteor(entity, w, monsters, bullets, owner); break;
            case 'sword':     this.fireSword(entity, w, bullets, owner); break;
        }
    }

    // ── Łuk (więcej count = szerszy spread) ─────────────────

    fireBow(entity, w, monsters, bullets, owner) {
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
            this.spawnBullet(entity, baseAngle, spd, dmg, sz, 0, pierce, 0x00ff88, 'bow', bullets, owner);
        } else {
            // Spread: im więcej strzał, tym szerszy wachlarz
            const spreadAngle = Math.min(Math.PI * 0.6, (cnt - 1) * 0.15);
            for (let i = 0; i < cnt; i++) {
                const t = cnt === 1 ? 0 : (i / (cnt - 1)) - 0.5;
                const angle = baseAngle + t * spreadAngle;
                this.spawnBullet(entity, angle, spd, dmg, sz, 0, pierce, 0x00ff88, 'bow', bullets, owner);
            }
        }
    }

    // ── Noże (szybkie, odbijające się) ──────────────────────

    fireKnife(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const pierce = Math.round(this.getWeaponStat(w, 'pierce', entity));
        const bounces = Math.round(this.getWeaponStat(w, 'bBnc', entity) || 0);

        for (let i = 0; i < cnt; i++) {
            // Losowy offset kątowy dla noży (rozrzut)
            const target = this.findNearest(entity, monsters, 500);
            if (!target) continue;

            const baseAngle = Math.atan2(target.y - entity.y, target.x - entity.x);
            const scatter = (Math.random() - 0.5) * 0.4; // Lekki rozrzut
            const angle = baseAngle + scatter;

            const b = this.spawnBullet(entity, angle, spd, dmg, sz, bounces, pierce, 0xcccccc, 'knife', bullets, owner);
        }
    }

    // ── Piorun (chain-based) ────────────────────────────────

    fireLightning(entity, w, monsters, bullets, owner, fxList) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const targets = Math.max(1, Math.round(this.getWeaponStat(w, 'targets', entity)));
        const chains = Math.max(0, Math.round(this.getWeaponStat(w, 'chain', entity)));
        const chainRange = w.stats.chainRange || 250;

        // Znajdź najbliższe cele
        const sorted = monsters
            .filter(m => m.hp > 0)
            .map(m => ({ m, d: Math.hypot(m.x - entity.x, m.y - entity.y) }))
            .filter(e => e.d < 500)
            .sort((a, b) => a.d - b.d);

        const initialTargets = sorted.slice(0, targets);

        for (const { m: target } of initialTargets) {
            // Uderz pierwszy cel
            target.takeDamage(dmg);
            if (owner === entity && entity.totalDmg !== undefined) {
                entity.totalDmg += dmg;
            }

            // SFX - błyskawica do pierwszego celu
            this.createLightningFX(entity.x, entity.y, target.x, target.y, fxList, 0xffff44);

            // Chain lightning
            let lastX = target.x, lastY = target.y;
            const hitSet = new Set([target]);
            let chainDmg = dmg;

            for (let c = 0; c < chains; c++) {
                chainDmg *= 0.7; // Każdy łańcuch traci 30% dmg

                // Znajdź najbliższego nie-trafionego wroga
                let nextTarget = null;
                let nearestDist = chainRange;

                for (const m of monsters) {
                    if (m.hp <= 0 || hitSet.has(m)) continue;
                    const d = Math.hypot(m.x - lastX, m.y - lastY);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nextTarget = m;
                    }
                }

                if (!nextTarget) break;

                nextTarget.takeDamage(chainDmg);
                if (owner === entity && entity.totalDmg !== undefined) {
                    entity.totalDmg += chainDmg;
                }

                // SFX łańcucha
                this.createLightningFX(lastX, lastY, nextTarget.x, nextTarget.y, fxList, 0xcccc00);

                hitSet.add(nextTarget);
                lastX = nextTarget.x;
                lastY = nextTarget.y;
            }
        }
    }

    createLightningFX(x1, y1, x2, y2, fxList, col) {
        const segments = 6;
        const points = [new THREE.Vector3(x1, y1, 3)];

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 40;
            const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 40;
            points.push(new THREE.Vector3(px, py, 3));
        }
        points.push(new THREE.Vector3(x2, y2, 3));

        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, linewidth: 2 });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);

        fxList.push({ mesh: line, life: 0.15 });
    }

    // ── Topór (celowanie w grupę, pierce through) ───────────

    fireAxe(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const spd = this.getWeaponStat(w, 'bSpd', entity);
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const pierce = 999; // Zawsze przechodzi przez wszystko

        // Celuj w GRUPĘ wrogów, nie najbliższego
        const target = this.findDensestGroup(entity, monsters, 500);
        if (!target) return;

        const angle = Math.atan2(target.y - entity.y, target.x - entity.x);
        this.spawnBullet(entity, angle, spd, dmg, sz, 0, pierce, 0xff8800, 'axe', bullets, owner);
    }

    // ── Kula ognia (AOE explosion) ──────────────────────────

    fireFireball(entity, w, monsters, bullets, owner) {
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

            const b = this.spawnBullet(entity, angle + scatter, spd, dmg, sz, 0, 0, 0xff3300, 'fireball', bullets, owner);
            if (b) {
                b.explosionRadius = explosion;
                b.isExplosive = true;
            }
        }
    }

    // ── Laser (krótki, od gracza, przechodzi przez) ─────────

    fireLaser(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 1.0;
        const range = this.getWeaponStat(w, 'range', entity) || 350;
        const width = this.getWeaponStat(w, 'width', entity) || 18;

        // Celuj w najbliższego wroga
        const target = this.findNearest(entity, monsters, range + 100);
        const angle = target
            ? Math.atan2(target.y - entity.y, target.x - entity.x)
            : Math.random() * Math.PI * 2;

        const halfRange = range / 2;

        const b = new Bullet(
            entity.x + Math.cos(angle) * halfRange,
            entity.y + Math.sin(angle) * halfRange,
            0, 0,
            dmg, owner, 'laser', 1, 0, 999, 0xff00ff, this.scene
        );
        b.owner = entity;
        b.life = duration;
        b.laserAngle = angle;
        b.laserRange = range;
        b.laserWidth = width;
        b.rehitInterval = 0.15; // Trafienie co 0.15s
        b.rehitTimer = 0;
        b.pierce = 999; // Przechodzi przez wszystko

        // Przebuduj mesh na nowy rozmiar
        if (b.mesh) this.scene.remove(b.mesh);
        const geo = new THREE.PlaneGeometry(range, width);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff00ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide
        });
        b.mesh = new THREE.Mesh(geo, mat);
        b.mesh.position.set(b.x, b.y, 2.5);
        b.mesh.rotation.z = angle;
        this.scene.add(b.mesh);

        // Glow
        if (b.glow) this.scene.remove(b.glow);
        const glowGeo = new THREE.PlaneGeometry(range, width * 3);
        b.glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
            color: 0xff00ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide
        }));
        b.glow.position.set(b.x, b.y, 2.3);
        b.glow.rotation.z = angle;
        this.scene.add(b.glow);

        bullets.push(b);
    }

    // ── Trucizna (stałe obrażenia w chmurze + linger) ──────

    firePoison(entity, w, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const duration = this.getWeaponStat(w, 'duration', entity) || 5;
        const range = this.getWeaponStat(w, 'range', entity) || 150;
        const tick = w.stats.tick || 0.15;
        const lingerDmg = w.stats.lingerDmg || (dmg * 0.4);
        const lingerDuration = w.stats.lingerDuration || 2.0;

        const b = new Bullet(
            entity.x, entity.y,
            0, 0,
            dmg, owner, 'poison', range / 120, 0, 999, 0x00ff00, this.scene
        );
        b.owner = entity;
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

    // ── Meteor ──────────────────────────────────────────────

    fireMeteor(entity, w, monsters, bullets, owner) {
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const rawCnt = this.getWeaponStat(w, 'bCnt', entity);
        const cnt = Math.max(1, Math.round(rawCnt));
        const sz = this.getWeaponStat(w, 'bSz', entity);
        const impact = this.getWeaponStat(w, 'impact', entity) || 200;

        for (let i = 0; i < cnt; i++) {
            // Targetuj wroga lub losowe miejsce w pobliżu
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

            // Spawn wysoko i spadaj
            const spawnX = targetX + (Math.random() - 0.5) * 200;
            const spawnY = targetY + 400 + Math.random() * 200;

            const b = new Bullet(
                spawnX, spawnY,
                0, 0,
                dmg, owner, 'meteor', sz, 0, 0, 0xff6600, this.scene
            );
            b.owner = entity;
            b.explosionRadius = impact;
            b.isExplosive = true;

            // Trajektoria spadania
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

            // Gwarantuj widoczność
            b.mesh.visible = true;
            b.life = 4;

            bullets.push(b);
        }
    }

    // ── Miecz (orbitujący) ──────────────────────────────────

    fireSword(entity, w, bullets, owner) {
        const maxCount = w.stats.maxCount || 4;
        const rawCnt = this.getWeaponStat(w, 'count', entity) || 1;
        const cnt = Math.min(maxCount, Math.max(1, Math.round(rawCnt)));
        const dmg = this.getWeaponStat(w, 'dmg', entity);
        const orbit = this.getWeaponStat(w, 'orbit', entity) || 120;
        const baseSpeed = this.getWeaponStat(w, 'speed', entity) || 3;
        const atkSpd = this.getWeaponStat(w, 'atkSpd', entity) || 1;
        const spinSpeed = baseSpeed * atkSpd;

        let swords = bullets.filter(b => b.wtype === 'sword' && b.owner === entity);

        // Aktualizuj istniejące
        for (const s of swords) {
            s.dmg = dmg;
            s.orbitRadius = orbit;
            s.orbitSpeed = spinSpeed;
            s.rehitInterval = Math.max(0.08, 0.2 / atkSpd);
        }

        // Usuń nadmiar
        while (swords.length > cnt) {
            const removed = swords.pop();
            removed.life = -1;
        }

        if (swords.length >= cnt) return;

        // Dodaj brakujące
        while (swords.length < cnt) {
            const idx = swords.length;
            const angleOffset = (idx / cnt) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;

            const b = new Bullet(
                entity.x, entity.y,
                0, 0, dmg, entity, 'sword', 1, 0, 999, 0x88ccff, this.scene
            );
            b.owner = entity;
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

    // ── Aura (kręcąca się, ładniejsza) ──────────────────────

    setupAura(entity) {
        const auraWeapon = entity.weapons.find(w => w?.type === 'aura');
        if (!auraWeapon) return;

        const range = this.getWeaponStat(auraWeapon, 'range', entity);

        // Usuń starą aurę
        if (entity.auraRing) this.scene.remove(entity.auraRing);

        // Ring zewnętrzny
        const ringGeo = new THREE.RingGeometry(range - 4, range, 48);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00, transparent: true, opacity: 0.35, side: THREE.DoubleSide
        });
        entity.auraRing = new THREE.Mesh(ringGeo, ringMat);
        entity.auraRing.position.z = 1.5;
        this.scene.add(entity.auraRing);
        entity.auraMat = ringMat;
        entity.lastAuraRange = range;

        // Wewnętrzna poświata
        const innerGeo = new THREE.CircleGeometry(range * 0.95, 48);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xffcc00, transparent: true, opacity: 0.06, side: THREE.DoubleSide
        });
        entity.auraInner = new THREE.Mesh(innerGeo, innerMat);
        entity.auraInner.position.z = 1.4;
        this.scene.add(entity.auraInner);
        entity.auraInnerMat = innerMat;
    }

    updateAura(entity, dt, monsters, owner) {
        const auraWeapon = entity.weapons.find(w => w?.type === 'aura');
        if (!auraWeapon || !entity.auraRing) return;

        const range = this.getWeaponStat(auraWeapon, 'range', entity);
        const dmg = this.getWeaponStat(auraWeapon, 'dmg', entity);

        // Aktualizuj range jeśli się zmienił
        if (Math.abs(range - entity.lastAuraRange) > 2) {
            this.setupAura(entity);
        }

        // Pozycja
        entity.auraRing.position.set(entity.x, entity.y, 1.5);
        if (entity.auraInner) {
            entity.auraInner.position.set(entity.x, entity.y, 1.4);
        }

        // Rotacja (kręcąca się aura)
        entity.auraRing.rotation.z += dt * 0.8;
        if (entity.auraInner) {
            entity.auraInner.rotation.z -= dt * 0.4;
        }

        // Pulsowanie
        const pulse = 1 + Math.sin(Date.now() * 0.004) * 0.08;
        entity.auraRing.scale.set(pulse, pulse, 1);

        const opacity = 0.25 + Math.sin(Date.now() * 0.003) * 0.1;
        entity.auraMat.opacity = opacity;

        if (entity.auraInnerMat) {
            entity.auraInnerMat.opacity = 0.04 + Math.sin(Date.now() * 0.005) * 0.02;
        }

        // Obrażenia
        for (const m of monsters) {
            if (m.hp <= 0) continue;
            const dist = Math.hypot(m.x - entity.x, m.y - entity.y);
            if (dist < range) {
                m.takeDamage(dmg * dt);
                if (owner === entity && entity.totalDmg !== undefined) {
                    entity.totalDmg += dmg * dt;
                }
            }
        }
    }

    // ── Helper: spawn bullet ────────────────────────────────

    spawnBullet(entity, angle, speed, dmg, sz, bounces, pierce, col, wtype, bullets, owner) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const b = new Bullet(
            entity.x + Math.cos(angle) * 15,
            entity.y + Math.sin(angle) * 15,
            vx, vy, dmg, owner, wtype, sz, bounces, pierce, col, this.scene
        );

        bullets.push(b);
        return b;
    }

    // ── Helper: znajdź najbliższy cel ───────────────────────

    findNearest(entity, monsters, range) {
        let nearest = null;
        let nearestDist = range;

        for (const m of monsters) {
            if (m.hp <= 0) continue;
            const d = Math.hypot(m.x - entity.x, m.y - entity.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = m;
            }
        }

        return nearest;
    }

    // ── Helper: znajdź najgęstszą grupę wrogów ─────────────

    findDensestGroup(entity, monsters, range) {
        let bestTarget = null;
        let bestDensity = 0;

        const nearby = monsters.filter(m =>
            m.hp > 0 && Math.hypot(m.x - entity.x, m.y - entity.y) < range
        );

        if (nearby.length === 0) return null;

        for (const m of nearby) {
            let density = 0;
            for (const other of nearby) {
                if (Math.hypot(other.x - m.x, other.y - m.y) < 150) {
                    density++;
                }
            }

            if (density > bestDensity) {
                bestDensity = density;
                bestTarget = m;
            }
        }

        return bestTarget || nearby[0];
    }
}