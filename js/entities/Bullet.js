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
        this.bounces = bounces || 0;
        this.pierce = pierce || 0;
        this.col = col;
        this.scene = scene;
        this.life = this.getLifetime(wtype);
        this.hit = new Set();
        this.hitCount = 0;
        this.isMine = (wtype === 'mine');
        this.animTime = 0;
        this.trail = [];
        this.trailTimer = 0;

        // Explosion (fireball)
        this.explosionRadius = 0;
        this.hasExploded = false;

        // Tick damage (poison, laser)
        this.tickInterval = 0;
        this.tickTimer = 0;
        this.tickDmg = 0;

        // Poison linger
        this.lingerDmg = 0;
        this.lingerDuration = 0;
        this.lingeredEntities = new Map(); // entity -> timer

        // Trajectory (meteor)
        this.trajectory = null;

        // Sword orbit
        this.baseAngle = 0;
        this.orbitRadius = 120;
        this.orbitSpeed = 3;
        this.orbitSlot = 0;
        this.orbitSlotsTotal = 1;

        // Sword/poison rehit
        this.rehitInterval = 0;
        this.rehitTimer = 0;

        // Laser
        this.laserRange = 350;
        this.laserWidth = 18;
        this.laserAngle = 0;

        // Chain (lightning)
        this.chainCount = 0;
        this.chainRange = 250;

        // SFX
        this.sfxPlayed = false;

        this.createMesh(wtype, this.sz, col);

        // Ustawienia specjalne
        if (wtype === 'sword') {
            this.rehitInterval = 0.2;
            this.rehitTimer = 0.2;
        }
        if (wtype === 'poison') {
            this.rehitInterval = 0.15;
            this.rehitTimer = 0;
        }
    }

    getLifetime(wtype) {
        return {
            mine: 8, laser: 1.5, poison: 5,
            fireball: 6, meteor: 4, sword: 999,
            knife: 3
        }[wtype] || 5;
    }

    createMesh(wtype, sz, col) {
        const geo = this.createGeometry(wtype, sz);
        const mat = new THREE.MeshBasicMaterial({
            color: col,
            transparent: ['mine', 'poison', 'laser', 'fireball'].includes(wtype),
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
        return { mine: 0.7, poison: 0.35, laser: 0.8, fireball: 0.9 }[wtype] || 1;
    }

    createGeometry(wtype, sz) {
        switch (wtype) {
            case 'bow':
                return new THREE.PlaneGeometry(sz * 20, sz * 6);
            case 'knife':
                return new THREE.PlaneGeometry(sz * 12, sz * 3);
            case 'mine':
                return new THREE.CircleGeometry(sz * 10, 16);
            case 'laser':
                // Laser krótszy - range kontrolowany przez laserRange
                return new THREE.PlaneGeometry(this.laserRange || 350, (this.laserWidth || 18) * sz);
            case 'poison': {
                // Trucizna z animowanym kształtem
                const s = new THREE.Shape();
                const r = sz * 120;
                const segments = 24;
                for (let i = 0; i < segments; i++) {
                    const a = (i / segments) * Math.PI * 2;
                    const wobble = r * (0.85 + Math.random() * 0.3);
                    if (i === 0) s.moveTo(Math.cos(a) * wobble, Math.sin(a) * wobble);
                    else s.lineTo(Math.cos(a) * wobble, Math.sin(a) * wobble);
                }
                s.closePath();
                return new THREE.ShapeGeometry(s);
            }
            case 'fireball':
                return new THREE.CircleGeometry(sz * 12, 16);
            case 'meteor': {
                const s = new THREE.Shape();
                const r = sz * 12;
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
                s.moveTo(0, scale * 1.2);
                s.lineTo(-scale * 0.9, scale * 0.3);
                s.lineTo(-scale * 0.95, scale * 0.15);
                s.lineTo(-scale * 0.7, 0);
                s.lineTo(-scale * 0.2, -scale * 0.3);
                s.lineTo(-scale * 0.15, -scale * 0.9);
                s.lineTo(0, -scale);
                s.lineTo(scale * 0.15, -scale * 0.9);
                s.lineTo(scale * 0.2, -scale * 0.3);
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
        const range = this.laserRange || 350;
        const width = (this.laserWidth || 18) * sz;
        const geo = new THREE.PlaneGeometry(range, width * 2.5);
        this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide
        }));
        this.glow.position.set(this.x, this.y, 2.3);
        this.scene.add(this.glow);
    }

    createFireGlow(sz, col) {
        const geo = new THREE.CircleGeometry(sz * 20, 16);
        this.glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xff6600, transparent: true, opacity: 0.2
        }));
        this.glow.position.set(this.x, this.y, 2.3);
        this.scene.add(this.glow);
    }

    update(dt) {
        this.animTime += dt;

        // ── Rehit timer (sword, poison) ─────────────────────
        if (this.rehitInterval > 0) {
            this.rehitTimer -= dt;
            if (this.rehitTimer <= 0) {
                this.hit.clear();
                this.rehitTimer = this.rehitInterval;
            }
        }

        // ── Poison linger ───────────────────────────────────
        if (this.lingerDmg > 0 && this.lingeredEntities.size > 0) {
            for (const [entity, timer] of this.lingeredEntities) {
                const newTimer = timer - dt;
                if (newTimer <= 0 || !entity || entity.hp <= 0) {
                    this.lingeredEntities.delete(entity);
                } else {
                    this.lingeredEntities.set(entity, newTimer);
                    // Zadawaj obrażenia linger
                    if (entity.takeDamage) {
                        entity.takeDamage(this.lingerDmg * dt);
                    }
                }
            }
        }

        // ── Ruch ────────────────────────────────────────────
        if (this.trajectory) {
            this.updateTrajectory(dt);
        }
        else if (this.wtype === 'sword' && this.owner && typeof this.owner === 'object' && this.owner.x !== undefined) {
            const total = Math.max(1, this.orbitSlotsTotal || 1);
            const slot = this.orbitSlot || 0;
            const slotAngle = (slot / total) * Math.PI * 2;
            const angle = (this.baseAngle || 0) + slotAngle + this.animTime * (this.orbitSpeed || 3);
            const orbit = this.orbitRadius || 120;

            this.x = this.owner.x + Math.cos(angle) * orbit;
            this.y = this.owner.y + Math.sin(angle) * orbit;
        }
        else if (this.wtype === 'laser' && this.owner && typeof this.owner === 'object' && this.owner.x !== undefined) {
            // Laser: pozycja = gracz, obrócony w kierunku strzału
            const range = this.laserRange || 350;
            const halfRange = range / 2;
            this.x = this.owner.x + Math.cos(this.laserAngle) * halfRange;
            this.y = this.owner.y + Math.sin(this.laserAngle) * halfRange;
        }
        else if (this.wtype === 'poison') {
            // Trucizna stoi w miejscu
        }
        else if (!this.isMine) {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
        }

        this.life -= dt;

        // ── Pozycja ─────────────────────────────────────────
        this.mesh.position.set(this.x, this.y, 2.5);

        // ── Rotacja ─────────────────────────────────────────
        switch (this.wtype) {
            case 'axe':
                this.mesh.rotation.z += dt * 10;
                break;
            case 'sword':
                // Miecz obraca się przodem do kierunku ruchu
                if (this.owner) {
                    const angle = (this.baseAngle || 0) + this.animTime * (this.orbitSpeed || 3);
                    this.mesh.rotation.z = angle + Math.PI / 2;
                }
                break;
            case 'mine':
                this.mesh.rotation.z += dt * 2;
                break;
            case 'meteor':
                this.mesh.rotation.z += dt * 6;
                break;
            case 'fireball':
                this.mesh.rotation.z += dt * 4;
                break;
            case 'laser':
                this.mesh.rotation.z = this.laserAngle;
                break;
        }

        // ── Animacje ────────────────────────────────────────
        this.updateAnimations(dt);

        // ── Outline sync ────────────────────────────────────
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

        // ── Trail ───────────────────────────────────────────
        this.updateTrail(dt);
    }

    updateTrajectory(dt) {
        this.trajectory.currentTime += dt;
        const t = Math.min(1, this.trajectory.currentTime / this.trajectory.totalTime);

        if (t < 0.5) {
            const p = t * 2;
            this.x = this.trajectory.startX + (this.trajectory.peakX - this.trajectory.startX) * p;
            this.y = this.trajectory.startY + (this.trajectory.peakY - this.trajectory.startY) * p;
        } else {
            const p = (t - 0.5) * 2;
            this.x = this.trajectory.peakX + (this.trajectory.endX - this.trajectory.peakX) * p;
            this.y = this.trajectory.peakY + (this.trajectory.endY - this.trajectory.peakY) * p;
        }

        if (t >= 1) this.life = -1;
    }

    updateAnimations(dt) {
        switch (this.wtype) {
            case 'fireball': {
                const s = 1 + Math.sin(this.animTime * 6) * 0.25;
                this.mesh.scale.set(s, s, 1);
                if (this.glow) {
                    const gs = 1 + Math.sin(this.animTime * 4) * 0.35;
                    this.glow.scale.set(gs, gs, 1);
                    this.glow.material.opacity = 0.12 + Math.sin(this.animTime * 5) * 0.08;
                }
                break;
            }
            case 'poison': {
                const s = 1 + Math.sin(this.animTime * 1.5) * 0.08;
                this.mesh.scale.set(s, s, 1);
                this.mesh.material.opacity = 0.2 + Math.sin(this.animTime * 2) * 0.12;
                // Powolna rotacja trucizny
                this.mesh.rotation.z += dt * 0.3;
                break;
            }
            case 'laser': {
                this.mesh.material.opacity = 0.5 + Math.sin(this.animTime * 25) * 0.35;
                if (this.glow) this.glow.material.opacity = 0.08 + Math.sin(this.animTime * 18) * 0.07;
                // Pulsująca szerokość
                const ws = 1 + Math.sin(this.animTime * 15) * 0.15;
                this.mesh.scale.set(1, ws, 1);
                break;
            }
            case 'mine': {
                if (this.life < 1) {
                    this.mesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.02) * 0.3;
                }
                break;
            }
            case 'meteor': {
                const s = 1 + Math.sin(this.animTime * 5) * 0.18;
                this.mesh.scale.set(s, s, 1);
                break;
            }
            case 'knife': {
                // Lekkie migotanie noża
                this.mesh.rotation.z += dt * 15;
                break;
            }
        }
    }

    updateTrail(dt) {
        if (!['bow', 'knife', 'meteor', 'fireball', 'axe'].includes(this.wtype)) return;

        this.trailTimer += dt;
        if (this.trailTimer < 0.03) return;
        this.trailTimer = 0;

        if (this.trail.length > 10) {
            const old = this.trail.shift();
            this.scene.remove(old.mesh);
        }

        const size = this.wtype === 'fireball' ? this.sz * 8 :
                     this.wtype === 'meteor' ? this.sz * 10 :
                     this.wtype === 'axe' ? this.sz * 6 :
                     this.sz * 3;

        const trailCol = this.wtype === 'fireball' ? 0xff4400 :
                         this.wtype === 'meteor' ? 0xff8800 :
                         this.col;

        const geo = new THREE.CircleGeometry(size, 6);
        const mat = new THREE.MeshBasicMaterial({
            color: trailCol, transparent: true, opacity: 0.35
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.x, this.y, 2.2);
        this.scene.add(mesh);
        this.trail.push({ mesh, life: 0.2 });

        this.trail = this.trail.filter(p => {
            p.life -= dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                return false;
            }
            p.mesh.material.opacity = (p.life / 0.2) * 0.35;
            const s = 0.5 + (p.life / 0.2) * 0.5;
            p.mesh.scale.set(s, s, 1);
            return true;
        });
    }

    canHit() {
        if (this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype)) return true;
        return this.hitCount < (this.pierce + 1);
    }

    onHit() {
        if (this.isMine || ['laser', 'poison', 'sword'].includes(this.wtype)) return;
        this.hitCount++;
        if (!this.canHit()) this.life = -1;
    }

    // Dla trucizny - entity wchodzi w chmurę
    addLingerTarget(entity) {
        if (this.lingerDmg > 0 && entity && !this.lingeredEntities.has(entity)) {
            this.lingeredEntities.set(entity, this.lingerDuration);
        }
    }

    // Dla trucizny - entity wychodzi z chmury
    refreshLingerTarget(entity) {
        if (this.lingerDmg > 0 && entity) {
            this.lingeredEntities.set(entity, this.lingerDuration);
        }
    }

    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.whiteOutline) this.scene.remove(this.whiteOutline);
        if (this.glow) this.scene.remove(this.glow);
        this.trail.forEach(p => this.scene.remove(p.mesh));
        this.trail = [];
        this.lingeredEntities.clear();
    }
}