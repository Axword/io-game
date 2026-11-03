import { disposeObject } from '../utils/geometry.js';
const BULLET_GEOMETRIES = new Map();
let flameGeometry;
let boltTrailGeometry;
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
            knife: 1.2
        }[wtype] || 5;
    }

    createMesh(wtype, sz, col) {
        const fire = wtype === 'fireball' || wtype === 'meteor';
        const bolt = wtype === 'bow' || wtype === 'wand';
        const hostile = this.owner === 'boss' || this.owner === 'monster';
        const color = fire ? 0xff7a12 : (bolt ? (hostile ? 0xd932bd : 0x09b7dc) : col);
        this.mesh = new THREE.Mesh(this.createGeometry(wtype, sz), new THREE.MeshBasicMaterial({
            color, transparent: ['mine','poison','laser'].includes(wtype),
            opacity: this.getOpacity(wtype), side: THREE.DoubleSide,
            depthWrite: !['poison','laser'].includes(wtype)
        }));
        this.mesh.position.set(this.x, this.y, 2.5);
        if (wtype === 'axe' || wtype === 'sword' || wtype === 'knife') this.createOutlines(wtype, sz, col);
        if (wtype === 'knife') this.mesh.rotation.z = Math.atan2(this.vy, this.vx);
        if (wtype === 'laser') this.createLaserGlow(sz, col);
        if (fire || bolt) {
            const core = new THREE.Mesh(this.createGeometry(wtype === 'meteor' ? 'fireball' : wtype, sz * .62),
                new THREE.MeshBasicMaterial({ color: fire ? 0xffed40 : (hostile ? 0xffb9ec : 0x9cf4ff) }));
            core.position.z = .04;
            this.mesh.add(core);
        }
        this.scene.add(this.mesh);
        if (fire || bolt) this.createGraphicTrail(fire);
    }

    createGraphicTrail(fire) {
        if (fire && !flameGeometry) {
            const shape = new THREE.Shape();
            const points = [[0,.55],[-1.7,.28],[-3.8,1.1],[-2.6,.12],[-5.5,.3],[-2.4,-.25],[-4.1,-1.05],[-1.8,-.42],[0,-.55]];
            points.forEach(([x,y], i) => shape[i ? 'lineTo' : 'moveTo'](x,y));
            shape.closePath();
            flameGeometry = new THREE.ShapeGeometry(shape);
            flameGeometry.userData.shared = true;
        }
        if (!fire && !boltTrailGeometry) {
            const shape = new THREE.Shape();
            shape.moveTo(0,.36); shape.lineTo(-5,0); shape.lineTo(0,-.36); shape.closePath();
            boltTrailGeometry = new THREE.ShapeGeometry(shape);
            boltTrailGeometry.userData.shared = true;
        }
        const mesh = new THREE.Mesh(fire ? flameGeometry : boltTrailGeometry,
            new THREE.MeshBasicMaterial({color: fire ? 0xff9630 : 0x4ed8eb, transparent:true, opacity:fire ? .86 : .48, depthWrite:false}));
        if (fire) {
            const inner = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({color:0xffdd38, transparent:true, opacity:.88, depthWrite:false}));
            inner.scale.set(.65,.45,1); inner.position.z = .02; mesh.add(inner);
        }
        this.scene.add(mesh);
        this.trail.push({ mesh });
        this.updateTrail(0);
    }

    getOpacity(wtype) {
        return { mine: 0.7, poison: 0.35, laser: 0.8, fireball: 1 }[wtype] || 1;
    }

    createGeometry(wtype, sz) {
        const key = wtype + ':' + Number(sz).toFixed(3) + (wtype === 'laser' ? ':' + this.laserRange + ':' + this.laserWidth : '');
        if (BULLET_GEOMETRIES.has(key)) return BULLET_GEOMETRIES.get(key);
        const geometry = this.makeGeometry(wtype, sz);
        if (BULLET_GEOMETRIES.size < 256) {
            geometry.userData.shared = true;
            BULLET_GEOMETRIES.set(key, geometry);
        }
        return geometry;
    }
    makeGeometry(wtype, sz) {
        switch (wtype) {
            case 'bow':
                return new THREE.CircleGeometry(sz * 7, 20);
            case 'knife': {
                const s = new THREE.Shape();
                const scale = sz * 24;

              s.moveTo(0, scale * 1.1);
              s.quadraticCurveTo(scale * 0.15, scale * 0.3, scale * 0.3, scale * 0.3);
              s.lineTo(scale * 1.1, 0);
              s.quadraticCurveTo(scale * 0.3, -scale * 0.15, scale * 0.3, -scale * 0.3);
              s.lineTo(0, -scale * 1.1);
              s.quadraticCurveTo(-scale * 0.15, -scale * 0.3, -scale * 0.3, -scale * 0.3);
              s.lineTo(-scale * 1.1, 0);
              s.quadraticCurveTo(-scale * 0.3, scale * 0.15, -scale * 0.3, scale * 0.3);
              s.closePath();

              // Central circle hole path
              const hole = new THREE.Path();
              hole.absarc(0, 0, scale * 0.18, 0, Math.PI * 2, true);
              s.holes.push(hole);

              return new THREE.ShapeGeometry(s);
}
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
                    const wobble = r * (0.94 + Math.sin(i * 2.6) * 0.06);
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
                const scale = sz * 24;

                // Ostrze (Blade) - WYDŁUŻONE
                s.moveTo(0, -scale * 2.4); 
                s.lineTo(-scale * 0.16, -scale * 1.9);
                s.lineTo(-scale * 0.14, -scale * 0.2);

                // Jelec (Crossguard) - SKRÓCONY i POSZERZONY w pionie
                s.lineTo(-scale * 0.75, -scale * 0.16); 
                s.lineTo(-scale * 0.75, -scale * 0.02);
                s.lineTo(-scale * 0.15, 0);

                // Rękojeść (Grip) idzie w GÓRĘ
                s.lineTo(-scale * 0.1, scale * 0.8);

                // Głowica (Pommel)
                s.lineTo(-scale * 0.35, scale * 0.85);
                s.lineTo(-scale * 0.35, scale * 1.0);
                s.lineTo(0, scale * 1.1); 

                s.lineTo(scale * 0.35, scale * 1.0);
                s.lineTo(scale * 0.35, scale * 0.85);

                // Rękojeść (Grip) - prawa
                s.lineTo(scale * 0.1, scale * 0.8);

                // Jelec (Crossguard) - prawy
                s.lineTo(scale * 0.15, 0);
                s.lineTo(scale * 0.75, -scale * 0.02);
                s.lineTo(scale * 0.75, -scale * 0.16);

                // Ostrze (Blade) - prawa
                s.lineTo(scale * 0.14, -scale * 0.2);
                s.lineTo(scale * 0.16, -scale * 1.9);

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
        const outerGeo = this.createGeometry(wtype, sz * 1.25);
        const innerGeo = this.createGeometry(wtype, sz * 1.10);

        this.whiteOutline = new THREE.Mesh(outerGeo, new THREE.MeshBasicMaterial({
            color: 0xedeef5, side: THREE.DoubleSide
        }));
        this.whiteOutline.position.set(this.x, this.y, 2.35);
        this.scene.add(this.whiteOutline);

        this.outline = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({
            color: 0x252338, side: THREE.DoubleSide
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

    updatePosition() {
        if (!this.mesh) return;
        this.updateTrail(0);
        this.mesh.position.set(this.x, this.y, 2.5);
        switch (this.wtype) {
            case 'bow':
            case 'knife': {
                this.mesh.rotation.z = Math.atan2(this.vy || 0, this.vx || 1);
                break;
            }

            case 'axe': {
                this.mesh.rotation.z = this.rotation ?? this.animTime * 10;
                break;
            }
            case 'sword': {
                this.mesh.rotation.z = this.rotation ?? this.angle ?? this.animTime * 6;
                break;
            }
            case 'laser': {
                this.mesh.rotation.z = this.laserAngle || 0;
                break;
            }
            case 'meteor':
            case 'fireball':
            case 'mine': {
                this.mesh.rotation.z = this.rotation ?? this.mesh.rotation.z;
                break;
            }
        }
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
    }

    // Online state owns motion and hits. Only advance the visual clock here.
    updateVisuals(dt) {
        this.animTime += dt;
        this.updateAnimations(dt);
        if (this.wtype === 'axe' && this.rotation === undefined) this.mesh.rotation.z = this.animTime * 10;
        if (this.outline) this.outline.rotation.z = this.mesh.rotation.z;
        if (this.whiteOutline) this.whiteOutline.rotation.z = this.mesh.rotation.z;
        this.updateTrail(dt);
    }


    update(dt) {
        this.animTime += dt;
        if (this.rehitInterval > 0) {
            this.rehitTimer -= dt;
            if (this.rehitTimer <= 0) {
                this.hit.clear();
                this.rehitTimer = this.rehitInterval;
            }
        }
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
                    this.mesh.rotation.z = angle + Math.PI / 2 + ((this.orbitSlot || 0) / (this.orbitSlotsTotal || 1)) * Math.PI * 2;
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
                const scale = 1 + Math.sin(this.animTime * 12) * .035;
                this.mesh.scale.set(scale, scale, 1);
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
        if (!this.trail.length) return;
        const trail = this.trail[0].mesh;
        const dx = this._lastVisualX === undefined ? this.vx : this.x - this._lastVisualX;
        const dy = this._lastVisualY === undefined ? this.vy : this.y - this._lastVisualY;
        if (Math.abs(dx) + Math.abs(dy) > .0001) this._trailAngle = Math.atan2(dy, dx);
        this._lastVisualX = this.x;
        this._lastVisualY = this.y;
        const fire = this.wtype === 'fireball' || this.wtype === 'meteor';
        const radius = this.sz * (fire ? 12 : 5);
        trail.position.set(this.x, this.y, 2.25);
        trail.rotation.z = this._trailAngle || 0;
        const flicker = fire ? 1 + Math.sin(this.animTime * 24) * .055 : 1;
        trail.scale.set(radius * flicker, radius, 1);
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
        for (const mesh of [this.mesh, this.outline, this.whiteOutline, this.glow]) disposeObject(mesh);
        for (const particle of this.trail) disposeObject(particle.mesh);
        this.trail.length = 0;
        this.lingeredEntities.clear();
    }
}
