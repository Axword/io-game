import { getWorld } from '../config/worlds.js';

export function shouldRetireProjectile(projectile, worldId = 0, owner = null) {
    if (projectile.isMine || ['sword', 'poison', 'laser', 'meteor'].includes(projectile.wtype)) return false;
    const limit = getWorld(worldId).bounds + 150;
    if (Math.abs(projectile.x) > limit || Math.abs(projectile.y) > limit) return true;
    if (owner && Number.isFinite(owner.x) && Number.isFinite(owner.y)) {
        return (projectile.x - owner.x) ** 2 + (projectile.y - owner.y) ** 2 > 1350 ** 2;
    }
    return false;
}
