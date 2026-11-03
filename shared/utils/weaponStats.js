const ADDITIVE = new Set(['bCnt', 'count', 'targets', 'pierce', 'bBnc', 'chain']);
const LIMITS = { bCnt: 12, count: 6, targets: 10, pierce: 32, bBnc: 4, chain: 10, atkSpd: 5, range: 1600, orbit: 300, bSz: 4, width: 180 };

export function weaponStat(weapon, stat, entity) {
    const base = weapon.stats[stat] ?? (stat === 'atkSpd' ? 1 : 0);
    const upgrade = weapon.upgrades?.[stat];
    let value = ADDITIVE.has(stat) ? base + (upgrade || 0) : base * (upgrade ?? 1);
    const bonus = { dmg: 'damageBonus', bSz: 'projectileSizeBonus', bSpd: 'projectileSpeedBonus', range: 'rangeBonus', orbit: 'rangeBonus', atkSpd: 'attackSpeedBonus' }[stat];
    if (bonus) value *= 1 + (entity?.[bonus] || 0) / 100;
    if (['range', 'orbit', 'explosion', 'impact', 'width'].includes(stat)) value *= 1 + (entity?.areaBonus || 0) / 100;
    return Math.max(0, Math.min(LIMITS[stat] ?? 100000, value));
}

// The effective fire rate is bounded equally at 20 Hz (server) and 60 Hz (client).
export function weaponCooldown(weapon, entity, definition) {
    const speed = Math.max(.1, weaponStat(weapon, 'atkSpd', entity));
    const reduction = Math.min(.8, (entity?.cooldownReduction || 0) / 100);
    const tickMultiplier = 1 / Math.max(.2, 1 - reduction);
    return Math.max(.1 * tickMultiplier, definition.cooldown / speed);
}
