import { disposeObject } from '../utils/geometry.js';
import { resolveWorldMovement } from '../../shared/systems/worldRules.js';

export class LootSystem {
    constructor(scene) {
        this.scene = scene; this.chests = []; this.nextId = 1; this.nextSpawn = 25;
        this.openingDuration = 0.82;
        this.openings = [];
        this.openedIds = new Set();
        this.openedOrder = [];
    }

    spawn(x, y, rare = false, id = null) {
        const chest = { id: id ?? `chest_${this.nextId++}`, x, y, rare, age: 0 };
        const group = new THREE.Group();
        const part = (w, h, color, z, parent = group, y = 0) => {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
            mesh.position.set(0, y, z); parent.add(mesh); return mesh;
        };
        part(39, 31, 0x242039, 0);
        part(32, 24, rare ? 0xffd632 : 0xbf763a, 0.05);
        part(26, 12, 0x6c3c29, 0.1, group, 3);
        part(6, 24, 0xffdd59, 0.15);
        const lid = new THREE.Group();
        lid.position.set(0, 4, .2); group.add(lid);
        part(39, 15, 0x242039, 0, lid, 4);
        part(32, 9, rare ? 0xffe768 : 0xd6924c, .05, lid, 4);
        part(6, 13, 0xffdd59, .1, lid, 4);
        part(10, 9, 0x242039, .35, group, -1);
        part(4, 4, 0xfff3a0, .4, group, -1);
        group.position.set(x, y, 2.2); this.scene.add(group);
        chest.mesh = group; chest.lid = lid;
        this.chests.push(chest); return chest;
    }

