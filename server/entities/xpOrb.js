import { v4 as uuidv4 } from 'uuid';

export class ServerXpOrb {
    constructor(x, y, val) {
        this.id = 'x_' + uuidv4().slice(0, 8);
        this.x = x;
        this.y = y;
        this.val = val;
        this.life = 20;
        this.collectedBy = null;
    }

    update(dt, player) {
        this.life -= dt;
        if (this.life <= 0) return false;
        if (!player || player.hp <= 0) return false;

        const d = Math.hypot(this.x - player.x, this.y - player.y);
        const range = player.magnetRange || 100;

        if (d < range) {
            const spd = Math.min(8, 180 / Math.max(d, 1));
            const len = Math.hypot(player.x - this.x, player.y - this.y);
            if (len > 0.1) {
                this.x += ((player.x - this.x) / len) * spd * dt * 60;
                this.y += ((player.y - this.y) / len) * spd * dt * 60;
            }
        }

        return d < 22;
    }

    toState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            val: this.val
        };
    }
}
