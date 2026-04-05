import { mkShape } from '../utils/geometry.js';
import { norm, rng } from '../utils/math.js';

export class Boss {
    constructor(x, y, bossData, scene) {
        this.x = x;
        this.y = y;
        this.scene = scene;
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
        
        this.mesh = mkShape(bossData.shape, this.sz, this.baseColor);
        this.mesh.position.set(x, y, 2);
        scene.add(this.mesh);
        
        // Grubszy outline dla bossa
        this.outline = mkShape(bossData.shape, this.sz * 1.15, 0xffff00);
        this.outline.material.transparent = true;
        this.outline.material.opacity = 0.6;
        this.outline.position.set(x, y, 1.9);
        scene.add(this.outline);
        
        // Glow effect
        this.glow = mkShape(bossData.shape, this.sz * 1.3, 0xffffff);
        this.glow.material.transparent = true;
        this.glow.material.opacity = 0.2;
        this.glow.position.set(x, y, 1.8);
        scene.add(this.glow);
        
        // HP bar
        this.hpBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(this.sz * 2, 6),
            new THREE.MeshBasicMaterial({ color: 0x220000 })
        );
        this.hpBarBg.position.set(x, y + this.sz + 10, 2.5);
        scene.add(this.hpBarBg);
        
        this.hpBarFg = new THREE.Mesh(
            new THREE.PlaneGeometry(this.sz * 2, 6),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        this.hpBarFg.position.set(x, y + this.sz + 10, 2.6);
        scene.add(this.hpBarFg);
        
        // Name tag
        this.nameTag = this.createNameTag(bossData.emoji + ' ' + bossData.name);
        
        this.hitTimer = 0;
        this.abilityTimer = rng(2, 4);
        this.isBoss = true;
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
    
    update(dt, targets, bullets, scene) {
        let nearest = null;
        let nd = 9999;
        
        for (const t of targets) {
            const d = Math.hypot(t.x - this.x, t.y - this.y);
            if (d < nd) {
                nd = d;
                nearest = t;
            }
        }
        
        // Ruch
        if (nearest) {
            const dx = nearest.x - this.x;
            const dy = nearest.y - this.y;
            const len = Math.hypot(dx, dy);
            const nx = dx / len;
            const ny = dy / len;
            
            this.x += nx * this.spd * dt * 55;
            this.y += ny * this.spd * dt * 55;
        }
        
        // Użyj umiejętności
        this.abilityTimer -= dt;
        if (this.abilityTimer <= 0 && nearest) {
            this.abilityTimer = rng(3, 6);
            this.useAbility(nearest, targets, bullets, scene);
        }
        
        this.mesh.position.set(this.x, this.y, 2);
        this.outline.position.set(this.x, this.y, 1.9);
        this.glow.position.set(this.x, this.y, 1.8);
        this.nameTag.position.set(this.x, this.y + this.sz + 30, 3);
        
        // Animacja rotation i glow
        this.mesh.rotation.z += dt * 0.5;
        this.outline.rotation.z = this.mesh.rotation.z;
        this.glow.rotation.z = -this.mesh.rotation.z;
        this.glow.material.opacity = 0.2 + Math.sin(Date.now() * 0.003) * 0.1;
        
        // HP bar
        const hpPct = this.hp / this.maxHp;
        this.hpBarBg.position.set(this.x, this.y + this.sz + 10, 2.5);
        this.hpBarFg.position.set(
            this.x - (this.sz * 2 * (1 - hpPct)) / 2,
            this.y + this.sz + 10,
            2.6
        );
        this.hpBarFg.scale.x = hpPct;
        
        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
            this.mesh.material.color.setHex(0xffffff);
        } else {
            this.mesh.material.color.setHex(this.baseColor);
        }
    }
    
    useAbility(target, allTargets, bullets, scene) {
        const ability = this.abilities[Math.floor(Math.random() * this.abilities.length)];
        
        if (ability === 'shockwave') {
            // Fala uderzeniowa - 8 pocisków dookoła
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 / 8) * i;
                const nx = Math.cos(angle);
                const ny = Math.sin(angle);
                
                import('../entities/Bullet.js').then(module => {
                    const Bullet = module.Bullet;
                    const bullet = new Bullet(
                        this.x, this.y,
                        nx * 8, ny * 8,
                        this.dmg,
                        'boss',
                        'mine',
                        1.5,
                        0,
                        0,
                        0xff00ff,
                        scene
                    );
                    bullet.life = 5;
                    bullets.push(bullet);
                });
            }
        } else if (ability === 'charge') {
            // Szarża w stronę gracza
            const dx = target.x - this.x;
            const dy = target.y - this.y;
            const [nx, ny] = norm(dx, dy);
            this.x += nx * 200;
            this.y += ny * 200;
        } else if (ability === 'laser') {
            // Laser w stronę 3 najbliższych celów
            const sorted = [...allTargets].sort((a, b) => 
                Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y)
            );
            
            for (let i = 0; i < Math.min(3, sorted.length); i++) {
                const tgt = sorted[i];
                const dx = tgt.x - this.x;
                const dy = tgt.y - this.y;
                const [nx, ny] = norm(dx, dy);
                
                import('../entities/Bullet.js').then(module => {
                    const Bullet = module.Bullet;
                    const bullet = new Bullet(
                        this.x, this.y,
                        nx * 15, ny * 15,
                        this.dmg * 1.5,
                        'boss',
                        'mine',
                        2,
                        0,
                        0,
                        0x00ffff,
                        scene
                    );
                    bullet.life = 6;
                    bullets.push(bullet);
                });
            }
        } else if (ability === 'meteor') {
            // Meteory spadające wokół gracza
            for (let i = 0; i < 5; i++) {
                const offsetX = rng(-150, 150);
                const offsetY = rng(-150, 150);
                
                setTimeout(() => {
                    import('../entities/Bullet.js').then(module => {
                        const Bullet = module.Bullet;
                        const bullet = new Bullet(
                            target.x + offsetX, target.y + offsetY,
                            0, 0,
                            this.dmg * 2,
                            'boss',
                            'mine',
                            3,
                            0,
                            0,
                            0xff4400,
                            scene
                        );
                        bullet.life = 2;
                        bullets.push(bullet);
                    });
                }, i * 200);
            }
        }
    }
    
    takeDamage(amount) {
        this.hp -= amount;
        this.hitTimer = 0.15;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.glow) this.scene.remove(this.glow);
        if (this.hpBarBg) this.scene.remove(this.hpBarBg);
        if (this.hpBarFg) this.scene.remove(this.hpBarFg);
        if (this.nameTag) this.scene.remove(this.nameTag);
    }
}