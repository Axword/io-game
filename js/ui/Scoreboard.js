export class Scoreboard {
    constructor() {
        this.container = document.getElementById('scoreboard-list');
        this.players = [];
        this.frameCounter = 0;
    }

    update(player, bots) {
        if (!player) return;

        this.frameCounter++;
        if (this.frameCounter % 30 !== 0) return;

        this.players = [
            {
                name: player.name || 'Gracz',
                totalXp: player.totalXp || 0,
                level: player.level || 1,
                kills: player.killedMonsters || 0,
                hp: player.hp,
                maxHp: player.maxHp,
                isMe: true
            },
            ...bots.map(bot => ({
                name: bot.name || 'Gracz',
                totalXp: bot.totalXp || 0,
                level: bot.level || 1,
                kills: bot.killedMonsters || 0,
                hp: bot.hp,
                maxHp: bot.maxHp,
                isMe: false
            }))
        ];

        this.players.sort((a, b) => b.totalXp - a.totalXp);
        this.render();
    }

render() {
    this.container.innerHTML = '';

    this.players.forEach((p, idx) => {
        const entry = document.createElement('div');
        entry.className = 'scoreboard-entry';

        if (p.isMe) entry.classList.add('me');
        if (idx === 0) entry.classList.add('rank-1');
        else if (idx === 1) entry.classList.add('rank-2');
        else if (idx === 2) entry.classList.add('rank-3');

        const hpPct = p.maxHp > 0 ? p.hp / p.maxHp : 0;
        const hpColor = hpPct > 0.6 ? '#4a4' : hpPct > 0.3 ? '#fa0' : '#f44';
        const dead = p.hp <= 0;

        const rank = document.createElement('div');
        rank.className = 'scoreboard-rank';
        rank.textContent = `#${idx + 1}`;

        const name = document.createElement('div');
        name.className = 'scoreboard-name';
        name.textContent = p.name;
        if (dead) name.style.opacity = '0.4';

        const score = document.createElement('div');
        score.className = 'scoreboard-score';
        // Pokazuj XP zamiast samego levelu
        score.innerHTML = `
            <span style="color:${hpColor};font-size:9px">♥</span> 
            LV${p.level} · ${Math.floor(p.totalXp)} XP
        `;

        entry.appendChild(rank);
        entry.appendChild(name);
        entry.appendChild(score);

        this.container.appendChild(entry);
    });
}
}