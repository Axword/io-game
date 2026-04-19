// entities/Monster.js
import { Entity } from './Entity.js';
import { mkShape } from '../utils/geometry.js';
import { rng, getZoneIdx } from '../utils/math.js';
import { Bullet } from './Bullet.js';
import { MONSTER_CONFIG } from '../config/monsters.js';

export class Monster extends Entity {
    constructor(x, y, zoneIdx, zones, scene, hpMult = 1.0, isBoss = false) {
        super(x, y, scene);
        this.id = Math.random().toString(36).substring(2, 8);
        this.zoneIdx = Math.max(0, zoneIdx);
        this.zones = zones;
        this.isBoss = isBoss;
        this.hitTimer = 0;
        this.shootTimer = rng(2, 4);
        this.currentTarget = null;
        this.outsideZoneTimer = 0;  
        this.despawnTimer = 0;
        this.state = 'attacking';
        this.retreatTarget = null;
        this.isDespawning = false;

        if (!isBoss) {
            this.initMonster(zones, hpMult);
        }
        
        this.canShoot = this.isBoss || this.zoneIdx <= 1;
        this.shootRange = this.getShootingStat('ranges');
        this.bulletSpeed = this.getShootingStat('speeds');
        this.bulletLifetime = this.getShootingStat('lifetimes');
    }

    getShootingStat(stat) {
        const data = MONSTER_CONFIG.shooting[stat];
        if (this.isBoss) return data.boss;
        return data[this.zoneIdx] || 0;
    }

    initMonster(zones, hpMult) {
        const z = zones[this.zoneIdx];
        const sc = z.mScale;
        const base = MONSTER_CONFIG.base;
        const bonus = MONSTER_CONFIG.zoneBonus;
        const elite = MONSTER_CONFIG.elite;
        const zoneMultiplier = 4 - this.zoneIdx;
        
        this.isElite = Math.random() < elite.chance;
        this.type = this.getShapeForZone();
        
        const eliteHpMult = this.isElite ? elite.hpMult : 1;
        const eliteSpeedMult = this.isElite ? elite.speedMult : 1;
        const eliteXpMult = this.isElite ? elite.xpMult : 1;
        const eliteSizeMult = this.isElite ? elite.sizeMult : 1;
        
        this.maxHp = Math.round((base.hp + zoneMultiplier * bonus.hp) * sc * eliteHpMult * hpMult);
        this.hp = this.maxHp;
        this.dmg = Math.round((base.dmg + zoneMultiplier * bonus.dmg) * sc);
        this.spd = (z.monsterSpeed || 1.4) * eliteSpeedMult;
        this.sz = (base.sz + zoneMultiplier * bonus.sz) * (0.85 + sc * 0.05) * eliteSizeMult;
        this.xp = Math.round((base.xp + zoneMultiplier * bonus.xp) * sc * eliteXpMult);
        this.baseColor = MONSTER_CONFIG.colors[Math.min(this.zoneIdx, MONSTER_CONFIG.colors.length - 1)];
        
        this.spawnZoneMin = z.minR;
        this.spawnZoneMax = z.maxR;
        
        this.createMesh(this.type, this.sz, this.baseColor, this.isElite);
    }

    getShapeForZone() {
        const zi = this.zoneIdx;
        const shapes = MONSTER_CONFIG.shapes;
        if (zi <= 1) return shapes.low[Math.floor(Math.random() * 2)];
        if (zi <= 3) return shapes.mid[Math.floor(Math.random() * 2)];
        if (Math.random() < 0.05) return shapes.mid[Math.floor(Math.random() * 2)];
        return shapes.high[Math.floor(Math.random() * 3)];
    }

    getLighterColor(color) {
        const r = Math.min(255, ((color >> 16) & 0xff) + 100);
        const g = Math.min(255, ((color >> 8) & 0xff) + 100);
        const b = Math.min(255, (color & 0xff) + 100);
        return (r << 16) | (g << 8) | b;
    }

    createMesh(shapeType, size, color, isElite = false) {
        const meshColor = isElite ? this.getLighterColor(color) : color;
        
        this.mesh = mkShape(shapeType, size, meshColor);
        this.mesh.position.set(this.x, this.y, 2);
        this.scene.add(this.mesh);
        
        this.createOutline(shapeType, size * 1.2, isElite ? 0xffff00 : 0x000000, isElite ? 0.6 : 0.2, 1.9);
        
        if (isElite) {
            this.glowRing = mkShape(shapeType, size * 1.4, 0xffaa00);
            this.glowRing.material.transparent = true;
            this.glowRing.material.opacity = 0.3;
            this.glowRing.position.set(this.x, this.y, 1.8);
            this.scene.add(this.glowRing);
        }
        
        this.createHealthBar(size, isElite);
    }

