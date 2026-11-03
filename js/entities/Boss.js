import { Monster } from './Monster.js';
import { mkShape } from '../utils/geometry.js';
import { Bullet } from './Bullet.js';
import { WORLD } from '../config/constants.js';

const clamp = value => Math.max(-WORLD / 2 + 100, Math.min(WORLD / 2 - 100, value));

// Every attack advances on simulation time; pause and cleanup also stop attacks.
export class Boss extends Monster {
    constructor(x, y, bossData, scene) {
        super(x, y, 0, [], scene, 1, true);
        this.bossData = bossData;
        this.encounterId = bossData.encounterId || bossData.id;
        this.maxHp = bossData.hp;
        this.hp = this.maxHp;
        this.dmg = bossData.dmg;
        this.spd = bossData.spd;
        this.sz = bossData.sz;
        this.xp = bossData.xp;
        this.type = bossData.shape;
        this.baseColor = bossData.col;
        this.abilities = bossData.abilities || ['shockwave', 'charge'];
        this.state = 'attacking';
        this.isDespawning = false;
        this.destroyed = false;
        this.animTime = 0;
        this.abilityTimer = 2.4;
        this.abilityIndex = 0;
        this.attackState = null;
        this.shieldActive = false;
        this.shieldTimer = 0;
        this.abilityEffects = [];
        this.createMesh(this.type, this.sz, this.baseColor, false);
        this.createBossVisuals();
    }

    createBossVisuals() {
        this.removeMesh(this.outline);
        this.outline = mkShape(this.type, this.sz * 1.19, 0xffe83d);
        this.outline.position.set(this.x, this.y, 1.9);
        this.scene.add(this.outline);
        this.glow = mkShape(this.type, this.sz * 1.31, 0x322047);
        this.glow.position.set(this.x, this.y, 1.8);
        this.scene.add(this.glow);
        this.hpBarBg.material.color.setHex(0x171922);
        this.hpBarFg.material.color.setHex(0x4bee52);
        this.nameTag = this.createNameTag(this.bossData.name);
    }

    createNameTag(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = '#242336';
        context.fillRect(0, 0, 384, 64);
        context.fillStyle = '#fff2a6';
        context.font = 'bold 27px Arial';
        context.textAlign = 'center';
        context.fillText(text.toUpperCase(), 192, 42);
        const texture = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
        sprite.scale.set(130, 22, 1);
        sprite.position.set(this.x, this.y + this.sz + 32, 3);
        this.scene.add(sprite);
        return sprite;
    }

    update(dt, targets, safeRadiusOrBullets, bulletsOrScene, legacyScene) {
        if (this.destroyed || this.hp <= 0) return;
        const bullets = Array.isArray(safeRadiusOrBullets) ? safeRadiusOrBullets : bulletsOrScene;
        const scene = legacyScene || (Array.isArray(safeRadiusOrBullets) ? bulletsOrScene : this.scene);
        if (!Array.isArray(bullets)) return;
        const livingTargets = (Array.isArray(targets) ? targets : [targets]).filter(target => target?.hp > 0);
        this.currentTarget = this.findNearestTarget(livingTargets).target;
        this.animTime += dt;
        this.updateShieldState(dt);
        if (this.attackState) this.advanceAttack(dt, bullets, scene);
        else if (this.currentTarget) {
            const dx = this.currentTarget.x - this.x;
            const dy = this.currentTarget.y - this.y;
            const distance = Math.hypot(dx, dy);
            if (distance > this.sz * 0.75 + 48) {
                const step = Math.min(distance, this.spd * 55 * dt);
                this.x = clamp(this.x + dx / distance * step);
                this.y = clamp(this.y + dy / distance * step);
            }
            this.abilityTimer -= dt;
            if (this.abilityTimer <= 0) this.useAbility(this.currentTarget);
        }
        this.updateVisuals(dt);
        this.updateBossVisuals();
        this.updateAbilityEffects(dt);
    }

    useAbility(target) {
        if (!target || this.attackState || this.destroyed) return;
        const ability = this.abilities[this.abilityIndex++ % this.abilities.length];
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        const attack = { ability, remaining: ability === 'meteor' ? 1.2 : 1.0, angle, markers: [] };
        if (ability === 'charge' || ability === 'laser') {
            const distance = ability === 'charge' ? 380 : 760;
            attack.distance = distance;
            attack.markers.push(this.createLane(angle, distance, ability === 'charge' ? 45 : 25, 0xff7945, 0.32));
        } else if (ability === 'meteor') {
            attack.positions = [
                { x: target.x, y: target.y },
                { x: target.x + Math.cos(angle + 1.8) * 125, y: target.y + Math.sin(angle + 1.8) * 125 },
                { x: target.x + Math.cos(angle - 1.8) * 125, y: target.y + Math.sin(angle - 1.8) * 125 }
            ];
            for (const position of attack.positions) attack.markers.push(this.makeRing(position.x, position.y, 42, 0xff6633, 0.7));
        } else if (ability === 'teleport') {
            attack.destination = { x: clamp(target.x - Math.cos(angle) * 300), y: clamp(target.y - Math.sin(angle) * 300) };
            attack.markers.push(this.makeRing(attack.destination.x, attack.destination.y, this.sz, 0xc98cff, 0.7));
        } else attack.markers.push(this.makeRing(this.x, this.y, this.sz + 20, ability === 'shield' ? 0x34d5ff : 0xffa940, 0.8));
        this.attackState = attack;
    }

