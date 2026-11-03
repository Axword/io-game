import { disposeObject } from '../utils/geometry.js';
import { resolveWorldMovement } from '../../shared/systems/worldRules.js';

export class LootSystem {
    constructor(scene) { this.scene = scene; this.chests = []; this.nextId = 1; this.nextSpawn = 25; }

    spawn(x, y, rare = false, id = null) {
        const chest = { id: id ?? `chest_${this.nextId++}`, x, y, rare, age: 0 };
        const group = new THREE.Group();
        const part = (w, h, color, z) => {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
            mesh.position.z = z; group.add(mesh); return mesh;
        };
        part(39, 31, 0x242039, 0);
        part(32, 24, rare ? 0xffd632 : 0xbf763a, 0.05);
        part(32, 4, 0x6c3c29, 0.1);
        part(6, 26, 0xffdd59, 0.15);
        part(10, 9, 0x242039, 0.2);
        part(4, 4, 0xfff3a0, 0.25);
        group.position.set(x, y, 2.2); this.scene.add(group);
        chest.mesh = group; this.chests.push(chest); return chest;
    }

    update(dt, player, gameTime, solo = true) {
        if (solo && gameTime >= this.nextSpawn) {
            this.nextSpawn += 45;
            if (this.chests.length < 10) {
                const angle = Math.random() * Math.PI * 2;
                const point = resolveWorldMovement({ x: player.x + Math.cos(angle) * 200, y: player.y + Math.sin(angle) * 200 }, player.worldId || 0, 24);
                this.spawn(point.x, point.y);
            }
        }
        for (const chest of this.chests) {
            chest.age += dt;
            chest.mesh.position.y = chest.y + Math.sin(chest.age * 3) * 3;
            chest.mesh.rotation.z = Math.sin(chest.age * 2) * 0.035;
            if (solo && Math.hypot(chest.x - player.x, chest.y - player.y) < 42) {
                this.remove(chest); return chest;
            }
        }
        for (const chest of [...this.chests]) if (chest.age > 180 && !chest.rare) this.remove(chest);
        return null;
    }

    sync(states = []) {
        const ids = new Set(states.map(c => c.id));
        for (const chest of [...this.chests]) if (!ids.has(chest.id)) this.remove(chest);
        for (const state of states) if (!this.chests.some(c => c.id === state.id)) this.spawn(state.x, state.y, state.rare, state.id);
    }
    remove(chest) { disposeObject(chest.mesh); this.chests.splice(this.chests.indexOf(chest), 1); }
    reset() { for (const c of [...this.chests]) this.remove(c); this.nextSpawn = 25; this.nextId = 1; }
}
