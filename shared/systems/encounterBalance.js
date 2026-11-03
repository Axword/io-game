import { WEAPONS } from '../config/weapons.js';
import { weaponStat } from '../utils/weaponStats.js';

// Single-target estimates deliberately discount a fan's outer projectiles and
// melee/cloud uptime. The same calculation is used by solo and multiplayer.
export function estimatePlayerDps(player) {
    if (!player || player.hp <= 0) return 0;
    const cooldown = 1 / Math.max(0.35, 1 - Math.min(65, player.cooldownReduction || 0) / 100);
    const critChance = Math.max(0, Math.min(100, player.critChance || 0)) / 100;
    const critical = 1 + critChance * Math.max(0, (player.critDamage || 200) / 100 - 1);
    let total = 0;
    for (const weapon of player.weapons || []) {
        const definition = weapon && WEAPONS[weapon.type];
        if (!definition) continue;
        const stat = name => weaponStat(weapon, name, player);
        const damage = stat('dmg');
        const rate = Math.min(10, stat('atkSpd') * cooldown / Math.max(0.05, definition.cooldown));
        const count = Math.max(1, Math.round(stat('bCnt')));
        switch (weapon.type) {
            case 'aura': total += damage; break;
            case 'sword': total += damage * Math.max(1, Math.round(stat('count'))) * .6 / Math.max(.08, .2 / Math.max(1, stat('atkSpd'))); break;
            case 'poison': total += damage / .15 * Math.min(3, Math.max(1, stat('duration') * rate)) * .65; break;
            case 'bow': total += damage * rate * Math.min(3, count) * critical; break;
            case 'fireball': total += damage * rate * Math.max(1, count * .65) * 1.7 * critical; break;
            case 'knife': total += damage * rate * Math.min(3, count) * critical; break;
            case 'meteor': total += damage * rate * Math.max(1, count * .6) * 1.5 * critical; break;
            case 'lightning': total += damage * rate; break;
            case 'laser': total += damage * rate * critical; break;
            default: total += damage * rate * critical;
        }
    }
    return Number.isFinite(total) ? Math.max(1, total) : 1;
}

export function balancedBossHealth(baseHp, participants = [], hpMultiplier = 1) {
    const dps = participants.reduce((total, player) => total + estimatePlayerDps(player), 0);
    const living = participants.filter(player => player?.hp > 0).length;
    return Math.round(Math.min(3_000_000 * Math.max(1, living), Math.max(baseHp, dps * 12 * hpMultiplier)));
}