    advanceAttack(dt, bullets, scene) {
        const attack = this.attackState;
        attack.remaining -= dt;
        for (const marker of attack.markers) marker.material.opacity = 0.38 + Math.sin(this.animTime * 18) * 0.17;
        if (attack.charging) {
            const step = Math.min(attack.distance, dt * 640);
            this.x = clamp(this.x + Math.cos(attack.angle) * step);
            this.y = clamp(this.y + Math.sin(attack.angle) * step);
            attack.distance -= step;
            if (attack.distance <= 0 || attack.remaining <= 0) this.finishAttack();
            return;
        }
        if (attack.remaining > 0) return;
        for (const marker of attack.markers) this.removeMesh(marker);
        attack.markers.length = 0;
        switch (attack.ability) {
            case 'charge':
                attack.charging = true;
                attack.remaining = 0.65;
                break;
            case 'laser': {
                const lane = this.createLane(attack.angle, attack.distance, 18, 0xfff06a, 0.9);
                this.abilityEffects.push({ mesh: lane, life: 0.22, maxLife: 0.22 });
                for (let distance = 35; distance < attack.distance; distance += 32) {
                    this.createHazard(this.x + Math.cos(attack.angle) * distance, this.y + Math.sin(attack.angle) * distance,
                        this.dmg * 0.75, 1.1, 0.18, bullets, scene, 0xffdc54);
                }
                this.finishAttack();
                break;
            }
            case 'meteor':
                for (const position of attack.positions) {
                    this.createHazard(position.x, position.y, this.dmg, 3.3, 0.24, bullets, scene, 0xff8436);
                    this.addEffect('ring', position.x, position.y, 46, 0xff8436, true, 0.4);
                }
                this.finishAttack();
                break;
            case 'teleport':
                this.addEffect('ring', this.x, this.y, this.sz, 0xb35cff, true);
                this.x = attack.destination.x;
                this.y = attack.destination.y;
                this.addEffect('ring', this.x, this.y, this.sz, 0xb35cff, true);
                this.finishAttack();
                break;
            case 'shield':
                this.shieldActive = true;
                this.shieldTimer = 2.2;
                this.shieldMesh = this.makeRing(this.x, this.y, this.sz * 0.9, 0x36dfff, 0.65);
                this.finishAttack();
                break;
            default:
                this.useShockwave(bullets, scene, attack.angle);
                this.finishAttack();
        }
    }

    finishAttack() {
        if (this.attackState) for (const marker of this.attackState.markers) this.removeMesh(marker);
        this.attackState = null;
        this.abilityTimer = this.hp < this.maxHp * 0.5 ? 2.8 : 3.8;
    }

    useShockwave(bullets, scene, angle = 0) {
        const count = 10;
        for (let i = 0; i < count; i++) {
            const direction = angle + (i + 0.5) * Math.PI * 2 / count;
            this.createBullet(Math.cos(direction) * 3.5, Math.sin(direction) * 3.5,
                this.dmg * 0.6, 0xff8e45, 1.1, 3.2, bullets, scene);
        }
        this.addEffect('ring', this.x, this.y, this.sz, 0xffa940, true);
    }

    createBullet(vx, vy, dmg, col, sz, life, bullets, scene, pierce = 0) {
        if (this.destroyed || !Array.isArray(bullets)) return;
        const bullet = new Bullet(this.x, this.y, vx, vy, dmg, 'boss', 'wand', sz, 0, pierce, col, scene || this.scene);
        bullet.life = life;
        bullets.push(bullet);
        return bullet;
    }

    createHazard(x, y, dmg, size, life, bullets, scene, color) {
        const bullet = this.createBullet(0, 0, dmg, color, size, life, bullets, scene);
        if (bullet) {
            bullet.x = x;
            bullet.y = y;
            bullet.isMine = true;
            bullet.mesh.position.set(x, y, 2.5);
        }
    }

