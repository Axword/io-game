export class Bullet {
    constructor(x, y, vx, vy, dmg, owner, wtype, sz, bounces, pierce, col, scene) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.dmg = dmg;
        this.owner = owner;
        this.wtype = wtype;
        this.sz = sz || 1;
        this.bounces = bounces;
        this.pierce = pierce;
        this.col = col;
        this.scene = scene;
        this.life = this.getLifetime(wtype);
        this.hit = new Set();
        this.hitCount = 0;
        this.isMine = (wtype === 'mine');
        this.animTime = 0;
        this.trail = [];
        this.trailTimer = 0;
        
        this.createMesh(wtype, this.sz, col);
    }

    getLifetime(wtype) {
        return {
            mine: 8, laser: 1.5, poison: 5,
            fireball: 6, meteor: 4, sword: 999
        }[wtype] || 8;
    }

    createMesh(wtype, sz, col) {
        const geo = this.createGeometry(wtype, sz);
        const mat = new THREE.MeshBasicMaterial({ 
            color: col,
            transparent: ['mine', 'poison', 'laser'].includes(wtype),
            opacity: this.getOpacity(wtype),
            side: THREE.DoubleSide
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(this.x, this.y, 2.5);
        
        if (wtype === 'axe' || wtype === 'sword') this.createOutlines(wtype, sz, col);
        if (wtype === 'bow' || wtype === 'knife') this.mesh.rotation.z = Math.atan2(this.vy, this.vx);
        if (wtype === 'laser') this.createLaserGlow(sz, col);
        if (wtype === 'fireball') this.createFireGlow(sz, col);
        
        this.scene.add(this.mesh);
    }

    getOpacity(wtype) {
        return { mine: 0.7, poison: 0.4, laser: 0.8, fireball: 0.9 }[wtype] || 1;
    }

    createGeometry(wtype, sz) {
        switch (wtype) {
            case 'bow':
                return new THREE.PlaneGeometry(sz * 20, sz * 6);
                
            case 'knife':
                return new THREE.PlaneGeometry(sz * 15, sz * 4);
                
            case 'mine':
                return new THREE.CircleGeometry(sz * 10, 16);
                
            case 'laser':
                return new THREE.PlaneGeometry(2000, sz * 30);
                
            case 'poison':
                return new THREE.CircleGeometry(sz * 120, 32);
                
            case 'fireball': {
                // Użyj CircleGeometry zamiast SphereGeometry (widok z góry!)
                return new THREE.CircleGeometry(sz * 12, 16);
            }
                
            case 'meteor': {
                // Gwiazdka zamiast DodecahedronGeometry
                const s = new THREE.Shape();
                const r = sz * 18;
                const spikes = 6;
                for (let i = 0; i < spikes * 2; i++) {
                    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
                    const radius = i % 2 === 0 ? r : r * 0.5;
                    if (i === 0) s.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
                    else s.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
                }
                s.closePath();
                return new THREE.ShapeGeometry(s);
            }
            
            case 'sword': {
                const s = new THREE.Shape();
                const scale = sz * 16;
                s.moveTo(0, scale * 1.5);
                s.lineTo(-scale * 0.4, scale * 0.4);
                s.lineTo(-scale * 0.15, scale * 0.2);
                s.lineTo(-scale * 0.15, -scale * 0.7);
                s.lineTo(-scale * 0.3, -scale * 0.75);
                s.lineTo(-scale * 0.3, -scale * 0.9);
                s.lineTo(0, -scale);
                s.lineTo(scale * 0.3, -scale * 0.9);
                s.lineTo(scale * 0.3, -scale * 0.75);
                s.lineTo(scale * 0.15, -scale * 0.7);
                s.lineTo(scale * 0.15, scale * 0.2);
                s.lineTo(scale * 0.4, scale * 0.4);
                s.closePath();
                return new THREE.ShapeGeometry(s);
            }
            
            case 'axe': {
                const s = new THREE.Shape();
                const scale = sz * 14;
                // Ostrze toporu (szeroka górna część)
                s.moveTo(0, scale * 1.2);
                s.lineTo(-scale * 0.9, scale * 0.3);
                s.lineTo(-scale * 0.95, scale * 0.15);
                s.lineTo(-scale * 0.7, 0);
                // Trzonek (wąska dolna część)
                s.lineTo(-scale * 0.2, -scale * 0.3);
                s.lineTo(-scale * 0.15, -scale * 0.9);
                s.lineTo(0, -scale);
                s.lineTo(scale * 0.15, -scale * 0.9);
                s.lineTo(scale * 0.2, -scale * 0.3);
                // Ostrze prawa strona
                s.lineTo(scale * 0.7, 0);
                s.lineTo(scale * 0.95, scale * 0.15);
                s.lineTo(scale * 0.9, scale * 0.3);
                s.closePath();
                return new THREE.ShapeGeometry(s);
            }
            
            default:
                return new THREE.CircleGeometry(sz * 6, 12);
        }
    }

    createOutlines(wtype, sz, col) {
        const outerGeo = this.createGeometry(wtype, sz * 1.3);
        const innerGeo = this.createGeometry(wtype, sz * 1.15);
        
        this.whiteOutline = new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({
            color: 0xffffff, side: THREE.DoubleSide
        }));
        this.whiteOutline.position.set(this.x, this.y, 2.35);
        this.scene.add(this.whiteOutline);
        
        this.outline = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({
            color: 0x000000, side: THREE.DoubleSide
        }));
        this.outline.position.set(this.x, this.y, 2.4);
        this.scene.add(this.outline);
    }

    createLaserGlow(sz, col) {
        const geo = new THREE.PlaneGeometry(2000, sz * 50);
        this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.2, side: THREE.DoubleSide
        }));
        this.glow.position.set(this.x, this.y, 2.3);
        this.scene.add(this.glow);
    }

    createFireGlow(sz, col) {
        const geo = new THREE.CircleGeometry(sz * 18, 16);
        this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 0.25
        }));
        this.glow.position.set(this.x, this.y, 2.3);
        this.scene.add(this.glow);
    }
    
    update(dt) {
        this.animTime += dt;

        // ── Ruch ────────────────────────────────────────────────
        if (this.wtype === 'sword' && this.owner && typeof this.owner === 'object' && this.owner.x !== undefined) {
            // Miecz orbituje wokół właściciela
            const weapon = this.owner.weapons ? this.owner.weapons.find(w => w && w.type === 'sword') : null;
            const speed = weapon ? (weapon.stats.speed || 3) : 3;
            const orbit = weapon ? (weapon.stats.orbit || 120) : 120;
            const angle = this.animTime * speed;
            this.x = this.owner.x + Math.cos(angle) * orbit;
            this.y = this.owner.y + Math.sin(angle) * orbit;
        } else if (this.wtype === 'laser' && this.owner && typeof this.owner === 'object' && this.owner.x !== undefined) {
            // Laser zostaje przy właścicielu
            this.x = this.owner.x;
            this.y = this.owner.y;
        } else if (this.wtype === 'poison') {
            // Trucizna stoi w miejscu
        } else if (!this.isMine) {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
        }
        
        this.life -= dt;
        
        // ── Pozycja ─────────────────────────────────────────────
        this.mesh.position.set(this.x, this.y, 2.5);
        
        // ── Rotacja ─────────────────────────────────────────────
        switch (this.wtype) {
            case 'axe':
                this.mesh.rotation.z += dt * 8;
                break;
            case 'sword':
                this.mesh.rotation.z += dt * 10;
                break;
            case 'mine':
                this.mesh.rotation.z += dt * 2;
                break;
            case 'meteor':
                this.mesh.rotation.z += dt * 5;
                break;
            case 'fireball':
                this.mesh.rotation.z += dt * 3;
                break;
        }
        
        // ── Animacje ────────────────────────────────────────────
        this.updateAnimations(dt);
        
        // ── Outline sync ────────────────────────────────────────
        if (this.outline) {
            this.outline.position.set(this.x, this.y, 2.4);
            this.outline.rotation.z = this.mesh.rotation.z;
        }
        if (this.whiteOutline) {
            this.whiteOutline.position.set(this.x, this.y, 2.35);
            this.whiteOutline.rotation.z = this.mesh.rotation.z;
        }
        if (this.glow) {
            this.glow.position.set(this.x, this.y, 2.3);
            this.glow.rotation.z = this.mesh.rotation.z;
        }

        // ── Trail ───────────────────────────────────────────────
        this.updateTrail(dt);
    }

    updateAnimations(dt) {
        switch (this.wtype) {
            case 'fireball': {
                const s = 1 + Math.sin(this.animTime * 5) * 0.2;
                this.mesh.scale.set(s, s, 1);
                if (this.glow) {
                    const gs = 1 + Math.sin(this.animTime * 3) * 0.3;
                    this.glow.scale.set(gs, gs, 1);
                    this.glow.material.opacity = 0.15 + Math.sin(this.animTime * 4) * 0.1;
                }
                break;
            }
            case 'poison': {
                const s = 1 + Math.sin(this.animTime * 2) * 0.1;
                this.mesh.scale.set(s, s, 1);
                this.mesh.material.opacity = 0.25 + Math.sin(this.animTime * 3) * 0.15;
                break;
            }
            case 'laser': {
                this.mesh.material.opacity = 0.6 + Math.sin(this.animTime * 20) * 0.3;
                if (this.glow) this.glow.material.opacity = 0.1 + Math.sin(this.animTime * 15) * 0.1;
                break;
            }
            case 'mine': {
                if (this.life < 1) {
                    this.mesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.02) * 0.3;
                }
                break;
            }
            case 'meteor': {
                const s = 1 + Math.sin(this.animTime * 4) * 0.15;
                this.mesh.scale.set(s, s, 1);
                break;
            }
        }
    }

    updateTrail(dt) {
        if (!['bow', 'knife', 'meteor', 'fireball', 'axe'].includes(this.wtype)) return;
        
        this.trailTimer += dt;
        if (this.trailTimer < 0.04) return;
        this.trailTimer = 0;
        
        // Limit trail particles
        if (this.trail.length > 8) {
            const old = this.trail.shift();
            this.scene.remove(old.mesh);
        }
        
        const size = this.wtype === 'fireball' ? this.sz * 6 :
                     this.wtype === 'meteor' ? this.sz * 8 :
                     this.sz * 3;
        
        const geo = new THREE.CircleGeometry(size, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: this.col, transparent: true, opacity: 0.4
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.x, this.y, 2.2);
        this.scene.add(mesh);
        this.trail.push({ mesh, life: 0.25 });
        
        // Update existing trail
        this.trail = this.trail.filter(p => {
            p.life -= dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                return false;
            }
            p.mesh.material.opacity = (p.life / 0.25) * 0.4;
            return true;
        });
    }
    
    canHit() {
        return this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype) ||
               this.hitCount < (this.pierce + 1);
    }
    
    onHit() {
        if (this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype)) return;
        this.hitCount++;
        if (!this.canHit()) this.life = -1;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.whiteOutline) this.scene.remove(this.whiteOutline);
        if (this.glow) this.scene.remove(this.glow);
        this.trail.forEach(p => this.scene.remove(p.mesh));
        this.trail = [];
    }
}