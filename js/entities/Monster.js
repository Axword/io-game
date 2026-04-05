import { mkShape } from '../utils/geometry.js';
import { rng, norm, getZoneIdx } from '../utils/math.js';
import { Bullet } from './Bullet.js';

export class Monster {
    constructor(x, y, zoneIdx, zones, scene, hpMult = 1.0) {
        this.x = x;
        this.y = y;
        this.zoneIdx = Math.max(0, zoneIdx);
        this.zones = zones;
        console.log(`Spawning monster in zone ${this.zoneIdx} at (${this.x.toFixed(1)}, ${this.y.toFixed(1)})`);
        this.scene = scene;
        
        const zi = this.zoneIdx;
        const z = zones[zi];
        const sc = z.mScale;
        
        this.isElite = Math.random() < 0.01;
        
        const shapeType = this.getShapeForZone(zi);
        
        const baseHp = 20 + zi * 15;
        const baseDmg = 8 + zi * 5;
        const baseSz = 14 + zi * 4;
        const baseXp = 10 + zi * 8;
        
        const eliteMult = this.isElite ? 5 : 1;
        const eliteSpeedMult = this.isElite ? 1.25 : 1;
        const eliteXpMult = this.isElite ? 10 : 1;
        
        this.maxHp = Math.round(baseHp * sc * eliteMult * hpMult);
        this.hp = this.maxHp;
        this.dmg = Math.round(baseDmg * sc);
        this.spd = (z.monsterSpeed || 1.4) * eliteSpeedMult;
        this.sz = baseSz * (0.85 + sc * 0.05) * (this.isElite ? 1.3 : 1);
        this.xp = Math.round(baseXp * sc * eliteXpMult);
        this.type = shapeType;
        this.baseColor = this.getColorForZone(zi);
        
        const meshColor = this.isElite ? this.getLighterColor(this.baseColor) : this.baseColor;
        
        this.mesh = mkShape(shapeType, this.sz, meshColor);
        this.mesh.position.set(x, y, 2);
        scene.add(this.mesh);
        
        const outlineColor = this.isElite ? 0xffff00 : 0x000000;
        const outlineOpacity = this.isElite ? 0.6 : 0.2;
        
        this.outline = mkShape(shapeType, this.sz * 1.2, outlineColor);
        this.outline.material.transparent = true;
        this.outline.material.opacity = outlineOpacity;
        this.outline.position.set(x, y, 1.9);
        scene.add(this.outline);
        
        if (this.isElite) {
            this.glowRing = mkShape(shapeType, this.sz * 1.4, 0xffaa00);
            this.glowRing.material.transparent = true;
            this.glowRing.material.opacity = 0.3;
            this.glowRing.position.set(x, y, 1.8);
            scene.add(this.glowRing);
        }
        
        this.hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(this.sz * 1.6, 3),
            new THREE.MeshBasicMaterial({ color: this.isElite ? 0x442200 : 0x220000 })
        );
        this.hpBarBg.position.set(x, y + this.sz + 4, 2.5);
        scene.add(this.hpBarBg);
        
        this.hpBarFg = new THREE.Mesh(
            new THREE.PlaneGeometry(this.sz * 1.6, 3),
            new THREE.MeshBasicMaterial({ color: this.isElite ? 0xffaa00 : 0xff3333 })
        );
        this.hpBarFg.position.set(x, y + this.sz + 4, 2.6);
        scene.add(this.hpBarFg);
        
        this.hitTimer = 0;
        this.shootTimer = rng(1, 3);
        this.spawnZoneMin = z.minR;
        this.spawnZoneMax = z.maxR;
        
