// entities/XpOrb.js
export class XpOrb {
    constructor(x, y, val, scene) {
        this.x = x;
        this.y = y;
        this.val = val;
        this.scene = scene;
        this.life = 20;
        
        const sz = 3 + Math.min(val * 0.08, 10);
        this.mesh = new THREE.Mesh(
            new THREE.CircleGeometry(sz, 12),
            new THREE.MeshBasicMaterial({ color: 0x8888ff, transparent: true, opacity: 0.85 })
        );
        this.mesh.position.set(x, y, 1);
        scene.add(this.mesh);
    }
    
    update(dt, player) {
        this.life -= dt;
        
        const d = Math.hypot(this.x - player.x, this.y - player.y);
        
        if (d < 180) {
            const spd = Math.min(8, 180 / Math.max(d, 1));
            const len = Math.hypot(player.x - this.x, player.y - this.y);
            this.x += ((player.x - this.x) / len) * spd * dt * 60;
            this.y += ((player.y - this.y) / len) * spd * dt * 60;
        }
        
        this.mesh.position.set(this.x, this.y, 1);
        this.mesh.rotation.z += dt * 2;
        
        return d < 22;
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
    }
}