    makeRing(x, y, size, color, opacity) {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(size * 0.89, size, 40),
            new THREE.MeshBasicMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide }));
        mesh.position.set(x, y, 1.6);
        this.scene.add(mesh);
        return mesh;
    }

    createLane(angle, length, width, color, opacity) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width),
            new THREE.MeshBasicMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide }));
        mesh.position.set(this.x + Math.cos(angle) * length / 2, this.y + Math.sin(angle) * length / 2, 1.6);
        mesh.rotation.z = angle;
        this.scene.add(mesh);
        return mesh;
    }

    addEffect(type, x, y, size, color, growing, life = 0.45) {
        const mesh = this.makeRing(x, y, size, color, 0.8);
        this.abilityEffects.push({ mesh, life, maxLife: life, growing });
    }

    updateAbilityEffects(dt) {
        for (let i = this.abilityEffects.length - 1; i >= 0; i--) {
            const effect = this.abilityEffects[i];
            effect.life -= dt;
            if (effect.life <= 0) {
                this.removeMesh(effect.mesh);
                this.abilityEffects.splice(i, 1);
            } else {
                const fraction = effect.life / effect.maxLife;
                effect.mesh.material.opacity = fraction * 0.8;
                if (effect.growing) effect.mesh.scale.setScalar(2 - fraction);
            }
        }
    }

    updateShieldState(dt) {
        if (!this.shieldActive) return;
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) this.deactivateShield();
        else this.shieldMesh?.position.set(this.x, this.y, 2.2);
    }

    deactivateShield() {
        this.shieldActive = false;
        this.removeMesh(this.shieldMesh);
        this.shieldMesh = null;
    }

    updateBossVisuals() {
        const visible = !this.onlineSpawning;
        this.mesh.visible = visible;
        this.outline.visible = visible;
        this.glow.visible = visible;
        this.outline.material.opacity = 1;
        this.outline.rotation.z = this.mesh.rotation.z;
        this.glow.position.set(this.x, this.y, 1.8);
        this.glow.rotation.z = this.mesh.rotation.z;
        this.nameTag.position.set(this.x, this.y + this.sz + 32, 3);
        this.hpBarBg.visible = visible && this.hp > 0;
        this.hpBarFg.visible = visible && this.hp > 0;
        const pulse = this.attackState ? 1 + Math.sin(this.animTime * 14) * 0.035 : 1;
        const base = this.mesh.userData?.baseScale || this.sz;
        this.mesh.scale.set(base * pulse, base * pulse, 1);
    }

    syncTelegraph(state) {
        this.onlineSpawning = state.spawnTimer > 0;
        if (this.onlineSpawning && !this.spawnMarker) this.spawnMarker = this.makeRing(this.x, this.y, 90, 0xffda47, 0.85);
        if (!this.onlineSpawning && this.spawnMarker) {
            this.removeMesh(this.spawnMarker);
            this.spawnMarker = null;
        }
        if (this.spawnMarker) this.spawnMarker.position.set(this.x, this.y, 1.6);
        const telegraph = state.telegraph;
        const key = telegraph ? `${telegraph.sequence}:${telegraph.ability}` : null;
        if (key !== this.onlineTelegraphKey) {
            for (const marker of this.onlineMarkers || []) this.removeMesh(marker);
            this.onlineMarkers = [];
            this.onlineTelegraphKey = key;
            if (telegraph) {
                if (telegraph.ability === 'charge' || telegraph.ability === 'laser') {
                    this.onlineMarkers.push(this.createLane(telegraph.angle, telegraph.distance,
                        telegraph.ability === 'charge' ? 45 : 25, 0xff7945, 0.4));
                } else if (telegraph.ability === 'meteor') {
                    for (const position of telegraph.positions || []) this.onlineMarkers.push(this.makeRing(position.x, position.y, 42, 0xff6633, 0.8));
                } else if (telegraph.ability === 'teleport' && telegraph.destination) {
                    this.onlineMarkers.push(this.makeRing(telegraph.destination.x, telegraph.destination.y, this.sz, 0xc98cff, 0.8));
                } else this.onlineMarkers.push(this.makeRing(this.x, this.y, this.sz + 20, 0xffa940, 0.8));
            }
        }
        for (const marker of this.onlineMarkers || []) marker.material.opacity = 0.5 + Math.sin((telegraph?.remaining || 0) * 18) * 0.2;
        if (state.shieldActive && !this.shieldMesh) this.shieldMesh = this.makeRing(this.x, this.y, this.sz * 0.9, 0x36dfff, 0.65);
        if (!state.shieldActive && this.shieldMesh) this.deactivateShield();
        this.shieldMesh?.position.set(this.x, this.y, 2.2);
    }

    takeDamage(amount, attacker = null) {
        if (this.destroyed || !Number.isFinite(amount) || amount <= 0) return;
        super.takeDamage(this.shieldActive ? amount * 0.5 : amount, attacker);
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.finishAttack();
        this.deactivateShield();
        for (const effect of this.abilityEffects) this.removeMesh(effect.mesh);
        this.abilityEffects.length = 0;
        this.removeMesh(this.glow);
        this.removeMesh(this.nameTag);
        this.removeMesh(this.spawnMarker);
        for (const marker of this.onlineMarkers || []) this.removeMesh(marker);
        super.destroy();
    }
}
