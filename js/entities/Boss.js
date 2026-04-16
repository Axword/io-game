// entities/Boss.js
import { Monster } from './Monster.js';
import { mkShape } from '../utils/geometry.js';
import { norm, rng } from '../utils/math.js';
import { Bullet } from './Bullet.js';

export class Boss extends Monster {
    constructor(x, y, bossData, scene) {
        super(x, y, 0, [], scene, 1.0, true);
        
        this.bossData = bossData;
        this.maxHp = bossData.hp;
        this.hp = this.maxHp;
        this.dmg = bossData.dmg;
        this.spd = bossData.spd;
        this.sz = bossData.sz;
        this.xp = bossData.xp;
        this.type = bossData.shape;
        this.baseColor = bossData.col;
        this.abilities = bossData.abilities;
        
        this.createMesh(bossData.shape, this.sz, this.baseColor, false);
        this.createBossVisuals();
        
        this.abilityTimer = rng(2, 4);
        this.teleportCooldown = 0;
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.shieldMesh = null;
        this.abilityEffects = [];
    }
    
    createBossVisuals() {
        if (this.outline) this.scene.remove(this.outline);
        
        this.outline = mkShape(this.type, this.sz * 1.15, 0xffff00);
        this.outline.material.transparent = true;
        this.outline.material.opacity = 0.6;
        this.outline.position.set(this.x, this.y, 1.9);
        this.scene.add(this.outline);
        
        this.glow = mkShape(this.type, this.sz * 1.3, 0xffffff);
        this.glow.material.transparent = true;
        this.glow.material.opacity = 0.2;
        this.glow.position.set(this.x, this.y, 1.8);
        this.scene.add(this.glow);
        
        this.nameTag = this.createNameTag(this.bossData.emoji + ' ' + this.bossData.name);
    }
    
    createNameTag(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffff00';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(text, 128, 40);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(80, 20, 1);
        sprite.position.set(this.x, this.y + this.sz + 30, 3);
        this.scene.add(sprite);
        return sprite;
    }
    
    update(dt, targets, safeRadius, bullets, scene) {
        super.update(dt, targets, safeRadius, bullets, scene);
        
        if (this.teleportCooldown > 0) this.teleportCooldown -= dt;
        
        this.updateShieldState(dt);
        
        this.abilityTimer -= dt;
        if (this.abilityTimer <= 0 && this.currentTarget) {
            this.abilityTimer = rng(3, 6);
            this.useAbility(this.currentTarget, targets, bullets, scene);
        }
        
        this.updateBossVisuals(dt);
        this.updateAbilityEffects(dt);
    }

