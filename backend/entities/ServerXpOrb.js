// server/entities/XpOrb.js
export class ServerXpOrb {
    constructor(x, y, val) {
        this.id = Math.random().toString(36).substring(2, 11);
        this.x = x; this.y = y; this.val = val;
        this.life = 20;
    }
    
    update(dt, players) {
        this.life -= dt;
        
        let closest = null;
        let minDist = Infinity;

        // Znajdź najbliższego gracza/bota w zasięgu magnesu
        for (const p of players) {
            if (p.hp <= 0) continue;
            const d = Math.hypot(this.x - p.x, this.y - p.y);
            const magnetRange = p.magnetRange || 100;
            
            if (d < magnetRange && d < minDist) {
                minDist = d;
                closest = p;
            }
        }
        
        // Przyciąganie
        if (closest) {
            const spd = Math.min(8, 180 / Math.max(minDist, 1));
            const len = Math.hypot(closest.x - this.x, closest.y - this.y);
            if (len > 0) {
                this.x += ((closest.x - this.x) / len) * spd * dt * 60;
                this.y += ((closest.y - this.y) / len) * spd * dt * 60;
            }
        }
        
        // Zwróć gracza, który podniósł orb (odległość < 22)
        if (closest && Math.hypot(this.x - closest.x, this.y - closest.y) < 22) {
            return closest;
        }
        return null;
    }
    
    toJSON() {
        return { id: this.id, x: this.x, y: this.y, val: this.val };
    }
}