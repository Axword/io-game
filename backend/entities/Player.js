// server/entities/Player.js
import { CLASSES, WORLD_SIZE, MOVEMENT_MULTIPLIER } from '../config.js';

export class ServerPlayer {
    constructor(id, name, cls, permStats = {}, startX = 0, startY = 0) {
        this.id = id;
        this.name = name;
        this.cls = cls;
        
        const cd = CLASSES[cls] || CLASSES.warrior;
        const hpBonus = permStats.hp || 0;
        const speedBonus = 1 + ((permStats.speed || 0) / 100);

        this.maxHp = cd.hp + hpBonus;
        this.hp = this.maxHp;
        this.baseSpeed = cd.spd * speedBonus;
        
        this.x = startX;
        this.y = startY;
        this.rotation = 0;

        this.level = 1;
        this.xp = 0;
        this.xpNeeded = 100;
        this.totalXp = 0;

        // Ostatni znany input od klienta
        this.currentInput = { dx: 0, dy: 0, mouseX: 0, mouseY: 0, mouseClicked: false };
        
        // Statystyki (uproszczone na potrzeby Fazy 1)
        this.moveSpeedBonus = 0;
        this.killedMonsters = 0;
        this.totalDmg = 0;
        this.invTimer = 0;
        this.damageAccumulator = 0;
        this.armor = 0;
        this.damageReduction = 0;
        this.revives = 0;
    }

    setInput(inputData) {
        // Przeliczamy klawisze z klienta na wektor kierunku
        let dx = 0, dy = 0;
        const keys = inputData.keys || {};
        
        if (keys['KeyW'] || keys['ArrowUp']) dy += 1;
        if (keys['KeyS'] || keys['ArrowDown']) dy -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) dx += 1;

        this.currentInput = {
            dx, dy,
            mouseX: inputData.mouseX || 0,
            mouseY: inputData.mouseY || 0,
            mouseClicked: inputData.mouseClicked || false
        };
    }

    update(dt) {
        const { dx, dy } = this.currentInput;

        if (dx !== 0 || dy !== 0) {
            const len = Math.hypot(dx, dy);
            const finalSpeed = this.baseSpeed * (1 + (this.moveSpeedBonus || 0) / 100);

            this.x += (dx / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
            this.y += (dy / len) * finalSpeed * MOVEMENT_MULTIPLIER * dt * 60;
        }

        this.clampToWorld();

        if (this.invTimer > 0) this.invTimer -= dt;

        // Obsługa obrażeń
        if (this.damageAccumulator > 0) {
            let damage = this.damageAccumulator;
            if (this.armor > 0) damage *= (1 - Math.min(0.75, this.armor / 100));
            if (this.damageReduction > 0) damage *= (1 - Math.min(0.75, this.damageReduction / 100));
            
            this.hp -= damage;
            this.damageAccumulator = 0;
            if (this.hp <= 0) this.tryRevive();
        }
    }

    clampToWorld() {
        const half = WORLD_SIZE / 2;
        this.x = Math.max(-half, Math.min(half, this.x));
        this.y = Math.max(-half, Math.min(half, this.y));
    }

    takeDamage(amount) {
        if (this.invTimer > 0 || this.hp <= 0) return false;
        this.damageAccumulator += amount;
        return true;
    }

    tryRevive() {
        if (this.revives <= 0) return false;
        this.revives--;
        this.hp = Math.max(1, this.maxHp * 0.5);
        this.invTimer = 2;
        return true;
    }

    addXp(amount) {
        this.xp += amount;
        this.totalXp += amount;
        let levelUps = 0;

        while (this.xp >= this.xpNeeded) {
            this.xp -= this.xpNeeded;
            this.level++;
            this.xpNeeded = Math.floor(100 * Math.pow(1.18, this.level - 1));
            this.maxHp += 10;
            this.hp = Math.min(this.maxHp, this.hp + 20);
            levelUps++;
        }
        return levelUps;
    }

    // Zwraca tylko to, co klient potrzebuje do wyrenderowania
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            cls: this.cls,
            x: Math.round(this.x * 100) / 100, // Oszczędność bajtów
            y: Math.round(this.y * 100) / 100,
            hp: this.hp,
            maxHp: this.maxHp,
            level: this.level,
            xp: this.xp,
            xpNeeded: this.xpNeeded
        };
    }
}