    updateShieldState(dt) {
        if (!this.shieldActive) return;
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) {
            this.deactivateShield();
        } else if (this.shieldMesh) {
            this.shieldMesh.position.set(this.x, this.y, 2.2);
            this.shieldMesh.rotation.z += 0.05;
            this.shieldMesh.material.opacity = 0.4 + Math.sin(Date.now() * 0.01) * 0.2;
        }
    }
    
    useAbility(target, allTargets, bullets, scene) {
        const ability = this.abilities[Math.floor(Math.random() * this.abilities.length)];
        const abilityMap = {
            shockwave: () => this.useShockwave(bullets, scene),
            charge: () => this.useCharge(target),
            laser: () => this.useLaser(allTargets, bullets, scene),
            meteor: () => this.useMeteor(target, bullets, scene),
            teleport: () => this.useTeleport(target),
            shield: () => this.useShield()
        };
        abilityMap[ability]?.();
    }
    
    useShockwave(bullets, scene) {
        const numProjectiles = 12;
        for (let i = 0; i < numProjectiles; i++) {
            const angle = (Math.PI * 2 / numProjectiles) * i;
            this.createBullet(
                Math.cos(angle) * 10, Math.sin(angle) * 10,
                this.dmg * 0.8, 0xff00ff, 1.8, 5, bullets, scene
            );
        }
        this.addEffect('ring', this.x, this.y, this.sz * 1.5, 0xff00ff, true);
    }
    
    useCharge(target) {
        const [nx, ny] = norm(target.x - this.x, target.y - this.y);
        const chargeDistance = 250;
        const oldX = this.x, oldY = this.y;
        this.x += nx * chargeDistance;
        this.y += ny * chargeDistance;
        this.createChargeTrail(oldX, oldY, this.x, this.y);
        this.addEffect('ring', this.x, this.y, this.sz * 1.5, 0xffaa00, false);
    }
    
    useLaser(allTargets, bullets, scene) {
        const sorted = allTargets.filter(t => t.hp > 0)
            .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
        
        for (let i = 0; i < Math.min(3, sorted.length); i++) {
            const tgt = sorted[i];
            const [nx, ny] = norm(tgt.x - this.x, tgt.y - this.y);
            this.createLaserBeam(this.x, this.y, tgt.x, tgt.y);
            this.createBullet(nx * 18, ny * 18, this.dmg * 1.2, 0x00ffff, 2.5, 6, bullets, scene, 1);
        }
        this.addEffect('ring', this.x, this.y, this.sz * 1.5, 0x00ffff, true);
    }
    
    useMeteor(target, bullets, scene) {
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i;
            const offsetX = Math.cos(angle) * rng(100, 200);
            const offsetY = Math.sin(angle) * rng(100, 200);
            
            setTimeout(() => {
                const targetX = target.x + offsetX;
                const targetY = target.y + offsetY;
                this.createMeteorWarning(targetX, targetY);
                
                setTimeout(() => {
                    const bullet = new Bullet(targetX, targetY, 0, 0, this.dmg * 1.5, 'boss', 'mine', 4, 0, 0, 0xff4400, scene);
                    bullet.life = 1.5;
                    bullets.push(bullet);
                    this.createMeteorImpact(targetX, targetY);
                }, 500);
            }, i * 150);
        }
    }
    
    useTeleport(target) {
        if (this.teleportCooldown > 0) return;
        
        const angle = Math.random() * Math.PI * 2;
        const distance = rng(200, 300);
        
        this.addEffect('ring', this.x, this.y, this.sz * 2, 0xaa00ff, true);
        this.x = target.x + Math.cos(angle) * distance;
        this.y = target.y + Math.sin(angle) * distance;
        this.addEffect('ring', this.x, this.y, this.sz * 2, 0xaa00ff, true);
        
        this.teleportCooldown = 5;
    }
    
    useShield() {
        if (this.shieldActive) return;
        this.shieldActive = true;
        this.shieldTimer = 4;
        this.shieldMesh = this.createRing(this.sz * 1.2, this.sz * 1.4, 0x00aaff, 0.6, 2.2);
    }
    
    deactivateShield() {
        this.shieldActive = false;
        if (this.shieldMesh) {
            this.scene.remove(this.shieldMesh);
            this.shieldMesh = null;
        }
    }

    createBullet(vx, vy, dmg, col, sz, life, bullets, scene, pierce = 0) {
        const bullet = new Bullet(this.x, this.y, vx, vy, dmg, 'boss', 'wand', sz, 0, pierce, col, scene);
        bullet.life = life;
        bullets.push(bullet);
    }

    addEffect(type, x, y, size, color, growing, life = 0.5) {
        const geo = new THREE.RingGeometry(size * 0.8, size, 32);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 2.1);
        this.scene.add(mesh);
        this.abilityEffects.push({ mesh, life, maxLife: life, growing });
    }
    
    createChargeTrail(x1, y1, x2, y2) {
        for (let i = 0; i < 10; i++) {
            const t = i / 10;
            setTimeout(() => {
                const mesh = this.createCircle(this.sz * 0.5, 0xffaa00, 0.6, 1.5);
                mesh.position.set(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 1.5);
                this.abilityEffects.push({ mesh, life: 0.3, maxLife: 0.3, growing: false });
            }, i * 30);
        }
    }
    
    createLaserBeam(x1, y1, x2, y2) {
        const length = Math.hypot(x2 - x1, y2 - y1);
        const geo = new THREE.PlaneGeometry(length, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, 2.3);
        mesh.rotation.z = Math.atan2(y2 - y1, x2 - x1);
        this.scene.add(mesh);
        this.abilityEffects.push({ mesh, life: 0.2, maxLife: 0.2, growing: false });
    }
    
    createMeteorWarning(x, y) {
        const mesh = this.createRing(30, 35, 0xff0000, 0.5, 1.5);
        mesh.position.set(x, y, 1.5);
        this.abilityEffects.push({ mesh, life: 0.5, maxLife: 0.5, growing: false, pulsing: true });
    }
    
    createMeteorImpact(x, y) {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const size = (i + 1) * 25;
                const geo = new THREE.RingGeometry(size * 0.8, size, 32);
                const mat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(x, y, 2.2);
                this.scene.add(mesh);
                this.abilityEffects.push({ mesh, life: 0.4, maxLife: 0.4, growing: true });
            }, i * 50);
        }
    }
    
    updateAbilityEffects(dt) {
        for (let i = this.abilityEffects.length - 1; i >= 0; i--) {
            const effect = this.abilityEffects[i];
            effect.life -= dt;
            
            if (effect.life <= 0) {
                this.scene.remove(effect.mesh);
                this.abilityEffects.splice(i, 1);
                continue;
            }
            
            const progress = 1 - (effect.life / effect.maxLife);
            if (effect.growing) effect.mesh.scale.set(1 + progress, 1 + progress, 1);
            effect.mesh.material.opacity = effect.pulsing ? 0.3 + Math.sin(Date.now() * 0.02) * 0.2 : effect.life / effect.maxLife;
        }
    }
    
    updateBossVisuals(dt) {
        if (this.glow) {
            this.glow.position.set(this.x, this.y, 1.8);
            this.glow.rotation.z = -this.mesh.rotation.z;
            this.glow.material.opacity = 0.2 + Math.sin(Date.now() * 0.003) * 0.1;
        }
        if (this.nameTag) this.nameTag.position.set(this.x, this.y + this.sz + 30, 3);
    }
    
    takeDamage(amount) {
        super.takeDamage(this.shieldActive ? amount * 0.3 : amount);
        this.hitTimer = 0.15;
    }
    
    destroy() {
        super.destroy();
        this.removeMesh(this.glow);
        this.removeMesh(this.nameTag);
        this.removeMesh(this.shieldMesh);
        for (const effect of this.abilityEffects) this.scene.remove(effect.mesh);
        this.abilityEffects = [];
    }
}