// Apply only the difference from the previous book level/power.
export function applyBookStatsDelta(player, book) {
    book.appliedStats ??= {};
    const level = book.level || 1;
    for (const [sourceStat, power] of Object.entries(book.stats)) {
        const stat = sourceStat === 'moveSpeed' ? 'moveSpeedBonus' : sourceStat;
        const total = sourceStat === 'moveSpeed' ? power * level * 100
            : sourceStat === 'maxHp' ? Math.round(player.baseHp * power * level)
            : sourceStat === 'revives' ? Math.floor(power * level) : power * level;
        const delta = total - (book.appliedStats[stat] || 0);
        player[stat] = (player[stat] || 0) + delta;
        if (stat === 'maxHp') player.hp = Math.min(player.maxHp, player.hp + Math.max(0, delta));
        book.appliedStats[stat] = total;
    }
    player.cooldownReduction = Math.min(65, player.cooldownReduction || 0);
}
