export class Bullet {
    constructor(x, y, vx, vy, dmg, owner, wtype, sz, bounces, pierce, col, scene) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.dmg = dmg;
        this.owner = owner;
        this.wtype = wtype;
        this.sz = sz;
        this.bounces = bounces;
        this.pierce = pierce;
        this.scene = scene;
        this.life = this.getLifetime(wtype);
        this.hit = new Set();
        this.hitCount = 0;
        this.isMine = (wtype === 'mine');
        this.animTime = 0;
        this.trail = [];
        
        this.createMesh(wtype, sz, col);
        this.setupAnimation(wtype);
    }

    getLifetime(wtype) {
        const lifetimes = {
            'mine': 8,
            'laser': 1.5,
            'poison': 5,
            'fireball': 6,
            'meteor': 4,
            'sword': 999
        };
        return lifetimes[wtype] || 8;
    }

    createMesh(wtype, sz, col) {
        const geo = this.createGeometry(wtype, sz);
        const mat = new THREE.MeshBasicMaterial({ 
            color: col,
            transparent: wtype === 'mine' || wtype === 'poison' || wtype === 'fireball',
            opacity: this.getOpacity(wtype)
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(this.x, this.y, 2.5);
        
        if (wtype === 'axe' || wtype === 'sword') this.createAxeOutlines(geo);
        if (wtype === 'bow' || wtype === 'knife') this.mesh.rotation.z = Math.atan2(this.vy, this.vx);
        if (wtype === 'laser') this.createLaserBeam(sz, col);
        
        this.scene.add(this.mesh);
    }

    getOpacity(wtype) {
        if (wtype === 'mine') return 0.7;
        if (wtype === 'poison') return 0.5;
        if (wtype === 'fireball') return 0.9;
        return 1;
    }

    createGeometry(wtype, sz) {
        if (wtype === 'bow') return new THREE.PlaneGeometry(sz * 20, sz * 6);
        if (wtype === 'knife') return new THREE.PlaneGeometry(sz * 15, sz * 4);
        if (wtype === 'mine') return new THREE.CircleGeometry(sz * 10, 16);
        if (wtype === 'laser') return new THREE.PlaneGeometry(2000, sz * 30);
        if (wtype === 'poison') return new THREE.CircleGeometry(sz * 150, 32);
        if (wtype === 'fireball') return new THREE.SphereGeometry(sz * 12, 16, 16);
        if (wtype === 'meteor') return new THREE.DodecahedronGeometry(sz * 18, 0);
        if (wtype === 'sword') {
            const s = new THREE.Shape();
            const scale = sz * 16;
            s.moveTo(0, scale * 1.5);
            s.lineTo(-scale * 0.3, scale * 0.3);
            s.lineTo(-scale * 0.2, -scale * 0.8);
            s.lineTo(0, -scale);
            s.lineTo(scale * 0.2, -scale * 0.8);
            s.lineTo(scale * 0.3, scale * 0.3);
            s.closePath();
            return new THREE.ShapeGeometry(s);
        }
        if (wtype === 'axe') {
            const s = new THREE.Shape();
            const scale = sz * 14;
            s.moveTo(0, scale * 1.2);
            s.lineTo(-scale * 0.9, scale * 0.2);
            s.lineTo(-scale * 0.5, 0);
            s.lineTo(0, -scale);
            s.lineTo(scale * 0.5, 0);
            s.lineTo(scale * 0.9, scale * 0.2);
            s.closePath();
            return new THREE.ShapeGeometry(s);
        }
        return new THREE.CircleGeometry(sz * 6, 12);
    }

    createLaserBeam(sz, col) {
        // Dodaj świecący efekt do lasera
        const glowGeo = new THREE.PlaneGeometry(2000, sz * 40);
        const glowMat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.3
        });
        this.glow = new THREE.Mesh(glowGeo, glowMat);
        this.glow.position.set(this.x, this.y, 2.4);
        this.scene.add(this.glow);
    }

    createAxeOutlines(geo) {
        this.outline = this.createOutlineMesh(geo, 0x000000, 1.25, 2.4);
        this.whiteOutline = this.createOutlineMesh(geo, 0xffffff, 1.35, 2.3);
    }

    createOutlineMesh(geo, color, scale, z) {
        const mesh = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }));
        mesh.scale.multiplyScalar(scale);
        mesh.position.set(this.x, this.y, z);
        this.scene.add(mesh);
        return mesh;
    }

    setupAnimation(wtype) {
        this.animationType = this.getAnimationType(wtype);
        this.pulseSpeed = 5;
        this.pulseAmount = 0.2;
    }

    getAnimationType(wtype) {
        const animations = {
            'fireball': 'pulse',
            'meteor': 'rotate-fast',
            'poison': 'pulse-slow',
            'laser': 'flicker',
            'sword': 'orbit',
            'axe': 'rotate',
            'mine': 'rotate-slow'
        };
        return animations[wtype] || 'none';
    }
    
    update(dt) {
        this.animTime += dt;

        // Ruch pocisku
        if (!this.isMine && this.wtype !== 'sword') {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
        }

        // Orbita dla miecza
        if (this.wtype === 'sword' && this.owner) {
            const angle = this.animTime * this.owner.weaponStats.sword.speed;
            const dist = this.owner.weaponStats.sword.orbit || 120;
            this.x = this.owner.x + Math.cos(angle) * dist;
            this.y = this.owner.y + Math.sin(angle) * dist;
        }
        
        this.life -= dt;
        
        // Animacje
        this.updateAnimation(dt);

        // Pozycja
        this.mesh.position.set(this.x, this.y, 2.5);
        
        // Rotacja
        if (this.wtype === 'axe' || this.isMine) {
            const rotSpeed = this.isMine ? 2 : 8;
            this.mesh.rotation.z += dt * rotSpeed;
        } else if (this.wtype === 'sword') {
            this.mesh.rotation.z += dt * 10;
        } else if (this.wtype === 'meteor') {
            this.mesh.rotation.x += dt * 3;
            this.mesh.rotation.y += dt * 5;
        }
        
        if (this.outline) {
            this.outline.position.set(this.x, this.y, 2.4);
            this.outline.rotation.z = this.mesh.rotation.z;
        }
        if (this.whiteOutline) {
            this.whiteOutline.position.set(this.x, this.y, 2.3);
            this.whiteOutline.rotation.z = this.mesh.rotation.z;
        }
        if (this.glow) {
            this.glow.position.set(this.x, this.y, 2.4);
        }

        // Ślad (trail)
        this.updateTrail(dt);
    }

    updateAnimation(dt) {
        if (this.animationType === 'pulse') {
            const scale = 1 + Math.sin(this.animTime * this.pulseSpeed) * this.pulseAmount;
            this.mesh.scale.set(scale, scale, scale);
        } else if (this.animationType === 'pulse-slow') {
            const scale = 1 + Math.sin(this.animTime * 2) * 0.15;
            this.mesh.scale.set(scale, scale, scale);
            this.mesh.material.opacity = 0.3 + Math.sin(this.animTime * 3) * 0.2;
        } else if (this.animationType === 'flicker') {
            this.mesh.material.opacity = 0.7 + Math.sin(this.animTime * 20) * 0.3;
        }

        // Miganie przed końcem życia
        if (this.isMine && this.life < 1) {
            this.mesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.02) * 0.3;
        }
    }

    updateTrail(dt) {
        // Dodaj ślad dla szybkich pocisków
        if (['bow', 'knife', 'meteor', 'fireball'].includes(this.wtype) && this.animTime % 0.05 < dt) {
            this.addTrailParticle();
        }

        // Usuń stare cząsteczki śladu
        this.trail = this.trail.filter(particle => {
            particle.life -= dt;
            if (particle.life <= 0) {
                this.scene.remove(particle.mesh);
                return false;
            }
            particle.mesh.material.opacity = particle.life / 0.3;
            return true;
        });
    }

    addTrailParticle() {
        const geo = new THREE.CircleGeometry(this.sz * 3, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: this.mesh.material.color,
            transparent: true,
            opacity: 0.6
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.x, this.y, 2.3);
        this.scene.add(mesh);
        
        this.trail.push({
            mesh: mesh,
            life: 0.3
        });
    }
    
    canHit() {
        return this.isMine || this.wtype === 'laser' || this.wtype === 'poison' || this.wtype === 'sword' || this.hitCount < (this.pierce + 1);
    }
    
    onHit() {
        if (this.isMine || this.wtype === 'laser' || this.wtype === 'poison' || this.wtype === 'sword') return;
        this.hitCount++;
        if (!this.canHit()) this.life = -1;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.whiteOutline) this.scene.remove(this.whiteOutline);
        if (this.glow) this.scene.remove(this.glow);
        this.trail.forEach(p => this.scene.remove(p.mesh));
    }
}