export class Scoreboard {
    constructor() {
        this.container = document.getElementById('scoreboard-list');
        this.players = [];
    }
    
    update(player, bots) {
        if (!player) return;
        
        // Zbierz wszystkich graczy
        this.players = [
            {
                name: 'TY',
                totalXp: player.totalXp || player.xp,
                level: player.level,
                isPlayer: true
            },
            ...bots.map(bot => ({
                name: bot.name,
                totalXp: bot.totalXp,
                level: bot.level,
                isBot: true
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
            
            if (p.isPlayer) {
                entry.classList.add('me');
            }
            
            if (idx === 0) entry.classList.add('rank-1');
            else if (idx === 1) entry.classList.add('rank-2');
            else if (idx === 2) entry.classList.add('rank-3');
            
            const rank = document.createElement('div');
            rank.className = 'scoreboard-rank';
            rank.textContent = `#${idx + 1}`;
            
            const name = document.createElement('div');
            name.className = 'scoreboard-name';
            name.textContent = p.name;
            
            const score = document.createElement('div');
            score.className = 'scoreboard-score';
            score.textContent = `${Math.floor(p.totalXp)} XP`;
            
            entry.appendChild(rank);
            entry.appendChild(name);
            entry.appendChild(score);
            
            this.container.appendChild(entry);
        });
    }
}