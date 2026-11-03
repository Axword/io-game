import { disposeObject } from '../utils/geometry.js';
let orbGeometry;
const orbMaterials = new Map();
export class XpOrb {
    constructor(x, y, val, scene) {
        this.x = x;
        this.y = y;
        this.val = val;
        this.scene = scene;
        this.life = 45;
        
        const sz = 3 + Math.min(val * 0.08, 10);
        if (!orbGeometry) {
            orbGeometry = new THREE.CircleGeometry(1, 12);
            orbGeometry.userData.shared = true;
        }
        const color = val >= 60 ? 0xffe744 : val >= 15 ? 0x40d9ee : 0xf559d1;
        if (!orbMaterials.has(color)) {
            const material = new THREE.MeshBasicMaterial({ color });
            material.userData.shared = true;
            orbMaterials.set(color, material);
        }
        this.mesh = new THREE.Mesh(orbGeometry, orbMaterials.get(color));
        this.mesh.scale.setScalar(sz);
        this.mesh.position.set(x, y, 1);
        scene.add(this.mesh);
    }
    
    update(dt, player) {
        this.life -= dt;
        
        const d = Math.hypot(this.x - player.x, this.y - player.y);
        
        if (d <= 22) return true;
        const range = Math.max(100, player.magnetRange || 180);
        if (d < range) {
            const step = Math.min(d, (160 + (range - d) * 4) * dt);
            this.x += ((player.x - this.x) / d) * step;
            this.y += ((player.y - this.y) / d) * step;
        }
        
        this.mesh.position.set(this.x, this.y, 1);
        this.mesh.rotation.z += dt * 2;
        
        return d < 22;
    }
    
    destroy() {
        if (this.mesh) disposeObject(this.mesh);
    }
}
