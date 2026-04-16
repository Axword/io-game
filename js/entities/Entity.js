// entities/Entity.js
import { mkShape } from '../utils/geometry.js';

export class Entity {
    constructor(x, y, scene) {
        this.x = x;
        this.y = y;
        this.scene = scene;
        this.mesh = null;
        this.outline = null;
        this.meshes = [];
    }
    
    addMesh(mesh) {
        this.scene.add(mesh);
        this.meshes.push(mesh);
        return mesh;
    }
    
    createRing(innerRadius, outerRadius, color, opacity = 1, z = 2) {
        const geo = new THREE.RingGeometry(innerRadius, outerRadius, 32);
        const mat = new THREE.MeshBasicMaterial({ 
            color, 
            transparent: opacity < 1, 
            opacity,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.x, this.y, z);
        return this.addMesh(mesh);
    }
    
    createCircle(radius, color, opacity = 1, z = 2) {
        const geo = new THREE.CircleGeometry(radius, 16);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(this.x, this.y, z);
        return this.addMesh(mesh);
    }
    
    createOutline(shape, size, color = 0x000000, opacity = 0.2, z = 1.9) {
        this.outline = mkShape(shape, size, color);
        this.outline.material.transparent = true;
        this.outline.material.opacity = opacity;
        this.outline.position.set(this.x, this.y, z);
        this.scene.add(this.outline);
        return this.outline;
    }
    
    updatePosition(z, outlineZ) {
        if (this.mesh) this.mesh.position.set(this.x, this.y, z);
        if (this.outline) this.outline.position.set(this.x, this.y, outlineZ);
    }
    
    removeMesh(mesh) {
        if (mesh) this.scene.remove(mesh);
    }
    
    destroy() {
        this.removeMesh(this.mesh);
        this.removeMesh(this.outline);
        for (const m of this.meshes) this.removeMesh(m);
        this.meshes = [];
    }
}