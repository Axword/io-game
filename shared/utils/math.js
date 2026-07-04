export function rng(min, max) {
    return min + Math.random() * (max - min);
}

export function rngInt(min, max) {
    return Math.floor(rng(min, max + 1));
}

export function norm(x, y) {
    const l = Math.hypot(x, y);
    return l < 0.0001 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}

export function getZoneIdx(x, y, zones) {
    const dist = Math.hypot(x, y);
    for (let i = 0; i < zones.length; i++) {
        if (dist >= zones[i].minR && dist < zones[i].maxR) return i;
    }
    return zones.length - 1;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
