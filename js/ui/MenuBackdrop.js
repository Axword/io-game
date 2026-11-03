// A bounded visual preview, independent of gameplay, networking and WebGL.
export class MenuBackdrop {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.time = 0;
        this.frames = 0;
        this.elapsed = 0;
        this.visible = false;
        this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.enemies = Array.from({ length: 24 }, (_, i) => ({ angle: i * 2.399963, phase: i * 71.3, size: 15 + i % 4 * 2.5, sides: i % 6 === 0 ? 3 : 5 }));
        this.shots = Array.from({ length: 36 }, (_, i) => ({ angle: i * 2.399963, phase: (i * .381966) % 1, fire: i < 22 }));
        this.orbs = Array.from({ length: 34 }, (_, i) => ({ x: ((i * 317.3) % 1300) - 650, y: ((i * 197.7) % 900) - 450, color: ['#ffe743', '#fc62d8', '#45d5f3'][i % 3] }));
    }

    update(dt, visible) {
        const wasVisible = this.visible;
        this.visible = !!visible;
        this.canvas.hidden = !this.visible;
        if (!this.visible || document.hidden || !this.ctx) return;
        const width = Math.min(900, window.innerWidth);
        const height = Math.round(width * window.innerHeight / window.innerWidth);
        const resized = this.canvas.width !== width || this.canvas.height !== height;
        if (resized) { this.canvas.width = width; this.canvas.height = height; }
        if (this.motion.matches) {
            if (!wasVisible || resized || !this.frames) this.draw();
            return;
        }
        this.elapsed += Math.min(.05, Math.max(0, dt || 0));
        if (this.elapsed < 1 / 30 && wasVisible && !resized) return;
        this.time += this.elapsed;
        this.elapsed = 0;
        this.draw();
    }

    polygon(x, y, radius, sides, rotation = 0, fill = '#aa43e5', outline = '#462259', width = 4) {
        const ctx = this.ctx;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = rotation + i * Math.PI * 2 / sides - Math.PI / 2;
            const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = width; ctx.stroke();
    }

    draw() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
        const scale = Math.max(w / 1350, h / 950);
        const t = this.time;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#c3d0c6'; ctx.fillRect(0, 0, w, h);
        ctx.setTransform(scale, 0, 0, scale, w / 2, h / 2);
        const left = -w / scale / 2, top = -h / scale / 2;
        ctx.strokeStyle = '#a9b8af'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        const offsetX = Math.sin(t * .055) * 24, offsetY = Math.cos(t * .045) * 24;
        for (let x = Math.floor(left / 48) * 48 - 48; x < -left + 48; x += 48) { ctx.moveTo(x + offsetX, top); ctx.lineTo(x + offsetX, -top); }
        for (let y = Math.floor(top / 48) * 48 - 48; y < -top + 48; y += 48) { ctx.moveTo(left, y + offsetY); ctx.lineTo(-left, y + offsetY); }
        ctx.stroke();
        const px = Math.sin(t * .3) * 85, py = Math.cos(t * .24) * 60;
        for (const orb of this.orbs) {
            const x = orb.x + Math.sin(t * .15 + orb.x) * 5;
            const y = orb.y + Math.cos(t * .12 + orb.y) * 5;
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = orb.color; ctx.fill(); ctx.strokeStyle = '#51445e'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        for (const enemy of this.enemies) {
            const radius = 155 + ((enemy.phase - t * 17) % 560 + 560) % 560;
            const angle = enemy.angle + Math.sin(t * .2 + enemy.phase) * .08;
            const x = px + Math.cos(angle) * radius, y = py + Math.sin(angle) * radius;
            this.polygon(x, y, enemy.size, enemy.sides, Math.sin(t * 2 + enemy.phase) * .08);
            ctx.fillStyle = '#38263e'; ctx.fillRect(x - 18, y + enemy.size + 7, 36, 7);
            ctx.fillStyle = '#52e25b'; ctx.fillRect(x - 16, y + enemy.size + 9, 24 + enemy.size % 7, 3);
        }
        this.polygon(-420 + Math.sin(t * .15) * 28, -185, 42, 5, 0, '#a43ee7', '#ffdf48', 9);
        for (const shot of this.shots) {
            const progress = (t * (shot.fire ? .39 : .55) + shot.phase) % 1;
            const angle = shot.angle + t * .11;
            const distance = 30 + progress * (shot.fire ? 400 : 510);
            const dx = Math.cos(angle), dy = Math.sin(angle);
            const x = px + dx * distance, y = py + dy * distance;
            if (shot.fire) {
                ctx.beginPath(); ctx.moveTo(x - dx * 58, y - dy * 58); ctx.lineTo(x - dy * 7, y + dx * 7); ctx.lineTo(x + dy * 7, y - dx * 7); ctx.closePath();
                ctx.fillStyle = '#ffa337'; ctx.fill();
            } else {
                ctx.beginPath(); ctx.moveTo(x - dx * 27, y - dy * 27); ctx.lineTo(x, y); ctx.strokeStyle = '#80dbe1'; ctx.lineWidth = 4; ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(x, y, shot.fire ? 8 : 5, 0, Math.PI * 2); ctx.fillStyle = shot.fire ? '#ff9b19' : '#a2f2ff'; ctx.fill(); ctx.strokeStyle = shot.fire ? '#f2681c' : '#19b4d3'; ctx.lineWidth = shot.fire ? 5 : 3; ctx.stroke();
            if (shot.fire) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffef5a'; ctx.fill(); }
        }
        ctx.beginPath(); ctx.arc(px, py, 23, 0, Math.PI * 2); ctx.fillStyle = '#ff871c'; ctx.fill(); ctx.strokeStyle = '#7a2a24'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = '#26332f'; ctx.fillRect(px - 24, py + 33, 48, 8);
        ctx.fillStyle = '#4fe562'; ctx.fillRect(px - 21, py + 35, 42, 4);
        this.frames++;
    }
}