    // Only a confirmed pickup opens a chest. Leaving snapshot interest or
    // expiring removes it silently, so network visibility never invents loot.
    open(chestOrId) {
        const id = typeof chestOrId === 'object' ? chestOrId?.id : chestOrId;
        if (id == null || this.openedIds.has(id)) return null;
        let chest = this.chests.find(candidate => candidate.id === id);
        if (!chest && typeof chestOrId === 'object' && Number.isFinite(chestOrId.x) && Number.isFinite(chestOrId.y)) {
            chest = this.spawn(chestOrId.x, chestOrId.y, !!chestOrId.rare, id);
        }
        if (!chest) return null;
        this.openedIds.add(id); this.openedOrder.push(id);
        if (this.openedOrder.length > 64) this.openedIds.delete(this.openedOrder.shift());
        this.chests.splice(this.chests.indexOf(chest), 1);
        chest.opened = true;
        chest.openDuration = this.openingDuration;
        chest.mesh.position.set(chest.x, chest.y, 2.2);
        chest.mesh.rotation.z = 0;
        const effect = new THREE.Group();
        effect.position.set(chest.x, chest.y, 2.1); this.scene.add(effect);
        const material = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const glow = new THREE.Mesh(new THREE.CircleGeometry(35, 24), material(0xffdf58, 0));
        effect.add(glow);
        const burst = new THREE.Mesh(new THREE.RingGeometry(21, 25, 24), material(0xfff3a0, 0));
        burst.position.z = .02; effect.add(burst);
        const reward = new THREE.Group();
        reward.position.z = 1; effect.add(reward);
        const gemOutline = new THREE.Mesh(new THREE.PlaneGeometry(19, 19), material(0x242039));
        gemOutline.rotation.z = Math.PI / 4; reward.add(gemOutline);
        const gem = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), material(chest.rare ? 0xffdf58 : 0x40d9ee));
        gem.rotation.z = Math.PI / 4; gem.position.z = .05; reward.add(gem);
        const glint = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material(0xffffff));
        glint.position.set(-2, 3, .1); reward.add(glint);
        const rays = [];
        for (let i = 0; i < 8; i++) {
            const ray = new THREE.Mesh(new THREE.PlaneGeometry(3, i % 2 ? 9 : 15), material(i % 2 ? 0xffa92b : 0xffed86, 0));
            const angle = i * Math.PI / 4;
            ray.rotation.z = angle - Math.PI / 2; ray.userData.angle = angle;
            ray.position.z = .1; effect.add(ray); rays.push(ray);
        }
        const materials = [];
        for (const group of [chest.mesh, effect]) group.traverse(node => {
            if (node.material) { node.material.transparent = true; node.material.depthWrite = false; materials.push({ material: node.material, opacity: node.material.opacity }); }
        });
        this.openings.push({ chest, effect, glow, burst, reward, rays, materials, age: 0 });
        if (this.openings.length > 8) this.disposeOpening(this.openings.shift());
        this.updateOpening(this.openings[this.openings.length - 1], 0);
        return chest;
    }

    isOpening(id) { return this.openings.some(opening => opening.chest.id === id); }

    updateOpening(opening, dt) {
        opening.age += dt;
        const t = Math.min(1, opening.age / this.openingDuration);
        const reveal = Math.max(0, Math.min(1, (t - .12) / .46));
        const ease = 1 - (1 - reveal) ** 3;
        const fade = Math.max(0, Math.min(1, (1 - t) / .24));
        const squash = Math.sin(Math.min(1, t / .17) * Math.PI) * .12;
        opening.chest.mesh.scale.set(1 + squash, 1 - squash, 1);
        opening.chest.lid.rotation.x = -ease * 1.16;
        opening.chest.lid.rotation.z = -ease * .12;
        opening.chest.lid.position.y = 4 + 13 * ease;
        for (const entry of opening.materials) entry.material.opacity = entry.opacity * fade;
        opening.glow.scale.setScalar(.65 + ease * 1.6);
        opening.glow.material.opacity = Math.sin(reveal * Math.PI) * .28 * fade;
        opening.burst.scale.setScalar(.6 + ease * 2.8);
        opening.burst.material.opacity = Math.sin(reveal * Math.PI) * .75 * fade;
        opening.reward.position.y = 6 + 45 * ease;
        opening.reward.scale.setScalar(ease);
        opening.reward.rotation.z = Math.sin(reveal * Math.PI) * .16;
        for (const ray of opening.rays) {
            const radius = 22 + ease * 44;
            ray.position.x = Math.cos(ray.userData.angle) * radius;
            ray.position.y = 14 + Math.sin(ray.userData.angle) * radius;
            ray.scale.y = .4 + ease;
            ray.material.opacity = Math.sin(reveal * Math.PI) * fade;
        }
    }

    updateEffects(dt) {
        if (!Number.isFinite(dt) || dt < 0) return;
        for (let i = this.openings.length - 1; i >= 0; i--) {
            const opening = this.openings[i];
            this.updateOpening(opening, dt);
            if (opening.age >= this.openingDuration) {
                this.disposeOpening(opening); this.openings.splice(i, 1);
            }
        }
    }

    disposeOpening(opening) { disposeObject(opening.chest.mesh); disposeObject(opening.effect); }

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
                this.open(chest); return chest;
            }
        }
        for (const chest of [...this.chests]) if (chest.age > 180 && !chest.rare) this.remove(chest);
        return null;
    }

    sync(states = []) {
        const ids = new Set(states.map(c => c.id));
        for (const chest of [...this.chests]) if (!ids.has(chest.id)) this.remove(chest);
        for (const state of states) if (!this.openedIds.has(state.id) && !this.chests.some(c => c.id === state.id)) this.spawn(state.x, state.y, state.rare, state.id);
    }
    remove(chest) { const index = this.chests.indexOf(chest); if (index < 0) return; disposeObject(chest.mesh); this.chests.splice(index, 1); }
    reset() {
        for (const c of [...this.chests]) this.remove(c);
        for (const opening of this.openings) this.disposeOpening(opening);
        this.openings.length = 0; this.openedIds.clear(); this.openedOrder.length = 0;
        this.nextSpawn = 25; this.nextId = 1;
    }
}