    createHealthBar(size, isElite = false) {
        const barWidth = this.isBoss ? size * 2 : size * 1.6;
        const barHeight = this.isBoss ? 6 : 3;
        const barOffset = this.isBoss ? size + 10 : size + 4;
        const bgColor = isElite || this.isBoss ? 0x442200 : 0x220000;
        const fgColor = this.isBoss ? 0xff0000 : (isElite ? 0xffaa00 : 0xff3333);
        
        this.hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(barWidth, barHeight),
            new THREE.MeshBasicMaterial({ color: bgColor })
        );
        this.hpBarBg.position.set(this.x, this.y + barOffset, 2.5);
        this.scene.add(this.hpBarBg);
        
        this.hpBarFg = new THREE.Mesh(
            new THREE.PlaneGeometry(barWidth, barHeight),
            new THREE.MeshBasicMaterial({ color: fgColor })
        );
        this.hpBarFg.position.set(this.x, this.y + barOffset, 2.6);
        this.scene.add(this.hpBarFg);
    }

    findNearestTarget(targets) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            
            if (dist < minDist) {
                minDist = dist;
                nearest = target;
            }
        }
        return { target: nearest, distance: minDist };
    }

    findTargetInMyZone(targets) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const targetZone = getZoneIdx(target.x, target.y, this.zones);
            if (targetZone !== this.zoneIdx) continue;
            
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist < minDist) {
                minDist = dist;
                nearest = target;
            }
        }
        return nearest;
    }

    isTargetInMyZone(target) {
        if (!target || this.isBoss) return true;
        return getZoneIdx(target.x, target.y, this.zones) === this.zoneIdx;
    }

    // ═══════════════════════════════════════════════════════
    //  NAPRAWIONY: punkt ucieczki WEWNĄTRZ swojej strefy
    // ═══════════════════════════════════════════════════════
    findRetreatPoint(targets) {
        const minR = this.spawnZoneMin || 0;
        const maxR = this.spawnZoneMax || 6000;
        // Cel: środek pierścienia strefy
        const targetDist = (minR + maxR) / 2;
        
        // Kierunek ucieczki - od najbliższego gracza
        const nearestPlayer = this.findNearestTarget(targets);
        let angle;
        
        if (nearestPlayer.target) {
            // Kąt od gracza do potwora (uciekamy OD gracza)
            const angleAway = Math.atan2(
                this.y - nearestPlayer.target.y,
                this.x - nearestPlayer.target.x
            );
            // Dodaj losowość ±45°
            angle = angleAway + (Math.random() - 0.5) * Math.PI / 2;
        } else {
            angle = Math.random() * Math.PI * 2;
        }
        
        // Punkt docelowy NA pierścieniu strefy
        let rx = Math.cos(angle) * targetDist;
        let ry = Math.sin(angle) * targetDist;
        
        // Walidacja: upewnij się że punkt jest w strefie
        const dist = Math.hypot(rx, ry);
        if (dist < minR || dist > maxR) {
            // Clampuj do strefy
            const clampedDist = Math.max(minR + 50, Math.min(maxR - 50, dist));
            rx = Math.cos(angle) * clampedDist;
            ry = Math.sin(angle) * clampedDist;
        }
        
        return { x: rx, y: ry };
    }

    // Sprawdź czy punkt (x,y) jest w mojej strefie
    isInMyZone(px, py) {
        const dist = Math.hypot(px, py);
        const minR = this.spawnZoneMin || 0;
        const maxR = this.spawnZoneMax || 6000;
        return dist >= minR && dist <= maxR;
    }

    // Ogranicz pozycję do swojej strefy (clamp)
    clampToMyZone(px, py) {
        const dist = Math.hypot(px, py);
        const minR = this.spawnZoneMin || 0;
        const maxR = this.spawnZoneMax || 6000;
        
        if (dist < 1) {
            // Jesteśmy w centrum, wypchnij na minR
            const rndAngle = Math.random() * Math.PI * 2;
            return {
                x: Math.cos(rndAngle) * (minR + 50),
                y: Math.sin(rndAngle) * (minR + 50)
            };
        }
        
        if (dist >= minR && dist <= maxR) {
            return { x: px, y: py }; // Już w strefie
        }
        
        // Clampuj odległość do pierścienia
        const clampedDist = Math.max(minR + 10, Math.min(maxR - 10, dist));
        const nx = px / dist;
        const ny = py / dist;
        return { x: nx * clampedDist, y: ny * clampedDist };
    }

    checkForNearbyPlayers(targets) {
        const detectionRange = 1100;
        
        for (const target of targets) {
            if (target.hp <= 0) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            
            if (dist < detectionRange) {
                const targetZone = getZoneIdx(target.x, target.y, this.zones);
                if (targetZone === this.zoneIdx || dist < 800) {
                    return target;
                }
            }
        }
        return null;
    }

    update(dt, targets, safeRadius, bullets, scene) {
        if (this.state === 'attacking') {
            this.handleAttacking(dt, targets, bullets, scene);
        } else if (this.state === 'returning') {
            this.handleReturning(dt, targets, bullets, scene);
        } else if (this.state === 'despawning') {
            this.handleDespawning(dt, targets, bullets, scene);
        }
        
        this.updateVisuals(dt);
    }

    handleAttacking(dt, targets, bullets, scene) {
        if (!this.currentTarget || this.currentTarget.hp <= 0) {
            this.currentTarget = this.findTargetInMyZone(targets);
            
            if (!this.currentTarget) {
                this.state = 'returning';
                this.outsideZoneTimer = 0;
                this.retreatTarget = this.findRetreatPoint(targets);
                return;
            }
        }
        
        const targetInZone = this.isTargetInMyZone(this.currentTarget);
        
        if (targetInZone) {
            this.outsideZoneTimer = 0;
            this.chaseAndAttack(dt, bullets, scene);
        } else {
            this.outsideZoneTimer += dt;
            
            if (this.outsideZoneTimer < MONSTER_CONFIG.chase.outsideZoneTimeout) {
                this.chaseAndAttack(dt, bullets, scene);
            } else {
                const newTarget = this.findTargetInMyZone(targets);
                if (newTarget) {
                    this.currentTarget = newTarget;
                    this.outsideZoneTimer = 0;
                } else {
                    this.state = 'returning';
                    this.outsideZoneTimer = 0;
                    this.retreatTarget = this.findRetreatPoint(targets);
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════
    //  NAPRAWIONY: ucieczka TYLKO w obrębie strefy
    // ═══════════════════════════════════════════════════════
    handleReturning(dt, targets, bullets, scene) {
        // Sprawdź czy gracze wrócili w pobliże
        const nearbyPlayer = this.checkForNearbyPlayers(targets);
        if (nearbyPlayer) {
            this.currentTarget = nearbyPlayer;
            this.state = 'attacking';
            this.outsideZoneTimer = 0;
            this.isDespawning = false;
            return;
        }
        
        // Wygeneruj cel jeśli brak
        if (!this.retreatTarget) {
            this.retreatTarget = this.findRetreatPoint(targets);
        }
        
        // Walidacja: czy cel ucieczki jest w mojej strefie
        if (!this.isInMyZone(this.retreatTarget.x, this.retreatTarget.y)) {
            const clamped = this.clampToMyZone(this.retreatTarget.x, this.retreatTarget.y);
            this.retreatTarget.x = clamped.x;
            this.retreatTarget.y = clamped.y;
        }
        
        const dx = this.retreatTarget.x - this.x;
        const dy = this.retreatTarget.y - this.y;
        const distToRetreat = Math.hypot(dx, dy);
        
        if (distToRetreat < 80) {
            this.state = 'despawning';
            this.despawnTimer = 0;
            this.isDespawning = true;
            return;
        }
        
        // Poruszaj się w stronę celu
        const newX = this.x + (dx / distToRetreat) * this.spd * 1.5 * dt * 55;
        const newY = this.y + (dy / distToRetreat) * this.spd * 1.5 * dt * 55;
        
        // Clampuj pozycję do strefy podczas ruchu
        const clamped = this.clampToMyZone(newX, newY);
        this.x = clamped.x;
        this.y = clamped.y;
    }


    handleDespawning(dt, targets, bullets, scene) {
        const nearbyPlayer = this.checkForNearbyPlayers(targets);
        if (nearbyPlayer) {
            this.currentTarget = nearbyPlayer;
            this.state = 'attacking';
            this.outsideZoneTimer = 0;
            this.despawnTimer = 0;
            this.isDespawning = false;
            return;
        }
        
        this.despawnTimer += dt;
        
        if (!this.isInMyZone(this.x, this.y)) {
            const clamped = this.clampToMyZone(this.x, this.y);
            this.x = clamped.x;
            this.y = clamped.y;
        }
        
        if (this.despawnTimer > MONSTER_CONFIG.despawn.timeout) {
            this.isDespawning = true;
            this.hp = -1;
        }
    }

    chaseAndAttack(dt, bullets, scene) {
        if (!this.currentTarget) return;
        
        const dx = this.currentTarget.x - this.x;
        const dy = this.currentTarget.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 2) return;
        
        const nx = dx / distance;
        const ny = dy / distance;
        
        if (this.canShoot && distance < this.shootRange) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                const cooldown = this.isBoss 
                    ? MONSTER_CONFIG.shooting.cooldowns.boss 
                    : MONSTER_CONFIG.shooting.cooldowns.normal;
                this.shootTimer = rng(cooldown[0], cooldown[1]);
                this.shootAtTarget(this.currentTarget, bullets, scene);
            }
        }
        
        const attackRange = this.isBoss 
            ? MONSTER_CONFIG.attack.bossRange 
            : MONSTER_CONFIG.attack.normalRange;
        const moveSpeed = distance < attackRange 
            ? this.spd * MONSTER_CONFIG.attack.slowdownFactor 
            : this.spd;
        
        this.x += nx * moveSpeed * dt * 55;
        this.y += ny * moveSpeed * dt * 55;
    }

    moveToward(targetX, targetY, speed, dt) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 1) return;
        this.x += (dx / distance) * speed * dt * 55;
        this.y += (dy / distance) * speed * dt * 55;
    }

    shootAtTarget(target, bullets, scene) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const len = Math.hypot(dx, dy);
        
        const bulletColor = this.isBoss ? 0xff00ff : (this.isElite ? 0xffaa44 : 0xff6666);
        const bulletSize = this.isBoss ? 1.5 : (this.isElite ? 1.2 : 1);
        
        const bullet = new Bullet(
            this.x, this.y,
            (dx / len) * this.bulletSpeed, (dy / len) * this.bulletSpeed,
            this.dmg * 0.4,
            this.isBoss ? 'boss' : 'monster',
            'wand', bulletSize, 0, 0, bulletColor, scene
        );
        bullet.life = this.bulletLifetime;
        bullets.push(bullet);
    }

    updateVisuals(dt) {
        this.mesh.position.set(this.x, this.y, 2);
        this.outline.position.set(this.x, this.y, 1.9);
        
        const rotationSpeed = this.state === 'despawning' ? 2.0 : 0.8;
        this.mesh.rotation.z += dt * rotationSpeed;
        this.outline.rotation.z = this.mesh.rotation.z;
        
        if (this.glowRing) {
            this.glowRing.position.set(this.x, this.y, 1.8);
            this.glowRing.rotation.z -= dt * 1.5;
            this.glowRing.material.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
        }
        
        this.updateHealthBar();
        this.updateHitEffect(dt);
        this.updateStateEffect();
    }

    updateHealthBar() {
        const hpPct = this.hp / this.maxHp;
        const barWidth = this.isBoss ? this.sz * 2 : this.sz * 1.6;
        const barOffset = this.isBoss ? this.sz + 10 : this.sz + 4;
        
        this.hpBarBg.position.set(this.x, this.y + barOffset, 2.5);
        this.hpBarFg.position.set(this.x - (barWidth * (1 - hpPct)) / 2, this.y + barOffset, 2.6);
        this.hpBarFg.scale.x = hpPct;
    }

    updateHitEffect(dt) {
        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
            this.mesh.material.color.setHex(0xffffff);
        } else {
            const color = this.isBoss ? this.baseColor : (this.isElite ? this.getLighterColor(this.baseColor) : this.baseColor);
            this.mesh.material.color.setHex(color);
        }
    }

    updateStateEffect() {
        const fading = this.state === 'despawning' || this.state === 'returning';
        const opacity = this.state === 'despawning' ? 
            Math.max(0.1, 0.7 - this.despawnTimer) : 
            (this.state === 'returning' ? 0.85 : 1);
        
        this.mesh.material.transparent = fading;
        this.mesh.material.opacity = opacity;
        this.outline.material.opacity = (this.isElite ? 0.6 : 0.2) * opacity;
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.hitTimer = 0.1;
        
        if (this.state === 'despawning' || this.state === 'returning') {
            this.state = 'attacking';
            this.outsideZoneTimer = 0;
            this.isDespawning = false;
        }
    }

    destroy() {
        super.destroy();
        this.removeMesh(this.glowRing);
        this.removeMesh(this.hpBarBg);
        this.removeMesh(this.hpBarFg);
    }
}