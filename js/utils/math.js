export function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rng(min, max) {
    return min + Math.random() * (max - min);
}

export function rngInt(min, max) {
    return Math.floor(rng(min, max + 1));
}

export function norm(vx, vy) {
    const l = Math.hypot(vx, vy) || 1;
    return [vx / l, vy / l];
}

export function clamp(v, mn, mx) {
    return Math.max(mn, Math.min(mx, v));
}

export function getZoneIdx(x, y, zones) {
    const r = Math.hypot(x, y);
    for (let i = zones.length - 1; i >= 0; i--) {
        if (r >= zones[i].minR) return i;
    }
    return 0;
}