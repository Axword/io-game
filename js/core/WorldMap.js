import { getWorld } from '../../shared/config/worlds.js';
import { mkShape, disposeObject } from '../utils/geometry.js';

export class WorldMap {
    constructor(scene) { this.scene = scene; this.group = null; this.time = 0; this.locked = true; this.portalParts = []; }

    add(object) { this.group.add(object); return object; }

    build(worldId = 0) {
        this.destroy();
        this.world = getWorld(worldId);
        this.time = 0;
        this.group = new THREE.Group();
        this.group.name = `world-map-${this.world.id}`;
        this.scene.add(this.group);
        const world = this.world, diameter = world.bounds * 2;
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(diameter, diameter), new THREE.MeshBasicMaterial({ color: world.palette.ground }));
        ground.position.z = -15;
        this.add(ground);
        const grid = new THREE.GridHelper(diameter, 112, world.palette.grid, world.palette.grid);
        grid.rotation.x = Math.PI / 2; grid.position.z = -14;
        this.add(grid);
        const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-world.bounds, -world.bounds, -5), new THREE.Vector3(world.bounds, -world.bounds, -5),
            new THREE.Vector3(world.bounds, world.bounds, -5), new THREE.Vector3(-world.bounds, world.bounds, -5)
        ]), new THREE.LineBasicMaterial({ color: world.palette.obstacle }));
        this.add(border);
        this.buildObstacles();
        this.portal = new THREE.Group();
        this.portal.position.z = 0.4;
        this.add(this.portal);
        const ring = (inner, outer, color, z) => {
            const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
            mesh.position.z = z; this.portal.add(mesh); return mesh;
        };
        ring(68, 78, 0x25243c, 0);
        this.outerRing = ring(59, 67, world.palette.accent, 0.1);
        this.innerRing = ring(40, 45, world.palette.accent, 0.2);
        this.core = mkShape('pent', 40, world.palette.accent);
        this.core.position.z = 0.3;
        this.portal.add(this.core);
        this.portalParts = [this.outerRing, this.innerRing, this.core];
        this.orbits = [];
        for (let i = 0; i < 3; i++) {
            const marker = mkShape('dia', 13, world.palette.accent);
            marker.position.z = 0.4; this.portal.add(marker); this.orbits.push(marker);
        }
        this.setLocked(true);
        return this;
    }

    buildObstacles() {
        const world = this.world;
        const shape = world.id === 0 ? 'pent' : world.id === 1 ? 'dia' : 'hex';
        const layers = [
            { shape: 'cir', color: world.id === 2 ? 0x2c2538 : world.palette.grid, scale: 1.85, z: -2.1, shadow: true },
            { shape, color: world.id === 2 ? 0x211c2b : 0x385869, scale: (world.id === 1 ? 1.16 : 1.52) * 1.1, z: -1.9 },
            { shape, color: world.palette.obstacle, scale: world.id === 1 ? 1.16 : 1.52, z: -1.8 },
            { shape, color: world.id === 0 ? 0x6b9a78 : world.id === 1 ? 0x9ddcf0 : 0x5b3b50,
                scale: (world.id === 1 ? 1.16 : 1.52) * 0.62, z: -1.7, face: true }
        ];
        const transform = new THREE.Object3D();
        for (const layer of layers) {
            const prototype = mkShape(layer.shape, 1, layer.color);
            const instances = new THREE.InstancedMesh(prototype.geometry, prototype.material, world.obstacles.length);
            // The entire static map is only a few hundred triangles and four draws.
            instances.frustumCulled = false;
            for (const [index, { x, y, r }] of world.obstacles.entries()) {
                transform.position.set(x + (layer.shadow ? 7 : layer.face ? -r * 0.1 : 0), y + (layer.shadow ? -9 : layer.face ? r * 0.1 : 0), layer.z);
                transform.rotation.z = world.id !== 1 && !layer.shadow ? (x + y) * 0.001 : 0;
                transform.scale.set(r * layer.scale, r * layer.scale, 1);
                transform.updateMatrix();
                instances.setMatrixAt(index, transform.matrix);
            }
            instances.instanceMatrix.needsUpdate = true;
            this.add(instances);
        }
    }

    setLocked(locked) {
        this.locked = !!locked;
        const color = this.locked ? 0x858da4 : this.world?.palette.accent || 0x60e0ce;
        for (const object of [...this.portalParts, ...(this.orbits || [])]) object.material.color.setHex(color);
    }

    setPortalState(state = {}) {
        this.setLocked(state.locked ?? !state.available);
        if (!this.locked && state.destination !== undefined) {
            const color = getWorld(state.destination).palette.accent;
            for (const object of [...this.portalParts, ...(this.orbits || [])]) object.material.color.setHex(color);
        }
    }

    update(dt) {
        if (!this.portal) return;
        this.time += dt;
        this.core.rotation.z = this.time * (this.locked ? 0.15 : 0.6);
        const pulse = 1 + Math.sin(this.time * 2.6) * (this.locked ? 0.015 : 0.045);
        this.outerRing.scale.set(pulse, pulse, 1);
        this.innerRing.scale.set(2 - pulse, 2 - pulse, 1);
        for (let i = 0; i < this.orbits.length; i++) {
            const angle = this.time * (this.locked ? 0.18 : 0.8) + i * Math.PI * 2 / this.orbits.length;
            this.orbits[i].position.set(Math.cos(angle) * 64, Math.sin(angle) * 64, 0.4);
            this.orbits[i].rotation.z = angle;
        }
    }

    destroy() {
        if (this.group) {
            this.group.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
            disposeObject(this.group);
        }
        this.group = null; this.portal = null;
        this.portalParts = []; this.orbits = [];
    }
}
