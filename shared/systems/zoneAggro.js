import { WORLDS, getWorld } from '../config/worlds.js';
import { getWorldDanger } from './worldRules.js';

// Session-only memory belongs to the living player, never to the shared crowd.
// Weak keys also release disconnected/replaced players without a cleanup scan.
const visitedDepths = new WeakMap();

export function resetZoneAggro(player) {
    if (player && typeof player === 'object') visitedDepths.delete(player);
}

export function recordZoneEntry(player, worldId = player?.worldId ?? 0) {
    if (!player || typeof player !== 'object') return 0;
    if (player.hp <= 0) { resetZoneAggro(player); return 0; }
    const world = getWorld(worldId);
    const zone = getWorldDanger(player.x, player.y, world.id).id;
    let depths = visitedDepths.get(player);
    if (!depths) { depths = new Uint8Array(WORLDS.length); visitedDepths.set(player, depths); }
    depths[world.id] = Math.max(depths[world.id], zone);
    return depths[world.id];
}

export function hasEnteredZone(player, worldId, zoneId) {
    return zoneId <= 1 || (visitedDepths.get(player)?.[getWorld(worldId).id] || 0) >= zoneId;
}
