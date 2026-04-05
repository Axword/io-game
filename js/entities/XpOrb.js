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
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const len = Math.hypot(dx, dy);
            const nx = dx / len;
            const ny = dy / len;
            this.x += nx * spd * dt * 60;
            this.y += ny * spd * dt * 60;
        }
        
        this.mesh.position.set(this.x, this.y, 1);
        this.mesh.rotation.z += dt * 2;
        
        return d < 22; // collected
    }
    
    destroy() {
        if (this.mesh) this.scene.remove(this.mesh);
    }
}