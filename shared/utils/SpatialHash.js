export class SpatialHash {
    constructor(cellSize = 128) { this.cellSize = cellSize; this.cells = new Map(); this.maxRadius = 20; }
    build(entities) {
        this.cells.clear(); this.maxRadius = 20;
        for (const entity of entities) {
            if (entity.hp <= 0) continue;
            const x = Math.floor(entity.x / this.cellSize), y = Math.floor(entity.y / this.cellSize);
            const key = `${x},${y}`;
            let cell = this.cells.get(key);
            if (!cell) this.cells.set(key, cell = []);
            cell.push(entity);
            this.maxRadius = Math.max(this.maxRadius, entity.sz || 20);
        }
    }
    query(x, y, radius, out = []) {
        out.length = 0;
        const left = Math.floor((x - radius) / this.cellSize), right = Math.floor((x + radius) / this.cellSize);
        const bottom = Math.floor((y - radius) / this.cellSize), top = Math.floor((y + radius) / this.cellSize);
        for (let cx = left; cx <= right; cx++) for (let cy = bottom; cy <= top; cy++) {
            const cell = this.cells.get(`${cx},${cy}`);
            if (cell) for (const entity of cell) out.push(entity);
        }
        return out;
    }
}

export function segmentDistanceSquared(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length)) : 0;
    const ex = px - x1 - t * dx, ey = py - y1 - t * dy;
    return ex * ex + ey * ey;
}