        this.currentTarget = null;
        this.chaseTimer = 0;
        this.returnTimer = 0;
        this.state = 'idle';
    }
    
    getShapeForZone(zi) {
        if (zi === 3 || zi === 4) {
            return ['tri', 'sq'][Math.floor(Math.random() * 2)];
        } else if (zi === 1 || zi === 2) {
            return ['pent', 'hex'][Math.floor(Math.random() * 2)];
        } else {
            const eliteChance = Math.random();
            if (eliteChance < 0.05) {
                return ['tri', 'sq', 'pent', 'hex'][Math.floor(Math.random() * 4)];
            } else {
                return ['hept', 'oct', 'non'][Math.floor(Math.random() * 3)];
            }
        }
    }
    
    getColorForZone(zi) {
        const colors = [0x880000, 0xaa0000, 0x660066, 0x006666, 0x555555, 0x330033];
        return colors[Math.min(zi, colors.length - 1)];
    }
    
    getLighterColor(color) {
        const r = ((color >> 16) & 0xff);
        const g = ((color >> 8) & 0xff);
        const b = (color & 0xff);
        
        const newR = Math.min(255, r + 100);
        const newG = Math.min(255, g + 100);
        const newB = Math.min(255, b + 100);
        
        return (newR << 16) | (newG << 8) | newB;
    }
    
    findNearestTarget(targets) {
        let nearest = null;
        let minDist = Infinity;
        
        for (const target of targets) {
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            const targetZone = getZoneIdx(target.x, target.y, this.zones);
            
            if (targetZone === this.zoneIdx && dist < minDist) {
                minDist = dist;
                nearest = target;
            }
        }
        
        return { target: nearest, distance: minDist };
    }
    
    isInMyZone() {
        const dist = Math.hypot(this.x, this.y);
        return dist >= this.spawnZoneMin && dist <= this.spawnZoneMax;
    }
    
    isTargetInMyZone(target) {
        if (!target) return false;
        const targetZone = getZoneIdx(target.x, target.y, this.zones);
        return targetZone === this.zoneIdx;
    }
    
    update(dt, targets, safeRadius, bullets, scene) {
        const inMyZone = this.isInMyZone();
        
        if (this.state === 'idle' || this.state === 'wandering') {
            const { target, distance } = this.findNearestTarget(targets);
            
            if (target && distance < 800) {
                this.currentTarget = target;
                this.state = 'chasing';
                this.chaseTimer = 0;
            } else if (this.zoneIdx === 0) {
                this.state = 'wandering';
                this.wanderBehavior(dt);
            }
        }
        
        if (this.state === 'chasing') {
            if (!this.currentTarget || this.currentTarget.hp <= 0) {
                this.currentTarget = null;
                this.state = 'idle';
                return;
            }
            
            const targetInZone = this.isTargetInMyZone(this.currentTarget);
            
            if (targetInZone) {
                this.chaseTimer = 0;
            } else {
                this.chaseTimer += dt;
            }
            
            if (this.chaseTimer > 3.5) {
                this.state = 'returning';
                this.returnTimer = 0;
                this.currentTarget = null;
            } else {
                this.chaseTarget(dt, bullets, scene);
            }
        }
        
        if (this.state === 'returning') {
            this.returnTimer += dt;
            
            if (inMyZone) {
                this.state = 'idle';
                this.returnTimer = 0;
            } else {
                const { target, distance } = this.findNearestTarget(targets);
                
                if (target && distance < 400 && this.isTargetInMyZone(target)) {
                    this.currentTarget = target;
                    this.state = 'chasing';
                    this.chaseTimer = 0;
                } else {
                    this.returnToZone(dt);
                    
                    if (this.returnTimer > 10) {
                        this.hp = -1;
                        return;
                    }
                }
            }
        }
        
        this.updateVisuals(dt);
    }
    
    wanderBehavior(dt) {
        if (!this.wanderAngle || Math.random() < 0.02) {
            this.wanderAngle = Math.random() * Math.PI * 2;
        }
        
        const moveSpeed = this.spd * 0.3;
        const nextX = this.x + Math.cos(this.wanderAngle) * moveSpeed * dt * 55;
        const nextY = this.y + Math.sin(this.wanderAngle) * moveSpeed * dt * 55;
        const nextDist = Math.hypot(nextX, nextY);
        
        if (nextDist >= this.spawnZoneMin && nextDist <= this.spawnZoneMax) {
            this.x = nextX;
            this.y = nextY;
        } else {
            this.wanderAngle = Math.random() * Math.PI * 2;
        }
    }
    
    chaseTarget(dt, bullets, scene) {
        const dx = this.currentTarget.x - this.x;
        const dy = this.currentTarget.y - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 2) return;
        
        const nx = dx / distance;
        const ny = dy / distance;
        
        this.shootTimer -= dt;
        if (this.shootTimer <= 0 && distance < 600) {
            this.shootTimer = rng(1.5, 3);
            this.shootAtTarget(this.currentTarget, bullets, scene);
        }
        
        const attackRange = 50;
        const moveSpeed = distance < attackRange ? this.spd * 0.5 : this.spd;
        
        this.x += nx * moveSpeed * dt * 55;
        this.y += ny * moveSpeed * dt * 55;
    }
    
    returnToZone(dt) {
        const centerX = 0;
        const centerY = 0;
        
        const targetDist = (this.spawnZoneMin + this.spawnZoneMax) / 2;
        const currentAngle = Math.atan2(this.y, this.x);
        
        const targetX = Math.cos(currentAngle) * targetDist;
        const targetY = Math.sin(currentAngle) * targetDist;
        
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);
        
        if (distance < 10) {
            this.state = 'idle';
            return;
        }
        
        const nx = dx / distance;
        const ny = dy / distance;
        
        this.x += nx * this.spd * 1.2 * dt * 55;
        this.y += ny * this.spd * 1.2 * dt * 55;
    }
    
    shootAtTarget(target, bullets, scene) {
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const len = Math.hypot(dx, dy);
        const nx = dx / len;
        const ny = dy / len;
        
        const bullet = new Bullet(
            this.x, this.y,
            nx * 8, ny * 8,
            this.dmg * 0.5,
            'monster',
            'mine',
            this.isElite ? 1.3 : 1,
            0,
            0,
            this.isElite ? 0xffaa44 : 0xff4444,
            scene
        );
        bullet.life = 4;
        bullets.push(bullet);
    }
    
    updateVisuals(dt) {
        this.mesh.position.set(this.x, this.y, 2);
        this.outline.position.set(this.x, this.y, 1.9);
        this.mesh.rotation.z += dt * 0.8;
        this.outline.rotation.z = this.mesh.rotation.z;
        
        if (this.glowRing) {
            this.glowRing.position.set(this.x, this.y, 1.8);
            this.glowRing.rotation.z -= dt * 1.5;
            this.glowRing.material.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
        }
        
        const hpPct = this.hp / this.maxHp;
        this.hpBarBg.position.set(this.x, this.y + this.sz + 4, 2.5);
        this.hpBarFg.position.set(
            this.x - (this.sz * 1.6 * (1 - hpPct)) / 2,
            this.y + this.sz + 4,
            2.6
        );
        this.hpBarFg.scale.x = hpPct;
        
        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
            this.mesh.material.color.setHex(0xffffff);
        } else {
            this.mesh.material.color.setHex(this.isElite ? this.getLighterColor(this.baseColor) : this.baseColor);
        }
    }
    
    takeDamage(amount) {
        this.hp -= amount;
        this.hitTimer = 0.1;
        
        if (this.state === 'idle' || this.state === 'wandering') {
            this.state = 'chasing';
            this.chaseTimer = 0;
        }
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.glowRing) this.scene.remove(this.glowRing);
        if (this.hpBarBg) this.scene.remove(this.hpBarBg);
        if (this.hpBarFg) this.scene.remove(this.hpBarFg);
    }
}