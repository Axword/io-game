// entities/Bullet.js
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
        this.life = 8;
        this.hit = new Set();
        this.hitCount = 0;
        this.isMine = (wtype === 'mine');
        
        this.createMesh(wtype, sz, col);
    }

    createMesh(wtype, sz, col) {
        const geo = this.createGeometry(wtype, sz);
        const mat = new THREE.MeshBasicMaterial({ 
            color: col,
            transparent: wtype === 'mine',
            opacity: wtype === 'mine' ? 0.7 : 1
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(this.x, this.y, 2.5);
        
        if (wtype === 'axe') this.createAxeOutlines(geo);
        if (wtype === 'bow') this.mesh.rotation.z = Math.atan2(this.vy, this.vx);
        
        this.scene.add(this.mesh);
    }

    createGeometry(wtype, sz) {
        if (wtype === 'bow') return new THREE.PlaneGeometry(sz * 20, sz * 6);
        if (wtype === 'mine') return new THREE.CircleGeometry(sz * 10, 16);
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
    
    update(dt) {
        if (!this.isMine) {
            this.x += this.vx * dt * 60;
            this.y += this.vy * dt * 60;
        }
        
        this.life -= dt;
        
        if (this.isMine && this.life < 1) {
            this.mesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.02) * 0.3;
        }
        
        this.mesh.position.set(this.x, this.y, 2.5);
        
        if (this.wtype === 'axe' || this.isMine) {
            const rotSpeed = this.isMine ? 2 : 8;
            this.mesh.rotation.z += dt * rotSpeed;
            if (this.outline) this.outline.rotation.z = this.mesh.rotation.z;
            if (this.whiteOutline) this.whiteOutline.rotation.z = this.mesh.rotation.z;
        }
        
        if (this.outline) this.outline.position.set(this.x, this.y, 2.4);
        if (this.whiteOutline) this.whiteOutline.position.set(this.x, this.y, 2.3);
    }
    
    canHit() {
        return this.isMine || this.hitCount < (this.pierce + 1);
    }
    
    onHit() {
        if (this.isMine) return;
        this.hitCount++;
        if (!this.canHit()) this.life = -1;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
        if (this.outline) this.scene.remove(this.outline);
        if (this.whiteOutline) this.scene.remove(this.whiteOutline);
    }
}